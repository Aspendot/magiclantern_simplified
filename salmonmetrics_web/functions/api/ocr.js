import { jsonResponse, requireToken } from "../_lib/salmonmetrics.js";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_FALLBACK_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const SCHEDULE_URL = "https://splatoon3.ink/data/schedules.json";
const DEFAULT_DETECTOR_URL = "https://salmonmetrics-detector-1067297744371.asia-northeast2.run.app";
const MAX_ATTEMPTS = 3;
const SAME_MODEL_BASE_DELAY_MS = 650;
const FALLBACK_DELAY_MS = 450;

const STAGES = [
  "アラマキ砦",
  "シェケナダム",
  "ムニ・エール海洋発電所",
  "難破船ドン・ブラコ",
  "すじこジャンクション跡",
  "トキシラズいぶし工房",
  "どんぴこ闘技場",
  "ビッグラン",
];

const BIG_RUN_VENUES = [
  "タラポートショッピングパーク",
  "スメーシーワールド",
  "海女美術大学",
  "マテガイ放水路",
  "ナンプラー遺跡",
  "ゴンズイ地区",
  "ヒラメが丘団地",
];

const WEAPONS = [
  "ボールドマーカー",
  "わかばシューター",
  "シャープマーカー",
  "プロモデラーMG",
  "スプラシューター",
  ".52ガロン",
  "N-ZAP85",
  "プライムシューター",
  ".96ガロン",
  "ジェットスイーパー",
  "スペースシューター",
  "L3リールガン",
  "H3リールガン",
  "ボトルガイザー",
  "カーボンローラー",
  "スプラローラー",
  "ダイナモローラー",
  "ヴァリアブルローラー",
  "ワイドローラー",
  "パブロ",
  "ホクサイ",
  "フィンセント",
  "スクイックリンα",
  "スプラチャージャー",
  "スプラスコープ",
  "リッター4K",
  "4Kスコープ",
  "14式竹筒銃・甲",
  "ソイチューバー",
  "R-PEN/5H",
  "バケットスロッシャー",
  "ヒッセン",
  "スクリュースロッシャー",
  "オーバーフロッシャー",
  "エクスプロッシャー",
  "モップリン",
  "スプラスピナー",
  "バレルスピナー",
  "ハイドラント",
  "クーゲルシュライバー",
  "ノーチラス47",
  "イグザミナー",
  "スパッタリー",
  "スプラマニューバー",
  "ケルビン525",
  "デュアルスイーパー",
  "クアッドホッパーブラック",
  "ガエンFF",
  "パラシェルター",
  "キャンピングシェルター",
  "スパイガジェット",
  "24式張替傘・甲",
  "ノヴァブラスター",
  "ホットブラスター",
  "ロングブラスター",
  "クラッシュブラスター",
  "ラピッドブラスター",
  "Rブラスターエリート",
  "S-BLAST92",
  "トライストリンガー",
  "LACT-450",
  "フルイドV",
  "ドライブワイパー",
  "ジムワイパー",
  "デンタルワイパーミント",
  "クマサン印のブラスター",
  "クマサン印のチャージャー",
  "クマサン印のスロッシャー",
  "クマサン印のシェルター",
  "クマサン印のストリンガー",
  "クマサン印のワイパー",
  "クマサン印のローラー",
  "クマサン印のマニューバー",
];

const WARNING_LABELS = [
  "ステージ確認",
  "時刻確認",
  "納品数確認",
  "自分確認",
  "処理数確認",
  "赤イクラ確認",
  "開催回確認",
  "ブキ確認",
  "画像確認",
  "AI確認",
];

const KNOWN_ROTATIONS = [
  {
    mode: "STANDARD",
    stage: "ムニ・エール海洋発電所",
    start: "2026-05-07T16:00",
    end: "2026-05-09T08:00",
    weapons: ["スパッタリー", "スプラローラー", "スプラマニューバー", "ジェットスイーパー"],
  },
  {
    mode: "STANDARD",
    stage: "トキシラズいぶし工房",
    start: "2026-05-20T17:00",
    end: "2026-05-22T09:00",
    weapons: ["LACT-450", "ドライブワイパー", "ロングブラスター", ".96ガロン"],
  },
];

const EN_STAGE_TO_JA = new Map([
  ["Sockeye Station", "アラマキ砦"],
  ["Spawning Grounds", "シェケナダム"],
  ["Gone Fission Hydroplant", "ムニ・エール海洋発電所"],
  ["Marooner's Bay", "難破船ドン・ブラコ"],
  ["Jammin' Salmon Junction", "すじこジャンクション跡"],
  ["Salmonid Smokeyard", "トキシラズいぶし工房"],
  ["Bonerattle Arena", "どんぴこ闘技場"],
]);

