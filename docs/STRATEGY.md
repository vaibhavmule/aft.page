# aft.page — strategy

Internal north star. Canonical mission: [`../rfs.txt`](../rfs.txt).
Belief: [`../youtube-moment.txt`](../youtube-moment.txt).
CN + EU are growth exceptions (paid primitives, local agents): [`REGIONS.md`](./REGIONS.md). Not the current build.

Updated: 2026-08-24

**Runnable OSS (GitHub → URL):** [RUN.md](./RUN.md) — Drop / Deploy / Run / Code:
[HOST.md](./HOST.md) · [SHIP.md](./SHIP.md) · [CODE.md](./CODE.md). Sites intel:
[CHATGPT-SITES.md](./CHATGPT-SITES.md) (Code layer, not `aft deploy`).

## Four doors (one cloud)

Same `*.aft.page`. Four ways in. Do not four brands.

| Door | Layer | Job | Status |
| --- | --- | --- | --- |
| **Drop** | [Host](./HOST.md) | Folder/zip → URL. Easy start | Shipped |
| **Deploy** | [Ship](./SHIP.md) | Agent already built it → `aft deploy` detects + uploads. Not Sites | Almost (MCP/CLI) |
| **Run** | [Run](./RUN.md) | Distribution: GitHub repo → try URL | Next — static first |
| **Code** | [Code](./CODE.md) | Prompt/template → app with D1 + R2. Not v0 | After Run |

Run is the **distribution engine**. Drop is on-ramp. Deploy is `aft deploy`
(detect + ship). **Code** is prompt/template → app with D1 + R2. Not v0. Not
named Retool (their brand).

**`aft.run` is taken.** Stay on `aft.page` (`/run/`, later `run.aft.page`).

## Mode

**Development mode.** No freeze. No parking as a reason not to build. No
launch dates. Build. Distribution is in the product (**Run**), not a later
campaign.

1. Freeze / park / “wait until proof” do not block shipping. Sequence
   (Drop → Deploy → Run → Code) is capacity, not a freeze.
2. **$1,000 USD** for Show HN + Product Hunt of **AFT Run** — spend on
   Run builds, not ads. Details: [RUN.md](./RUN.md) § Launch budget.

Retained users still matter for YC. They do not block building.

Bugfixes that unblock deploy → claim → invite → return stay in. Canonical
checklist: [`../todo.txt`](../todo.txt). Next runtime is still chosen from what
outsiders + compat-probe fail to deploy — not from
[`FRAMEWORK-COMPATIBILITY.md`](./FRAMEWORK-COMPATIBILITY.md).

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

### Extending AFT: open protocols

Do not grow a proprietary agent island. Extend AFT — and let agents reach it —
through open protocols. Then Unix.

| | Spec | AFT surface |
| --- | --- | --- |
| **MCP** | [modelcontextprotocol.io](https://modelcontextprotocol.io) | Thin remote server `https://mcp.aft.page/mcp` |
| **Skills** | [agentskills.io](https://agentskills.io) | [`apps/plugin/skills/deploy-to-aft/SKILL.md`](../apps/plugin/skills/deploy-to-aft/SKILL.md) |
| **Plugins** | [agent-plugins.org](https://agent-plugins.org) | [`apps/plugin`](../apps/plugin) — `npx plugins add vaibhavmule/aft.page` |
| **Unix** | — | Small programs that compose (`aft deploy`, curl, MCP tools). **libaft** ([`apps/sdk`](../apps/sdk)) embeds deploy into someone else's CLI, background agent, or software factory — local or cloud. |

Public copy: [`www/plugins.md`](../www/plugins.md) · [`/plugins`](https://aft.page/plugins).

Marketplace listings can lag. The portable package is the product. Do not invent
a fourth agent format.

#### Thin MCP (not a platform)

See [ADR-MCP-THIN.md](./ADR-MCP-THIN.md). MCP is a **thin deploy adapter**,
aligned with Cloudflare’s stateless MCP / `createMcpHandler` model — not an MCP
portal or control plane.

Frozen tools: `deploy` · `deploy_repo` · `aft_deploys` · `aft_rollback` ·
`aft_health`. Prefer remote `https://mcp.aft.page/mcp`; stdio remains a
local/dev fallback.

Plugin core action:

> Deploy this HTML/app privately using AFT and return a shareable URL.

Package:

- AFT deployment skill (`SKILL.md`)
- Existing thin MCP ([`apps/mcp`](../apps/mcp), [`apps/mcp-worker`](../apps/mcp-worker))
- Authentication
- Default privacy and expiry settings
- Update / redeploy capability

Ship bar:

- Valid Agent Plugin (skill + MCP): `npx plugins add vaibhavmule/aft.page`
- 30-second demo: prompt → application → private URL (still open)
- Public plugin repo + install command (this repo)
- **libaft** import: `createAft().deploy({ html })` without wrapping MCP
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
| **Run** | Public GitHub repo → job → live URL | [RUN.md](./RUN.md) — next |
| **Code** | Prompt/template → app with D1 + R2 | [CODE.md](./CODE.md) — after Run |
| Full stack | worker/next via upstream proxy | OpenNext dogfood live (`next-hello.aft.page`) |
| Anything Drop | More generous static upload (any folder) | Limits raised; deepen on demand |
| Plugins | Agent Plugin install across coding agents | P0 this month |
| **Remix / clone** | Owner allows “Make a copy” → new slug, new owner | **In scope** — allow clone off by default. RFS hole. Build order ≠ “not the product” |
| AI automations | Prompt + schedule (e.g. 9am project brief) | **In scope** — same private gate; Slack/mobile = sinks. Schedule clock: [parked/cron.md](./parked/cron.md) |
| Portability | Hosted default; customer cloud when needed | CLI proof exists |
| Browser automation | Kitesurf-class if apps need it | Explicitly deferred |

## Dual track (proof ∥ platform)

| Track A — Proof | Track B — Platform |
| --- | --- |
| Strangers deploy without founder help | Agent → URL dependable (static + worker/next) |
| Repeat use after 7 / 30 days | **Agent Plugin install path (Cursor first)** |
| Share: owner + another person | Secrets, invite, rollback across runtimes |
| Design partners, evidence pack, material YC updates | Temp Accounts for demos; aft-owned Workers for brand URL |
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
static, SPA, worker/next, secrets, share, data, automations, clone,
whatever the app grows into. That is Plan A and the only product category.
Remix / automations are **the cloud**, not a fallback roadmap.
Schedule clock: [cron.md](./parked/cron.md) — plumbing for automations, not a
third brand.

Build order (plugin, strangers, Run) is capacity, not a smaller
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
disappeared. Remix = allow clone (off by default).

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
- Prefer a deployable preview URL (live aft.page or local static) so review is
  shareable — same spirit as the product (URL you can open and decide on).
- Brand identity source of truth remains [`BRAND.md`](./BRAND.md); the board is
  the **decision surface**, not a second brand system.

This is intentional OSS process: design review as a page anyone can open, vote
on, and paste into a PR — better than private lockable artifacts.
