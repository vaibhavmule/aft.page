export const SMOKE_SLUG_PREFIX = "test--";

/** `dep_` + 12 hex from deploy.ts — the label left of `--` on preview hosts. */
const DEPLOY_ID_RE = /^dep_([a-f0-9]{12})$/i;
const PREVIEW_LABEL_RE =
  /^([a-f0-9]{12})--([a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/i;

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

export function deployIdShort(deployId: string): string | null {
  const m = DEPLOY_ID_RE.exec(deployId);
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Immutable per-deploy host. One DNS label (`*.aft.page`):
 * `{12hex}--{slug}.aft.page` — same trick as `test--{case}`.
 */
export function deployPreviewHost(
  slug: string,
  deployId: string,
  root: string,
): string | null {
  const short = deployIdShort(deployId);
  if (!short) return null;
  return `${short}--${slug}.${root}`;
}

export function deployPreviewUrl(
  slug: string,
  deployId: string,
  root: string,
): string | null {
  const host = deployPreviewHost(slug, deployId, root);
  return host ? `https://${host}` : null;
}

export function parseDeployPreviewLabel(
  sub: string,
): { short: string; slug: string } | null {
  const m = PREVIEW_LABEL_RE.exec(sub);
  if (!m) return null;
  return { short: m[1]!.toLowerCase(), slug: m[2]!.toLowerCase() };
}

export function attachDeployPreviewUrls<T extends { id: string }>(
  deploys: T[],
  slug: string,
  root: string,
): (T & { previewUrl: string | null })[] {
  return deploys.map((d) => ({
    ...d,
    previewUrl: deployPreviewUrl(slug, d.id, root),
  }));
}

/** First-party claim page — email or Google links the slug to an account. */
export function claimSiteUrl(slug: string, root: string, editToken: string): string {
  const u = new URL(`https://${root}/claim`);
  u.searchParams.set("slug", slug);
  u.searchParams.set("token", editToken);
  return u.toString();
}
