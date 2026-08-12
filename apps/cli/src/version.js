/** Local CLI version from VERSION next to install root. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function cliRoot() {
  return ROOT;
}

export function localVersion() {
  try {
    return readFileSync(join(ROOT, "VERSION"), "utf8").trim();
  } catch {
    return "0.0.0";
  }
}

/** Compare dotted versions. Returns -1 / 0 / 1. */
export function cmpVersion(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
