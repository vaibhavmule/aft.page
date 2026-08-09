/**
 * Google OAuth → same aft_session as magic link (email is the user id).
 */
import type { Env } from "./env";
import {
  createSession,
  findOrCreateUser,
  isValidEmail,
  normalizeEmail,
  randomToken,
  safeAuthRedirect,
  sessionCookieHeader,
  sha256Hex,
} from "./auth";
import { clientIp } from "./http";
import { rateLimit } from "./rate-limit";

const OAUTH_MINUTES = 10;
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleAuthConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(env: Env): string {
  const root = env.ROOT_DOMAIN || "aft.page";
  return `https://api.${root}/v1/auth/google/callback`;
}

export async function handleGoogleStart(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const root = env.ROOT_DOMAIN || "aft.page";
  const nextRaw = url.searchParams.get("next") || "";

  if (!googleAuthConfigured(env)) {
    return loginRedirect(root, "google_unavailable", nextRaw);
  }

  const ip = clientIp(request);
  if (!(await rateLimit(env, `auth:google:${ip}`, 40, 3600))) {
    return loginRedirect(root, "rate_limited", nextRaw);
  }

  const nonce = randomToken("g_").slice(2, 34);
  const exp = Date.now() + OAUTH_MINUTES * 60 * 1000;
  const cookie = await signOAuthCookie(env, { n: nonce, next: nextRaw || undefined, exp });

  const dest = new URL(GOOGLE_AUTH);
  dest.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  dest.searchParams.set("redirect_uri", googleRedirectUri(env));
  dest.searchParams.set("response_type", "code");
  dest.searchParams.set("scope", "openid email");
  dest.searchParams.set("state", nonce);
  dest.searchParams.set("prompt", "select_account");

  return new Response(null, {
    status: 302,
    headers: {
      Location: dest.toString(),
      "Set-Cookie": oauthCookieHeader(cookie, OAUTH_MINUTES * 60),
    },
  });
}

export async function handleGoogleCallback(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const root = env.ROOT_DOMAIN || "aft.page";
  const payload = await readOAuthCookie(env, request);
  const nextRaw = payload?.next || "";

  if (url.searchParams.get("error")) {
    return loginRedirect(root, "google_denied", nextRaw, true);
  }

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !payload || payload.n !== state || payload.exp < Date.now()) {
    return loginRedirect(root, "google_failed", nextRaw, true);
  }

  if (!googleAuthConfigured(env)) {
    return loginRedirect(root, "google_unavailable", nextRaw, true);
  }

  const email = await googleEmailFromCode(
    env,
    code,
    googleRedirectUri(env),
    googleHttp.fetch,
  );
  if (email === "unverified") {
    return loginRedirect(root, "google_unverified", nextRaw, true);
  }
  if (!email) {
    return loginRedirect(root, "google_failed", nextRaw, true);
  }

  const user = await findOrCreateUser(env, email);
  const session = await createSession(env, user.id);
  const redirect = safeAuthRedirect(nextRaw || "/projects", root);

  const headers = new Headers();
  headers.set("Location", redirect);
  headers.append("Set-Cookie", sessionCookieHeader(env, session.token, session.expiresAt));
  headers.append("Set-Cookie", oauthCookieHeader("", 0));

  return new Response(null, { status: 302, headers });
}

export type GoogleFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Tests swap this; production keeps global fetch. */
export const googleHttp: { fetch: GoogleFetcher } = { fetch };

/** Returns normalized email, `"unverified"`, or null. */
export async function googleEmailFromCode(
  env: Env,
  code: string,
  redirectUri: string,
  fetcher: GoogleFetcher = googleHttp.fetch,
): Promise<string | "unverified" | null> {
  const tokenRes = await fetcher(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return null;

  const infoRes = await fetcher(GOOGLE_USERINFO, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean | string;
  };
  const email = info.email ? normalizeEmail(info.email) : "";
  if (!isValidEmail(email)) return null;
  if (info.email_verified !== true && info.email_verified !== "true") {
    return "unverified";
  }
  return email;
}

type OAuthPayload = { n: string; next?: string; exp: number };

async function signOAuthCookie(
  env: Env,
  payload: OAuthPayload,
): Promise<string> {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await sha256Hex(`${env.AUTH_SECRET}:oauth:${body}`);
  return `${sig}.${body}`;
}

async function readOAuthCookie(
  env: Env,
  request: Request,
): Promise<OAuthPayload | null> {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)aft_oauth=([^;]+)/);
  if (!m) return null;
  const raw = decodeURIComponent(m[1]!);
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const sig = raw.slice(0, dot);
  const body = raw.slice(dot + 1);
  const expect = await sha256Hex(`${env.AUTH_SECRET}:oauth:${body}`);
  if (!timingSafeEqual(sig, expect)) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(body)) as OAuthPayload;
    if (!parsed || typeof parsed.n !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function oauthCookieHeader(value: string, maxAge: number): string {
  if (maxAge <= 0) {
    return "aft_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  }
  return `aft_oauth=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function loginRedirect(
  root: string,
  error: string,
  next: string,
  clearOAuth = false,
): Response {
  const u = new URL(`https://${root}/login`);
  u.searchParams.set("error", error);
  if (next) u.searchParams.set("next", next);
  const headers = new Headers({ Location: u.toString() });
  if (clearOAuth) headers.set("Set-Cookie", oauthCookieHeader("", 0));
  return new Response(null, { status: 302, headers });
}

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
