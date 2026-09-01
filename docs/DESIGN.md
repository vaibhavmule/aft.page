# aft.page — Style Reference

Aft is a cloud for small software. The chrome is a black void with white ink and zinc hairlines: product-as-hero, not a template gallery. Depth comes from tonal steps (`#000` → `#0a0a0a` → `#050505`) and 1px borders, not shadow or glow. Green (`#22c55e`) is a live/success signal only. The primary CTA is always a solid white rectangle on black, never a colored pill.

This file restates the shipped system for agents. It does not invent a new palette. Identity and voice: `BRAND.md`. Craft sources (adopt/reject): `DESIGN-INSPIRATION.txt`. Tokens live in CSS — change them there, not here.

**Positioning test:** first five seconds = “AI generated this” — not “build a site,” not Carrd/Webflow, not Big Software cloud.

---

## Tokens — Colors

Use CSS variables. Do not introduce hex that is not in this table.

| Name | Value | Token | Role |
|------|-------|-------|------|
| Void | `#000000` | `--void` | Page background |
| Panel | `#0a0a0a` | `--panel` | Raised surfaces, nav |
| Harbor | `#111111` | `--harbor` | Slightly lifted void (marketing only) |
| Inset | `#050505` | `--bg-inset` | Recessed wells |
| Line | `#27272a` | `--line` | Hairline borders |
| Line bright | `#3f3f46` | `--line-bright` | Hover / emphasis border |
| Ink | `#fafafa` | `--ink` | Primary text, headlines |
| Quiet | `#a1a1aa` | `--quiet` | Secondary text, nav links |
| Faint | `#767680` | `--faint` | Tertiary / captions (AA on void; do not revert to `#52525b` on small text) |
| CTA | `#ffffff` | `--cta` | Primary button fill |
| CTA ink | `#000000` | `--cta-ink` | Label on primary button |
| CTA hover | `#e4e4e7` | `--cta-hover` | Primary button hover |
| Good | `#22c55e` | `--good` / `--live` | Live, success, wordmark period only |
| Danger | `#ff6b6b` | `--danger` | Error only |
| Warn | `#eab308` | `--warn` | App chrome warnings only |

`--beacon*` and `--accent*` are **aliases** of the white CTA / green live pair. Never paint them orange.

**Do not use:** `#e85d1a` (beacon orange), purple glow, cream/warm paper, Linear lime, Resend violet, Factory orange.

---

## Tokens — Typography

Geist only. No Fraunces, DM Sans, Inter-as-brand, or JetBrains Mono on aft chrome.

| Role | Face | Token |
|------|------|-------|
| Wordmark, UI, headlines | Geist Variable | `--font-sans` / `--font-display` |
| Code, URLs, flow, eyebrows, Beta | Geist Mono Variable | `--font-mono` |

```
cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.2.5/index.min.css
cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.2.5/index.min.css
```

Body: 1rem / weight 400 / line-height 1.6 / `-webkit-font-smoothing: antialiased`.

| Role | Size | Weight | Tracking | Notes |
|------|------|--------|----------|-------|
| Hero brand | `clamp(2.75rem, 7vw, 4.5rem)` | 600 | `-0.035em` | line-height ~0.95 |
| Hero title | `clamp(1.85rem, 4.2vw, 2.85rem)` | 600 | `-0.035em` | line-height ~1.08 |
| Wordmark | `1.35rem` | 600 | `-0.02em` | `aft` + green `.` + `page` |
| Section H2 | `clamp(1.45rem, 2.8vw, 2rem)` | 600 | tight | One sharp line, not a feature grid |
| Lede | `clamp(1.1rem, 2vw, 1.3rem)` | 500 | `-0.01em` | |
| Body / support | `1.05rem` | 400 | 0 | quiet color, max ~38–42ch |
| Nav links | `0.92rem` | 500 | 0 | `--quiet`, `--ink` on hover/current |
| Button | `0.88–0.95rem` | 600 | 0 | |
| Eyebrow / flow | `0.72–0.78rem` mono | 500 | `0.06em` | uppercase |
| Beta pill | `0.65rem` mono | 500 | `0.1em` | uppercase, hairline pill |

Strong = 600. Do not jump to 700/800 for “impact.”

---

## Tokens — Layout, spacing, radius

| Token | Value | Role |
|-------|-------|------|
| `--page` | `1180px` | Content rail |
| `--page-gutter` | `2.5rem` | Outer inset |

Nav, hero, and bands share one edge: `width: min(var(--page), calc(100% - var(--page-gutter)))`.

Spacing is rem on an ~8px grid (0.25 / 0.5 / 0.75 / 1 / 1.35 / 1.75). Do not invent a parallel scale.

| Use | Radius |
|-----|--------|
| Buttons, inputs, cards | `0.5rem` (8px) |
| Small chips / code | `0.3–0.35rem` |
| Pills (Beta, status, hero pill) | `999px` |
| Dots | `50%` |
| Stern watermark period | **square** (not a `.` glyph) |

