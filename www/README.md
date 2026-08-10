# aft.page website

Static site for [aft.page](https://aft.page). Prefer Cloudflare Pages (`--provider cloudflare`); AWS CloudFront remains available via `--provider aws`.

## Site map (what users see)

```
Homepage
  /  hero → bands → compare → ways (Drop teaser) → trust → waitlist
  proof strip → /with/{claude,cursor,codex,chatgpt,http}/ · /drop/

Docs              App
────              ───
/docs · /docs.md  /login · /claim
/changelog · .md  /projects
/mcp · /mcp.md    /projects/new
/plugins          Agent Plugin install
/llms.txt         /project
/with/*/
SEO landings
/drop/ …
(linked from Related, not primary nav)

Legal: /privacy/  /terms/
```

**Primary nav (content pages):** Product · Agents · Docs · Log in · Drop files

**Footer (same pages):** Docs · Changelog · Drop · Projects · MCP · Plugin · Status · Privacy/Terms

**App header:** Projects · MCP · account

## Pages

| Path | Role | Styles |
| --- | --- | --- |
| `/` | Landing | `styles.css` |
| `/login` | Google or magic-link login → projects | inline (brand tokens) |
| `/claim` | Post-deploy email / Google → own the slug | inline (login chrome) |
| `/projects`, `/projects/new/`, `/project/` | App (session) | `app.css` |
| `/preview` | Legacy shell (unlinked; claim is on the live slug) | `app.css` |
| `/docs`, `/docs.md` | Human docs: support, deploy, secrets | `styles.css` |
| `/changelog` | What shipped, by day (D1 via `GET /v1/changelog`) | `styles.css` |
| `/mcp`, `/mcp.md`, `/llms.txt` | Agent / MCP reference | `styles.css` |
| `/plugins` | Agent Plugin install (`npx plugins add vaibhavmule/aft.page`) | `styles.css` |
| `/drop/`, `/host-html/`, `/share-html/`, `/upload-html/` | SEO landings | `styles.css` |
| `/vs/vercel/`, `/vs/cloudflare-drop/`, `/vs/github-pages/` | Comparison landings | `styles.css` |
| `/privacy/`, `/terms/` | Legal | `styles.css` |
| `/sitemap.xml`, `/robots.txt` | Discovery | — |

`/inventory` redirects to `/projects`.

## Typography

Per `docs/BRAND.md`:

- **Geist Variable** — wordmark, UI, headlines
- **Geist Mono Variable** — code / URLs / flow

Visual system: black/white agent-infra craft; white primary CTAs; green for live only.
See `docs/DESIGN-INSPIRATION.txt`.

## Early-access signup

The home page posts JSON to `https://api.aft.page/v1/waitlist`. The API
normalizes and validates the address, stores it once in D1, and returns the same
success response for new and duplicate submissions.

## Redeploy (Cloudflare)

```bash
# once: npx wrangler login
export CLOUDFLARE_ACCOUNT_ID=…   # from `npx wrangler whoami`

# Custom domain aft.page tracks the **production** branch — deploy there:
cd www
npx wrangler pages deploy . --project-name=aft-page --branch=production

# Preview only (main.aft-page.pages.dev), not the apex:
# npx wrangler pages deploy . --project-name=aft-page
```

Or from sibling aft repo after `npm run build`:

```bash
cd www
node ../../aft/dist/bin.js deploy --provider cloudflare --domain aft.page
```

`aft.json` sets `"provider": "cloudflare"`, so `--provider` can be omitted after that.

If the Pages project still has root directory `marketing`, point it at `www`.

## Redeploy (AWS)

```bash
node ../../aft/dist/bin.js deploy --provider aws --profile aft
```

## AWS CloudFront URL — DO NOT DESTROY

**Keep this distribution alive. Never run `aft destroy` against it.**

- Live: https://d47sjb4tuyzd5.cloudfront.net/

## Custom domain

`aft.page` is on Cloudflare Registrar. Attaching it to the Pages project is done with `--domain aft.page` (API creates the Pages custom hostname; DNS for the zone should already be on Cloudflare).
