/**
 * Connector v0 — outbound poll agent + capability-gated invoke.
 */
import type { Env } from "./env";
import { resolveSessionUser, sha256Hex, randomId, randomToken } from "./auth";
import {
  getCapabilityGrant,
  getSiteOwnerId,
  insertConnector,
  findConnectorByTokenHash,
  touchConnectorSeen,
  getLatestConnectorForSlug,
  createConnectorInvoke,
  claimNextPendingInvoke,
  completeConnectorInvoke,
  getConnectorInvoke,
} from "./db";
import { corsHeaders, json } from "./http";
import { canAccessSite } from "./sharing";

const ONLINE_MS = 60_000;
const MAX_POLL_WAIT_S = 25;

export function connectorNeedsCredentials(pathname: string): boolean {
  return (
    pathname.includes("/connector/tokens") ||
    pathname.includes("/connector/invoke") ||
    pathname.includes("/connector/invokes/") ||
    /^\/v1\/sites\/[^/]+\/connector$/.test(pathname)
  );
}

export async function handleConnectorRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const origin = request.headers.get("origin");

  if (url.pathname === "/v1/connector/poll" && request.method === "GET") {
    return poll(request, env, url);
  }

  const resultMatch = url.pathname.match(
    /^\/v1\/connector\/result\/([a-zA-Z0-9_-]+)$/,
  );
  if (resultMatch && request.method === "POST") {
    return postResult(request, env, resultMatch[1]!);
  }

  const tokensMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/connector\/tokens$/,
  );
  if (tokensMatch && request.method === "POST") {
    return mintToken(request, env, tokensMatch[1]!, origin);
  }

  const invokeMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/connector\/invoke$/,
  );
  if (invokeMatch && request.method === "POST") {
    return invoke(request, env, invokeMatch[1]!, origin);
  }

  const invokeGetMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/connector\/invokes\/([a-zA-Z0-9_-]+)$/,
  );
  if (invokeGetMatch && request.method === "GET") {
    return getInvoke(request, env, invokeGetMatch[1]!, invokeGetMatch[2]!, origin);
  }

  const statusMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/connector$/,
  );
  if (statusMatch && request.method === "GET") {
    return connectorStatus(request, env, statusMatch[1]!, origin);
  }

  return null;
}

async function mintToken(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const user = await resolveSessionUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401, extra);
  const ownerId = await getSiteOwnerId(env, slug);
  if (ownerId !== user.id) {
    return json({ error: "forbidden" }, 403, extra);
  }

  let label: string | null = null;
  try {
    if (request.headers.get("content-type")?.includes("json")) {
      const body = (await request.json()) as { label?: string };
      label = body.label?.trim() || null;
    }
  } catch {
    /* empty ok */
  }

  const id = randomId();
  const token = randomToken("aft_conn_");
  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:connector:${token}`);
  await insertConnector(env, { id, slug, tokenHash, label });

  return json(
    {
      ok: true,
      slug,
      connectorId: id,
      token,
      hint: "Store the token; it is shown once. Set AFT_CONNECTOR_TOKEN and run the connector agent.",
    },
    200,
    extra,
  );
}

async function resolveConnector(
  env: Env,
  request: Request,
): Promise<{ id: string; slug: string } | null> {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1]!.trim();
  if (!token) return null;
  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:connector:${token}`);
  const row = await findConnectorByTokenHash(env, tokenHash);
  if (!row) return null;
  await touchConnectorSeen(env, row.id);
  return { id: row.id, slug: row.slug };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function poll(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const conn = await resolveConnector(env, request);
  if (!conn) {
    return json({ error: "unauthorized" }, 401);
  }

  let waitS = Number(url.searchParams.get("wait") || "0");
  if (!Number.isFinite(waitS) || waitS < 0) waitS = 0;
  waitS = Math.min(waitS, MAX_POLL_WAIT_S);

  const deadline = Date.now() + waitS * 1000;
  for (;;) {
    const job = await claimNextPendingInvoke(env, conn.slug);
    if (job) {
      let payload: unknown = {};
      try {
        payload = JSON.parse(job.payload_json);
      } catch {
        payload = {};
      }
      return json({
        id: job.id,
        slug: job.slug,
        capability: job.capability,
        payload,
      });
    }
    if (Date.now() >= deadline) {
      return new Response(null, { status: 204 });
    }
    await sleep(500);
    await touchConnectorSeen(env, conn.id);
  }
}