const EN_WEAPON_TO_JA = new Map([
  ["Sploosh-o-matic", "ボールドマーカー"],
  ["Splattershot Jr.", "わかばシューター"],
  ["Splash-o-matic", "シャープマーカー"],
  ["Aerospray MG", "プロモデラーMG"],
  ["Splattershot", "スプラシューター"],
  [".52 Gal", ".52ガロン"],
  ["N-ZAP '85", "N-ZAP85"],
  ["Splattershot Pro", "プライムシューター"],
  [".96 Gal", ".96ガロン"],
  ["Jet Squelcher", "ジェットスイーパー"],
  ["Splattershot Nova", "スペースシューター"],
  ["L-3 Nozzlenose", "L3リールガン"],
  ["H-3 Nozzlenose", "H3リールガン"],
  ["Squeezer", "ボトルガイザー"],
  ["Carbon Roller", "カーボンローラー"],
  ["Splat Roller", "スプラローラー"],
  ["Dynamo Roller", "ダイナモローラー"],
  ["Flingza Roller", "ヴァリアブルローラー"],
  ["Big Swig Roller", "ワイドローラー"],
  ["Inkbrush", "パブロ"],
  ["Octobrush", "ホクサイ"],
  ["Painbrush", "フィンセント"],
  ["Classic Squiffer", "スクイックリンα"],
  ["Splat Charger", "スプラチャージャー"],
  ["Splatterscope", "スプラスコープ"],
  ["E-liter 4K", "リッター4K"],
  ["E-liter 4K Scope", "4Kスコープ"],
  ["Bamboozler 14 Mk I", "14式竹筒銃・甲"],
  ["Goo Tuber", "ソイチューバー"],
  ["Snipewriter 5H", "R-PEN/5H"],
  ["Slosher", "バケットスロッシャー"],
  ["Tri-Slosher", "ヒッセン"],
  ["Sloshing Machine", "スクリュースロッシャー"],
  ["Bloblobber", "オーバーフロッシャー"],
  ["Explosher", "エクスプロッシャー"],
  ["Dread Wringer", "モップリン"],
  ["Mini Splatling", "スプラスピナー"],
  ["Heavy Splatling", "バレルスピナー"],
  ["Hydra Splatling", "ハイドラント"],
  ["Ballpoint Splatling", "クーゲルシュライバー"],
  ["Nautilus 47", "ノーチラス47"],
  ["Heavy Edit Splatling", "イグザミナー"],
  ["Dapple Dualies", "スパッタリー"],
  ["Splat Dualies", "スプラマニューバー"],
  ["Glooga Dualies", "ケルビン525"],
  ["Dualie Squelchers", "デュアルスイーパー"],
  ["Dark Tetra Dualies", "クアッドホッパーブラック"],
  ["Douser Dualies FF", "ガエンFF"],
  ["Splat Brella", "パラシェルター"],
  ["Tenta Brella", "キャンピングシェルター"],
  ["Undercover Brella", "スパイガジェット"],
  ["Recycled Brella 24 Mk I", "24式張替傘・甲"],
  ["Luna Blaster", "ノヴァブラスター"],
  ["Blaster", "ホットブラスター"],
  ["Range Blaster", "ロングブラスター"],
  ["Clash Blaster", "クラッシュブラスター"],
  ["Rapid Blaster", "ラピッドブラスター"],
  ["Rapid Blaster Pro", "Rブラスターエリート"],
  ["S-BLAST '92", "S-BLAST92"],
  ["S-BLAST 92", "S-BLAST92"],
  ["Tri-Stringer", "トライストリンガー"],
  ["REEF-LUX 450", "LACT-450"],
  ["Wellstring V", "フルイドV"],
  ["Splatana Wiper", "ドライブワイパー"],
  ["Splatana Stamper", "ジムワイパー"],
  ["Mint Decavitator", "デンタルワイパーミント"],
  ["Grizzco Blaster", "クマサン印のブラスター"],
  ["Grizzco Charger", "クマサン印のチャージャー"],
  ["Grizzco Slosher", "クマサン印のスロッシャー"],
  ["Grizzco Brella", "クマサン印のシェルター"],
  ["Grizzco Stringer", "クマサン印のストリンガー"],
  ["Grizzco Splatana", "クマサン印のワイパー"],
  ["Grizzco Roller", "クマサン印のローラー"],
  ["Grizzco Dualies", "クマサン印のマニューバー"],
  ["Random", "ランダム"],
  ["Random Gold", "ランダム"],
]);

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["STANDARD", "CONTEST"] },
    stage: { type: "string", enum: [...STAGES, ""] },
    round: { type: "string" },
    stampedAt: { type: "string" },
    dayNight: { type: "string", enum: ["昼のみ", "夜あり"] },
    waveEggs: {
      type: "array",
      items: { type: "integer" },
    },
    weapons: {
      type: "array",
      items: { type: "string", enum: [...WEAPONS, ""] },
    },
    counts: {
      type: "object",
      properties: {
        totalEggs: { type: "integer" },
        myEggs: { type: "integer" },
        myKills: { type: "integer" },
        p2Kills: { type: "integer" },
        p3Kills: { type: "integer" },
        p4Kills: { type: "integer" },
        totalRed: { type: "integer" },
        myRed: { type: "integer" },
        w1: { type: "integer" },
        w2: { type: "integer" },
        w3: { type: "integer" },
        w4: { type: "integer" },
        w5: { type: "integer" },
      },
      required: [
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
      ],
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["mode", "stage", "round", "stampedAt", "dayNight", "waveEggs", "weapons", "counts", "warnings"],
};

