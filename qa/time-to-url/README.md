# CLI time-to-URL benchmark

This opt-in live test creates real `test--*.aft.page` deployments through
the hosted CLI and waits until each URL serves successfully:

1. plain HTML;
2. React + Vite;
3. Vue + Vite;
4. Svelte + Vite;
5. Astro static output;
6. Next.js static export;
7. a Next.js runtime manifest proxying to an OpenNext Cloudflare Worker.

```sh
cd aft.page
node qa/time-to-url/check.mjs
```

The report separates Vite build time, **CLI → URL** (until the CLI prints the
URL), and **CLI → ready** (until the public URL returns the expected page).

Useful options:

```sh
node qa/time-to-url/check.mjs --case html
node qa/time-to-url/check.mjs --case vue,svelte,astro,next-static --json
node qa/time-to-url/check.mjs --timeout-ms 120000
AFT_T2U_NEXT_UPSTREAM=https://example.workers.dev node qa/time-to-url/check.mjs --case next
```

The Next case measures aft.page registration and public readiness. It does not
include the OpenNext build or Wrangler deployment: the hosted CLI currently
accepts an already-deployed upstream. To create a fresh upstream first, run
`scripts/opennext-orchestrate.sh`, then pass its URL through
`AFT_T2U_NEXT_UPSTREAM`.

This suite is intentionally not part of `qa/check.mjs`, because it mutates the
live service. Test-prefixed slugs stay out of product metrics.
