# aft.page — strategy

Internal north star. Canonical mission: [`../rfs.txt`](../rfs.txt).

Updated: 2026-08-07

## Company thesis

> **A cloud for small software.**
>
> Any agent → a working application → a durable URL → share it like a Google Doc.

Agents have compressed creation. They can produce personal tools, focused team
workflows, dashboards, reports, prototypes, and small full-stack applications in
minutes. Deployment still assumes Big Software: repositories, build settings,
cloud accounts, infrastructure choices, identity wiring, secrets, and ongoing
operations.

aft deletes that complexity for software with one or a small handful of users.

## Market reality (7 Aug 2026)

Cloudflare Drop and Temporary Accounts commoditize **static** upload → URL → claim.
OpenNext on Cloudflare is nearly automatic. Sandbox/Containers supply arbitrary-code
primitives. **AFT does not rebuild those primitives.** AFT owns the Small Software
lifecycle: detect → stable `*.aft.page` URL → claim → share → secrets → update → stop.

See [ADR-TEMP-ACCOUNTS.md](./ADR-TEMP-ACCOUNTS.md), [OPENNEXT-ORCHESTRATION.md](./OPENNEXT-ORCHESTRATION.md),
[ADR-SANDBOX-LATTICE.md](./ADR-SANDBOX-LATTICE.md).

## Product job

The user gives aft what an agent produced. aft determines how to run it, returns
a URL, and keeps the application usable for as long as it matters.

```text
Claude / Codex / Cursor / ChatGPT / Git / human
                         │
                         ▼
                    aft.page
        detect → build → isolate → deploy → URL
                         │
              own → share → update → stop
```

## Product progression

| Layer | User outcome | Status / next proof |
| --- | --- | --- |
| Static | HTML or SPA → URL | Shipped (Drop-class; keep, don’t differentiate) |
| Ownership | Claim, list, update, rollback | Shipped / polish |
| Sharing | Public, private, invite, revoke | Shipped / outsider proof |
| Secrets | Per-site vault + capability approve | Shipped |
| Full stack | lattice-js APIs; worker/next via upstream proxy | Lattice dogfood live; OpenNext orchestrate script |
| Jobs / Sandbox Python | Schedules; CF Sandbox for Lattice Python | Follow-up on demand |
| Portability | Hosted default; customer cloud when needed | CLI proof exists |

## Dual track (proof ∥ platform)

| Track A — Proof | Track B — Platform |
| --- | --- |
| Strangers deploy without founder help | Agent → URL dependable (static + lattice-js) |
| Repeat use after 7 / 30 days | OpenNext via `@opennextjs/cloudflare` (no custom adapter) |
| Share: owner + another person | Secrets, invite, rollback across runtimes |
| Design partners, evidence pack, YC | Temp Accounts for demos; aft-owned Workers for brand URL |

## Evidence scoreboard

| Metric | Why |
| --- | --- |
| Stranger deploys reaching a working URL | Core activation |
| Repeat deployers / apps used after 7 days | Durable utility |
| Apps shared with another person | Google-Doc sharing proof |
| Full-stack apps without cloud setup | Category expansion (Lattice / Next) |

## Near-term mission

> Get useful Small Software (static *and* full-stack) from an agent to a durable
> URL, while proving people return to it and share it — above Cloudflare primitives,
> not competing with Drop on static alone.
