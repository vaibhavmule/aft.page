# aft.page — design.md

Guidance for agents building pages that should look and feel like aft.page.

Version: 1 (2026-09-02)
Scope: one-off and repeated artifacts — reports, dashboards, proposals,
benchmarks, landing pages, internal tools — that need the aft look and voice
but are built outside the aft.page repo.

Load this file when building any page **for or about aft.page**, or when a
user asks you to make a page "look like aft.page" / "on brand for aft".

Related: internal source of truth is [`docs/DESIGN.md`](https://aft.page/docs) +
[`docs/BRAND.md`](https://aft.page/docs). This file is the distilled, public
version — same decisions, fewer words, aimed at external agents.

---

## 1. What aft.page is (scope)

aft.page is **a cloud for small software**: it turns software an AI agent
builds into a live, shareable HTTPS URL in seconds — no repo, cloud account,
or build setup. Position: **agent made it → aft makes it live, persistent,
shareable.**

The first five seconds of any aft page must scream **"AI generated this"** —
not "build a site," not Carrd/Webflow, not Big Software cloud, not enterprise
governance theatre.

This is the voice. Use it. Do not drift into:
- "Start building" / "Create your website" / "Powered by AI" / "Background agents"
- Infra-docs theatre: "control plane", "egress", "BYOC", "capability grants",
  "inventory" (say "app list"), "VPC"

## 2. Reader and task

Before writing any HTML, decide what the **reader came to do**, then build the
page around that job — not around a template.

- A renewal or proposal page leads with the **recommendation** and the
  commercial comparison behind it.
- An interactive planning page puts its **controls** front and center.
- A benchmark report leads with the **headline result**, then the evidence.

The page must survive two reads:
1. **Quick executive read** — skimming for ~15 seconds: the headline, the
   recommendation, and the three numbers that matter.
2. **Detailed audit** — the reader can find every claim backed by a value,
   and every value tied to a source or assumption.

**Every supplied fact must survive.** If the inputs contain numbers, a date, a
customer name, or a URL, they appear on the page exactly — never approximated
or replaced with placeholders.

## 3. Observable rules (decisions you can check)

These are the non-negotiables. Each one is written so a checker can verify it.

1. **Tables use the full available width.** Evidence tables (comparison,
   commercial terms, benchmark data) must not shrink to prose width. The
   `table-wrap` primitive is full-width by default; do not constrain it with
   `max-width` unless the table is genuinely tiny (≤3 rows, ≤4 cols).
2. **Green = live only.** `--good` (#22c55e) appears only for: live/success
   status, the wordmark period, and the flow-line "live URL" terminal. Never
   use green for decoration, headers, or buttons.
3. **Primary CTA is a solid white rectangle on black**, label **"Deploy an
   app"** — never a colored pill, never "Start building" / "Create your
   website". When the page is not about deploying, still use the white-on-black
   primary shape for the main action.
4. **One primary CTA per viewport.** A page may list secondary/ghost actions,
   but only one action is primary at a time.
5. **Body text max ~42ch** and `--quiet` (#a1a1aa). Headlines `--ink`
   (#fafafa), weight 600, tight tracking. Never jump to weight 700/800 for
   "impact".
6. **Hairlines, not shadows or glows.** Depth comes from `1px` borders in
   `--line` (#27272a) and tonal steps (void → panel → inset). No box-shadow
   glow, no gradient washes, no neon.
7. **No horizontal scroll.** At ~390px and ~1024px, `scrollWidth - clientWidth`
   must be 0. Tables get a scroll container (`table-wrap`), never a squeezed
   column layout.
8. **Square period, not a `.` glyph — and two colors by surface.** The
   readable wordmark (`aft.page`) carries a **live-green square period**; the
   recessed giant footer mark carries a **zinc (quiet) square period** washing
   into the void — never green, never neon, no hover on the giant mark. Both
   are square elements, never a text `.`.
9. **The wordmark is text-only.** No icon glyph beside the name, no status-pill
   acting as a logo. A live-green status dot may appear *next to* a status pill.
10. **Facts beat decoration.** Real live examples and real numbers beat empty
    placeholders. No fake YC marks, no "Backed by [Coming Soon]", no invented
    metrics, no fictional quotes attributed to aft.page.

## 4. Available primitives

Use the public stylesheet: `https://aft.page/aft-brand.css`

**You do not need to read the stylesheet.** It loads in the browser at render
time. Write HTML with these class names and the page will carry the aft look.

### Layout
- `.wrap` — content rail (1180px max, 2.5rem gutter). Default page container.
- `.hero` — full-width hero band with a hairline bottom border.
- `.section` — full-width section band with hairline separators.
- `.grid` — hairline-separated card grid (gap: 1px, line background).
- `.card` — panel surface inside `.grid` (or standalone with its own border).

### Type
- `.eyebrow` / `.kicker` — mono uppercase label above a headline.
- `.lede` — 42ch intro paragraph under a headline (`--quiet`).
- `.support` — body support paragraph (`--quiet`, 42ch).
- `.flow-line` — mono flow line: `agent → deploy → live URL`; use
  `.flow-arrow` for the arrows and `.flow-live` for the final "live URL" span.

### Brand
- `.wordmark` — `aft<span class="sq" aria-hidden="true"></span>page` — the square
  period is live green and is a **square element**, not a `.` glyph.
- `.beta` — the Beta pill next to the wordmark.
- `.status-pill` — hairline pill with a `.status-dot` (live green dot) →
  status.aft.page. Live signal only, not a logo.

### Buttons
- `.btn .btn-primary` — white on black. The main action.
- `.btn .btn-ghost` — transparent, hairline border, ink text. Secondary.
- `.cta-row` — button row (primary + optional ghost).

### Data
- `.table-wrap` — full-width table container (hairline, rounded, scrolls on
  small screens). Put every `<table>` inside one.
- `table`, `th`, `td` — hairline-bordered, uppercase faint column heads,
  panel header row.
- `.stat-strip` — a row of stat cells: `.stat-num` (big tabular number) +
  `.stat-label` (mono uppercase). Add `.stat-live` to a cell only when the
  value itself is a live/positive signal.

### Nav + footer
- `.topnav` — wordmark + links + white CTA. Hairline left/right/bottom rail edge.
- `.topnav-links` — quiet nav links.
- `.footer`, `.footer-inner`, `.footer-meta`, `.footer-bottom` — hairline
  footer. Status pill + copyright on top.
- `.footer-mark` — brand link containing `.wordmark`; columns follow inside
  `.footer-inner`.
- `.footer-giant-wrap`, `.footer-giant` — the recessed giant `aft` + **square
  zinc** period washing into the void (`.footer-giant` gets `aria-hidden`,
  `pointer-events: none`, no hover). Green never appears on the giant mark.

### Forms
- `.field` — bordered input well (focus ring = ink outline).
- `label.field-label` — mono uppercase label above a field.

## 5. Composition guidance (judgment)

- **Lead with the answer.** State the headline result or recommendation before
  the evidence that supports it. Bury nothing.
- **One sharp claim per section.** A section title is a sentence about what the
  reader should conclude, not a topic label ("Revenue is up 22% on core" beats
  "Growth").
- **Put peer values on one scale.** When comparing things (plans, vendors,
  options), put them in a single table or grid so the reader can actually
  compare — not three separate paragraphs with different units.
- **Keep supporting detail available, not competing.** Extra columns, caveats,
  and methodology live in the same page but visually recede (faint text,
  collapse, appendix) without hiding.
- **Write copy with concrete claims and honest caveats.** "Deploys in under a
  minute" with a footnote, not "lightning fast". A caveat that qualifies a
  claim is stronger than a claim without one.
- **Hierarchy supports the job.** Type size and contrast follow the reader's
  task: the recommendation is bigger than the methodology. Do not make all
  text the same weight to "stay clean".

## 6. Anti-patterns — the generated-design tells to avoid

These patterns keep appearing in generated pages. They read as "AI made this
and nobody reviewed it." **Name them, recognize them, avoid them.**

| Name | What it looks like |
| --- | --- |
| **Gradient wash** | A colorful radial-gradient or purple/blue glow behind a headline to fake depth. Depth = hairlines + tonal steps. |
| **Feature sprawl grid** | A 6+ column grid of identical icon cards that all say the same thing at different lengths. |
| **Template gallery** | Three identical cards differing only by emoji/icon, implying a product gallery where there is none. |
| **Pill CTA as logo** | A colored pill with a dot used as the brand mark in the nav. The brand is the text wordmark. |
| **Beacon orange** | Any orange (#e85d1a or near) accent. Not part of the palette. |
| **Cream AI essay** | Warm off-white background, serif display font, "storybook" hero. Aft is black/white Geist, not an essay. |
| **Fake proof** | "Backed by [Coming Soon]", invented testimonials, logo walls, made-up metrics. |
| **Shadow-box cards** | Floating cards with drop shadows on a light background. Surfaces are hairline-edged panels on void. |
| **Status pill as decoration** | A green dot with no meaning. Green only = live/success signal. |
| **Mega-nav** | A sprawling dropdown nav with every feature as a link. One nav line, one CTA. |

## 7. How to publish

An "aft page" is any page built with this guidance and deployed to a URL.
Deploy it the same way aft deploys: `aft deploy`, the MCP `deploy_html` /
`deploy_files` tools, or paste/upload. The page keeps **its own** design if it
is a user's app; this guidance is for pages that should *be* aft-branded
(marketing, reports, proposals, docs, dashboards).

When deploying through the aft MCP, no extra headers are needed — the
stylesheet URL works as-is. The wordmark links to https://aft.page, and the
status pill links to https://status.aft.page. Do not hotlink fonts per page —
`aft-brand.css` imports the Geist fontsource faces itself, so pages need no
font `<link>` tags.

## 8. Feedback loop

This file is maintained by the same loop Vercel describes for its design.md:
every rule above earned its place from a reviewed page. When a page built with
this guidance gets corrected, the correction goes to the **narrowest place**
that can enforce it:

- Judgment → added here as prose or a named anti-pattern.
- Repeatable mechanics → added to `aft-brand.css` and documented here.
- Mechanical failures → a deterministic check (width, green usage, CTA count).

When you are reviewing a page built from this file, record the correction and
which rule (or missing rule) it traces to.
