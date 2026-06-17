const STORAGE_USER = "salmonmetrics.operator";
const STORAGE_TOKEN = "salmonmetrics.accessToken";
const STORAGE_CONFIG = "salmonmetrics.shiftConfig";
const STORAGE_ANALYTICS_USER = "salmonmetrics.analyticsUser";
const STORAGE_CLIENT = "salmonmetrics.clientId";
const STORAGE_WEAPON_CORRECTIONS = "salmonmetrics.weaponCorrections";
const WEAPON_MANIFEST_URL = "/assets/weapons/manifest.json";
const WEAPON_FUZZY_MARGIN = 0.055;
const WEAPON_FUZZY_MIN_SCORE = 0.82;
const GEMINI_MODEL_LABELS = new Map([
  ["gemini-3.5-flash", "Gemini 3.5 Flash"],
  ["gemini-3-flash-preview", "Gemini 3 Flash"],
  ["gemini-3-flash", "Gemini 3 Flash"],
  ["gemini-2.5-flash", "Gemini 2.5 Flash"],
  ["gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite"],
  ["gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite"],
  ["gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview"],
  ["gemini-2.5-pro", "Gemini 2.5 Pro"],
]);
const WEAPON_EXTRA_ALIASES = new Map([
  ["sputtery", ["ダップル", "Dapple", "Dapple Dualie"]],
  ["maneuver", ["スプマニュ", "スプラマニュ", "Splat Dualie"]],
  ["dualsweeper", ["デュアル", "Dual Squelcher", "Dual Squelchers", "Dualie Squelcher"]],
  ["jetsweeper", ["ジェッスイ", "Jet Squelcher", "Jet Squelchers"]],
  ["splatroller", ["スプロラ"]],
  ["wakaba", ["わかば"]],
  ["sharp", ["シャプマ", "Sharp Marker"]],
  ["prime", ["プライム"]],
  ["nzap85", ["黒ザップ", "N-ZAP", "N ZAP", "ZAP85"]],
  ["lact450", ["ラクト", "LACT"]],
  ["rpen_5h", ["鉛筆", "R-PEN", "R PEN", "Pencil"]],
  ["quadhopper_black", ["クアッド", "クアッドホッパー", "Quad Hopper"]],
  ["barrelspinner", ["バレル", "Heavy Splatling"]],
  ["hydra", ["ハイドラ", "Hydra Splatling"]],
  ["examiner", ["エグザミナー"]],
  ["liter4k", ["リッター", "4Kリッター", "E liter", "E-liter"]],
  ["liter4k_scope", ["リッタースコープ", "4Kスコープ", "E liter scope", "E-liter scope"]],
]);

const FIELD = {
  date: "日時",
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
  mode: "記録モード",
  notes: "備考",
  dayNight: "昼夜区分",
  contestStage: "コンテストステージ",
};

const DEFAULT_CONFIG = {
  start_time: "",
  end_time: "",
  stage: "アラマキ砦",
  weapons: ["", "", "", ""],
};

const STAGE_ALIASES = new Map([
  ["アラマキ", "アラマキ砦"],
  ["アラマキ岩", "アラマキ砦"],
  ["アラマキ砦", "アラマキ砦"],
  ["ダム", "シェケナダム"],
  ["シェケナダム", "シェケナダム"],
  ["ムニ", "ムニ・エール海洋発電所"],
  ["ムニ・エール海洋発電所", "ムニ・エール海洋発電所"],
  ["ドンブラコ", "難破船ドン・ブラコ"],
  ["ドン・ブラコ", "難破船ドン・ブラコ"],
  ["難破船ドン・ブラコ", "難破船ドン・ブラコ"],
  ["すじこ", "すじこジャンクション跡"],
  ["すじこジャンクション跡", "すじこジャンクション跡"],
  ["トキ", "トキシラズいぶし工房"],
  ["トキシラズいぶし工房", "トキシラズいぶし工房"],
  ["どんぴこ", "どんぴこ闘技場"],
  ["どんぴこ闘技場", "どんぴこ闘技場"],
  ["ビッグラン", "ビッグラン"],
]);

const STAGE_FULL_TO_ALIASES = new Map();
for (const [alias, fullName] of STAGE_ALIASES.entries()) {
  if (!STAGE_FULL_TO_ALIASES.has(fullName)) {
    STAGE_FULL_TO_ALIASES.set(fullName, new Set([fullName]));
  }
  STAGE_FULL_TO_ALIASES.get(fullName).add(alias);
}

const STAGE_ORDER = [...STAGE_FULL_TO_ALIASES.keys()];
const DAY_ONLY = "昼のみ";
const NIGHT_INCLUDED = "夜あり";
const UNCLASSIFIED = "未分類";
const APP_TIME_ZONE = "Asia/Tokyo";
const DAY_NIGHT_NOTE_PATTERN = /\[(昼のみ|夜あり)\]|(?:記録条件|昼夜区分|昼夜)[:：\s]*(昼のみ|夜あり)/;
const OCR_STAGE_PATTERNS = [
  { stage: "アラマキ砦", keys: ["アラマキ", "アラマキ砦"] },
  { stage: "シェケナダム", keys: ["シェケナダム", "ダム"] },
  { stage: "ムニ・エール海洋発電所", keys: ["ムニ", "海洋発電", "発電所"] },
  { stage: "難破船ドン・ブラコ", keys: ["ドンブラコ", "ドン・ブラコ", "難破船"] },
  { stage: "すじこジャンクション跡", keys: ["すじこ", "ジャンクション"] },
  { stage: "トキシラズいぶし工房", keys: ["トキシラズ", "いぶし工房"] },
  { stage: "どんぴこ闘技場", keys: ["どんぴこ", "闘技場"] },
  {
    stage: "ビッグラン",
    keys: [
      "ビッグラン",
      "タラポート",
      "ショッピングパーク",
      "スメーシー",
      "海女美術大学",
      "マテガイ",
      "ナンプラー",
      "ゴンズイ",
      "ヒラメ",
    ],
  },
];

const OCR_NIGHT_KEYWORDS = [
  "EX-WAVE",
  "EX WAVE",
  "オカシラ",
  "ジョー",
  "ヨコヅナ",
  "タツ",
  "キンシャケ探し",
  "グリル発進",
  "ラッシュ",
  "ハコビヤ",
  "霧",
  "ドスコイ",
  "ドロシャケ",
  "巨大タツマキ",
];

const state = {
  logs: [],
  config: { ...DEFAULT_CONFIG },
  loading: false,
  ocrWarnings: [],
  ocrWeapons: [],
  weaponLookup: new Map(),
  weaponCandidates: [],
  weaponManifest: [],
  lastOcrImages: null,
  lastFeedbackSubmission: null,
  weaponFeedbackQueue: Promise.resolve(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function currentClientId() {
  let value = localStorage.getItem(STORAGE_CLIENT);
  if (!value) {
    value = `smc_${randomIdPart()}_${Date.now().toString(36)}`;
    localStorage.setItem(STORAGE_CLIENT, value);
  }
  return value;
}

function createRecordId() {
  return `smr_${Date.now().toString(36)}_${randomIdPart()}`;
}

function randomIdPart() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  const values = new Uint32Array(2);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36)).join("");
}

const elements = {
  refreshButton: $("#refreshButton"),
  syncStatus: $("#syncStatus"),
  shiftStatus: $("#shiftStatus"),
  remainingTime: $("#remainingTime"),
  shiftWeaponStrip: $("#shiftWeaponStrip"),
  operatorName: $("#operatorName"),
  knownUsers: $("#knownUsers"),
  analyticsUser: $("#analyticsUser"),
  analyticsScope: $("#analyticsScope"),
  ocrForm: $("#ocrForm"),
  ocrImageInput: $("#ocrImageInput"),
  ocrStatus: $("#ocrStatus"),
  ocrEngine: $("#ocrEngine"),
  ocrResult: $("#ocrResult"),
  ocrClearButton: $("#ocrClearButton"),
  ocrMode: $("#ocrMode"),
  ocrStageSelect: $("#ocrStageSelect"),
  ocrRound: $("#ocrRound"),
  ocrDayNight: $("#ocrDayNight"),
  ocrPreview: $("#ocrPreview"),
  ocrApplyButton: $("#ocrApplyButton"),
  standardForm: $("#standardForm"),
  contestForm: $("#contestForm"),
  shiftForm: $("#shiftForm"),
  standardPreview: $("#standardPreview"),
  contestPreview: $("#contestPreview"),
  standardStage: $("#standardStage"),
  contestRound: $("#contestRound"),
  contestRoundFilter: $("#contestRoundFilter"),
  statGrid: $("#statGrid"),
  stageSummaryList: $("#stageSummaryList"),
  stageSummaryCount: $("#stageSummaryCount"),
  recentStandard: $("#recentStandard"),
  contestRanking: $("#contestRanking"),
  standardCount: $("#standardCount"),
  contestCount: $("#contestCount"),
  stageSelect: $("#stageSelect"),
  weaponRow: $("#weaponRow"),
  toast: $("#toast"),
  accessDialog: $("#accessDialog"),
  accessForm: $("#accessForm"),
  accessToken: $("#accessToken"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  registerServiceWorker();
  populateContestRounds();
  wireNavigation();
  wireForms();
  wireInputs();

  const rememberedUser = localStorage.getItem(STORAGE_USER);
  if (rememberedUser) {
    elements.operatorName.value = rememberedUser;
  }

  renderPreview(elements.standardForm, elements.standardPreview);
  renderPreview(elements.contestForm, elements.contestPreview);
  renderPreview(elements.ocrForm, elements.ocrPreview);
  setDefaultTimestamp(elements.standardForm);
  setDefaultTimestamp(elements.contestForm);
  syncOcrModeUi();
  activateView("ocr");
  await loadWeaponIcons();
  await refreshAll();
  setInterval(updateShiftStatus, 60_000);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").then((registration) => {
    registration.update().catch(() => {});
  }).catch(() => {});
}

async function loadWeaponIcons() {
  try {
    const response = await fetch(WEAPON_MANIFEST_URL, { cache: "force-cache" });
    if (!response.ok) return;
    const manifest = await response.json();
    const lookup = new Map();
    const candidates = [];
    const candidateKeys = new Set();
    for (const weapon of manifest.weapons || []) {
      const aliases = weaponAliases(weapon);
      for (const alias of aliases) {
        addWeaponAlias(lookup, candidates, candidateKeys, weapon, alias);
      }
    }
    state.weaponManifest = Array.isArray(manifest.weapons) ? manifest.weapons : [];
    state.weaponLookup = lookup;
    state.weaponCandidates = candidates;
  } catch {
    state.weaponLookup = new Map();
    state.weaponCandidates = [];
    state.weaponManifest = [];
  }
}

function populateContestRounds() {
  for (let index = 1; index <= 17; index += 1) {
    const label = `第${index}回`;
    elements.contestRound.append(new Option(label, label));
    elements.contestRoundFilter.append(new Option(label, label));
    elements.ocrRound.append(new Option(label, label));
  }
}

function wireNavigation() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.view));
  });
}

function activateView(view) {
  $$("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
}

function wireForms() {
  elements.standardForm.addEventListener("submit", (event) => submitEntry(event, "STANDARD"));
  elements.contestForm.addEventListener("submit", (event) => submitEntry(event, "CONTEST"));
  elements.shiftForm.addEventListener("submit", saveShiftConfig);
  elements.accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    localStorage.setItem(STORAGE_TOKEN, elements.accessToken.value.trim());
    closeAccessDialog();
    await refreshAll();
  });
}

