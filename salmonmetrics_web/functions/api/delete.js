import {
  buildDeletePayload,
  findDeletableRecord,
  jsonResponse,
  requireToken,
  sheetRequest,
} from "../_lib/salmonmetrics.js";

export async function onRequestPost({ request, env }) {
  const authError = requireToken(request, env);
  if (authError) return authError;

  try {
    const body = await request.json();
    const logsResponse = await sheetRequest(env, "GET");
    const logsText = await logsResponse.text();
    if (!logsResponse.ok) {
      return jsonResponse(
        { error: "Google Sheet returned an error", status: logsResponse.status, detail: logsText.slice(0, 500) },
        { status: 502 },
      );
    }

    let rows = [];
    try {
      rows = JSON.parse(logsText);
    } catch {
      return jsonResponse(
        { error: "Google Sheet response was not JSON", detail: logsText.slice(0, 500) },
        { status: 502 },
      );
    }
    if (!Array.isArray(rows)) {
      return jsonResponse({ error: "Google Sheet response was not a row list" }, { status: 502 });
    }

    const record = findDeletableRecord(rows, body.recordId, body.clientId, body.userName);
    const payload = buildDeletePayload(body, record);
    const response = await sheetRequest(env, "POST", payload);
    const text = await response.text();
    if (!response.ok) {
      return jsonResponse(
        {
          error: "Google Sheet rejected the delete marker",
          status: response.status,
          detail: text.slice(0, 500),
        },
        { status: 502 },
      );
    }

    return jsonResponse({ ok: true, sheetStatus: response.status, payload });
  } catch (error) {
    return jsonResponse({ error: error.message || String(error) }, { status: 400 });
  }
}
