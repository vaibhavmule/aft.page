# Competition

Internal. Snapshot: ChatGPT Plus / Codex Developer Tools, 9 Aug 2026.

Job we compete on:

> Agent output → durable, permissioned URL → share like a Google Doc.

Activation (agent → URL) is already a crowded Codex shelf. Everyone is becoming
agent-Supabase+host or Drop-with-a-plugin. **The empty slot is permissioned
sharing** — private by default, invite is the ACL, same URL after claim. Do not
follow AppDeploy / Hatchable / InsForge into a BaaS feature war.

Public `/vs/` pages stay the three we have (Vercel, Cloudflare Drop, GitHub
Pages). No new `/vs/` landings unless search intent shows up. `/compare` is the
AEO four-way (aft.page, Cloudflare Pages, Netlify, Vercel) — ranking, not a
Netlify dupe of `/vs/vercel/`. Full tracking lives here, not on www.

## Already tracked (consoles, not the job)

Codex listings exist. They are account consoles.

| Name | Their job | Threat | What they miss | AFT move |
| --- | --- | --- | --- | --- |
| Vercel | Production framework apps, Git, builds | Low on Small Software | Tiny-audience ceremony; Deployment Protection priced for Advanced / Enterprise (see below) | `/vs/vercel/` — different job; own the permissioned URL without their plan wall |
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
| **ChatGPT Sites** | Managed Ship layer (D1, R2, auth, analytics). Not Run/OSS. See [CHATGPT-SITES.md](./CHATGPT-SITES.md). |
| [Kitesurf](https://blog.cloudflare.com/kitesurf/) | Agent browser on Workers. Infra, not AFT. Useful only if apps need browser automation. Do not build around it yet. |
| [Grok Bot](https://x.ai/news/introducing-grok-bot) | SpaceXAI, 11 Aug 2026. Always-on bots + cloud computer + scheduled **routines**. Same *job* as parked [AI automations](./parked/cron.md) (prompt + schedule, e.g. 9am brief). Different product: digital coworker that signs into *your* tools, not automation on a claimed `*.aft.page` app. Watch; do not unpark. |
| Dynamic Workers | Commoditizes “run generated code.” Edge stays identity, sharing, lifecycle — not the sandbox. |
| [Perch](https://mandarwagh9.github.io/perch/#access) | Same category language after the YC RFS. Watch for ideas; not a market threat. |
| [Surge.sh](https://surge.sh) | Historical analog, not a 2026 rival. See below. Not Peak XV Surge, not Surge AI. |

## Historical analog: Surge.sh (Chloi)

Human version of the AFT wedge: folder on disk → `*.surge.sh`, no git, no cloud
account, six keystrokes. Agents were not in the picture; the CLI *was* the
agent. Launched ~2014. Still live. Do not add a `/vs/` page.

**Owner:** [Chloi Inc.](https://chloi.io/about) (Vancouver). Directors **Brock
Whitten** (`sintaxi`, co-creator) and **Rob Ellis**. PhoneGap / Apache Cordova
alumni; Mozilla WebFWD. Kenneth Ormandy designed/launched the site. Surge is a
product of a small consulting shop, not a VC-backed cloud. Never acquired.
Terms still say Chloi. CLI: [sintaxi/surge](https://github.com/sintaxi/surge).
Companion SSG was [Harp](https://github.com/sintaxi/harp).

`surge --add` adds people who can *publish*. That is not Doc invite (people who
can *open*). Password protection sat on Professional ($30/mo). Static CDN only.

**Why it never became the company:**

1. **Company shape.** Client work + a CLI. Not “own the URL, then pull in
   every next need of the app.” No capture of a winning framework — Harp lost
   to Jekyll / Gatsby / Next. Vercel had Next; Surge had a preprocessor.
2. **Static was the product.** Netlify (2015) and Zeit/now (2015) took git
   deploys, preview URLs, then functions/SSR. Surge stayed `surge .` on a CDN.
   The moment the site needed a backend, users left.
3. **The wedge became the ceiling.** No-git was the 2014 win. By 2016 the
   production workflow *was* git + PR previews. Skipping git stopped being a
   feature for teams.
4. **Pricing.** Free → $30/mo cliff for custom SSL, force HTTPS, redirects,
   password. Competitors gave custom domain + SSL on free. Generous unlimited
   free publishing, thin paid conversion.
5. **Pace.** Indie utility: slow surface, thin dashboard, outage lore. Still
   useful for throwaway static. Not a platform that compounded.

**AFT lesson:** Surge proved no-git publish can win a generation of frontend
people and still die as a *company* if runtime and permissioned share never
show up. “AI native” is who hits the endpoint now. The trap is staying HTML
hosting with a nicer CLI — that is Surge in 2026, and Drop / ShipStatic already
commoditized it.

Their GitHub README now gestures at “AI-driven workloads.” Watch; do not treat
as Codex-shelf competition until agents actually call them.

## Vercel Deployment Protection = demand proof (small enterprise)

Vercel’s Project Settings → Deployment Protection is the same job AFT sells —
keep a deploy off the open web, let the right people in — then prices the
useful parts past a small org:

| Need | Vercel feature | Their gate |
| --- | --- | --- |
| Gate the deploy | Password Protection | Advanced Deployment Protection — **$150/mo** |
| Office / VPN only | Trusted IPs | **Enterprise** |
| Exclude a domain from protection | Deployment Protection Exceptions | Advanced — **$150/mo** |
| Teammate access | Vercel Authentication | Must be logged into Vercel **and** on your team |
| Outsider collaborator | Shareable Links / automation bypass secret | Escape hatches around the wrong ACL |

Wrong ACL for Small Software: the colleague who should open the tool is usually
in Slack with a company email, not on the customer’s Vercel team. Password and
shareable-link ceremony is what you buy when invite-by-email isn’t the product.

**AFT answer (tiered):**

| Buyer | SKU | Perimeter |
| --- | --- | --- |
| One person | Personal **30 days free, then $19** | Private apps, higher limits. Self-serve when billing starts. |
| Team of a few | Team **Talk** | Quote $99 on the call. Private + invite ACL. |
| Small enterprise | Enterprise **Talk** | Quote $499 or a $2k/30-day pilot. IP whitelist / SSO / connector — pick one. |

Do not chase Vercel’s full Deployment Protection UI on Free/Team. Invite is the
default ACL. Perimeter knobs (IP allowlist and friends) are the Enterprise
conversation when a buyer points at that Vercel screen and asks for parity.

Snapshot: Vercel UI, Aug 2026.

## Insight

Software for three users should not require infrastructure designed for three
million. The Codex shelf proves the *URL* half is table stakes. AFT’s
understanding: the hard remaining job is who can open it, who can edit it, and
whether the URL survives claim — not another bundled database.

Vercel Deployment Protection proves enterprises already budget for that job;
they just force small teams onto Advanced ($150 password) and Enterprise (IPs).
AFT undercuts that stack: invite on a Team conversation, full perimeter as Enterprise.
