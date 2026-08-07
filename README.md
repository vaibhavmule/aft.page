# aft.page

**Your agent made the app. aft makes it real.** Give aft.page what an agent made
→ get a durable `*.aft.page` URL → share it like a Google Doc.

Hosted path: HTML/files via MCP, paste, upload, or API — plus runtimes
(`lattice-js`, upstream `worker` / `next`) with claim, share, and per-site
secrets. See [`rfs.txt`](rfs.txt) and [`docs/STRATEGY.md`](docs/STRATEGY.md).

| Path | Role |
| --- | --- |
| [`marketing/`](marketing/) | Apex landing + SEO pages (Cloudflare Pages) |
| [`apps/api/`](apps/api/) | Worker: deploy, serve, secrets, lattice-js APIs, upstream proxy |
| [`apps/extension/`](apps/extension/) | Chrome: aft icon / Deploy to aft.page on ChatGPT / Claude |
| [`apps/mcp/`](apps/mcp/) | MCP: any agent can `deploy_html` / `deploy_files` |
| [`examples/`](examples/) | `lattice-js`, share-checklist, OpenNext notes |

OSS CLI (customer AWS / Cloudflare): [vaibhavmule/aft](https://github.com/vaibhavmule/aft).  
Hosted repo: [vaibhavmule/aft.page](https://github.com/vaibhavmule/aft.page).

## Try it

```bash
curl -X POST https://api.aft.page/v1/deploy \
  -H 'Content-Type: text/html' \
  -H 'X-Aft-Client: curl' \
  --data '<h1>Hello from aft.page</h1>'
# → { "url": "https://{slug}.aft.page", ... }
```

Live: [hello.aft.page](https://hello.aft.page) · [lattice.aft.page](https://lattice.aft.page) (full-stack dogfood) · [share-checklist.aft.page](https://share-checklist.aft.page)

Human landings: [paste](https://aft.page/paste-html/) · [host](https://aft.page/host-html/) · [share](https://aft.page/share-html/) · [upload](https://aft.page/upload-html/)

### Secrets (owner / editor)

```bash
# List names only
curl https://api.aft.page/v1/sites/{slug}/secrets -H "Cookie: …"

# Set env value (e.g. Lattice Anthropic key)
curl -X PUT https://api.aft.page/v1/sites/{slug}/secrets/ANTHROPIC_API_KEY \
  -H "Content-Type: application/json" -H "Cookie: …" \
  -d '{"value":"sk-…"}'
```

`aft.json` may declare `"runtime": "lattice-js" | "worker" | "next" | "static"` and
`capabilities.secrets` / `egress`. See [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md).

## Develop the API

```bash
cd apps/api
npm install --legacy-peer-deps
npx wrangler deploy
```

See [`apps/api/README.md`](apps/api/README.md), [`docs/METRICS.md`](docs/METRICS.md), and [`todo.txt`](todo.txt).
