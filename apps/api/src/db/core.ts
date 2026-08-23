import type { Env } from "../env";

/**
 * Schema comes from `migrations/` via wrangler D1 (deploy + vitest pool).
 * Kept as a no-op so call sites stay stable — never reintroduce per-request DDL
 * (cold isolates were paying multi-second CREATE TABLE tax).
 */
export async function ensureDb(_env: Env): Promise<void> {
  /* no-op */
}
