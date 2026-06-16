import {
  buildSheetPayload,
  jsonResponse,
  readConfig,
  requireToken,
  sheetRequest,
} from "../_lib/salmonmetrics.js";

export async function onRequestPost({ request, env }) {
  const authError = requireToken(request, env);
  if (authError) return authError;

  try {
    const body = await request.json();
    const payload = buildSheetPayload(body, await readConfig(env));
    const response = await sheetRequest(env, "POST", payload);
    const text = await response.text();
    if (!response.ok) {
      return jsonResponse(
        {
          error: "Google Sheet rejected the submission",
          status: response.status,
          detail: text.slice(0, 500),
          payload,
        },
        { status: 502 },
      );
    }
    return jsonResponse({ ok: true, sheetStatus: response.status, payload });
  } catch (error) {
    return jsonResponse({ error: error.message || String(error) }, { status: 400 });
  }
}
