const DEFAULT_GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyoZQBC6iIbvqSR79O_2zLY6BNx-kprljWWfBhxKH5pJM1wFWIRUWY0hm3YavNtF3q9/exec";

export const DEFAULT_SHIFT_CONFIG = {
  start_time: "",
  end_time: "",
  stage: "アラマキ砦",
  weapons: ["", "", "", ""],
  expire_at: "",
  last_setup_at: "",
};

const FIELD = {
  datetime: "日時",
  user: "ユーザー名",
  stage: "ステージ",
  weapons: "ブキ",
  totalEggs: "全体の納品数",
  myEggs: "自分の納品数",
  myKills: "自分の処理数",
  p2Kills: "2P処理数",
  p3Kills: "3P処理数",
  p4Kills: "4P処理数",
  totalKills: "全体の合計処理数",
  totalRed: "全体赤イクラ",
  myRed: "個人赤イクラ",
  notes: "備考",
  mode: "記録モード",
  playStyle: "プレイスタイル",
  dayNight: "昼夜区分",
  contestStage: "コンテストステージ",
  recordId: "レコードID",
  clientId: "クライアントID",
  operation: "操作",
  deletedFlag: "削除済み",
  deleteTargetId: "削除対象ID",
  deletedAt: "削除日時",
  deletedBy: "削除者",
  deleteReason: "削除理由",
};

const LEGACY_APPEND_ORDER = [
  FIELD.datetime,
  FIELD.user,
  FIELD.stage,
  FIELD.totalEggs,
  FIELD.myEggs,
  FIELD.myKills,
  FIELD.p2Kills,
  FIELD.p3Kills,
  FIELD.p4Kills,
  FIELD.totalKills,
  FIELD.totalRed,
  FIELD.myRed,
  FIELD.notes,
  "Dr",
  "BSKr",
  "OKr",
  "DPK",
  FIELD.mode,
  "W1",
  "W2",
  "W3",
  "W4",
  "W5",
];

const WEAPON_COLUMN_APPEND_ORDER = [
  FIELD.datetime,
  FIELD.user,
  FIELD.stage,
  FIELD.weapons,
  FIELD.totalEggs,
  FIELD.myEggs,
  FIELD.myKills,
  FIELD.p2Kills,
  FIELD.p3Kills,
  FIELD.p4Kills,
  FIELD.totalKills,
  FIELD.totalRed,
  FIELD.myRed,
  FIELD.notes,
  "Dr",
  "BSKr",
  "OKr",
  "DPK",
  FIELD.mode,
  "W1",
  "W2",
  "W3",
  "W4",
  "W5",
];

const DAY_ONLY = "昼のみ";
const NIGHT_INCLUDED = "夜あり";
const MODE_STANDARD = "STANDARD";
const MODE_BIG_RUN = "BIG_RUN";
const MODE_CONTEST = "CONTEST";
const RANDOM_WEAPON_NAME = "ランダム";
const DAY_NIGHT_NOTE_PATTERN = /^\[(?:昼のみ|夜あり)\]\s*/;
const RECORD_META_PATTERN = /\[sm:([^\]\r\n]+)\]/g;
const APP_TIME_ZONE = "Asia/Tokyo";
const ISO_TIMEZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i;

export function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function getSheetUrl(env) {
  return env.SALMONMETRICS_SHEET_URL || DEFAULT_GOOGLE_SHEET_URL;
}

export function requireToken(request, env) {
  if (!env.SALMONMETRICS_ACCESS_TOKEN) return null;
  if (request.headers.get("x-access-token") === env.SALMONMETRICS_ACCESS_TOKEN) {
    return null;
  }
  return jsonResponse(
    { error: "Access token required", tokenRequired: true },
    { status: 401 },
  );
}