function wireInputs() {
  elements.refreshButton.addEventListener("click", refreshAll);
  elements.analyticsUser.addEventListener("change", () => {
    localStorage.setItem(STORAGE_ANALYTICS_USER, elements.analyticsUser.value || "すべて");
    renderAnalytics();
  });
  elements.contestRoundFilter.addEventListener("change", renderAnalytics);
  elements.ocrImageInput.addEventListener("change", handleOcrUpload);
  elements.ocrClearButton.addEventListener("click", resetOcrPanel);
  elements.ocrApplyButton.addEventListener("click", copyOcrToEntryForm);
  elements.recentStandard.addEventListener("click", handleDeleteClick);
  elements.contestRanking.addEventListener("click", handleDeleteClick);
  elements.ocrMode.addEventListener("change", () => {
    clearOcrNeedsCheck(elements.ocrMode);
    syncOcrModeUi();
    renderPreview(elements.ocrForm, elements.ocrPreview);
  });
  elements.ocrForm.addEventListener("submit", submitOcrEntry);
  elements.operatorName.addEventListener("input", () => {
    const value = elements.operatorName.value.trim();
    if (value) {
      localStorage.setItem(STORAGE_USER, value);
      ensureUserOption(value);
    }
  });
  elements.operatorName.addEventListener("change", () => {
    const value = elements.operatorName.value.trim();
    if (value) {
      ensureUserOption(value);
    }
    renderAnalytics();
  });
  elements.standardForm.addEventListener("input", () => {
    renderPreview(elements.standardForm, elements.standardPreview);
  });
  elements.contestForm.addEventListener("input", () => {
    renderPreview(elements.contestForm, elements.contestPreview);
  });
  elements.ocrForm.addEventListener("input", (event) => {
    clearOcrNeedsCheck(event.target);
    renderPreview(elements.ocrForm, elements.ocrPreview);
  });
  elements.ocrForm.addEventListener("change", (event) => {
    clearOcrNeedsCheck(event.target);
    renderPreview(elements.ocrForm, elements.ocrPreview);
  });
  $$("input[type='number']").forEach((input) => {
    input.addEventListener("focus", () => {
      try {
        input.select();
      } catch {
        input.setSelectionRange?.(0, input.value.length);
      }
    });
  });
}

async function refreshAll() {
  if (state.loading) return;
  state.loading = true;
  setStatus("同期中");
  try {
    await Promise.all([loadConfig(), loadLogs()]);
    renderAll();
    setStatus("同期済み");
  } catch (error) {
    setStatus("接続エラー");
    toast(error.message || "通信に失敗しました");
  } finally {
    state.loading = false;
  }
}

async function loadConfig() {
  const remoteConfig = await api("/api/config");
  state.config = normalizeConfig(newestConfig(readStoredConfig(), remoteConfig));
}

