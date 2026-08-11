# aft.page

**Your agent made the app. aft makes it real.** Give aft.page what an agent made
→ get a durable `*.aft.page` URL → share it like a Google Doc.

Hosted path: HTML/files via MCP, paste, upload, or API — plus runtimes
(upstream `worker` / `next`) with claim, share, and per-site secrets. See
[`rfs.txt`](rfs.txt) and [`docs/STRATEGY.md`](docs/STRATEGY.md).

| Path | Role |
| --- | --- |
| [`www/`](www/) | Apex website (landing, login, docs — Cloudflare Pages) |
| [`apps/api/`](apps/api/) | Worker: deploy, serve, secrets, upstream proxy |
| [`apps/extension/`](apps/extension/) | Chrome: aft icon / Deploy to aft.page on ChatGPT / Claude |
| [`apps/mcp/`](apps/mcp/) | MCP: any agent can `deploy_html` / `deploy_files` |
| [`apps/cli/`](apps/cli/) | Hosted CLI: `curl -fsSL https://aft.page/install \| sh` → `aft deploy` |
| [`examples/`](examples/) | `vite-hello`, `next-hello`, share-checklist |

Hosted CLI (no account required):

```bash
curl -fsSL https://aft.page/install | sh
aft deploy
```

OSS CLI (customer AWS / Cloudflare — parked, different product): [vaibhavmule/aft](https://github.com/vaibhavmule/aft).  
Hosted repo: [vaibhavmule/aft.page](https://github.com/vaibhavmule/aft.page).

## Try it

```bash
curl -X POST https://api.aft.page/v1/deploy \
  -H 'Content-Type: text/html' \
  -H 'X-Aft-Client: curl' \
  --data '<h1>Hello from aft.page</h1>'
# → { "url": "https://{slug}.aft.page", ... }
```

Live: [hello.aft.page](https://hello.aft.page) · [vite-hello.aft.page](https://vite-hello.aft.page) (Vite SPA) · [next-hello.aft.page](https://next-hello.aft.page) (Next SSR SPOC) · [share-checklist.aft.page](https://share-checklist.aft.page)

Human landings: [Docs](https://aft.page/docs) · [Drop](https://aft.page/drop/) · [host](https://aft.page/host-html/) · [share](https://aft.page/share-html/) · [upload](https://aft.page/upload-html/)

### Secrets (owner / editor)

```bash
# List names only
curl https://api.aft.page/v1/sites/{slug}/secrets -H "Cookie: …"

# Set env value
curl -X PUT https://api.aft.page/v1/sites/{slug}/secrets/ANTHROPIC_API_KEY \
  -H "Content-Type: application/json" -H "Cookie: …" \
  -d '{"value":"sk-…"}'
```

`aft.json` may declare `"runtime": "worker" | "next" | "static"` and
`capabilities.secrets` / `egress`. See [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md).

## Develop the API

```bash
cd apps/api
npm install --legacy-peer-deps
npx wrangler deploy
```

See [`apps/api/README.md`](apps/api/README.md), [`docs/METRICS.md`](docs/METRICS.md), and [`todo.txt`](todo.txt).
