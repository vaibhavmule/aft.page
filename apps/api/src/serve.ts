import type { Env } from "./env";
import { RESERVED_SLUGS } from "./env";
import { corsHeaders, json } from "./http";
import { trackPageView } from "./metrics";
import { ensureDefaultOgMeta, isHtmlContentType } from "./og";
import { canAccessSite, privateDeniedHtml } from "./sharing";
import { getObject } from "./storage";
import { touchLastServed } from "./db";

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
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-aft-slug": slug,
    });
    for (const [name, value] of corsHeaders(null, false)) {
      headers.set(name, value);
    }
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
  const meta = JSON.parse(raw) as { deployId: string };

  let path = decodeURIComponent(pathname);
  if (path.endsWith("/")) path += "index.html";
  if (path === "/" || path === "") path = "/index.html";
  path = path.replace(/^\//, "");

  let obj = await getObject(env, slug, meta.deployId, path);
  if (!obj && !path.includes(".")) {
    obj = await getObject(env, slug, meta.deployId, `${path}/index.html`);
  }
  if (!obj && path !== "index.html") {
    obj = await getObject(env, slug, meta.deployId, "index.html");
  }
  if (!obj) return new Response("Not found", { status: 404 });

  // Fire-and-forget last-served (best-effort inventory signal)
  void touchLastServed(env, slug);

  const headers = new Headers();
  headers.set("content-type", obj.contentType);
  headers.set(
    "cache-control",
    access.role ? "private, max-age=60" : "public, max-age=60",
  );
  headers.set("x-aft-slug", slug);
  headers.set("x-aft-deploy", meta.deployId);
  for (const [name, value] of corsHeaders(null, false)) {
    headers.set(name, value);
  }
  await trackPageView(env, request, slug, 200);

  let body: ArrayBuffer | ReadableStream | string = obj.body;
  if (isHtmlContentType(obj.contentType)) {
    const html = await new Response(obj.body).text();
    // Use the site-relative pathname (works for both subdomain and /s/{slug}/)
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