async function loadLogs() {
  const response = await api("/api/logs");
  if (Array.isArray(response)) {
    state.logs = response;
  } else if (Array.isArray(response.data)) {
    state.logs = response.data;
  } else {
    state.logs = [];
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  const token = localStorage.getItem(STORAGE_TOKEN);
  if (token) {
    headers.set("X-Access-Token", token);
  }
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (response.status === 401) {
    showAccessDialog();
    throw new Error("Access key is required");
  }
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

async function submitEntry(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const userName = elements.operatorName.value.trim();
  if (!userName) {
    toast("ユーザー名を入力してください");
    elements.operatorName.focus();
    return;
  }

  const button = $("button[type='submit']", form);
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "送信中...";
  setStatus("送信中");

  try {
    const payload = entryPayload(form, mode, userName);
    const submittedMetrics = metricsFromCounts(payload.counts);
    await api("/api/submit", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    localStorage.setItem(STORAGE_USER, userName);
    ensureUserOption(userName);
    resetEntryForm(form);
    renderPreview(form, mode === "STANDARD" ? elements.standardPreview : elements.contestPreview);
    toast(`送信完了 · Dr ${formatPercent(submittedMetrics.dr)} · DPK ${submittedMetrics.dpk.toFixed(2)}`);
    await loadLogs();
    renderUsers();
    renderAnalytics();
    focusFirstEntryField(form);
    setStatus("同期済み");
  } catch (error) {
    setStatus("送信失敗");
    toast(error.message || "送信に失敗しました");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function submitOcrEntry(event) {
  event.preventDefault();
  const userName = elements.operatorName.value.trim();
  if (!userName) {
    toast("ユーザー名を入力してください");
    elements.operatorName.focus();
    return;
  }

  const mode = elements.ocrMode.value === "CONTEST" ? "CONTEST" : "STANDARD";
  const missing = missingOcrRequiredFields(mode);
  if (missing.length) {
    toast(`${missing.join("・")} を確認してください`);
    highlightMissingOcrFields(missing);
    return;
  }

  const button = $("button[type='submit']", elements.ocrForm);
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "送信中...";
  setStatus("送信中");

  try {
    const payload = ocrPayload(mode, userName);
    const submittedMetrics = metricsFromCounts(payload.counts);
    await api("/api/submit", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    localStorage.setItem(STORAGE_USER, userName);
    ensureUserOption(userName);
    toast(`送信完了 · Dr ${formatPercent(submittedMetrics.dr)} · DPK ${submittedMetrics.dpk.toFixed(2)}`);
    await loadLogs();
    renderUsers();
    renderAnalytics();
    setStatus("同期済み");
  } catch (error) {
    setStatus("送信失敗");
    toast(error.message || "送信に失敗しました");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function entryPayload(form, mode, userName) {
  const counts = readCounts(form);
  const payload = {
    mode,
    userName,
    notes: form.elements.notes?.value.trim() || "",
    counts,
    weapons: normalizeConfig(state.config).weapons,
    recordId: createRecordId(),
    clientId: currentClientId(),
  };
  if (mode === "STANDARD") {
    payload.stage = state.config.stage;
    payload.playStyle = form.elements.playStyle?.value || "";
    payload.stampedAt = form.elements.stampedAt?.value || "";
    payload.dayNight = form.elements.dayNight?.value || DAY_ONLY;
  } else {
    payload.round = form.elements.round.value;
    payload.stage = form.elements.stage?.value || "";
    payload.stampedAt = form.elements.stampedAt?.value || "";
  }
  return payload;
}

function ocrPayload(mode, userName) {
  const counts = readCounts(elements.ocrForm);
  const payload = {
    mode,
    userName,
    notes: elements.ocrForm.elements.notes?.value.trim() || "",
    counts,
    weapons: ocrSubmissionWeapons(),
    stampedAt: elements.ocrForm.elements.stampedAt?.value || "",
    recordId: createRecordId(),
    clientId: currentClientId(),
  };
  if (mode === "STANDARD") {
    payload.stage = elements.ocrStageSelect.value;
    payload.playStyle = elements.ocrForm.elements.playStyle?.value || "";
    payload.dayNight = elements.ocrDayNight.value || DAY_ONLY;
  } else {
    payload.stage = elements.ocrStageSelect.value;
    payload.round = elements.ocrRound.value || "第1回";
  }
  return payload;
}

function readCounts(form) {
  const names = [
    "totalEggs",
    "myEggs",
    "myKills",
    "p2Kills",
    "p3Kills",
    "p4Kills",
    "totalRed",
    "myRed",
    "w1",
    "w2",
    "w3",
    "w4",
    "w5",
  ];
  return Object.fromEntries(names.map((name) => [name, numberFrom(form.elements[name]?.value)]));
}

function ocrSubmissionWeapons() {
  const ocrWeapons = normalizeOcrWeapons(state.ocrWeapons);
  if (ocrWeapons.length === 4 && !normalizeOcrWarnings(state.ocrWarnings).includes("ブキ")) {
    return ocrWeapons;
  }
  return normalizeConfig(state.config).weapons;
}

function missingOcrRequiredFields(mode) {
  const missing = [];
  const form = elements.ocrForm;
  if (!form.elements.stampedAt.value || form.elements.stampedAt.classList.contains("needs-check")) {
    missing.push("時刻");
  }
  if (numberFrom(form.elements.totalEggs.value) <= 0 || form.elements.totalEggs.classList.contains("needs-check")) {
    missing.push("全体納品");
  }
  if (numberFrom(form.elements.myEggs.value) <= 0 || form.elements.myEggs.classList.contains("needs-check")) {
    missing.push("自分納品");
  }
  if (numberFrom(form.elements.totalRed.value) <= 0 || form.elements.totalRed.classList.contains("needs-check")) {
    missing.push("全体赤イクラ");
  }
  if (numberFrom(form.elements.myRed.value) <= 0 || form.elements.myRed.classList.contains("needs-check")) {
    missing.push("個人赤イクラ");
  }

  const killFields = ["myKills", "p2Kills", "p3Kills", "p4Kills"].map((name) => form.elements[name]);
  const needsKillReview = killFields.some((field) => !String(field.value).trim() || field.classList.contains("needs-check"));
  if (needsKillReview) missing.push("処理数");

  if (
    !elements.ocrStageSelect.value
    || elements.ocrStageSelect.classList.contains("needs-check")
  ) {
    missing.push("ステージ");
  }
  if (mode === "STANDARD" && !String(form.elements.playStyle?.value || "").trim()) {
    missing.push("プレイスタイル");
  }
  if (
    mode === "CONTEST"
    && (!elements.ocrRound.value || elements.ocrRound.classList.contains("needs-check"))
  ) {
    missing.push("開催回");
  }
  return missing;
}

function highlightMissingOcrFields(labels) {
  const map = new Map([
    ["時刻", elements.ocrForm.elements.stampedAt],
    ["全体納品", elements.ocrForm.elements.totalEggs],
    ["自分納品", elements.ocrForm.elements.myEggs],
    ["全体赤イクラ", elements.ocrForm.elements.totalRed],
    ["個人赤イクラ", elements.ocrForm.elements.myRed],
    ["処理数", [
      elements.ocrForm.elements.myKills,
      elements.ocrForm.elements.p2Kills,
      elements.ocrForm.elements.p3Kills,
      elements.ocrForm.elements.p4Kills,
    ]],
    ["ステージ", elements.ocrStageSelect],
    ["開催回", elements.ocrRound],
    ["プレイスタイル", elements.ocrForm.elements.playStyle],
  ]);
  $$("input, select, textarea", elements.ocrForm).forEach((field) => field.classList.remove("needs-check"));
  labels.forEach((label) => {
    const target = map.get(label);
    if (Array.isArray(target)) {
      target.forEach((field) => field?.classList.add("needs-check"));
    } else {
      target?.classList.add("needs-check");
    }
  });
  const firstTarget = map.get(labels[0]);
  const firstField = Array.isArray(firstTarget) ? firstTarget.find(Boolean) : firstTarget;
  firstField?.focus({ preventScroll: false });
}

function clearOcrNeedsCheck(target) {
  target?.classList?.remove("needs-check");
}

function resetEntryForm(form) {
  $$("input, textarea", form).forEach((input) => {
    if (input.type === "number" || input.type === "datetime-local" || input.tagName === "TEXTAREA") {
      input.value = "";
    }
  });
  const dayOnly = form.elements.dayNight?.value ? form.querySelector(`input[name="dayNight"][value="${DAY_ONLY}"]`) : null;
  if (dayOnly) {
    dayOnly.checked = true;
  }
  setDefaultTimestamp(form);
}

function setDefaultTimestamp(form) {
  const stampedAt = form.elements.stampedAt;
  if (stampedAt && !stampedAt.value) {
    stampedAt.value = datetimeLocal(new Date());
  }
}

function focusFirstEntryField(form) {
  const input = form.querySelector("input[type='number']");
  if (input) {
    input.focus({ preventScroll: true });
  }
}

async function saveShiftConfig(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const startTime = form.elements.startTime.value;
  let endTime = form.elements.endTime.value;
  if (startTime && !endTime) {
    const start = parseDate(startTime);
    if (start) {
      start.setHours(start.getHours() + 40);
      endTime = datetimeLocal(start);
    }
  }

  const config = {
    stage: form.elements.stage.value,
    start_time: startTime,
    end_time: endTime,
    expire_at: endTime,
    weapons: [
      form.elements.weapon1.value.trim(),
      form.elements.weapon2.value.trim(),
      form.elements.weapon3.value.trim(),
      form.elements.weapon4.value.trim(),
    ],
  };

  const button = $("button[type='submit']", form);
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "保存中...";
  try {
    state.config = normalizeConfig(await api("/api/config", {
      method: "POST",
      body: JSON.stringify(config),
    }));
    localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config));
    renderConfig();
    renderAnalytics();
    toast("保存しました");
  } catch (error) {
    toast(error.message || "保存に失敗しました");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderAll() {
  renderUsers();
  renderConfig();
  renderAnalytics();
}

function renderUsers() {
  const users = sortedUsers();
  elements.knownUsers.replaceChildren(...users.map((user) => {
    const option = document.createElement("option");
    option.value = user;
    return option;
  }));

  const previous = localStorage.getItem(STORAGE_ANALYTICS_USER) || elements.analyticsUser.value || "すべて";
  elements.analyticsUser.replaceChildren(new Option("すべて", "すべて"));
  users.forEach((user) => elements.analyticsUser.append(new Option(user, user)));

  const remembered = elements.operatorName.value.trim();
  if (remembered) {
    ensureUserOption(remembered);
  }
  const nextUser = users.includes(previous) || previous === "すべて" ? previous : "すべて";
  elements.analyticsUser.value = nextUser;
  if (nextUser !== previous) {
    localStorage.setItem(STORAGE_ANALYTICS_USER, nextUser);
  }
}

function ensureUserOption(user) {
  const users = sortedUsers();
  if (!users.includes(user)) {
    const dataOption = document.createElement("option");
    dataOption.value = user;
    elements.knownUsers.append(dataOption);
    elements.analyticsUser.append(new Option(user, user));
  }
}

function sortedUsers() {
  return [...new Set(state.logs.map((log) => String(log[FIELD.user] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja"));
}

function renderConfig() {
  const config = normalizeConfig(state.config);
  state.config = config;
  elements.standardStage.textContent = config.stage || "--";
  elements.stageSelect.value = config.stage || DEFAULT_CONFIG.stage;
  elements.shiftForm.elements.startTime.value = datetimeLocal(parseDate(config.start_time));
  elements.shiftForm.elements.endTime.value = datetimeLocal(parseDate(config.end_time));
  const weapons = Array.isArray(config.weapons) ? config.weapons : [];
  ["weapon1", "weapon2", "weapon3", "weapon4"].forEach((name, index) => {
    elements.shiftForm.elements[name].value = weapons[index] || "";
  });
  elements.weaponRow.replaceChildren(
    ...weapons
      .filter((weapon) => weapon && weapon.trim())
      .map(weaponChipNode),
  );
  renderShiftWeaponStrip(weapons);
  updateShiftStatus();
}

function renderShiftWeaponStrip(weapons) {
  const visibleWeapons = (Array.isArray(weapons) ? weapons : []).filter((weapon) => weapon && weapon.trim());
  if (!visibleWeapons.length) {
    elements.shiftWeaponStrip.innerHTML = '<span class="quiet-chip">ブキ未設定</span>';
    return;
  }
  elements.shiftWeaponStrip.replaceChildren(
    ...visibleWeapons.map(weaponChipNode),
  );
}

function normalizeConfig(config) {
  const normalized = { ...DEFAULT_CONFIG, ...(config || {}) };
  normalized.stage = fullStageName(normalized.stage);
  const weapons = Array.isArray(normalized.weapons) ? normalized.weapons : [];
  normalized.weapons = [...weapons, "", "", "", ""].slice(0, 4).map((weapon) => String(weapon || "").trim());
  return normalized;
}

function fullStageName(stage) {
  return STAGE_ALIASES.get(String(stage || "").trim()) || String(stage || "").trim() || DEFAULT_CONFIG.stage;
}

function stageMatchesLog(selectedStage, logStageValue) {
  const selectedFullName = fullStageName(selectedStage);
  const logStage = String(logStageValue || "");
  const aliases = STAGE_FULL_TO_ALIASES.get(selectedFullName) || new Set([selectedFullName]);
  return [...aliases].some((alias) => logStage.includes(alias) || alias.includes(logStage));
}

function readStoredConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_CONFIG) || "null");
  } catch {
    return null;
  }
}

function newestConfig(localConfig, remoteConfig) {
  const localTime = Date.parse(localConfig?.last_setup_at || "");
  const remoteTime = Date.parse(remoteConfig?.last_setup_at || "");
  if (Number.isFinite(localTime) && (!Number.isFinite(remoteTime) || localTime > remoteTime)) {
    return { ...DEFAULT_CONFIG, ...localConfig };
  }
  return { ...DEFAULT_CONFIG, ...(remoteConfig || {}), ...(localConfig && !remoteConfig?.last_setup_at ? localConfig : {}) };
}

function updateShiftStatus() {
  const config = { ...DEFAULT_CONFIG, ...state.config };
  elements.shiftStatus.textContent = config.stage || "--";
  const end = parseDate(config.end_time || config.expire_at);
  if (!end) {
    elements.remainingTime.textContent = "--";
    return;
  }
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) {
    elements.remainingTime.textContent = "EXPIRED";
    return;
  }
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  elements.remainingTime.textContent = `${hours}h ${minutes}m`;
}

function renderPreview(form, target) {
  const metrics = metricsFromCounts(readCounts(form));
  target.innerHTML = [
    metricTile("Dr", formatPercent(metrics.dr)),
    metricTile("BSKr", formatPercent(metrics.bskr)),
    metricTile("OKr", formatPercent(metrics.okr)),
    metricTile("DPK", metrics.dpk.toFixed(2)),
  ].join("");
}

function metricTile(label, value) {
  return `<div class="metric-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function metricsFromCounts(counts) {
  const totalKills = counts.myKills + counts.p2Kills + counts.p3Kills + counts.p4Kills;
  const dr = counts.totalEggs > 0 ? counts.myEggs / counts.totalEggs : 0;
  const bskr = totalKills > 0 ? counts.myKills / totalKills : 0;
  const okr = counts.totalRed > 0 ? counts.myRed / counts.totalRed : 0;
  return { dr, bskr, okr, dpk: dr + bskr };
}

function renderAnalytics() {
  const selectedUser = elements.analyticsUser.value || "すべて";
  elements.analyticsScope.textContent = selectedUser === "すべて" ? "全員の記録" : `${selectedUser} の記録`;
  const standard = state.logs
    .filter((log) => modeOf(log) === "STANDARD")
    .filter((log) => selectedUser === "すべて" || String(log[FIELD.user]) === selectedUser);
  const shiftStandard = currentShiftData(standard);
  const contest = state.logs
    .filter((log) => modeOf(log) === "CONTEST")
    .filter((log) => selectedUser === "すべて" || String(log[FIELD.user]) === selectedUser);

  elements.statGrid.innerHTML = [
    statCard("Dr", formatMetricAverage(standard, "Dr", true), `Shift ${formatMetricAverage(shiftStandard, "Dr", true)}`),
    statCard("BSKr", formatMetricAverage(standard, "BSKr", true), `Shift ${formatMetricAverage(shiftStandard, "BSKr", true)}`),
    statCard("OKr", formatMetricAverage(standard, "OKr", true), `Shift ${formatMetricAverage(shiftStandard, "OKr", true)}`),
    statCard("DPK", formatMetricAverage(standard, "DPK", false), `${standard.length} runs`),
  ].join("");

  renderStageSummary(standard);
  renderStandardRecords(standard);
  renderContestRecords(contest);
}

function currentShiftData(logs) {
  const config = { ...DEFAULT_CONFIG, ...state.config };
  const stage = fullStageName(config.stage);
  const start = parseDate(config.start_time);
  const end = parseDate(config.end_time || config.expire_at);
  return logs.filter((log) => {
    if (stage && !stageMatchesLog(stage, log[FIELD.stage])) {
      return false;
    }
    if (!start || !end) {
      return true;
    }
    const date = parseDate(log[FIELD.date]);
    if (!date) {
      return false;
    }
    const buffer = 5 * 60_000;
    return date.getTime() >= start.getTime() - buffer && date.getTime() <= end.getTime() + buffer;
  });
}

function renderStandardRecords(records) {
  const sorted = [...records].sort((a, b) => dateValue(b) - dateValue(a)).slice(0, 200);
  elements.standardCount.textContent = String(records.length);
  if (!sorted.length) {
    elements.recentStandard.innerHTML = emptyRow("No standard records");
    return;
  }
  elements.recentStandard.innerHTML = sorted.map((log) => {
    const date = formatDate(parseDate(log[FIELD.date])) || escapeHtml(String(log[FIELD.date] || ""));
    const stage = escapeHtml(String(log[FIELD.stage] || "--"));
    const user = escapeHtml(String(log[FIELD.user] || "--"));
    const eggs = numberFrom(log[FIELD.totalEggs]).toFixed(0);
    const dr = formatPercent(numberFrom(log.Dr));
    const dpk = numberFrom(log.DPK).toFixed(2);
    const dayNight = escapeHtml(dayNightOf(log));
    const weapons = weaponsOf(log);
    const weaponLine = weapons ? `<span class="record-weapons">${weaponIconsHtml(weapons)}</span>` : "";
    const deleteButton = deleteButtonHtml(log);
    return `
      <article class="record-row">
        <div>
          <strong>${date} · ${stage}</strong>
          <span>${user} · ${dayNight} · 納品 ${eggs} · Dr ${dr}</span>
          ${weaponLine}
        </div>
        <div class="record-actions">
          <div class="record-metric">${dpk}</div>
          ${deleteButton}
        </div>
      </article>
    `;
  }).join("");
}

function renderStageSummary(records) {
  const grouped = new Map();
  for (const record of records) {
    const category = dayNightOf(record);
    const rawStage = String(record[FIELD.stage] || "").trim();
    const stage = rawStage ? fullStageName(rawStage) : "ステージ未設定";
    const eggs = numberFrom(record[FIELD.totalEggs]);
    if (!grouped.has(stage)) {
      grouped.set(stage, {
        stage,
        runs: 0,
        [DAY_ONLY]: { total: 0, best: 0, runs: 0 },
        [NIGHT_INCLUDED]: { total: 0, best: 0, runs: 0 },
        [UNCLASSIFIED]: { total: 0, best: 0, runs: 0 },
      });
    }
    const bucket = grouped.get(stage);
    bucket.runs += 1;
    bucket[category].total += eggs;
    bucket[category].best = Math.max(bucket[category].best, eggs);
    bucket[category].runs += 1;
  }

  const rows = [...grouped.values()].sort((a, b) => {
    const aIndex = STAGE_ORDER.indexOf(a.stage);
    const bIndex = STAGE_ORDER.indexOf(b.stage);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return a.stage.localeCompare(b.stage, "ja");
  });

  elements.stageSummaryCount.textContent = String(rows.length);
  if (!rows.length) {
    elements.stageSummaryList.innerHTML = emptyStageSummary();
    return;
  }

  elements.stageSummaryList.innerHTML = rows.map((row) => {
    const bestCards = [
      summaryBestCard(DAY_ONLY, row[DAY_ONLY]),
      summaryBestCard(NIGHT_INCLUDED, row[NIGHT_INCLUDED]),
    ];
    const totalCards = [
      summaryTotalCard(DAY_ONLY, row[DAY_ONLY]),
      summaryTotalCard(NIGHT_INCLUDED, row[NIGHT_INCLUDED]),
      summaryTotalCard(UNCLASSIFIED, row[UNCLASSIFIED]),
    ];
    return `
      <article class="stage-summary-row">
        <div class="stage-summary-main">
          <strong>${escapeHtml(row.stage)}</strong>
          <span>${row.runs}件</span>
        </div>
        <div class="stage-best-list">
          ${bestCards.join("")}
        </div>
        <div class="stage-summary-chips">
          ${totalCards.join("")}
        </div>
      </article>
    `;
  }).join("");
}

function summaryBestCard(label, bucket) {
  const value = bucket.runs > 0 ? formatWhole(bucket.best) : "--";
  return `
    <div class="stage-best ${label === NIGHT_INCLUDED ? "night" : "day"}">
      <span>${escapeHtml(label)}最高</span>
      <strong>${value}</strong>
      <small>${bucket.runs}件</small>
    </div>
  `;
}

function summaryTotalCard(label, bucket) {
  return `
    <div class="stage-chip ${label === NIGHT_INCLUDED ? "night" : label === DAY_ONLY ? "day" : "unknown"}">
      <span>${escapeHtml(label)}</span>
      <strong>${formatWhole(bucket.total)}</strong>
      <small>${bucket.runs}件</small>
    </div>
  `;
}

function emptyStageSummary() {
  return `
    <article class="stage-summary-row empty">
      <div class="stage-summary-main">
        <strong>通常記録がありません</strong>
        <span>記録後にステージ別集計が表示されます</span>
      </div>
    </article>
  `;
}

function dayNightOf(record) {
  const value = String(record[FIELD.dayNight] || record["記録条件"] || record["昼夜"] || "").trim();
  if (value.includes("夜")) return NIGHT_INCLUDED;
  if (value.includes("昼")) return DAY_ONLY;

  const notes = String(record[FIELD.notes] || "").trim();
  const noteMatch = notes.match(DAY_NIGHT_NOTE_PATTERN);
  if (noteMatch) return noteMatch[1] || noteMatch[2];

  if (!value) return UNCLASSIFIED;
  if (value.includes("夜")) return NIGHT_INCLUDED;
  if (value.includes("昼")) return DAY_ONLY;
  return UNCLASSIFIED;
}

function weaponsOf(record = {}) {
  return String(record[FIELD.weapons] || record["武器"] || "")
    .trim()
    .replace(/\s*\/\s*/g, " / ");
}

function weaponListFromText(value) {
  return String(value || "")
    .split(/[\/／,、\n]+/)
    .map((weapon) => weapon.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function weaponAliases(weapon = {}) {
  const aliases = new Set([
    weapon.key,
    weapon.nameJa,
    weapon.nameEn,
    ...(weapon.aliases || []),
    ...(WEAPON_EXTRA_ALIASES.get(weapon.key) || []),
  ]);
  for (const alias of [...aliases]) {
    const value = String(alias || "").trim();
    if (!value) continue;
    aliases.add(value.replace(/\s*\([^)]*\)\s*/g, " "));
    aliases.add(value.replace(/\bdualies\b/gi, "dualie"));
    aliases.add(value.replace(/\bdualie\b/gi, "dualies"));
    aliases.add(value.replace(/\bsquelchers\b/gi, "squelcher"));
    aliases.add(value.replace(/\bsquelcher\b/gi, "squelchers"));
    aliases.add(value.replace(/\be[-\s]?liter\b/gi, "eliter"));
    aliases.add(value.replace(/[・･]\s*[甲乙]$/, ""));
    aliases.add(value.replace(/ー/g, ""));
  }
  return [...aliases].map((alias) => String(alias || "").trim()).filter(Boolean);
}

function addWeaponAlias(lookup, candidates, candidateKeys, weapon, alias) {
  const normalized = normalizeWeaponToken(alias);
  if (!normalized) return;
  if (!lookup.has(normalized)) lookup.set(normalized, weapon);
  if (!isFuzzyWeaponToken(normalized)) return;

  const key = `${weapon.key}:${normalized}`;
  if (candidateKeys.has(key)) return;
  candidateKeys.add(key);
  candidates.push({ token: normalized, weapon });
}

function normalizeWeaponToken(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(the|weapon|weapons)\b/g, "")
    .replace(/[()\[\]{}'"`’‘“”.,・･\-_\s/／、]/g, "")
    .trim();
}

function resolveWeaponIcon(weaponName) {
  const normalized = normalizeWeaponToken(weaponName);
  if (!normalized || !state.weaponLookup?.size) return null;
  if (state.weaponLookup.has(normalized)) return state.weaponLookup.get(normalized);

  const substringMatch = resolveWeaponBySubstring(normalized);
  if (substringMatch) return substringMatch;

  return resolveWeaponByFuzzyMatch(normalized);
}

function resolveWeaponBySubstring(normalized) {
  let best = null;
  for (const [alias, weapon] of state.weaponLookup.entries()) {
    if (!isFuzzyWeaponToken(alias) || !isFuzzyWeaponToken(normalized)) continue;
    if (normalized.includes(alias) || alias.includes(normalized)) {
      const score = Math.min(alias.length, normalized.length);
      if (!best || score > best.score) best = { weapon, score };
    }
  }
  return best?.weapon || null;
}

function resolveWeaponByFuzzyMatch(normalized) {
  if (!isFuzzyWeaponToken(normalized)) return null;
  let best = null;
  let second = null;

  for (const candidate of state.weaponCandidates || []) {
    const maxEdits = maxWeaponEdits(normalized, candidate.token);
    const distance = editDistance(normalized, candidate.token, maxEdits);
    if (distance > maxEdits) continue;
    const score = 1 - distance / Math.max(normalized.length, candidate.token.length);
    if (!best || score > best.score) {
      second = best;
      best = { ...candidate, score };
    } else if (!second || score > second.score) {
      second = { ...candidate, score };
    }
  }

  if (!best || best.score < weaponFuzzyThreshold(normalized)) return null;
  if (second && best.weapon !== second.weapon && best.score - second.score < WEAPON_FUZZY_MARGIN) return null;
  return best.weapon;
}

function isFuzzyWeaponToken(value) {
  const token = String(value || "");
  return token.length >= 4 && !/^\d+$/.test(token);
}

function weaponFuzzyThreshold(token) {
  const length = String(token || "").length;
  if (length <= 5) return 0.9;
  if (length <= 8) return 0.84;
  return WEAPON_FUZZY_MIN_SCORE;
}

function maxWeaponEdits(left, right) {
  const maxLength = Math.max(String(left || "").length, String(right || "").length);
  if (maxLength <= 5) return 1;
  if (maxLength <= 9) return 2;
  if (maxLength <= 16) return 3;
  return 4;
}

function editDistance(left, right, limit = Infinity) {
  const source = String(left || "");
  const target = String(right || "");
  if (!source) return target.length;
  if (!target) return source.length;
  if (Math.abs(source.length - target.length) > limit) return limit + 1;

  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let row = 1; row <= source.length; row += 1) {
    const current = [row];
    let rowMin = current[0];
    for (let column = 1; column <= target.length; column += 1) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1;
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost,
      );
      current[column] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[target.length];
}

function weaponIconHtml(weaponName) {
  const weapon = resolveWeaponIcon(weaponName);
  const label = weapon?.nameJa || weaponName;
  if (!weapon?.icon) {
    return `<span class="weapon-text-chip" title="${escapeHtml(label)}">${escapeHtml(weaponName)}</span>`;
  }
  const safeLabel = escapeHtml(label);
  return `
    <span class="weapon-icon-token" tabindex="0" role="img" aria-label="${safeLabel}" title="${safeLabel}" data-tooltip="${safeLabel}">
      <img src="${escapeHtml(weapon.icon)}" alt="" loading="lazy" decoding="async" />
    </span>
  `;
}

function weaponIconsHtml(value) {
  const weapons = Array.isArray(value) ? value : weaponListFromText(value);
  if (!weapons.length) return "";
  return `<span class="weapon-icon-row" aria-label="ブキ">${weapons.map(weaponIconHtml).join("")}</span>`;
}

function weaponChipNode(weaponName) {
  const weapon = resolveWeaponIcon(weaponName);
  const chip = document.createElement("span");
  chip.className = weapon?.icon ? "weapon-chip iconized" : "weapon-chip";
  chip.title = weapon?.nameJa || weaponName;
  if (!weapon?.icon) {
    chip.textContent = weaponName;
    return chip;
  }
  const img = document.createElement("img");
  img.src = weapon.icon;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  chip.append(img, document.createTextNode(weapon.nameJa || weaponName));
  return chip;
}

function renderContestRecords(records) {
  const round = elements.contestRoundFilter.value;
  const filtered = records
    .filter((log) => round === "ALL" || String(log[FIELD.stage]) === round)
    .sort((a, b) => numberFrom(b[FIELD.totalEggs]) - numberFrom(a[FIELD.totalEggs]))
    .slice(0, 200);
  elements.contestCount.textContent = String(filtered.length);
  if (!filtered.length) {
    elements.contestRanking.innerHTML = emptyRow("No contest records");
    return;
  }
  elements.contestRanking.innerHTML = filtered.map((log, index) => {
    const user = escapeHtml(String(log[FIELD.user] || "--"));
    const roundLabel = String(log[FIELD.stage] || "--");
    const contestStage = String(log[FIELD.contestStage] || "").trim();
    const stage = escapeHtml(contestStage ? `${roundLabel} · ${contestStage}` : roundLabel);
    const total = numberFrom(log[FIELD.totalEggs]).toFixed(0);
    const waves = [1, 2, 3, 4, 5].map((wave) => waveValue(log, wave).toFixed(0)).join(" / ");
    const weapons = weaponsOf(log);
    const weaponLine = weapons ? `<span class="record-weapons">${weaponIconsHtml(weapons)}</span>` : "";
    return `
      <article class="record-row">
        <div>
          <strong>#${index + 1} · ${user}</strong>
          <span>${stage} · ${waves}</span>
          ${weaponLine}
        </div>
        <div class="record-actions">
          <div class="record-metric">${total}</div>
          ${deleteButtonHtml(log)}
        </div>
      </article>
    `;
  }).join("");
}

function deleteButtonHtml(log) {
  if (!recordIdOfLog(log)) return "";
  return `
    <button
      class="delete-record-button"
      type="button"
      data-delete-record-id="${escapeHtml(recordIdOfLog(log))}"
      aria-label="この記録を削除済みにする"
      title="この記録を削除済みにする"
    >削除</button>
  `;
}

function waveValue(log, wave) {
  const value = numberFrom(log[`W${wave}`]);
  if (value || wave !== 5) return value;
  return numberFrom(parseLogMetadata(log).w5);
}

function canDeleteLog(log) {
  const operator = elements.operatorName.value.trim();
  const ownerClientId = clientIdOfLog(log);
  return Boolean(
    recordIdOfLog(log)
    && (!ownerClientId || ownerClientId === currentClientId())
    && operator
    && String(log[FIELD.user] || "").trim() === operator
  );
}

function recordIdOfLog(log) {
  return String(log.__recordId || log["レコードID"] || parseLogMetadata(log).id || "").trim();
}

function clientIdOfLog(log) {
  return String(log.__clientId || log["クライアントID"] || parseLogMetadata(log).cid || "").trim();
}

function parseLogMetadata(log) {
  const notes = String(log?.[FIELD.notes] || "");
  const metadata = {};
  for (const match of notes.matchAll(/\[sm:([^\]\r\n]+)\]/g)) {
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
  return metadata;
}

async function handleDeleteClick(event) {
  const button = event.target.closest("[data-delete-record-id]");
  if (!button) return;
  const recordId = button.dataset.deleteRecordId || "";
  const log = state.logs.find((item) => recordIdOfLog(item) === recordId);
  const userName = elements.operatorName.value.trim();
  if (!log || !canDeleteLog(log)) {
    toast("プレイヤー名をこの記録のユーザー名に合わせてください");
    return;
  }
  if (!confirm("この記録を削除済みにしますか？\nシートの元データは消さず、集計から非表示にします。")) {
    return;
  }

  button.disabled = true;
  button.textContent = "削除中";
  setStatus("削除中");
  try {
    await api("/api/delete", {
      method: "POST",
      body: JSON.stringify({
        recordId,
        clientId: currentClientId(),
        userName,
        reason: "ユーザー操作で削除",
      }),
    });
    toast("削除済みにしました");
    await loadLogs();
    renderUsers();
    renderAnalytics();
    setStatus("同期済み");
  } catch (error) {
    setStatus("削除失敗");
    toast(error.message || "削除に失敗しました");
    button.disabled = false;
    button.textContent = "削除";
  }
}

function statCard(label, value, subline) {
  return `
    <article class="stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(subline)}</small>
    </article>
  `;
}

function emptyRow(text) {
  return `<article class="record-row"><div><strong>${escapeHtml(text)}</strong><span>--</span></div><div class="record-metric">--</div></article>`;
}

function formatMetricAverage(records, key, percent) {
  if (!records.length) return "--";
  const values = records.map((record) => numberFrom(record[key]));
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return percent ? formatPercent(avg) : avg.toFixed(2);
}

function modeOf(log) {
  return String(log[FIELD.mode] || "").toUpperCase();
}

function numberFrom(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value) {
  return `${(numberFrom(value) * 100).toFixed(1)}%`;
}

function formatWhole(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(numberFrom(value));
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
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

function dateValue(log) {
  const parsed = parseDate(log[FIELD.date]);
  return parsed ? parsed.getTime() : 0;
}

function formatDate(date) {
  if (!date) return "";
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
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const minute = parts.minute;
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function datetimeLocal(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(text) {
  elements.syncStatus.textContent = text;
}

let toastTimer = null;

function toast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3200);
}

async function handleOcrUpload(event) {
  const [file] = event.currentTarget.files || [];
  if (!file) return;

  elements.ocrClearButton.hidden = false;
  elements.ocrResult.hidden = true;
  elements.ocrResult.replaceChildren();
  state.ocrWarnings = [];
  state.ocrWeapons = [];
  state.lastOcrImages = null;
  setOcrStatus("画像を解析中");
  setOcrEngine("アップロード準備中");
  elements.ocrForm.classList.add("is-busy");
  elements.ocrImageInput.disabled = true;
  activateView("ocr");

  try {
    const result = await recognizeScreenshot(file);
    applyOcrResult(result);
    renderOcrResult(result);
    setOcrStatus("読取済み");
    setOcrEngine(ocrEngineLabel(result));
    toast("読取結果を確認してください");
  } catch (error) {
    setOcrStatus("読取失敗");
    setOcrEngine(friendlyOcrError(error.message || ""));
    toast(friendlyOcrError(error.message || "スクショ読取に失敗しました"));
  } finally {
    elements.ocrForm.classList.remove("is-busy");
    elements.ocrImageInput.disabled = false;
    event.currentTarget.value = "";
  }
}

function resetOcrPanel() {
  elements.ocrImageInput.value = "";
  elements.ocrResult.hidden = true;
  elements.ocrResult.replaceChildren();
  elements.ocrClearButton.hidden = true;
  state.ocrWarnings = [];
  state.ocrWeapons = [];
  state.lastOcrImages = null;
  clearOcrFields(elements.ocrForm, "STANDARD");
  elements.ocrMode.value = "STANDARD";
  elements.ocrStageSelect.value = "";
  elements.ocrRound.value = "第1回";
  elements.ocrDayNight.value = DAY_ONLY;
  syncOcrModeUi();
  renderPreview(elements.ocrForm, elements.ocrPreview);
  setOcrStatus("画像未選択");
  setOcrEngine("Gemini VLMのみ・自動再試行");
}

function setOcrStatus(text) {
  elements.ocrStatus.textContent = text;
}

function setOcrEngine(text) {
  elements.ocrEngine.textContent = text;
}

function ocrEngineLabel(result = {}) {
  const model = String(result.model || "").trim();
  if (model) return `${displayGeminiModelName(model)}で解析`;
  return "Gemini VLMで解析";
}

function displayGeminiModelName(model = "") {
  const raw = String(model || "").trim().replace(/^models\//, "");
  if (!raw) return "";
  if (GEMINI_MODEL_LABELS.has(raw)) return GEMINI_MODEL_LABELS.get(raw);
  return raw
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(?:\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function modelAttemptPath(attempts = []) {
  const seen = new Set();
  return (Array.isArray(attempts) ? attempts : [])
    .map((item) => String(item?.model || "").trim())
    .filter(Boolean)
    .filter((model) => {
      if (seen.has(model)) return false;
      seen.add(model);
      return true;
    })
    .map(displayGeminiModelName)
    .join(" → ");
}

async function recognizeScreenshot(file) {
  const imageDataUrl = await imageFileToDataUrl(file);
  setOcrStatus("アップロード完了");
  const images = await createAiOcrImages(imageDataUrl);
  state.lastOcrImages = {
    weapons: images.weapons || "",
    full: images.full && images.full.length <= 2_400_000 ? images.full : "",
  };
  setOcrEngine("AIが画像を解析中");
  const response = await postOcrImagesWithRetries(images);
  if (response?.result) {
    return normalizeSmartOcrResult(response.result, {
      provider: response.provider || "gemini-vlm",
      model: response.model || "",
      attempts: response.attempts || 0,
      modelAttempts: Array.isArray(response.modelAttempts) ? response.modelAttempts : [],
    });
  }
  throw new Error(response?.error || "Gemini VLMに失敗しました");
}

function friendlyOcrError(message = "") {
  const text = String(message || "");
  if (/4006|neurons|daily free allocation|quota|limit/i.test(text)) {
    return "Gemini無料枠の上限です。時間をおいて再試行";
  }
  if (/GEMINI_API_KEY|APIキー|api key/i.test(text)) return "Gemini APIキーが未設定です";
  if (/401|Access key/i.test(text)) return "アクセスキーが必要です";
  if (/JSON/i.test(text)) return "Gemini結果を読めませんでした";
  return text && text.length < 48 ? text : "画像を変えて再試行してください";
}

async function postOcrImagesWithRetries(images, maxAttempts = 1) {
  let lastResponse = null;
  let partialResponse = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    setOcrEngine(`Gemini VLM解析中 ${attempt}/${maxAttempts}`);
    lastResponse = await postOcrImages(images);
    if (lastResponse?.ok && lastResponse.result) return lastResponse;
    if (lastResponse?.result) partialResponse = lastResponse;
  }
  return partialResponse || lastResponse;
}

async function postOcrImages(images) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  const token = localStorage.getItem(STORAGE_TOKEN);
  if (token) headers.set("X-Access-Token", token);
  const response = await fetch("/api/ocr", {
    method: "POST",
    headers,
    body: JSON.stringify({
      image: images.full,
      images: {
        full: images.full,
        sheet: images.sheet,
        weapons: images.weapons,
      },
    }),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (response.status === 401) {
    showAccessDialog();
    throw new Error("Access key is required");
  }
  return data || { ok: false, error: `HTTP ${response.status}` };
}

function createAiOcrImages(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const regions = buildAiOcrRegions(image);
      const crops = Object.fromEntries(regions.map((region) => [region.key, cropImageRegion(image, region).dataUrl]));
      resolve({ full: dataUrl, sheet: buildAiOcrSheet(image, regions), ...crops });
    };
    image.onerror = () => reject(new Error("画像を変換できませんでした"));
    image.src = dataUrl;
  });
}

function buildAiOcrRegions(image) {
  const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
  const hasPhoneChrome = aspect < 0.58;
  const gameTop = hasPhoneChrome ? 0.07 : 0;
  const gameHeight = hasPhoneChrome ? 0.85 : 1;
  const region = (key, label, x, y, w, h, scale = 2.4, maxWidth = 1500, maxHeight = 900) => ({
    key,
    label,
    x,
    y: gameTop + y * gameHeight,
    w,
    h: h * gameHeight,
    scale,
    maxWidth,
    maxHeight,
  });
  const absoluteRegion = (key, label, x, y, w, h, scale = 2.4, maxWidth = 1500, maxHeight = 900) => ({
    key,
    label,
    x,
    y,
    w,
    h,
    scale,
    maxWidth,
    maxHeight,
  });
  const stageRegion = hasPhoneChrome
    ? region("stage", "stage label", 0.58, 0.055, 0.4, 0.06, 5, 900, 260)
    : absoluteRegion("stage", "stage label", 0.57, 0, 0.43, 0.085, 5, 1000, 280);
  const playerStart = hasPhoneChrome ? 0.58 : 0.625;
  const playerHeight = hasPhoneChrome ? 0.34 : 0.35;
  const lowerPlayerStart = hasPhoneChrome ? 0.72 : 0.69;
  return [
    region("summary", "stage/time/mode", 0, 0, 1, 0.2, 2.4, 1500, 520),
    stageRegion,
    region("weapons", "shift weapon icons", 0.13, 0.08, 0.66, 0.18, 4, 1300, 500),
    region("team", "team totals", 0, 0.18, 1, 0.22, 2.6, 1500, 620),
    region("teamLeft", "team egg totals", 0, 0.18, 0.53, 0.17, 3.2, 1000, 540),
    region("waves", "wave cards top", 0, 0.34, 1, 0.25, 2.8, 1500, 700),
    region("wavesLower", "wave cards lower", 0, 0.50, 1, 0.28, 2.8, 1500, 780),
    region("waveNumbers", "wave delivered numbers", 0, 0.365, 1, 0.11, 3.4, 1500, 360),
    region("waveNumbersLower", "contest wave delivered numbers", 0, 0.575, 1, 0.12, 3.4, 1500, 420),
    region("players", "player rows", 0, playerStart, 1, playerHeight, 2.5, 1500, 1000),
    region("playersLower", "contest player rows", 0, lowerPlayerStart, 1, 0.22, 2.8, 1500, 760),
    region("bosses", "player boss counts", 0, playerStart, 0.55, playerHeight, 3.1, 900, 1000),
    region("bossesLower", "contest player boss counts", 0, lowerPlayerStart, 0.55, 0.22, 3.3, 900, 760),
    region("playerStats", "player egg counts", 0.56, playerStart, 0.44, playerHeight, 3.1, 900, 1000),
    region("playerStatsLower", "contest player egg counts", 0.56, lowerPlayerStart, 0.44, 0.22, 3.3, 900, 760),
  ];
}

function buildAiOcrSheet(image, regions) {
  const importantRegions = [
    ["summary", "SUMMARY"],
    ["stage", "STAGE_LABEL"],
    ["weapons", "SHIFT_WEAPONS"],
    ["teamLeft", "TEAM_TOTALS"],
    ["waves", "WAVES_TOP"],
    ["wavesLower", "WAVES_LOWER"],
    ["players", "PLAYER_ROWS"],
  ]
    .map(([key, label]) => ({ ...regions.find((region) => region.key === key), label }))
    .filter((region) => region.key);
  const width = 1400;
  const padding = 18;
  const labelHeight = 34;
  const targetHeights = {
    SUMMARY: 210,
    STAGE_LABEL: 120,
    TEAM_TOTALS: 240,
    WAVES_TOP: 320,
    WAVES_LOWER: 320,
    PLAYER_ROWS: 520,
  };
  const panels = importantRegions.map((region) => ({
    region,
    height: targetHeights[region.label] || 260,
  }));
  const height = panels.reduce((sum, panel) => sum + labelHeight + panel.height + padding, padding);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return image.src;
  context.fillStyle = "#0b0f14";
  context.fillRect(0, 0, width, height);
  context.font = "700 24px system-ui, sans-serif";
  context.textBaseline = "top";
  let y = padding;
  panels.forEach(({ region, height: panelHeight }) => {
    context.fillStyle = "#5cead8";
    context.fillText(region.label, padding, y);
    y += labelHeight;
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const sx = Math.round(sourceWidth * region.x);
    const sy = Math.round(sourceHeight * region.y);
    const sw = Math.round(sourceWidth * region.w);
    const sh = Math.round(sourceHeight * region.h);
    context.save();
    context.filter = "contrast(1.28) saturate(1.04)";
    context.drawImage(image, sx, sy, sw, sh, padding, y, width - padding * 2, panelHeight);
    context.restore();
    y += panelHeight + padding;
  });
  return canvas.toDataURL("image/jpeg", 0.95);
}

function cropImageRegion(image, region) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sx = Math.round(sourceWidth * region.x);
  const sy = Math.round(sourceHeight * region.y);
  const sw = Math.round(sourceWidth * region.w);
  const sh = Math.round(sourceHeight * region.h);
  const scale = Math.max(1, Math.min(region.scale || 2, (region.maxWidth || 1500) / sw, (region.maxHeight || 900) / sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw * scale);
  canvas.height = Math.max(1, sh * scale);
  const context = canvas.getContext("2d");
  if (!context) return { label: region.label, dataUrl: image.src };
  context.imageSmoothingEnabled = true;
  context.filter = "contrast(1.28) saturate(1.04)";
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { label: region.label, dataUrl: canvas.toDataURL("image/jpeg", 0.96) };
}

function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        resolve(await downscaleImageDataUrl(String(reader.result || "")));
      } catch {
        resolve(String(reader.result || ""));
      }
    };
    reader.onerror = () => reject(new Error("画像を読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

function downscaleImageDataUrl(dataUrl, maxSide = 1800) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      if (!longest || longest <= maxSide) {
        resolve(dataUrl);
        return;
      }
      const scale = maxSide / longest;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    image.onerror = () => reject(new Error("画像を変換できませんでした"));
    image.src = dataUrl;
  });
}

function normalizeSmartOcrResult(result, meta = {}) {
  const mode = String(result.mode || "").toUpperCase() === "CONTEST" ? "CONTEST" : "STANDARD";
  const counts = result.counts || {};
  const waveEggs = Array.isArray(result.waveEggs) ? result.waveEggs.map(numberFrom) : [];
  const stage = result.stage ? fullStageName(result.stage) : "";
  const dayNight = String(result.dayNight || "").includes("夜") ? NIGHT_INCLUDED : DAY_ONLY;
  const normalized = {
    provider: meta.provider || "gemini-vlm",
    model: String(meta.model || result.model || "").trim(),
    attempts: numberFrom(meta.attempts || result.attempts),
    modelAttempts: Array.isArray(meta.modelAttempts) ? meta.modelAttempts : [],
    mode,
    stage,
    round: String(result.round || ""),
    stampedAt: normalizeOcrDateTime(result.stampedAt || result.datetime || ""),
    dayNight,
    waveEggs,
    weapons: normalizeOcrWeapons(result.weapons),
    weaponSource: String(result.weaponSource || result.weaponsSource || "").trim(),
    counts: {
      totalEggs: numberFrom(counts.totalEggs ?? result.totalEggs),
      myEggs: numberFrom(counts.myEggs ?? result.myEggs),
      myKills: numberFrom(counts.myKills ?? result.myKills),
      p2Kills: numberFrom(counts.p2Kills ?? result.p2Kills),
      p3Kills: numberFrom(counts.p3Kills ?? result.p3Kills),
      p4Kills: numberFrom(counts.p4Kills ?? result.p4Kills),
      totalRed: numberFrom(counts.totalRed ?? result.totalRed),
      myRed: numberFrom(counts.myRed ?? result.myRed),
      w1: numberFrom(counts.w1 ?? waveEggs[0]),
      w2: numberFrom(counts.w2 ?? waveEggs[1]),
      w3: numberFrom(counts.w3 ?? waveEggs[2]),
      w4: numberFrom(counts.w4 ?? waveEggs[3]),
      w5: numberFrom(counts.w5 ?? waveEggs[4]),
    },
    warnings: normalizeOcrWarnings(Array.isArray(result.warnings) ? result.warnings.map(String) : []),
  };
  const expectedWaves = mode === "CONTEST" ? 5 : 3;
  const waveTotal = waveEggs.slice(0, expectedWaves).reduce((sum, value) => sum + value, 0);
  if (!normalized.counts.totalEggs && waveEggs.length >= expectedWaves && waveTotal > 0) {
    normalized.counts.totalEggs = waveTotal;
  } else if (!normalized.counts.totalEggs) {
    normalized.counts.totalEggs = waveTotal;
  }
  normalized.warnings = ocrWarningsFromNormalized(normalized);
  return normalized;
}

function normalizeOcrWarnings(warnings = []) {
  return [...new Set(warnings.map(shortOcrWarning).filter(Boolean))];
}

function normalizeOcrWeapons(weapons = []) {
  const values = Array.isArray(weapons) ? weapons : [];
  return values
    .map((weapon) => String(weapon || "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function shortOcrWarning(warning = "") {
  const text = String(warning || "").trim();
  if (!text) return "";
  if (/4006|neurons|daily free allocation|quota|limit/i.test(text)) return "VLM上限";
  if (/cropped|hidden|crop|欠け|隠れ/i.test(text)) return "画像欠け";
  if (/row|player|行|プレイヤー/i.test(text)) return "行確認";
  if (/Wave合計|wave/i.test(text)) return "Wave確認";
  if (/stage|ステージ/i.test(text)) return "ステージ";
  if (/weapon|ブキ|武器/i.test(text)) return "ブキ";
  if (/time|日時|時刻/i.test(text)) return "時刻";
  if (/egg|納品/i.test(text)) return "納品数";
  if (/kill|処理/i.test(text)) return "処理数";
  if (/red|赤イクラ/i.test(text)) return "赤イクラ";
  if (/style|プレイスタイル/i.test(text)) return "";
  if (/round|開催/i.test(text)) return "開催回";
  if (/主要項目|必須/i.test(text)) return "要確認";
  return text.length <= 8 ? text : "要確認";
}

function normalizeOcrDateTime(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value))) return String(value);
  return datetimeLocal(parseDate(value));
}

function parseBattleScreenshotText(text) {
  const normalized = normalizeOcrText(text);
  const compact = compactOcrText(normalized);
  const waveEggs = extractWaveEggs(normalized);
  const mode = inferOcrMode(compact, waveEggs);
  const stage = inferOcrStage(compact);
  const stampedAt = extractOcrTimestamp(normalized);
  const xNumbers = extractXNumbers(normalized);
  const expectedWaves = mode === "CONTEST" ? 5 : 3;
  const waveTotal = waveEggs.slice(0, expectedWaves).reduce((sum, value) => sum + value, 0);
  const hasEnoughWaves = waveEggs.length >= expectedWaves;
  const totalEggs = hasEnoughWaves ? waveTotal : 0;
  const playerRows = extractPlayerRowsFromLabels(normalized, totalEggs);
  const bossCounts = playerRows.length >= 4
    ? playerRows.map((row) => row.myKills)
    : extractBossCounts(normalized);
  const hasAllPlayerRows = bossCounts.length >= 4;
  const firstPlayer = playerRows[0]?.myKills
    ? { myEggs: playerRows[0].myEggs, myRed: playerRows[0].myRed }
    : (hasAllPlayerRows ? extractFirstPlayerStats(normalized, bossCounts, totalEggs) : { myEggs: 0, myRed: 0 });
  let totalRed = inferTotalRed(xNumbers);
  if (firstPlayer.myRed && totalRed === firstPlayer.myRed) {
    totalRed = 0;
  }

  return {
    mode,
    stage,
    stampedAt,
    dayNight: inferOcrDayNight(compact),
    waveEggs,
    counts: {
      totalEggs,
      myEggs: firstPlayer.myEggs,
      myKills: hasAllPlayerRows ? bossCounts[0] || 0 : 0,
      p2Kills: hasAllPlayerRows ? bossCounts[1] || 0 : 0,
      p3Kills: hasAllPlayerRows ? bossCounts[2] || 0 : 0,
      p4Kills: hasAllPlayerRows ? bossCounts[3] || 0 : 0,
      totalRed,
      myRed: firstPlayer.myRed,
      w1: waveEggs[0] || 0,
      w2: waveEggs[1] || 0,
      w3: waveEggs[2] || 0,
      w4: waveEggs[3] || 0,
      w5: waveEggs[4] || 0,
    },
    provider: "browser-ocr",
    warnings: ocrWarnings({ mode, stage, stampedAt, totalEggs, firstPlayer, bossCounts, waveEggs }),
  };
}

function normalizeOcrText(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[×✕]/g, "x")
    .replace(/[／]/g, "/")
    .replace(/[：]/g, ":")
    .replace(/[|]/g, "1");
}

