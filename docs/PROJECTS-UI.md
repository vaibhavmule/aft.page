# Projects UI (ChatGPT Sites parity)

Internal spec for the dashboard inventory + per-project chrome. Updated: 2026-08-23.

Benchmark: [CHATGPT-SITES.md](./CHATGPT-SITES.md). URL stays `/projects`; UI label is **Projects**.

## Phase 1 (shipped)

### Projects hub — `/projects/`

| Feature | Status |
| --- | --- |
| Card grid with **R2 screenshot** thumb (lazy `<img>`) + letter fallback | Shipped |
| Owned by you / Shared with you tabs | Shipped |
| Client-side search (slug + URL) | Shipped |
| Share modal (visibility, Visit, Copy link) | Shipped via [`www/projects-ui.js`](../www/projects-ui.js) |
| ⋯ menu: Visit, Settings, Analytics, Deactivate, Delete | Shipped |
| Pagination (owned) | Shipped |
| Deploy CTA | Shipped (`/projects/new/`) |
| Top progress bar (`www/progress.js`) | Shipped |

### Project detail — `/project/?slug=`

| Tab | Panels |
| --- | --- |
| **Settings** | Overview, Domains, Secrets, Danger |
| **Analytics** | Edge requests + page views (7d default) |
| **Access** | Visibility + invites |
| **More** | Deploys, Source, Logs, Capabilities |

Routing: `?tab=settings|analytics|access|more` (legacy `#hash` still maps).

### Shared module

[`www/projects-ui.js`](../www/projects-ui.js) — `AftProjectsUI`: `formatRelativeTime`, `visibilityMeta`, `renderThumb`, `openShareModal`.

Styles: [`www/app.css`](../www/app.css) — `.projects-grid`, `.project-card`, `.share-modal`, `.hub-top-tabs`.

## Deferred (Phase 2+)

| Feature | Blocker |
| --- | --- |
| Database tab (D1 table browser) | No read API |
| Server-side search across pages | API |
| Private-site thumbs (auth’d capture) | Need session in Browser Rendering |
| Unique visitors metric | Analytics pipeline |


## Appendix — R2 thumbs (no iframes)

Iframes were Phase-1 scaffolding. Cards now use real images:

1. After a successful deploy, `scheduleSiteThumb` (`apps/api/src/thumb.ts`) runs in `waitUntil`.
2. Cloudflare Browser Rendering `/screenshot` captures the live public URL (JPEG).
3. Bytes land in R2: `sites/{slug}/{deployId}/__aft/thumb.jpg`.
4. Served at `https://{slug}.aft.page/__aft/thumb.jpg?d={deployId}`.
5. `GET /v1/me/sites` includes `thumbUrl`; hub uses lazy `<img>` + letter fallback.
6. **Public sites only.** Private stays letter until session capture exists.

Requires `CF_API_TOKEN` (Browser Rendering Edit) + `CF_ACCOUNT_ID`. Soft-fail never blocks deploy.

## Parity matrix vs ChatGPT Sites

| ChatGPT Sites | AFT Projects |
| --- | --- |
| Sites hub + cards | `/projects` |
| Owned / Shared | Tabs |
| Share modal | Shipped |
| Settings · Analytics · Database | Settings · Analytics · Access · More |
| Sign in with ChatGPT | Magic link + Google + invite ACL |
| In-chat edit | Out of scope (agents) |

## Related

- [HOST.md](./HOST.md) · [SHIP.md](./SHIP.md) · [RUN.md](./RUN.md)
