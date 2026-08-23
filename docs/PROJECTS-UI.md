# Projects UI

Internal specification for the Projects dashboard UI (Phase 1, shipped).

## Overview

Card-grid inventory dashboard for managing deployed aft.page projects. Replaces the original table-based interface with a visual card layout, tabbed sections for owned vs. shared projects, client-side search, inline share controls, and a streamlined project detail page.

## Projects Hub (www/projects/index.html)

### Layout

- **Header**: "Projects" + tagline "Deploy small software — use, share, claim."
- **Toolbar**: Search input (filters by slug or URL, client-side) + "Deploy" CTA linking to `/projects/new/`
- **Tabs**: "Owned by you" / "Shared with you" (role-based tablist)
- **Grid**: `.projects-grid` — responsive card layout (auto-fill, min 17rem cards)
- **Pagination**: Preserved from original table implementation

### Project Cards

Each card (`.project-card`) displays:

- **Thumbnail**: Letter fallback + lazy iframe preview (via `renderThumb`)
- **Title**: Project slug
- **Metadata**: Relative time (last served/updated), visibility icon + label
- **Live URL**: Subdomain or custom domain
- **Actions**: "Share" button + ⋯ menu (Visit, Settings, Analytics, Deactivate/Reactivate, Delete project…)

Inactive projects render with reduced opacity (`.is-inactive`).

### Share Modal

Triggered by "Share" button on each card. Implemented in `www/projects-ui.js` as `openShareModal()`.

- **Owner view**: Dropdown to toggle visibility (Just me / Everyone), Visit + Copy link buttons, "Manage invites" link to `/project/?slug=...&tab=access`
- **Shared view**: Read-only visibility display, Visit + Copy link buttons
- Modal fetches latest site info via `GET /v1/sites/:slug`, allows PATCH to update visibility
- Escape key or backdrop click closes modal

### Shared Module (www/projects-ui.js)

Exports `window.AftProjectsUI`:

- `formatRelativeTime(iso)` — "just now", "5m", "2h", "3d", "1w", "2mo", "1y"
- `visibilityMeta(site)` — returns `{ label, icon, private }` for display
- `iconSvg(name)` — SVG markup for lock, globe, users icons
- `renderThumb(url, slug)` — DOM node with letter fallback + lazy iframe preview
- `openShareModal(opts)` / `closeShareModal()` — modal lifecycle

## Project Detail Page (www/project/index.html)

### Primary Navigation

Four top tabs (`.hub-top-tabs`), replacing the previous sidebar:

1. **Settings**: Overview/links, Domains, Secrets, Danger zone
2. **Analytics**: Observability (edge requests, 4xx/5xx, transfer charts)
3. **Access**: Visibility toggle, invite form, member list
4. **More**: Deploys, Source browser, Logs, Capabilities

### Panel Grouping

JavaScript maps primary tabs to their constituent panels via `TAB_PANEL_MAP`:

```javascript
{
  settings: ["overview", "domains", "secrets", "danger"],
  analytics: ["observability"],
  access: ["access"],
  more: ["deploys", "source", "logs", "capabilities"],
}
```

Legacy hash routing (`#overview`, `#deploys`, etc.) redirects to the appropriate primary tab via `LEGACY_HASH_MAP`.

### Routing

- URL pattern: `/project/?slug=<slug>&tab=<primary-tab>`
- Hash-based for backwards compatibility: `#settings`, `#analytics`, `#access`, `#more`
- Settings is the default tab (no hash)
- Panels within a tab are always visible together (no sub-navigation)

### Permission Hiding

- **Settings tab**: Danger zone hidden for non-owners
- **Analytics tab**: Hidden if user lacks edit role
- **Access tab**: Invite form hidden for non-owners; always shows owner + members
- **More tab**: Logs/observability hidden if user lacks edit role

## API Integration

- **Base**: `https://api.aft.page`
- **List projects**: `GET /v1/me/sites?page=1&limit=20` (returns owned + shared)
- **Get project**: `GET /v1/sites/:slug`
- **Update visibility**: `PATCH /v1/sites/:slug` with `{ visibility: "public" | "private" }`
- **Deactivate/reactivate**: `PATCH /v1/sites/:slug` with `{ active: true | false }`
- **Delete project**: `DELETE /v1/sites/:slug`

Credentials are included on all requests (`credentials: "include"`).

## Styling (www/app.css)

New classes appended:

- `.projects-hub-head`, `.projects-hub-sub` — header + tagline
- `.projects-toolbar`, `.projects-search` — toolbar layout + search input
- `.projects-tabs` — owned/shared tab bar
- `.projects-grid` — responsive card grid
- `.project-card`, `.project-card-thumb`, `.project-card-body`, `.project-card-actions` — card structure
- `.share-modal-backdrop`, `.share-modal`, `.share-modal-*` — modal overlay + controls
- `.hub-top-tabs` — primary navigation tabs for project detail page
- `.hub-panel-active` / `.hub-panel-hidden` — panel visibility classes

All use existing CSS tokens (--ink, --quiet, --line, --panel, etc.) for consistency.

## Search Behavior

Client-side filter implemented in `filterSites()`:

- Matches project slug (case-insensitive substring)
- Matches live URL (case-insensitive substring)
- No backend query — instant filtering of current page results
- Search resets when input is cleared

## Empty States

- **No projects yet**: Shows "Deploy an app" primary CTA
- **Logged out**: "Sign in to see your projects" + "Log in" button + claim reminder
- **No search matches**: "No matches" message in owned grid

## Pagination

Preserved from original implementation:

- Page size: 20 projects
- Session-cached results (`aft.projects.sites.v2` sessionStorage key)
- Prefetches next/prev pages when navigating
- Shows pager only when total > limit
- "Previous" / "Next" buttons with status text ("1–20 of 45")

## Phase 1 Scope

This implementation is **Phase 1** and includes:

- Card grid dashboard for owned/shared projects
- Tabbed inventory (owned vs. shared)
- Client-side search by slug/URL
- Share modal with visibility toggle
- Project detail page with Settings/Analytics/Access/More tabs
- ⋯ menu with Visit, Settings, Analytics, Deactivate, Delete actions
- Preserved pagination, caching, authentication flow

## Out of Scope

Not included in Phase 1:

- Bulk operations (multi-select, batch delete)
- Sorting controls (by date, name, views)
- Advanced filters (by visibility, active status, custom domains)
- Project templates or quick-deploy shortcuts
- Analytics embeds or inline charts
- Team/org-level project management
- Project transfer or ownership change UI