function compactOcrText(text) {
  return normalizeOcrText(text).replace(/\s+/g, "");
}

function inferOcrMode(compactText, waveEggs) {
  if (
    compactText.includes("バイトチームコンテスト")
    || compactText.includes("チームコンテスト")
    || compactText.includes("コンテスト")
    || waveEggs.length >= 5
  ) {
    return "CONTEST";
  }
  return "STANDARD";
}

function inferOcrStage(compactText) {
  const match = OCR_STAGE_PATTERNS.find((item) => item.keys.some((key) => compactText.includes(key)));
  return match?.stage || "";
}

function inferOcrDayNight(compactText) {
  if (compactText.includes("EX") && compactText.includes("WAVE")) return NIGHT_INCLUDED;
  return OCR_NIGHT_KEYWORDS.some((keyword) => compactText.includes(compactOcrText(keyword)))
    ? NIGHT_INCLUDED
    : DAY_ONLY;
}

function extractOcrTimestamp(text) {
  const match = normalizeOcrText(text).match(
    /(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})[^\d]{0,8}(\d{1,2})[:](\d{2})/,
  );
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

function extractWaveEggs(text) {
  const byWave = new Map();
  const seen = new Set();
  const addRatio = (delivered, quota, wave = 0) => {
    const key = `${delivered}/${quota}`;
    if (
      delivered >= 10
      && delivered <= 300
      && quota >= 10
      && quota <= 120
      && !seen.has(key)
    ) {
      if (wave) {
        byWave.set(wave, Math.max(byWave.get(wave) || 0, delivered));
      }
      seen.add(key);
    }
  };
  const normalized = normalizeOcrText(text);
  for (const match of normalized.matchAll(/WAVE\s*([1-5])\D{0,16}?(\d{1,3})\s*\/\s*(\d{1,3})/gi)) {
    addRatio(Number(match[2]), Number(match[3]), Number(match[1]));
  }
  if (byWave.size) {
    return [...byWave.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value)
      .slice(0, 5);
  }

  const ratios = [];
  const withoutDates = normalized.replace(/20\d{2}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2}/g, " ");
  for (const match of withoutDates.matchAll(/(\d{1,3})\s*\/\s*(\d{1,3})/g)) {
    const delivered = Number(match[1]);
    const quota = Number(match[2]);
    const key = `${delivered}/${quota}`;
    if (
      delivered >= 10
      && delivered <= 300
      && quota >= 10
      && quota <= 120
      && !seen.has(key)
    ) {
      ratios.push(delivered);
      seen.add(key);
    }
  }
  return ratios.slice(0, 5);
}

