import { applySoftDeletes, jsonResponse, requireToken, sheetRequest } from "../_lib/salmonmetrics.js";

export async function onRequestGet({ request, env }) {
  const authError = requireToken(request, env);
  if (authError) return authError;

  try {
    const response = await sheetRequest(env, "GET");
    const text = await response.text();
    if (!response.ok) {
      return jsonResponse(
        { error: "Google Sheet returned an error", status: response.status, detail: text.slice(0, 500) },
        { status: 502 },
      );
    }

    try {
      const rows = JSON.parse(text);
      return jsonResponse(Array.isArray(rows) ? applySoftDeletes(rows) : rows);
    } catch {
      return jsonResponse(
        { error: "Google Sheet response was not JSON", detail: text.slice(0, 500) },
        { status: 502 },
      );
    }
  } catch (error) {
    return jsonResponse({ error: error.message || String(error) }, { status: 502 });
  }
}
