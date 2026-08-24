/** Live URL for a slug (matches api site-url helper). */
export function liveSiteUrl(slug, root = "aft.page") {
  return `https://${slug}.${root}`;
}
