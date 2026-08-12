# @aft.page/cli

Hosted [aft.page](https://aft.page) CLI.

**No login:** `aft deploy` (and `aft init`).  
**Login required:** everything else — same as the project dashboard after claim.

## Install

```bash
curl -fsSL https://aft.page/install | sh
```

Node.js ≥ 20. Binary → `~/.local/bin/aft`.

## Commands

| Command | Login? | Behavior |
| --- | --- | --- |
| `aft deploy [dir]` | no | Detect framework; offer build if needed; upload `dist/` / `out/` / `build/` |
| `aft init` | no | Detect + confirm framework; write `aft.json` |
| `aft update` | no | Reinstall latest CLI; first run asks about anonymous analytics |
| `aft login` | — | Browser sign-in → `~/.config/aft.page/credentials.json` |
| `aft logout` / `aft whoami` | yes | Session |
| `aft sites` | yes | List claimed projects |
| `aft open` | yes | Open live URL |
| `aft rename <slug>` | yes | Change `*.aft.page` URL |
| `aft env list\|set\|unset` | yes | Secrets vault |
| `aft visibility public\|private` | yes | Access |
| `aft rollback [deployId]` | yes | List / roll back deploys |
| `aft plugins add` | — | Agent Plugin installer |

## Check

```bash
node apps/cli/check.mjs
```

Before Pages production: `bash apps/cli/sync-www.sh`
