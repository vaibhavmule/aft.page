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

Limits: 50 files, 2 MB/file, 5 MB total. No auth yet.

## Storage

- **R2** (`BUCKET` → `aft-page-sites`): site files at `sites/{slug}/{deployId}/…`.
- **KV** (`SITES`): slug → deploy pointer. Reads also fall back to KV blobs so
  sites uploaded before R2 was enabled keep serving.

## Deploy this Worker

```bash
cd apps/api
npm install --legacy-peer-deps
npx wrangler deploy
```

Requires Cloudflare account access (`npx wrangler login`). Account id: set `CLOUDFLARE_ACCOUNT_ID` if needed.