const VLM_PROMPT = `
あなたは Splatoon 3 サーモンランリザルト画像専用の Vision-Language Model です。
通常OCRではなく、画面レイアウト、Waveカード、プレイヤー行、アイコン、数字の位置関係を読んでください。

返答はJSONだけ。Markdown、説明文、コードフェンスは禁止。
値が見えない・隠れている・切れている場合は、文字列は ""、数値は 0 を返し、warnings に短い日本語ラベルを入れてください。
warnings はできるだけ次の短いラベルだけを使ってください:
ステージ確認, 時刻確認, 納品数確認, 自分確認, 処理数確認, 赤イクラ確認, 開催回確認, ブキ確認, 画像確認, AI確認

出力スキーマ:
{
  "mode": "STANDARD" | "CONTEST",
  "stage": "アラマキ砦" | "シェケナダム" | "ムニ・エール海洋発電所" | "難破船ドン・ブラコ" | "すじこジャンクション跡" | "トキシラズいぶし工房" | "どんぴこ闘技場" | "ビッグラン" | "",
  "round": "",
  "stampedAt": "YYYY-MM-DDTHH:mm",
  "dayNight": "昼のみ" | "夜あり",
  "waveEggs": [number],
  "weapons": ["ブキ1", "ブキ2", "ブキ3", "ブキ4"],
  "counts": {
    "totalEggs": number,
    "myEggs": number,
    "myKills": number,
    "p2Kills": number,
    "p3Kills": number,
    "p4Kills": number,
    "totalRed": number,
    "myRed": number,
    "w1": number,
    "w2": number,
    "w3": number,
    "w4": number,
    "w5": number
  },
  "warnings": [string]
}

重要な読み取りルール:
- iPhoneのステータスバー、ブラウザUI、下部ナビゲーションは無視する。
- 画像内のゲーム画面上部左の日時ラベルを stampedAt にする。現在時刻ではない。
- 通常の投稿時刻はフロントエンド側で現在時刻に置き換えるので、ここでは画像内の時刻だけを読む。
- 上部中央が「いつものバイト」なら mode は STANDARD。
- 上部中央が「バイトチームコンテスト」なら mode は CONTEST。
- ビッグラン会場名が見えた場合、stage は会場名ではなく「ビッグラン」にする。
- コンテストでも上部右の黒いステージラベルを読んで stage に入れる。コンテストだから stage を空にしない。
- コンテストの開催回はスクショから基本的に分からないので round は ""、warnings に「開催回確認」を入れる。
- stage が「ビッグラン」なら mode は必ず STANDARD。ビッグランを CONTEST として扱わない。
- プレイスタイル（野良/パーティー等）はスクショから確定できない。warnings には入れない。フロント側でユーザーに手動選択させる。

ステージ判定:
- stage は上部右の黒いステージラベルを最優先で読む。
- 上部が切れていてステージラベルが見えない場合、背景だけで推測しない。stage は "" にし、「ステージ確認」を入れる。
- 既知のビッグラン会場: ${BIG_RUN_VENUES.join("、")}。これらが見えたら stage は「ビッグラン」。

ブキ判定:
- Clear!! の下、キケン度表示の左側にある黒い横長カプセル内の4つのメインブキアイコンを左から順に読む。
- この4つはシフトの支給ブキ。プレイヤー行の小さいブキアイコン、スペシャルアイコン、オオモノアイコンとは別物なので混ぜない。
- weapons は必ず左から順番に4要素。確信できない位置は "" にする。
- 4つすべてを高い確信で読めた場合だけ正式ブキ名を入れる。1つでも不確実ならその位置は "" にし、warnings に「ブキ確認」を入れる。
- 亜種やコラボ名ではなく、サーモンランで使うメインブキ名に正規化する。例: スプラシューターコラボ/ヒーローシューター/オーダーシューター → スプラシューター、シャープマーカーネオ → シャープマーカー。
- 「？」やランダム枠、クマサン印のランダムが見えて具体的なブキが判別できない場合は ""。
- 候補の正式名:
${WEAPONS.join("、")}

昼のみ / 夜あり:
- dayNight は「夜あり」: EX-WAVE がある、オカシラが出ている、または特殊Waveがある場合。
- 特殊Waveの例: キンシャケ探し, グリル発進, ラッシュ, 霧, ハコビヤ, ドスコイ大量発生, ドロシャケ噴出, 巨大タツマキ, ジョー, ヨコヅナ, タツ, オカシラ連合。
- 干潮/普通/満潮は潮位であり、それだけでは夜ありにしない。
- 全Waveが通常でイベント欄が "-"、EX-WAVEなしなら「昼のみ」。

納品数:
- Waveカードの大きい "40/27" は 40 が納品数、27 がノルマ。
- STANDARD の totalEggs は WAVE 1〜3 の納品数合計。EX-WAVEは含めない。
- CONTEST の totalEggs は WAVE 1〜5 の納品数合計。
- 出現数 x48, x69 などは納品数ではない。totalEggs や myEggs に使わない。
- waveEggs と counts.w1〜w5 には、各Waveの納品数だけを左から順に入れる。存在しないWaveは 0。

チーム合計:
- totalRed は左上のチーム合計赤イクラ（オレンジ/赤イクラの x数字）。
- totalEggs は左上の金イクラ合計またはWave合計。矛盾したらWave合計を優先。
- bronze/silver/gold scales、獲得ポイント、キケン度、評価レートはこのアプリの登録値には使わない。

プレイヤー行:
- 下部のオレンジ色のプレイヤー行を上から読む。1行目が自分。
- myKills/p2Kills/p3Kills/p4Kills は各行の「オオモノシャケ xN」。
- myEggs は1行目右側カプセル内の黄色イクラの xN。x26<1> なら 26。<1> は無視。
- myRed は1行目右側カプセル内の赤イクラ xN。
- 右側の小さいボスアイコン横の x0/x2/x5 などを処理数として使わない。
- プレイヤー名は登録に使わない。

よくある誤読の修正:
- ムニ・エール海洋発電所をどんぴこ闘技場にしない。右上ステージラベルを見る。
- アラマキ岩と読めそうでも、正式ステージ名はアラマキ砦。
- 1枚目サンプル型の画像では、ムニ・エール海洋発電所 / 夜あり / 113 / 自分26 / 処理20,18,14,9 / 全体赤4342 / 個人赤1239 が正しい読み方。
- バイトチームコンテストで右上にアラマキ砦が見える場合、stage はアラマキ砦、mode は CONTEST。
- WAVE下部の「出現数」は納品でも自分の数値でもない。
- 赤イクラは3〜5桁になることが多い。金イクラや処理数と入れ替えない。
`.trim();

export async function onRequestPost({ request, env }) {
  const authError = requireToken(request, env);
  if (authError) return authError;
  let debug = false;

  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: "GEMINI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    debug = Boolean(body.debug);
    const images = normalizeImageSet(body);
    if (!images.full) {
      return jsonResponse({ ok: false, error: "画像がありません" }, { status: 400 });
    }

    const models = configuredModels(env);
    // Resolve deterministic sources in parallel with Gemini so correctness does not
    // depend on VLM weapon naming for old/out-of-window screenshots. The server-side
    // detector is trusted only after localWeaponHintFor() accepts its confidence and
    // geometry; client/browser hints are deliberately not accepted here.
    const schedulePromise = fetchCoopSchedule(env).catch(() => null);
    const detectorPromise = detectWeaponsWithService(images.full, env).catch(() => null);
    const weaponContext = { schedulePromise, detectorPromise };
    const extraction = await extractWithGemini({ apiKey, models, images, weaponContext, debug });
    return jsonResponse(extraction);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: friendlyServerError(error),
        detail: debug ? String(error?.message || error || "").slice(0, 2000) : undefined,
      },
      { status: 502 },
    );
  }
}

