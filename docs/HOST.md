# Host — Layer 1

**Files → live URL.** Static HTML, folders, zip. No git. No build queue.

Status: **shipped** (Drop, static deploy API, R2 serve).

## User-facing

- [Drop](https://aft.page/drop/) — `/drop/`
- Static limits: see deploy API / MCP docs

## Internal

- Serve: `apps/api/src/serve.ts` (static / R2)
- Drop UI: `www/drop/`, `www/projects/new/`
- Competes with GitHub Pages on speed + ceremony; **AFT still owns this layer**
  (claim, share, update same URL) — not “leave static to Pages.”

## vs ChatGPT Sites

Sites includes hosted static-ish apps. AFT Host = **agent-neutral file drop**
without ChatGPT account. See [CHATGPT-SITES.md](./CHATGPT-SITES.md).

## Related

- [SHIP.md](./SHIP.md) — Layer 2 (Deploy)
- [RUN.md](./RUN.md) — Layer 3 (GitHub)
- [CODE.md](./CODE.md) — Layer 4 (prompt/template → D1 + R2)
