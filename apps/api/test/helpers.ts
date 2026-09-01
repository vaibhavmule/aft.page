/** Shared helpers so each test reads like the user story it protects. */
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";

export const API_ORIGIN = "https://api.aft.page";

export async function call(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export function pasteHtml(html: string, slug?: string): Request {
  const url = slug
    ? `${API_ORIGIN}/v1/deploy?slug=${encodeURIComponent(slug)}`
    : `${API_ORIGIN}/v1/deploy`;
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "text/html; charset=utf-8" },
    body: html,
  });
}

export function uploadJson(
  files: { path: string; content: string; encoding?: "utf8" | "base64" }[],
  slug?: string,
): Request {
  const url = slug
    ? `${API_ORIGIN}/v1/deploy?slug=${encodeURIComponent(slug)}`
    : `${API_ORIGIN}/v1/deploy`;
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files }),
  });
}

export async function deployPaste(
  html: string,
  slug?: string,
): Promise<{ slug: string; deployId: string; url: string; editToken: string }> {
  const res = await call(pasteHtml(html, slug));
  const body = (await res.json()) as {
    slug: string;
    deployId: string;
    url: string;
    editToken: string;
  };
  if (res.status !== 200) {
    throw new Error(`deploy failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/** Deploy a raw HTML paste with an anon quick-view `?expires=` param. */
export async function deployPasteExpires(
  html: string,
  slug: string,
  expires: string,
): Promise<{ slug: string; deployId: string; expiresAt: string; notice: string }> {
  const res = await call(
    new Request(`${API_ORIGIN}/v1/deploy?slug=${encodeURIComponent(slug)}&expires=${encodeURIComponent(expires)}`, {
      method: "POST",
      headers: { "content-type": "text/html; charset=utf-8" },
      body: html,
    }),
  );
  const body = (await res.json()) as {
    slug: string;
    deployId: string;
    expiresAt: string;
    notice: string;
  };
  if (res.status !== 200) {
    throw new Error(`deploy failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export function siteRequest(slug: string, path = "/"): Request {
  return new Request(`https://${slug}.aft.page${path}`);
}

export async function fetchSite(slug: string, path = "/"): Promise<Response> {
  return call(siteRequest(slug, path));
}
