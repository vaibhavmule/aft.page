# @aft.page/cli

Hosted [aft.page](https://aft.page) CLI — deploy static sites, browser login, Agent Plugin install.

This is **not** the parked OSS AWS CLI (`github.com/vaibhavmule/aft`).

## Install (public)

```bash
curl -fsSL https://aft.page/install | sh
aft login
aft deploy
```

Requires Node.js ≥ 20. Puts `aft` in `~/.local/bin` (add to `PATH` if needed).

npm (`npx @aft.page/cli`) comes later when the `@aft.page` scope is set up.

## Run (dev)

```bash
node apps/cli/bin/aft.js login
node apps/cli/bin/aft.js deploy .
node apps/cli/bin/aft.js plugins add
```

Before Pages **production** deploy: `bash apps/cli/sync-www.sh` then  
`npx wrangler pages deploy www --project-name=aft-page --branch=production`

## Commands

| Command | Behavior |
| --- | --- |
| `aft login` | Opens browser → Google or magic link → stores session in `~/.config/aft.page/credentials.json` |
| `aft logout` | Clears credentials |
| `aft whoami` | `GET /v1/me` |
| `aft deploy [dir]` | Upload files; uses `aft.json` slug and `.aft/state.json` editToken; Bearer if logged in |
| `aft plugins add` | `npx plugins add vaibhavmule/aft.page` |

## Env

- `AFT_API` — default `https://api.aft.page`
- `AFT_TOKEN` — session token override
- `AFT_CREDENTIALS` — credentials file path

## Check

```bash
node apps/cli/check.mjs
# also runs at end of apps/api `npm test` (with plugin check)
```
