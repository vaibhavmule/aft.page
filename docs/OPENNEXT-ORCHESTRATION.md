# OpenNext orchestration on aft.page

AFT does **not** ship a custom OpenNext adapter. Cloudflare’s `wrangler deploy` +
`@opennextjs/cloudflare` perform the transform.

## Flow

```text
Next.js folder
  → scripts/opennext-orchestrate.sh
  → opennextjs-cloudflare build
  → wrangler deploy (account or --temporary)
  → register upstream on aft.page (runtime: next)
  → claim / share / update via control plane
```

```bash
chmod +x scripts/opennext-orchestrate.sh
./scripts/opennext-orchestrate.sh /path/to/next-app aft-next-demo

# Zero-account preview:
AFT_TEMPORARY=1 ./scripts/opennext-orchestrate.sh /path/to/next-app aft-next-demo
```

Then deploy a mapping site to aft:

```json
{
  "runtime": "next",
  "upstream": "https://aft-next-demo.<account>.workers.dev"
}
```

plus a placeholder `index.html` (requests are proxied when `upstream` is set).

## Known limitation

Node.js middleware is unsupported on the Cloudflare OpenNext path — document to users; do not polyfill in AFT.
