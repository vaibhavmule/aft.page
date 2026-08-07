# ADR: Sandbox / Containers for Lattice Python (follow-up)

## Status

Accepted as **follow-up** after Lattice JS path ships on aft.page.

## Context

Polymerize Lattice’s Cloudflare path runs generated Python inside `@cloudflare/sandbox` + Containers. Cloudflare already provides this substrate; AFT must not recreate it.

## Decision

1. Keep **lattice-js** (SheetJS + Anthropic `convert(sheets)`) as the hosted MVP on `*.aft.page`.
2. When a design partner needs Python parity:
   - Orchestrate CF Sandbox SDK bindings on an aft-owned Worker (or upstream Worker URL).
   - Reuse Lattice Dockerfile / image patterns from `polymerize/labs-ingest-sandbox`.
   - Declare sandbox capability in `aft.json` and approve-on-deploy.
3. Do not block the dual-track plan on Sandbox GA edge cases.

## Non-goals

- Building a custom container runtime
- Multi-tenant Sandbox fleet before demand

## Related

- [ADR-TEMP-ACCOUNTS.md](./ADR-TEMP-ACCOUNTS.md)
- [STRATEGY.md](./STRATEGY.md)