Elevation: **1px `border-color: var(--line)`**, not box-shadow. Hover may lift a primary button `translateY(-1px)` and brighten the border to `--line-bright`.

`body { overflow-x: clip }`. Header/toolbar rows `flex-wrap: wrap`. Measure ~390px and ~1024px: `scrollWidth - clientWidth` must be 0.

---

## Surfaces

1. **Void** — full-page `--void`. Default.
2. **Rail** — 1px left/right/bottom `--line` on the page width (nav, bands).
3. **Panel** — `--panel` fills, still hairline-edged.
4. **Inset** — `--bg-inset` wells (drop zone, code, logs).
5. **Product stage** — live UI or mini-drop is the texture; no illustration, no 3D cube, no gradient wash.

Grain / radial glows already on the homepage are load-bearing atmosphere — do not add more glows, and do not copy them onto app chrome.

---

## Components

**Wordmark.** Text-only `aft.page`. The `.` is `--good`. No icon glyph beside the name. Nav: wordmark + **Beta** + white primary CTA.

**Beta.** Mono uppercase pill, hairline `--line`, `--quiet` text. Not a live-green billboard.

**Primary button.** `--cta` fill, `--cta-ink` label, 8px radius, 1px matching border. Hover `--cta-hover`. Label: **“Deploy an app.”** Not “Start building,” “Create your website,” or “Powered by AI.” Dual white+ghost pair is not a required motif.

**Ghost button.** Transparent, `--line-bright` border, `--ink` text. Hover border → `--ink`.

**Hero pill / status.** Hairline pill, optional `--good` dot (live only). Status chrome links to status.aft.page.

**Flow line.** Mono: `agent → deploy → live URL`.

**Proof.** Clickable live example or hero mini-drop. No fake YC mark, no empty “Backed by [Coming Soon],” no invented metrics.

**Footer.** Hairline top → status pill + copyright → brand + columns → recessed giant `aft` + **square** zinc period washing into the void (Resend depth, not Graphite neon). Giant mark: `aria-hidden`, `pointer-events: none`, **no hover**. Readable chrome stays `aft.page` with a live-green square period. Do not billboard `aft.page` in the watermark.

**Favicon.** Keep shipped `www/favicon.svg`. Do not invent a replacement.

---

## Motion

| Event | Timing |
|-------|--------|
| Button / border hover | `0.15s ease` |
| Same-origin page fade | `220ms ease-in-out` (View Transitions) |
| Live dot pulse | `2.2s ease-in-out infinite` |

`scroll-behavior: auto` — never `smooth` on these pages (long jumps black-flash). No hover on the stern watermark. No neon, no gradient chrome.

---

## Voice (on chrome)

Short. Declarative. Startup-plain.

Prefer: deploy, keep, use, share, update, app, live URL.

Avoid on the website: control plane, egress, BYOC, capability grants, inventory (say “app list”), VPC. Never expose Wrangler / Cloudflare / OpenNext on user-facing surfaces (`product-surface.mdc`).

User-deployed sites keep **their** design. Aft chrome does not restyle customer apps.

---

## Do

- Black canvas, white CTA, zinc hairlines, Geist, green = live/success/period.
- Show agent → deploy → live URL. Split hero + live product proof.
- Same tokens on website, app, Worker HTML, auth email, login/claim.
- Approve brand changes on HTML boards (`www/brand-board.html`, `www/footer-board.html`), not from chat mockups.

## Don't

- New palette, cream canvas, purple/orange/lime accents, Fraunces, icon+wordmark lockup, status-pill-as-logo.
- Mega-nav, feature-sprawl grids, template galleries, fake social proof.
- Smooth-scroll, extra glow, hover on the giant stern mark, replacing the favicon.
- Rebuild the design system unless it unblocks a demo.

---

## Agent prompt

Build with `:root` tokens already in `www/styles.css` (marketing/docs) or `www/app.css` (app). Copy the existing button/nav/pill recipes; do not restyle from a third-party DESIGN.md. Green only for live, success, and the wordmark period. Primary CTA copy is “Deploy an app.” If a change is brand-level (lockup, tokens, footer, favicon), it needs a board — do not ship from this file alone.

---

## Sources of truth

| Surface | File |
|---------|------|
| This spec | `docs/DESIGN.md` |
| Identity / voice | `docs/BRAND.md` |
| Craft adopt/reject | `docs/DESIGN-INSPIRATION.txt` |
| Website tokens + layout | `www/styles.css` |
| App tokens | `www/app.css` |
| Worker HTML | `apps/api/src/brand.ts` |
| Auth emails | `apps/api/src/auth.ts` |
| Login / claim | `www/login/index.html`, `www/claim/index.html` (keep byte-identical) |
| Boards | `docs/brand-board-2026-08-08.md`, `docs/footer-board-2026-08-09.md` |
