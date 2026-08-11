# aft.page — brand identity

Canonical brief: [`../vision.txt`](../vision.txt), [`../rfs.txt`](../rfs.txt).
Craft notes: [`DESIGN-INSPIRATION.txt`](./DESIGN-INSPIRATION.txt).

## What we are

**Category:** A cloud for small software.

**Public lines:**

> Your agent made the software. aft makes it live, persistent, and shareable.

> Deploy personal and small-team software. Get a durable URL. Share it like a
> Google Doc.

Identity, permissions, isolation, and connectors are supporting machinery.
Do not let “control plane” replace the Small Software category.

Not a chat product. Not a website builder. Not a background coding-agent runner.
Not “another ChatGPT Sites.”

The name is the **aft** of a ship: what was built gets carried out as a **live,
durable, shareable URL**.

## Positioning test

First five seconds must scream **“AI generated this”** — not “build a site,”
not Carrd/Webflow, not Big Software cloud, not enterprise governance theatre.

## Design craft (inspiration, not product)

Visual bar from agent-infra peers (Ardent, Vercel, Resend, AgentMail, Graphite) —
black/white, product-as-hero, white CTAs. See `DESIGN-INSPIRATION.txt`.

| Adopt | Reject |
| --- | --- |
| Pure black, white primary CTA | Beacon orange / terracotta accents |
| Split hero + live product proof (mini drop) | Website-builder galleries |
| Honest Beta + live example proof | Fake YC mark / fake logo walls / invented metrics |
| One category line + calm sections | Purple glow / warm cream AI-essay look |
| Hairline borders, sparse chrome | Feature sprawl mega-nav |

## Visual system

| Token | Hex | Use |
| --- | --- | --- |
| `--void` | `#000000` | Page background |
| `--panel` | `#0a0a0a` | Surfaces, nav |
| `--line` | `#27272a` | Hairline borders |
| `--ink` | `#fafafa` | Primary text |
| `--quiet` | `#a1a1aa` | Secondary text |
| `--faint` | `#52525b` | Tertiary |
| `--cta` | `#ffffff` | Primary buttons |
| `--cta-ink` | `#000000` | Label on primary buttons |
| `--good` | `#22c55e` | Live / success only |

No branded orange.

**Wordmark** (board 2026-08-08): text-only `aft.page` — no icon glyph beside the
name. The `.` uses `--good` (live green). Website nav: wordmark + **Beta** +
white primary CTA.

**Stern mark:** giant recessed `aft` + **square** period (not a `.` glyph).
Readable chrome keeps full `aft.page`.

**Favicon:** all board candidates killed. Keep shipped `favicon.svg` until a new
favicon revision is approved on the board. Do not invent a replacement.

**Killed lockups:** icon+wordmark, brand status-pill wordmark, dual CTA pair as a
required motif. Primary CTA language stays “Deploy an app.”

### Typography

| Role | Face |
| --- | --- |
| Wordmark + UI + headlines | **Geist Variable** |
| Code / URLs / flow | **Geist Mono Variable** |

```
cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.2.5/index.min.css
cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.2.5/index.min.css
```

### Layout motifs

1. **Full-bleed product stage** — hero shows agent → deploy → live URL.
2. **Live proof** — interactive mini drop in the hero; clickable live example under it.
3. **Flow line** — `agent → deploy → live URL` in mono.
4. **Capability row** — What you can ship · Deploy · Share · Keep (as shipped).
5. **Badges** — Beta beside wordmark. Prefer a real live example over empty “Backed by” placeholders.

### Voice

- Short. Declarative. Startup-plain — TechCrunch / YC, not infra docs.
- “A cloud for small software.”
- Prefer: deploy, keep, use, share, update, app, live URL.
- Primary CTA: “Deploy an app.”
- Waitlist lives with pricing/beta expectations—not the hero.
- Avoid on the website: control plane, egress, BYOC, capability grants, inventory
  (say “app list”), VPC.
- Not: “Start building”, “Create your website”, “Powered by AI”, “Background agents.”

### Footer

Stern mark, not neon. Board 2026-08-09
([`footer-board-2026-08-09.md`](./footer-board-2026-08-09.md)): structure **A**,
chrome period **B** (square), giant **fade** (Resend wash into void). Killed:
quiet/bold giant, live-green giant square, neon giant, neon chrome, gradient
chrome, unmatched gradient giant, fading matched gradient giant, outline,
dither, scanlines, solid zinc, hold gradient, hold+offset, horizontal sheen.

1. **Word** — Giant watermark is `aft` + zinc square period. Readable chrome is
   `aft.page` with a **live-green square** period (not a `.` glyph). Do not
   billboard `aft.page`. Nav wordmark stays the glyph until a nav board says
   otherwise.
2. **Placement** — Below status + brand/columns (closing stern). Never above
   the link grid.
3. **Hover** — None on the giant mark (`aria-hidden`, `pointer-events: none`).
   Hover stays on status pill, column links, and Drop CTA only.

Hairline top → status pill (→ status.aft.page) + copyright → brand + tagline |
Product / Agents / Company → recessed stern watermark (Resend-depth, not
Graphite tube glow).

## Product identity (auth)

Deploy stays **fast / low-friction**. Login is for ownership, persistence, and
private sharing—not a wall before the first URL.

Agents call MCP. Humans auth when they own or invite.

See [SHARING.md](./SHARING.md) and [STRATEGY.md](./STRATEGY.md).

## Consistency (all product surfaces)

Same tokens, type, and CTA language everywhere aft chrome appears — not only
the public site:

| Surface | Source of truth |
| --- | --- |
| Website / SEO landings | `www/styles.css` |
| App (projects, project, preview) | `www/app.css` |
| Worker HTML (status, private gate) | `apps/api/src/brand.ts` |
| Auth emails | `apps/api/src/auth.ts` (CTA = white on black) |
| Auth pages (login, claim) | inline `:root` in each page (see `www/README.md`) — keep `www/login/index.html` and `www/claim/index.html` byte-identical by hand |
| Per-site OG cards (user-deployed sites) | `apps/api/src/og-image.ts` |

Do **not** reintroduce Fraunces, DM Sans, JetBrains Mono, or beacon orange (`#e85d1a`)
on product chrome. User-deployed sites keep their own design.

## Visual review

Approve brand specimens on HTML — do not decide from chat alone. Board:
[`../www/brand-board.html`](../www/brand-board.html). Process:
[STRATEGY.md § Visual review](./STRATEGY.md#visual-review-approve-on-html).

Latest receipts: [`brand-board-2026-08-08.md`](./brand-board-2026-08-08.md),
[`footer-board-2026-08-09.md`](./footer-board-2026-08-09.md). Footer board:
[`../www/footer-board.html`](../www/footer-board.html).

## Files

| Asset | Path |
| --- | --- |
| Tokens + website layout | `www/styles.css` |
| App / dashboard chrome | `www/app.css` |
| Worker brand constants | `apps/api/src/brand.ts` |
| Favicon | `www/favicon.svg` (awaiting new board) |
| Brand board (Approve / Kill) | `www/brand-board.html` |
| Footer board (Approve / Kill) | `www/footer-board.html` |
| Board decisions | `docs/brand-board-2026-08-08.md`, `docs/footer-board-2026-08-09.md` |
| OG | `www/og-source.html` → `og.png` |
| Preview shell | `www/preview/` |
| Vision | `vision.txt` |
| Strategy | `docs/STRATEGY.md` |
