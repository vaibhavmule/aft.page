import type { Env } from "../env";
import { ensureDb } from "./core";

export async function addFeedback(
  env: Env,
  input: { message: string; email: string | null; page: string | null },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO feedback (id, message, email, page, source, created_at)
     VALUES (?, ?, ?, ?, 'marketing', ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.message,
      input.email,
      input.page,
      new Date().toISOString(),
    )
    .run();
}

export type FeedbackRow = {
  id: string;
  message: string;
  email: string | null;
  page: string | null;
  source: string;
  createdAt: string;
};

export async function listFeedback(
  env: Env,
  limit = 50,
): Promise<FeedbackRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, message, email, page, source, created_at
     FROM feedback ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      message: string;
      email: string | null;
      page: string | null;
      source: string;
      created_at: string;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    message: r.message,
    email: r.email,
    page: r.page,
    source: r.source,
    createdAt: r.created_at,
  }));
}
