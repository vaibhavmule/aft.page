import type { Env } from "./env";
import { clearSessionCookieHeader } from "./auth";
import { liveSiteHost } from "./site-url";

export type AftViewer = { id: string; email: string };

export const USER_EMAIL_HEADER = "aft-authenticated-user-email";
export const USER_ID_HEADER = "aft-authenticated-user-id";
export const SIGN_IN_PATH = "/signin-with-aft";
export const SIGN_OUT_PATH = "/signout-with-aft";
export const ME_PATH = "/_aft/me";

const IDENTITY_PATHS = new Set([SIGN_IN_PATH, SIGN_OUT_PATH, ME_PATH]);

export function isAftIdentityPath(pathname: string): boolean {
  return IDENTITY_PATHS.has(normalizePath(pathname));
}

export function applyAftIdentityHeaders(
  headers: Headers,
  user: AftViewer | null,
): void {
  headers.delete(USER_EMAIL_HEADER);
  headers.delete(USER_ID_HEADER);
  if (!user) return;
  headers.set(USER_EMAIL_HEADER, user.email);
  headers.set(USER_ID_HEADER, user.id);
}

export function handleAftIdentityRequest(
  request: Request,
  env: Env,
  slug: string,
  user: AftViewer | null,
): Response | null {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (!IDENTITY_PATHS.has(path)) return null;

  const root = env.ROOT_DOMAIN || "aft.page";
  const origin = `https://${liveSiteHost(slug, root)}`;
  const returnTo = sameOriginReturnTo(url.searchParams.get("return_to"), origin);

  if (path === ME_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405 });
    }
    return Response.json(
      { user },
      { headers: { "cache-control": "private, no-store" } },
    );
  }

  if (path === SIGN_IN_PATH) {
    if (user) return redirect(returnTo);
    const login = new URL(`https://${root}/login`);
    login.searchParams.set("next", returnTo);
    return redirect(login.toString());
  }

  if (path === SIGN_OUT_PATH) {
    const headers = new Headers({
      location: returnTo,
      "set-cookie": clearSessionCookieHeader(env),
      "cache-control": "private, no-store",
    });
    return new Response(null, { status: 302, headers });
  }

  return null;
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function sameOriginReturnTo(raw: string | null, origin: string): string {
  const fallback = `${origin}/`;
  if (!raw) return fallback;
  try {
    const next = new URL(raw, origin);
    if (next.origin !== origin) return fallback;
    if (IDENTITY_PATHS.has(normalizePath(next.pathname))) return fallback;
    return `${next.origin}${next.pathname}${next.search}${next.hash}`;
  } catch {
    return fallback;
  }
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "private, no-store" },
  });
}
