# aft.page marketing site

Static landing for [aft.page](https://aft.page). Prefer Cloudflare Pages (`--provider cloudflare`); AWS CloudFront remains available via `--provider aws`.

## Pages

| Path | Role |
| --- | --- |
| `/` | Agent-first home |
| `/login` | Magic-link login → inventory |
| `/inventory` | Owned sites (session) |
| `/mcp`, `/mcp.md`, `/llms.txt` | Agent / MCP docs |
| `/paste-html/`, `/host-html/`, `/share-html/`, `/upload-html/` | SEO / human intent landings (same paste form) |
| `/preview` | Preview / claim stub shell |
| `/sitemap.xml`, `/robots.txt` | Discovery |

## Early-access signup

The home page posts JSON to `https://api.aft.page/v1/waitlist`. The API
normalizes and validates the address, stores it once in D1, and returns the same
success response for new and duplicate submissions. A honeypot, request-size
limit, and HMAC-keyed rate-limit identifiers provide basic abuse protection
without logging personal information. The form includes accessible pending,
success, and error announcements.

## Typography

- **Fraunces** (`500`, `600`) — display face for the `aft.page` wordmark and headings. Its warm, editorial character makes the brand feel personal rather than like a generic AI/SaaS landing page.
- **Sora** (`400`, `500`, `600`) — body, labels, and buttons. Its geometric forms keep the supporting copy crisp and technical without competing with Fraunces.

Both are loaded from Google Fonts in `index.html`. The CSS fallbacks are `"Times New Roman", serif` for Fraunces and `"Segoe UI", sans-serif` for Sora.

## Redeploy (Cloudflare)

```bash
# once: npx wrangler login
export CLOUDFLARE_ACCOUNT_ID=…   # from `npx wrangler whoami`

# Custom domain aft.page tracks the **production** branch — deploy there:
cd marketing
npx wrangler pages deploy . --project-name=aft-page --branch=production

# Preview only (main.aft-page.pages.dev), not the apex:
# npx wrangler pages deploy . --project-name=aft-page
```

Or from sibling aft repo after `npm run build`:

```bash
cd marketing
node ../../aft/dist/bin.js deploy --provider cloudflare --domain aft.page
```

`aft.json` sets `"provider": "cloudflare"`, so `--provider` can be omitted after that.

## Redeploy (AWS)

```bash
node ../../aft/dist/bin.js deploy --provider aws --profile aft
```

## AWS CloudFront URL — DO NOT DESTROY

**Keep this distribution alive. Never run `aft destroy` against it.**

- Live: https://d47sjb4tuyzd5.cloudfront.net/

## Custom domain

`aft.page` is on Cloudflare Registrar. Attaching it to the Pages project is done with `--domain aft.page` (API creates the Pages custom hostname; DNS for the zone should already be on Cloudflare).
