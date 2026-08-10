# Competition

Internal. Snapshot: ChatGPT Plus / Codex Developer Tools, 9 Aug 2026.

Job we compete on:

> Agent output → durable, permissioned URL → share like a Google Doc.

Activation (agent → URL) is already a crowded Codex shelf. Everyone is becoming
agent-Supabase+host or Drop-with-a-plugin. **The empty slot is permissioned
sharing** — private by default, invite is the ACL, same URL after claim. Do not
follow AppDeploy / Hatchable / InsForge into a BaaS feature war.

Public `/vs/` pages stay the three we have (Vercel, Cloudflare Drop, GitHub
Pages). No new comparison landings unless search intent shows up. Full tracking
lives here, not on www.

## Already tracked (consoles, not the job)

Codex listings exist. They are account consoles.

| Name | Their job | Threat | What they miss | AFT move |
| --- | --- | --- | --- | --- |
| Vercel | Production framework apps, Git, builds | Low on Small Software | Tiny-audience ceremony | `/vs/vercel/` — different job |
| Netlify | Same class as Vercel | Low | Same | Skip `/vs/` — thin dupe of Vercel |
| Railway / Render | App hosting consoles | Low | Same | Ignore unless they ship no-git agent → URL |
| Cloudflare plugin | Platform MCP / docs, not Drop | Low as listed | Drop is the static commoditizer; plugin is not Drop | Wrap CF primitives; `/vs/cloudflare-drop/` |
| GitHub Pages | Repo → static site | Low | Git + public-by-default | `/vs/github-pages/` |
| DigitalOcean (Codex) | Droplet as Codex workspace | None | Infra for the agent, not a publish URL | Not a competitor |

## Same shelf, Codex-listed 2026-08-09

| Name | Their job | Threat | What they miss | AFT move |
| --- | --- | --- | --- | --- |
| [AppDeploy](https://appdeploy.ai/) | Chat → live URL, no git. Free tier is a full PaaS (auth, DB, cron, PWA, AI QA) | **Highest** — same activation story | Invite ACL, Doc-simple share, thin cross-agent MCP; racing to be the agent cloud | Do not match the dump. Win on private + invite + same URL after claim |
| [MiniUp](https://www.miniup.io/) | HTML/ZIP → `*.miniup.app`, same-link updates, passwords, ChatGPT app, x402 wallet-paid agents | High — closest *publish* language (“share like a product”) | Password ≠ Doc invite. Wedge is data / PDF / Parquet, not permissions | Keep invite as ACL. Do not chase datasets |
| [Hatchable](https://hatchable.com/) | Codex plugin → `{slug}.hatchable.site` + free Postgres / auth / storage / cron | High — same “folder on laptop → URL someone else can open” copy | Bundled BaaS, not a permission layer | Publishing + share, not another Supabase |
| [Floot](https://floot.com/) | AI builds; they host DB / auth. Publish is public | High — same class as Hatchable | Builder+host combo; no private-by-default share | Stay the layer after generation |
| [Buildy](https://buildy.so/) | “Personal apps for agents.” workerd + KV; URL only accessible by you; APIs back to the agent (HTTP + MCP Apps iframe) | Medium-high — closest *category language* | Opposite of Google-Doc share (owner-only URL) | Watch for ideas. Do not copy private-only |
| [InsForge](https://insforge.dev/) | Agent-native BaaS (Postgres, auth, storage, gateway). Site deploy is a Vercel Platform API wrap (`*.insforge.site`) | Medium — OSS Supabase-for-agents | Platform, not Doc | Not a host-to-beat. Ignore unless they own share |
| [ShipStatic](https://shipstatic.com/) | `npx ship ./dist`, no account, 3-day expiry, claim URL, optional password | Medium-low — Drop with a Codex plugin | No identity / invite lifecycle | Confirms static upload → URL is commoditized. Do not differentiate here |
| [Val Town](https://www.val.town/) | Vertical JS “vals” + `npx plugins add val-town/plugins` | Low as a publish rival | Not general Small Software | Plugin-format reference (same installer we want). Not a competitor to beat |

Watch monthly: **AppDeploy, Hatchable, MiniUp**.

## Ignore unless they start ranking

Sticklight, Hercules, Grow My Website, Hostinger Connector, Catalyst by Zoho,
BranchDeploy, FastAPI Cloud (vertical). OpenAI first-party **Build Web Apps** is
an upstream builder — out of this doc’s scope.

The rest of the ~150 Codex Developer Tools listings are noise (validators,
hackathon finders, “build a website by chatting”).

## Not competitors (signals)

| Signal | Read |
| --- | --- |
| [Kitesurf](https://blog.cloudflare.com/kitesurf/) | Agent browser on Workers. Infra, not AFT. Useful only if apps need browser automation. Do not build around it yet. |
| Dynamic Workers | Commoditizes “run generated code.” Edge stays identity, sharing, lifecycle — not the sandbox. |
| [Perch](https://mandarwagh9.github.io/perch/#access) | Same category language after the YC RFS. Watch for ideas; not a market threat. |

## Insight

Software for three users should not require infrastructure designed for three
million. The Codex shelf proves the *URL* half is table stakes. AFT’s
understanding: the hard remaining job is who can open it, who can edit it, and
whether the URL survives claim — not another bundled database.