export function asFloat(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (ISO_TIMEZONE_PATTERN.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const match = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function plainDatetime(value) {
  const text = String(value || "").trim();
  if (!text || ISO_TIMEZONE_PATTERN.test(text)) return "";
  const match = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) return "";
  const [, year, month, day, hour = "0", minute = "0"] = match;
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

function japanDatetime(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ja-JP-u-ca-gregory", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`;
}

export function sheetDatetime(value) {
  const plain = plainDatetime(value);
  if (plain) return plain;
  const date = parseDate(value) || new Date();
  return japanDatetime(date);
}

export function normalizeConfig(value = {}) {
  const config = { ...DEFAULT_SHIFT_CONFIG, ...value };
  const weapons = Array.isArray(config.weapons) ? config.weapons : [];
  config.weapons = [...weapons, "", "", "", ""].slice(0, 4).map((item) => String(item || ""));
  if (!config.expire_at) config.expire_at = config.end_time || "";
  return config;
}

export async function readConfig(env) {
  if (!env.SHIFT_CONFIG) return DEFAULT_SHIFT_CONFIG;
  const stored = await env.SHIFT_CONFIG.get("current");
  if (!stored) return DEFAULT_SHIFT_CONFIG;
  try {
    return normalizeConfig(JSON.parse(stored));
  } catch {
    return DEFAULT_SHIFT_CONFIG;
  }
}

export async function writeConfig(env, incoming) {
  const config = normalizeConfig({
    start_time: String(incoming.start_time || ""),
    end_time: String(incoming.end_time || ""),
    expire_at: String(incoming.expire_at || incoming.end_time || ""),
    stage: String(incoming.stage || DEFAULT_SHIFT_CONFIG.stage),
    weapons: Array.isArray(incoming.weapons) ? incoming.weapons : ["", "", "", ""],
    last_setup_at: new Date().toISOString(),
  });

  if (env.SHIFT_CONFIG) {
    await env.SHIFT_CONFIG.put("current", JSON.stringify(config));
  }
  return config;
}

export async function sheetRequest(env, method, payload) {
  const outgoingPayload = method === "POST" && env.SALMONMETRICS_LEGACY_APPEND_SHIFT !== "false"
    ? legacyAppendPayload(payload)
    : payload;
  const init = {
    method,
    headers: {
      accept: "application/json",
    },
    redirect: "follow",
  };
  if (outgoingPayload) {
    init.headers["content-type"] = "application/json; charset=utf-8";
    init.body = JSON.stringify(outgoingPayload);
  }
  return fetch(getSheetUrl(env), init);
}

function legacyAppendPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;

  const shifted = { ...payload };
  for (let index = 3; index < LEGACY_APPEND_ORDER.length; index += 1) {
    shifted[LEGACY_APPEND_ORDER[index]] = payload[WEAPON_COLUMN_APPEND_ORDER[index]] ?? "";
  }

  if (payload.W5 !== undefined && payload.W5 !== "" && asFloat(payload.W5) !== 0) {
    shifted[FIELD.notes] = appendMetadata(shifted[FIELD.notes], { w5: payload.W5 });
  }
  return shifted;
}

function normalizeDayNight(value) {
  return String(value || "").includes("夜") ? NIGHT_INCLUDED : DAY_ONLY;
}

function normalizeMode(value, stage = "") {
  const mode = String(value || MODE_STANDARD).trim().toUpperCase();
  if (mode === MODE_CONTEST) return MODE_CONTEST;
  if (mode === MODE_BIG_RUN || String(stage || "").trim() === "ビッグラン") return MODE_BIG_RUN;
  return MODE_STANDARD;
}

function isStandardLikeMode(mode) {
  return normalizeMode(mode) !== MODE_CONTEST;
}

function randomWeaponSet() {
  return [RANDOM_WEAPON_NAME, RANDOM_WEAPON_NAME, RANDOM_WEAPON_NAME, RANDOM_WEAPON_NAME];
}

function normalizeBigRunWeapons(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const waveCount = Math.max(1, Math.min(3, asFloat(source.waveCount) || 3));
  const rows = Array.isArray(source.rows) ? source.rows : [];
  const normalizedRows = Array.from({ length: 4 }, (_, index) => {
    const row = rows[index] || {};
    const weapons = Array.isArray(row?.weapons) ? row.weapons : [];
    return {
      player: `${index + 1}P`,
      weapons: Array.from({ length: waveCount }, (_, weaponIndex) => String(weapons[weaponIndex] || "").trim()),
    };
  });
  return normalizedRows.some((row) => row.weapons.some(Boolean)) ? { waveCount, rows: normalizedRows } : null;
}

function notesWithDayNight(dayNight, notes) {
  const cleanNotes = String(notes || "").replace(DAY_NIGHT_NOTE_PATTERN, "").trim();
  const condition = normalizeDayNight(dayNight);
  return `[${condition}]${cleanNotes ? ` ${cleanNotes}` : ""}`;
}

function formatWeapons(value) {
  const source = Array.isArray(value) ? value : [];
  return source
    .slice(0, 4)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" / ");
}

