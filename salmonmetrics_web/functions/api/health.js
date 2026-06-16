import { jsonResponse } from "../_lib/salmonmetrics.js";

export function onRequestGet({ env }) {
  const geminiConfigured = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  return jsonResponse({
    ok: true,
    sheetConfigured: Boolean(env.SALMONMETRICS_SHEET_URL),
    aiConfigured: geminiConfigured || Boolean(env.AI),
    geminiConfigured,
    geminiModel: env.GEMINI_MODEL || "gemini-3.5-flash",
    geminiFallbackModels: env.GEMINI_FALLBACK_MODELS || "gemini-3-flash-preview,gemini-2.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash-lite",
    runtime: "cloudflare-pages",
  });
}
