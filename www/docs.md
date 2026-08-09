# aft.page docs

> What we host, how to deploy it, how to save environment secrets.
> HTML twin: https://aft.page/docs · Agents: also see https://aft.page/mcp.md

aft.page is a **file host + permission layer** for small software. It does not
run `npm run build`. You (or your agent) detect the project, build locally if
needed, then upload ready files.

## What we support

| Kind | What to ship | Live |
| --- | --- | --- |
| Plain HTML | One file via Drop / MCP `deploy` | [hello.aft.page](https://hello.aft.page) |
| Multi-file static | HTML + CSS + JS | [share-checklist.aft.page](https://share-checklist.aft.page) |
| Vite / React / Vue | `npm run build` → **`dist/` only** | [vite-hello.aft.page](https://vite-hello.aft.page) |
| CRA / Rsbuild | `npm run build` → `build/` or `dist/` | — |
| Next.js static export | `output: 'export'` → **`out/`** | — |
| lattice-js | `aft.json` `runtime: lattice-js` + UI files | [lattice.aft.page](https://lattice.aft.page) |
| Next SSR / Worker | OpenNext (or any Worker) + `runtime: next` / `worker` + `upstream` | [next-hello.aft.page](https://next-hello.aft.page) |

**Not this product:** uploading `src/`, `node_modules`, or `.next/`; in-Worker
Next SSR; a website builder; CI that builds for you.

Detect rule (same as the Cursor skill): look at `package.json`, `vite.config.*`,
`next.config.*`, `index.html`. Plain HTML → upload those files. Bundler app →
build, then upload the output folder only.

## Deploy

Three ways. Same result: `https://{slug}.aft.page`.

### 1. Drop (humans)

[aft.page/drop](https://aft.page/drop/) — folder or zip. Include `index.html`.

README-only (no `index.html`): `/` is 404; the file is at `/README.md`. Same
shape as a Vercel Drop of just a readme —
[readme-black-chi.vercel.app](https://readme-black-chi.vercel.app/) is that,
not a web app.

### 2. Agent MCP

Remote: `https://mcp.aft.page/mcp`

```json
{ "mcpServers": { "aft-page": { "url": "https://mcp.aft.page/mcp" } } }
```

Ask: **Deploy this to aft.page**. Full tool schemas: [mcp.md](https://aft.page/mcp.md).

### 3. API

```bash
curl -X POST https://api.aft.page/v1/deploy \
  -H 'Content-Type: text/html' \
  -H 'X-Aft-Client: curl' \
  --data '<h1>Hello from aft.page</h1>'
```

Multi-file: JSON `{ "files": [{ "path", "content" }] }` or multipart. Optional
`?slug=vite-hello`. Collision gets a suffix — never overwrites.

## Logs

Owner and editors: project page → **Logs**, or `GET /v1/sites/{slug}/logs`.
Document hits, errors, and failed deploys. No IP addresses. Kept 7 days.

## Source

Owner, editors, and viewers: project page → **Source**, or
`GET /v1/sites/{slug}/files`. File list for a deploy; click a text file to
preview. Not a public URL — live `*.aft.page/{path}` is unchanged.

## Secrets / environment

MCP does **not** set secrets. Claim the site first, then save env on the project
page or API. Values are encrypted at rest; only names are listed.

1. Open `https://aft.page/claim?slug=…&token=…` (deploy `claimUrl`) or Claim on the live URL.
2. Sign in → the site appears under [Projects](https://aft.page/projects).
3. **Secrets** panel: name + value → Save. Or:

```bash
# names only
curl https://api.aft.page/v1/sites/{slug}/secrets -H "Cookie: …"

curl -X PUT https://api.aft.page/v1/sites/{slug}/secrets/ANTHROPIC_API_KEY \
  -H "Content-Type: application/json" -H "Cookie: …" \
  -d '{"value":"sk-…"}'
```

Declare intended names in `aft.json` so approve-on-deploy can show them:

```json
{
  "name": "my-app",
  "runtime": "lattice-js",
  "capabilities": {
    "secrets": ["ANTHROPIC_API_KEY"],
    "egress": ["api.anthropic.com"]
  }
}
```

Secrets are **injected into hosted runtimes** (e.g. lattice-js `/api/*`). They
are not baked into static HTML. A Vite SPA that needs a public API key should
use a public env prefix at **build** time; keep private keys in the vault for
server runtimes.

## Custom domain

Invite-only during beta. Claim the site → project **Domains** → request access.
Once approved, add `app.example.com`, then at your DNS host:

```
CNAME  app.example.com  →  cname.aft.page
```

HTTPS issues after DNS is live (progress on the same tab). Apex
(`example.com`) needs ALIAS / ANAME / CNAME flattening to the same target.
The `*.aft.page` URL stays. Private sign-in still uses that subdomain.

```bash
curl https://api.aft.page/v1/sites/{slug}/domains -H "Cookie: …"
curl -X POST https://api.aft.page/v1/sites/{slug}/domains \
  -H "Content-Type: application/json" -H "Cookie: …" \
  -d '{"hostname":"app.example.com"}'
```

## Claim, private, invite

Anonymous deploy is live immediately. Claim to own the slug, make it private,
invite by email, redeploy in place, roll back, or destroy. Same URL stays.

## Limits

| | Static | lattice-js / worker / next |
| --- | --- | --- |
| Files | 200 | 200 |
| Per file | 10 MB | 10 MB |
| Total | 50 MB | 50 MB |

Always include `index.html` for static sites.

## Examples

- [hello.aft.page](https://hello.aft.page) — plain HTML
- [vite-hello.aft.page](https://vite-hello.aft.page) — React + Vite `dist/`
- [lattice.aft.page](https://lattice.aft.page) — lattice-js + secrets
- [next-hello.aft.page](https://next-hello.aft.page) — Next via upstream
- [share-checklist.aft.page](https://share-checklist.aft.page) — static multi-file

Source lives in the [aft.page repo `examples/`](https://github.com/vaibhavmule/aft.page/tree/main/examples).

## More

- MCP / API reference: https://aft.page/mcp · https://aft.page/mcp.md
- Drop: https://aft.page/drop/
- Cursor: https://aft.page/with/cursor/
- OSS CLI (your AWS / Cloudflare): https://github.com/vaibhavmule/aft
