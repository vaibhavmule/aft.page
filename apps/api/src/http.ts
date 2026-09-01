import type { Env } from "./env";
import { RESERVED_SLUGS } from "./env";
import { parseDeployPreviewLabel, smokeSlugForCase } from "./site-url";

export function json(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    ...Object.fromEntries(corsHeaders(null, false)),
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

/** Auth / session-scoped JSON — never cache across users. */
export function privateJson(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return json(data, status, {
    "cache-control": "private, no-store",
    ...extraHeaders,
  });
}

/** True for apex aft.page, www localhost, or https://{slug}.aft.page. */
export function isAllowedWebOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (
    origin === "https://aft.page" ||
    origin === "http://localhost:8788" ||
    origin === "http://127.0.0.1:8788"
  ) {
    return true;
  }
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "aft.page" || host.endsWith(".aft.page")) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
  } catch {
    return false;
  }
  return false;
}

/** CORS for agent deploy (open) vs preview/site credentialed calls. */
export function corsHeaders(
  origin: string | null,
  credentials: boolean,
): Headers {
  const h = new Headers();
  if (origin && isAllowedWebOrigin(origin)) {
    h.set("access-control-allow-origin", origin);
    if (credentials) {
      h.set("access-control-allow-credentials", "true");
    }
  } else {
    h.set("access-control-allow-origin", "*");
  }
  h.set(
    "access-control-allow-methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  h.set(
    "access-control-allow-headers",
    "content-type, authorization, x-aft-client, x-aft-edit-token",
  );
  return h;
}

export function optionsResponse(origin: string | null, credentials: boolean): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, credentials),
  });
}

/** 180d — CF Security Insights minimum. No preload (hard to undo). */
export const HSTS = "max-age=15552000; includeSubDomains";

function clientScheme(request: Request): string {
  const visitor = request.headers.get("cf-visitor");
  if (visitor) {
    try {
      const scheme = (JSON.parse(visitor) as { scheme?: unknown }).scheme;
      if (scheme === "http" || scheme === "https") return scheme;
    } catch {
      /* ignore */
    }
  }
  const xfp = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (xfp === "http" || xfp === "https") return xfp;
  return new URL(request.url).protocol.replace(":", "");
}

/** 301 http→https. Skip loopback so `wrangler dev` stays on http. */
export function redirectHttpToHttps(request: Request): Response | null {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return null;
  if (clientScheme(request) !== "http") return null;
  url.protocol = "https:";
  return Response.redirect(url.toString(), 301);
}

export function withHsts(res: Response): Response {
  try {
    res.headers.set("strict-transport-security", HSTS);
    if (res.headers.get("strict-transport-security") === HSTS) return res;
  } catch {
    /* immutable Headers from a subrequest */
  }
  const headers = new Headers(res.headers);
  headers.set("strict-transport-security", HSTS);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function isApiHost(host: string, root: string): boolean {
  if (host === `api.${root}`) return true;
  if (host.endsWith(".workers.dev")) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
}

/** wrangler dev — not production api.aft.page. */
export function isLoopbackRequest(request: Request): boolean {
  const host = new URL(request.url).hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

export function subdomainSlug(host: string, root: string): string | null {
  if (host === root || host === `www.${root}`) return null;
  if (!host.endsWith(`.${root}`)) return null;
  const sub = host.slice(0, -(root.length + 1));
  if (!sub || sub.includes(".")) return null;
  return sub.toLowerCase();
}

/**
 * `{case}.test.{root}` → case id; `test.{root}` → "".
 * One extra label past the zone wildcard — needs its own DNS + Worker route.
 */
export function testHostCase(host: string, root: string): string | null {
  const h = host.toLowerCase();
  const apex = `test.${root}`;
  if (h === apex) return "";
  const suffix = `.${apex}`;
  if (!h.endsWith(suffix)) return null;
  const left = h.slice(0, -suffix.length);
  if (!left || left.includes(".")) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(left)) return null;
  return left;
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "0.0.0.0";
}

export function cookieDomain(env: Env): string {
  const root = env.ROOT_DOMAIN || "aft.page";
  return `.${root}`;
}

/**
 * Tenant hosts share Domain=.aft.page session cookies. A credentialed call
 * from https://{attacker}.aft.page must not act on another slug.
 * No Origin/Referer = non-browser (curl, MCP, editToken header) — allow.
 * Product hosts (apex, ops, preview, …) may act on any slug.
 */
export function originMayActOnSlug(
  request: Request,
  slug: string,
  root: string,
): boolean {
  const raw = request.headers.get("origin") || request.headers.get("referer") || "";
  if (!raw) return true;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === root) return true;
  const testCase = testHostCase(host, root);
  if (testCase !== null) {
    return testCase !== "" && smokeSlugForCase(testCase) === slug;
  }
  if (!host.endsWith(`.${root}`)) return true;
  const left = host.slice(0, -(root.length + 1));
  if (!left || left.includes(".")) return false;
  if (RESERVED_SLUGS.has(left)) return true;
  const preview = parseDeployPreviewLabel(left);
  if (preview && preview.slug === slug) return true;
  return left === slug;
}
