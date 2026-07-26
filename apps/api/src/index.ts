/**
 * aft.page API + static serve Worker.
 *
 * Storage today: KV for slug→deploy pointers and file blobs (R2 not yet
 * enabled on the account — enable once in the CF dashboard, then switch
 * putObject/getObject to the R2 binding).
 *
 * Hosts:
 * - *.aft.page → serve site for slug
 * - api.aft.page / workers.dev → POST /v1/deploy
 */
export interface Env {
  SITES: KVNamespace;
  /** Optional; set after R2 is enabled in the dashboard. */
  BUCKET?: R2Bucket;
  ROOT_DOMAIN: string;
}

const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "mail",
  "ftp",
  "cdn",
  "static",
  "admin",
  "dashboard",
  "status",
  "docs",
]);

type SiteMeta = {
  deployId: string;
  createdAt: string;
  fileCount: number;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const root = (env.ROOT_DOMAIN || "aft.page").toLowerCase();

    try {
      if (isApiHost(host, root)) {
        return await handleApi(request, env, url);
      }

      const slug = subdomainSlug(host, root);
      if (slug) {
        return await serveSite(request, env, slug, url.pathname);
      }

      return json({ error: "unknown_host", host }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", message }));
      return json({ error: "internal", message }, 500);
    } finally {
      void ctx;
    }
  },
};

function isApiHost(host: string, root: string): boolean {
  if (host === `api.${root}`) return true;
  if (host.endsWith(".workers.dev")) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
}

function subdomainSlug(host: string, root: string): string | null {
  if (host === root || host === `www.${root}`) return null;
  if (!host.endsWith(`.${root}`)) return null;
  const sub = host.slice(0, -(root.length + 1));
  if (!sub || sub.includes(".")) return null;
  return sub.toLowerCase();
}

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true, storage: env.BUCKET ? "r2+kv" : "kv" });
  }

  if (url.pathname === "/v1/deploy" && request.method === "POST") {
    return deploy(request, env);
  }

  // Path-based serve (works before wildcard DNS is fully live)
  const pathServe = url.pathname.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/);
  if (pathServe && request.method === "GET") {
    const slug = pathServe[1];
    const rest = pathServe[2] || "/";
    return serveSite(request, env, slug, rest);
  }

  if (url.pathname === "/" && request.method === "GET") {
    return json({
      service: "aft.page",
      deploy: "POST /v1/deploy (multipart files, or text/html body)",
      serve: "https://{slug}.aft.page or GET /s/{slug}/",
    });
  }

  return json({ error: "not_found" }, 404);
}

async function deploy(request: Request, env: Env): Promise<Response> {
  const files = await parseUpload(request);
  if (files.length === 0) {
    return json({ error: "no_files", hint: "multipart field 'files' or raw text/html body" }, 400);
  }
  if (files.length > MAX_FILES) {
    return json({ error: "too_many_files", max: MAX_FILES }, 400);
  }

  let total = 0;
  for (const f of files) {
    if (f.path.includes("..") || f.path.startsWith("/") || f.path.includes("\\")) {
      return json({ error: "bad_path", path: f.path }, 400);
    }
    if (f.bytes.byteLength > MAX_FILE_BYTES) {
      return json({ error: "file_too_large", path: f.path, max: MAX_FILE_BYTES }, 400);
    }
    total += f.bytes.byteLength;
  }
  if (total > MAX_TOTAL_BYTES) {
    return json({ error: "payload_too_large", max: MAX_TOTAL_BYTES }, 400);
  }

  const requested = new URL(request.url).searchParams.get("slug")?.toLowerCase();
  let slug = requested && /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(requested)
    ? requested
    : randomSlug();
  if (RESERVED_SLUGS.has(slug)) {
    return json({ error: "reserved_slug", slug }, 400);
  }

  // If slug already taken and caller did not explicitly pass it, mint another.
  if (!requested) {
    for (let i = 0; i < 5; i++) {
      const existing = await env.SITES.get(`site:${slug}`);
      if (!existing) break;
      slug = randomSlug();
    }
  }

  const deployId = `dep_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  for (const f of files) {
    const keyPath = normalizePath(f.path);
    await putObject(env, slug, deployId, keyPath, f.bytes, f.contentType);
  }

  const meta: SiteMeta = { deployId, createdAt, fileCount: files.length };
  await env.SITES.put(`site:${slug}`, JSON.stringify(meta));

  const root = env.ROOT_DOMAIN || "aft.page";
  const url = `https://${slug}.${root}`;
  return json({
    ok: true,
    slug,
    deployId,
    url,
    files: files.length,
    bytes: total,
    storage: env.BUCKET ? "r2" : "kv",
  });
}

