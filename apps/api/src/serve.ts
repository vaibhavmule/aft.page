import type { Env } from "./env";
import { RESERVED_SLUGS } from "./env";
import {
  BRAND,
  BRAND_CSS_VARS,
  BRAND_FONT_LINKS,
  BRAND_WORDMARK_CSS,
} from "./brand";
import { deployExists, getSiteRow, touchLastServed } from "./db";
import { corsHeaders, json } from "./http";
import { trackPageView, trackServe } from "./metrics";
import { injectAftChrome } from "./aft-chrome";
import { ensureDefaultOgMeta, isHtmlContentType } from "./og";
import { isJunkPath } from "./junk-path";
import { queueOwnerLog } from "./site-logs";
import { renderSiteOgImage, siteOgImagePath } from "./og-image";
import { handleLatticeJsApi } from "./runtimes/lattice-js";
import { proxyUpstream } from "./runtimes/proxy";
import { canAccessSite, privateDeniedHtml } from "./sharing";
import { getObject } from "./storage";
import { deployPreviewHost, isSmokeSlug, liveSiteHost } from "./site-url";

function pageTitleFromHtml(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return title || fallback;
}

function servePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function looksLikeDocumentPath(pathname: string): boolean {
  const p = servePath(pathname);
  if (p.endsWith("/")) return true;
  const last = p.split("/").pop() || "";
  return !last.includes(".") || /\.html?$/i.test(last);
}

function bodyBytes(body: ArrayBuffer | ReadableStream): number {
  return body instanceof ArrayBuffer ? body.byteLength : 0;
}

function noteServe(
  env: Env,
  request: Request,
  slug: string,
  opts: {
    httpStatus: number;
    path?: string;
    bytes?: number;
    persist?: boolean;
  },
): void {
  trackServe(env, request, slug, opts);
  if (opts.persist !== false) queueOwnerLog(env, request, slug, opts);
}

