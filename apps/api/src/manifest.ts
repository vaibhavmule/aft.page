/**
 * Parse aft.json manifest (runtime + capabilities + slug hint).
 */
import { isValidSlug } from "./slug";

export type AftRuntime = "static" | "worker" | "lattice-js" | "next";

export type AftManifest = {
  name?: string;
  slug?: string;
  runtime: AftRuntime;
  main?: string;
  upstream?: string;
  capabilities?: unknown;
  badge?: boolean;
};

type UploadFile = { path: string; bytes: ArrayBuffer; contentType: string };

export function extractAftManifest(files: UploadFile[]): AftManifest | null {
  const aft = files.find(
    (f) =>
      f.path === "aft.json" ||
      f.path.endsWith("/aft.json") ||
      f.path === "./aft.json",
  );
  if (!aft) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(aft.bytes)) as Record<
      string,
      unknown
    >;
    const runtimeRaw = String(json.runtime || "static").toLowerCase();
    const runtime: AftRuntime =
      runtimeRaw === "worker" ||
      runtimeRaw === "lattice-js" ||
      runtimeRaw === "next"
        ? runtimeRaw
        : "static";
    const slugRaw =
      typeof json.slug === "string" ? json.slug.toLowerCase().trim() : "";
    return {
      name: typeof json.name === "string" ? json.name : undefined,
      slug: slugRaw && isValidSlug(slugRaw) ? slugRaw : undefined,
      runtime,
      main: typeof json.main === "string" ? json.main : undefined,
      upstream: typeof json.upstream === "string" ? json.upstream : undefined,
      capabilities: json.capabilities,
      badge: typeof json.badge === "boolean" ? json.badge : undefined,
    };
  } catch {
    return null;
  }
}
