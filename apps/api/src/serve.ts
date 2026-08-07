import type { Env } from "./env";
import { RESERVED_SLUGS } from "./env";
import { getSiteRow, touchLastServed } from "./db";
import { corsHeaders, json } from "./http";
import { trackPageView } from "./metrics";
import { ensureDefaultOgMeta, isHtmlContentType } from "./og";
import { renderSiteOgImage, siteOgImagePath } from "./og-image";
import { handleLatticeJsApi } from "./runtimes/lattice-js";
import { proxyUpstream } from "./runtimes/proxy";
import { canAccessSite, privateDeniedHtml } from "./sharing";
import { getObject } from "./storage";

function pageTitleFromHtml(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return title || fallback;
}

export async function serveSite(
  request: Request,
  env: Env,
  slug: string,
  pathname: string,
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
      next.hostname = `${slug}.${root}`;
      next.protocol = "https:";
      const login = new URL(`https://${root}/login`);
      login.searchParams.set("next", next.toString());
      headers.set("location", login.toString());
      await trackPageView(env, request, slug, 302);
      return new Response(null, { status: 302, headers });
    }

    headers.set("content-type", "text/html; charset=utf-8");
    await trackPageView(env, request, slug, 401);
    return new Response(privateDeniedHtml(slug, root), {
      status: 401,
      headers,
    });
  }

  const raw = await env.SITES.get(`site:${slug}`);
  if (!raw) {
    return new Response("Not found", {
      status: 404,
      headers: corsHeaders(null, false),
    });
  }
  const meta = JSON.parse(raw) as {
    deployId: string;
    runtime?: string;
    upstreamUrl?: string | null;
  };

  const siteRow = await getSiteRow(env, slug);
  const runtime = siteRow?.runtime || meta.runtime || "static";
  const upstreamUrl = siteRow?.upstreamUrl || meta.upstreamUrl || null;

  if (upstreamUrl && (runtime === "worker" || runtime === "next")) {
    void touchLastServed(env, slug);
    await trackPageView(env, request, slug, 200);
    return proxyUpstream(request, upstreamUrl);
  }

  if (runtime === "lattice-js" && pathname.startsWith("/api/")) {
    const api = await handleLatticeJsApi(request, env, slug, pathname);
    if (api) {
      void touchLastServed(env, slug);
      return api;
    }
  }

  if (pathname.startsWith("/api/")) {
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
    const index = await getObject(env, slug, meta.deployId, "index.html");
    if (index) {
      title = pageTitleFromHtml(await new Response(index.body).text(), slug);
    }
    const img = await renderSiteOgImage({ title, slug, rootDomain: root });
    img.headers.set("x-aft-slug", slug);
    img.headers.set("x-aft-deploy", meta.deployId);
    for (const [name, value] of corsHeaders(null, false)) {
      img.headers.set(name, value);
    }
    return img;
  }

  let obj = await getObject(env, slug, meta.deployId, path);
  if (!obj && !path.includes(".")) {
    obj = await getObject(env, slug, meta.deployId, `${path}/index.html`);
  }
  if (!obj && path !== "index.html") {
    obj = await getObject(env, slug, meta.deployId, "index.html");
  }
  if (!obj) return new Response("Not found", { status: 404 });

  void touchLastServed(env, slug);

  const headers = new Headers();
  headers.set("content-type", obj.contentType);
  headers.set(
    "cache-control",
    access.role ? "private, max-age=60" : "public, max-age=60",
  );
  headers.set("x-aft-slug", slug);
  headers.set("x-aft-deploy", meta.deployId);
  headers.set("x-aft-runtime", runtime);
  for (const [name, value] of corsHeaders(null, false)) {
    headers.set(name, value);
  }
  await trackPageView(env, request, slug, 200);

  let body: ArrayBuffer | ReadableStream | string = obj.body;
  if (isHtmlContentType(obj.contentType)) {
    const html = await new Response(obj.body).text();
    const sitePath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const publicUrl = `https://${slug}.${root}${sitePath || "/"}`;
    body = ensureDefaultOgMeta(html, {
      slug,
      pageUrl: publicUrl,
      rootDomain: root,
    });
  }

  return new Response(body, { status: 200, headers });
}
