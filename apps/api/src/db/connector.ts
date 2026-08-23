import type { Env } from "../env";
import { ensureDb } from "./core";

export type ConnectorRow = {
  id: string;
  slug: string;
  token_hash: string;
  label: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export type ConnectorInvokeRow = {
  id: string;
  slug: string;
  capability: string;
  payload_json: string;
  status: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function insertConnector(
  env: Env,
  opts: {
    id: string;
    slug: string;
    tokenHash: string;
    label?: string | null;
  },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO connectors (id, slug, token_hash, label, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  )
    .bind(
      opts.id,
      opts.slug,
      opts.tokenHash,
      opts.label ?? null,
      new Date().toISOString(),
    )
    .run();
}

export async function findConnectorByTokenHash(
  env: Env,
  tokenHash: string,
): Promise<ConnectorRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, token_hash, label, last_seen_at, created_at
     FROM connectors WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<ConnectorRow>();
  return row ?? null;
}

export async function touchConnectorSeen(
  env: Env,
  connectorId: string,
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `UPDATE connectors SET last_seen_at = ? WHERE id = ?`,
  )
    .bind(new Date().toISOString(), connectorId)
    .run();
}

export async function getLatestConnectorForSlug(
  env: Env,
  slug: string,
): Promise<ConnectorRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, token_hash, label, last_seen_at, created_at
     FROM connectors WHERE slug = ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(slug)
    .first<ConnectorRow>();
  return row ?? null;
}

export async function createConnectorInvoke(
  env: Env,
  opts: {
    id: string;
    slug: string;
    capability: string;
    payload: unknown;
  },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO connector_invokes
      (id, slug, capability, payload_json, status, result_json, error, created_at, completed_at)
     VALUES (?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL)`,
  )
    .bind(
      opts.id,
      opts.slug,
      opts.capability,
      JSON.stringify(opts.payload ?? {}),
      new Date().toISOString(),
    )
    .run();
}

export async function claimNextPendingInvoke(
  env: Env,
  slug: string,
): Promise<ConnectorInvokeRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, capability, payload_json, status, result_json, error, created_at, completed_at
     FROM connector_invokes
     WHERE slug = ? AND status = 'pending'
     ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(slug)
    .first<ConnectorInvokeRow>();
  if (!row) return null;
  // Mark in-flight so another poller does not double-claim (v0: single connector).
  await env.DB.prepare(
    `UPDATE connector_invokes SET status = 'running' WHERE id = ? AND status = 'pending'`,
  )
    .bind(row.id)
    .run();
  const claimed = await env.DB.prepare(
    `SELECT id, slug, capability, payload_json, status, result_json, error, created_at, completed_at
     FROM connector_invokes WHERE id = ?`,
  )
    .bind(row.id)
    .first<ConnectorInvokeRow>();
  return claimed?.status === "running" ? claimed : null;
}

export async function completeConnectorInvoke(
  env: Env,
  opts: {
    id: string;
    slug: string;
    ok: boolean;
    result?: unknown;
    error?: string;
  },
): Promise<boolean> {
  await ensureDb(env);
  const existing = await getConnectorInvoke(env, opts.id);
  if (!existing || existing.slug !== opts.slug) return false;
  if (existing.status !== "running" && existing.status !== "pending") {
    return false;
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE connector_invokes
     SET status = ?, result_json = ?, error = ?, completed_at = ?
     WHERE id = ?`,
  )
    .bind(
      opts.ok ? "done" : "error",
      opts.ok ? JSON.stringify(opts.result ?? null) : null,
      opts.ok ? null : (opts.error ?? "error"),
      now,
      opts.id,
    )
    .run();
  return true;
}

export async function getConnectorInvoke(
  env: Env,
  id: string,
): Promise<ConnectorInvokeRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, capability, payload_json, status, result_json, error, created_at, completed_at
     FROM connector_invokes WHERE id = ?`,
  )
    .bind(id)
    .first<ConnectorInvokeRow>();
  return row ?? null;
}

export async function listConnectorsForOps(
  env: Env,
  slug: string,
): Promise<
  { id: string; label: string | null; lastSeenAt: string | null; createdAt: string }[]
> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, label, last_seen_at, created_at FROM connectors
     WHERE slug = ? ORDER BY created_at DESC`,
  )
    .bind(slug)
    .all<{
      id: string;
      label: string | null;
      last_seen_at: string | null;
      created_at: string;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    label: r.label,
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
  }));
}
