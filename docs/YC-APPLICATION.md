# YC Fall 2026 — application draft (aft.page)

> ⚠️ **STATUS: NOT SUBMITTED YET.** This is a draft only — the YC application has
> not been applied to. Submit at [apply.ycombinator.com](https://www.ycombinator.com/apply),
> then update this banner with the submission date.

Internal. Paste into [apply.ycombinator.com](https://www.ycombinator.com/apply). Late application still accepted; on-time decisions by Aug 28 — late has no promised date. Batch: Oct–Dec 2026, SF. Invest on acceptance.

Fill founder bio / equity / location / video yourself. Below = company narrative.

---

## Company name

**aft.page** (product) / working legal name TBD (suggest **Aft** or **Aft Labs**)

## Describe what your company does in 50 characters or less

`A cloud for small software`

(26 chars — alt: `Make agent-built software real`)

## Company URL

https://aft.page

## What is your company going to make? Explain what your product does as if to a potential user. (longer)

People and AI coding agents can now create useful personal and small-team
software in minutes—trackers, dashboards, focused workflows, prototypes, and
tiny full-stack apps. Deploying it still assumes Big Software: repositories,
cloud accounts, build settings, infrastructure, identity, and operations.

**aft.page is a cloud designed for Small Software:** give it what any agent made,
get a durable URL, and share it as easily as a Google Doc. No repository or cloud
ceremony is required for the default path.

The product grows with the application:

1. Static HTML or files from any agent → live URL in seconds today.
2. Ownership, updates, rollback, public/private sharing, invite, and revoke.
3. Secrets vault and upstream worker/next runtimes — without exposing their
   infrastructure.
4. Capabilities, isolation, connectors, and customer-cloud execution make
   arbitrary code safe and customizable when an application needs them.

One line users feel: *Your agent made the software. aft makes it live,
persistent, and shareable.*

## Why did you pick this idea? Do you have domain expertise?

I spent years shipping and operating secure multi-tenant enterprise software (auth, tenancy, customer-specific controls, infra). I also built **aft**, an open-source CLI that deploys frontends into the customer’s own AWS — so “run it in *their* cloud” is not theoretical.

Separately, agents made building trivial; useful output still dies in chat,
localhost, or a downloaded folder. I shipped **aft.page** (hosted deploy + MCP +
Chrome extension) so agent output becomes a live URL immediately. The broader
opportunity is not HTML hosting or an enterprise control plane: it is deleting
the cloud complexity between generated software and the few people who need it.

YC’s Fall 2026 RFS (“A Cloud for Small Software”) names the category. We were already building the rails; the RFS sharpened the company, it didn’t invent the insight.

## Who are your competitors? What do you understand about them that they don’t?

| Competitor | What they are | What we are not / are |
| --- | --- | --- |
| ChatGPT Sites / Claude Artifacts | Easy inside one creation surface | We are cross-agent and own the durable application lifecycle |
| Prized (YC S26) | Governed builder for company internal tools | We serve broader personal + team Small Software without requiring our builder |
| Ona / OpenAI | Secure execution for long-running coding agents | Different layer — we govern *deployed small software*, not background PR factories |
| Vercel / Netlify / AWS / Azure | Excellent general hosting | Designed for projects and scale; we optimize for tiny audiences and remove configuration |
| AppDeploy | Chat → live URL, no git; free tier is a full agent PaaS | Same activation; we are the permissioned share layer, not another bundled auth/DB/cron cloud |
| MiniUp | HTML/ZIP → URL, passwords, data/PDF packs, ChatGPT app | Closest publish language; password ≠ invite ACL. We own Doc-simple sharing, not datasets |
| Hatchable / Floot / Buildy | Codex/ChatGPT deploy + hosted BaaS or owner-only personal apps | Folder → URL is table stakes. We share like a Google Doc; they host a stack or lock the URL to you |
| Superblocks / internal-tool platforms | Hybrid connectors exist | We’re agent-first + lightweight small-software cloud, not a heavy IDE for ops teams |

Insight: software for three users should not require infrastructure designed for
three million. The Codex shelf already commoditizes agent → URL; what they miss
is who can open it after claim. Tracking: [COMPETITION.md](./COMPETITION.md).

## How do or will you make money?

Free agent → URL activation. Paid for retained applications, private sharing,
state/full-stack runtime, higher limits, custom domains, and team ownership.
Later: customized environments and customer-cloud execution. OSS CLI remains a
distribution, trust, and portability path.

Early: design partners on team plans; not chasing enterprise procurement before weekly usage.

## How far along are you?

**Live product:** https://aft.page — paste/upload or MCP → live URL. Chrome
extension. Magic-link claim, projects inventory, private invite, capabilities
approve-on-deploy, connector v0. Per-site secrets vault. First full-stack dogfood:
[next-hello.aft.page](https://next-hello.aft.page) (`runtime: next`). Sibling OSS
CLI (`aft`) deploys to customer AWS / Cloudflare Pages. Worker tests green.

**Not yet:** Workspace/Entra orgs, secrets UI polish, custom domains GA.

Honest: Drop-class static is commodity; differentiation is lifecycle + small
full-stack without cloud ceremony. Evidence of stranger retention is the gap,
not the missing adapter.

## How long have you been working on this?

aft CLI + aft.page: concentrated build from mid/late July 2026 (nights/weekends alongside full-time employment). Domain background: years in enterprise SaaS/security-adjacent product engineering.

## What is the next step for your product / company?

1. Submit this application; clear employment IP (personal hardware/accounts only).
2. Prove strangers reach a URL and return to the app.
3. Prove Doc-style sharing with one app used by its owner and another person.
4. Prove secrets + a worker/next app end-to-end when a design partner needs it.
5. Reach ~10 real apps, ≥5 repeat deployers, and ≥3 apps used after seven days.

## Something surprising / impressive you’ve done (founder)

Shipped a real multi-cloud-adjacent deploy path (OSS CLI into customer AWS with destroy/safety hardening) and a hosted agent MCP path to production URLs in days — then *changed the company thesis* when Sites/Prized made hosting-alone obsolete, instead of clinging to the first wedge.

## Video (1 min) — application field

Sources: [YC video spec](https://www.ycombinator.com/video) · [PG howtoapply](https://www.ycombinator.com/howtoapply)
· Geoff Ralston (clarity + talk about yourselves, not a marketing video)
· DoorDash 2013 app video (YC still publishes it)
· Gustaf Alströmer: say what you actually do; quiet room

**Hard rules:** founders talking only. 60s max. No demo, music, slides, b-roll.
Unlisted YouTube, embedding on. Cue cards, not a recited paragraph.

**PG test:** after the first sentence, could a partner reproduce what you make?
If not, the sentence was noise. Narrow and concrete beats “cloud / platform / unlock.”

### Winning structure (DoorDash shape, solo)

| Time | Beat | Word pattern that worked |
| --- | --- | --- |
| 0:00–0:08 | Who | “I’m X. I [verb] at [company].” Not “CEO.” |
| 0:08–0:28 | What + how it works | First sentence = the thing. Then “how it works is…” (DoorDash) |
| 0:28–0:42 | Why / problem | Concrete nouns. A place or a scene. Not “the industry.” |
| 0:42–0:52 | Why you | One specific thing you built. Not adjectives. |
| 0:52–1:00 | Shipped | Live fact. No fake users. Stop. |

PG’s shortcut for the “what”: *variant of something they already know.*
For us: **“like a Google Doc, but for the app your agent just made.”**
(That line is in YC’s own RFS — use it as description, do **not** say “we’re answering the RFS.”)

### Words to use vs kill

**Use (matter-of-fact, DoorDash-plain):**
you, they, files, URL, coworker, invite, same link, GitHub, Vercel, cloud account,
Claude / Cursor, tiny app, expense tracker, two seconds, live, I built, I ship

**Kill (marketing / infra — PG calls this zero content):**
opening with “we’re building a cloud for Small Software” · agent-native ·
durable lifecycle · ceremony · MCP · Workers · capabilities · BYOC · platform ·
unlock · transform · the future of deploy · “I didn’t pick this because of an RFS”

Say “your coding agent can publish it” instead of MCP.
Say “drop the files, get a link” instead of “activation.”
Say “I write the product and I ship it” instead of “solo founder / CEO.”

### Cue cards (look, don’t read)

1. I’m Vaibhav. I write and ship aft.page.
2. People get Claude to build a tiny app in minutes. Putting it on the internet still means GitHub, a cloud account, and Vercel.
3. How it works: drop the files — or the agent publishes them — and you get a URL. Send it like a Google Doc. Same link when you update it. Invite someone if it’s private.
4. In 2011 I could get WordPress live in five minutes. I later built a CLI that deploys into the customer’s own AWS. Same job: time to a URL.
5. Product is live. Couple of seconds. That’s it.

If long: drop the CLI sentence.

### Practice take (hear the beats, then film from cards)

> I’m Vaibhav. I write and ship aft.page.
>
> People can get Claude to build a tiny app in minutes — an expense tracker, a
> dashboard for three people. Putting that app on the internet still means GitHub,
> a cloud account, and Vercel.
>
> How it works is: you drop the files, or your coding agent publishes them, and
> you get a URL. You send that URL like a Google Doc. Same link when you change
> the app. Invite someone if it shouldn’t be public.
>
> In 2011 I could get WordPress live in five minutes. That’s still the job. The
> product is live today. A couple of seconds to a URL. That’s aft.page.

### Demo field (not this video)

Screen recording, mute or one-line voiceover, 20–40s:

Drop or MCP → live slug URL → same URL after update → private + invite (if you can show a real
second person; otherwise stop at claim + projects). Put the public URL in the demo box:
https://aft.page — plus one live example (e.g. https://next-hello.aft.page).

---

## Application do / don’t

**Do:** Lead with shipped MCP + live URLs. Show the Small Software lifecycle.
Name Sites, Prized, and general clouds directly. Solo apps count; repeat use is
the evidence.

**Don’t:** Claim you invented the YC RFS. Promise full BYOC as built. Position
as “Claude hosting,” an enterprise control plane, or static HTML hosting. Do not
overstate users—under-promise traction and over-prove the experience.

## After submit

- Polymerize IP evening.
- Spec connector protocol (capability declaration, outbound tunnel, enforcement) so step 6 coding doesn’t drift.
- Keep building steps 3–5 without waiting for YC reply.
