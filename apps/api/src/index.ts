/**
 * aft.page API + static serve Worker.
 */
import type { Env } from "./env";
import { handleClaimRoute, getSiteInfo } from "./claim";
import { deploy } from "./deploy";
import { ensureDb } from "./db";
import {
  isApiHost,
  json,
  optionsResponse,
  redirectHttpToHttps,
  subdomainSlug,
  testHostCase,
  withHsts,
} from "./http";
import { serveSite } from "./serve";
import { handleSharingRoute, sharingNeedsCredentials } from "./sharing";
import { handleLifecycleRoute } from "./lifecycle";
import {
  handleConnectorRoute,
  connectorNeedsCredentials,
} from "./connector";
import { handleAuthRoute, authNeedsCredentials } from "./auth-login";
import { handleWaitlistSignup } from "./waitlist";
import { handleFeedback } from "./feedback";
import { handleCliEvent } from "./cli-event";
import { handleCliPreflight } from "./cli-preflight";
import { handleCodeGenerate } from "./code";
import { handleRepoRoute } from "./repo";
import { handleJobCompleteRoute, handleJobRoute } from "./jobs";
import { handleOps, isOpsHost } from "./ops";
import {
  handleStatus,
  isStatusHost,
  runStatusChecks,
} from "./status";
import { pruneDeployFailures } from "./db";
import { pruneSiteLogs } from "./site-logs";
import { sweepUnusedAnonSites } from "./anon-gc";
import { refreshCfPracticesIfStale } from "./cf-practices";
import { pruneAuditRuns, runAuditSuite } from "./audit";
import { attachPublicFlight, pruneSmokeRuns, runSmokeSuite, SMOKE_CRON } from "./smoke";
import { parseDeployPreviewLabel, smokeSlugForCase } from "./site-url";
import {
  alertIfAuditFailed,
  alertIfSmokeFailed,
  alertIfStatusMajor,
  alertPlatform500,
  alertUnhandled,
  maybeSendDeployDigest,
} from "./ops-alert";
import { handleChangelog } from "./changelog";
import {
  handleCustomDomainRoute,
  slugForCustomHost,
} from "./custom-domains";

export { sanitizeHtmlDocument } from "./upload";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const bounced = redirectHttpToHttps(request);
    if (bounced) return bounced;
    try {
      const res = withHsts(await routeRequest(request, env, ctx));
      if (res.status >= 500) {
        ctx.waitUntil(alertPlatform500(env, request, res).catch(() => false));
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", message }));
      ctx.waitUntil(alertUnhandled(env, request, err).catch(() => false));
      return withHsts(json({ error: "internal" }, 500));
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (controller.cron === SMOKE_CRON) {
      try {
        const result = await runSmokeSuite(env, { trigger: "cron" });
        ctx.waitUntil(alertIfSmokeFailed(env, result).catch(() => false));
        ctx.waitUntil(
          attachPublicFlight(env, result.id).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(JSON.stringify({ level: "error", event: "smoke_flight", message }));
          }),
        );
        ctx.waitUntil(
          runAuditSuite(env, { trigger: "cron" })
            .then((audit) => alertIfAuditFailed(env, audit))
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              console.error(JSON.stringify({ level: "error", event: "audit_cron", message }));
            }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: "error", event: "smoke_cron", message }));
        ctx.waitUntil(
          alertUnhandled(
            env,
            new Request("https://api.aft.page/health"),
            err,
          ).catch(() => false),
        );
      }
      return;
    }
    ctx.waitUntil(
      (async () => {
        const snap = await runStatusChecks(env);
        await alertIfStatusMajor(env, snap);
        await maybeSendDeployDigest(env);
        await refreshCfPracticesIfStale(env);
        await pruneDeployFailures(env);
        await pruneSiteLogs(env);
        await pruneSmokeRuns(env);
        await pruneAuditRuns(env);
        await sweepUnusedAnonSites(env);
      })().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ level: "error", event: "status_cron", message }));
      }),
    );
  },
} satisfies ExportedHandler<Env>;

