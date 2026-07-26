# aft.page

Hosted deploy + share for small software. Paste or upload → live `*.aft.page` URL.

| Path | Role |
| --- | --- |
| [`marketing/`](marketing/) | Apex landing (Cloudflare Pages) |
| [`apps/api/`](apps/api/) | Worker: `POST /v1/deploy` + `*.aft.page` static serve |

OSS CLI that deploys into *your* AWS/Cloudflare: [vaibhavmule/aft](https://github.com/vaibhavmule/aft).

## Try it

```bash
curl -X POST https://api.aft.page/v1/deploy \
  -H 'Content-Type: text/html' \
  --data '<h1>Hello from aft.page</h1>'
# → { "url": "https://{slug}.aft.page", ... }
```

Live example: [https://hello.aft.page](https://hello.aft.page)

## Develop the API

```bash
cd apps/api
npm install --legacy-peer-deps
npx wrangler deploy
```

See [`apps/api/README.md`](apps/api/README.md) and [`todo.txt`](todo.txt).
