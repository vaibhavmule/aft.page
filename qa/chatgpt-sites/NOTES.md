# ChatGPT Sites export on AFT

Probe: 19 Aug 2026. Fixture: workspace `tmp/three-things` (outside this git
repo; Sites zip: vinext starter + D1 tasks API). **Do not build D1 / OpenNext /
container support from this note.** It is a founder probe, not a stranger
deploy failure.

## What we ran

```sh
node --input-type=module -e 'import { ensureDeployable } from "./apps/cli/src/deploy.js";
await ensureDeployable("/Users/vaibhavmule/Projects/aft/tmp/three-things", ".")'
```

CLI refused before upload:

```
This looks like Next.js SSR or a Worker app — aft.page CLI uploads static files only.
  fix: For Next: set output: 'export' in next.config, build, upload out/. Otherwise set runtime + upstream in aft.json.
```

Detect: `framework=next-ssr`, `runtime=next`, `staticDeployable=false`.
Detection looks at `next` in package.json first; `vite` + `vinext` never matter.

## Exact incompatibilities

| What the export has | What AFT does today |
| --- | --- |
| vinext Worker (`worker/index.ts`, `ASSETS`, `IMAGES`) | Static upload, or `runtime: worker\|next` **plus** a URL you already host |
| `.openai/hosting.json` `{ "d1": "DB" }` | Ignored. No per-site D1 |
| `import("cloudflare:workers").env.DB` in `/api/tasks` | No app D1 binding |
| `next.config.ts` without `output: 'export'` | Classified `next-ssr`, CLI `not_static` |
| Linux `install:ci` (`flock`, GNU `timeout`) | Hosted CLI does not run Sites install/build |
| `oai-authenticated-user-*`, `/signin-with-chatgpt` | Sign in with AFT: `/_aft/me`, `aft-authenticated-user-*`, `/signin-with-aft` |
| Auth helpers in `app/chatgpt-auth.ts` unused by the app | Same pattern we should not copy: identity must be in the app |

No HTTP 200 on `*.aft.page` for this zip. Closest AFT runtime is `worker` with
a customer-supplied upstream — still missing D1.

Gate to implement any of that: a **stranger** fails this class of deploy on a
real app, after two people already use one AFT app weekly.
