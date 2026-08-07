/**
 * Parse aft.json manifest (runtime + capabilities).
 */
export type AftRuntime = "static" | "worker" | "lattice-js" | "next";

export type AftManifest = {
  name?: string;
  runtime: AftRuntime;
  main?: string;
  upstream?: string;
  capabilities?: unknown;
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
    return {
      name: typeof json.name === "string" ? json.name : undefined,
      runtime,
      main: typeof json.main === "string" ? json.main : undefined,
      upstream: typeof json.upstream === "string" ? json.upstream : undefined,
      capabilities: json.capabilities,
    };
  } catch {
    return null;
  }
}
