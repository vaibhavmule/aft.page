/**
 * Canonical aft.page visual tokens for Worker-rendered HTML.
 * Keep in sync with docs/BRAND.md, www/styles.css, www/app.css.
 */

export const BRAND = {
  void: "#000000",
  panel: "#0a0a0a",
  panelRaised: "#18181b",
  line: "#27272a",
  lineBright: "#3f3f46",
  ink: "#fafafa",
  quiet: "#a1a1aa",
  faint: "#52525b",
  cta: "#ffffff",
  ctaInk: "#000000",
  ctaHover: "#e4e4e7",
  good: "#22c55e",
  warn: "#eab308",
  bad: "#ff6b6b",
  bgInset: "#050505",
} as const;

/** Geist Variable + Mono via jsDelivr (same as www/). */
export const BRAND_FONT_LINKS = `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.2.5/index.min.css"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.2.5/index.min.css"/>`;

/** Compact :root block for inline Worker HTML. */
export const BRAND_CSS_VARS = `:root{
  color-scheme:dark;
  --void:${BRAND.void};
  --panel:${BRAND.panel};
  --panel-raised:${BRAND.panelRaised};
  --line:${BRAND.line};
  --line-bright:${BRAND.lineBright};
  --ink:${BRAND.ink};
  --quiet:${BRAND.quiet};
  --faint:${BRAND.faint};
  --cta:${BRAND.cta};
  --cta-ink:${BRAND.ctaInk};
  --cta-hover:${BRAND.ctaHover};
  --beacon:var(--cta);
  --beacon-bright:${BRAND.good};
  --beacon-ink:var(--cta-ink);
  --beacon-dim:color-mix(in srgb,var(--ink) 8%,transparent);
  --good:${BRAND.good};
  --warn:${BRAND.warn};
  --bad:${BRAND.bad};
  --danger:${BRAND.bad};
  --bg-inset:${BRAND.bgInset};
  --font-sans:"Geist Variable","Geist","Segoe UI",system-ui,sans-serif;
  --font-display:var(--font-sans);
  --font-mono:"Geist Mono Variable","Geist Mono",ui-monospace,Menlo,Consolas,monospace;
}`;

/** Wordmark: live-green period (brand board 2026-08-08). */
export function brandWordmark(href = "https://aft.page/"): string {
  return `<a class="brand" href="${href}">aft<span>.</span>page</a>`;
}

export const BRAND_WORDMARK_CSS = `.brand{color:inherit;text-decoration:none;font-family:var(--font-display);font-weight:600;letter-spacing:-.02em}
.brand span{color:var(--good);font-weight:600}`;