export function normalizeRecordId(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

export function normalizeClientId(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

function randomToken(prefix) {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${prefix}_${Date.now().toString(36)}_${Array.from(values, (value) => value.toString(36)).join("")}`;
}

function metadataTag(values) {
  const entries = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return entries.length ? `[sm:${entries.join(";")}]` : "";
}

function appendMetadata(notes, values) {
  const tag = metadataTag(values);
  const cleanNotes = String(notes || "").trim();
  return tag ? `${cleanNotes}${cleanNotes ? " " : ""}${tag}` : cleanNotes;
}

export function recordMetadata(row = {}) {
  const metadata = {};
  const notes = String(row[FIELD.notes] || "");
  for (const match of notes.matchAll(RECORD_META_PATTERN)) {
    for (const pair of match[1].split(";")) {
      const [rawKey, ...rawValue] = pair.split("=");
      const key = String(rawKey || "").trim();
      if (!key) continue;
      try {
        metadata[key] = decodeURIComponent(rawValue.join("=") || "");
      } catch {
        metadata[key] = rawValue.join("=") || "";
      }
    }
  }
  if (row[FIELD.recordId]) metadata.id = String(row[FIELD.recordId]).trim();
  if (row[FIELD.clientId]) metadata.cid = String(row[FIELD.clientId]).trim();
  if (row[FIELD.deleteTargetId]) metadata.delete = String(row[FIELD.deleteTargetId]).trim();
  return metadata;
}

export function recordIdOf(row = {}) {
  return normalizeRecordId(recordMetadata(row).id || row[FIELD.recordId]);
}

export function clientIdOf(row = {}) {
  return normalizeClientId(recordMetadata(row).cid || row[FIELD.clientId]);
}

export function deleteTargetIdOf(row = {}) {
  return normalizeRecordId(recordMetadata(row).delete || row[FIELD.deleteTargetId]);
}

function hasDeletedFlag(row = {}) {
  return /^(true|yes|1|deleted|削除済み)$/i.test(String(row[FIELD.deletedFlag] || "").trim());
}

export function isDeleteMarker(row = {}) {
  const mode = String(row[FIELD.mode] || "").trim().toUpperCase();
  const operation = String(row[FIELD.operation] || "").trim().toUpperCase();
  return ["DELETE", "DELETED"].includes(mode) || ["DELETE", "DELETED"].includes(operation) || Boolean(deleteTargetIdOf(row));
}

function stableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return `${hash.toString(36)}_${text.length.toString(36)}`;
}

function legacyRecordId(row = {}, occurrence = 1) {
  const fingerprint = JSON.stringify([
    row[FIELD.datetime] || "",
    row[FIELD.user] || "",
    row[FIELD.stage] || "",
    row[FIELD.totalEggs] || "",
    row[FIELD.myEggs] || "",
    row[FIELD.myKills] || "",
    row[FIELD.p2Kills] || "",
    row[FIELD.p3Kills] || "",
    row[FIELD.p4Kills] || "",
    row[FIELD.totalRed] || "",
    row[FIELD.myRed] || "",
    row[FIELD.notes] || "",
    row[FIELD.mode] || "",
    row.W1 || "",
    row.W2 || "",
    row.W3 || "",
    row.W4 || "",
    row.W5 || "",
  ]);
  return `legacy_${stableHash(fingerprint)}_${occurrence}`;
}

function normalizeLegacyShiftedRow(row = {}) {
  const dpkValue = String(row.DPK || "").trim().toUpperCase();
  const shifted = row[FIELD.weapons] !== undefined
    && row[FIELD.weapons] !== ""
    && Number.isFinite(asFloat(row[FIELD.weapons]))
    && ["STANDARD", "BIG_RUN", "CONTEST", "DELETED", "DELETE"].includes(dpkValue);
  if (!shifted) return row;

  return {
    ...row,
    [FIELD.weapons]: "",
    [FIELD.totalEggs]: row[FIELD.weapons],
    [FIELD.myEggs]: row[FIELD.totalEggs],
    [FIELD.myKills]: row[FIELD.myEggs],
    [FIELD.p2Kills]: row[FIELD.myKills],
    [FIELD.p3Kills]: row[FIELD.p2Kills],
    [FIELD.p4Kills]: row[FIELD.p3Kills],
    [FIELD.totalKills]: row[FIELD.p4Kills],
    [FIELD.totalRed]: row[FIELD.totalKills],
    [FIELD.myRed]: row[FIELD.totalRed],
    [FIELD.notes]: row[FIELD.myRed],
    Dr: row[FIELD.notes],
    BSKr: row.Dr,
    OKr: row.BSKr,
    DPK: row.OKr,
    [FIELD.mode]: row.DPK,
    W1: row[FIELD.mode],
    W2: row.W1,
    W3: row.W2,
    W4: row.W3,
    W5: row.W4,
  };
}

export function annotateRows(rows = []) {
  const legacyCounts = new Map();
  return rows.map((row) => {
    row = normalizeLegacyShiftedRow(row);
    const deleteMarker = isDeleteMarker(row);
    let recordId = recordIdOf(row);
    if (!deleteMarker && !recordId) {
      const base = legacyRecordId(row, 0);
      const occurrence = (legacyCounts.get(base) || 0) + 1;
      legacyCounts.set(base, occurrence);
      recordId = legacyRecordId(row, occurrence);
    }

    return {
      ...row,
      __recordId: recordId,
      __clientId: clientIdOf(row),
      __deleteTargetId: deleteTargetIdOf(row),
      __isDeleteMarker: deleteMarker,
      __isDeletedFlag: hasDeletedFlag(row),
    };
  });
}

export function applySoftDeletes(rows = []) {
  const annotated = annotateRows(rows);
  const deletedIds = new Set(
    annotated
      .filter((row) => row.__isDeleteMarker)
      .map((row) => row.__deleteTargetId)
      .filter(Boolean),
  );
  return annotated.filter(
    (row) => !row.__isDeleteMarker && !row.__isDeletedFlag && (!row.__recordId || !deletedIds.has(row.__recordId)),
  );
}

export function findDeletableRecord(rows, recordId, clientId, userName) {
  const targetId = normalizeRecordId(recordId);
  const targetClientId = normalizeClientId(clientId);
  const targetUserName = String(userName || "").trim();
  if (!targetId || !targetClientId || !targetUserName) {
    throw new Error("削除対象を確認できません");
  }

  const annotated = annotateRows(rows);
  const deletedIds = new Set(
    annotated
      .filter((row) => row.__isDeleteMarker)
      .map((row) => row.__deleteTargetId)
      .filter(Boolean),
  );
  const deletedFlagIds = new Set(
    annotated
      .filter((row) => row.__isDeletedFlag)
      .map((row) => row.__recordId)
      .filter(Boolean),
  );
  if (deletedIds.has(targetId) || deletedFlagIds.has(targetId)) {
    throw new Error("この記録はすでに削除済みです");
  }

  const record = annotated.find((row) => !row.__isDeleteMarker && !row.__isDeletedFlag && row.__recordId === targetId);
  if (!record) {
    throw new Error("削除できる記録が見つかりません");
  }
  if (record.__clientId && record.__clientId !== targetClientId) {
    throw new Error("自分の端末で送信した記録だけ削除できます");
  }
  if (String(record[FIELD.user] || "").trim() !== targetUserName) {
    throw new Error("選択中のプレイヤー本人の記録だけ削除できます");
  }
  return record;
}

export function buildDeletePayload(body, record = {}) {
  const recordId = normalizeRecordId(body.recordId);
  const clientId = normalizeClientId(body.clientId);
  const userName = String(body.userName || "").trim();
  const deletedAt = sheetDatetime(new Date());
  const reason = String(body.reason || "").trim();
  const payload = Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith("__")),
  );
  const notes = appendMetadata(record[FIELD.notes] || "", {
    v: "1",
    delete: recordId,
    cid: clientId,
    by: userName,
    reason: reason || "ユーザー操作で削除",
  });

  payload[FIELD.datetime] = record[FIELD.datetime] ? sheetDatetime(record[FIELD.datetime]) : deletedAt;
  payload[FIELD.user] = record[FIELD.user] || userName;
  payload[FIELD.notes] = notes;
  payload[FIELD.mode] = "DELETED";
  payload[FIELD.operation] = "DELETED";
  payload[FIELD.deletedFlag] = "DELETED";
  payload[FIELD.recordId] = randomToken("smd");
  payload[FIELD.clientId] = clientId;
  payload[FIELD.deleteTargetId] = recordId;
  payload[FIELD.deletedAt] = deletedAt;
  payload[FIELD.deletedBy] = userName;
  payload[FIELD.deleteReason] = reason || "ユーザー操作で削除";

  return payload;
}

export function buildSheetPayload(body, config = {}) {
  const incomingStage = String(body.stage || config.stage || "");
  const mode = normalizeMode(body.mode, incomingStage);

  const user = String(body.userName || "").trim();
  if (!user || ["選択してください", "すべて"].includes(user)) {
    throw new Error("有効なユーザー名を入力してください");
  }

  const counts = body.counts || {};
  const totalEggs = asFloat(counts.totalEggs);
  const myEggs = asFloat(counts.myEggs);
  const myKills = asFloat(counts.myKills);
  const p2Kills = asFloat(counts.p2Kills);
  const p3Kills = asFloat(counts.p3Kills);
  const p4Kills = asFloat(counts.p4Kills);
  const totalKills = myKills + p2Kills + p3Kills + p4Kills;
  const totalRed = asFloat(counts.totalRed);
  const myRed = asFloat(counts.myRed);
  const dr = totalEggs > 0 ? myEggs / totalEggs : 0;
  const bskr = totalKills > 0 ? myKills / totalKills : 0;
  const okr = totalRed > 0 ? myRed / totalRed : 0;
  const notes = String(body.notes || "");
  const dayNight = normalizeDayNight(body.dayNight);
  const recordId = normalizeRecordId(body.recordId) || randomToken("smr");
  const clientId = normalizeClientId(body.clientId);
  const submittedWeapons = formatWeapons(body.weapons);
  const weapons = mode === MODE_BIG_RUN
    ? formatWeapons(randomWeaponSet())
    : (submittedWeapons || formatWeapons(config.weapons));
  const metadata = {
    v: "1",
    id: recordId,
    cid: clientId,
  };
  if (mode === MODE_BIG_RUN) {
    const bigRunWeapons = normalizeBigRunWeapons(body.bigRunWeapons);
    if (bigRunWeapons) {
      metadata.brw = JSON.stringify(bigRunWeapons);
    }
  }

  const payload = {
    [FIELD.datetime]: sheetDatetime(body.stampedAt),
    [FIELD.user]: user,
    [FIELD.stage]: mode === MODE_CONTEST ? String(body.round || "第1回") : incomingStage,
    [FIELD.weapons]: weapons,
    [FIELD.totalEggs]: totalEggs,
    [FIELD.myEggs]: myEggs,
    [FIELD.myKills]: myKills,
    [FIELD.p2Kills]: p2Kills,
    [FIELD.p3Kills]: p3Kills,
    [FIELD.p4Kills]: p4Kills,
    [FIELD.totalKills]: totalKills,
    [FIELD.totalRed]: totalRed,
    [FIELD.myRed]: myRed,
    [FIELD.notes]: appendMetadata(isStandardLikeMode(mode) ? notesWithDayNight(dayNight, notes) : notes, metadata),
    Dr: dr,
    BSKr: bskr,
    OKr: okr,
    DPK: dr + bskr,
    [FIELD.mode]: mode,
    [FIELD.operation]: "CREATE",
    [FIELD.deletedFlag]: "",
    [FIELD.recordId]: recordId,
    [FIELD.clientId]: clientId,
  };

  if (isStandardLikeMode(mode) && body.playStyle) {
    payload[FIELD.playStyle] = String(body.playStyle);
  }
  if (isStandardLikeMode(mode)) {
    payload[FIELD.dayNight] = dayNight;
  }
  if (mode === MODE_CONTEST) {
    if (body.stage) {
      payload[FIELD.contestStage] = String(body.stage);
    }
    for (let index = 1; index <= 5; index += 1) {
      payload[`W${index}`] = asFloat(counts[`w${index}`]);
    }
  }

  return payload;
}