function extractBossCounts(text) {
  const compact = compactOcrText(text);
  const counts = [];
  for (const match of compact.matchAll(/オオモノ(?:シャケ)?[^\d]{0,12}x?\s*(\d{1,3})/g)) {
    const value = Number(match[1]);
    if (value > 0 && value <= 80) counts.push(value);
  }
  return counts.slice(0, 4);
}

function extractPlayerRowsFromLabels(text, totalEggs) {
  const rows = [];
  for (let index = 1; index <= 4; index += 1) {
    const section = extractLabeledSection(text, `PLAYER_ROW_${index}`);
    if (!section) continue;
    const values = extractXNumbers(section);
    const myKills = values.find((value) => value > 0 && value <= 80) || 0;
    const myRed = values.filter((value) => value >= 300).sort((a, b) => b - a)[0] || 0;
    const maxEggs = Math.max(totalEggs || 0, 120);
    const myEggs = values
      .filter((value) => value > 0 && value !== myKills && value <= maxEggs)
      .sort((a, b) => b - a)[0] || 0;
    rows.push({ myKills, myEggs, myRed });
  }
  return rows;
}

function extractLabeledSection(text, label) {
  const source = normalizeOcrText(text);
  const marker = `[${label}]`;
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const contentStart = start + marker.length;
  const next = source.slice(contentStart).search(/\n\[[^\]\n]+\]/);
  return next === -1 ? source.slice(contentStart) : source.slice(contentStart, contentStart + next);
}

