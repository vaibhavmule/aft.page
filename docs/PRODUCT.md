# aft — product direction (open source)

## North star

**Better Amplify + Vercel-like experience, on the customer’s AWS.**

Ship as an **open-source CLI + local workset** first (Apache-2.0). Trust matters when touching someone’s AWS account.

## Focus (in order)

1. Static HTML
2. React / Vite / Vue SPAs (including Rsbuild → `build/`)
3. Next.js static export
4. Local workset UI (`aft ui` + `~/.aft/aft.sqlite`)
5. Next.js SSR (OpenNext) — Lambda + CloudFront (Function URL OAC / IAM)
6. Other apps (APIs, workers)
7. Hosted aft Cloud (multi-user) — after OSS local path is loved

## Open source boundaries

| Open (this repo) | Later / optional commercial |
| --- | --- |
| CLI + deploy engine | Hosted dashboard / sync |
| Local SQLite workset | Team accounts / SSO |
| Local `aft ui` | Managed preview URLs SaaS |
| S3 + CloudFront automation | Real Cost Explorer billing |

## What we refuse to do early

- Don’t merge SSR until Function URLs are locked down and static DX is proven
- Don’t become Porter/Flightcontrol (full K8s/ECS PaaS) on day one
- Don’t build AI DevOps before `aft deploy` + `aft ui` are delightful
- Don’t require a new auth system — **AWS CLI credentials only** for the OSS CLI

## Success test

```bash
aft deploy
aft ui
```

→ CloudFront URL in the user’s AWS account, visible in the local workset, no AWS Console.
