# OpenNext orchestration on aft.page

AFT does **not** ship a custom OpenNext adapter. Cloudflare’s `wrangler deploy` +
`@opennextjs/cloudflare` perform the transform.

**Live SPOC:** [https://next-hello.aft.page](https://next-hello.aft.page) — source
[`examples/next-hello/`](../examples/next-hello/). SSR timestamp + `/api/hello`.

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
./scripts/opennext-orchestrate.sh examples/next-hello aft-next-hello

# Zero-account preview:
AFT_TEMPORARY=1 ./scripts/opennext-orchestrate.sh examples/next-hello aft-next-hello
```

Then deploy a mapping site to aft (`POST /v1/deploy?slug=next-hello`) with
[`examples/next-hello/aft.json`](../examples/next-hello/aft.json) + placeholder
`index.html` (requests are proxied when `upstream` is set):

```json
{
  "runtime": "next",
  "upstream": "https://aft-next-hello.<account>.workers.dev"
}
```

`wrangler.jsonc` must include `global_fetch_strictly_public` (OpenNext route
handlers fetch same-zone; without it CF returns 1042).

## Known limitation

Node.js middleware is unsupported on the Cloudflare OpenNext path — document to users; do not polyfill in AFT.