type UploadFile = { path: string; bytes: ArrayBuffer; contentType: string };

async function parseUpload(request: Request): Promise<UploadFile[]> {
  const ct = request.headers.get("content-type") || "";

  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    const out: UploadFile[] = [];
    for (const [name, value] of form.entries()) {
      if (!(value instanceof File)) continue;
      const path =
        (typeof form.get(`${name}_path`) === "string"
          ? String(form.get(`${name}_path`))
          : null) ||
        value.name ||
        "index.html";
      out.push({
        path: normalizePath(path),
        bytes: await value.arrayBuffer(),
        contentType: value.type || guessMime(path),
      });
    }
    // Also accept repeated "file" / "files"
    return out;
  }

  if (ct.includes("application/json")) {
    const body = (await request.json()) as {
      files?: { path: string; content: string; encoding?: "utf8" | "base64" }[];
    };
    const out: UploadFile[] = [];
    for (const f of body.files ?? []) {
      const bytes =
        f.encoding === "base64"
          ? base64ToArrayBuffer(f.content)
          : new TextEncoder().encode(f.content).buffer;
      out.push({
        path: normalizePath(f.path),
        bytes,
        contentType: guessMime(f.path),
      });
    }
    return out;
  }

  if (ct.includes("text/html") || ct.includes("text/plain") || ct === "") {
    const text = await request.text();
    if (!text.trim()) return [];
    return [
      {
        path: "index.html",
        bytes: new TextEncoder().encode(text).buffer,
        contentType: "text/html; charset=utf-8",
      },
    ];
  }

  return [];
}

async function serveSite(
  request: Request,
  env: Env,
  slug: string,
  pathname: string,
): Promise<Response> {
  if (RESERVED_SLUGS.has(slug)) {
    return json({ error: "reserved" }, 404);
  }

  const raw = await env.SITES.get(`site:${slug}`);
  if (!raw) return new Response("Not found", { status: 404 });
  const meta = JSON.parse(raw) as SiteMeta;

  let path = decodeURIComponent(pathname);
  if (path.endsWith("/")) path += "index.html";
  if (path === "/" || path === "") path = "/index.html";
  path = path.replace(/^\//, "");

  let obj = await getObject(env, slug, meta.deployId, path);
  if (!obj && !path.includes(".")) {
    obj = await getObject(env, slug, meta.deployId, `${path}/index.html`);
  }
  if (!obj && path !== "index.html") {
    // soft SPA fallback
    obj = await getObject(env, slug, meta.deployId, "index.html");
  }
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", obj.contentType);
  headers.set("cache-control", "public, max-age=60");
  headers.set("x-aft-slug", slug);
  headers.set("x-aft-deploy", meta.deployId);
  return new Response(obj.body, { status: 200, headers });
}

async function putObject(
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
  // KV blob: store content-type in a sidecar key
  const key = kvFileKey(slug, deployId, path);
  await env.SITES.put(key, bytes, {
    metadata: { contentType },
  });
}

async function getObject(
  env: Env,
  slug: string,
  deployId: string,
  path: string,
): Promise<{ body: ArrayBuffer | ReadableStream; contentType: string } | null> {
  if (env.BUCKET) {
    const obj = await env.BUCKET.get(r2Key(slug, deployId, path));
    if (!obj) return null;
    return {
      body: obj.body,
      contentType:
        obj.httpMetadata?.contentType || guessMime(path),
    };
  }
  const key = kvFileKey(slug, deployId, path);
  const got = await env.SITES.getWithMetadata<ArrayBuffer>(key, "arrayBuffer");
  if (!got.value) return null;
  const contentType =
    (got.metadata as { contentType?: string } | null)?.contentType ||
    guessMime(path);
  return { body: got.value, contentType };
}

function r2Key(slug: string, deployId: string, path: string) {
  return `sites/${slug}/${deployId}/${path}`;
}

function kvFileKey(slug: string, deployId: string, path: string) {
  return `file:${slug}:${deployId}:${path}`;
}

function normalizePath(path: string): string {
  return path.replace(/^(\.\/)+/, "").replace(/^\/+/, "").replace(/\\/g, "/");
}

function randomSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
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

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...Object.fromEntries(corsHeaders()),
    },
  });
}

function corsHeaders(): Headers {
  const h = new Headers();
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  return h;
}
