# aft.page marketing site

Static landing for [aft.page](https://aft.page). Prefer Cloudflare Pages (`--provider cloudflare`); AWS CloudFront remains available via `--provider aws`.

## Typography

- **Fraunces** (`500`, `600`) — display face for the `aft.page` wordmark and headings. Its warm, editorial character makes the brand feel personal rather than like a generic AI/SaaS landing page.
- **Sora** (`400`, `500`, `600`) — body, labels, and buttons. Its geometric forms keep the supporting copy crisp and technical without competing with Fraunces.

Both are loaded from Google Fonts in `index.html`. The CSS fallbacks are `"Times New Roman", serif` for Fraunces and `"Segoe UI", sans-serif` for Sora.

## Redeploy (Cloudflare)

```bash
# once: npx wrangler login
export CLOUDFLARE_ACCOUNT_ID=…   # from `npx wrangler whoami`

# from sibling aft repo after npm run build:
cd marketing
node ../../aft/dist/bin.js deploy --provider cloudflare --domain aft.page
```

`aft.json` sets `"provider": "cloudflare"`, so `--provider` can be omitted after that.

## Redeploy (AWS)

```bash
node ../../aft/dist/bin.js deploy --provider aws --profile aft
```

## Custom domain

`aft.page` is on Cloudflare Registrar. Attaching it to the Pages project is done with `--domain aft.page` (API creates the Pages custom hostname; DNS for the zone should already be on Cloudflare).
