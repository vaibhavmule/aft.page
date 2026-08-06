/** Default Open Graph / Twitter meta for hosted sites that omit their own. */

import { siteOgImageUrl } from "./og-image";

/** @deprecated Prefer siteOgImageUrl(slug, root) — kept for tests/helpers. */
export function defaultOgImageUrl(rootDomain: string): string {
  const root = (rootDomain || "aft.page").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `https://${root}/og.png`;
}

export { siteOgImageUrl };

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hasMeta(html: string, attr: "property" | "name", key: string): boolean {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*>|<meta[^>]+content=["'][^"']*["'][^>]*${attr}=["']${key}["'][^>]*>`,
    "i",
  );
  return re.test(html);
}

function pageTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return title || fallback;
}

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["'][^>]*>`,
    "i",
  );
  const match = html.match(re);
  const value = (match?.[1] ?? match?.[2])?.replace(/\s+/g, " ").trim();
  return value || null;
}

function pageDescription(html: string, title: string, rootDomain: string): string {
  return (
    metaContent(html, "name", "description") ||
    metaContent(html, "property", "og:description") ||
    metaContent(html, "name", "twitter:description") ||
    `${title} — live on ${rootDomain}`
  );
}

/**
 * If the document has a `<head>`, fill in missing social / SEO meta so link
 * previews (Telegram, Slack, Facebook, X, etc.) are not blank.
 * Fragments without `<head>` are left unchanged. Existing tags are preserved.
 */
export function ensureDefaultOgMeta(
  html: string,
  opts: { slug: string; pageUrl: string; rootDomain: string },
): string {
  if (!/<head[\s>]/i.test(html)) return html;

  const root = (opts.rootDomain || "aft.page").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const title = pageTitle(html, opts.slug);
  const description = pageDescription(html, title, root);
  const defaultImage = siteOgImageUrl(opts.slug, root);
  const existingOgImage =
    metaContent(html, "property", "og:image") || metaContent(html, "name", "og:image");
  const image = existingOgImage || defaultImage;
  const needsDefaultImage = !existingOgImage;

  const safeTitle = escapeAttr(title);
  const safeDesc = escapeAttr(description);
  const safeUrl = escapeAttr(opts.pageUrl);
  const safeImage = escapeAttr(image);

  const tags = [
    !hasMeta(html, "name", "description")
      ? `<meta name="description" content="${safeDesc}" />`
      : "",
    !hasMeta(html, "property", "og:type")
      ? `<meta property="og:type" content="website" />`
      : "",
    !hasMeta(html, "property", "og:title")
      ? `<meta property="og:title" content="${safeTitle}" />`
      : "",
    !hasMeta(html, "property", "og:description")
      ? `<meta property="og:description" content="${safeDesc}" />`
      : "",
    !hasMeta(html, "property", "og:url")
      ? `<meta property="og:url" content="${safeUrl}" />`
      : "",
    needsDefaultImage ? `<meta property="og:image" content="${safeImage}" />` : "",
    needsDefaultImage ? `<meta property="og:image:width" content="1200" />` : "",
    needsDefaultImage ? `<meta property="og:image:height" content="630" />` : "",
    !hasMeta(html, "name", "twitter:card")
      ? `<meta name="twitter:card" content="summary_large_image" />`
      : "",
    !hasMeta(html, "name", "twitter:title")
      ? `<meta name="twitter:title" content="${safeTitle}" />`
      : "",
    !hasMeta(html, "name", "twitter:description")
      ? `<meta name="twitter:description" content="${safeDesc}" />`
      : "",
    !hasMeta(html, "name", "twitter:image")
      ? `<meta name="twitter:image" content="${safeImage}" />`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  if (!tags) return html;

  const injection = `\n    ${tags}\n  `;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${injection}</head>`);
  }
  return html.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
}

export function isHtmlContentType(contentType: string): boolean {
  return /^text\/html\b/i.test(contentType);
}
