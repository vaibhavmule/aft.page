/**
 * Parse aft.json capabilities from upload files.
 */
import type { CapabilityDoc } from "./db";
import { normalizeCapabilities } from "./db";

type UploadFile = { path: string; bytes: ArrayBuffer; contentType: string };

export function extractCapabilities(
  files: UploadFile[],
): CapabilityDoc | null {
  const aft = files.find(
    (f) =>
      f.path === "aft.json" ||
      f.path.endsWith("/aft.json") ||
      f.path === "./aft.json",
  );
  if (!aft) return null;
  try {
    const text = new TextDecoder().decode(aft.bytes);
    const json = JSON.parse(text) as unknown;
    const caps = normalizeCapabilities(json);
    if (
      caps.secrets.length === 0 &&
      caps.egress.length === 0 &&
      caps.data.length === 0
    ) {
      return null;
    }
    return caps;
  } catch {
    return null;
  }
}

export function formatCapabilitySummary(caps: CapabilityDoc): string[] {
  const lines: string[] = [];
  for (const s of caps.secrets) lines.push(`secret:${s}`);
  for (const e of caps.egress) lines.push(`egress:${e}`);
  for (const d of caps.data) lines.push(`data:${d}`);
  return lines;
}
