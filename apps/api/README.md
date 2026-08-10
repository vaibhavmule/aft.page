# aft.page API Worker

Deploy + serve for hosted sites.

- **Deploy:** `POST https://api.aft.page/v1/deploy`
- **Serve:** `https://{slug}.aft.page` (also `GET https://api.aft.page/s/{slug}/`)
- **Early access:** `POST https://api.aft.page/v1/waitlist`

## Upload shapes

```bash
# single HTML body (paste)
curl -X POST https://api.aft.page/v1/deploy \
  -H 'Content-Type: text/html' \
  --data '<h1>hi</h1>'

# optional fixed slug
curl -X POST 'https://api.aft.page/v1/deploy?slug=my-demo' \
  -H 'Content-Type: text/html' \
  --data '<h1>hi</h1>'

# multipart files
curl -X POST https://api.aft.page/v1/deploy \
  -F 'files=@index.html;filename=index.html' \
  -F 'files=@styles.css;filename=styles.css'

# JSON (agents)
curl -X POST https://api.aft.page/v1/deploy \
  -H 'Content-Type: application/json' \
  -d '{"files":[{"path":"index.html","content":"<h1>hi</h1>"}]}'
```

Limits (static): 200 files, 10 MB/file, 50 MB total.  
Limits (`runtime` ≠ `static` in `aft.json`): 200 files, 10 MB/file, 50 MB total.

Deploy is anonymous; each deploy returns an **`editToken`** for redeploy and claim.
Unclaimed sites pause after 7 days idle (no visit or update) and are deleted after 30. Claim or PATCH to keep them.
Never overwrites an existing slug on first deploy (collision → suffix like `about-me-mist`).
Response includes `runtime` when `aft.json` declares one.

### Secrets

```bash
curl https://api.aft.page/v1/sites/my-demo/secrets -H 'Cookie: …'
curl -X PUT https://api.aft.page/v1/sites/my-demo/secrets/ANTHROPIC_API_KEY \
  -H 'Content-Type: application/json' -H 'Cookie: …' \
  -d '{"value":"sk-…"}'
```

Owner/editor only. Names listed; values never returned. Used by `lattice-js` and declared via `capabilities.secrets`.

### Runtimes

| `aft.json` runtime | Behavior |
| --- | --- |
| `static` (default) | R2 file serve |
| `lattice-js` | Hosted `/api/health` + `/api/convert`; UI from R2 |
| `worker` / `next` | Proxy to `upstream` URL after ACL |

### Redeploy + claim

```bash
# Redeploy same slug (agent or human with editToken) — new history row
curl -X PATCH 'https://api.aft.page/v1/deploy?slug=my-demo' \
  -H 'X-Aft-Edit-Token: aft_edit_…' \
  -H 'Content-Type: text/html' \
  --data '<h1>updated</h1>'

# List deploys / rollback (editToken or owner session — claim not required)
curl 'https://api.aft.page/v1/sites/my-demo/deploys' \
  -H 'X-Aft-Edit-Token: aft_edit_…'
curl -X POST 'https://api.aft.page/v1/sites/my-demo/rollback' \
  -H 'X-Aft-Edit-Token: aft_edit_…' \
  -H 'Content-Type: application/json' \
  -d '{"deployId":"dep_…"}'

# Start email claim (from /claim or live chrome)
curl -X POST https://api.aft.page/v1/claim/start \
  -H 'Content-Type: application/json' \
  -d '{"slug":"my-demo","email":"you@example.com","editToken":"aft_edit_…"}'
```

Deploy returns `claimUrl` (`https://aft.page/claim?slug=…&token=…`).
Claim verify: user clicks link in email → `GET /v1/claim/verify?token=…&slug=…`
→ session cookie → redirect to the live site.

Requires D1 (`aft-page`), `AUTH_SECRET` (wrangler secret), and Email Sending on
`aft.page` (`npx wrangler email sending enable aft.page`).

Optional Google login: wrangler secrets `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. Redirect URI:
`https://api.aft.page/v1/auth/google/callback`. Without them, `/login` still
offers magic link; Google start redirects back with `error=google_unavailable`.

Optional header: `X-Aft-Client: mcp|web|extension|curl|cli` (product metrics).

## Storage

- **R2** (`BUCKET` → `aft-page-sites`): site files at `sites/{slug}/{deployId}/…`.
- **KV** (`SITES`): slug → deploy pointer. Reads also fall back to KV blobs so
  sites uploaded before R2 was enabled keep serving.
- **D1** (`DB`): accounts, site ownership, sharing, lifecycle, connectors,
  runtimes metadata, encrypted site secret values, and normalized early-access
emails. `waitlist_signups.email` is unique, so repeat
submissions are idempotent. Waitlist abuse counters use HMAC-keyed identifiers
in KV; neither raw addresses nor client IPs are used in rate-limit keys. Analytics
Engine records aggregate waitlist outcomes without personal identifiers. The
public signup preflight does not depend on D1, and storage failures return a
non-cacheable, redacted `503` response.

## Metrics

Workers Analytics Engine dataset `aft_page_metrics` (binding `METRICS`) — see
[`docs/METRICS.md`](../../docs/METRICS.md). The binding is live in
`wrangler.jsonc`. Founder debug UI: `https://ops.aft.page` ([OPS.md](../../docs/OPS.md)).

## Tests

```bash
npm test          # vitest run, real KV/R2 bindings via workers pool
npm run test:watch
```

Tests live in `test/` and run against the Worker through
`@cloudflare/vitest-pool-workers`, so KV and R2 behave like production
(locally simulated, no network). `test/slug.test.ts` guards the rule that a
publish must never overwrite an existing site.

## Deploy this Worker

```bash
cd apps/api
npm install --legacy-peer-deps
npx wrangler d1 migrations apply aft-page --remote
npx wrangler deploy
SMOKE_SECRET=… npm run smoke
```

Requires Cloudflare account access (`npx wrangler login`). Account id: set `CLOUDFLARE_ACCOUNT_ID` if needed.

`npm run smoke` hits `POST https://ops.aft.page/api/smoke/run` (Bearer `SMOKE_SECRET`). Same suite also runs on cron `0 4,16 * * *` UTC. Scoreboard: [ops.aft.page](https://ops.aft.page/#smoke). Canaries: `https://test--{case}.aft.page`.

`npm run audit` hits `POST https://ops.aft.page/api/audit/run` (same secret). Hijack cases: [ops.aft.page/#audit](https://ops.aft.page/#audit). Scanner junk is `npm run audit:security`.
