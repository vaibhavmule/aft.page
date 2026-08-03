import { normalizePath } from "./storage";

type UploadFile = { path: string; bytes: ArrayBuffer; contentType: string };

export function sanitizeHtmlDocument(text: string): string {
  let t = String(text ?? "").trim();
  const close = t.search(/<\/html>\s*/i);
  if (close !== -1) {
    t = t.slice(0, close + "</html>".length);
  }
  t = t.replace(
    /\s*(Deploy(?:\s+to\s+aft\.page)?|Live ✓|Publishing…|Failed|Empty|Not HTML)\s*$/i,
    "",
  );
  return t.trim();
}

function looksLikeHtmlDoc(text: string): boolean {
  return /<!DOCTYPE\s+html/i.test(text) || /<html[\s>]/i.test(text);
}

export async function parseUploadBody(request: Request): Promise<UploadFile[]> {
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
        contentType: uploadMime(value.type, path),
      });
    }
    return out;
  }

  if (ct.includes("application/json")) {
    const body = (await request.json()) as {
      files?: { path: string; content: string; encoding?: "utf8" | "base64" }[];
    };
    const out: UploadFile[] = [];
    for (const f of body.files ?? []) {
      const path = normalizePath(f.path);
      if (f.encoding === "base64") {
        const raw = base64ToArrayBuffer(f.content);
        if (/\.html?$/i.test(path)) {
          const text = sanitizeHtmlDocument(new TextDecoder().decode(raw));
          out.push({
            path,
            bytes: new TextEncoder().encode(text).buffer,
            contentType: guessMime(path),
          });
        } else {
          out.push({
            path,
            bytes: raw,
            contentType: guessMime(path),
          });
        }
      } else {
        const text =
          /\.html?$/i.test(path) || looksLikeHtmlDoc(f.content)
            ? sanitizeHtmlDocument(f.content)
            : f.content;
        out.push({
          path,
          bytes: new TextEncoder().encode(text).buffer,
          contentType: guessMime(path),
        });
      }
    }
    return out;
  }

  if (ct.includes("text/html") || ct.includes("text/plain") || ct === "") {
    const text = sanitizeHtmlDocument(await request.text());
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

function uploadMime(uploadedType: string, path: string): string {
  const generic = !uploadedType || uploadedType === "application/octet-stream";
  return generic ? guessMime(path) : uploadedType;
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
