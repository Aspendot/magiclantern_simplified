import {
  jsonResponse,
  readConfig,
  requireToken,
  writeConfig,
} from "../_lib/salmonmetrics.js";

export async function onRequestGet({ request, env }) {
  const authError = requireToken(request, env);
  if (authError) return authError;
  return jsonResponse(await readConfig(env));
}

export async function onRequestPost({ request, env }) {
  const authError = requireToken(request, env);
  if (authError) return authError;

  try {
    return jsonResponse(await writeConfig(env, await request.json()));
  } catch (error) {
    return jsonResponse({ error: error.message || String(error) }, { status: 400 });
  }
}
