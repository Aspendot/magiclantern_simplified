import { jsonResponse } from "../_lib/salmonmetrics.js";

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-access-token",
    },
  });
}

export function onRequest() {
  return jsonResponse({ error: "Unknown endpoint" }, { status: 404 });
}
