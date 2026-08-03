/**
 * Magic-link login (no site claim) — Phase 1 success-test unblocker.
 */
import type { Env } from "./env";
import {
  createLoginMagicLink,
  consumeLoginMagicLink,
  createSession,
  findOrCreateUser,
  isValidEmail,
  normalizeEmail,
  sendLoginEmail,
  sessionCookieHeader,
} from "./auth";
import { corsHeaders, json, optionsResponse, clientIp } from "./http";
import { rateLimit } from "./rate-limit";

export function authNeedsCredentials(pathname: string): boolean {
  return pathname.startsWith("/v1/auth/");
}

export async function handleAuthRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const origin = request.headers.get("origin");

  if (url.pathname === "/v1/auth/start" && request.method === "OPTIONS") {
    return optionsResponse(origin, true);
  }
  if (url.pathname === "/v1/auth/start" && request.method === "POST") {
    return authStart(request, env, origin);
  }
  if (url.pathname === "/v1/auth/verify" && request.method === "GET") {
    return authVerify(request, env, url);
  }
  return null;
}

async function authStart(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));

  let body: { email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const email = body.email ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) {
    return json(
      { error: "invalid_request", hint: "email required" },
      400,
      extra,
    );
  }

  const ip = clientIp(request);
  if (!(await rateLimit(env, `auth:ip:${ip}`, 20, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }
  if (!(await rateLimit(env, `auth:email:${email}`, 5, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }

  const { token } = await createLoginMagicLink(env, email);

  try {
    await sendLoginEmail(env, email, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: "error", where: "login_email", message }),
    );
    return json({ error: "email_failed", message }, 503, extra);
  }

  return json({ ok: true, message: "check_your_email" }, 200, extra);
}

async function authVerify(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const token = url.searchParams.get("token") || "";
  if (!token) {
    return json({ error: "invalid_request" }, 400);
  }

  const row = await consumeLoginMagicLink(env, token);
  if (!row) {
    return json({ error: "invalid_or_expired_token" }, 400);
  }

  const user = await findOrCreateUser(env, row.email);
  const session = await createSession(env, user.id);
  const root = env.ROOT_DOMAIN || "aft.page";
  const next = url.searchParams.get("next") || "/inventory";
  const redirectPath = next.startsWith("/") ? next : "/inventory";
  const redirect = `https://${root}${redirectPath}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect,
      "Set-Cookie": sessionCookieHeader(env, session.token, session.expiresAt),
    },
  });
}
