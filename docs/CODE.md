# Code — Layer 4 (prompt/template → app with D1 + R2)

Door name: **Code.** Not Retool (their brand). Path: `/code/` or `/projects/new`.

Status: **in play.** v0 is live at [`/code/`](https://aft.page/code/) — prompt or
template → static HTML (`localStorage`). Per-site **D1 + R2** still later.

Sandbox **persistent interpreters** (Python / JS / TS) are the generate/test
plane for this door. v1 is still one template + real D1; Grok (or whatever
[AI Gateway](https://developers.cloudflare.com/ai-gateway/) already catalogs)
emits JSON against the SDK. Do not chase Vercel’s model list; use Cloudflare’s
unified `env.AI.run()` catalog so new CF models are a config change.

**Layers:** [HOST.md](./HOST.md) · [SHIP.md](./SHIP.md) · [RUN.md](./RUN.md) · **Code**.

## Job

Prompt or template → live app on `*.aft.page` with **D1 (tables) + R2 (files)**.
That’s the ChatGPT Sites completed loop. Not v0 (pretty UI, no data plane).
Not `aft deploy` (that ships files you already built).

| | v0 | ChatGPT Sites | **Code** |
| --- | --- | --- | --- |
| Prompt / template → UI | ✅ | ✅ | on-ramp |
| Tables | bolt-on | **D1** | **D1** |
| Files | bolt-on | **R2** | **R2** |
| Share | Vercel project | ChatGPT login | email invite / SSO |

D1 and R2 *are* the builder backend, not an afterthought.

## Generator = Grok via AI Gateway

v0 is an LLM that writes UI. Same job here: **Grok through Cloudflare AI
Gateway**, not a custom model. Ref clone: `refs/cloudflare-os` (do not fork).

Worker `AI` binding + gateway id `default` (auto-created; `AFT_AI_GATEWAY`
to split spend later). Spend and logs live on the gateway. Fallback model:
Workers AI llama if Grok isn’t billed.

Do not train anything. Do not let Grok invent Cloudflare APIs.

**How it actually does the job** (the model is not the hard part):

1. **You own the SDK.** One Worker you write once: `/api/db` (D1) and
   `/api/files` (R2). Generated apps only `fetch` those. Grok never writes
   bindings, wrangler.toml, or migrations by hand.
2. **Grok emits JSON, not a chat blob.** Shape:
   `{ files: [{ path, content }], schema: "CREATE TABLE …" }`.
   AFT writes files, applies schema, deploys. Markdown fences = fail.
3. **Start without Grok.** v1 = one template (todo) already wired to D1.
   Prompt only fills title/columns. That’s how you know the loop works.
4. **Then** call Grok to generate/edit files against that SDK.
   Chat-edit = same JSON, patch, redeploy. Same as Sites, not a new product.

xAI / Grok via **AI Gateway** on the API Worker. Do not ship keys in the browser.

v0 surface: **`/code/`** (prompt + templates → static HTML → live URL).
`/projects/new` stays the kitchen sink (prompt + GitHub + drop).
`POST /v1/code/generate` · `POST /v1/repo/check` · `POST /v1/repo/deploy`.

## Loop

1. Prompt, or pick a template (todo, tracker, form).
2. AFT provisions **D1 + R2** for that slug and deploys the UI.
3. Table browser + file store on the project.
4. Invite. Sleep when idle. **Own it = paid** (data persists).

## Surfaces (when it ships)

| Path | Job |
| --- | --- |
| `/code/` | prompt + templates → static HTML → URL (v0) |
| `/projects/new` | prompt + GitHub + drop (kitchen sink) |
| Project → Database | D1 table browser |
| Project → Files | R2 |
| Share | invite ACL |

## Build order

1. Run — GitHub → URL
2. Code v0 — `/code/` static HTML (shipped). v1 = one template + real D1 + invite
3. Grok via AI Gateway → JSON/HTML against the D1/R2 SDK. Fallback: Workers AI.
4. Never: ship the word Retool, clone v0’s marketplace

See [STRATEGY.md](./STRATEGY.md) § Four doors.

## Related

- [CHATGPT-SITES.md](./CHATGPT-SITES.md) — D1/R2 loop to match
- [HOST.md](./HOST.md) · [SHIP.md](./SHIP.md) · [RUN.md](./RUN.md)
