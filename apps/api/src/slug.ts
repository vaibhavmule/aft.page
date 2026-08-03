import type { Env } from "./env";
import { RESERVED_SLUGS } from "./env";

const SLUG_COLORS = [
  "blue",
  "rose",
  "mist",
  "amber",
  "coral",
  "sage",
  "ink",
  "dune",
  "jade",
  "plum",
  "sand",
  "sky",
] as const;

const SLUG_ADJECTIVES = [
  "soft",
  "bold",
  "calm",
  "bright",
  "quiet",
  "swift",
  "warm",
  "clear",
] as const;

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug);
}

function pick<T extends string>(list: readonly T[]): T {
  const bytes = crypto.getRandomValues(new Uint8Array(1));
  return list[bytes[0]! % list.length]!;
}

function trimSlug(slug: string): string {
  return slug.slice(0, 58).replace(/-+$/g, "");
}

function randomSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

/** Prefer base, then base-color, then base-adj-color, then random — never reuse. */
export async function allocateUniqueSlug(
  env: Env,
  base: string | undefined,
): Promise<string | null> {
  const candidates: string[] = [];
  if (base) {
    candidates.push(base);
    for (let i = 0; i < 8; i++) {
      candidates.push(trimSlug(`${base}-${pick(SLUG_COLORS)}`));
    }
    for (let i = 0; i < 8; i++) {
      candidates.push(
        trimSlug(`${base}-${pick(SLUG_ADJECTIVES)}-${pick(SLUG_COLORS)}`),
      );
    }
  }
  for (let i = 0; i < 5; i++) candidates.push(randomSlug());

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || RESERVED_SLUGS.has(candidate)) {
      continue;
    }
    if (!isValidSlug(candidate)) continue;
    seen.add(candidate);
    const existing = await env.SITES.get(`site:${candidate}`);
    if (!existing) return candidate;
  }
  return null;
}
