export const SMOKE_SLUG_PREFIX = "test--";

export function isSmokeSlug(slug: string): boolean {
  return slug.startsWith(SMOKE_SLUG_PREFIX);
}

export function smokeCaseFromSlug(slug: string): string | null {
  return isSmokeSlug(slug) ? slug.slice(SMOKE_SLUG_PREFIX.length) : null;
}

export function smokeSlugForCase(caseId: string): string {
  return `${SMOKE_SLUG_PREFIX}${caseId}`;
}

/**
 * Public HTTPS host. `{case}.test.{root}` needs an ACM cert (Universal SSL
 * is one label). Clickable canaries are `test--{case}.{root}` until that pack exists.
 */
export function liveSiteHost(slug: string, root: string): string {
  return `${slug}.${root}`;
}

/** Canonical tenant URL. Optional query is for the deployer (claim token) only. */
export function liveSiteUrl(
  slug: string,
  root: string,
  query?: { token?: string; claimed?: boolean },
): string {
  const base = `https://${liveSiteHost(slug, root)}`;
  const q = new URLSearchParams();
  if (query?.token) q.set("token", query.token);
  if (query?.claimed) q.set("claimed", "1");
  const s = q.toString();
  return s ? `${base}/?${s}` : base;
}

/** First-party claim page — email or Google links the slug to an account. */
export function claimSiteUrl(slug: string, root: string, editToken: string): string {
  const u = new URL(`https://${root}/claim`);
  u.searchParams.set("slug", slug);
  u.searchParams.set("token", editToken);
  return u.toString();
}
