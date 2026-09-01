---
name: aft-status
description: Founder snapshot of aft git/deploy/sync, status.aft.page, ops D1, product line, and what to build next (market mapped onto todo — not a new SKU). Use when asked for status, "where are we", ops health, or what to ship next.
disable-model-invocation: true
---

# aft founder status

Workspace root `Projects/aft` is **not** a git repo. Two products:

| Path | Repo | Live |
| --- | --- | --- |
| `aft.page/` | github.com/vaibhavmule/aft.page | hosted product |
| `cli/` | github.com/vaibhavmule/aft | OSS customer-cloud CLI |
| `docs/` | unversioned workspace notes | — |

**Committed ≠ deployed.** Ships are `wrangler deploy` / Pages from the laptop, not git push. Prod can be ahead of GitHub. That is the usual failure mode — treat uncommitted shipped code as a backup risk, not "unsynced prod".

## Run

Do these in parallel where you can. **Ops is D1 — never skip it because `ops.aft.page` is 302.**

1. Execute [scripts/check.sh](scripts/check.sh) (`bash .cursor/skills/aft-status/scripts/check.sh` from workspace or `aft.page/`). It dumps git/probes **and** ops from D1 via `wrangler d1 execute aft-page --remote` (`scripts/ops-d1.py`).
2. `aft_health` on MCP `user-aft`.
3. Cloudflare MCP `workers_list` → `modified_on` for `aft-page-api` and `aft-page-mcp`.
4. **Ops D1** (required). Prefer Cloudflare MCP `d1_database_query` on `aft-page` (`49430d21-12f7-44dd-bd74-fb649148b34c`). Same queries as `ops-d1.py`. Fallback is check.sh wrangler if MCP is down.
5. Read `aft.page/todo.txt` + product table in `aft.page/docs/STRATEGY.md` (do not invent roadmap).
6. **Build next (required).** Web search current market, then pick **one** open `todo.txt` row. Rules in § Build next. Do not skip because Class A is green.

Canonical ops map: `aft.page/docs/OPS.md`.

## Ops D1 (every run)

`ops.aft.page` 302 → `/login` is the **cookie gate**. Not down. Do not ask the user to paste `/api.json` unless D1 **and** wrangler both failed.

Namespace: `user-cloudflare-bindings` tool `d1_database_query`. Bind ISO cutoffs in UTC (`now-1d` / `now-7d` as `YYYY-MM-DDTHH:MM:SS.000Z`) — do **not** use `datetime('now')` (space vs `T` breaks the compare).

T2U percentile = ops `percentileNearest`: `rank = ceil(p/100 * n) - 1` on sorted `ms`. Bar: p50 &lt; 3s · p95 &lt; 10s.

**Internal** (hide from the external list): `hello@aft.page`, `vaibhavmule135@gmail.com`, `*@aft.page`, `vaibhavmule135+…@gmail.com`. Everyone else is external. List every external email + sites + joined. Flag mill-looking (20+ sites in 24h). Accounts ≠ `qa/stranger-trial.md`.

**CF cost** is GraphQL / STATUS KV, not D1. Omit unless the user pasted ops `/api.json`.

```sql
-- 1) snapshot + rates
SELECT
  (SELECT COUNT(*) FROM sites WHERE slug NOT LIKE 'test--%') AS sites,
  (SELECT COUNT(*) FROM sites WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%') AS claimed,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM waitlist_signups) AS waitlist,
  (SELECT COUNT(*) FROM deploys WHERE created_at >= :s24) AS ok24,
  (SELECT COUNT(*) FROM deploy_failures WHERE created_at >= :s24) AS fail24,
  (SELECT COUNT(*) FROM deploys WHERE created_at >= :s7) AS ok7,
  (SELECT COUNT(*) FROM deploy_failures WHERE created_at >= :s7) AS fail7,
  (SELECT COUNT(*) FROM custom_domains) AS domains,
  (SELECT COUNT(*) FROM users WHERE custom_domains = 'requested') AS domain_requests;

-- 2) users (classify internal/external in the report)
SELECT u.email, u.created_at, u.custom_domains, COALESCE(s.n, 0) AS sites
FROM users u
LEFT JOIN (
  SELECT owner_user_id, COUNT(*) AS n FROM sites
  WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%'
  GROUP BY owner_user_id
) s ON s.owner_user_id = u.id
ORDER BY u.created_at DESC;

-- 3) T2U 24h (repeat with :s7 for 7d)
SELECT ms FROM deploys WHERE ms IS NOT NULL AND created_at >= :s24;

-- or n/p50/p95 in SQL (24h shown; swap :s7)
WITH v AS (SELECT ms FROM deploys WHERE ms IS NOT NULL AND created_at >= :s24),
n AS (SELECT COUNT(*) AS c FROM v)
SELECT (SELECT c FROM n) AS n,
  (SELECT ms FROM v ORDER BY ms LIMIT 1 OFFSET (SELECT MAX((c * 50 + 99) / 100, 1) - 1 FROM n)) AS p50,
  (SELECT ms FROM v ORDER BY ms LIMIT 1 OFFSET (SELECT MAX((c * 95 + 99) / 100, 1) - 1 FROM n)) AS p95;

-- 4) top Class B
SELECT error, COUNT(*) AS n FROM deploy_failures
WHERE created_at >= :s7
GROUP BY error ORDER BY n DESC LIMIT 5;
```

