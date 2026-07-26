# aft.page

Hosted deploy + share for small software. Paste or upload → live `*.aft.page` URL.

Marketing site: [`marketing/`](marketing/). API Worker: [`apps/api/`](apps/api/).

OSS CLI that deploys into *your* AWS/Cloudflare: [vaibhavmule/aft](https://github.com/vaibhavmule/aft).

## Quick start (API)

```bash
cd apps/api
npm install
npx wrangler login
npx wrangler deploy
```

See `todo.txt` for the wedge checklist.