function extractXNumbers(text) {
  const numbers = [];
  for (const match of normalizeOcrText(text).matchAll(/[xX]\s*(\d{1,5})/g)) {
    numbers.push(Number(match[1]));
  }
  return numbers.filter((value) => Number.isFinite(value));
}

function inferTotalEggs(xNumbers) {
  return xNumbers.find((value) => value >= 50 && value <= 300) || 0;
}

function inferTotalRed(xNumbers) {
  return xNumbers.filter((value) => value >= 300).sort((a, b) => b - a)[0] || 0;
}

function extractFirstPlayerStats(text, bossCounts, totalEggs) {
  const compact = compactOcrText(text);
  const bossMatches = [...compact.matchAll(/オオモノ.{0,12}?x\s*(\d{1,3})/g)];
  if (!bossMatches.length) return { myEggs: 0, myRed: 0 };
  const start = bossMatches[0] ? bossMatches[0].index + bossMatches[0][0].length : 0;
  const end = bossMatches[1]?.index || compact.length;
  const segment = compact.slice(start, end);
  const values = extractXNumbers(segment);
  const myKills = bossCounts[0] || 0;
  const maxEggs = Math.max(totalEggs || 0, 120);
  const myEggs = values
    .filter((value) => value > 0 && value !== myKills && value <= maxEggs)
    .sort((a, b) => b - a)[0] || 0;
  const myRed = values.filter((value) => value >= 300).sort((a, b) => b - a)[0] || 0;
  return { myEggs, myRed };
}

