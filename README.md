# aft.page

**Your agent made the app. aft makes it real.** Give aft.page what an agent made
→ get a durable `*.aft.page` URL → share it like a Google Doc.

Today the hosted path accepts HTML/files through MCP, paste, upload, or API.
The product grows toward stateful and full-stack Small Software without exposing
Big Software cloud complexity. See [`rfs.txt`](rfs.txt).

| Path | Role |
| --- | --- |
| [`marketing/`](marketing/) | Apex landing + SEO pages (Cloudflare Pages) |
| [`apps/api/`](apps/api/) | Worker: `POST /v1/deploy` + `*.aft.page` static serve |
| [`apps/extension/`](apps/extension/) | Chrome: aft icon / Deploy to aft.page on ChatGPT / Claude |
| [`apps/mcp/`](apps/mcp/) | MCP: any agent can `deploy_html` / `deploy_files` |

OSS CLI that deploys into *your* AWS/Cloudflare: [vaibhavmule/aft](https://github.com/vaibhavmule/aft).
(Hosted aft.page has no CLI yet — use MCP or paste.)

## Try it

```bash
curl -X POST https://api.aft.page/v1/deploy \
  -H 'Content-Type: text/html' \
  -H 'X-Aft-Client: curl' \
  --data '<h1>Hello from aft.page</h1>'
# → { "url": "https://{slug}.aft.page", ... }
```

Live example: [https://hello.aft.page](https://hello.aft.page)

Human landings: [paste HTML](https://aft.page/paste-html/) · [host](https://aft.page/host-html/) · [share](https://aft.page/share-html/) · [upload](https://aft.page/upload-html/)

## Develop the API

```bash
cd apps/api
npm install --legacy-peer-deps
npx wrangler deploy
```

See [`apps/api/README.md`](apps/api/README.md), [`docs/METRICS.md`](docs/METRICS.md), and [`todo.txt`](todo.txt).
