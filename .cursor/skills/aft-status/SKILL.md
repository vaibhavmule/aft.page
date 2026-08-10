---
name: aft-status
description: Founder snapshot of aft git/deploy/sync, status.aft.page, ops.aft.page, and product line (Drop, plugin, cron, automations). Use when explicitly asked for status, "where are we", ops health, or whether everything is committed/deployed/synced.
disable-model-invocation: true
---

# aft founder status

Workspace root `Projects/aft` is **not** a git repo. Two products:

| Path | Repo | Live |
| --- | --- | --- |
| `aft.page/` | github.com/vaibhavmule/aft.page | hosted `*.aft.page` |
| `cli/` | github.com/vaibhavmule/aft | OSS customer-cloud CLI |
| `docs/` | unversioned workspace notes | — |

**Committed ≠ deployed.** Ships are `wrangler deploy` / Pages from the laptop, not git push. Prod can be ahead of GitHub. That is the usual failure mode — treat uncommitted shipped code as a backup risk, not "unsynced prod".

## Run

1. Execute [scripts/check.sh](scripts/check.sh) (`bash .cursor/skills/aft-status/scripts/check.sh` from workspace or `aft.page/`).
2. `aft_health` on MCP `user-aft`.
3. Cloudflare MCP `workers_list` → `modified_on` for `aft-page-api` and `aft-page-mcp`.
4. Read `aft.page/todo.txt` + product table in `aft.page/docs/STRATEGY.md` (do not invent roadmap).
5. Ops scoreboard needs founder login. If `ops.aft.page` is 302 → `/login`, say so. Ask the user to open [ops.aft.page](https://ops.aft.page) or paste `/api.json`. Do not guess T2U / failure counts.

Canonical ops map: `aft.page/docs/OPS.md`.

## Three failure classes (do not mix)

| Class | Looks like | Where |
| --- | --- | --- |
| A — product down | status red | [status.aft.page](https://status.aft.page) + `/api.json` |
| B — deploy rejected | error code + path | ops → recent failures |
| C — client never arrived | API green, MCP traffic 0 | Cursor MCP session |

Status **API** probe = Worker isolate alive. It does **not** check D1 or R2.

No Sentry. No Grafana. Scanner junk (`.env`, `.php`, `wp-`) is expected — not an outage.

## Surfaces

| URL | Job |
| --- | --- |
| `https://status.aft.page` | Public probes: API, MCP `/health`, website, site serve (hello) |
| `https://ops.aft.page` | Founder: T2U, deploys/failures, CF cost, smoke, feedback, domains |
| `https://api.aft.page/health` | API isolate |
| `https://mcp.aft.page/health` | MCP isolate |
| `https://test--html.aft.page` | Last smoke canary (`noindex`) — 200 means last smoke left artifacts |

Workers: `aft-page-api` (routes `*/*` + `api.aft.page`), `aft-page-mcp` (bound as `MCP`). Apex `aft.page` = Pages (`www/`). Crons on API: `*/5` status probes, `0 4,16 * * *` UTC smoke.

Yesterday's `D1_ERROR: no such column: active` on site serve is a known recovered Class A (migration lag). Mention only if still on `recentFailures` and probes are red *now*.

## Product line (hosted)

Source of truth: `STRATEGY.md` progression + `todo.txt`. As of skill authoring:

| Layer | Status |
| --- | --- |
| Static Drop | Shipped (keep, don't differentiate) |
| Ownership / claim / rollback | Shipped |
| Sharing (public / private / invite) | Shipped |
| Secrets vault | Shipped |
| Lattice JS + OpenNext dogfood | Live (`lattice.aft.page`, `next-hello.aft.page`) |
| **Agent Plugin** | **P0** — `npx plugins add vaibhavmule/aft.page` (push + demo + 5 users still open) |
| Cron | **Later.** Private claimed sites only. Slug `cron` reserved. No product yet. |
| AI automations | **After Cron.** Same private gate; Slack/mobile = notify sinks. Slugs reserved. Not started. |
| Browser automation / Kitesurf | Explicitly deferred |

OSS CLI is a separate track (`docs/PRODUCT.md`). Do not mix "aft cron the product" with the API status/smoke crons.

Proof gaps (todo, not ops): ≥5 repeat deployers, ≥1 invite-accepted share, YC video, plugin install bar.

## Report shape

```markdown
## Sync
- aft.page: HEAD … vs origin/main ahead/behind … dirty N
- cli: …
- Deploy: aft-page-api modified_on … · aft-page-mcp … · Pages assumed from www/ if apex 200
- Verdict: committed? deployed? git↔origin? laptop↔prod?

## Live
- status.aft.page: overall … (components + any recentFailures still relevant)
- probes: api / mcp / www / hello / smoke canary
- ops: opened / 302 login / key T2U + failure rate if user pasted

## Product
- Now: Drop + claim/share/secrets + lattice/OpenNext
- This month: Agent Plugin
- Not yet: Cron → then AI automations
```

Be blunt. "Working smooth" only if Class A is green **and** you did not skip ops. Uncommitted shipped work → say **not sync**, prod likely fine, GitHub is the hole.
