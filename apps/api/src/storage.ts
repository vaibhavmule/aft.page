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
    // KV list() never returns object size (unlike R2) — stash it in
    // metadata so listDeployFiles can report real byte counts without an
    // extra GET per file.
    metadata: { contentType, size: bytes.byteLength },
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

/**
 * Copy one deploy's files from a source site to a target site, preserving the
 * deploy id and content types. Used to fold a standalone site into another
 * site's deploy history (so it becomes a rollback-able version). Returns the
 * number of files and total bytes copied.
 */
export async function copySiteDeploy(
  env: Env,
  sourceSlug: string,
  sourceDeployId: string,
  targetSlug: string,
  targetDeployId: string,
): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;

  if (env.BUCKET) {
    const prefix = `sites/${sourceSlug}/${sourceDeployId}/`;
    let cursor: string | undefined;
    do {
      const listing = await env.BUCKET.list({ prefix, cursor });
      for (const o of listing.objects) {
        const rel = o.key.slice(prefix.length);
        const obj = await env.BUCKET.get(o.key);
        if (!obj) continue;
        await env.BUCKET.put(r2Key(targetSlug, targetDeployId, rel), obj.body, {
          httpMetadata: obj.httpMetadata,
          customMetadata: { slug: targetSlug, deployId: targetDeployId },
        });
        files += 1;
        bytes += o.size;
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
    return { files, bytes };
  }

  const prefix = `file:${sourceSlug}:${sourceDeployId}:`;
  let kvCursor: string | undefined;
  do {
    const listing = await env.SITES.list({ prefix, cursor: kvCursor });
    for (const k of listing.keys) {
      const path = k.name.slice(prefix.length);
      const got = await env.SITES.getWithMetadata<ArrayBuffer>(
        k.name,
        "arrayBuffer",
      );
      if (!got.value) continue;
      await env.SITES.put(kvFileKey(targetSlug, targetDeployId, path), got.value, {
        metadata: got.metadata ?? undefined,
      });
      files += 1;
      bytes += got.value.byteLength;
    }
    kvCursor = listing.list_complete ? undefined : listing.cursor;
  } while (kvCursor);
  return { files, bytes };
}

export async function listDeployFiles(
  env: Env,
  slug: string,
  deployId: string,
): Promise<{ path: string; bytes: number }[]> {
  const out: { path: string; bytes: number }[] = [];
  if (env.BUCKET) {
    const prefix = `sites/${slug}/${deployId}/`;
    let cursor: string | undefined;
    do {
      const listing = await env.BUCKET.list({ prefix, cursor });
      for (const o of listing.objects) {
        out.push({ path: o.key.slice(prefix.length), bytes: o.size });
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
    return out;
  }
  const filePrefix = `file:${slug}:${deployId}:`;
  let kvCursor: string | undefined;
  do {
    const listing = await env.SITES.list({
      prefix: filePrefix,
      cursor: kvCursor,
    });
    for (const k of listing.keys) {
      const size = (k.metadata as { size?: number } | null)?.size ?? 0;
      out.push({ path: k.name.slice(filePrefix.length), bytes: size });
    }
    kvCursor = listing.list_complete ? undefined : listing.cursor;
  } while (kvCursor);
  return out;
}

/** Delete stored objects for a single deploy (R2 + KV fallback). */
export async function deleteDeployObjects(
  env: Env,
  slug: string,
  deployId: string,
): Promise<void> {
  if (env.BUCKET) {
    const prefix = `sites/${slug}/${deployId}/`;
    let cursor: string | undefined;
    do {
      const listing = await env.BUCKET.list({ prefix, cursor });
      const keys = listing.objects.map((o) => o.key);
      if (keys.length) await env.BUCKET.delete(keys);
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
  }
  const filePrefix = `file:${slug}:${deployId}:`;
  let kvCursor: string | undefined;
  do {
    const listing = await env.SITES.list({ prefix: filePrefix, cursor: kvCursor });
    await Promise.all(listing.keys.map((k) => env.SITES.delete(k.name)));
    kvCursor = listing.list_complete ? undefined : listing.cursor;
  } while (kvCursor);
}

/**
 * Move every stored object for a site from `fromSlug` → `toSlug` (R2 + KV
 * fallback + `site:{slug}` meta). Caller must ensure `toSlug` is free.
 * Deletes the old prefix after a successful copy.
 */
export async function moveSiteObjects(
  env: Env,
  fromSlug: string,
  toSlug: string,
): Promise<void> {
  if (fromSlug === toSlug) return;

  if (env.BUCKET) {
    const prefix = `sites/${fromSlug}/`;
    let cursor: string | undefined;
    do {
      const listing = await env.BUCKET.list({ prefix, cursor });
      for (const o of listing.objects) {
        const rel = o.key.slice(prefix.length);
        const obj = await env.BUCKET.get(o.key);
        if (!obj) continue;
        await env.BUCKET.put(`sites/${toSlug}/${rel}`, obj.body, {
          httpMetadata: obj.httpMetadata,
          customMetadata: {
            ...(obj.customMetadata || {}),
            slug: toSlug,
          },
        });
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
  }

  const filePrefix = `file:${fromSlug}:`;
  let kvCursor: string | undefined;
  do {
    const listing = await env.SITES.list({
      prefix: filePrefix,
      cursor: kvCursor,
    });
    for (const k of listing.keys) {
      const rest = k.name.slice(filePrefix.length);
      const got = await env.SITES.getWithMetadata<ArrayBuffer>(
        k.name,
        "arrayBuffer",
      );
      if (!got.value) continue;
      await env.SITES.put(`file:${toSlug}:${rest}`, got.value, {
        metadata: got.metadata ?? undefined,
      });
    }
    kvCursor = listing.list_complete ? undefined : listing.cursor;
  } while (kvCursor);

  const meta = await env.SITES.get(`site:${fromSlug}`);
  if (meta) await env.SITES.put(`site:${toSlug}`, meta);

  await deleteSiteObjects(env, fromSlug);
}

/**
 * Delete every stored object for a site: R2 objects under `sites/{slug}/`,
 * KV file blobs `file:{slug}:*` (used when no R2 bucket), and the `site:{slug}`
 * metadata pointer. Safe to call repeatedly.
 */
export async function deleteSiteObjects(env: Env, slug: string): Promise<void> {
  if (env.BUCKET) {
    const prefix = `sites/${slug}/`;
    let cursor: string | undefined;
    do {
      const listing = await env.BUCKET.list({ prefix, cursor });
      const keys = listing.objects.map((o) => o.key);
      if (keys.length) await env.BUCKET.delete(keys);
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
  }

  const filePrefix = `file:${slug}:`;
  let kvCursor: string | undefined;
  do {
    const listing = await env.SITES.list({ prefix: filePrefix, cursor: kvCursor });
    await Promise.all(listing.keys.map((k) => env.SITES.delete(k.name)));
    kvCursor = listing.list_complete ? undefined : listing.cursor;
  } while (kvCursor);

  await env.SITES.delete(`site:${slug}`);
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

/** R2 object name: encode so `../x` cannot escape `ops/failures/{id}/`. */
export function failurePayloadObjectName(path: string): string {
  return encodeURIComponent(normalizePath(path)).replace(/\./g, "%2E");
}

export function failurePayloadKey(failId: string, path: string): string {
  return `ops/failures/${failId}/${failurePayloadObjectName(path)}`;
}

export async function putFailurePayload(
  env: Env,
  failId: string,
  files: { path: string; bytes: ArrayBuffer; contentType: string }[],
): Promise<void> {
  if (!files.length) return;
  if (env.BUCKET) {
    for (const f of files) {
      await env.BUCKET.put(failurePayloadKey(failId, f.path), f.bytes, {
        httpMetadata: { contentType: f.contentType },
        customMetadata: { failId },
      });
    }
    return;
  }
  for (const f of files) {
    await env.SITES.put(`opsfail:${failId}:${failurePayloadObjectName(f.path)}`, f.bytes, {
      metadata: { contentType: f.contentType },
    });
  }
}

export async function getFailurePayloadFile(
  env: Env,
  failId: string,
  path: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const rel = normalizePath(path);
  if (!rel || rel.includes("..")) return null;
  if (env.BUCKET) {
    const obj = await env.BUCKET.get(failurePayloadKey(failId, rel));
    if (!obj) return null;
    return {
      body: await obj.arrayBuffer(),
      contentType: obj.httpMetadata?.contentType || guessMime(rel),
    };
  }
  const got = await env.SITES.getWithMetadata<ArrayBuffer>(
    `opsfail:${failId}:${failurePayloadObjectName(rel)}`,
    "arrayBuffer",
  );
  if (!got.value) return null;
  const contentType =
    (got.metadata as { contentType?: string } | null)?.contentType || guessMime(rel);
  return { body: got.value, contentType };
}

export async function deleteFailurePayload(env: Env, failId: string): Promise<void> {
  if (env.BUCKET) {
    const prefix = `ops/failures/${failId}/`;
    let cursor: string | undefined;
    do {
      const listing = await env.BUCKET.list({ prefix, cursor });
      const keys = listing.objects.map((o) => o.key);
      if (keys.length) await env.BUCKET.delete(keys);
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
  }
  const kvPrefix = `opsfail:${failId}:`;
  let kvCursor: string | undefined;
  do {
    const listing = await env.SITES.list({ prefix: kvPrefix, cursor: kvCursor });
    await Promise.all(listing.keys.map((k) => env.SITES.delete(k.name)));
    kvCursor = listing.list_complete ? undefined : listing.cursor;
  } while (kvCursor);
}

export { guessMime };
