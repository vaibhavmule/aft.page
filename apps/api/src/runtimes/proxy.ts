import {
  applyAftIdentityHeaders,
  type AftViewer,
} from "../aft-identity";

const PLATFORM_COOKIE_NAMES = new Set(["aft_session", "aft_oauth"]);

/**
 * Proxy slug.aft.page → upstream Worker (temp account or aft-owned Worker).
 *
 * Tenant upstreams are untrusted. Never forward platform session cookies or
 * let upstream Set-Cookie bind Domain=.aft.page (session theft / fixation).
 */
export async function proxyUpstream(
  request: Request,
  upstreamBase: string,
  user: AftViewer | null = null,
  root = "aft.page",
): Promise<Response> {
  const incoming = new URL(request.url);
  const base = new URL(upstreamBase);
  const target = new URL(
    incoming.pathname + incoming.search,
    base.origin.endsWith("/") ? base.origin : `${base.origin}/`,
  );
  // Preserve path from upstream base if it includes a path prefix.
  if (base.pathname && base.pathname !== "/") {
    const prefix = base.pathname.replace(/\/$/, "");
    target.pathname = `${prefix}${incoming.pathname}`;
  }

  const headers = sanitizeProxyRequestHeaders(request.headers, user);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-aft-proxy", "1");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // @ts-expect-error duplex required for streaming bodies in Workers
    init.duplex = "half";
  }

  const upstream = await fetch(target.toString(), init);
  const out = sanitizeProxyResponseHeaders(upstream.headers, root);
  out.set("x-aft-upstream", base.origin);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export function sanitizeProxyRequestHeaders(
  incoming: Headers,
  user: AftViewer | null,
): Headers {
  const headers = new Headers(incoming);
  headers.delete("host");
  headers.delete("x-aft-edit-token");

  const cookie = headers.get("cookie");
  if (cookie) {
    const kept = filterPlatformCookies(cookie);
    if (kept) headers.set("cookie", kept);
    else headers.delete("cookie");
  }

  const auth = headers.get("authorization") || "";
  if (/^Bearer\s+aft_(sess|cli|magic)_/i.test(auth.trim())) {
    headers.delete("authorization");
  }

  applyAftIdentityHeaders(headers, user);
  return headers;
}

/** Drop aft_session / aft_oauth; keep tenant cookies for Next.js etc. */
export function filterPlatformCookies(cookie: string): string | null {
  const kept = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const name = part.split("=")[0]!.trim().toLowerCase();
      return !PLATFORM_COOKIE_NAMES.has(name);
    });
  return kept.length ? kept.join("; ") : null;
}

export function sanitizeProxyResponseHeaders(
  upstream: Headers,
  root: string,
): Headers {
  const out = new Headers(upstream);
  const rawCookies =
    typeof upstream.getSetCookie === "function" ? upstream.getSetCookie() : [];
  out.delete("set-cookie");
  for (const raw of rawCookies) {
    const cleaned = sanitizeUpstreamSetCookie(raw, root);
    if (cleaned) out.append("set-cookie", cleaned);
  }
  return out;
}

/**
 * Drop platform cookie names. Strip Domain=.aft.page so a tenant upstream
 * cannot plant a cookie on every *.aft.page host.
 */
export function sanitizeUpstreamSetCookie(raw: string, root: string): string | null {
  const parts = raw.split(";");
  const nameValue = parts[0]?.trim() || "";
  const name = nameValue.split("=")[0]?.trim().toLowerCase();
  if (!name || PLATFORM_COOKIE_NAMES.has(name)) return null;

  const rootLc = root.toLowerCase();
  const attrs = parts.slice(1).filter((attr) => {
    const t = attr.trim();
    const eq = t.indexOf("=");
    const key = (eq === -1 ? t : t.slice(0, eq)).trim().toLowerCase();
    if (key !== "domain") return true;
    const val = (eq === -1 ? "" : t.slice(eq + 1))
      .trim()
      .toLowerCase()
      .replace(/^\./, "");
    return val !== rootLc;
  });
  return [nameValue, ...attrs].join(";");
}