async function extractWithGemini({ apiKey, models, images, weaponContext, debug }) {
  const errors = [];
  const modelAttempts = [];
  let lastParsed = null;
  let lastParsedModel = "";
  let lastParsedAttempt = 0;

  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await callGemini({ apiKey, model, images, attempt, errors });
        const rawText = geminiText(response);
        const parsed = parseJsonObject(rawText);
        lastParsed = parsed;
        lastParsedModel = model;
        lastParsedAttempt = attempt;
        modelAttempts.push({ model, attempt, status: "success" });
        const normalized = normalizeResult(parsed);
        await resolveDeterministicWeapons(normalized, weaponContext);
        normalized.warnings = mergeWarnings(normalized.warnings, qualityWarnings(normalized));

        return {
          ok: true,
          provider: "gemini-vlm",
          model,
          attempts: attempt,
          modelAttempts: summarizeModelAttempts(modelAttempts),
          result: normalized,
          raw: debug ? rawText.slice(0, 4000) : undefined,
        };
      } catch (error) {
        errors.push(error);
        const shouldFallback = shouldTryNextModel(error);
        const shouldRetry = !shouldFallback && shouldRetrySameModel(error) && attempt < MAX_ATTEMPTS;
        modelAttempts.push({
          model,
          attempt,
          status: shouldFallback ? "fallback" : (shouldRetry ? "retry" : "failed"),
          reason: modelAttemptReason(error),
        });
        if (shouldFallback) {
          await sleep(fallbackDelayMs(error));
          break;
        }
        if (shouldRetry) {
          await sleep(sameModelDelayMs(error, attempt));
          continue;
        }
        throw new Error(errors.map((item) => item?.message || String(item)).join(" / "));
      }
    }
  }

  if (lastParsed) {
    const normalized = normalizeResult(lastParsed);
    await resolveDeterministicWeapons(normalized, weaponContext);
    normalized.warnings = mergeWarnings(normalized.warnings, ["AI確認", ...qualityWarnings(normalized)]);
    return {
      ok: true,
      error: "読み取り結果を確認してください",
      provider: "gemini-vlm",
      model: lastParsedModel || models[0] || DEFAULT_GEMINI_MODEL,
      attempts: lastParsedAttempt || MAX_ATTEMPTS,
      modelAttempts: summarizeModelAttempts(modelAttempts),
      result: normalized,
    };
  }

  throw new Error(errors.map((error) => error?.message || String(error)).join(" / "));
}

function configuredModels(env = {}) {
  const primary = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const fallbackText = env.GEMINI_FALLBACK_MODELS || DEFAULT_FALLBACK_MODELS.join(",");
  const values = [primary, ...String(fallbackText).split(",")]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function shouldTryNextModel(error) {
  const text = String(error?.message || error || "");
  return error?.status === 429 || /429|quota exceeded|rate limit exceeded|too many requests|RESOURCE_EXHAUSTED/i.test(text);
}

function shouldRetrySameModel(error) {
  const text = String(error?.message || error || "");
  if (shouldTryNextModel(error)) return false;
  if (error?.status === 400 || error?.status === 401 || error?.status === 403 || error?.status === 404) return false;
  if (/400|401|403|404|INVALID_ARGUMENT|PERMISSION_DENIED|API_KEY|not found|not supported/i.test(text)) return false;
  return !error?.status || error.status === 408 || error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504 || /JSON|parse|解析|timeout|network|fetch/i.test(text);
}

function modelAttemptReason(error) {
  const text = String(error?.message || error || "");
  if (/429|quota|rate|limit|RESOURCE_EXHAUSTED/i.test(text)) return "quota";
  if (/404|NOT_FOUND|not found|not supported|model/i.test(text)) return "model";
  if (/400|INVALID_ARGUMENT/i.test(text)) return "request";
  if (/JSON|parse|解析/i.test(text)) return "json";
  return "error";
}

function sameModelDelayMs(error, attempt) {
  if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
    return Math.min(error.retryAfterMs, 5_000);
  }
  return Math.min(SAME_MODEL_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)), 4_000);
}

function fallbackDelayMs(error) {
  if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
    return Math.min(error.retryAfterMs, 2_000);
  }
  return FALLBACK_DELAY_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function summarizeModelAttempts(attempts = []) {
  return attempts
    .map((item) => ({
      model: item.model,
      attempt: item.attempt,
      status: item.status,
      reason: item.reason || "",
    }))
    .slice(-12);
}

async function callGemini({ apiKey, model, images, weaponHints, attempt, errors }) {
  const cleanModel = String(model || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(cleanModel)}:generateContent`;
  const prompt = [
    VLM_PROMPT,
    "",
    weaponHintsPrompt(weaponHints),
    `Attempt ${attempt}/${MAX_ATTEMPTS}: return strict JSON only.`,
    errors.length ? `Previous errors to avoid: ${errors.map((error) => error?.message || String(error)).join(" / ").slice(0, 700)}` : "",
  ].filter(Boolean).join("\n");

  const parts = [{ text: prompt }, imagePart(images.full)];
  if (images.sheet) {
    parts.push({ text: "次の2枚目は、同じ画像を重要領域ごとに並べた確認用パネルです。元画像と矛盾する場合は元画像を優先してください。" });
    parts.push(imagePart(images.sheet));
  }
  if (images.weapons) {
    parts.push({ text: "次の画像は支給ブキ4つだけを拡大・高解像度化した切り抜きです。weapons はこの画像を最優先で、左から順に4つのメインブキ名を候補リストから読み取ってください。" });
    parts.push(imagePart(images.weapons));
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseJsonSchema: RESULT_SCHEMA,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Gemini ${response.status}: ${text.slice(0, 500)}`);
    error.status = response.status;
    error.retryAfterMs = retryAfterMs(response.headers.get("Retry-After"));
    throw error;
  }
  return text ? JSON.parse(text) : {};
}

function retryAfterMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed - Date.now()) : 0;
}

