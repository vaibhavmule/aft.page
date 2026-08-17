/**
 * Custom hostnames for claimed sites via Cloudflare for SaaS.
 */
import { parseCsvLower, type Env } from "./env";
import { resolveSessionUser } from "./auth";
import { ensureDb, getSiteOwnerId, getSiteRow } from "./db";
import { corsHeaders, json, originMayActOnSlug, privateJson } from "./http";
import { clientIp } from "./http";
import { rateLimit } from "./rate-limit";

export const MAX_CUSTOM_DOMAINS = 2;

export type CustomDomainStatus = "pending" | "active" | "error";

export type DomainAccess = "none" | "requested" | "approved";

export type CustomDomain = {
  hostname: string;
  slug: string;
  status: CustomDomainStatus;
  cfId: string | null;
  txtName: string | null;
  txtValue: string | null;
  sslStatus: string | null;
  error: string | null;
  cname: string;
  createdAt: string;
  updatedAt: string;
};

export function cnameTarget(env: Env): string {
  return (
    env.CUSTOM_DOMAIN_CNAME || `cname.${env.ROOT_DOMAIN || "aft.page"}`
  ).toLowerCase();
}

export function parseHostname(
  raw: string,
  root = "aft.page",
): string | null {
  let h = (raw || "").trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith("http://") || h.startsWith("https://")) {
    try {
      h = new URL(h).hostname;
    } catch {
      return null;
    }
  }
  h = h.replace(/\.$/, "").split("/")[0]!.split(":")[0]!;
  if (h.length < 4 || h.length > 253) return null;
  if (
    !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      h,
    )
  ) {
    return null;
  }
  const zone = (root || "aft.page").toLowerCase();
  if (h === zone || h.endsWith(`.${zone}`)) return null;
  return h;
}

export async function slugForCustomHost(
  env: Env,
  host: string,
): Promise<string | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT slug FROM custom_domains WHERE hostname = ?`,
  )
    .bind(host.toLowerCase())
    .first<{ slug: string }>();
  return row?.slug ?? null;
}

export async function handleCustomDomainRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const accessMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/domains\/access$/,
  );
  if (accessMatch) {
    if (request.method === "POST") {
      return requestDomainAccess(request, env, accessMatch[1]!);
    }
    return null;
  }
  const listMatch = url.pathname.match(/^\/v1\/sites\/([a-z0-9-]+)\/domains$/);
  if (listMatch) {
    const slug = listMatch[1]!;
    if (request.method === "GET") return listDomains(request, env, slug);
    if (request.method === "POST") return addDomain(request, env, slug);
    return null;
  }
  const oneMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/domains\/([^/]+)$/,
  );
  if (oneMatch) {
    const slug = oneMatch[1]!;
    const hostname = decodeURIComponent(oneMatch[2]!).toLowerCase();
    if (request.method === "DELETE") {
      return removeDomain(request, env, slug, hostname);
    }
    if (request.method === "POST") {
      return refreshDomain(request, env, slug, hostname);
    }
    return null;
  }
  return null;
}

async function requireOwner(
  request: Request,
  env: Env,
  slug: string,
  extra: Record<string, string>,
): Promise<{ id: string; email: string } | Response> {
  const root = env.ROOT_DOMAIN || "aft.page";
  if (!originMayActOnSlug(request, slug, root)) {
    return json({ error: "forbidden" }, 403, extra);
  }
  const user = await resolveSessionUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401, extra);
  const ownerId = await getSiteOwnerId(env, slug);
  if (!ownerId || ownerId !== user.id) {
    return json({ error: "forbidden" }, 403, extra);
  }
  const site = await getSiteRow(env, slug);
  if (!site) return json({ error: "not_found" }, 404, extra);
  return user;
}

function isOpsUser(env: Env, email: string): boolean {
  return parseCsvLower(env.OPS_EMAILS).includes(email.trim().toLowerCase());
}

export async function domainAccessForUser(
  env: Env,
  user: { id: string; email: string },
): Promise<DomainAccess> {
  if (isOpsUser(env, user.email)) return "approved";
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT custom_domains FROM users WHERE id = ?`,
  )
    .bind(user.id)
    .first<{ custom_domains: string | null }>();
  const v = (row?.custom_domains || "").toLowerCase();
  if (v === "approved" || v === "requested") return v;
  return "none";
}

