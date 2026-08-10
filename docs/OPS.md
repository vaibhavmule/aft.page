# aft.page ops (founder)

Three failure classes. Do not mix them.

| Class | What it looks like | Where to look |
| --- | --- | --- |
| A — product down | status red | [status.aft.page](https://status.aft.page) |
| B — deploy rejected | error code + file path | [ops.aft.page](https://ops.aft.page) → recent failures |
| C — client never arrived | API green, MCP traffic 0 | Cursor MCP session; ops health still green |

Cursor `mcp_auth` timeout is **C**. aft.page was up. See [USE-CASE-PARAKH.md](../../docs/USE-CASE-PARAKH.md).

## Surfaces

| URL | Audience | Job |
| --- | --- | --- |
| `https://status.aft.page` | public | Uptime probes (API process, MCP `/health`, website, hello) |
| `https://ops.aft.page` | founder (`OPS_EMAILS`) | Scoreboard + users/sites/domains + CF cost + failed deploys + feedback + retry + smoke + hijack audit + domain access |
| `https://test--{case}.aft.page` | public canary (`noindex`) | Last smoke artifacts — not tenant inventory |
| CF Workers Logs | you | Stacks / MCP JSON-RPC |

The status **API** probe means this Worker isolate is alive. It does **not** check D1 or R2.

No Sentry. No Grafana. Ops is the scoreboard + product counts + CF cost estimate + replay + feedback.

Workers MTD request/CPU on the cost card comes from GraphQL (`CF_API_TOKEN`, Account Analytics Read) when set, otherwise STATUS KV `ops:cf-usage` written via Cloudflare MCP on API deploy. Overage is $0.30/M req and $0.02/M CPU-ms after 10M req / 30M CPU-ms included ($5 Workers Paid floor). Refresh the KV snapshot when deploying `aft-page-api` if the token is not set.

**WfP trigger** (same cost row): D1 count of non-test `runtime=worker|next` sites with `upstream_url`. Pill `stay` / `watch` / `switch`. Watch at **400** site Workers, switch at **450** (500 Paid cap) or when MTD overage **> $20** (WfP’s extra floor — only wins if most of that is proxy double-bill). Static Drop is not this count. Numbers: [ADR-TEMP-ACCOUNTS.md](./ADR-TEMP-ACCOUNTS.md) § Costing.

## Two Workers Logs streams

`mcp.aft.page` hits **aft-page-api** (wildcard `*.aft.page`), which service-binds **aft-page-mcp**. One Cursor call is two streams:

1. `aft-page-api` — host + `/v1/deploy`
2. `aft-page-mcp` — JSON-RPC (`initialize` / `tools/list` / `tools/call`), including Zod failures that never reach the API

Ops page links both. Correlate with `x-aft-request-id` (also AE `blob6` / D1 `deploy_failures.request_id`).

## Scoreboard

`/` and `/api.json` show last **24h** and **7d**. Overview is **critical first** (health, hijack `#audit`, smoke CIL, deploy fails, scanner 200s), then **information** (T2U, rates, product, CF practices `#cf`, CF cost).

- **CF practices** (`#cf`) — D1/R2/KV/AE/Email bindings, MCP service bind, secrets, `nodejs_compat`, `compatibility_date` &lt; 6mo, SaaS zone. First ops hit writes STATUS KV `ops:cf-practices`; status cron refreshes when older than 20h.

- **Time-to-URL** (`deploys.ms`) — n / p50 / p95 machine clock (Worker → URL). Look at this every day. Human T2U is a stopwatch — [time-to-url.txt](../time-to-url.txt)
- successes (`deploys`) + failures (`deploy_failures`) + success rate
- by source (`mcp` / `web` / `curl` / `ops-retry` / …) — successes use `deploys.client`, failures use `deploy_failures.source`
- what to fix: top error codes + one-line why

Successful upload bodies are **not** stored. Success = counts + `ms`. Old rows have `ms` null and do not enter T2U.

## Deploy failures + retry

Every non-ok `/v1/deploy` **after** parse has files:

- structured `console.warn` `{ where: "deploy", error, path, slug, source, requestId }`
- D1 `deploy_failures` (14-day retention, pruned on the status cron) including **every uploaded path + size** (`upload_json`)
- file **bytes** in R2 `ops/failures/{id}/{path}` (`has_payload=1`) — not in D1
- Analytics Engine `deploy` with `blob2` = error, `blob5` = path

`no_files` / auth-before-body: no payload (nothing to retry).

Cron prune deletes the D1 rows **and** the R2 prefix.

Same `*/5` status cron also sweeps unclaimed idle sites: pause at 7d, hard-delete at 30d (`sweepUnusedAnonSites`). Skips `_login` and `test--*`. Claimed sites are never swept.

Click a failure on ops → why / fix / file list. Each file: download + text preview (64 KB cap) at `GET /f/{id}/file?path=`.

**Retry** = `POST /f/{id}/retry` (same session + `OPS_EMAILS`). Reloads R2 bytes and calls `deploy()` as a new anonymous POST (`x-aft-client: ops-retry`). New slug + live URL, or a new failure row if it still blows limits.

MCP Zod failures that never hit the API still cannot be retried from ops (class C).

500s return `{ error: "internal" }` only. The exception text stays in the log + `hint` column.

## Gate

`OPS_EMAILS` wrangler var (comma-separated). Unauthenticated → `https://aft.page/login?next=https://ops.aft.page/`. Wrong email → 403.

## Custom domains (Cloudflare for SaaS)

Live. Invite-only: `users.custom_domains` = `requested` | `approved`. Ops emails
skip the gate. Approve on [ops.aft.page](https://ops.aft.page/#users).

## Scanner probes

Daily scanner junk: [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) ·
`cd apps/api && npm run audit:security`.

Hijack CIL (origin↔slug, editToken dead after claim): ops `#audit` ·
`SMOKE_SECRET=… npm run audit` · same cron as smoke.

Ops → Logs → **Probes**: `site_logs` grouped by path + status + slug + country
(last 7d). Same `isJunkPath` tokens as serve (`.git`, `wp-`, `.env`, `.php`,
`xmlrpc`, `phpinfo`, `cgi-bin`). Public junk → 404 text/plain **before** SPA
fallback. Private stays 302 login. No IPs. CF GraphQL sees 200 `.env`/`.php`
that owner logs drop. Security Events / bot scores are not on this plan.

When comparing Vercel, do not use
[readme-black-chi.vercel.app](https://readme-black-chi.vercel.app/). That host
is a **Vercel Drop of a README file** — no `index.html`, so `/` is 404. Same
class as our readme-only deploy (`pd-readme` in vitest). It is not a SPA and
not how Vercel serves Next. Use a real app host or a public `*.aft.page` slug.

Already on:

1. SSL for SaaS + fallback origin `cname.aft.page` (AAAA `100::`, Active).
2. Zone route `*/*` → `aft-page-api` (in wrangler.jsonc). Apex `aft.page/*` →
   None so Pages stays.
3. Customers CNAME to `cname.aft.page`. D1 `custom_domains` + Domain tab
   progress. First dogfood: `discovra.ai`.

`CF_API_TOKEN` needs SSL and Certificates Write. Zone id is `CF_ZONE_ID`.

## Prod smoke (`*.test.aft.page`)

Not status. Status pings `/health`. Smoke **deploys**, hits MCP `tools/call`, claims the URL, then deletes `test--*` leftovers.

| When | How |
| --- | --- |
| After every API deploy | `cd apps/api && SMOKE_SECRET=… npm run smoke` |
| Twice daily | cron `0 4,16 * * *` UTC (not the `*/5` status cron) |
| Founder | ops → Smoke. Run now + cron: isolate then MCP-isolate public TLS |

`POST https://ops.aft.page/api/smoke/run` — `Authorization: Bearer $SMOKE_SECRET` or an `OPS_EMAILS` session. Results in D1 `smoke_runs` / `smoke_cases` (14 days). Clickable canaries: `test--{case}.aft.page` (`noindex`). Apex `test.aft.page` → ops `#smoke`. DNS `*.test.aft.page` is proxied; HTTPS handshake fails until an ACM pack covers `*.test.aft.page` (same shape as existing `*.mcp.aft.page`). Worker still maps `{case}.test.aft.page` → slug `test--{case}` in-process.

Covers (Worker isolate): HTML paste, multi-file, missing index → 404, `no_files`, reserved `ai`, slug collision, PATCH + rollback, destroy, MCP **binding** `/health`, claimUrl row, private → `/login?next=`, invite+revoke, unknown canary 404, custom-domain **inventory** (D1 counts).

After the isolate suite, API asks **aft-page-mcp** `POST /flight` (other isolate) to GET public `test--*` + `/claim` + active custom domains. Cron and ops Run now get TLS without a laptop. `npm run smoke` still does MCP JSON-RPC as a real client. Same-isolate `tools/call` is API→MCP→API and deadlocks — do not add it back. Marketing landing is optional.

Does **not** allocate a 10–50 MB payload or 201-file `too_many_files` in prod. Invite case skips email send. Last canaries stay up until the next run’s sweep.

## Critical items — [NASA LLIS 803](https://llis.nasa.gov/lesson/803)

This is what we follow. Subject: *Identification, Control, and Management of Critical Items Lists* (PD-ED-1240 / TM 4322A).

NASA: FMEA finds failure modes that lose the mission → put them on a CIL **before the design freezes** → each row needs retention rationale (design / test / inspection / failure history / ops) → use the list in operations.

AFT mapping (same job, smaller words):

| NASA | Here |
| --- | --- |
| FMEA | Class A / B / C + `fail-explain` |
| CIL | this scorecard + ops |
| Test rationale | prod smoke (`*.test.aft.page` + `npm run smoke`) |
| Inspection | [status.aft.page](https://status.aft.page) (`/health` only) |
| Failure history | `deploy_failures` + retry |
| Operational use | this file + ops Run now |

**Aligned where a row has a smoke case or a named gap.** Not a Shuttle FMEA shop — no fault trees, no PRA. We started the list after the product shipped (803 says start earlier). Open CIL items = “Still unknown” below; do not pretend smoke covers them.

Local `vitest` (miniflare) is **not** CIL test rationale. It checks logic. It does not fly. Class C (MCP `tools/call` never hit the API) is exactly what miniflare missed. Keep vitest; do not count it as flight test.

## SPOF scorecard

What exists. Smoke vs still unknown. This table **is** the CIL.

| Box | Smoke covers | Still unknown |
| --- | --- | --- |
| API isolate | deploy + serve + rollback in-process | isolate crash mid-request (no queue to kill) |
| D1 | site rows, invites, smoke_runs write | primary unavailability — cannot inject cheaply; public KV/R2 serve should still work if D1 is sad (not asserted) |
| R2 / KV | put + get canary bytes + destroy | regional replica lag |
| MCP binding | Worker: `/health` via `env.MCP`. MCP isolate `/flight` = public TLS. `npm run smoke`: JSON-RPC `tools/call` from Node | Cursor `mcp_auth` / client never arriving (class C). Do not round-trip API→MCP→API |
| Pages (`aft.page`) | `GET /claim` 200 on prod runs (MCP `/flight` + npm) | landing/docs/Drop UI (optional; status `/` only) |
| Email / auth | private gate 302 to `/login?next=` | magic-link delivery, Google OAuth callback |
| DNS / cert | MCP `/flight` HTTPS GET `test--html.aft.page` | `*.test.aft.page` HTTPS — needs ACM pack (token here cannot) |
| Custom domains | Worker inventory + MCP `/flight` HTTPS each `active` + SSL live | pending DCV / CNAME not pointed (skipped, not a fail) |

Data plane vs control plane: existing public sites should keep serving from KV/R2 if D1 or auth is down. Documented, not faked in smoke.

## Ship

D1 migration `0018_smoke.sql` + `SMOKE_SECRET` wrangler secret + DNS `test` / `*.test` (proxied AAAA `100::`) + deploy `aft-page-api`. Then `npm run smoke`.

## Related

- [METRICS.md](./METRICS.md) — AE schema + SQL
- [status.ts](../apps/api/src/status.ts) — public probes
- [ops.ts](../apps/api/src/ops.ts) — founder page
- [smoke.ts](../apps/api/src/smoke.ts) — prod contract
- [NASA LLIS 803](https://llis.nasa.gov/lesson/803) — Critical Items List (what we follow)

