/** Default Open Graph / Twitter meta for hosted sites that omit their own. */

const OG_IMAGE_PATH = "/og.png";

export function defaultOgImageUrl(rootDomain: string): string {
  const root = (rootDomain || "aft.page").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `https://${root}${OG_IMAGE_PATH}`;
}

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

/**
 * If the document has a `<head>` and no `og:image`, inject aft.page defaults
 * so link previews (Telegram, Slack, iMessage, etc.) show an image.
 * Fragments without `<head>` are left unchanged.
 */
export function ensureDefaultOgMeta(
  html: string,
  opts: { slug: string; pageUrl: string; rootDomain: string },
): string {
  if (!/<head[\s>]/i.test(html)) return html;
  if (hasMeta(html, "property", "og:image") || hasMeta(html, "name", "og:image")) {
    return html;
  }

  const title = pageTitle(html, opts.slug);
  const image = defaultOgImageUrl(opts.rootDomain);
  const safeTitle = escapeAttr(title);
  const safeUrl = escapeAttr(opts.pageUrl);
  const safeImage = escapeAttr(image);

  const tags = [
    !hasMeta(html, "property", "og:type")
      ? `<meta property="og:type" content="website" />`
      : "",
    !hasMeta(html, "property", "og:title")
      ? `<meta property="og:title" content="${safeTitle}" />`
      : "",
    !hasMeta(html, "property", "og:url")
      ? `<meta property="og:url" content="${safeUrl}" />`
      : "",
    `<meta property="og:image" content="${safeImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    !hasMeta(html, "name", "twitter:card")
      ? `<meta name="twitter:card" content="summary_large_image" />`
      : "",
    !hasMeta(html, "name", "twitter:title")
      ? `<meta name="twitter:title" content="${safeTitle}" />`
      : "",
    !hasMeta(html, "name", "twitter:image")
      ? `<meta name="twitter:image" content="${safeImage}" />`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  const injection = `\n    ${tags}\n  `;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${injection}</head>`);
  }
  return html.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
}

export function isHtmlContentType(contentType: string): boolean {
  return /^text\/html\b/i.test(contentType);
}
