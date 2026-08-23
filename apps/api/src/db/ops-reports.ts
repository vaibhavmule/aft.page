import type { Env } from "../env";
import { ensureDb } from "./core";

/**
 * Cross-domain read-only reporting queries for the founder ops dashboard
 * (src/ops.ts). Kept separate from db/sites.ts, db/deploys.ts, etc. because
 * each function JOINs across tables owned by several other domain files —
 * isolating them here avoids those files needing to import each other.
 */

export type OpsSnapshot = {
  sites: number;
  claimed: number;
  users: number;
  waitlist: number;
  waitlist7d: number;
  deploys: number;
  deploysMtd: number;
  deployBytes: number;
  feedback: number;
  active24h: number;
  domains: number;
  domainRequests: number;
  /** runtime worker/next with upstream — each is an aft-owned Worker (WfP trigger). */
  siteWorkers: number;
};

export async function countOpsSnapshot(
  env: Env,
  since7d: string,
  mtd: string,
  since24h: string,
): Promise<OpsSnapshot> {
  await ensureDb(env);
  const n = async (q: string, bind?: string) => {
    const stmt = bind
      ? env.DB.prepare(q).bind(bind)
      : env.DB.prepare(q);
    const row = await stmt.first<{ n: number }>();
    return Number(row?.n ?? 0);
  };
  const [
    sites,
    claimed,
    users,
    waitlist,
    waitlist7d,
    deploys,
    deploysMtd,
    deployBytes,
    feedback,
    active24h,
    domains,
    domainRequests,
    siteWorkers,
  ] = await Promise.all([
    n(`SELECT COUNT(*) AS n FROM sites WHERE slug NOT LIKE 'test--%'`),
    n(
      `SELECT COUNT(*) AS n FROM sites WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%'`,
    ),
    n(`SELECT COUNT(*) AS n FROM users`),
    n(`SELECT COUNT(*) AS n FROM waitlist_signups`),
    n(`SELECT COUNT(*) AS n FROM waitlist_signups WHERE created_at >= ?`, since7d),
    n(`SELECT COUNT(*) AS n FROM deploys`),
    n(`SELECT COUNT(*) AS n FROM deploys WHERE created_at >= ?`, mtd),
    n(`SELECT COALESCE(SUM(bytes), 0) AS n FROM deploys`),
    n(`SELECT COUNT(*) AS n FROM feedback`),
    n(
      `SELECT COUNT(*) AS n FROM sites WHERE last_served_at >= ? AND slug NOT LIKE 'test--%'`,
      since24h,
    ),
    n(`SELECT COUNT(*) AS n FROM custom_domains`),
    n(`SELECT COUNT(*) AS n FROM users WHERE custom_domains = 'requested'`),
    n(
      `SELECT COUNT(*) AS n FROM sites WHERE slug NOT LIKE 'test--%'
        AND COALESCE(runtime, 'static') IN ('worker', 'next')
        AND upstream_url IS NOT NULL AND TRIM(upstream_url) != ''`,
    ),
  ]);
  return {
    sites,
    claimed,
    users,
    waitlist,
    waitlist7d,
    deploys,
    deploysMtd,
    deployBytes,
    feedback,
    active24h,
    domains,
    domainRequests,
    siteWorkers,
  };
}

export type OpsSiteListRow = {
  slug: string;
  deployId: string;
  ownerEmail: string | null;
  visibility: string;
  runtime: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastServedAt: string | null;
  upstreamUrl: string | null;
  mainModule: string | null;
  deployCount: number;
  deployBytes: number;
  failureCount: number;
};

export async function listAllSites(
  env: Env,
  limit = 200,
): Promise<OpsSiteListRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT s.slug, s.deploy_id, u.email AS owner_email, s.visibility,
            COALESCE(s.runtime, 'static') AS runtime, COALESCE(s.active, 1) AS active,
            s.created_at, s.updated_at, s.last_served_at, s.upstream_url, s.main_module,
            COALESCE(d.n, 0) AS deploy_count, COALESCE(d.bytes, 0) AS deploy_bytes,
            COALESCE(f.n, 0) AS failure_count
     FROM sites s
     LEFT JOIN users u ON u.id = s.owner_user_id
     LEFT JOIN (
       SELECT slug, COUNT(*) AS n, SUM(bytes) AS bytes FROM deploys GROUP BY slug
     ) d ON d.slug = s.slug
     LEFT JOIN (
       SELECT slug, COUNT(*) AS n FROM deploy_failures WHERE slug IS NOT NULL GROUP BY slug
     ) f ON f.slug = s.slug
     WHERE s.slug NOT LIKE 'test--%'
     ORDER BY s.updated_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      slug: string;
      deploy_id: string;
      owner_email: string | null;
      visibility: string;
      runtime: string;
      active: number;
      created_at: string;
      updated_at: string;
      last_served_at: string | null;
      upstream_url: string | null;
      main_module: string | null;
      deploy_count: number;
      deploy_bytes: number;
      failure_count: number;
    }>();
  return (results || []).map((r) => ({
    slug: r.slug,
    deployId: r.deploy_id,
    ownerEmail: r.owner_email,
    visibility: r.visibility,
    runtime: r.runtime || "static",
    active: Number(r.active) !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastServedAt: r.last_served_at,
    upstreamUrl: r.upstream_url,
    mainModule: r.main_module,
    deployCount: Number(r.deploy_count),
    deployBytes: Number(r.deploy_bytes),
    failureCount: Number(r.failure_count),
  }));
}

export type OpsUserRow = {
  id: string;
  email: string;
  createdAt: string;
  customDomains: string | null;
  sites: number;
};

export async function listOpsUsers(env: Env, limit = 200): Promise<OpsUserRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.created_at, u.custom_domains,
            COALESCE(s.n, 0) AS sites
     FROM users u
     LEFT JOIN (
       SELECT owner_user_id, COUNT(*) AS n FROM sites
       WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%'
       GROUP BY owner_user_id
     ) s ON s.owner_user_id = u.id
     ORDER BY CASE u.custom_domains
       WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       u.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      email: string;
      created_at: string;
      custom_domains: string | null;
      sites: number;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    email: r.email,
    createdAt: r.created_at,
    customDomains: r.custom_domains,
    sites: Number(r.sites),
  }));
}

export type OpsDomainRow = {
  hostname: string;
  slug: string;
  status: string;
  sslStatus: string | null;
  error: string | null;
  createdAt: string;
  ownerEmail: string | null;
};

export async function listOpsCustomDomains(
  env: Env,
  limit = 200,
): Promise<OpsDomainRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT d.hostname, d.slug, d.status, d.ssl_status, d.error, d.created_at,
            u.email AS owner_email
     FROM custom_domains d
     LEFT JOIN sites s ON s.slug = d.slug
     LEFT JOIN users u ON u.id = s.owner_user_id
     ORDER BY d.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      hostname: string;
      slug: string;
      status: string;
      ssl_status: string | null;
      error: string | null;
      created_at: string;
      owner_email: string | null;
    }>();
  return (results || []).map((r) => ({
    hostname: r.hostname,
    slug: r.slug,
    status: r.status,
    sslStatus: r.ssl_status,
    error: r.error,
    createdAt: r.created_at,
    ownerEmail: r.owner_email,
  }));
}