export async function setUserCustomDomains(
  env: Env,
  userId: string,
  access: "approved" | "requested",
): Promise<boolean> {
  await ensureDb(env);
  const row = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(userId)
    .first();
  if (!row) return false;
  await env.DB.prepare(`UPDATE users SET custom_domains = ? WHERE id = ?`)
    .bind(access, userId)
    .run();
  return true;
}

async function requestDomainAccess(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const extra = Object.fromEntries(
    corsHeaders(request.headers.get("origin"), true),
  );
  const owner = await requireOwner(request, env, slug, extra);
  if (owner instanceof Response) return owner;
  const current = await domainAccessForUser(env, owner);
  if (current === "approved") {
    return privateJson({ ok: true, access: "approved" }, 200, extra);
  }
  await setUserCustomDomains(env, owner.id, "requested");
  return privateJson({ ok: true, access: "requested" }, 200, extra);
}

async function listDomains(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const extra = Object.fromEntries(
    corsHeaders(request.headers.get("origin"), true),
  );
  const owner = await requireOwner(request, env, slug, extra);
  if (owner instanceof Response) return owner;

  const access = await domainAccessForUser(env, owner);
  const rows = await listDomainRows(env, slug);
  const refreshed = [];
  for (const row of rows) {
    if (row.cfId && row.status !== "active") {
      refreshed.push(await syncFromCf(env, row));
    } else {
      refreshed.push(toPublic(env, row));
    }
  }
  return privateJson(
    { slug, cname: cnameTarget(env), access, domains: refreshed },
    200,
    extra,
  );
}

