/** Next complete must map to this slug's Worker, not an attacker origin. */
export function isAllowedNextUpstream(slug: string, origin: string): boolean {
  let host: string;
  try {
    const dest = new URL(origin);
    if (dest.protocol !== "https:") return false;
    host = dest.hostname.toLowerCase();
  } catch {
    return false;
  }
  const m = host.match(/^([a-z0-9-]+)(?:\.[a-z0-9-]+)?\.workers\.dev$/);
  if (!m) return false;
  const name = m[1]!;
  return name === slug || name === `aft-${slug}` || name === `aft-u-${slug}`;
}
