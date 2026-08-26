/**
 * Magic-link login (no site claim) — Phase 1 success-test unblocker.
 */
import type { Env } from "./env";
import {
  clearSessionCookieHeader,
  createLoginMagicLink,
  consumeLoginMagicLink,
  createSession,
  findOrCreateUser,
  isValidEmail,
  normalizeEmail,
  resolveSessionUser,
  safeAuthRedirect,
  sendLoginEmail,
  sessionCookieHeader,
} from "./auth";
import { handleGoogleCallback, handleGoogleStart } from "./auth-google";
import { handleCliAuthRoute } from "./auth-cli";
import {
  corsHeaders,
  json,
  optionsResponse,
  clientIp,
  privateJson,
  rejectNonProductOrigin,
} from "./http";
import { rateLimit } from "./rate-limit";

export function authNeedsCredentials(pathname: string): boolean {
  return pathname.startsWith("/v1/auth/") || pathname === "/v1/me";
}

export async function handleAuthRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const cli = await handleCliAuthRoute(request, env, url);
  if (cli) return cli;

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
  if (url.pathname === "/v1/auth/google" && request.method === "GET") {
    return handleGoogleStart(request, env, url);
  }
  if (url.pathname === "/v1/auth/google/callback" && request.method === "GET") {
    return handleGoogleCallback(request, env, url);
  }
  if (url.pathname === "/v1/auth/logout" && request.method === "OPTIONS") {
    return optionsResponse(origin, true);
  }
  if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
    return authLogout(request, env, origin);
  }
  if (url.pathname === "/v1/me" && request.method === "OPTIONS") {
    return optionsResponse(origin, true);
  }
  if (url.pathname === "/v1/me" && request.method === "GET") {
    return authMe(request, env, origin);
  }
  return null;
}

async function authMe(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const blocked = rejectNonProductOrigin(request, env.ROOT_DOMAIN || "aft.page");
  if (blocked) return blocked;
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const user = await resolveSessionUser(env, request);
  if (!user) return privateJson({ error: "unauthorized" }, 401, extra);
  return privateJson({ id: user.id, email: user.email }, 200, extra);
}

async function authLogout(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const blocked = rejectNonProductOrigin(request, env.ROOT_DOMAIN || "aft.page");
  if (blocked) return blocked;
  const extra = Object.fromEntries(corsHeaders(origin, true));
  return json(
    { ok: true },
    200,
    {
      ...extra,
      "Set-Cookie": clearSessionCookieHeader(env),
    },
  );
}

async function authStart(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));

  let body: { email?: string; next?: string };
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
  if (!(await rateLimit(env, `auth:ip:${ip}`, 40, 3600))) {
    return json(
      {
        error: "rate_limited",
        hint: "Too many login attempts from this network. Try again in about an hour.",
      },
      429,
      extra,
    );
  }
  if (!(await rateLimit(env, `auth:email:${email}`, 10, 3600))) {
    return json(
      {
        error: "rate_limited",
        hint: "Too many login emails to this address. Try again in about an hour, or check your inbox for an earlier link.",
      },
      429,
      extra,
    );
  }

  const { token } = await createLoginMagicLink(env, email);
  const next =
    typeof body.next === "string" && body.next.trim()
      ? body.next.trim()
      : undefined;

  try {
    await sendLoginEmail(env, email, token, next ? { next } : undefined);
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
  const next = url.searchParams.get("next") || "/projects";
  const redirect = safeAuthRedirect(next, root);

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect,
      "Set-Cookie": sessionCookieHeader(env, session.token, session.expiresAt),
    },
  });
}
