/**
 * Per-site Open Graph PNG cards — default social-card fallback for any
 * deployed *.aft.page site that doesn't supply its own og:image.
 * Matches www/og.png / www/og-source.html visual language: Geist Variable
 * on --void black, --good green accent. No Fraunces, no cream, no orange —
 * see docs/BRAND.md.
 */

import { ImageResponse, loadGoogleFont } from "workers-og";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function siteOgImagePath(): string {
  return "__aft/og.png";
}

export function siteOgImageUrl(slug: string, rootDomain: string): string {
  const root = (rootDomain || "aft.page").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `https://${slug}.${root}/${siteOgImagePath()}`;
}

export async function renderSiteOgImage(opts: {
  title: string;
  slug: string;
  rootDomain: string;
}): Promise<Response> {
  const root = (opts.rootDomain || "aft.page").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const title = truncate(opts.title || opts.slug, 64);
  const host = `${opts.slug}.${root}`;

  // Match www/og-source.html: Geist Variable on --void black, --good green accent.
  const [geistWordmark, geistTitle, geistHost] = await Promise.all([
    loadGoogleFont({ family: "Geist", weight: 650, text: "aft.page" }),
    loadGoogleFont({ family: "Geist", weight: 500, text: title }),
    loadGoogleFont({ family: "Geist", weight: 400, text: host }),
  ]);

  const html = `
<div style="display:flex; width:1200px; height:630px; position:relative; background-color:#000000; background-image:radial-gradient(circle at 105% 115%, rgba(34, 197, 94, 0.12), transparent 45%); color:#fafafa;">
  <div style="display:flex; flex-direction:column; justify-content:center; padding:0 96px; width:1200px; height:630px; position:relative;">
    <div style="display:flex; font-family:Geist, sans-serif; font-size:112px; font-weight:650; letter-spacing:-0.03em; line-height:0.95; margin-bottom:28px;">
      aft<span style="color:#22c55e;">.</span>page
    </div>
    <div style="display:flex; font-family:Geist, sans-serif; font-size:36px; font-weight:500; letter-spacing:-0.02em; line-height:1.2; max-width:900px; margin-bottom:16px;">
      ${escapeHtml(title)}
    </div>
    <div style="display:flex; font-family:Geist, sans-serif; font-size:24px; font-weight:400; color:#a1a1aa; max-width:900px;">
      ${escapeHtml(host)}
    </div>
  </div>
</div>
`;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Geist", data: geistWordmark, weight: 650, style: "normal" },
      { name: "Geist", data: geistTitle, weight: 500, style: "normal" },
      { name: "Geist", data: geistHost, weight: 400, style: "normal" },
    ],
    headers: {
      "cache-control": "public, max-age=3600",
      "x-aft-og": "1",
    },
  });
}