async function addDomain(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const extra = Object.fromEntries(
    corsHeaders(request.headers.get("origin"), true),
  );
  const owner = await requireOwner(request, env, slug, extra);
  if (owner instanceof Response) return owner;
  if ((await domainAccessForUser(env, owner)) !== "approved") {
    return json(
      {
        error: "domain_gated",
        hint: "Custom domains are invite-only. Request access from the Domain tab.",
      },
      403,
      extra,
    );
  }

  const ip = clientIp(request);
  if (!(await rateLimit(env, `domain:ip:${ip}`, 20, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }
  if (!(await rateLimit(env, `domain:user:${owner.id}`, 10, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }

  let body: { hostname?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }
  const root = env.ROOT_DOMAIN || "aft.page";
  const hostname = parseHostname(body.hostname || "", root);
  if (!hostname) {
    return json(
      {
        error: "invalid_hostname",
        hint: "Use a hostname you own, like app.example.com",
      },
      400,
      extra,
    );
  }

  const existing = await getDomainRow(env, hostname);
  if (existing) {
    if (existing.slug !== slug) {
      return json({ error: "hostname_taken" }, 409, extra);
    }
    const synced = existing.cfId
      ? await syncFromCf(env, existing)
      : toPublic(env, await provisionCf(env, existing));
    return privateJson({ ok: true, domain: synced }, 200, extra);
  }

  const count = await countDomains(env, slug);
  if (count >= MAX_CUSTOM_DOMAINS) {
    return json(
      {
        error: "limit",
        hint: `At most ${MAX_CUSTOM_DOMAINS} custom domains per site`,
      },
      400,
      extra,
    );
  }

  const now = new Date().toISOString();
  const row: DomainRow = {
    hostname,
    slug,
    status: "pending",
    cfId: null,
    cfRouteId: null,
    txtName: null,
    txtValue: null,
    sslStatus: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await insertDomainRow(env, row);
  const provisioned = await provisionCf(env, row);
  return privateJson({ ok: true, domain: toPublic(env, provisioned) }, 200, extra);
}

async function removeDomain(
  request: Request,
  env: Env,
  slug: string,
  hostname: string,
): Promise<Response> {
  const extra = Object.fromEntries(
    corsHeaders(request.headers.get("origin"), true),
  );
  const owner = await requireOwner(request, env, slug, extra);
  if (owner instanceof Response) return owner;

  const row = await getDomainRow(env, hostname);
  if (!row || row.slug !== slug) {
    return json({ error: "not_found" }, 404, extra);
  }
  await deleteCfHostname(env, row);
  await deleteDomainRow(env, hostname);
  return privateJson({ ok: true, hostname }, 200, extra);
}

async function refreshDomain(
  request: Request,
  env: Env,
  slug: string,
  hostname: string,
): Promise<Response> {
  const extra = Object.fromEntries(
    corsHeaders(request.headers.get("origin"), true),
  );
  const owner = await requireOwner(request, env, slug, extra);
  if (owner instanceof Response) return owner;

  const row = await getDomainRow(env, hostname);
  if (!row || row.slug !== slug) {
    return json({ error: "not_found" }, 404, extra);
  }
  const next = row.cfId
    ? await syncFromCf(env, row)
    : toPublic(env, await provisionCf(env, row));
  return privateJson({ ok: true, domain: next }, 200, extra);
}

export async function releaseCustomDomains(
  env: Env,
  slug: string,
): Promise<void> {
  const rows = await listDomainRows(env, slug);
  for (const row of rows) {
    await deleteCfHostname(env, row);
  }
}

type DomainRow = {
  hostname: string;
  slug: string;
  status: CustomDomainStatus;
  cfId: string | null;
  cfRouteId: string | null;
  txtName: string | null;
  txtValue: string | null;
  sslStatus: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

function toPublic(env: Env, row: DomainRow): CustomDomain {
  return {
    hostname: row.hostname,
    slug: row.slug,
    status: row.status,
    cfId: row.cfId,
    txtName: row.txtName,
    txtValue: row.txtValue,
    sslStatus: row.sslStatus,
    error: row.error,
    cname: cnameTarget(env),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listDomainRows(env: Env, slug: string): Promise<DomainRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT hostname, slug, status, cf_id, cf_route_id, txt_name, txt_value, ssl_status, error,
            created_at, updated_at
     FROM custom_domains WHERE slug = ? ORDER BY created_at`,
  )
    .bind(slug)
    .all<{
      hostname: string;
      slug: string;
      status: string;
      cf_id: string | null;
      cf_route_id: string | null;
      txt_name: string | null;
      txt_value: string | null;
      ssl_status: string | null;
      error: string | null;
      created_at: string;
      updated_at: string;
    }>();
  return (results || []).map(fromSql);
}

async function getDomainRow(
  env: Env,
  hostname: string,
): Promise<DomainRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT hostname, slug, status, cf_id, cf_route_id, txt_name, txt_value, ssl_status, error,
            created_at, updated_at
     FROM custom_domains WHERE hostname = ?`,
  )
    .bind(hostname)
    .first<{
      hostname: string;
      slug: string;
      status: string;
      cf_id: string | null;
      cf_route_id: string | null;
      txt_name: string | null;
      txt_value: string | null;
      ssl_status: string | null;
      error: string | null;
      created_at: string;
      updated_at: string;
    }>();
  return row ? fromSql(row) : null;
}

async function countDomains(env: Env, slug: string): Promise<number> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM custom_domains WHERE slug = ?`,
  )
    .bind(slug)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

async function insertDomainRow(env: Env, row: DomainRow): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO custom_domains
      (hostname, slug, status, cf_id, cf_route_id, txt_name, txt_value, ssl_status, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.hostname,
      row.slug,
      row.status,
      row.cfId,
      row.cfRouteId,
      row.txtName,
      row.txtValue,
      row.sslStatus,
      row.error,
      row.createdAt,
      row.updatedAt,
    )
    .run();
}

async function saveDomainRow(env: Env, row: DomainRow): Promise<void> {
  await ensureDb(env);
  row.updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE custom_domains
     SET status = ?, cf_id = ?, cf_route_id = ?, txt_name = ?, txt_value = ?, ssl_status = ?,
         error = ?, updated_at = ?
     WHERE hostname = ?`,
  )
    .bind(
      row.status,
      row.cfId,
      row.cfRouteId,
      row.txtName,
      row.txtValue,
      row.sslStatus,
      row.error,
      row.updatedAt,
      row.hostname,
    )
    .run();
}

async function deleteDomainRow(env: Env, hostname: string): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(`DELETE FROM custom_domains WHERE hostname = ?`)
    .bind(hostname)
    .run();
}

function fromSql(row: {
  hostname: string;
  slug: string;
  status: string;
  cf_id: string | null;
  cf_route_id: string | null;
  txt_name: string | null;
  txt_value: string | null;
  ssl_status: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}): DomainRow {
  const status: CustomDomainStatus =
    row.status === "active" || row.status === "error" ? row.status : "pending";
  return {
    hostname: row.hostname,
    slug: row.slug,
    status,
    cfId: row.cf_id,
    cfRouteId: row.cf_route_id,
    txtName: row.txt_name,
    txtValue: row.txt_value,
    sslStatus: row.ssl_status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type CfHostname = {
  id?: string;
  status?: string;
  ssl?: { status?: string };
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
  pattern?: string;
  script?: string;
};

function cfReady(env: Env): boolean {
  return Boolean(env.CF_API_TOKEN && env.CF_ZONE_ID);
}

async function cfApi(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
): Promise<{
  ok: boolean;
  status: number;
  result: CfHostname | null;
  errors: { code: number; message: string }[];
}> {
  if (!cfReady(env)) {
    return {
      ok: false,
      status: 0,
      result: null,
      errors: [{ code: 0, message: "cf_not_configured" }],
    };
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}${path}`,
    {
      method,
      headers: {
        authorization: `Bearer ${env.CF_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  let parsed: {
    success?: boolean;
    result?: CfHostname;
    errors?: { code: number; message: string }[];
  } = {};
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    parsed = { success: false, errors: [{ code: res.status, message: "cf_bad_json" }] };
  }
  return {
    ok: Boolean(parsed.success),
    status: res.status,
    result: parsed.result ?? null,
    errors: parsed.errors || [],
  };
}

function applyCf(row: DomainRow, cf: CfHostname): DomainRow {
  const ssl = cf.ssl?.status || null;
  const hostStatus = (cf.status || "").toLowerCase();
  const sslOk = !ssl || ssl === "active" || ssl === "pending_deployment";
  let status: CustomDomainStatus = "pending";
  if (hostStatus === "active" && sslOk) status = "active";
  else if (
    hostStatus === "moved" ||
    hostStatus === "deleted" ||
    hostStatus === "blocked"
  ) {
    status = "error";
  }
  const ov = cf.ownership_verification;
  return {
    ...row,
    cfId: cf.id || row.cfId,
    status,
    sslStatus: ssl,
    txtName: ov?.name || row.txtName,
    txtValue: ov?.value || row.txtValue,
    error: (cf.verification_errors || []).filter(Boolean).join("; ") || null,
  };
}

async function provisionCf(env: Env, row: DomainRow): Promise<DomainRow> {
  if (!cfReady(env)) {
    row.error =
      "Cloudflare for SaaS is not enabled on aft.page yet. Your CNAME is fine — HTTPS cannot issue until SSL for SaaS + fallback origin are Active.";
    row.status = "pending";
    await saveDomainRow(env, row);
    return row;
  }
  const created = await cfApi(env, "POST", "/custom_hostnames", {
    hostname: row.hostname,
    ssl: {
      method: "http",
      type: "dv",
      settings: { min_tls_version: "1.2", http2: "on" },
    },
    // ponytail: custom_metadata is enterprise-only (CF 1413 on Free SaaS). Slug lives in D1.
  });
  if (!created.ok || !created.result) {
    const raw =
      created.errors.map((e) => e.message).join("; ") || "cf_create_failed";
    const saasDenied = created.errors.some((e) => e.code === 1456);
    const msg = saasDenied
      ? "Cloudflare for SaaS is not enabled on aft.page yet. Your CNAME is fine — enable Custom Hostnames + fallback cname.aft.page, then Refresh."
      : raw;
    row.error = msg;
    row.status = "pending";
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "custom_domain_create",
        hostname: row.hostname,
        message: msg,
      }),
    );
    await saveDomainRow(env, row);
    return row;
  }
  // Zone route */* (wrangler.jsonc) matches custom hostnames. Per-host routes get wiped on deploy.
  const next = applyCf(row, created.result);
  await saveDomainRow(env, next);
  return next;
}

async function syncFromCf(env: Env, row: DomainRow): Promise<CustomDomain> {
  if (!row.cfId || !cfReady(env)) return toPublic(env, row);
  const got = await cfApi(env, "GET", `/custom_hostnames/${row.cfId}`);
  if (!got.ok || !got.result) return toPublic(env, row);
  const next = applyCf(row, got.result);
  await saveDomainRow(env, next);
  return toPublic(env, next);
}

async function deleteCfHostname(env: Env, row: DomainRow): Promise<void> {
  if (!cfReady(env)) return;
  if (row.cfRouteId) {
    await cfApi(env, "DELETE", `/workers/routes/${row.cfRouteId}`);
  }
  if (!row.cfId) return;
  const del = await cfApi(env, "DELETE", `/custom_hostnames/${row.cfId}`);
  if (!del.ok && del.status !== 404) {
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "custom_domain_delete",
        hostname: row.hostname,
        message: del.errors.map((e) => e.message).join("; "),
      }),
    );
  }
}
