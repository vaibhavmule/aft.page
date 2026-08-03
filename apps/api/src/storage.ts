import type { Env } from "./env";

export function r2Key(slug: string, deployId: string, path: string) {
  return `sites/${slug}/${deployId}/${path}`;
}

export function kvFileKey(slug: string, deployId: string, path: string) {
  return `file:${slug}:${deployId}:${path}`;
}

export function normalizePath(path: string): string {
  return path.replace(/^(\.\/)+/, "").replace(/^\/+/, "").replace(/\\/g, "/");
}

export async function putObject(
  env: Env,
  slug: string,
  deployId: string,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  if (env.BUCKET) {
    await env.BUCKET.put(r2Key(slug, deployId, path), bytes, {
      httpMetadata: { contentType },
      customMetadata: { slug, deployId },
    });
    return;
  }
  const key = kvFileKey(slug, deployId, path);
  await env.SITES.put(key, bytes, {
    metadata: { contentType },
  });
}

export async function getObject(
  env: Env,
  slug: string,
  deployId: string,
  path: string,
): Promise<{ body: ArrayBuffer | ReadableStream; contentType: string } | null> {
  if (env.BUCKET) {
    const obj = await env.BUCKET.get(r2Key(slug, deployId, path));
    if (obj) {
      return {
        body: obj.body,
        contentType: obj.httpMetadata?.contentType || guessMime(path),
      };
    }
  }
  const key = kvFileKey(slug, deployId, path);
  const got = await env.SITES.getWithMetadata<ArrayBuffer>(key, "arrayBuffer");
  if (!got.value) return null;
  const contentType =
    (got.metadata as { contentType?: string } | null)?.contentType ||
    guessMime(path);
  return { body: got.value, contentType };
}

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "js":
    case "mjs":
      return "text/javascript; charset=utf-8";
    case "json":
      return "application/json";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "ico":
      return "image/x-icon";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    case "txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export { guessMime };
