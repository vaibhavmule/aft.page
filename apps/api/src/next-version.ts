/** Next.js floor: Aug 2026 security release (15.5.24 / 16.3.3). */

export const NEXT_MIN_15 = "15.5.24";
export const NEXT_MIN_16 = "16.3.3";

function parseParts(ver: string): [number, number, number] | null {
  const m = String(ver)
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

/** Empty/unreadable counts as unsupported. Next 14 dropped Q1 2026. */
export function nextVersionUnsupported(ver: string): boolean {
  const p = parseParts(ver);
  if (!p) return true;
  if (p[0] < 15) return true;
  if (p[0] === 15) return cmp(p, parseParts(NEXT_MIN_15)!) < 0;
  if (p[0] === 16) return cmp(p, parseParts(NEXT_MIN_16)!) < 0;
  return false;
}

export function nextVersionUnsupportedReason(ver: string): string {
  return `Next.js ${ver || "unknown"} is not supported. Use Next ${NEXT_MIN_15}+ or ${NEXT_MIN_16}+.`;
}
