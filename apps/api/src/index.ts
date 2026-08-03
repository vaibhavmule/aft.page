/**
 * aft.page API + static serve Worker.
 */
import type { Env } from "./env";
import { handleClaimRoute, getSiteInfo } from "./claim";
import { deploy } from "./deploy";
import { ensureDb } from "./db";
import {
  corsHeaders,
  isApiHost,
  json,
  optionsResponse,
  subdomainSlug,
} from "./http";
import { serveSite } from "./serve";
import { handleSharingRoute, sharingNeedsCredentials } from "./sharing";
import { handleLifecycleRoute } from "./lifecycle";
import {
  handleConnectorRoute,
  connectorNeedsCredentials,
} from "./connector";
import { handleAuthRoute, authNeedsCredentials } from "./auth-login";

export { sanitizeHtmlDocument } from "./upload";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const root = (env.ROOT_DOMAIN || "aft.page").toLowerCase();

    try {
      await ensureDb(env);

      if (isApiHost(host, root)) {
        return await handleApi(request, env, url);
      }

      const slug = subdomainSlug(host, root);
      if (slug) {
        return await serveSite(request, env, slug, url.pathname);
      }

      return json({ error: "unknown_host", host }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", message }));
      return json({ error: "internal", message }, 500);
    } finally {
      void ctx;
    }
  },
};

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const origin = request.headers.get("origin");
  const creds =
    sharingNeedsCredentials(url.pathname) ||
    connectorNeedsCredentials(url.pathname) ||
    authNeedsCredentials(url.pathname) ||
    url.pathname.startsWith("/v1/me/") ||
    url.pathname.includes("/deploys") ||
    url.pathname.includes("/rollback") ||
    url.pathname.includes("/capabilities");

  if (request.method === "OPTIONS") {
    return optionsResponse(origin, creds);
  }

  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true });
  }

  if (
    (url.pathname === "/v1/deploy" && request.method === "POST") ||
    (url.pathname === "/v1/deploy" && request.method === "PATCH")
  ) {
    return deploy(request, env);
  }

  if (
    url.pathname === "/v1/claim/start" ||
    url.pathname === "/v1/claim/verify"
  ) {
    return handleClaimRoute(request, env, url);
  }

  const auth = await handleAuthRoute(request, env, url);
  if (auth) return auth;

  const lifecycle = await handleLifecycleRoute(request, env, url);
  if (lifecycle) return lifecycle;

  const connector = await handleConnectorRoute(request, env, url);
  if (connector) return connector;

  const sharing = await handleSharingRoute(request, env, url);
  if (sharing) return sharing;

  const siteMatch = url.pathname.match(/^\/v1\/sites\/([a-z0-9-]+)$/);
  if (siteMatch && request.method === "GET") {
    return getSiteInfo(request, env, siteMatch[1]!);
  }

  const pathServe = url.pathname.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/);
  if (pathServe && request.method === "GET") {
    const slug = pathServe[1]!;
    const rest = pathServe[2] || "/";
    return serveSite(request, env, slug, rest);
  }

  if (url.pathname === "/" && request.method === "GET") {
    return json({
      service: "aft.page",
      deploy: "POST /v1/deploy (multipart files, or text/html body)",
      redeploy: "PATCH /v1/deploy?slug= (editToken or session owner/editor)",
      claim: "POST /v1/claim/start, GET /v1/claim/verify",
      auth: "POST /v1/auth/start, GET /v1/auth/verify",
      sharing:
        "PATCH /v1/sites/{slug}, POST/GET /v1/sites/{slug}/invites, GET /v1/invites/accept",
      inventory: "GET /v1/me/sites, GET /v1/sites/{slug}/deploys, POST /v1/sites/{slug}/rollback",
      capabilities: "GET|POST /v1/sites/{slug}/capabilities",
      connector:
        "POST /v1/sites/{slug}/connector/tokens, GET /v1/connector/poll, POST /v1/connector/result/{id}, POST /v1/sites/{slug}/connector/invoke",
      serve: "https://{slug}.aft.page or GET /s/{slug}/",
    });
  }

  return json({ error: "not_found" }, 404);
}

export type { Env };
