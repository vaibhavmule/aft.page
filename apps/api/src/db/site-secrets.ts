import type { Env } from "../env";
import { ensureDb } from "./core";

/**
 * `site_secrets` holds the hashed edit token for anonymous/claim-free sites.
 * Distinct from `src/secrets.ts`, which manages the `site_secret_values`
 * table (user-set environment-variable secrets) — do not merge the two.
 */

export async function setSiteEditTokenHash(
  env: Env,
  slug: string,
  editTokenHash: string,
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO site_secrets (slug, edit_token_hash, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET edit_token_hash = excluded.edit_token_hash, created_at = excluded.created_at`,
  )
    .bind(slug, editTokenHash, now)
    .run();
}

export async function clearSiteEditTokenHash(env: Env, slug: string): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(`DELETE FROM site_secrets WHERE slug = ?`).bind(slug).run();
}

export async function getEditTokenHash(
  env: Env,
  slug: string,
): Promise<string | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT edit_token_hash FROM site_secrets WHERE slug = ?`,
  )
    .bind(slug)
    .first<{ edit_token_hash: string }>();
  return row?.edit_token_hash ?? null;
}