async function postResult(
  request: Request,
  env: Env,
  invokeId: string,
): Promise<Response> {
  const conn = await resolveConnector(env, request);
  if (!conn) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { ok?: boolean; result?: unknown; error?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const ok = body.ok !== false;
  const done = await completeConnectorInvoke(env, {
    id: invokeId,
    slug: conn.slug,
    ok,
    result: body.result,
    error: body.error,
  });
  if (!done) {
    return json({ error: "not_found", hint: "unknown or already completed invoke" }, 404);
  }
  return json({ ok: true, id: invokeId, status: ok ? "done" : "error" });
}

/** Capability currently enforced at the connector edge (Week 3). */
export const ENFORCED_DATA_CAPABILITY = "expenses:read";

async function invoke(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const access = await canAccessSite(env, request, slug);
  if (!access.allowed) {
    return json({ error: "forbidden" }, 403, extra);
  }

  let body: { capability?: string; action?: string; args?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const capability = (body.capability || "").trim();
  if (!capability) {
    return json(
      { error: "invalid_request", hint: "capability required" },
      400,
      extra,
    );
  }

  const grant = await getCapabilityGrant(env, slug);
  if (!grant || grant.status !== "approved" || !grant.approved) {
    return json(
      {
        error: "capability_not_approved",
        hint: "Owner must approve aft.json capabilities before connector invokes",
        capability,
      },
      403,
      extra,
    );
  }
  if (!grant.approved.data.includes(capability)) {
    return json(
      {
        error: "capability_denied",
        hint: `Capability ${capability} is not in the approved grant`,
        capability,
        approved: grant.approved.data,
      },
      403,
      extra,
    );
  }

  // v0: only expenses:read is executable; others are recorded but denied at invoke.
  if (capability !== ENFORCED_DATA_CAPABILITY) {
    return json(
      {
        error: "capability_not_enforced",
        hint: `Connector v0 only enforces ${ENFORCED_DATA_CAPABILITY}`,
        capability,
      },
      403,
      extra,
    );
  }

  const id = randomId();
  await createConnectorInvoke(env, {
    id,
    slug,
    capability,
    payload: {
      action: body.action || "list",
      args: body.args ?? null,
    },
  });

  const conn = await getLatestConnectorForSlug(env, slug);
  const online = isConnectorOnline(conn?.last_seen_at ?? null);

  return json(
    {
      id,
      slug,
      capability,
      status: "pending",
      connectorOnline: online,
    },
    202,
    extra,
  );
}

async function getInvoke(
  request: Request,
  env: Env,
  slug: string,
  invokeId: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const access = await canAccessSite(env, request, slug);
  if (!access.allowed) {
    return json({ error: "forbidden" }, 403, extra);
  }

  const row = await getConnectorInvoke(env, invokeId);
  if (!row || row.slug !== slug) {
    return json({ error: "not_found" }, 404, extra);
  }

  let result: unknown = null;
  if (row.result_json) {
    try {
      result = JSON.parse(row.result_json);
    } catch {
      result = row.result_json;
    }
  }

  return json(
    {
      id: row.id,
      slug: row.slug,
      capability: row.capability,
      status: row.status,
      result,
      error: row.error,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    },
    200,
    extra,
  );
}

async function connectorStatus(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const access = await canAccessSite(env, request, slug);
  if (!access.allowed) {
    return json({ error: "forbidden" }, 403, extra);
  }

  const conn = await getLatestConnectorForSlug(env, slug);
  const grant = await getCapabilityGrant(env, slug);
  const online = isConnectorOnline(conn?.last_seen_at ?? null);

  return json(
    {
      slug,
      registered: Boolean(conn),
      online,
      lastSeenAt: conn?.last_seen_at ?? null,
      connectorId: conn?.id ?? null,
      capabilities: grant
        ? {
            status: grant.status,
            approved: grant.approved,
          }
        : null,
      enforced: [ENFORCED_DATA_CAPABILITY],
    },
    200,
    extra,
  );
}

function isConnectorOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ONLINE_MS;
}
