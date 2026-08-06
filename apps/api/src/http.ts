import type { Env } from "./env";

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

/** True for apex aft.page, marketing localhost, or https://{slug}.aft.page. */
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
  h.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
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

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "0.0.0.0";
}

export function cookieDomain(env: Env): string {
  const root = env.ROOT_DOMAIN || "aft.page";
  return `.${root}`;
}
