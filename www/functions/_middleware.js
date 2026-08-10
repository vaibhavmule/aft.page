/**
 * Cloudflare Pages auto-redirects /foo.html → /foo (308).
 * AI Visibility requires a real 200 at /llms.html.
 * Let the asset pipeline resolve, then unwrap the pretty-URL redirect.
 *
 * Junk-path 404: zone WAF custom rules need Zone WAF write (this token
 * does not have it). Pages Functions only run on the marketing project
 * (aft.page / *.pages.dev), not tenant *.aft.page.
 */
import { isJunkPath } from "./junk-path.js";

const HSTS = "max-age=15552000; includeSubDomains";

function withHsts(res) {
  if (res.headers.has("strict-transport-security")) return res;
  const headers = new Headers(res.headers);
  headers.set("strict-transport-security", HSTS);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/security.txt") {
    return withHsts(
      Response.redirect(new URL("/.well-known/security.txt", url.origin), 301),
    );
  }
  if (isJunkPath(url.pathname)) {
    return withHsts(
      new Response("Not found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      }),
    );
  }
  const response = await context.next();

  if (url.pathname !== "/llms.html") {
    return withHsts(response);
  }

  // Pages returns 308 Location: /llms — follow that to the real HTML asset.
  if (response.status === 308 || response.status === 301 || response.status === 302) {
    const location = response.headers.get("Location");
    if (!location) return withHsts(response);
    const target = new URL(location, url.origin);
    const asset = await context.env.ASSETS.fetch(
      new Request(target.toString(), { method: "GET" }),
    );
    if (!asset.ok) return withHsts(response);

    const headers = new Headers(asset.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=60");
    headers.delete("Location");
    return withHsts(new Response(await asset.arrayBuffer(), { status: 200, headers }));
  }

  return withHsts(response);
}
