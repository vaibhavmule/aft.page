---
name: deploy-to-aft
description: Detect whether the project is plain HTML or a JS app (Vite/React/Next), build if needed, and publish the static output to a live *.aft.page URL. Use when the user asks to deploy, publish, host, ship, share, or rollback a page, app, dashboard, or artifact.
---

# Deploy to aft.page

Publish small software to a live HTTPS `*.aft.page` URL. No account required.
The deliverable is the live URL.

aft.page is a file host — it does not run `npm run build`. You detect the
project, build locally if needed, then upload ready files via MCP `deploy`.

MCP cannot see the disk. You read `aft.json` / `.aft/state.json`, then call
`deploy`.

## When to use

Trigger when the user says deploy / publish / host / ship / share / rollback
a page or app.

## Same URL after the first hit

1. Read **`aft.json`** (intent) and **`.aft/state.json`** (locked slug + token).
2. **First deploy** — no `.aft/state.json`: pass `preferred_slug` = `aft.json.slug`
   **exactly** (never invent `discovra-site` or omit it). Also include `aft.json`
   in `files` (from project root, even when uploading `out/` / `dist/`). POST may
   suffix if taken. That returned slug is now the site. Write:

   ```json
   { "slug": "<returned slug>", "editToken": "<returned editToken>" }
   ```

   to `.aft/state.json`. Add `.aft/` to `.gitignore`. Never commit the token.
3. **Later deploys** — pass `preferred_slug` + `edit_token` from `.aft/state.json`.
   MCP PATCHes. Same URL. Each ship is a rollback-able row.
4. **Do not** call deploy without `edit_token` once state exists. That mints a
   new URL.
5. **Claim** attaches an owner. It does **not** change the slug. editToken
   still works after claim.

## Detect → build → `deploy`

If **`aft.json`** exists at the project root (Vercel’s `vercel.json` equivalent),
obey it:

| Field | Meaning |
| --- | --- |
| `slug` | First-hit `preferred_slug`. After `.aft/state.json` exists, use **that** slug. |
| `build` | Run this locally (AFT does not build). |
| `output` | Upload **that folder’s contents** as `files` (plus root `aft.json`). |
| `runtime` | `static` for this MCP path. Ignore `worker` / `next` + `upstream` here. |

If there is no `aft.json`, look at `package.json`, `vite.config.*`,
`next.config.*`, `index.html`. Pick one path:

1. **Plain HTML** — `index.html` and no bundler
   - One file → `deploy` with `html`
   - Several files → `deploy` with `files`
   - Do not invent a build

2. **Vite / React / Vue** — `npm run build` → `deploy` `files` from **`dist/`**

3. **CRA / Rsbuild** — `npm run build` → `files` from `build/` or `dist/`

4. **Next.js static export** — `npm run build` → `files` from **`out/`**

5. **Next.js SSR** — do not upload `.next/` or source. This path is static-only.

Never upload `node_modules`, `src/`, `.next/`, or `package.json` as the site.
Always include `index.html`. Limits: 200 files, 10MB each, 50MB total. Binaries →
`encoding: "base64"`.

## Rollback

1. `aft_deploys` with slug + edit_token from `.aft/state.json`
2. `aft_rollback` with a prior `deploy_id`

## After deploying

- Return **two URLs**: Live (`*.aft.page`) and **Claim** (`claimUrl`).
- Confirm `.aft/state.json` is written. Keep `editToken` secret.
- MCP cannot open a browser. The human clicks Claim to attach email/Google.
- Do NOT tell the user to open Vercel, GitHub, or create an account first.
