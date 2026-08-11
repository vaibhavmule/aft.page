# aft.page — strategy

Internal north star. Canonical mission: [`../rfs.txt`](../rfs.txt).
Belief: [`../youtube-moment.txt`](../youtube-moment.txt).

Updated: 2026-08-10

## Company thesis

> **A cloud for small software.**
>
> Any agent → a working application → a durable URL → share it like a Google Doc.

North-star experience:

> **AFT builds and owns whatever is necessary to make agent-built Small Software
> as easy to deploy, use, and share as a Google Doc—even when that includes
> hosting and runtime infrastructure.**

Publishing and permissions remain the product surface:

> **AFT is the publishing and permission layer for software created by AI agents.**

Agents have compressed creation. They can produce personal tools, focused team
workflows, dashboards, reports, prototypes, and small full-stack applications in
minutes. Deployment still assumes Big Software: repositories, build settings,
cloud accounts, infrastructure choices, identity wiring, secrets, and ongoing
operations.

aft deletes that complexity for software with one or a small handful of users.

## Market reality (9 Aug 2026)

### Execution: wrap when enough, build when required

Cloudflare Drop and Temporary Accounts commoditize **static** upload → URL → claim.
OpenNext on Cloudflare is nearly automatic. Sandbox/Containers and [Dynamic
Workers](https://blog.cloudflare.com/dynamic-workers/) supply arbitrary-code
primitives.

AFT should build anything Small Software requires to become live, useful,
shareable, and durable—including hosting when necessary. The distinction is
**strategic, not a restriction:**

- Use or wrap Cloudflare primitives when they already solve execution well.
- Build AFT-owned hosting/runtime pieces whenever the Small Software experience
  requires them.
- Own the complete user experience: deploy, environment configuration, data,
  authentication, permissions, secrets, sharing, updates, rollback, schedules,
  logs, safe execution, and deletion.
- Never expose Cloudflare complexity to the user.
- Avoid rebuilding infrastructure merely for technical differentiation—but do
  build it when existing primitives cannot deliver the promised experience.

Do **not** compete primarily on “we host generated HTML.” Hosting is table stakes
when Drop already covers it; hosting is in-scope when the Doc-simple experience
needs a runtime Drop cannot provide.

### Moat (what Cloudflare will not own for you)

| Capability | Why it sticks |
| --- | --- |
| Identity and SSO | Who owns the app |
| Roles and permissions | Who can open, edit, invite |
| Private sharing | Doc-simple access control |
| Audit history | What changed, when, by whom |
| Persistent data | Apps that survive beyond the session |
| Safe secrets | Capability approve + vault |
| Redeployment / versioning | Update without losing the URL |
| Organization-wide discovery | Find team Small Software |

See [ADR-TEMP-ACCOUNTS.md](./ADR-TEMP-ACCOUNTS.md), [OPENNEXT-ORCHESTRATION.md](./OPENNEXT-ORCHESTRATION.md).

### Agent Plugins = highest-priority distribution

[Vercel Agent Plugins](https://vercel.com/blog/introducing-agent-plugins) is a
vendor-neutral format for bundling Agent Skills + MCP servers. Cursor already
supports it; ChatGPT/Codex, Copilot, VS Code, and others are in the launch set.

**One AFT plugin can eventually work across multiple coding agents.** That is an
immediate distribution opportunity — higher priority than new runtimes this week.

#### Thin MCP (not a platform)

See [ADR-MCP-THIN.md](./ADR-MCP-THIN.md). MCP is a **thin deploy adapter**,
aligned with Cloudflare’s stateless MCP / `createMcpHandler` model — not an MCP
portal or control plane.

Frozen tools: `deploy_html` · `deploy_files` · `aft_health`. Prefer remote
`https://mcp.aft.page/mcp`; stdio remains a local/dev fallback.

Plugin core action:

> Deploy this HTML/app privately using AFT and return a shareable URL.

Package:

- AFT deployment skill (`SKILL.md`)
- Existing `deploy_html` / `deploy_files` MCP tools ([`apps/mcp/`](../apps/mcp/))
- Authentication
- Default privacy and expiry settings
- Update / redeploy capability

Ship bar:

- Valid Agent Plugin (skill + MCP): `npx plugins add vaibhavmule/aft.page`
- 30-second demo: prompt → application → private URL (still open)
- Public plugin repo + install command (this repo)
- Analytics for deploy, open, share, and repeat deployment ([METRICS.md](./METRICS.md))

### Track vs ignore

Full map: [COMPETITION.md](./COMPETITION.md). Codex deploy-shelf (9 Aug 2026) is
crowded on agent → URL; empty slot is permissioned sharing. Watch AppDeploy,
Hatchable, MiniUp. Do not match their BaaS dump.

| Signal | Read |
| --- | --- |
| [Kitesurf](https://blog.cloudflare.com/kitesurf/) | Lightweight agent browser on Workers. Infrastructure, not an AFT competitor. Useful only if AFT apps need browser automation, screenshots, extraction, or website testing. **Do not build around it yet.** |
| Dynamic Workers | Commoditizes “run generated code.” Reinforces that AFT’s edge is identity, sharing, and lifecycle — not the execution sandbox. |
| [Perch](https://mandarwagh9.github.io/perch/#access) | GitHub project someone built after the YC RFS (agent deploy → sandbox URL → share like a doc → eject). Same category language, not a competitor to track — watch for ideas / overlap, don’t treat as market threat. |

## Product job

The user gives aft what an agent produced. aft determines how to run it, returns
a URL, and keeps the application usable for as long as it matters.

```text
Claude / Codex / Cursor / ChatGPT / Git / human
                         │
                         ▼
              Agent Plugin (skill + MCP)
                         │
                         ▼
                    aft.page
        detect → build → isolate → deploy → URL
                         │
              own → share → update → stop
```

## Product progression

| Layer | User outcome | Status / next proof |
| --- | --- | --- |
| Static | HTML or SPA → URL | Shipped (Drop-class; keep, don’t differentiate) |
| Ownership | Claim, list, update, rollback | Shipped / polish (`/claim` after deploy) |
| Sharing | Public, private, invite, revoke | Shipped / outsider proof |
| Secrets | Per-site vault + capability approve | Shipped |
| **Distribution** | **Agent Plugin → Cursor “Deploy with AFT”** | **Highest-priority next ship** |
| Full stack | worker/next via upstream proxy | OpenNext dogfood live (`next-hello.aft.page`) |
| Anything Drop | More generous static upload (any folder) | Limits raised; deepen on demand |
| Plugins | Agent Plugin install across coding agents | P0 this month |
| Cron | Schedule a script / DB hit / timed punch-in | **In scope for AFT Cloud** — private claimed only; ship when an app needs a clock |
| **Remix / clone** | Owner allows “Make a copy” → new slug, new owner | **In scope** — allow clone off by default. RFS hole. Build order ≠ “not the product” |
| AI automations | Prompt + schedule (e.g. 9am project brief) | **In scope** — same private gate; Slack/mobile = sinks |
| Portability | Hosted default; customer cloud when needed | CLI proof exists |
| Browser automation | Kitesurf-class if apps need it | Explicitly deferred |

## Dual track (proof ∥ platform)

| Track A — Proof | Track B — Platform |
| --- | --- |
| Strangers deploy without founder help | Agent → URL dependable (static + worker/next) |
| Repeat use after 7 / 30 days | **Agent Plugin install path (Cursor first)** |
| Share: owner + another person | Secrets, invite, rollback across runtimes |
| Design partners, evidence pack, YC | Temp Accounts for demos; aft-owned Workers for brand URL |
| Deploy / open / share / redeploy analytics | OpenNext via `@opennextjs/cloudflare` (no custom adapter) |

## Evidence scoreboard

| Metric | Why |
| --- | --- |
| Stranger deploys reaching a working URL | Core activation |
| Time-to-URL p50 / p95 (ops, every day) | Machine clock; human T2U is a stopwatch |
| Plugin installs → first deploy in Cursor | Distribution proof |
| Repeat deployers / apps used after 7 days | Durable utility |
| Apps shared with another person | Google-Doc sharing proof |
| Full-stack apps without cloud setup | Category expansion (Next / worker) |

Reliability: [NASA LLIS 803](https://llis.nasa.gov/lesson/803) Critical Items List — name the box, test it in prod, or leave it on the list. Scorecard: [OPS.md](./OPS.md).

## Near-term mission

> Get useful Small Software from an agent to a durable, permissioned URL — via a
> one-command Agent Plugin — while proving people return to it and share it.
> Compete on the Doc-simple experience (publish, permission, keep alive)—not on
> rebuilding Cloudflare for its own sake.

## AFT Cloud (all-in) · 10 Aug 2026

The company **is** AFT Cloud: **anything Small Software needs, deploy it** —
static, SPA, worker/next, secrets, share, data, cron, automations, clone,
whatever the app grows into. That is Plan A and the only product category.
Cron / remix / automations are **the cloud**, not a fallback roadmap.

Build order (plugin + strangers this month) is capacity, not a smaller
ambition. After ESOP exercise + variable → leave Polymerize → all-in hours
on the same cloud. YT + IG are brand for that cloud, after quit. Daily 1h
now is dogfood + GTM (G20), not Plan B.

Canonical line: [`../motivation.txt`](../motivation.txt).

```text
AFT Cloud = deploy anything Small Software needs
  → 1h/day (job on) ships on it
  → leave → all-in on the same cloud
  → if the cloud still isn’t a company: still all-in building
     (named apps / embed / OSS) — not a cozy job forever
```

Worst case remains: impressive infra, no habit. Then you still go all-in
on building — not back to half-time Polymerize as the plan. Quiet death
of the *category name* is fine; stopping shipping is not.

Harsh bar: **five strangers** deploy, return, share, would notice if AFT
disappeared. Remix = allow clone (off by default). Cron = private claimed.

Honest floor until leave: don’t resign before ESOP exercise + variable
(`FOUNDER.md`). After that: all-in.

## Visual review (approve on HTML)

As an open-source project, **visual decisions happen on an HTML board — not in
chat screenshots or lockable canvases.** Agents draft specimens in a `noindex`
HTML page; humans Approve / Kill in the page; only then does product chrome
change.

**Reject:** one mega-prompt → plan → do everything. That is not how we build.

**Default loop (suggest-5):** generate about five concrete options → Approve /
Disapprove on a page → learn from the receipt → implement Approves only → next
round constrained by Kills. Growth experiment: [`gtm.txt`](./gtm.txt) G16.

| Step | Who | Where |
| --- | --- | --- |
| 1. Draft ~5 specimens | Agent / contributor | `www/brand-board.html` (or a dated board) |
| 2. Approve / Kill in page | Human | Same HTML — buttons persist via `localStorage` |
| 3. Export decision log | Human | Copy markdown from the board dock |
| 4. Implement + learn | Agent / contributor | Product CSS / `BRAND.md` — **Approve items only**; archive receipt; Kills constrain the next suggest-5 |

Rules:

- Do not treat chat “looks good” as approval. The board export is the receipt.
- Do not invent logos, colors, or CTAs outside an open board revision.
- Prefer a deployable preview URL (`*.aft.page` or local static) so review is
  shareable — same spirit as the product (URL you can open and decide on).
- Brand identity source of truth remains [`BRAND.md`](./BRAND.md); the board is
  the **decision surface**, not a second brand system.

This is intentional OSS process: design review as a page anyone can open, vote
on, and paste into a PR — better than private lockable artifacts.
