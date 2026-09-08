import type { Env } from "../env";
import { ensureDb } from "./core";

export type BrandDomainWatchRow = {
  domain: string;
  status: "registered" | "available" | "unknown";
  expiresAt: string | null;
  registrar: string | null;
  error: string | null;
  checkedAt: string;
  changedAt: string;
};

export async function listBrandDomainWatch(env: Env): Promise<BrandDomainWatchRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT domain, status, expires_at, registrar, error, checked_at, changed_at
     FROM brand_domain_watch
     ORDER BY domain`,
  ).all<{
    domain: string;
    status: BrandDomainWatchRow["status"];
    expires_at: string | null;
    registrar: string | null;
    error: string | null;
    checked_at: string;
    changed_at: string;
  }>();
  return (results || []).map((r) => ({
    domain: r.domain,
    status: r.status,
    expiresAt: r.expires_at,
    registrar: r.registrar,
    error: r.error,
    checkedAt: r.checked_at,
    changedAt: r.changed_at,
  }));
}

export async function upsertBrandDomainWatch(
  env: Env,
  row: BrandDomainWatchRow,
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO brand_domain_watch (domain, status, expires_at, registrar, error, checked_at, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET
       status = excluded.status,
       expires_at = excluded.expires_at,
       registrar = excluded.registrar,
       error = excluded.error,
       checked_at = excluded.checked_at,
       changed_at = excluded.changed_at`,
  )
    .bind(
      row.domain,
      row.status,
      row.expiresAt,
      row.registrar,
      row.error,
      row.checkedAt,
      row.changedAt,
    )
    .run();
}
