import type { Env } from "../env";
import { ensureDb } from "./core";

export type CapabilityDoc = {
  secrets: string[];
  egress: string[];
  data: string[];
};

export async function upsertCapabilityRequest(
  env: Env,
  slug: string,
  deployId: string,
  requested: CapabilityDoc,
): Promise<{ status: string; approved: CapabilityDoc | null }> {
  await ensureDb(env);
  const now = new Date().toISOString();
  const requestedJson = JSON.stringify(requested);
  const existing = await getCapabilityGrant(env, slug);

  let status = "pending";
  if (
    existing?.approved &&
    existing.status === "approved" &&
    capabilitiesCovered(existing.approved, requested)
  ) {
    status = "approved";
  }

  await env.DB.prepare(
    `INSERT INTO site_capability_grants
      (slug, requested_json, approved_json, status, deploy_id, approved_at, approved_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       requested_json = excluded.requested_json,
       deploy_id = excluded.deploy_id,
       updated_at = excluded.updated_at,
       status = excluded.status,
       approved_json = COALESCE(site_capability_grants.approved_json, excluded.approved_json)`,
  )
    .bind(
      slug,
      requestedJson,
      existing?.approved ? JSON.stringify(existing.approved) : null,
      status,
      deployId,
      status === "approved" ? now : null,
      null,
      now,
    )
    .run();

  return {
    status,
    approved: existing?.approved ?? null,
  };
}

export function capabilitiesCovered(
  approved: CapabilityDoc,
  requested: CapabilityDoc,
): boolean {
  const hasAll = (need: string[], have: string[]) =>
    need.every((n) => have.includes(n));
  return (
    hasAll(requested.secrets, approved.secrets) &&
    hasAll(requested.egress, approved.egress) &&
    hasAll(requested.data, approved.data)
  );
}

export async function getCapabilityGrant(
  env: Env,
  slug: string,
): Promise<{
  requested: CapabilityDoc;
  approved: CapabilityDoc | null;
  status: string;
  deployId: string | null;
} | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT requested_json, approved_json, status, deploy_id
     FROM site_capability_grants WHERE slug = ?`,
  )
    .bind(slug)
    .first<{
      requested_json: string;
      approved_json: string | null;
      status: string;
      deploy_id: string | null;
    }>();
  if (!row) return null;
  let requested: CapabilityDoc = { secrets: [], egress: [], data: [] };
  let approved: CapabilityDoc | null = null;
  try {
    requested = normalizeCapabilities(JSON.parse(row.requested_json));
  } catch {
    /* keep empty */
  }
  if (row.approved_json) {
    try {
      approved = normalizeCapabilities(JSON.parse(row.approved_json));
    } catch {
      approved = null;
    }
  }
  return {
    requested,
    approved,
    status: row.status,
    deployId: row.deploy_id,
  };
}

export function normalizeCapabilities(raw: unknown): CapabilityDoc {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const caps =
    obj.capabilities && typeof obj.capabilities === "object"
      ? (obj.capabilities as Record<string, unknown>)
      : obj;
  const asList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
      : [];
  return {
    secrets: asList(caps.secrets),
    egress: asList(caps.egress),
    data: asList(caps.data),
  };
}

export async function approveCapabilities(
  env: Env,
  slug: string,
  approvedBy: string,
  approved?: CapabilityDoc | null,
): Promise<CapabilityDoc | null> {
  await ensureDb(env);
  const grant = await getCapabilityGrant(env, slug);
  if (!grant) return null;
  const finalApproved = approved ?? grant.requested;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE site_capability_grants
     SET approved_json = ?, status = 'approved', approved_at = ?, approved_by = ?, updated_at = ?
     WHERE slug = ?`,
  )
    .bind(JSON.stringify(finalApproved), now, approvedBy, now, slug)
    .run();
  return finalApproved;
}
