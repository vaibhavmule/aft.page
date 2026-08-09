import type { Env, SiteMeta } from "./env";
import { resolveSessionUser } from "./auth";
import { authorizeDeployUpdate, authorizeSiteHub } from "./claim";
import {
  deployExists,
  deleteSite,
  getCapabilityGrant,
  getSiteOwnerId,
  getSiteRow,
  insertDeploy,
  listDeployFailuresForSlug,
  listDeploys,
  listSitesByOwner,
  listSitesByMember,
  countSitesByOwner,
  approveCapabilities,
  type CapabilityDoc,
} from "./db";
import { loadViewRollup, viewsForSlug } from "./metrics";
import {
  listSiteLogs,
  loadSiteObservability,
  parseObsWindow,
} from "./site-logs";
import {
  copySiteDeploy,
  deleteDeployObjects,
  deleteSiteObjects,
  getObject,
  listDeployFiles,
  normalizePath,
} from "./storage";
import { corsHeaders, json, privateJson } from "./http";
import { liveSiteUrl } from "./site-url";

const DEFAULT_PAGE_SIZE = 20;
const SOURCE_PREVIEW_MAX = 256 * 1024;
const MAX_PAGE_SIZE = 50;

export async function handleLifecycleRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const origin = request.headers.get("origin");

  if (url.pathname === "/v1/me/sites" && request.method === "GET") {
    return meSites(request, env, url, origin);
  }

  const deploysMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/deploys$/,
  );
  if (deploysMatch && request.method === "GET") {
    return siteDeploys(request, env, deploysMatch[1]!, origin);
  }

  const logsMatch = url.pathname.match(/^\/v1\/sites\/([a-z0-9-]+)\/logs$/);
  if (logsMatch && request.method === "GET") {
    return siteLogs(request, env, logsMatch[1]!, origin);
  }

  const filesMatch = url.pathname.match(/^\/v1\/sites\/([a-z0-9-]+)\/files$/);
  if (filesMatch && request.method === "GET") {
    return siteFiles(request, env, filesMatch[1]!, url, origin);
  }

  const rollbackMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/rollback$/,
  );
  if (rollbackMatch && request.method === "POST") {
    return rollback(request, env, rollbackMatch[1]!, origin);
  }

  const absorbMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/absorb$/,
  );
  if (absorbMatch && request.method === "POST") {
    return absorbSite(request, env, absorbMatch[1]!, origin);
  }

  const capsMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/capabilities$/,
  );
  if (capsMatch && request.method === "GET") {
    return getCaps(request, env, capsMatch[1]!, origin);
  }
  if (capsMatch && request.method === "POST") {
    return approveCaps(request, env, capsMatch[1]!, origin);
  }

  const secretsListMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/secrets$/,
  );
  if (secretsListMatch && request.method === "GET") {
    return listSecrets(request, env, secretsListMatch[1]!, origin);
  }

  const secretMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/secrets\/([A-Za-z0-9_.-]+)$/,
  );
  if (secretMatch && request.method === "PUT") {
    return putSecret(request, env, secretMatch[1]!, secretMatch[2]!, origin);
  }
  if (secretMatch && request.method === "DELETE") {
    return deleteSecret(request, env, secretMatch[1]!, secretMatch[2]!, origin);
  }

  return null;
}

