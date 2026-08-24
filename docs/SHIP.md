# Ship — Layer 2 (Deploy)

**`aft deploy`:** the agent (or you) already built something. Detect the
framework, take `dist/` / `out/` / `build/`, put it on a URL.

Not ChatGPT Sites. Sites is [Code](./CODE.md) — later. Deploy does not
create the app, edit in chat, or provision D1.

Status: **almost** — MCP, hosted CLI, extension (GitHub Run + ChatGPT/Claude
artifacts), Drop after local build. Dashboard: [PROJECTS-UI.md](./PROJECTS-UI.md).

## User-facing

- Remote MCP: `https://mcp.aft.page/mcp` — [`www/mcp.md`](../www/mcp.md)
- CLI: `curl -fsSL https://aft.page/install | sh` → `aft deploy`
- Agent Plugin + Skill: `npx plugins add vaibhavmule/aft.page` — [`www/plugins.md`](../www/plugins.md)
- libaft (embed): [`apps/sdk`](../apps/sdk) — own CLI / background agent / software factory
- Extension: `apps/extension/` — GitHub **Run on AFT** + ChatGPT/Claude HTML (DOM fragile)
- Agent landings: `www/with/*`

## Agent rules

Build locally → upload **built files only** (`dist/`, `out/`). Never `src/`,
`node_modules`, `.next/`. Next SSR: not MCP upload path — see [RUN.md](./RUN.md)
build queue + OpenNext.

## Related

- [HOST.md](./HOST.md) — Layer 1 (Drop)
- [RUN.md](./RUN.md) — Layer 3
- [CODE.md](./CODE.md) — Layer 4 (prompt/template → D1 + R2, not yet)
- [ADR-MCP-THIN.md](./ADR-MCP-THIN.md)
