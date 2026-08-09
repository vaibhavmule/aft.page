/**
 * Cloudflare Pages auto-redirects /foo.html → /foo (308).
 * AI Visibility requires a real 200 at /llms.html.
 * Let the asset pipeline resolve, then unwrap the pretty-URL redirect.
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const response = await context.next();

  if (url.pathname !== "/llms.html") {
    return response;
  }

  // Pages returns 308 Location: /llms — follow that to the real HTML asset.
  if (response.status === 308 || response.status === 301 || response.status === 302) {
    const location = response.headers.get("Location");
    if (!location) return response;
    const target = new URL(location, url.origin);
    const asset = await context.env.ASSETS.fetch(
      new Request(target.toString(), { method: "GET" }),
    );
    if (!asset.ok) return response;

    const headers = new Headers(asset.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=60");
    headers.delete("Location");
    return new Response(await asset.arrayBuffer(), { status: 200, headers });
  }

  return response;
}
