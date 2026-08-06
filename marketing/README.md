# aft.page marketing site

Static site for [aft.page](https://aft.page). Prefer Cloudflare Pages (`--provider cloudflare`); AWS CloudFront remains available via `--provider aws`.

## Site map (what users see)

```
Marketing homepage
  /  hero → pillars → lifecycle → ways (paste) → trust → waitlist

Docs              App
────              ───
/mcp              /login
/mcp.md           /projects
/llms.txt         /projects/new
                  /project
SEO landings      /preview
/paste-html/ …
(linked from Related, not primary nav)

Legal: /privacy/  /terms/
```

**Primary nav (all marketing/content pages):** Product · MCP · Log in · Get started

**Footer (same pages):** Product · MCP · Projects · Contact · Get started + Privacy/Terms

**App header:** Projects · MCP · account

## Pages

| Path | Role | Styles |
| --- | --- | --- |
| `/` | Landing | `styles.css` |
| `/login` | Magic-link login → projects | inline (brand tokens) |
| `/projects`, `/projects/new/`, `/project/` | App (session) | `app.css` |
| `/preview` | Preview / claim shell | `app.css` |
| `/mcp`, `/mcp.md`, `/llms.txt` | Agent / MCP docs | `styles.css` |
| `/paste-html/`, `/host-html/`, `/share-html/`, `/upload-html/` | SEO landings | `styles.css` |
| `/privacy/`, `/terms/` | Legal | `styles.css` |
| `/sitemap.xml`, `/robots.txt` | Discovery | — |

`/inventory` redirects to `/projects`.

## Typography

Per `docs/BRAND.md`:

- **Fraunces** — wordmark only
- **DM Sans** — UI and headlines
- **JetBrains Mono** — code / URLs / flow

## Early-access signup

The home page posts JSON to `https://api.aft.page/v1/waitlist`. The API
normalizes and validates the address, stores it once in D1, and returns the same
success response for new and duplicate submissions.

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
