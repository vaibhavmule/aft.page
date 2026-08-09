/** Per-site Open Graph PNG cards — matches www/og.png visual language. */

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
  const fontText = `${title} ${host} aft.page`;

  // Match www/og-source.html: Fraunces brand + Sora body on cream.
  const [fraunces, sora500, sora400] = await Promise.all([
    loadGoogleFont({ family: "Fraunces", weight: 600, text: "aft.page" }),
    loadGoogleFont({ family: "Sora", weight: 500, text: fontText }),
    loadGoogleFont({ family: "Sora", weight: 400, text: fontText }),
  ]);

  const html = `
<div style="display:flex; width:1200px; height:630px; position:relative; background-color:#f1efe8; background-image:radial-gradient(ellipse 90% 65% at 10% -10%, rgba(196, 92, 38, 0.14), transparent 55%), radial-gradient(ellipse 70% 55% at 105% 15%, rgba(20, 17, 15, 0.06), transparent 50%), linear-gradient(180deg, #f1efe8 0%, #ddd9cf 100%); color:#14110f;">
  <div style="display:flex; position:absolute; right:60px; bottom:40px; width:380px; height:380px; border-radius:50%; background:radial-gradient(circle, rgba(196, 92, 38, 0.18), transparent 70%);"></div>
  <div style="display:flex; flex-direction:column; justify-content:center; padding:0 96px; width:1200px; height:630px; position:relative;">
    <div style="display:flex; font-family:Fraunces, serif; font-size:120px; font-weight:600; letter-spacing:-0.045em; line-height:0.95; margin-bottom:28px;">
      aft<span style="color:#c45c26;">.</span>page
    </div>
    <div style="display:flex; font-family:Sora, sans-serif; font-size:36px; font-weight:500; letter-spacing:-0.02em; line-height:1.2; max-width:900px; margin-bottom:16px;">
      ${escapeHtml(title)}
    </div>
    <div style="display:flex; font-family:Sora, sans-serif; font-size:24px; font-weight:400; color:#5c554c; max-width:900px;">
      ${escapeHtml(host)}
    </div>
  </div>
</div>
`;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Fraunces", data: fraunces, weight: 600, style: "normal" },
      { name: "Sora", data: sora500, weight: 500, style: "normal" },
      { name: "Sora", data: sora400, weight: 400, style: "normal" },
    ],
    headers: {
      "cache-control": "public, max-age=3600",
      "x-aft-og": "1",
    },
  });
}
