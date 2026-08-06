# aft.page — strategy

Internal north star. Canonical mission: [`../rfs.txt`](../rfs.txt).

Updated: 2026-08-06

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

The public promise is simplicity. The machinery underneath may include identity,
permissions, capabilities, sandboxes, connectors, inventory, rollback, and
customer-cloud execution. Those are enabling capabilities—not the category.

## Who it serves

1. A person making software for themselves
2. Two or three colleagues sharing a bespoke workflow
3. An agent user who has useful output but no deployment expertise
4. A small team that needs a safe home for many tiny applications

Gated internal tools are a strong use case. Enterprise agent governance is a
possible expansion, not the starting definition.

## Product progression

| Layer | User outcome | Status / next proof |
| --- | --- | --- |
| Static | HTML or SPA → URL | Shipped |
| Ownership | Claim, list, update, rollback | Shipped / polish |
| Sharing | Public, private, invite, revoke | Shipped / outsider proof |
| Full stack | State, API routes, secrets, files | Next runtime proof |
| Jobs | Schedules and background work | Build on demonstrated need |
| Custom environment | Runtime/container customization | Later |
| Portability | Hosted default; customer cloud when needed | CLI proof exists |

OpenNext is a useful feasibility test because agents frequently create Next.js
apps and it exercises APIs, state, secrets, assets, and runtime lifecycle. It is
one runtime behind aft’s abstraction, not the mission itself.

## Competitive map

| Category | Examples | AFT response |
| --- | --- | --- |
| Integrated AI builders | Lovable, Replit, Bolt, v0 | Remain builder-neutral; accept what they export |
| Artifact publishing | ChatGPT Sites, Claude Artifacts | Own the durable, cross-agent URL and lifecycle |
| General cloud | Vercel, Netlify, AWS, Azure | Optimize for tiny audience and delete configuration |
| Internal-tool platforms | Retool, Superblocks, Prized | Serve broader personal + team Small Software; do not require their builder |
| Runtime primitives | Cloudflare Workers, Platforms, Containers, Sandbox | Build on them where they erase undifferentiated infrastructure |

Neutrality alone is not a moat. The experience must be dramatically simpler for
small applications and support more of what agents actually generate.

## Sequencing

1. Keep agent → URL fast and dependable.
2. Prove strangers can deploy without founder help.
3. Prove repeat use: applications still used after 7 and 30 days.
4. Prove sharing: at least one application used by its owner and another person.
5. Add one full-stack runtime without exposing cloud complexity.
6. Deepen identity, capabilities, connectors, and customer-cloud execution only
   where real Small Software demands them.

Do not reverse the sequence by building a generic enterprise control plane,
multi-region BYOC platform, or perfect sandbox protocol before repeat usage.

## Evidence scoreboard

| Metric | Why |
| --- | --- |
| Stranger deploys reaching a working URL | Core activation |
| Median agent-output → URL time | Simplicity promise |
| Repeat deployers | More than a novelty |
| Apps used after 7 / 30 days | Durable utility |
| Solo apps used repeatedly | Personal Small Software proof |
| Apps shared with another person | Google-Doc sharing proof |
| Full-stack apps deployed without cloud setup | Category expansion |
| Users who would notice if aft disappeared | Real value |

Deploy count is diagnostic, not the north star. A one-shot anonymous page and a
weekly personal tool are not equivalent.

## Operating model

Use agents to compress engineering. Spend founder time on observing what people
make, where deployment breaks, and whether the resulting software remains useful.

Near-term mission:

> Get useful Small Software from an agent to a durable URL, then prove people
> return to it and share it.

## Explicitly not optimizing for

- “Control plane” as the public category
- Enterprise procurement before product evidence
- Full BYOC or residency without signed demand
- Deep connector work before a live application needs it
- Static HTML as the final product boundary
- An acquisition narrative

Ship the smallest cloud that makes Small Software real. Prove strangers care.
