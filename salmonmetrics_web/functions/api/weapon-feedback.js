import { jsonResponse, requireToken } from "../_lib/salmonmetrics.js";

const MAX_STRIP_BYTES = 1_600_000;
const MAX_FULL_BYTES = 2_400_000;
const MAX_RECORD_BYTES = 4_500_000;
const MAX_EXPORT_LIMIT = 1000;
const CORRECTION_TTL_SECONDS = 60 * 60 * 24 * 180;

export async function onRequestPost({ request, env }) {
  const authError = requireToken(request, env);
  if (authError) return authError;
  if (!env.WEAPON_FEEDBACK) {
    return jsonResponse({ ok: false, error: "WEAPON_FEEDBACK KV is not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const record = await buildFeedbackRecord(body);
    const encoded = JSON.stringify(record);
    if (byteLength(encoded) > MAX_RECORD_BYTES) {
      return jsonResponse({ ok: false, error: "feedback record is too large" }, { status: 413 });
    }

    const key = `feedback/${record.createdAt.slice(0, 10)}/${record.id}.json`;
    await env.WEAPON_FEEDBACK.put(key, encoded, {
      metadata: {
        id: record.id,
        createdAt: record.createdAt,
        changedSlots: record.changedSlots.map((slot) => slot.slot).join(","),
        status: "pending_import",
      },
    });
    await storeCorrectionLookup(env, record);

    return jsonResponse({
      ok: true,
      id: record.id,
      key,
      changedSlots: record.changedSlots.map((slot) => slot.slot),
      storage: "WEAPON_FEEDBACK",
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) }, { status: 400 });
  }
}

export async function onRequestGet({ request, env }) {
  const authError = requireExportToken(request, env);
  if (authError) return authError;
  if (!env.WEAPON_FEEDBACK) {
    return jsonResponse({ ok: false, error: "WEAPON_FEEDBACK KV is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const prefix = sanitizePrefix(url.searchParams.get("prefix") || "feedback/");
  const cursor = url.searchParams.get("cursor") || undefined;
  const includeRecords = url.searchParams.get("include") === "records";
  const limit = Math.min(MAX_EXPORT_LIMIT, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "100", 10) || 100));
  const listed = await env.WEAPON_FEEDBACK.list({ prefix, cursor, limit });
  const records = [];

  if (includeRecords) {
    for (const item of listed.keys) {
      const value = await env.WEAPON_FEEDBACK.get(item.name, { type: "json" });
      if (value) records.push({ key: item.name, record: value });
    }
  }

  return jsonResponse({
    ok: true,
    keys: listed.keys.map((item) => ({
      name: item.name,
      metadata: item.metadata || {},
    })),
    records: includeRecords ? records : undefined,
    list_complete: listed.list_complete,
    cursor: listed.cursor || "",
  });
}

async function buildFeedbackRecord(body = {}) {
  const correctedWeapons = cleanWeaponArray(body.correctedWeapons, "correctedWeapons");
  const detectedWeapons = cleanWeaponArray(body.detectedWeapons || [], "detectedWeapons", { allowEmpty: true });
  const changedSlots = cleanChangedSlots(body.changedSlots, detectedWeapons, correctedWeapons);
  if (!changedSlots.length) {
    throw new Error("feedback must contain at least one changed weapon slot");
  }

  const images = body.images || {};
  const weaponStrip = cleanImage(images.weapons || body.weaponImage || body.image, MAX_STRIP_BYTES, "weapon strip image");
  const fullImage = images.full ? cleanImage(images.full, MAX_FULL_BYTES, "full screenshot") : null;
  weaponStrip.sha256 = await sha256Hex(`${weaponStrip.mimeType};${weaponStrip.base64}`);
  if (fullImage) fullImage.sha256 = await sha256Hex(`${fullImage.mimeType};${fullImage.base64}`);
  const createdAt = new Date().toISOString();
  const fingerprint = await sha256Hex(JSON.stringify({
    clientId: cleanToken(body.clientId, 120),
    correctedWeapons,
    detectedWeapons,
    changedSlots,
    stripHash: weaponStrip.sha256,
  }));

  return {
    schemaVersion: 1,
    id: `wfb_${Date.now().toString(36)}_${fingerprint.slice(0, 16)}`,
    createdAt,
    clientId: cleanToken(body.clientId, 120),
    page: cleanToken(body.page || "ocr", 80),
    userAgent: cleanText(body.userAgent, 240),
    source: {
      weaponSource: cleanToken(body.weaponSource, 80),
      provider: cleanToken(body.provider, 80),
      model: cleanToken(body.model, 120),
      mode: cleanToken(body.mode, 40),
      stage: cleanText(body.stage, 120),
      stampedAt: cleanToken(body.stampedAt, 80),
    },
    detectedWeapons,
    correctedWeapons,
    changedSlots,
    images: {
      weapons: weaponStrip,
      full: fullImage,
    },
    import: {
      status: "pending",
      importedAt: "",
      notes: "",
    },
  };
}

async function storeCorrectionLookup(env, record) {
  const correctedWeapons = cleanWeaponArray(record.correctedWeapons, "correctedWeapons");
  if (correctedWeapons.some((weapon) => !weapon)) return;

  const writes = [];
  if (record.images.full?.sha256) {
    writes.push(storeMergedCorrectionLookup(env, `correction/full/${record.images.full.sha256}.json`, record, correctedWeapons));
  }
  if (record.images.weapons?.sha256) {
    writes.push(storeMergedCorrectionLookup(env, `correction/weapons/${record.images.weapons.sha256}.json`, record, correctedWeapons));
  }
  await Promise.all(writes);
}

async function storeMergedCorrectionLookup(env, key, record, correctedWeapons) {
  const existing = await env.WEAPON_FEEDBACK.get(key, { type: "json" }).catch(() => null);
  const verifiedChanges = correctionSlotsForRecord(record, correctedWeapons);
  const mergedWeapons = mergeCorrectedWeapons(existing?.correctedWeapons, correctedWeapons, verifiedChanges);
  if (mergedWeapons.some((weapon) => !weapon)) return;

  const changedSlots = mergeChangedSlots(existing?.changedSlots, verifiedChanges);
  const verifiedSlots = mergeVerifiedSlots(existing?.verifiedSlots, changedSlots);
  const payload = JSON.stringify({
    schemaVersion: 2,
    feedbackId: record.id,
    createdAt: latestIsoTimestamp(existing?.createdAt, record.createdAt),
    updatedAt: record.createdAt,
    correctedWeapons: mergedWeapons,
    changedSlots,
    verifiedSlots,
    source: {
      weaponSource: record.source.weaponSource,
      provider: record.source.provider,
      model: record.source.model,
    },
    previousFeedbackId: existing?.feedbackId || "",
  });
  const metadata = {
    feedbackId: record.id,
    createdAt: record.createdAt,
    status: "verified_by_user",
    verifiedSlots: verifiedSlots.join(","),
  };

  await env.WEAPON_FEEDBACK.put(key, payload, {
    expirationTtl: CORRECTION_TTL_SECONDS,
    metadata,
  });
}

function correctionSlotsForRecord(record, correctedWeapons) {
  const bySlot = new Map();
  for (const item of record.changedSlots || []) {
    const slot = cleanSlot(item?.slot);
    const corrected = cleanText(item?.corrected, 120);
    if (slot >= 1 && slot <= 4 && corrected) {
      bySlot.set(slot, {
        slot,
        previous: cleanText(item?.previous, 120),
        corrected,
      });
    }
  }

  for (let index = 0; index < 4; index += 1) {
    const slot = index + 1;
    const corrected = cleanText(correctedWeapons[index], 120);
    const detected = cleanText(record.detectedWeapons?.[index], 120);
    if (corrected && corrected !== detected) {
      bySlot.set(slot, {
        slot,
        previous: detected,
        corrected,
      });
    }
  }

  return [...bySlot.values()].sort((left, right) => left.slot - right.slot);
}

function mergeCorrectedWeapons(existingValue, incomingValue, changedSlots) {
  const incoming = cleanWeaponArray(incomingValue, "incoming correctedWeapons", { allowEmpty: true });
  const existing = Array.isArray(existingValue)
    ? cleanWeaponArray(existingValue, "existing correctedWeapons", { allowEmpty: true })
    : [];
  const merged = (existing.some((weapon) => weapon) ? existing : incoming).slice(0, 4);
  while (merged.length < 4) merged.push("");

  for (let index = 0; index < 4; index += 1) {
    if (!merged[index] && incoming[index]) merged[index] = incoming[index];
  }
  for (const item of changedSlots || []) {
    const index = cleanSlot(item?.slot) - 1;
    const corrected = cleanText(item?.corrected, 120) || incoming[index] || "";
    if (index >= 0 && index < 4 && corrected) merged[index] = corrected;
  }

  return merged;
}

function mergeChangedSlots(existingValue, incomingValue) {
  const bySlot = new Map();
  for (const list of [existingValue, incomingValue]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const slot = cleanSlot(item?.slot);
      const corrected = cleanText(item?.corrected, 120);
      if (slot >= 1 && slot <= 4 && corrected) {
        bySlot.set(slot, {
          slot,
          previous: cleanText(item?.previous, 120),
          corrected,
        });
      }
    }
  }
  return [...bySlot.values()].sort((left, right) => left.slot - right.slot);
}

function mergeVerifiedSlots(existingValue, changedSlots) {
  const slots = new Set(Array.isArray(existingValue) ? existingValue.map(cleanSlot) : []);
  for (const item of changedSlots || []) slots.add(cleanSlot(item?.slot));
  return [...slots].filter((slot) => slot >= 1 && slot <= 4).sort((left, right) => left - right);
}

function latestIsoTimestamp(left, right) {
  const leftText = cleanText(left, 80);
  const rightText = cleanText(right, 80);
  if (!leftText) return rightText;
  if (!rightText) return leftText;
  return leftText > rightText ? leftText : rightText;
}

function cleanChangedSlots(rawValue, detectedWeapons, correctedWeapons) {
  const fromPayload = Array.isArray(rawValue)
    ? rawValue.map((item) => ({
      slot: cleanSlot(item?.slot),
      previous: cleanText(item?.previous, 120),
      corrected: cleanText(item?.corrected, 120),
    })).filter((item) => item.slot >= 1 && item.slot <= 4 && item.corrected)
    : [];
  if (fromPayload.length) return uniqueChangedSlots(fromPayload);

  const output = [];
  for (let index = 0; index < 4; index += 1) {
    const previous = detectedWeapons[index] || "";
    const corrected = correctedWeapons[index] || "";
    if (corrected && previous !== corrected) {
      output.push({ slot: index + 1, previous, corrected });
    }
  }
  return uniqueChangedSlots(output);
}

function uniqueChangedSlots(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.slot)) return false;
    seen.add(item.slot);
    return true;
  });
}