async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const root = (env.ROOT_DOMAIN || "aft.page").toLowerCase();

  // Thin remote MCP — mcp.aft.page is reserved (not a site slug).
  if (host === `mcp.${root}`) {
    if (!env.MCP) {
      return json({ error: "mcp_unavailable" }, 503);
    }
    return env.MCP.fetch(request);
  }

  // Sales agent retired — send founders to ops checklist.
  if (host === `sales.${root}`) {
    return Response.redirect(`https://ops.${root}/todos`, 302);
  }

  // Keep the public signup's preflight and redacted storage-error response
  // independent of the global schema bootstrap below.
  if (
    isApiHost(host, root) &&
    url.pathname === "/v1/waitlist" &&
    (request.method === "POST" || request.method === "OPTIONS")
  ) {
    if (request.method === "OPTIONS") {
      return optionsResponse(request.headers.get("origin"), false);
    }
    return await handleWaitlistSignup(request, env);
  }

  // Public product feedback — kept before the schema bootstrap like waitlist.
  if (
    isApiHost(host, root) &&
    url.pathname === "/v1/feedback" &&
    (request.method === "POST" || request.method === "OPTIONS")
  ) {
    if (request.method === "OPTIONS") {
      return optionsResponse(request.headers.get("origin"), false);
    }
    return await handleFeedback(request, env);
  }

  // Opt-in anonymous CLI usage (command + version). No auth.
  if (
    isApiHost(host, root) &&
    url.pathname === "/v1/cli/event" &&
    (request.method === "POST" || request.method === "OPTIONS")
  ) {
    return await handleCliEvent(request, env);
  }

  // CLI preflight — rules + optional Workers AI. No auth.
  if (
    isApiHost(host, root) &&
    url.pathname === "/v1/cli/preflight" &&
    (request.method === "POST" || request.method === "OPTIONS")
  ) {
    return await handleCliPreflight(request, env);
  }

  if (isStatusHost(host, root)) {
    return await handleStatus(request, env, url);
  }

  if (isOpsHost(host, root)) {
    return await handleOps(request, env, url, ctx);
  }

  await ensureDb(env);

  if (isApiHost(host, root)) {
    return await handleApi(request, env, url);
  }

  const testCase = testHostCase(host, root);
  if (testCase !== null) {
    if (testCase === "") {
      return Response.redirect(`https://ops.${root}/smoke`, 302);
    }
    return await serveSite(
      request,
      env,
      smokeSlugForCase(testCase),
      url.pathname,
    );
  }

  const slug = subdomainSlug(host, root);
  if (slug) {
    const preview = parseDeployPreviewLabel(slug);
    if (preview && !(await env.SITES.get(`site:${slug}`))) {
      return await serveSite(
        request,
        env,
        preview.slug,
        url.pathname,
        `dep_${preview.short}`,
      );
    }
    return await serveSite(request, env, slug, url.pathname);
  }

  const customSlug = await slugForCustomHost(env, host);
  if (customSlug) {
    return await serveSite(request, env, customSlug, url.pathname);
  }

  return json({ error: "unknown_host", host }, 404);
}

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
    url.pathname === "/v1/me" ||
    url.pathname.startsWith("/v1/me/") ||
    url.pathname === "/v1/deploy" ||
    url.pathname === "/v1/code/generate" ||
    url.pathname.startsWith("/v1/repo/") ||
    url.pathname.startsWith("/v1/jobs/") ||
    url.pathname.includes("/deploys") ||
    url.pathname.includes("/logs") ||
    url.pathname.includes("/files") ||
    url.pathname.includes("/rollback") ||
    url.pathname.includes("/capabilities") ||
    url.pathname.includes("/secrets") ||
    url.pathname.includes("/domains");

  if (request.method === "OPTIONS") {
    return optionsResponse(origin, creds);
  }

  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true });
  }

  const changelog = await handleChangelog(request, env, url);
  if (changelog) return changelog;

  if (
    (url.pathname === "/v1/deploy" && request.method === "POST") ||
    (url.pathname === "/v1/deploy" && request.method === "PATCH")
  ) {
    return deploy(request, env);
  }

  if (url.pathname === "/v1/code/generate") {
    return handleCodeGenerate(request, env);
  }

  const repo = await handleRepoRoute(request, env, url);
  if (repo) return repo;

  const jobComplete = await handleJobCompleteRoute(request, env, url);
  if (jobComplete) return jobComplete;

  const jobs = await handleJobRoute(request, env, url);
  if (jobs) return jobs;

  if (
    url.pathname === "/v1/claim/start" ||
    url.pathname === "/v1/claim/session" ||
    url.pathname === "/v1/claim/verify"
  ) {
    return handleClaimRoute(request, env, url);
  }

  const auth = await handleAuthRoute(request, env, url);
  if (auth) return auth;

  const lifecycle = await handleLifecycleRoute(request, env, url);
  if (lifecycle) return lifecycle;

  const domains = await handleCustomDomainRoute(request, env, url);
  if (domains) return domains;

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
      claim: "POST /v1/claim/start, POST /v1/claim/session, GET /v1/claim/verify",
      auth: "POST /v1/auth/start, GET /v1/auth/verify, GET /v1/auth/google, GET /v1/auth/google/callback, GET /v1/auth/cli, GET /v1/auth/cli/complete, POST /v1/auth/cli/exchange, POST /v1/auth/logout, GET /v1/me",
      waitlist: "POST /v1/waitlist",
      cli: "POST /v1/cli/event, POST /v1/cli/preflight",
      code: "POST /v1/code/generate (session; prompt or template → HTML)",
      run: "POST /v1/repo/check, POST /v1/repo/deploy (detect → static | vite | next | fail). GET /v1/jobs/{id}, GET /v1/jobs/{id}/events",
      changelog: "GET /v1/changelog · GET /v1/changelog.md",
      sharing:
        "PATCH /v1/sites/{slug}, POST /v1/sites/{slug}/rename, POST /v1/sites/{slug}/access, POST/GET/DELETE /v1/sites/{slug}/invites, PATCH|DELETE /v1/sites/{slug}/members/{id}, GET /v1/invites/accept",
      inventory: "GET /v1/me, GET /v1/me/sites?page=&limit=, GET /v1/me/domains?status=&slug=, GET /v1/sites/{slug}/deploys, GET /v1/sites/{slug}/files, GET /v1/sites/{slug}/logs, POST /v1/sites/{slug}/rollback",
      capabilities: "GET|POST /v1/sites/{slug}/capabilities",
      secrets: "GET /v1/sites/{slug}/secrets, PUT|DELETE /v1/sites/{slug}/secrets/{name}",
      domains:
        "GET|POST /v1/sites/{slug}/domains, POST /v1/sites/{slug}/domains/access, POST|DELETE /v1/sites/{slug}/domains/{hostname}",
      connector:
        "POST /v1/sites/{slug}/connector/tokens, GET /v1/connector/poll, POST /v1/connector/result/{id}, POST /v1/sites/{slug}/connector/invoke",
      serve: "https://{slug}.aft.page or GET /s/{slug}/",
      status: "https://status.aft.page/",
    });
  }

  return json({ error: "not_found" }, 404);
}

export type { Env };
