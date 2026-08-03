# aft.page — brand identity

## What we are

**Public line (YC / TechCrunch voice):**

> The secure home for AI-built apps.

> AI agents build the apps. aft.page makes them live, shared, and safe for work.

**Internal architecture** may still say “control plane” — don’t put that on the homepage.

Not a chat product. Not a website builder. Not a background coding-agent runner ([Ona](https://ona.com/)). Not “another ChatGPT Sites.”

The name is the **aft** of a ship: what was built gets carried out as a **live, shareable, company-owned URL**.

## Design north star: Ona-grade platform craft

Reference: [ona.com](https://ona.com/) — visual and information-architecture **bar**, not product clone.

| Steal from Ona | Do not copy |
| --- | --- |
| Dark, calm enterprise platform surface | “Background agents / PR factories” story |
| One sharp platform headline + short support line | Fake Fortune 500 logo walls |
| **Product-in-motion as the hero** (video / live UI), not a paste form as the brand | Purple glow / generic AI SaaS |
| 3–4 capability pillars with one sentence each | Kitchen-sink mega-nav before we have the product |
| Governance / security language as trust, not theatre | Claiming SOC2/GDPR before we have them |
| Primary + secondary CTA (`Get started` / `Talk to us`) | “Request a demo” as the only path — keep self-serve deploy |
| Sparse chrome, high contrast, serious type | Warm cream + terracotta “AI essay” look |

**Positioning test:** first five seconds = *infrastructure for agent-built software* — not *paste HTML toy*, not *chat*, not *Ona competitor*.

Live marketing today still reads “indie paste tool.” Target reads **platform**.

## What we are not

| Avoid | Why |
| --- | --- |
| Claude warm cream + terracotta | Chat-assistant category |
| Carrd / Webflow builder vibes | “Build your website” |
| Dark purple gradient SaaS | Generic AI |
| Friendly chat bubbles / sparkles | Wrong product |
| Looking like Ona’s product screens | Different job: we host/share apps; they run coding agents |

## Visual system (platform)

Dark-first. Cool neutrals. One beacon accent for “live.”

| Token | Hex | Use |
| --- | --- | --- |
| `--void` | `#07080a` | Page background |
| `--panel` | `#101218` | Surfaces, nav, cards (rare) |
| `--line` | `#1e232c` | Hairline borders |
| `--ink` | `#f2f4f7` | Primary text |
| `--quiet` | `#8b939e` | Secondary text |
| `--beacon` | `#e85d1a` | Live signal, CTAs, `aft.page` dot |
| `--beacon-deep` | `#c44a0f` | Hover |
| `--good` | `#3dd68c` | Live / success states |

Orange is a **beacon** (live URL), not editorial terracotta.

### Typography

| Role | Face | Why |
| --- | --- | --- |
| Wordmark only | **Fraunces** | Ownable mark — not page headlines |
| Headlines + UI | **DM Sans** | Platform sans (Ona-like calm); not Sora |
| Code / URLs / flow | **JetBrains Mono** | Machinery |

```
family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700
family=Fraunces:opsz,wght@9..144,600
family=JetBrains+Mono:wght@400;500
```

### Layout motifs (Ona-informed)

1. **Full-bleed product stage** — hero shows deploy → live URL → share (video or interactive), edge-to-edge visual plane.
2. **Capability row** — Deploy · Share · Govern · Run-in-your-cloud (as shipped).
3. **Beacon wordmark** — Fraunces `aft` + beacon `.` + `page` in UI sans.
4. **Flow line** — `agent → deploy → live URL` in mono.
5. Cards only when they hold interaction (paste, login) — not decorative feature cards piled in the hero.

### Voice

- Short. Declarative. Startup-plain — sounds like TechCrunch / YC, not infra docs.
- “The secure home for AI-built apps.”
- “AI agents build the apps. aft.page makes them live, shared, and safe for work.”
- Prefer: deploy, share, approve, login, trust, home, live URL.
- Avoid on marketing: control plane, egress, BYOC, capability grants, inventory (say “app list”), VPC.
- Not: “Start building”, “Create your website”, “Powered by AI”, “Background agents.”

### Footer (Prized-structure)

Steal structure from [Prized](https://prized.ai)-style footers — not their product or exact blue clone:

1. Dithered transition from page into a solid **harbor blue** band (`--harbor`)
2. Mark + short tagline | nav + pill CTA
3. Privacy / Terms row
4. Giant dither-faded wordmark (`aft`) dissolving into the blue

Keep body dark (Ona-grade). Footer is the color moment.

## Product identity (auth)

Deploy can stay **fast / low-friction**. Login for **claim, orgs, private share** — ownership and governance, not a wall before first URL.

Agents call MCP. Humans auth when they own or invite.

See [SHARING.md](./SHARING.md) and [STRATEGY.md](./STRATEGY.md).

## Implementation debt

Marketing landing rebuilt to dark platform + control-plane copy + Prized-structure footer (Aug 2026). Keep SEO subpages (`paste-html/`, etc.) in sync when touching voice.

## Files

| Asset | Path |
| --- | --- |
| Tokens + layout | `marketing/styles.css` |
| Favicon | `marketing/favicon.svg` |
| OG | `marketing/og-source.html` → `og.png` |
| Preview shell | `marketing/preview.html` |
| Strategy | `docs/STRATEGY.md` |
