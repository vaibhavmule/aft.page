# Team / sharing

Sites can be **public** or **private**. Private sites use Google Doc–style **invite by email** (view/edit) and revoke — not shared passwords.

## Status (2026-08-03)

**Shipped**
- Claim site via magic link (`POST /v1/claim/start`, `GET /v1/claim/verify`) — preview UI wired
- Session cookie on `.aft.page`
- `PATCH /v1/sites/{slug}` visibility
- Invites: create / list / revoke / `GET /v1/invites/accept`
- Members list + remove
- `serveSite` ACL for private (owner or member session)
- Preview: claim dialog, visibility toggle, invite dialog

**Requires**
- `AUTH_SECRET` wrangler secret
- Email Sending binding (`claim@aft.page`) for claim + invite emails

**Not yet**
- Google Workspace / Entra org SSO
- Company-wide OAuth (intentionally deferred — invite-by-email first)

Why: polymerize/ops pain was “add this colleague” without rotating a shared secret. Aligns with rfs.txt: *Small software should be as easy to share with your colleagues as a Google Doc.*