function cleanWeaponArray(value, label, options = {}) {
  const allowEmpty = Boolean(options.allowEmpty);
  if (!Array.isArray(value)) {
    if (allowEmpty) return [];
    throw new Error(`${label} must be an array`);
  }
  const cleaned = value.slice(0, 4).map((item) => cleanText(item, 120));
  while (cleaned.length < 4) cleaned.push("");
  if (!allowEmpty && cleaned.some((item) => !item)) {
    throw new Error(`${label} must contain four weapon names`);
  }
  return cleaned;
}

function cleanImage(value, maxBytes, label) {
  const text = String(value || "").trim();
  const match = text.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error(`${label} must be a base64 data URL`);
  const mimeType = match[1].toLowerCase();
  if (!mimeType.startsWith("image/")) throw new Error(`${label} must be an image`);
  const base64 = match[2].replace(/\s+/g, "");
  const bytes = estimatedBase64Bytes(base64);
  if (bytes <= 0) throw new Error(`${label} is empty`);
  if (bytes > maxBytes) throw new Error(`${label} is too large`);
  return {
    mimeType,
    base64,
    bytes,
    sha256: "",
  };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function estimatedBase64Bytes(base64) {
  const padding = base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0);
  return Math.floor((base64.length * 3) / 4) - padding;
}

function cleanSlot(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function cleanToken(value, maxLength) {
  return cleanText(value, maxLength).replace(/[^A-Za-z0-9_.:@/+ -]/g, "").slice(0, maxLength);
}

function sanitizePrefix(value) {
  const cleaned = String(value || "feedback/").replace(/[^A-Za-z0-9_./=-]/g, "");
  return cleaned.startsWith("feedback/") ? cleaned : "feedback/";
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || "")).length;
}

function requireExportToken(request, env) {
  const expected = env.WEAPON_FEEDBACK_EXPORT_TOKEN || env.SALMONMETRICS_ACCESS_TOKEN || "";
  if (!expected) {
    return jsonResponse({ ok: false, error: "WEAPON_FEEDBACK_EXPORT_TOKEN is not configured" }, { status: 403 });
  }
  const url = new URL(request.url);
  const supplied = request.headers.get("x-feedback-token")
    || request.headers.get("x-access-token")
    || url.searchParams.get("token")
    || "";
  if (supplied === expected) return null;
  return jsonResponse({ ok: false, error: "feedback export token required" }, { status: 401 });
}
