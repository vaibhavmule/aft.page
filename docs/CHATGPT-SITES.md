# ChatGPT Sites (competitive intel)

Internal. Snapshot from product UI + OpenAI docs, Aug 2026. Screenshots in
founder ChatGPT Sites dashboard (`*.chatgpt.site`).

## What it is

ChatGPT Sites is OpenAI’s **managed small-software cloud** inside ChatGPT — not
static-page hosting anymore. Prompt → live URL with lifecycle, data, auth, and
analytics in one surface.

Example URLs: `{slug}.{username}.chatgpt.site` (e.g. `three-things-daily.vaibhavmule.chatgpt.site`).

## Current features (public beta)

| Area | Capability |
| --- | --- |
| **Create** | Generate websites, web apps, games from prompts |
| **Import** | Deploy compatible existing projects |
| **Edit** | Chat-based editing and refinement |
| **Host** | Managed hosting with production URL |
| **Versions** | Saved versions; separate publish/deploy steps |
| **Data** | Persistent relational data through **D1** |
| **Storage** | Files / objects through **R2** |
| **Auth (internal)** | Workspace-authenticated internal applications |
| **Auth (public)** | Optional **Sign in with ChatGPT** (bouncer UI on private sites) |
| **Access** | Selected users/groups, workspace, or public (“Everyone”) |
| **Collab** | Shared editing between workspace members |
| **Secrets** | Environment variables and secrets |
| **Analytics** | Automatic visitors + page views (7d / 30d, top pages incl. `/api/*`) |
| **URL** | Editable hosted slug |
| **Domain** | Custom domains (where available) |
| **Inventory** | Sites list — Owned by you / Shared with you; search |
| **Project UI** | Settings · Analytics · **Database** (table browser, e.g. D1 `tasks`) |

Plans: Plus, Pro, Business, Enterprise, Edu — plan-specific limits. See
[OpenAI Sites documentation](https://help.openai.com/en/articles/chatgpt-sites) (official).

## UI patterns worth noting

From live dashboard (Aug 2026):

- **Sites hub** — card list with thumbnail, age, URL, sharing badge, Share + ⋯ menu
- **Share modal** — “Just me” vs broader access; owner row; Visit + Copy link
- **⋯ menu** — Share, Edit, Analytics, Settings
- **Settings** — name, URL change, custom domain, sharing, env vars, delete
- **Analytics** — unique visitors, page views, traffic chart, top pages
- **Database** — connected table viewer (refresh, paginated rows)
- **Sign-in wall** — “Continue with ChatGPT” for restricted public apps

## Important limitations

- No standalone **CLI** or **IDE** management interface
- Some frameworks, private networks, databases, background services unsupported
- D1 capped at **10 GB per Site**
- No data or inference residency at launch
- Custom domains unavailable for **Enterprise** workspaces at launch
- Not for payments, card data, or PHI

## Strategic takeaway for aft.page

**Not differentiators (ChatGPT already ships these):**

- Hosting, storage (R2), relational data (D1), auth, collaboration, env/secrets,
  analytics, URL editing, custom domains, basic lifecycle

**AFT’s remaining territory:**

| Wedge | Why Sites doesn’t own it |
| --- | --- |
| **Cross-agent neutrality** | Sites = ChatGPT-only creation + Sign in with ChatGPT |
| **Runnable OSS** | No “Run this GitHub repo” category; import is compatible-projects-only |
| **Live company-data connectivity** | Connector + capability grants ([CONNECTOR.md](./CONNECTOR.md)) |
| **Private networking** | Connector outbound poll; no customer VPC story on Sites |
| **Capability enforcement** | `aft.json` approve-on-deploy |
| **Company-wide governance** | Entra/Workspace SSO on *your* slugs (later) |
| **Customer-controlled infra** | OSS CLI / BYO cloud (parked product) |
| **Doc-simple share outside OpenAI** | Invite-by-email ACL not tied to ChatGPT identity |

## Four-layer map (AFT vs Sites)

| Layer | AFT | ChatGPT Sites |
| --- | --- | --- |
| **Host** (files → URL) | Drop — ✅ | ✅ (subset) |
| **Ship / Deploy** (`aft deploy`) | MCP, CLI — 🟡 detect + upload | ❌ (no CLI; creation is the builder) |
| **Run** (GitHub → URL) | Distribution engine — current | ❌ |
| **Code** (prompt/template → D1 + R2) | [CODE.md](./CODE.md) — in play | ✅ **primary** (tables + files + invite) |

Sites is the **Code** benchmark: prompt/template → app with D1 + R2.
[v0](https://v0.app/) is only the prompt skin. Deploy is not this. AFT wins **Run**.

## Related

- [COMPETITION.md](./COMPETITION.md) — Codex shelf, AppDeploy, etc.
- [HOST.md](./HOST.md) · [SHIP.md](./SHIP.md) · [RUN.md](./RUN.md) · [CODE.md](./CODE.md) — AFT layers
- [RUN.md](./RUN.md) — Runnable OSS category
