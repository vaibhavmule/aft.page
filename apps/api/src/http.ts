import type { Env } from "./env";
import { RESERVED_SLUGS } from "./env";
import { smokeSlugForCase } from "./site-url";

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

export function isApiHost(host: string, root: string): boolean {
  if (host === `api.${root}`) return true;
  if (host.endsWith(".workers.dev")) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
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
  return left === slug;
}
