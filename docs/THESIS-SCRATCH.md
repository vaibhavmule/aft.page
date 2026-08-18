# Thesis scratch — not canonical

Draft only. Do not paste into `rfs.txt`, `STRATEGY.md`, or the YC application
until this is approved. Live mission stays: a cloud for Small Software.

---

AFT begins by making agent-built Small Software as easy to share as a Google
Doc. That gives us the deployment endpoint used by coding agents. As those
applications become richer, AFT expands into their runtime: compute, data,
authentication, permissions, jobs and safe execution. The long-term company is
an agent-native cloud—where agents can build, deploy and operate software
without forcing humans to manage traditional cloud infrastructure.

| Stage | What we own | Why it compounds |
| --- | --- | --- |
| Begin | Doc-simple share (durable URL, invite, revoke, same link on update) | Agents need a place to put the app |
| Capture | The deployment endpoint coding agents call | Default pipe → we see every app as it gets richer |
| Expand | Runtime: compute, data, auth, permissions, jobs, safe execution | Small Software outgrows static files; we grow with it |
| Company | Agent-native cloud | Agents build, deploy, and operate; humans do not run traditional cloud infra |

## Notes for discussion

The current live line is “publishing and permission layer.” That is the wedge,
not the company. Share is how we get the endpoint. Runtime is how we become
the cloud.

Public language can stay Google Doc / live URL. “Agent-native cloud” is a
destination phrase — not the 50-character field, video opener, or website
headline unless we decide it is.

Open questions:

- Does “agent-native cloud” replace “cloud for Small Software,” or is Small
  Software the beachhead and agent-native the destination?
- Is the capture step (being the endpoint agents call) true today, or only
  after plugin distribution actually works?
- How much of compute / data / auth / jobs do we own vs wrap (Cloudflare)?

## If Vercel can become agent infra, why not AFT?

Vercel’s company was never “we host Next.js.” It was: own the deploy URL, then
every new need of the app (functions, data, auth, cron, AI, sandboxes, plugins)
gets pulled in because switching the URL is painful. They are doing that again
for agents in 2026 (Agent Plugins, v0, AI SDK). Proof that the shape works.

AFT can be the same shape for a different default:

| | Vercel | AFT |
| --- | --- | --- |
| Capture | Next.js → `vercel` | Agent finished a tiny app → AFT URL |
| Who it fits | Production / git / teams | One person or a handful, share like a Doc |
| Why they stay | Framework + existing deploys | Invite ACL + same URL + no cloud ceremony |
| Runtime later | Because the app grew | Because the app grew |

That is allowed. It is how every cloud company actually happens.

The analogy breaks if we copy their *customer*. Vercel will become agent infra
for the people they already have. They will not become Google Docs for a
three-person tool: Deployment Protection is $150, ACL is “on your Vercel team,”
git is assumed. Competing as a smaller Vercel is how AFT dies. Competing as the
default endpoint for the software Vercel prices and permission-models wrong is
how the long-term cloud is real.

Hard constraint, not a wording problem: Vercel had Next.js as gravity. AFT does
not own a framework. Capture only exists if coding agents actually call us
(plugin / MCP as the default “put it live” step). Until that is true, “agent
infra” is a destination we have not earned — same as Vercel before `now`.