export async function serveSite(
  request: Request,
  env: Env,
  slug: string,
  pathname: string,
  pinDeployId?: string,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(null, false) });
  }

  if (RESERVED_SLUGS.has(slug)) {
    return json({ error: "reserved" }, 404);
  }

  const root = env.ROOT_DOMAIN || "aft.page";

  const access = await canAccessSite(env, request, slug);
  if (!access.allowed) {
    const headers = new Headers({
      "cache-control": "private, no-store",
      "x-aft-slug": slug,
    });
    for (const [name, value] of corsHeaders(null, false)) {
      headers.set(name, value);
    }

    if (!access.authenticated) {
      const next = new URL(request.url);
      next.hostname = liveSiteHost(slug, root);
      next.protocol = "https:";
      const login = new URL(`https://${root}/login`);
      login.searchParams.set("next", next.toString());
      headers.set("location", login.toString());
      noteServe(env, request, slug, {
        httpStatus: 302,
        path: servePath(pathname),
      });
      return new Response(null, { status: 302, headers });
    }

    headers.set("content-type", "text/html; charset=utf-8");
    noteServe(env, request, slug, {
      httpStatus: 401,
      path: servePath(pathname),
    });
    return new Response(privateDeniedHtml(slug, root), {
      status: 401,
      headers,
    });
  }

  const raw = await env.SITES.get(`site:${slug}`);
  if (!raw) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
      persist: false,
    });
    return siteNotFoundResponse(request, slug, root);
  }
  const meta = JSON.parse(raw) as {
    deployId: string;
    runtime?: string;
    upstreamUrl?: string | null;
    badge?: boolean;
  };

  const siteRow = await getSiteRow(env, slug);

  if (pinDeployId && !(await deployExists(env, slug, pinDeployId))) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
      persist: false,
    });
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-aft-slug": slug,
        "x-aft-deploy": pinDeployId,
        ...Object.fromEntries(corsHeaders(null, false)),
      },
    });
  }

  const deployId = pinDeployId || meta.deployId;

  // Deactivated: files are kept, but serving is paused until the owner flips it
  // back on from the dashboard. Return a friendly page instead of the content.
  if (siteRow && siteRow.active === false) {
    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-aft-slug": slug,
      "x-aft-active": "0",
    });
    for (const [name, value] of corsHeaders(null, false)) {
      headers.set(name, value);
    }
    noteServe(env, request, slug, {
      httpStatus: 503,
      path: servePath(pathname),
    });
    return new Response(sitePausedHtml(slug, root), { status: 503, headers });
  }

  if (isJunkPath(pathname)) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
    });
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-aft-slug": slug,
        ...Object.fromEntries(corsHeaders(null, false)),
      },
    });
  }

  const runtime = siteRow?.runtime || meta.runtime || "static";
  const upstreamUrl = siteRow?.upstreamUrl || meta.upstreamUrl || null;

  if (!pinDeployId && upstreamUrl && (runtime === "worker" || runtime === "next")) {
    void touchLastServed(env, slug);
    noteServe(env, request, slug, {
      httpStatus: 200,
      path: servePath(pathname),
    });
    if (looksLikeDocumentPath(pathname)) {
      await trackPageView(env, request, slug, {
        path: servePath(pathname),
        contentType: "text/html",
        httpStatus: 200,
      });
    }
    return proxyUpstream(request, upstreamUrl);
  }

  if (runtime === "lattice-js" && pathname.startsWith("/api/")) {
    const api = await handleLatticeJsApi(request, env, slug, pathname);
    if (api) {
      void touchLastServed(env, slug);
      noteServe(env, request, slug, {
        httpStatus: api.status,
        path: servePath(pathname),
      });
      return api;
    }
  }

  if (pathname.startsWith("/api/")) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
    });
    return new Response(JSON.stringify({ error: "not_found", runtime }), {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...Object.fromEntries(corsHeaders(null, false)),
      },
    });
  }

  let path = decodeURIComponent(pathname);
  if (path.endsWith("/")) path += "index.html";
  if (path === "/" || path === "") path = "/index.html";
  path = path.replace(/^\//, "");

  if (path === siteOgImagePath()) {
    let title = slug;
    const index = await getObject(env, slug, deployId, "index.html");
    if (index) {
      title = pageTitleFromHtml(await new Response(index.body).text(), slug);
    }
    const img = await renderSiteOgImage({ title, slug, rootDomain: root });
    img.headers.set("x-aft-slug", slug);
    img.headers.set("x-aft-deploy", deployId);
    for (const [name, value] of corsHeaders(null, false)) {
      img.headers.set(name, value);
    }
    noteServe(env, request, slug, {
      httpStatus: 200,
      path: servePath(pathname),
    });
    return img;
  }

  let obj = await getObject(env, slug, deployId, path);
  if (!obj && !path.includes(".")) {
    obj = await getObject(env, slug, deployId, `${path}/index.html`);
  }
  if (!obj && path !== "index.html") {
    obj = await getObject(env, slug, deployId, "index.html");
  }
  if (!obj) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
    });
    return new Response("Not found", { status: 404 });
  }

  void touchLastServed(env, slug);

  const headers = new Headers();
  headers.set("content-type", obj.contentType);
  headers.set(
    "cache-control",
    access.role ? "private, max-age=60" : "public, max-age=60",
  );
  headers.set("x-aft-slug", slug);
  headers.set("x-aft-deploy", deployId);
  headers.set("x-aft-runtime", runtime);
  if (pinDeployId) headers.set("x-aft-preview", "1");
  for (const [name, value] of corsHeaders(null, false)) {
    headers.set(name, value);
  }
  const bytes = bodyBytes(obj.body);
  noteServe(env, request, slug, {
    httpStatus: 200,
    path: servePath(pathname),
    bytes,
    persist: !pinDeployId,
  });
  if (!pinDeployId) {
    await trackPageView(env, request, slug, {
      path: servePath(pathname),
      contentType: obj.contentType,
      httpStatus: 200,
    });
  }

  let body: ArrayBuffer | ReadableStream | string = obj.body;
  if (isHtmlContentType(obj.contentType)) {
    const html = await new Response(obj.body).text();
    const sitePath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const host =
      (pinDeployId && deployPreviewHost(slug, deployId, root)) ||
      liveSiteHost(slug, root);
    const publicUrl = `https://${host}${sitePath || "/"}`;
    let out = ensureDefaultOgMeta(html, {
      slug,
      pageUrl: publicUrl,
      rootDomain: root,
    });
    out = injectAftChrome(out, {
      slug,
      rootDomain: root,
      showBadge: meta.badge !== false,
    });
    if (isSmokeSlug(slug) || pinDeployId) out = ensureSmokeNoindex(out);
    body = out;
  }

  return new Response(body, { status: 200, headers });
}