async function meSites(
  request: Request,
  env: Env,
  url: URL,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const user = await resolveSessionUser(env, request);
  if (!user) return privateJson({ error: "unauthorized" }, 401, extra);

  const pageRaw = Number(url.searchParams.get("page") || "1");
  const limitRaw = Number(
    url.searchParams.get("limit") || String(DEFAULT_PAGE_SIZE),
  );
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const [total, sites, shared, views] = await Promise.all([
    countSitesByOwner(env, user.id),
    listSitesByOwner(env, user.id, { limit, offset }),
    listSitesByMember(env, user.id),
    env.SITES
      ? loadViewRollup(env.SITES, 7)
      : Promise.resolve({ today: 0, d7: 0, bySlug: [] }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const root = env.ROOT_DOMAIN || "aft.page";
  const withUrls = <T extends { slug: string }>(s: T) => ({
    ...s,
    views7d: viewsForSlug(views, s.slug).d7,
    url: `https://${s.slug}.${root}`,
    preview: `https://${s.slug}.${root}`,
  });
  return privateJson(
    {
      user: { id: user.id, email: user.email },
      sites: sites.map((s) => withUrls({ ...s, role: "owner" as const })),
      shared: shared.map(withUrls),
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
    200,
    extra,
  );
}

async function siteLogs(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const auth = await authorizeDeployUpdate(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, auth.status, extra);

  const window = parseObsWindow(new URL(request.url).searchParams.get("window"));
  const [events, deployFailures, views, site, observability] = await Promise.all([
    listSiteLogs(env, slug, 100),
    listDeployFailuresForSlug(env, slug, 20),
    env.SITES
      ? loadViewRollup(env.SITES, 7).then((r) => viewsForSlug(r, slug))
      : Promise.resolve({ slug, today: 0, d7: 0 }),
    getSiteRow(env, slug),
    loadSiteObservability(env, slug, window),
  ]);

  return json(
    {
      slug,
      views: { today: views.today, d7: views.d7 },
      lastServedAt: site?.lastServedAt ?? null,
      events,
      deployFailures,
      observability,
    },
    200,
    extra,
  );
}

async function currentDeployId(env: Env, slug: string): Promise<string | null> {
  const site = await getSiteRow(env, slug);
  let deployId = site?.deployId ?? null;
  const raw = await env.SITES.get(`site:${slug}`);
  if (raw) {
    try {
      const meta = JSON.parse(raw) as SiteMeta;
      if (meta.deployId) deployId = meta.deployId;
    } catch {
      /* keep D1 */
    }
  }
  return deployId;
}

async function asArrayBuffer(
  body: ArrayBuffer | ReadableStream,
): Promise<ArrayBuffer> {
  if (body instanceof ReadableStream) return new Response(body).arrayBuffer();
  return body;
}

function decodeText(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf);
  for (const b of bytes) {
    if (b === 0) return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function siteFiles(
  request: Request,
  env: Env,
  slug: string,
  url: URL,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const auth = await authorizeSiteHub(env, request, slug);
  if (!auth.ok) return privateJson({ error: auth.error }, auth.status, extra);

  const requested = (url.searchParams.get("deployId") || "").trim();
  const deployId = requested || (await currentDeployId(env, slug));
  if (!deployId) {
    return privateJson({ slug, deployId: null, files: [] }, 200, extra);
  }
  if (requested && !(await deployExists(env, slug, requested))) {
    return privateJson(
      { error: "not_found", hint: "unknown deployId" },
      404,
      extra,
    );
  }

  const rel = url.searchParams.get("path");
  if (rel == null || rel === "") {
    const files = (await listDeployFiles(env, slug, deployId)).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    return privateJson({ slug, deployId, files }, 200, extra);
  }

  const path = normalizePath(rel);
  if (!path || path.includes("..") || path.includes("\0")) {
    return privateJson({ error: "invalid_path" }, 400, extra);
  }

  const obj = await getObject(env, slug, deployId, path);
  if (!obj) return privateJson({ error: "not_found" }, 404, extra);

  const buf = await asArrayBuffer(obj.body);
  const slice =
    buf.byteLength > SOURCE_PREVIEW_MAX ? buf.slice(0, SOURCE_PREVIEW_MAX) : buf;
  const text = decodeText(slice);
  if (text == null) {
    return privateJson(
      {
        slug,
        deployId,
        path,
        bytes: buf.byteLength,
        contentType: obj.contentType,
        binary: true,
      },
      200,
      extra,
    );
  }
  return privateJson(
    {
      slug,
      deployId,
      path,
      bytes: buf.byteLength,
      contentType: obj.contentType,
      text,
      truncated: buf.byteLength > SOURCE_PREVIEW_MAX,
    },
    200,
    extra,
  );
}

async function siteDeploys(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const auth = await authorizeDeployUpdate(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, auth.status, extra);
  const deploys = await listDeploys(env, slug);
  const raw = await env.SITES.get(`site:${slug}`);
  const current = raw
    ? (JSON.parse(raw) as SiteMeta).deployId
    : null;
  return json({ slug, currentDeployId: current, deploys }, 200, extra);
}

async function rollback(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const auth = await authorizeDeployUpdate(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, auth.status, extra);

  let body: { deployId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }
  const deployId = body.deployId?.trim();
  if (!deployId) {
    return json({ error: "invalid_request", hint: "deployId required" }, 400, extra);
  }
  if (!(await deployExists(env, slug, deployId))) {
    return json({ error: "not_found", hint: "unknown deployId" }, 404, extra);
  }

  const deploys = await listDeploys(env, slug);
  const target = deploys.find((d) => d.id === deployId);
  const createdAt = new Date().toISOString();
  const meta: SiteMeta = {
    deployId,
    createdAt,
    fileCount: target?.fileCount ?? 0,
  };
  await env.SITES.put(`site:${slug}`, JSON.stringify(meta));
  const { upsertSiteRow } = await import("./db");
  await upsertSiteRow(env, slug, deployId);

  const root = env.ROOT_DOMAIN || "aft.page";
  return json(
    {
      ok: true,
      slug,
      deployId,
      url: liveSiteUrl(slug, root),
      rolledBack: true,
    },
    200,
    extra,
  );
}

/**
 * Fold a source site's current deploy into this site's history as a
 * rollback-able version. Owner-only for BOTH sites. Copies the source's files
 * under the target's slug (same deploy id), records a `deploys` row, and
 * optionally destroys the source afterwards. The target's live version is
 * unchanged — the absorbed deploy simply becomes available to roll back to.
 */
async function absorbSite(
  request: Request,
  env: Env,
  targetSlug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const user = await resolveSessionUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401, extra);

  const targetOwner = await getSiteOwnerId(env, targetSlug);
  if (!targetOwner || targetOwner !== user.id) {
    return json({ error: "forbidden" }, 403, extra);
  }

  let body: { source?: string; destroySource?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const source = (body.source || "").trim();
  if (!/^[a-z0-9-]+$/.test(source)) {
    return json(
      { error: "invalid_request", hint: "valid source slug required" },
      400,
      extra,
    );
  }
  if (source === targetSlug) {
    return json(
      { error: "invalid_request", hint: "source and target are the same" },
      400,
      extra,
    );
  }

  const sourceOwner = await getSiteOwnerId(env, source);
  if (!sourceOwner || sourceOwner !== user.id) {
    return json(
      { error: "forbidden", hint: "you must own the source site" },
      403,
      extra,
    );
  }

  const sourceRow = await getSiteRow(env, source);
  if (!sourceRow) {
    return json({ error: "not_found", hint: "source not found" }, 404, extra);
  }

  const sourceDeployId = sourceRow.deployId;
  // deploys.id is a global primary key, so the absorbed version needs a fresh id.
  const deployId = `dep_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  // Self-heal any objects left under the source's deploy id by a prior failed run.
  await deleteDeployObjects(env, targetSlug, sourceDeployId);

  const { files, bytes } = await copySiteDeploy(
    env,
    source,
    sourceDeployId,
    targetSlug,
    deployId,
  );

  await insertDeploy(env, {
    id: deployId,
    slug: targetSlug,
    fileCount: files,
    bytes,
    createdByUserId: user.id,
    source: "absorb",
    createdAt: sourceRow.createdAt,
  });

  let sourceDestroyed = false;
  if (body.destroySource === true) {
    const { releaseCustomDomains } = await import("./custom-domains");
    await releaseCustomDomains(env, source);
    await deleteSite(env, source);
    try {
      await deleteSiteObjects(env, source);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({ level: "error", where: "absorb_cleanup", source, message }),
      );
    }
    sourceDestroyed = true;
  }

  return json(
    { ok: true, target: targetSlug, source, deployId, files, bytes, sourceDestroyed },
    200,
    extra,
  );
}

async function getCaps(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const grant = await getCapabilityGrant(env, slug);
  if (!grant) return json({ slug, capabilities: null }, 200, extra);
  return json(
    {
      slug,
      capabilities: {
        requested: grant.requested,
        approved: grant.approved,
        status: grant.status,
        deployId: grant.deployId,
        summary: formatLines(grant.requested),
      },
    },
    200,
    extra,
  );
}

async function approveCaps(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const user = await resolveSessionUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401, extra);
  const { getSiteOwnerId } = await import("./db");
  const ownerId = await getSiteOwnerId(env, slug);
  if (ownerId !== user.id) {
    return json({ error: "forbidden" }, 403, extra);
  }

  let body: { approved?: CapabilityDoc } = {};
  try {
    if (request.headers.get("content-type")?.includes("json")) {
      body = (await request.json()) as typeof body;
    }
  } catch {
    /* empty body = approve requested as-is */
  }

  const approved = await approveCapabilities(
    env,
    slug,
    user.id,
    body.approved ?? null,
  );
  if (!approved) {
    return json({ error: "not_found", hint: "no pending capabilities" }, 404, extra);
  }
  return json(
    {
      ok: true,
      slug,
      capabilities: {
        approved,
        status: "approved",
        summary: formatLines(approved),
      },
    },
    200,
    extra,
  );
}

function formatLines(caps: CapabilityDoc): string[] {
  const lines: string[] = [];
  for (const s of caps.secrets) lines.push(`secret:${s}`);
  for (const e of caps.egress) lines.push(`egress:${e}`);
  for (const d of caps.data) lines.push(`data:${d}`);
  return lines;
}

async function listSecrets(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const auth = await authorizeDeployUpdate(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, auth.status, extra);
  const { listSiteSecretNames } = await import("./secrets");
  const names = await listSiteSecretNames(env, slug);
  return json({ slug, secrets: names }, 200, extra);
}

async function putSecret(
  request: Request,
  env: Env,
  slug: string,
  name: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const auth = await authorizeDeployUpdate(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, auth.status, extra);

  let body: { value?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }
  const value = body.value;
  if (typeof value !== "string" || value.length === 0 || value.length > 8192) {
    return json(
      { error: "invalid_request", hint: "value string required (1–8192 chars)" },
      400,
      extra,
    );
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    return json({ error: "invalid_secret_name" }, 400, extra);
  }

  const { putSiteSecret } = await import("./secrets");
  await putSiteSecret(env, slug, name, value);
  return json({ ok: true, slug, name }, 200, extra);
}

async function deleteSecret(
  request: Request,
  env: Env,
  slug: string,
  name: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const auth = await authorizeDeployUpdate(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, auth.status, extra);
  const { deleteSiteSecret } = await import("./secrets");
  const ok = await deleteSiteSecret(env, slug, name);
  if (!ok) return json({ error: "not_found" }, 404, extra);
  return json({ ok: true, slug, name }, 200, extra);
}
