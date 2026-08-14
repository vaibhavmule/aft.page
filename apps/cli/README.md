# @aft.page/cli

Hosted [aft.page](https://aft.page) CLI.

**No login:** `aft deploy` (and `aft init`). `aft deploy --check` prints preflight JSON and does not upload.  
**Login required:** everything else — same as the project dashboard after claim.

## Install

```bash
curl -fsSL https://aft.page/install | sh
```

Node.js ≥ 20. Binary → `~/.local/bin/aft`.

## Commands

| Command | Login? | Behavior |
| --- | --- | --- |
| `aft deploy [dir]` | no | Detect framework; offer/run build if needed; upload `dist/` / `out/` / `build/` |
| `aft deploy --check` | no | Preflight JSON (local rules + API inference). Exit 2 if blocked |
| `aft init` | no | Detect + confirm framework; write `aft.json` |
| `aft update` | no | Reinstall latest CLI; first run asks about anonymous analytics |
| `aft login` | — | Browser sign-in → `~/.config/aft.page/credentials.json` |
| `aft logout` / `aft whoami` | yes | Session |
| `aft sites` | yes | List claimed projects |
| `aft open` | yes | Open live URL |
| `aft rename <slug>` | yes | Change the site URL |
| `aft env list\|set\|unset` | yes | Secrets vault |
| `aft visibility public\|private` | yes | Access |
| `aft rollback [deployId]` | yes | List / roll back deploys |
| `aft plugins add` | — | Agent Plugin installer |

## Check

```bash
node apps/cli/check.mjs
```

Before Pages production: `bash apps/cli/sync-www.sh`
