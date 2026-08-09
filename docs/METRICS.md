# aft.page metrics

Phase 1 product telemetry via **Workers Analytics Engine**.

Dataset: `aft_page_metrics`  
Binding: `METRICS` on `aft-page-api` and `aft-page-mcp` (same dataset).

Created by deploying the Workers with `analytics_engine_datasets` in `wrangler.jsonc`.
If writes no-op, confirm the binding shows on the Worker in the dashboard.

Founder UI: [ops.aft.page](https://ops.aft.page) — see [OPS.md](./OPS.md).

## Why

Instrument before more features. These numbers beat another feature:

| Metric | Event / how |
| --- | --- |
| Deploys/day | `deploy` where status = `ok` |
| Unique deployers | distinct `blob4` (hashed IP) — **approx** until claim |
| Claims | `claim` — **0 until claim API** |
| Redeploys | `redeploy` — **0 until update-same-slug** |
| Public page views | `page_view` — HTML 200 only (not CSS/JS); path in `blob5`. KV `views:day:{utc}` for ops/hub counts |
| Edge serves | `serve` — all statuses; country in `blob4`, bytes in `double2` |
| MCP vs Web | `blob1` source on `deploy` |
| **Time-to-URL** | `deploys.ms` on ops + AE `double1` (ms) on ok deploys. Daily number. [time-to-url.txt](../time-to-url.txt) |
| Failed deploys | `deploy` where status ≠ `ok` |
| Waitlist conversions | `waitlist` where status = `new` (duplicates are separate) |
| Feedback | `feedback` (already shipped) |
| MCP protocol hits | `mcp` from `aft-page-mcp` (`blob1` = JSON-RPC method) |

## Schema

| Field | Alias | Values |
| --- | --- | --- |
| `index1` | event | `deploy`, `page_view`, `serve`, `claim`, `redeploy`, `waitlist`, `feedback`, `mcp` |
| `blob1` | source | `mcp`, `web`, `extension`, `curl`, `cli`, `other` — or MCP JSON-RPC method |
| `blob2` | status | `ok`, or error code (`no_files`, `too_many_files`, …) |
| `blob3` | slug | site slug when known — or MCP tool name |
| `blob4` | deployer | first 16 hex of SHA-256(`aft.page:deployer:{cf-connecting-ip}`) |
| `blob5` | path | failing file path (`bad_path`, `file_too_large`, …) |
| `blob6` | request_id | `cf-ray` or generated `aft_…` |
| `double1` | ms | deploy duration |
| `double2` | bytes | payload bytes |
| `double3` | files | file count |
| `double4` | http_status | HTTP status |

Clients send `X-Aft-Client: mcp|web|extension`. Remote MCP sends `mcp-remote`, stored as `mcp`. Curl without the header is inferred from User-Agent when possible.

## Query (SQL API)

Account: `44255ec64e0080b678670b53bf810d27`

```bash
ACCOUNT=44255ec64e0080b678670b53bf810d27
TOKEN=…   # Account Analytics Engine Read

curl -sS "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql" \
  -H "Authorization: Bearer ${TOKEN}" \
  --data-binary @- <<'SQL'
-- Deploys / day (last 14 days)
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  count() AS deploys
FROM aft_page_metrics
WHERE index1 = 'deploy' AND blob2 = 'ok'
  AND timestamp > NOW() - INTERVAL '14' DAY
GROUP BY day
ORDER BY day
SQL
```

### Unique deployers / day (approx)

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  uniqExact(blob4) AS approx_deployers
FROM aft_page_metrics
WHERE index1 = 'deploy' AND blob2 = 'ok'
  AND timestamp > NOW() - INTERVAL '14' DAY
GROUP BY day
ORDER BY day
```

### MCP vs Web (and other sources)

```sql
SELECT
  blob1 AS source,
  count() AS deploys
FROM aft_page_metrics
WHERE index1 = 'deploy' AND blob2 = 'ok'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY source
ORDER BY deploys DESC
```

### Avg / p50 deploy time (ms)

```sql
SELECT
  avg(double1) AS avg_ms,
  quantileExact(0.5)(double1) AS p50_ms,
  quantileExact(0.95)(double1) AS p95_ms
FROM aft_page_metrics
WHERE index1 = 'deploy' AND blob2 = 'ok'
  AND timestamp > NOW() - INTERVAL '7' DAY
```

### Failed deploys

```sql
SELECT
  blob2 AS error,
  count() AS failures
FROM aft_page_metrics
WHERE index1 = 'deploy' AND blob2 != 'ok'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY error
ORDER BY failures DESC
```

### Failed deploys by file path

```sql
SELECT
  blob5 AS path,
  blob2 AS error,
  count() AS failures
FROM aft_page_metrics
WHERE index1 = 'deploy' AND blob2 != 'ok' AND blob5 != ''
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY path, error
ORDER BY failures DESC
LIMIT 25
```

### MCP protocol volume

```sql
SELECT
  blob1 AS method,
  blob3 AS tool,
  blob2 AS status,
  count() AS n
FROM aft_page_metrics
WHERE index1 = 'mcp'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY method, tool, status
ORDER BY n DESC
```

### Public page views / day

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  count() AS views
FROM aft_page_metrics
WHERE index1 = 'page_view'
  AND timestamp > NOW() - INTERVAL '14' DAY
GROUP BY day
ORDER BY day
```

### Top viewed slugs

```sql
SELECT
  blob3 AS slug,
  count() AS views
FROM aft_page_metrics
WHERE index1 = 'page_view'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY slug
ORDER BY views DESC
LIMIT 25
```

### Claims / redeploys (empty until APIs exist)

```sql
SELECT index1 AS event, count() AS n
FROM aft_page_metrics
WHERE index1 IN ('claim', 'redeploy')
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY event
```

## Dashboard

Founder: [ops.aft.page](https://ops.aft.page) (Time-to-URL + scoreboard + failures + retry).  
Cloudflare → Analytics & Logs → Workers Analytics Engine, or paste the SQL above into the SQL API.

Grafana: use the [Analytics Engine SQL datasource](https://developers.cloudflare.com/analytics/analytics-engine/grafana/) if you want a standing board.

### Waitlist outcomes

```sql
SELECT
  blob2 AS status,
  count() AS submissions
FROM aft_page_metrics
WHERE index1 = 'waitlist'
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY status
ORDER BY submissions DESC
```

Statuses are `new`, `duplicate`, `honeypot`, validation/request errors,
`rate_limited`, or `temporarily_unavailable`. Waitlist metrics never contain the
submitted email, IP address, or derived rate-limit identifier.

## Privacy

- Raw IPs are never written.
- `blob4` is a one-way hash for approximate uniqueness only.
- After claim/auth, prefer account id as the uniqueness key.
