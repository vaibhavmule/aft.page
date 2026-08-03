# Pivot — from AWS CLI to aft.page (26 Jul 2026)

Internal notes. Do not treat as a public README.

## Earlier thesis (still true, narrower audience)

**Product:** open-source CLI that deploys static / SPA / Next.js into **the developer’s own AWS account** — Vercel-like DX, AWS ownership.

**Who loves it:** developers who already have AWS, refuse another host, and approve of a CLI + eventually a **paid cloud-based UI** (instead of today’s local `aft ui`).

**Proof we have:** live `aft deploy --profile aft`, staging / rollback / destroy, tests aligned with real AWS, marketing site dogfooded via the CLI.

**Limit:** only people who will open a terminal and wire AWS credentials. That is a real market — it is not “any Claude user.”

## Today’s thesis (YC RFS + Artifacts gap)

**Narrative:** [Y Combinator — A Cloud for Small Software](https://www.ycombinator.com/rfs) (Pete Koomen, Fall 2026). Agents made *building* personal / team tools easy; *deploy + share* is still hard. Incumbent clouds are for Big Software. Share should feel like a Google Doc.

**What we saw:** Claude Artifacts can build a pink todo in chat; exits are only **Copy** / **Download** — no Deploy, no live link, no phone URL.

**Product wedge:** not Lovable (generate). **Lovable for deploying** — paste / artifact → live HTTPS on `aft.page`, optional custom domain later.

**Who loves it:** anyone in Claude / ChatGPT / Cursor who just made something and wants a link — chat-simple, not AWS-simple.

**Hard problems (later, named by YC):** company runtime customization, auth & permissions, non-technical users sharing arbitrary code safely.

## Two products, one brand

| | **aft (OSS CLI)** | **aft.page (hosted)** |
| --- | --- | --- |
| Promise | Deploy into *your* AWS (and later Cloudflare) | Deploy + share without an account tax |
| UX | Terminal / local workset; paid hosted UI later | Chat / plugin / “Deploy” button |
| Audience | Developers | Claude / agent users + small teams |
| Infra | Customer cloud | Our Cloudflare (Workers + R2 + KV) |
| Open? | Stay public (trust + distribution) | Can be commercial from day one |

Do **not** privatize the CLI out of fear of copies. The idea is already public. Race on execution and distribution.

## Naming (from earlier transcript)

**aft** = *after* Vercel / *aft* of the ship — your infra, your cloud. CLI: `aft deploy`.

## Domain

`aft.page` registered 2026-07-26 (Cloudflare Registrar). Landing currently on AWS CloudFront; target is apex on Cloudflare serving the same brand story.

## Near-term focus (co-founder order)

1. Point **aft.page** at a live site (Cloudflare) + capture emails on “Coming soon.”
2. Ship smallest hosted slice: files → `*.aft.page` URL.
3. Claude / Chrome “Deploy” path.
4. Optional: `aft deploy --provider cloudflare` (BYO CF) sharing the same upload/serve patterns.
5. Keep AWS provider as the OSS credibility path; Show HN as data-gathering, not the big wedge.

## What we refuse this week

- Closing the GitHub repo
- Full auth / sandbox / team perms before one stranger has a shareable link
- Confusing BYO-Cloudflare CLI work with the hosted aft.page product (related stack, different buyer)