function ensureSmokeNoindex(html: string): string {
  if (/<meta[^>]+name=["']robots["']/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(
      /<head[^>]*>/i,
      (m) => `${m}<meta name="robots" content="noindex"/>`,
    );
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html[^>]*>/i,
      (m) => `${m}<head><meta name="robots" content="noindex"/></head>`,
    );
  }
  return `<head><meta name="robots" content="noindex"/></head>${html}`;
}

/** Platform 404: hostname resolved, nothing deployed at this slug. */
export function siteNotFoundHtml(slug: string, root: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><meta name="theme-color" content="${BRAND.void}"/><title>Not deployed — aft.page</title>
${BRAND_FONT_LINKS}
<style>
${BRAND_CSS_VARS}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 var(--font-sans);color:var(--ink);background:var(--void);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;-webkit-font-smoothing:antialiased}
main{width:min(24rem,100%);text-align:center}
${BRAND_WORDMARK_CSS}
.brand{display:inline-block;margin:0 0 1.5rem;font-size:1.15rem}
.badge{display:inline-block;margin:0 0 1rem;padding:.2rem .6rem;border:1px solid var(--line-bright);border-radius:999px;font-size:.72rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--quiet)}
h1{font-size:1.25rem;margin:0 0 .5rem;font-weight:600}
p{color:var(--quiet);margin:0 0 1rem}p strong{color:var(--ink)}
.hint{margin-top:1.25rem;font-size:.85rem;color:var(--faint)}.hint a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
</style></head><body>
<main>
  <a class="brand" href="https://${root}/">aft<span>.</span>page</a>
  <div class="badge">Not found</div>
  <h1>Nothing is deployed here</h1>
  <p><strong>${liveSiteHost(slug, root)}</strong> has no site yet.</p>
  <p class="hint">Deploy from your agent, or go to <a href="https://${root}/">aft.page</a>.</p>
</main>
</body></html>`;
}

function wantsHtml(request: Request): boolean {
  return (request.headers.get("accept") || "").includes("text/html");
}

function siteNotFoundResponse(
  request: Request,
  slug: string,
  root: string,
): Response {
  const extra: Record<string, string> = {
    "cache-control": "no-store",
    "x-aft-slug": slug,
    "x-aft-error": "SITE_NOT_FOUND",
    vary: "Accept",
  };
  if (!wantsHtml(request)) {
    return json(
      { error: "not_found", code: "SITE_NOT_FOUND", slug },
      404,
      extra,
    );
  }
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    ...extra,
  });
  for (const [name, value] of corsHeaders(null, false)) {
    headers.set(name, value);
  }
  return new Response(siteNotFoundHtml(slug, root), { status: 404, headers });
}

/** Shown when a site is deactivated: files are safe, serving is paused. */
export function sitePausedHtml(slug: string, root: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><meta name="theme-color" content="${BRAND.void}"/><title>Site paused — aft.page</title>
${BRAND_FONT_LINKS}
<style>
${BRAND_CSS_VARS}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 var(--font-sans);color:var(--ink);background:var(--void);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;-webkit-font-smoothing:antialiased}
main{width:min(24rem,100%);text-align:center}
${BRAND_WORDMARK_CSS}
.brand{display:inline-block;margin:0 0 1.5rem;font-size:1.15rem}
.badge{display:inline-block;margin:0 0 1rem;padding:.2rem .6rem;border:1px solid var(--line-bright);border-radius:999px;font-size:.72rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--quiet)}
h1{font-size:1.25rem;margin:0 0 .5rem;font-weight:600}
p{color:var(--quiet);margin:0 0 1rem}p strong{color:var(--ink)}
.hint{margin-top:1.25rem;font-size:.85rem;color:var(--faint)}.hint a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
</style></head><body>
<main>
  <a class="brand" href="https://${root}/">aft<span>.</span>page</a>
  <div class="badge">Paused</div>
  <h1>This site is paused</h1>
  <p><strong>${slug}.${root}</strong> has been deactivated by its owner. Its files are still safe — it just isn’t serving right now.</p>
  <p class="hint">Are you the owner? Reactivate it from your <a href="https://${root}/projects">projects</a>.</p>
</main>
</body></html>`;
}
