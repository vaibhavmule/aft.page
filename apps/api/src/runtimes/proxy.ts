import {
  applyAftIdentityHeaders,
  type AftViewer,
} from "../aft-identity";

/**
 * Proxy slug.aft.page → upstream Worker (temp account or aft-owned Worker).
 */
export async function proxyUpstream(
  request: Request,
  upstreamBase: string,
  user: AftViewer | null = null,
): Promise<Response> {
  const incoming = new URL(request.url);
  const base = new URL(upstreamBase);
  const target = new URL(
    incoming.pathname + incoming.search,
    base.origin.endsWith("/") ? base.origin : `${base.origin}/`,
  );
  // Preserve path from upstream base if it includes a path prefix.
  if (base.pathname && base.pathname !== "/") {
    const prefix = base.pathname.replace(/\/$/, "");
    target.pathname = `${prefix}${incoming.pathname}`;
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-aft-proxy", "1");
  applyAftIdentityHeaders(headers, user);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // @ts-expect-error duplex required for streaming bodies in Workers
    init.duplex = "half";
  }

  const upstream = await fetch(target.toString(), init);
  const out = new Headers(upstream.headers);
  out.set("x-aft-upstream", base.origin);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
