# aft.page API Worker

Deploy + serve for hosted sites.

- **Deploy:** `POST https://api.aft.page/v1/deploy`
- **Serve:** `https://{slug}.aft.page` (also `GET https://api.aft.page/s/{slug}/`)

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

Limits: 50 files, 2 MB/file, 5 MB total. Deploy is anonymous; each deploy returns
an **`editToken`** for redeploy and claim. Never overwrites an existing slug on
first deploy (collision → suffix like `about-me-mist`).

### Redeploy + claim

```bash
# Redeploy same slug (agent or human with editToken)
curl -X PATCH 'https://api.aft.page/v1/deploy?slug=my-demo' \
  -H 'X-Aft-Edit-Token: aft_edit_…' \
  -H 'Content-Type: text/html' \
  --data '<h1>updated</h1>'

# Start email claim (from preview)
curl -X POST https://api.aft.page/v1/claim/start \
  -H 'Content-Type: application/json' \
  -d '{"slug":"my-demo","email":"you@example.com","editToken":"aft_edit_…"}'
```

Claim verify: user clicks link in email → `GET /v1/claim/verify?token=…&slug=…`
→ session cookie → redirect to preview.

Requires D1 (`aft-page`), `AUTH_SECRET` (wrangler secret), and Email Sending on
`aft.page` (`npx wrangler email sending enable aft.page`).

Optional header: `X-Aft-Client: mcp|web|extension|curl|cli` (product metrics).

## Storage

- **R2** (`BUCKET` → `aft-page-sites`): site files at `sites/{slug}/{deployId}/…`.
- **KV** (`SITES`): slug → deploy pointer. Reads also fall back to KV blobs so
  sites uploaded before R2 was enabled keep serving.

## Metrics

Workers Analytics Engine dataset `aft_page_metrics` (binding `METRICS`) — see
[`docs/METRICS.md`](../../docs/METRICS.md). Binding is commented out in
`wrangler.jsonc` until Analytics Engine is enabled on the account; until then
instrumentation no-ops.

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
npx wrangler deploy
```

Requires Cloudflare account access (`npx wrangler login`). Account id: set `CLOUDFLARE_ACCOUNT_ID` if needed.
