import type { Env } from "../env";
import { ensureDb } from "./core";

export async function addWaitlistSignup(
  env: Env,
  email: string,
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO waitlist_signups (id, email, source, created_at)
     VALUES (?, ?, 'marketing', ?)`,
  )
    .bind(crypto.randomUUID(), email, new Date().toISOString())
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export type WaitlistSignupRow = {
  email: string;
  source: string;
  createdAt: string;
};

export async function listWaitlistSignups(
  env: Env,
  limit = 200,
): Promise<WaitlistSignupRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT email, source, created_at FROM waitlist_signups
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{ email: string; source: string; created_at: string }>();
  return (results || []).map((r) => ({
    email: r.email,
    source: r.source,
    createdAt: r.created_at,
  }));
}
