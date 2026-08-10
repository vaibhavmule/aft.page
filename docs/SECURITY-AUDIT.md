# Daily security audit

Founder ritual. Not a WAF. No IPs. Goal: see scanner noise before it looks
like a real leak (200 HTML on `/.git/config`).

Run: `cd apps/api && npm run audit:security`  
Ops live view: [ops.aft.page](https://ops.aft.page/#logs) → **Probes**  
Hijack lock (origin bind / editToken): `npm run audit` → [ops `#audit`](https://ops.aft.page/#audit).  
First snapshot: 2026-08-09 (see below).

## Every day

1. Script (D1 last 24h junk + optional CF GraphQL if `CF_API_TOKEN` is set).
2. Ops → Logs → Probes (7d, all slugs).
3. Verdict: **pass** if public junk is 404 (or private 302). **fail** if any
   public hostname returns **200** on `.git` / `.env` / `.php` / `wp-` /
   `.aws` / `@vite/env`.
4. Note new hosts (custom domains) — they get scanned first.
5. Ignore `test--*` smoke and our own `probe404-*` checks.

## What we query

| Source | Window | Sees |
| --- | --- | --- |
| D1 `site_logs` | 7d retain | Documents + errors only. **Drops 200** on dotted files (`.env`, `.php`) |
| CF GraphQL `httpRequestsAdaptiveGroups` | 24h (this plan) | Every eyeball path, including those 200s |
| CF Security Events / bot score / WAF score | — | **Not on this plan** |
| Ops Probes | 7d | Same tokens as `isJunkPath` |

Zone: `aft.page` `c9c40ca61385a6346d90abfc954b44c9`. Custom hostnames
(`discovra.ai`) share this zone.

## Audit calls (how to check)

```bash
# 1) D1 — all slugs, junk tokens (script runs this)
npx wrangler d1 execute aft-page --remote --command \
  "SELECT slug, path, status, country, COUNT(*) n, MAX(created_at) last_at
   FROM site_logs
   WHERE created_at >= datetime('now','-1 days')
     AND (lower(path) LIKE '%.git%' OR lower(path) LIKE '%wp-%'
       OR lower(path) LIKE '%.env%' OR lower(path) LIKE '%.php%'
       OR lower(path) LIKE '%xmlrpc%' OR lower(path) LIKE '%phpinfo%'
       OR lower(path) LIKE '%cgi-bin%' OR lower(path) LIKE '%.aws%'
       OR lower(path) LIKE '%@vite%')
   GROUP BY 1,2,3,4 ORDER BY last_at DESC LIMIT 50"

# 2) Live public check (pick a public slug or custom host)
curl -sI "https://{host}/.git/config"   # want 404, or 302 if private
curl -sI "https://{host}/.env"
curl -sI "https://{host}/wp-login.php"

# 3) CF GraphQL — last 24h junk on the zone (needs Analytics Read)
# See scripts/security-audit.mjs — hosts + path_like %.git% / %.env% / %.php%
# + securityAction on discovra.ai / aft.page
```

Do **not** use [readme-black-chi.vercel.app](https://readme-black-chi.vercel.app/)
as a Vercel SPA comparison — it is a Vercel Drop of a README only.

## Baseline 2026-08-09

CF did **not** classify an anomaly. `discovra.ai`: 397 unknown / 1 managed
block. Firewall Events dataset unavailable on plan.

| Host | ~24h req | Scanner shape |
| --- | --- | --- |
| `aft.page` | 5.7k | FR/NL `.git/refs/*`, `/env.php`, `/wp-blog-header.php` → **200** (Pages fallback) |
| `discovra.ai` | 398 | CH `.env*`, US `/.git/config`, DE random `*.php` — 200 while public, 302 after private |
| other `*.aft.page` | tens | almost none |

D1 only showed discovra + our `probe404-*` test. Owner logs missed the 200
`.env`/`.php` hits.

**Why discovra, not every slug:** old public TLD (CT logs / DNS / search).
Random `foo.aft.page` is invisible to scanners. Apex `aft.page` is also hit.

Serve now hard-404s `isJunkPath` before SPA fallback. Pages apex uses the
same tokens in `www/functions/_middleware.js` (404 text/plain).

## Pass / fail

| Check | Pass |
| --- | --- |
| Public Worker site `GET /.git/config` | 404 text/plain |
| Private site same path | 302 login (keep logging) |
| New custom domain in CF junk paths | expected; statuses 404/302 |
| Public 200 on junk path | **fail** — SPA/Pages fallback leak |
| Apex `/.well-known/security.txt` | 200 text/plain (Contact + Expires; refresh before 2027-08-01) |
| `api.aft.page` / `cname.aft.page` over HTTP | 301 → https |
| HSTS on apex + api + mcp + cname | `max-age=15552000; includeSubDomains` (no preload) |
| CF `securityAction: block` spike | note only (plan barely reports this) |
