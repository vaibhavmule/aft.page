/** POST /v1/cli/event — opt-in anonymous CLI usage (cmd + version). */
import type { Env } from "./env";
import { json, optionsResponse } from "./http";
import { trackCliUsage } from "./metrics";
import { rateLimit } from "./rate-limit";

const MAX_CMD = 64;
const MAX_VERSION = 32;

type Body = { cmd?: unknown; version?: unknown };

export async function handleCliEvent(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return optionsResponse(origin, false);
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await rateLimit(env, `cli-event:${ip}`, 60, 60))) {
    return json({ error: "rate_limited" }, 429);
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const cmd =
    typeof body.cmd === "string" ? body.cmd.trim().slice(0, MAX_CMD) : "";
  if (!cmd || !/^[a-z][a-z0-9_-]*$/i.test(cmd)) {
    return json({ error: "invalid_cmd" }, 400);
  }
  const version =
    typeof body.version === "string"
      ? body.version.trim().slice(0, MAX_VERSION)
      : undefined;

  await trackCliUsage(env, request, { cmd, version });
  return new Response(null, { status: 204 });
}
