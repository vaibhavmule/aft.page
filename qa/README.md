# aft.page QA

Founder-facing umbrella. **Security ship gate is Hijack CIL**, not this folder and not Bug0/Passmark.

## Layers

| Layer | Command | Owns |
| --- | --- | --- |
| 1. API Vitest | `cd apps/api && npm test` | Auth, claim, sharing, secrets, waitlist |
| 2. Hijack CIL | `cd apps/api && npm run audit` → [ops `#audit`](https://ops.aft.page/#audit) | editToken death, origin bind, IDOR, magic single-use, open redirect, private body, CORS, CLI, ops gate, invite ACL |
| 3. Scanner ritual | `cd apps/api && npm run audit:security` | Public `.git` / `.env` / `.php` must not 200 — see [`docs/SECURITY-AUDIT.md`](../docs/SECURITY-AUDIT.md) |
| 4. Mail auth | `node qa/email-auth/check.mjs` | SPF / DKIM / DMARC / MX |
| 5. Page smoke | `node qa/pages/check.mjs` | Every public URL loads (fetch or CF Browser Rendering) |
| 6. Browser-sec | `node qa/browser-sec/check.mjs` | Junk-path 404, private no-leak, ops login gate (HTTP checks of browser-visible gates) |

Passmark / Bug0 hire: **deferred**. Never the security gate.

## Run all qa/ suites

```sh
cd aft.page
node qa/check.mjs
```

Optional CF Chrome render for pages (Browser Rendering — Edit token):

```sh
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=44255ec64e0080b678670b53bf810d27   # optional; default set
node qa/pages/check.mjs
# or force plain HTTP:
AFT_QA_MODE=fetch node qa/pages/check.mjs
```

Security still means:

```sh
cd apps/api && npm run audit
```

## Cadence

- **API PR / deploy:** Vitest + `npm run audit` (when `SMOKE_SECRET` available)
- **Daily:** `audit:security` + Ops Probes
- **Weekly / pre-launch:** `node qa/check.mjs`