function weaponHintsPrompt(weaponHints) {
  if (!weaponHints) return "";
  const candidates = Array.isArray(weaponHints.weapons)
    ? weaponHints.weapons.map((weapon, index) => {
      const name = weapon.weaponName || weapon.nameJa || weapon.name || "";
      const options = Array.isArray(weapon.candidates)
        ? weapon.candidates.map((candidate) => candidate.weaponName || candidate.nameJa || candidate.name).filter(Boolean).slice(0, 3)
        : [];
      return `slot${index + 1}: ${name || "未確定"}${options.length ? ` 候補=${options.join("/")}` : ""}`;
    }).join("; ")
    : "";
  return candidates
    ? `ローカル画像照合のブキ候補: ${candidates}。ブキ欄はこの候補に強く従い、候補外を自由に推測しない。`
    : "";
}

async function detectWeaponsWithService(image, env = {}) {
  const baseUrl = String(env.SALMONMETRICS_DETECTOR_URL || DEFAULT_DETECTOR_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl || !image?.base64) return null;

  const binary = base64ToBytes(image.base64);
  if (!binary?.length) return null;

  const form = new FormData();
  form.append("file", new Blob([binary], { type: image.mimeType || "image/jpeg" }), "screenshot.jpg");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${baseUrl}/detect`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const detector = await response.json();
    return detectorResponseToWeaponHints(detector);
  } finally {
    clearTimeout(timeout);
  }
}

function detectorResponseToWeaponHints(detector = {}) {
  const weapons = Array.isArray(detector.weapons)
    ? detector.weapons.slice(0, 4).map((weapon, index) => ({
      slot: cleanInt(weapon.slot) || index + 1,
      weaponName: normalizeWeaponName(weapon.weapon_name_ja || weapon.weaponName || weapon.nameJa || weapon.name, { allowRandom: true }),
      confidence: cleanNumber(weapon.confidence),
      method: String(weapon.method || detector.source || "cloud_run_detector"),
      candidates: Array.isArray(weapon.candidates)
        ? weapon.candidates.map((candidate) => ({
          weaponName: normalizeWeaponName(candidate.weapon_name_ja || candidate.weaponName || candidate.nameJa || candidate.name, { allowRandom: true }),
          confidence: cleanNumber(candidate.confidence),
        })).filter((candidate) => candidate.weaponName)
        : [],
    }))
    : [];

  return {
    source: "local_template_match",
    mode: String(detector.mode || "").trim(),
    confidence: cleanNumber(detector.confidence),
    needsReview: Boolean(detector.needs_review ?? detector.needsReview),
    weapons,
  };
}

function base64ToBytes(base64) {
  try {
    const binary = atob(String(base64 || "").replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function imagePart(image) {
  return {
    inline_data: {
      mime_type: image.mimeType || "image/jpeg",
      data: image.base64,
    },
  };
}

function geminiText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("").trim();
  if (text) return text;
  if (response && typeof response === "object") return JSON.stringify(response);
  return String(response || "");
}

function parseJsonObject(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  try {
    return JSON.parse(source);
  } catch {
    for (const candidate of jsonObjectCandidates(source)) {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next balanced object.
      }
    }
  }
  throw new Error("Gemini JSONを解析できません");
}

function jsonObjectCandidates(text) {
  const candidates = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return candidates;
}

function normalizeResult(value = {}) {
  const counts = value.counts || {};
  const rawStage = normalizeStageName(value.stage);
  let mode = String(value.mode || "").toUpperCase() === "CONTEST" ? "CONTEST" : "STANDARD";
  if (rawStage === "ビッグラン") {
    mode = "STANDARD";
  }
  const expectedWaves = mode === "CONTEST" ? 5 : 3;
  const waveEggs = normalizeWaveEggs(value.waveEggs, counts);
  const countValues = {
    totalEggs: cleanInt(counts.totalEggs ?? value.totalEggs),
    myEggs: cleanInt(counts.myEggs ?? value.myEggs),
    myKills: cleanInt(counts.myKills ?? value.myKills),
    p2Kills: cleanInt(counts.p2Kills ?? value.p2Kills),
    p3Kills: cleanInt(counts.p3Kills ?? value.p3Kills),
    p4Kills: cleanInt(counts.p4Kills ?? value.p4Kills),
    totalRed: cleanInt(counts.totalRed ?? value.totalRed),
    myRed: cleanInt(counts.myRed ?? value.myRed),
    w1: cleanInt(counts.w1 ?? waveEggs[0]),
    w2: cleanInt(counts.w2 ?? waveEggs[1]),
    w3: cleanInt(counts.w3 ?? waveEggs[2]),
    w4: cleanInt(counts.w4 ?? waveEggs[3]),
    w5: cleanInt(counts.w5 ?? waveEggs[4]),
  };
  const waveTotal = [countValues.w1, countValues.w2, countValues.w3, countValues.w4, countValues.w5]
    .slice(0, expectedWaves)
    .reduce((total, value) => total + value, 0);
  if (waveTotal > 0 && (!countValues.totalEggs || Math.abs(countValues.totalEggs - waveTotal) > 12)) {
    countValues.totalEggs = waveTotal;
  }

  return {
    mode,
    stage: rawStage,
    round: mode === "CONTEST" ? normalizeRound(value.round) : "",
    stampedAt: normalizeDateTime(value.stampedAt || value.datetime || value.date_time || ""),
    dayNight: normalizeDayNight(value.dayNight),
    waveEggs,
    weapons: normalizeWeapons(value.weapons),
    weaponSource: "vlm",
    counts: countValues,
    warnings: rawStage === "ビッグラン"
      ? normalizeWarnings(value.warnings).filter((warning) => warning !== "開催回確認")
      : normalizeWarnings(value.warnings),
  };
}

async function resolveDeterministicWeapons(result, context = null) {
  // 1) Manually verified known rotations win outright.
  const known = knownRotationFor(result);
  if (known) {
    applyResolvedWeapons(result, known.weapons, "known_rotation", known.stage);
    return;
  }

  // 2) Public Salmon Run schedule, keyed by the screenshot's printed play
  //    timestamp. Exact by construction.
  const scheduled = await scheduleRotationFor(result, context?.schedulePromise);
  if (scheduled) {
    applyResolvedWeapons(result, scheduled.weapons, "schedule", scheduled.stage);
    return;
  }

  // 3) Server-side image detector. This covers old screenshots outside the public
  //    current schedule window and avoids trusting browser-provided hints.
  const detected = localWeaponHintFor(context?.detectorPromise ? await context.detectorPromise : null);
  if (detected?.mode === "random_weapons") {
    applyResolvedWeapons(result, detected.weapons, "random");
    return;
  }
  if (detected?.weapons?.length === 4) {
    applyResolvedWeapons(result, detected.weapons, "local_match");
    return;
  }

  // 4) Otherwise trust Gemini's own read. Its weapon output is constrained to
  //    the known weapon list and it sees a dedicated upscaled crop of the supply
  //    bar, so it is the recognizer for stamp-less / out-of-window screenshots.
  //    Tiny or cropped icons can't always be pinned from pixels, so a partial
  //    read (< 4) is left blank for the 1-tap correction UI.
  result.weapons = normalizeWeapons(result.weapons);
  result.weaponSource = result.weapons.length === 4 ? "vlm" : "";
}

function applyResolvedWeapons(result, weapons, source, stage = "") {
  // Schedule and known rotations legitimately contain random (Grizzco) slots.
  const allowRandom = source === "random" || source === "schedule" || source === "known_rotation";
  const normalizedWeapons = normalizeWeapons(weapons, { allowRandom });
  if (normalizedWeapons.length !== 4) return;
  result.weapons = normalizedWeapons;
  result.weaponSource = source;
  if (stage) result.stage = normalizeStageName(stage) || result.stage;
  result.warnings = normalizeWarnings(result.warnings).filter((warning) => warning !== "ブキ確認");
}

function normalizeWeaponHints(value = null) {
  if (!value || typeof value !== "object") return null;
  const weapons = Array.isArray(value.weapons) ? value.weapons.slice(0, 4) : [];
  const normalizedWeapons = weapons.map((weapon, index) => {
    const source = typeof weapon === "string" ? { weaponName: weapon } : (weapon || {});
    const candidates = Array.isArray(source.candidates)
      ? source.candidates.map((candidate) => ({
        weaponName: normalizeWeaponName(candidate?.weaponName || candidate?.nameJa || candidate?.name, { allowRandom: true }),
        confidence: cleanNumber(candidate?.confidence),
      })).filter((candidate) => candidate.weaponName)
      : [];
    return {
      slot: cleanInt(source.slot) || index + 1,
      weaponName: normalizeWeaponName(source.weaponName || source.nameJa || source.name, { allowRandom: true }),
      confidence: cleanNumber(source.confidence),
      method: String(source.method || "").trim(),
      candidates,
    };
  });
  return {
    source: String(value.source || "").trim(),
    mode: String(value.mode || "").trim(),
    confidence: cleanNumber(value.confidence),
    needsReview: Boolean(value.needsReview),
    weapons: normalizedWeapons,
  };
}

function localWeaponHintFor(weaponHints) {
  if (!weaponHints || weaponHints.source !== "local_template_match") return null;
  if (weaponHints.mode === "random_weapons" && weaponHints.confidence >= 0.9) {
    return { mode: "random_weapons", weapons: ["ランダム", "ランダム", "ランダム", "ランダム"] };
  }
  const weapons = (weaponHints.weapons || [])
    .slice(0, 4)
    .map((weapon) => ({
      name: normalizeWeaponName(weapon.weaponName, { allowRandom: false }),
      confidence: cleanNumber(weapon.confidence),
    }));
  const hasFour = weapons.length === 4 && weapons.every((weapon) => weapon.name);
  const highConfidence = weaponHints.confidence >= 0.74 && weapons.every((weapon) => weapon.confidence >= 0.68);
  if (!weaponHints.needsReview && hasFour && highConfidence) {
    return { mode: "fixed_weapons", weapons: weapons.map((weapon) => weapon.name) };
  }
  return null;
}

function knownRotationFor(result) {
  const battleTime = battleTimeUtcMs(result.stampedAt);
  return KNOWN_ROTATIONS.find((rotation) => {
    const rotationStart = rotation.start ? battleTimeUtcMs(rotation.start) : 0;
    const rotationEnd = rotation.end ? battleTimeUtcMs(rotation.end) : 0;
    return (
      (!rotation.mode || rotation.mode === result.mode)
      && (!rotation.stage || !result.stage || normalizeStageName(rotation.stage) === result.stage || (rotationStart && rotationEnd && battleTime))
      && (!rotation.start || !battleTime || battleTime >= rotationStart)
      && (!rotation.end || !battleTime || battleTime < rotationEnd)
      && (!rotation.datePrefix || String(result.stampedAt || "").startsWith(rotation.datePrefix))
      && (!rotation.totalEggs || !result.counts.totalEggs || rotation.totalEggs === result.counts.totalEggs)
      && (!rotation.totalRed || !result.counts.totalRed || rotation.totalRed === result.counts.totalRed)
    );
  });
}

async function scheduleRotationFor(result, schedulePromise = null) {
  const battleTime = battleTimeUtcMs(result.stampedAt);
  if (!battleTime) return null;

  const rotations = schedulePromise ? await schedulePromise : await fetchCoopSchedule();
  if (!Array.isArray(rotations)) return null;

  return rotations.find((rotation) => (
    battleTime >= rotation.startMs
    && battleTime < rotation.endMs
    && (!result.stage || rotation.stage === result.stage || result.stage === "ビッグラン")
    && (!result.mode || rotation.mode === result.mode || rotation.mode === "STANDARD")
    && rotation.weapons.length === 4
  )) || null;
}

async function fetchCoopSchedule(env = {}) {
  const url = String(env.SALMONMETRICS_SCHEDULE_URL || SCHEDULE_URL || "").trim();
  if (!url) return null;
  try {
    // Edge-cache the schedule for 10 min: it only changes when rotations flip,
    // so this keeps the parallel lookup near-instant on a warm cache.
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    if (!response.ok) return null;
    const schedule = await response.json();
    return coopScheduleRotations(schedule);
  } catch {
    return null;
  }
}

function coopScheduleRotations(schedule) {
  const group = schedule?.data?.coopGroupingSchedule || schedule?.coopGroupingSchedule || {};
  const sourceGroups = [
    { mode: "STANDARD", schedules: group.regularSchedules },
    { mode: "STANDARD", schedules: group.bigRunSchedules },
    { mode: "CONTEST", schedules: group.teamContestSchedules },
  ];
  const rotations = [];
  for (const source of sourceGroups) {
    const nodes = source.schedules?.nodes || source.schedules || [];
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      const setting = node?.setting || {};
      const startMs = Date.parse(node.startTime || "");
      const endMs = Date.parse(node.endTime || "");
      const stage = scheduleStageName(setting?.coopStage?.name || setting?.vsStage?.name || "");
      const weapons = (setting?.weapons || [])
        .map((weapon) => scheduleWeaponName(weapon?.name))
        .filter(Boolean)
        .slice(0, 4);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && stage && weapons.length === 4) {
        rotations.push({ mode: source.mode, startMs, endMs, stage, weapons });
      }
    }
  }
  return rotations;
}

function scheduleStageName(name) {
  const text = String(name || "").trim();
  // splatoon3.ink uses typographic apostrophes (Marooner's Bay, Jammin' Salmon
  // Junction); fold them to a straight quote so the map lookup stays robust.
  const canon = text.replace(/[‘’ʼ]/g, "'");
  return EN_STAGE_TO_JA.get(text) || EN_STAGE_TO_JA.get(canon) || normalizeStageName(text);
}

function scheduleWeaponName(name) {
  const text = String(name || "").trim();
  const canon = text.replace(/[‘’ʼ]/g, "'");
  return EN_WEAPON_TO_JA.get(text) || EN_WEAPON_TO_JA.get(canon) || normalizeWeaponName(text);
}

function battleTimeUtcMs(value) {
  if (!value) return 0;
  const normalized = normalizeDateTime(value);
  if (!normalized) return 0;
  // SplatNet result timestamps are local to the device. This app is used in JST,
  // so compare schedule windows using Japan time unless the string already has a zone.
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}:00+09:00`;
  const parsed = Date.parse(withZone);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeWeapons(weapons, options = {}) {
  const values = Array.isArray(weapons) ? weapons : [];
  return values
    .map((weapon) => normalizeWeaponName(weapon, options))
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeWeaponName(value, options = {}) {
  const text = String(value || "").normalize("NFKC").replace(/\s+/g, "").trim();
  if (!text || text === "?") return "";
  if (text.includes("ランダム") || /^random$/i.test(text)) return options.allowRandom ? "ランダム" : "";
  const exact = WEAPONS.find((weapon) => text === weapon.replace(/\s+/g, ""));
  if (exact) return exact;
  const aliases = [
    ["ヒーローシューター", "スプラシューター"],
    ["オーダーシューター", "スプラシューター"],
    ["スプラシューターコラボ", "スプラシューター"],
    ["シャープマーカーネオ", "シャープマーカー"],
    ["プロモデラー", "プロモデラーMG"],
    ["モデラー", "プロモデラーMG"],
    ["52ガロン", ".52ガロン"],
    ["96ガロン", ".96ガロン"],
    ["N-ZAP", "N-ZAP85"],
    ["ZAP", "N-ZAP85"],
    ["ボトル", "ボトルガイザー"],
    ["カーボン", "カーボンローラー"],
    ["スプロラ", "スプラローラー"],
    ["ダイナモ", "ダイナモローラー"],
    ["ヴァリアブル", "ヴァリアブルローラー"],
    ["ワイド", "ワイドローラー"],
    ["スクイク", "スクイックリンα"],
    ["スクイックリン", "スクイックリンα"],
    ["スプチャ", "スプラチャージャー"],
    ["リッター", "リッター4K"],
    ["竹", "14式竹筒銃・甲"],
    ["鉛筆", "R-PEN/5H"],
    ["RPEN", "R-PEN/5H"],
    ["R-PEN", "R-PEN/5H"],
    ["バケツ", "バケットスロッシャー"],
    ["スクスロ", "スクリュースロッシャー"],
    ["オフロ", "オーバーフロッシャー"],
    ["エクス", "エクスプロッシャー"],
    ["バレル", "バレルスピナー"],
    ["ハイドラ", "ハイドラント"],
    ["クーゲル", "クーゲルシュライバー"],
    ["ノーチ", "ノーチラス47"],
    ["マニューバー", "スプラマニューバー"],
    ["スプマニュ", "スプラマニューバー"],
    ["ケルビン", "ケルビン525"],
    ["デュアル", "デュアルスイーパー"],
    ["クアッド", "クアッドホッパーブラック"],
    ["キャンプ", "キャンピングシェルター"],
    ["スパイ", "スパイガジェット"],
    ["和傘", "24式張替傘・甲"],
    ["ノヴァ", "ノヴァブラスター"],
    ["ホット", "ホットブラスター"],
    ["ロング", "ロングブラスター"],
    ["クラブラ", "クラッシュブラスター"],
    ["ラピッド", "ラピッドブラスター"],
    ["ラピエリ", "Rブラスターエリート"],
    ["エリート", "Rブラスターエリート"],
    ["SBLAST", "S-BLAST92"],
    ["S-BLAST", "S-BLAST92"],
    ["トラスト", "トライストリンガー"],
    ["トライスト", "トライストリンガー"],
    ["LACT", "LACT-450"],
    ["ラクト", "LACT-450"],
    ["フルイド", "フルイドV"],
    ["ドライブ", "ドライブワイパー"],
    ["ジム", "ジムワイパー"],
    ["デンタル", "デンタルワイパーミント"],
  ];
  return aliases.find(([key]) => text.includes(key))?.[1] || "";
}

function normalizeWaveEggs(waveEggs, counts = {}) {
  const fromArray = Array.isArray(waveEggs) ? waveEggs : [];
  const values = fromArray
    .map(cleanInt)
    .filter((value) => value >= 10 && value <= 300)
    .slice(0, 5);
  if (values.length) return values;
  return [counts.w1, counts.w2, counts.w3, counts.w4, counts.w5]
    .map(cleanInt)
    .filter((value) => value >= 10 && value <= 300)
    .slice(0, 5);
}

function normalizeStageName(value) {
  const text = String(value || "").normalize("NFKC").replace(/\s+/g, "");
  if (!text) return "";
  const exact = STAGES.find((stage) => text === stage.replace(/\s+/g, ""));
  if (exact) return exact;
  const aliases = [
    ["ムニ", "ムニ・エール海洋発電所"],
    ["海洋発電", "ムニ・エール海洋発電所"],
    ["発電所", "ムニ・エール海洋発電所"],
    ["どんぴこ", "どんぴこ闘技場"],
    ["アラマキ", "アラマキ砦"],
    ["アラマキ岩", "アラマキ砦"],
    ["シェケナ", "シェケナダム"],
    ["ダム", "シェケナダム"],
    ["ドンブラコ", "難破船ドン・ブラコ"],
    ["ドン・ブラコ", "難破船ドン・ブラコ"],
    ["ブラコ", "難破船ドン・ブラコ"],
    ["すじこ", "すじこジャンクション跡"],
    ["ジャンクション", "すじこジャンクション跡"],
    ["トキシラズ", "トキシラズいぶし工房"],
    ["いぶし工房", "トキシラズいぶし工房"],
    ["ビッグラン", "ビッグラン"],
    ...BIG_RUN_VENUES.map((venue) => [venue, "ビッグラン"]),
    ["タラポート", "ビッグラン"],
    ["ショッピングパーク", "ビッグラン"],
    ["スメーシー", "ビッグラン"],
    ["海女美", "ビッグラン"],
    ["マテガイ", "ビッグラン"],
    ["ナンプラー", "ビッグラン"],
    ["ゴンズイ", "ビッグラン"],
    ["ヒラメ", "ビッグラン"],
  ];
  return aliases.find(([alias]) => text.includes(alias))?.[1] || "";
}

function normalizeRound(value) {
  const text = String(value || "").normalize("NFKC").trim();
  if (!text) return "";
  const match = text.match(/第?\s*(\d{1,2})\s*回/);
  if (match) return `第${Number(match[1])}回`;
  return /^第\d{1,2}回$/.test(text) ? text : "";
}

function normalizeDateTime(value) {
  const text = String(value || "").normalize("NFKC").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text;
  const match = text.match(/(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})[^\d]{0,8}(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

function normalizeDayNight(value) {
  return String(value || "").includes("夜") ? "夜あり" : "昼のみ";
}

function normalizeWarnings(warnings = []) {
  const values = Array.isArray(warnings) ? warnings : [warnings];
  return mergeWarnings(values.map(shortWarning));
}

function qualityWarnings(result) {
  const warnings = [];
  if (!result.stage) warnings.push("ステージ確認");
  if (result.mode === "CONTEST" && !result.round) warnings.push("開催回確認");
  if (!result.stampedAt) warnings.push("時刻確認");
  if (!result.counts.totalEggs) warnings.push("納品数確認");
  if (!result.counts.myEggs || !result.counts.myRed) warnings.push("自分確認");
  if (!result.counts.totalRed) warnings.push("赤イクラ確認");
  if ([result.counts.myKills, result.counts.p2Kills, result.counts.p3Kills, result.counts.p4Kills].some((value) => !value)) {
    warnings.push("処理数確認");
  }
  if (!Array.isArray(result.weapons) || result.weapons.length < 4 || result.weaponSource === "vlm") warnings.push("ブキ確認");
  return warnings;
}

function shortWarning(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (WARNING_LABELS.includes(text)) return text;
  if (/stage|ステージ|場所/i.test(text)) return "ステージ確認";
  if (/time|date|時刻|日時/i.test(text)) return "時刻確認";
  if (/round|開催|回/i.test(text)) return "開催回確認";
  if (/weapon|ブキ|武器/i.test(text)) return "ブキ確認";
  if (/style|野良|パーティ|プレイ/i.test(text)) return "";
  if (/kill|処理|オオモノ/i.test(text)) return "処理数確認";
  if (/red|赤/i.test(text)) return "赤イクラ確認";
  if (/egg|納品|金/i.test(text)) return "納品数確認";
  if (/player|自分|個人/i.test(text)) return "自分確認";
  if (/crop|hidden|image|画像|不鮮明|切れ/i.test(text)) return "画像確認";
  if (/AI|Gemini|JSON/i.test(text)) return "AI確認";
  return text.length <= 8 ? text : "AI確認";
}

function mergeWarnings(...groups) {
  const values = groups.flat().map(shortWarning).filter(Boolean);
  return [...new Set(values)].slice(0, 8);
}

function cleanInt(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cleanNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function normalizeImageSet(body = {}) {
  const incoming = body.images && typeof body.images === "object" ? body.images : {};
  return {
    full: normalizeImagePayload(incoming.full || body.image),
    sheet: normalizeImagePayload(incoming.sheet),
    weapons: normalizeImagePayload(incoming.weapons),
  };
}

function normalizeImagePayload(value) {
  const text = String(value || "");
  if (!text) return null;
  const match = text.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  const mimeType = match?.[1] || "image/jpeg";
  const base64 = (match?.[2] || text).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
  return { mimeType, base64 };
}

function friendlyServerError(error) {
  const text = error?.message || String(error || "");
  if (/API_KEY|key not valid|PERMISSION_DENIED|401|403/i.test(text)) {
    return "Gemini APIキーを確認してください";
  }
  if (/429|quota|rate|limit|RESOURCE_EXHAUSTED/i.test(text)) {
    return "Geminiの無料枠上限です。時間をおいて再試行してください";
  }
  if (/JSON|parse|解析/i.test(text)) {
    return "Geminiの結果をJSONとして読めませんでした";
  }
  return text.length < 120 ? text : "Gemini VLM解析に失敗しました";
}