function ocrWarnings(result) {
  const warnings = [];
  if (!result.stage) warnings.push("ステージ");
  if (!result.stampedAt) warnings.push("時刻");
  if (!result.totalEggs) warnings.push("納品数");
  if (!result.firstPlayer.myEggs || !result.firstPlayer.myRed) warnings.push("自分の数値");
  if (result.bossCounts.length < 4) warnings.push("処理数");
  if (result.mode === "CONTEST") warnings.push("開催回");
  return [...new Set(warnings)];
}

function ocrWarningsFromNormalized(result) {
  const warnings = [];
  if (!result.stage) warnings.push("ステージ");
  if (!result.stampedAt) warnings.push("時刻");
  if (!result.counts.totalEggs) warnings.push("納品数");
  if (!result.counts.myEggs || !result.counts.myRed) warnings.push("自分の数値");
  if (!Array.isArray(result.weapons) || result.weapons.length < 4) warnings.push("ブキ");
  if ([result.counts.myKills, result.counts.p2Kills, result.counts.p3Kills, result.counts.p4Kills].some((value) => !value)) {
    warnings.push("処理数");
  }
  if (result.mode === "CONTEST") warnings.push("開催回");
  return normalizeOcrWarnings([...(result.warnings || []), ...warnings]);
}

function applyOcrResult(result) {
  const mode = result.mode === "CONTEST" ? "CONTEST" : "STANDARD";
  const form = elements.ocrForm;
  activateView("ocr");
  clearOcrFields(form, mode);
  const fallbackStage = mode === "STANDARD" && !result.stage ? inferStageFromConfiguredShift(result) : "";
  if (fallbackStage) {
    result.stage = fallbackStage;
    result.warnings = normalizeOcrWarnings([...(result.warnings || []), "ステージ推定"]);
  }
  state.ocrWarnings = Array.isArray(result.warnings) ? [...result.warnings] : [];
  state.ocrWeapons = normalizeOcrWeapons(result.weapons);

  elements.ocrMode.value = mode;
  syncOcrModeUi();
  elements.ocrStageSelect.value = "";
  if (result.stage) elements.ocrStageSelect.value = fullStageName(result.stage);
  if (form.elements.playStyle) form.elements.playStyle.value = "";
  if (mode === "CONTEST" && result.round) elements.ocrRound.value = result.round;
  elements.ocrDayNight.value = result.dayNight === NIGHT_INCLUDED ? NIGHT_INCLUDED : DAY_ONLY;

  fillNumber(form, "totalEggs", result.counts.totalEggs);
  fillNumber(form, "myEggs", result.counts.myEggs);
  fillNumber(form, "myKills", result.counts.myKills);
  fillNumber(form, "p2Kills", result.counts.p2Kills);
  fillNumber(form, "p3Kills", result.counts.p3Kills);
  fillNumber(form, "p4Kills", result.counts.p4Kills);
  fillNumber(form, "totalRed", result.counts.totalRed);
  fillNumber(form, "myRed", result.counts.myRed);
  const appliedWeapons = applyOcrWeaponsToShift(result);

  if (form.elements.stampedAt) {
    form.elements.stampedAt.value = datetimeLocal(new Date());
  }

  if (mode === "CONTEST") {
    [1, 2, 3, 4, 5].forEach((wave) => fillNumber(form, `w${wave}`, result.counts[`w${wave}`]));
  }

  renderPreview(form, elements.ocrPreview);
  markOcrWarnings(result);
  if (appliedWeapons) toast("ブキをシフトに反映しました");
}

function applyOcrWeaponsToShift(result) {
  const weapons = normalizeOcrWeapons(result.weapons);
  const weaponSource = String(result.weaponSource || "").toLowerCase();
  const hasTrustedWeapons = ["schedule", "known_rotation", "local_match", "feedback", "manual"].includes(weaponSource)
    && weapons.length === 4
    && !hasOcrWeaponWarning(result.warnings);
  if (!hasTrustedWeapons) {
    clearShiftWeaponsAfterOcr(result);
    return false;
  }
  state.config = normalizeConfig({
    ...state.config,
    stage: result.stage || state.config.stage,
    weapons,
    last_setup_at: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config));
  renderConfig();
  api("/api/config", {
    method: "POST",
    body: JSON.stringify({
      start_time: state.config.start_time || "",
      end_time: state.config.end_time || "",
      expire_at: state.config.expire_at || state.config.end_time || "",
      stage: state.config.stage || DEFAULT_CONFIG.stage,
      weapons,
    }),
  })
    .then((config) => {
      state.config = normalizeConfig(config);
      localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config));
      renderConfig();
    })
    .catch(() => {});
  return true;
}

function clearShiftWeaponsAfterOcr(result = {}) {
  const weapons = ["", "", "", ""];
  state.config = normalizeConfig({
    ...state.config,
    stage: result.stage || state.config.stage,
    weapons,
    last_setup_at: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config));
  renderConfig();
  api("/api/config", {
    method: "POST",
    body: JSON.stringify({
      start_time: state.config.start_time || "",
      end_time: state.config.end_time || "",
      expire_at: state.config.expire_at || state.config.end_time || "",
      stage: state.config.stage || DEFAULT_CONFIG.stage,
      weapons,
    }),
  })
    .then((config) => {
      state.config = normalizeConfig(config);
      localStorage.setItem(STORAGE_CONFIG, JSON.stringify(state.config));
      renderConfig();
    })
    .catch(() => {});
}

function hasOcrWeaponWarning(warnings = []) {
  return normalizeOcrWarnings(warnings).some((warning) => warning.includes("ブキ"));
}

function fillNumber(form, name, value) {
  const input = form.elements[name];
  if (!input || !Number.isFinite(value) || value <= 0) return;
  input.value = String(Math.round(value));
}

function clearOcrFields(form, mode) {
  [
    "totalEggs",
    "myEggs",
    "myKills",
    "p2Kills",
    "p3Kills",
    "p4Kills",
    "totalRed",
    "myRed",
    "w1",
    "w2",
    "w3",
    "w4",
    "w5",
  ].forEach((name) => {
    if (form.elements[name]) form.elements[name].value = "";
  });
  if (form.elements.stampedAt) {
    form.elements.stampedAt.value = "";
  }
  if (form.elements.notes) {
    form.elements.notes.value = "";
  }
  if (form === elements.ocrForm && form.elements.playStyle) {
    form.elements.playStyle.value = "";
  }
  if (form === elements.ocrForm) {
    state.ocrWarnings = [];
  }
  if (mode === "STANDARD" && form === elements.standardForm) setStandardDayNightValue(DAY_ONLY);
  $$("input, select, textarea", form).forEach((field) => field.classList.remove("needs-check"));
}

function setStandardDayNightValue(value) {
  const target = value === NIGHT_INCLUDED ? NIGHT_INCLUDED : DAY_ONLY;
  $$("input[name='dayNight']", elements.standardForm).forEach((input) => {
    input.checked = input.value === target;
  });
}

