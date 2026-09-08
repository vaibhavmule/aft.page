# aft.page ops (founder)

**Worker SSR ops + smoke/audit retired 8 Sep 2026.** See [parked/smoke-audit-ops.md](./parked/smoke-audit-ops.md).

Three failure classes. Do not mix them.

| Class | What it looks like | Where to look |
| --- | --- | --- |
| A — product down | status red | [status.aft.page](https://status.aft.page) |
| B — deploy rejected | error code + path | D1 `deploy_failures` (wrangler / Cloudflare MCP) |
| C — client never arrived | API green, MCP traffic 0 | Cursor MCP session |

## Surfaces

| URL | Audience | Job |
| --- | --- | --- |
| `https://status.aft.page` | public | Website, API, hello, MCP probes |
| `https://api.aft.page` | product | Deploy, claim, share, Run jobs |
| CF Workers Logs | you | Stacks / MCP JSON-RPC |

`ops.aft.page` returns **410 gone**. Scoreboard = D1 + status.

Status **API** probe = Worker isolate alive. It does **not** check D1 or R2.

No Sentry. No Grafana.

**Email** (`EMAIL` → `OPS_EMAILS`): platform **500** / unhandled throw (api/status/mcp), **status major_outage** (30m debounce), once-per-UTC-day Class B deploy digest. Not per-request 400.

## Crons (API Worker)

| Cron | Job |
| --- | --- |
| `*/5 * * * *` | Status probes, deploy digest, prune, anon GC |
| `0 9 * * *` | Brand-domain RDAP watch (`aft.dev` / `aft.app`) |

Customer Run builds still use GitHub Actions (`run-vite` / `run-next` / `run-static-build`).

## Counts (D1)

Prefer remote D1 on database `aft-page` (`49430d21-12f7-44dd-bd74-fb649148b34c`). Exclude `slug LIKE 'test--%'` from site counts. Internal emails: `OPS_EMAILS` + `*@aft.page` + founder gmail +tags.

## Deploy

```bash
cd apps/api && npx wrangler deploy
cd apps/mcp-worker && npx wrangler deploy   # if MCP changed
```

Committed ≠ deployed. Ship from the laptop.
