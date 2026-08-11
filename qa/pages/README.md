# Page smoke

Render-check public marketing + app shells. **Not** an ACL/security suite.

```sh
# Default: fetch (no token). Passes offline CI / founder laptop.
node qa/pages/check.mjs

# Cloudflare Browser Rendering (/content) — needs Browser Rendering Edit
export CLOUDFLARE_API_TOKEN=…
node qa/pages/check.mjs

# Force fetch even when token is set
AFT_QA_MODE=fetch node qa/pages/check.mjs

# Subset
node qa/pages/check.mjs /drop/ /mcp
```

Manifest: [`manifest.mjs`](./manifest.mjs). Add paths there when shipping a new public page.