function inferStageFromConfiguredShift(result) {
  const stage = fullStageName(state.config?.stage || "");
  if (!stage || stage === DEFAULT_CONFIG.stage && !state.config?.stage) return "";
  const battleTime = Date.parse(result.stampedAt || "");
  const startTime = Date.parse(state.config?.start_time || "");
  const endTime = Date.parse(state.config?.end_time || "");
  if (!Number.isFinite(battleTime) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return "";
  const margin = 15 * 60 * 1000;
  return battleTime >= startTime - margin && battleTime <= endTime + margin ? stage : "";
}

function markOcrWarnings(result) {
  const labels = [];
  const warnings = normalizeOcrWarnings(result.warnings || []);
  if (warnings.includes("時刻")) labels.push("時刻");
  if (warnings.includes("納品数")) labels.push("全体納品");
  if (warnings.includes("赤イクラ")) labels.push("全体赤イクラ", "個人赤イクラ");
  if (warnings.includes("行確認")) labels.push("処理数");
  if (warnings.includes("処理数")) labels.push("処理数");
  if (warnings.includes("ステージ")) labels.push("ステージ");
  if (warnings.includes("開催回")) labels.push("開催回");
  highlightMissingOcrFields(labels);
}

function syncOcrModeUi() {
  const isContest = elements.ocrMode.value === "CONTEST";
  $$(".ocr-standard-only", elements.ocrForm).forEach((item) => {
    item.hidden = isContest;
  });
  $$(".ocr-contest-only", elements.ocrForm).forEach((item) => {
    item.hidden = !isContest;
  });
  elements.ocrDayNight.disabled = isContest;
  elements.ocrApplyButton.textContent = isContest ? "コンテストへ反映" : "通常へ反映";
}

function copyOcrToEntryForm() {
  const mode = elements.ocrMode.value === "CONTEST" ? "CONTEST" : "STANDARD";
  const source = elements.ocrForm;
  const target = mode === "CONTEST" ? elements.contestForm : elements.standardForm;
  clearOcrFields(target, mode);

  [
    "totalEggs",
    "myEggs",
    "myKills",
    "p2Kills",
    "p3Kills",
    "p4Kills",
    "totalRed",
    "myRed",
    "w1",
    "w2",
    "w3",
    "w4",
    "w5",
  ].forEach((name) => {
    if (source.elements[name] && target.elements[name]) {
      target.elements[name].value = source.elements[name].value;
    }
  });

  if (target.elements.stampedAt && source.elements.stampedAt) {
    target.elements.stampedAt.value = source.elements.stampedAt.value;
  }
  if (target.elements.notes && source.elements.notes) {
    target.elements.notes.value = source.elements.notes.value;
  }

  if (mode === "STANDARD") {
    state.config = normalizeConfig({ ...state.config, stage: elements.ocrStageSelect.value });
    renderConfig();
    if (target.elements.playStyle) target.elements.playStyle.value = source.elements.playStyle.value;
    setStandardDayNightValue(elements.ocrDayNight.value);
  } else {
    if (target.elements.stage) target.elements.stage.value = elements.ocrStageSelect.value;
    elements.contestRound.value = elements.ocrRound.value;
  }

  renderPreview(target, mode === "CONTEST" ? elements.contestPreview : elements.standardPreview);
  activateView(mode === "CONTEST" ? "contest" : "standard");
  toast("フォームへ反映しました");
}

function renderOcrResult(result) {
  const modeLabel = result.mode === "CONTEST" ? "コンテスト" : "通常";
  const warningText = formatOcrWarningSummary(result.warnings || []);
  const weaponWarning = result.weapons?.length !== 4 || normalizeOcrWarnings(result.warnings || []).includes("ブキ");
  const chips = [
    ocrChip("モデル", displayGeminiModelName(result.model) || "Gemini VLM"),
    ocrChip("種別", modeLabel),
    ocrChip("ステージ", result.stage || "未読取", !result.stage),
    ocrChip(weaponChipLabel(result.weaponSource), result.weapons?.length === 4 ? result.weapons.join(" / ") : "手動入力", weaponWarning),
    ocrChip("時刻", result.stampedAt ? result.stampedAt.replace("T", " ") : "未読取", !result.stampedAt),
    ocrChip("納品", result.counts.totalEggs || "未読取", !result.counts.totalEggs),
    ocrChip("自分", result.counts.myEggs || "未読取", !result.counts.myEggs),
    ocrChip("処理", [result.counts.myKills, result.counts.p2Kills, result.counts.p3Kills, result.counts.p4Kills].filter(Boolean).join(" / ") || "未読取", result.warnings.includes("処理数")),
    ocrChip("赤イクラ", result.counts.myRed && result.counts.totalRed ? `${result.counts.myRed} / ${result.counts.totalRed}` : "未読取", !result.counts.myRed || !result.counts.totalRed),
    ocrChip("確認", warningText || "OK", Boolean(warningText)),
  ];
  if (result.mode === "STANDARD") {
    chips.splice(3, 0, ocrChip("条件", result.dayNight));
  } else {
    chips.splice(3, 0, ocrChip("開催回", result.round || "手動選択", !result.round));
    chips.splice(5, 0, ocrChip("Wave", result.waveEggs.slice(0, 5).join(" / ") || "未読取", result.waveEggs.length < 5));
  }
  const attemptPath = modelAttemptPath(result.modelAttempts);
  if (attemptPath && attemptPath !== displayGeminiModelName(result.model)) {
    chips.splice(1, 0, ocrChip("経路", attemptPath));
  }
  state.lastOcrResult = result;
  elements.ocrResult.innerHTML = ocrWeaponRowHtml(result) + chips.join("");
  elements.ocrResult.hidden = false;
  ensureOcrWeaponEditing();
}

function weaponChipLabel(source = "") {
  if (source === "local_match") return "ブキ・検出器";
  if (source === "random") return "ブキ・ランダム";
  if (source === "schedule") return "ブキ・予定表";
  if (source === "known_rotation") return "ブキ・確定";
  if (source === "feedback") return "ブキ・修正履歴";
  if (source === "manual") return "ブキ・手動修正";
  if (source === "vlm") return "ブキ・Gemini";
  return "ブキ";
}

function weaponSourceDescription(source = "") {
  if (source === "local_match") return "判定元: 画像内のブキアイコンを検出器で読み取りました。";
  if (source === "random") return "判定元: 画像内のランダム表示を検出しました。";
  if (source === "schedule") return "判定元: 現在のシフト予定表から自動入力しました。";
  if (source === "known_rotation") return "判定元: 保存済みの確定ローテーションから入力しました。";
  if (source === "feedback") return "判定元: 以前の手動修正をこの画像に反映しました。";
  if (source === "manual") return "判定元: ユーザーが手動で修正しました。";
  if (source === "vlm") return "判定元: Geminiの画像読み取りです。間違っている場合があります。";
  return "判定元: 未確定です。";
}

// --- 1-tap weapon correction -------------------------------------------------
// The supply weapons are shown as tappable icons. Trusted sources (schedule /
// known rotation) read quiet; an uncertain VLM read is flagged. Tapping any
// slot opens a searchable picker; the correction updates the form + shift and
// is captured locally so wrong reads become future training data.
function ocrWeaponRowHtml(result) {
  const source = String(result.weaponSource || "").toLowerCase();
  const trusted = ["schedule", "known_rotation", "manual", "feedback", "local_match", "random"].includes(source);
  const weapons = Array.isArray(result.weapons) ? result.weapons.slice(0, 4) : [];
  let slots = "";
  for (let index = 0; index < 4; index += 1) {
    const name = weapons[index] || "";
    const weapon = name ? resolveWeaponIcon(name) : null;
    const label = weapon?.nameJa || name || "未選択";
    const art = weapon?.icon
      ? `<img src="${escapeHtml(weapon.icon)}" alt="" loading="lazy" decoding="async" />`
      : `<span class="ocr-weapon-q">${name ? escapeHtml(name.slice(0, 1)) : "？"}</span>`;
    slots += `
      <button type="button" class="ocr-weapon-slot${name ? "" : " empty"}" data-weapon-slot="${index}" title="${escapeHtml(label)}・タップで修正">
        <span class="ocr-weapon-art">${art}</span>
        <span class="ocr-weapon-name">${escapeHtml(name ? label : "選択")}</span>
      </button>
    `;
  }
  const badge = trusted
    ? `<span class="ocr-weapon-badge ok">${escapeHtml(weaponChipLabel(source))}</span>`
    : `<span class="ocr-weapon-badge warn">要確認・タップで修正</span>`;
  return `
    <div class="ocr-weapon-row" role="group" aria-label="支給ブキ">
      <div class="ocr-weapon-head">
        ${badge}
        <span class="ocr-weapon-source">${escapeHtml(weaponSourceDescription(source))}</span>
      </div>
      <div class="ocr-weapon-slots">${slots}</div>
      <p class="ocr-weapon-help">ブキが違う場合は、各アイコンをタップして正しいブキに修正してください。同じ画像には次回から修正を反映し、修正フィードバックは今後の学習・検出精度改善にも役立ちます。ご協力お願いします。</p>
    </div>
  `;
}

function ensureOcrWeaponEditing() {
  if (elements.ocrResult.dataset.weaponEditBound === "1") return;
  elements.ocrResult.dataset.weaponEditBound = "1";
  elements.ocrResult.addEventListener("click", (event) => {
    const slot = event.target.closest("[data-weapon-slot]");
    if (!slot) return;
    openWeaponPicker(Number(slot.dataset.weaponSlot));
  });
}

function closeDialogElement(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function buildWeaponPickerDialog() {
  if (state.weaponPickerDialog) return state.weaponPickerDialog;
  const dialog = document.createElement("dialog");
  dialog.className = "weapon-picker";
  dialog.innerHTML = `
    <div class="weapon-picker-head">
      <input type="search" class="weapon-picker-search" placeholder="ブキを検索…" autocomplete="off" />
      <button type="button" class="weapon-picker-close" aria-label="閉じる">✕</button>
    </div>
    <div class="weapon-picker-grid"></div>
  `;
  dialog.querySelector(".weapon-picker-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-weapon-name]");
    if (!button) return;
    applyWeaponCorrection(Number(dialog.dataset.slot), button.dataset.weaponName);
    closeDialogElement(dialog);
  });
  dialog.querySelector(".weapon-picker-close").addEventListener("click", () => closeDialogElement(dialog));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialogElement(dialog);
  });
  dialog.querySelector(".weapon-picker-search").addEventListener("input", (event) => {
    filterWeaponPicker(dialog, event.target.value);
  });
  document.body.append(dialog);
  state.weaponPickerDialog = dialog;
  return dialog;
}

function openWeaponPicker(slot) {
  if (!Number.isInteger(slot)) return;
  const dialog = buildWeaponPickerDialog();
  dialog.dataset.slot = String(slot);
  const search = dialog.querySelector(".weapon-picker-search");
  search.value = "";
  filterWeaponPicker(dialog, "");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  search.focus();
}

function filterWeaponPicker(dialog, query) {
  const grid = dialog.querySelector(".weapon-picker-grid");
  const needle = String(query || "").trim().toLowerCase();
  const weapons = (state.weaponManifest || []).filter((weapon) => {
    if (!needle) return true;
    const hay = `${weapon.nameJa || ""} ${weapon.nameEn || ""} ${weapon.key || ""}`.toLowerCase();
    return hay.includes(needle);
  });
  if (!weapons.length) {
    grid.innerHTML = `<p class="weapon-picker-empty">該当するブキがありません</p>`;
    return;
  }
  grid.innerHTML = weapons.map((weapon) => {
    const name = weapon.nameJa || weapon.key || "";
    const art = weapon.icon
      ? `<img src="${escapeHtml(weapon.icon)}" alt="" loading="lazy" decoding="async" />`
      : `<span class="ocr-weapon-q">${escapeHtml(name.slice(0, 1))}</span>`;
    return `
      <button type="button" class="weapon-pick" data-weapon-name="${escapeHtml(name)}" title="${escapeHtml(name)}">
        ${art}
        <span>${escapeHtml(name)}</span>
      </button>
    `;
  }).join("");
}

function applyWeaponCorrection(slot, weaponName) {
  const result = state.lastOcrResult;
  if (!result || !Number.isInteger(slot) || !weaponName) return;
  const weapons = Array.isArray(result.weapons) ? [...result.weapons] : [];
  while (weapons.length < 4) weapons.push("");
  if (!Array.isArray(result.detectedWeaponsBeforeCorrection) || result.detectedWeaponsBeforeCorrection.length !== 4) {
    result.detectedWeaponsBeforeCorrection = weapons.slice(0, 4);
    result.detectedWeaponSource = result.weaponSource || "";
  }
  const previous = weapons[slot] || "";
  if (previous === weaponName) return;
  const detectedWeapons = result.detectedWeaponsBeforeCorrection.slice(0, 4);
  const correctedWeapons = weapons.slice(0, 4);
  correctedWeapons[slot] = weaponName;
  recordWeaponCorrection(result, slot, previous, weaponName, correctedWeapons, detectedWeapons);
  weapons[slot] = weaponName;
  result.weapons = weapons.slice(0, 4);
  result.weaponSource = "manual";
  result.warnings = normalizeOcrWarnings((result.warnings || []).filter((warning) => !String(warning).includes("ブキ")));
  applyOcrResult(result);
  renderOcrResult(result);
  toast("ブキを修正しました");
}

function recordWeaponCorrection(result, slot, previous, corrected, correctedWeapons = [], detectedWeapons = []) {
  const feedback = {
    ts: new Date().toISOString(),
    slot,
    previous,
    corrected,
    correctedWeapons: correctedWeapons.slice(0, 4),
    detectedWeapons: detectedWeapons.slice(0, 4),
    source: result.detectedWeaponSource || result.weaponSource || "",
    stage: result.stage || "",
    stampedAt: result.stampedAt || "",
    mode: result.mode || "",
    provider: result.provider || "",
    model: result.model || "",
  };
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_WEAPON_CORRECTIONS) || "[]");
    list.push(feedback);
    localStorage.setItem(STORAGE_WEAPON_CORRECTIONS, JSON.stringify(list.slice(-500)));
  } catch {
    // Best-effort capture; a storage failure must never break the correction.
  }
  state.weaponFeedbackQueue = (state.weaponFeedbackQueue || Promise.resolve())
    .catch(() => {})
    .then(() => submitWeaponCorrectionFeedback(result, feedback))
    .catch((error) => {
      state.lastFeedbackSubmission = { ok: false, error: error.message || String(error) };
      toast("ブキ修正は画面に反映しましたが、フィードバック保存に失敗しました");
    });
}

async function submitWeaponCorrectionFeedback(result, feedback) {
  const images = state.lastOcrImages || {};
  if (!images.weapons) return;
  const response = await api("/api/weapon-feedback", {
    method: "POST",
    body: JSON.stringify({
      page: "ocr",
      clientId: currentClientId(),
      userAgent: navigator.userAgent || "",
      mode: result.mode || "",
      stage: result.stage || "",
      stampedAt: result.stampedAt || "",
      provider: result.provider || "",
      model: result.model || "",
      weaponSource: feedback.source || result.weaponSource || "",
      detectedWeapons: feedback.detectedWeapons,
      correctedWeapons: feedback.correctedWeapons,
      changedSlots: [{
        slot: feedback.slot + 1,
        previous: feedback.previous,
        corrected: feedback.corrected,
      }],
      images: {
        weapons: images.weapons,
        full: images.full || undefined,
      },
    }),
  });
  state.lastFeedbackSubmission = response;
  toast("ブキ修正を保存しました。同じ画像と今後の学習に反映されます");
}

function formatOcrWarningSummary(warnings = []) {
  const normalized = normalizeOcrWarnings(warnings);
  if (!normalized.length) return "";
  return normalized.slice(0, 3).join("・");
}

function ocrChip(label, value, warn = false) {
  return `
    <div class="ocr-chip ${warn ? "warn" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function showAccessDialog() {
  if (elements.accessDialog.open) return;
  elements.accessToken.value = localStorage.getItem(STORAGE_TOKEN) || "";
  if (typeof elements.accessDialog.showModal === "function") {
    elements.accessDialog.showModal();
  } else {
    elements.accessDialog.setAttribute("open", "");
  }
}

function closeAccessDialog() {
  if (typeof elements.accessDialog.close === "function") {
    elements.accessDialog.close();
  } else {
    elements.accessDialog.removeAttribute("open");
  }
}
