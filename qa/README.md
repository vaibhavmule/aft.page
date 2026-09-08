# aft.page QA

Founder-facing umbrella. **Security ship gate is Vitest + scanner ritual**, not Bug0/Passmark.

## Layers

| Layer | Command | Owns |
| --- | --- | --- |
| 1. API Vitest | `cd apps/api && npm test` | Auth, claim, sharing, secrets, waitlist, deploy |
| 2. Scanner ritual | `cd apps/api && npm run audit:security` | Public `.git` / `.env` / `.php` must not 200 — see [`docs/SECURITY-AUDIT.md`](../docs/SECURITY-AUDIT.md) |
| 3. Mail auth | `node qa/email-auth/check.mjs` | SPF / DKIM / DMARC / MX |
| 4. Page smoke | `node qa/pages/check.mjs` | Every public URL loads (fetch or CF Browser Rendering) |
| 5. Browser-sec | `node qa/browser-sec/check.mjs` | Junk-path 404, private no-leak (HTTP checks) |
| Live CLI T2U (opt-in) | `node qa/time-to-url/check.mjs` | Build/deploy HTML, Vite, and Next fixtures; measure URL readiness |
| Arbitrary runtime (opt-in) | [`qa/arbitrary-runtime.md`](./arbitrary-runtime.md) | Detect + live honesty corpus |

**Retired 8 Sep 2026:** Hijack CIL (`npm run audit`), prod smoke suite, compat-probe GH Action, ops HTML scoreboard. See [`docs/parked/smoke-audit-ops.md`](../docs/parked/smoke-audit-ops.md).

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

## Cadence

- **API PR / deploy:** Vitest
- **Daily:** `audit:security` + status.aft.page
- **Weekly / pre-launch:** `node qa/check.mjs`