If MCP `d1_database_query` has no bind params, inline the ISO strings (as `ops-d1.py` does). `unauthorized` / `reserved_slug` / `no_files` are expected scanner/auth noise — Class B, not Class A.

## Build next (every run)

Not a second product. Map **today’s** market onto the **open** `todo.txt` rows. Sequence stays Drop → Deploy → **Run** → Code. Capacity is still Run + Plugin listing + Code + WfP. Do not add IaaS, Cron SKU, Kitesurf, or “wait until proof.”

**Search (live, dated — do not reuse last week’s take):**

1. `Cursor Marketplace` agent plugins / `npx plugins add` / [agent-plugins.org](https://agent-plugins.org) / Vercel Agent Plugins
2. ChatGPT / Codex **Sites** (prompt → host) vs git-to-URL
3. Cloudflare wrap-when-enough: Dynamic Workers, Sandbox, Drop — only if it unblocks the door we are shipping (today: Run)

**Rank (first match wins — one pick):**

| If this is true now | Pick this open todo (if still unchecked) |
| --- | --- |
| Run paste / `deploy_repo` still lies (no URL and no honest fail) | **Run engine** — every channel is a lie until this works |
| Engine works; AFT not one-click in Cursor Marketplace / `npx plugins add` not ready | **Plugin listing** (Cursor first) — owned channel. Market: agents install from Marketplace; Vercel/CF already listed |
| Listing exists; strangers not recorded | **Stranger-trial** 5 rows — ops external Gmails are not that scoreboard |
| Plugin + 5 trials moving; Code still a hole vs Sites | **Code** (prompt/template → D1+R2) — Sites is that category, not Run. Do not clone ChatGPT Sites as a brand |
| Next.js/script cap or Worker count approaching WfP trigger | **WfP / Dynamic Workers** — wrap CF, don’t rebuild |

**Not this (say it if the search is loud):** ChatGPT Sites ≠ ship a Sites clone (that’s Code, later). Directory spam ≠ distribution. Paid social ≠ the $1k (builds only). External claimers + mill accounts ≠ retained users.

Use ops D1 as the tie-break: mill-looking externals (20+ sites/day) → inspect, don’t celebrate. Engine being hammered is not “plugin can wait” if the listing is still the GTM hole.

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
| `https://ops.aft.page` | Founder HTML (cookie). 302 login ≠ down. Scoreboard via D1 (`aft-page`) |
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
| OpenNext dogfood | Live (`next-hello.aft.page`) |
| **Agent Plugin** | **P0** — `npx plugins add vaibhavmule/aft.page` (push + demo + 5 users still open) |
| **Run** | In scope — paste repo → URL ([RUN.md](../../aft.page/docs/RUN.md)) |
| AI automations | Parked (`docs/parked/cron.md`) — not a SKU |
| Browser automation / Kitesurf | Explicitly deferred |

**Freeze lifted 23 Aug 2026.** Host / Ship / Run may ship. See `todo.txt` + STRATEGY § Focus.

OSS CLI (`cli/`, customer-cloud AWS) is **parked** — different product from hosted aft.page. Hosted needs its own CLI later (`api.aft.page`). Cron-as-product is **parked** (`docs/parked/cron.md`); API status/smoke crons are unrelated ops.

Proof gaps (todo, not ops): ≥5 repeat deployers, ≥1 invite-accepted share, plugin install bar. YC Fall 2026 rejected 29 Aug (no interview). Next on-time 2 Nov — only with retained users.

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
- ops HTML: 302 login is expected (cookie). Scoreboard from D1, not that curl.
- ops D1: sites/claimed/users · 24h+7d ok/fail + T2U p50/p95 · top fail codes · **list every external user** (email, sites, joined)
- CF cost: omitted unless pasted (not in D1)

## Product
- Now: Drop + claim/share/secrets + OpenNext
- This month: Agent Plugin, stranger proof, Run
- Parked: AI automations / Cron SKU

## Next
- Market: … (dated, 1–2 facts + URLs from this run’s search)
- Pick: one open todo.txt row + why
- Not this: … (loud trend that is a detour, or “none”)
```

Be blunt. "Working smooth" only if Class A is green **and** you did not skip ops. Uncommitted shipped work → say **not sync**, prod likely fine, GitHub is the hole.
