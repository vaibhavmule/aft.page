import type { Env, SiteMeta } from "./env";
import { resolveSessionUser } from "./auth";
import { authorizeDeployUpdate } from "./claim";
import {
  deployExists,
  getCapabilityGrant,
  listDeploys,
  listSitesByOwner,
  countSitesByOwner,
  approveCapabilities,
  type CapabilityDoc,
} from "./db";
import { corsHeaders, json, privateJson } from "./http";

const DEFAULT_PAGE_SIZE = 20;
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

  const rollbackMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/rollback$/,
  );
  if (rollbackMatch && request.method === "POST") {
    return rollback(request, env, rollbackMatch[1]!, origin);
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

  const [total, sites] = await Promise.all([
    countSitesByOwner(env, user.id),
    listSitesByOwner(env, user.id, { limit, offset }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const root = env.ROOT_DOMAIN || "aft.page";
  return privateJson(
    {
      user: { id: user.id, email: user.email },
      sites: sites.map((s) => ({
        ...s,
        url: `https://${s.slug}.${root}`,
        preview: `https://${root}/preview?url=${encodeURIComponent(`https://${s.slug}.${root}`)}`,
      })),
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
      url: `https://${slug}.${root}`,
      rolledBack: true,
    },
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
