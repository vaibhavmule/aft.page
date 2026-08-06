import type { Env } from "./env";
import { trackClaim } from "./metrics";
import {
  assignSiteOwner,
  consumeMagicLink,
  createMagicLink,
  createSession,
  findOrCreateUser,
  isValidEmail,
  normalizeEmail,
  resolveSessionUser,
  sendClaimEmail,
  sessionCookieHeader,
  verifyEditToken,
} from "./auth";
import {
  getEditTokenHash,
  getSiteMemberRole,
  getSiteOwnerId,
  getSiteRow,
  getSiteVisibility,
  listSiteInvites,
  listSiteMembers,
  getCapabilityGrant,
  listDeploys,
} from "./db";
import { clientIp, corsHeaders, json, optionsResponse, privateJson } from "./http";
import { rateLimit } from "./rate-limit";

export async function handleClaimRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const origin = request.headers.get("origin");
  const creds = true;

  if (request.method === "OPTIONS") {
    return optionsResponse(origin, creds);
  }

  if (url.pathname === "/v1/claim/start" && request.method === "POST") {
    return claimStart(request, env, origin, creds);
  }

  if (url.pathname === "/v1/claim/session" && request.method === "POST") {
    return claimSession(request, env, origin, creds);
  }

  if (url.pathname === "/v1/claim/verify" && request.method === "GET") {
    return claimVerify(request, env, url);
  }

  return json({ error: "not_found" }, 404);
}

async function claimStart(
  request: Request,
  env: Env,
  origin: string | null,
  creds: boolean,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, creds));

  let body: { slug?: string; email?: string; editToken?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const slug = body.slug?.toLowerCase();
  const email = body.email ? normalizeEmail(body.email) : "";
  const editToken = body.editToken?.trim() || "";

  if (!slug || !isValidEmail(email) || !editToken) {
    return json(
      { error: "invalid_request", hint: "slug, email, editToken required" },
      400,
      extra,
    );
  }

  const ip = clientIp(request);
  if (!(await rateLimit(env, `claim:ip:${ip}`, 20, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }
  if (!(await rateLimit(env, `claim:email:${email}`, 5, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }

  const storedHash = await getEditTokenHash(env, slug);
  if (!(await verifyEditToken(env, slug, editToken, storedHash))) {
    return json({ error: "unauthorized" }, 401, extra);
  }

  const ownerId = await getSiteOwnerId(env, slug);
  if (ownerId) {
    return json({ error: "already_claimed" }, 409, extra);
  }

  const { token: magicToken } = await createMagicLink(env, slug, email);

  try {
    await sendClaimEmail(env, email, slug, magicToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: "error", where: "claim_email", message }),
    );
    return json({ error: "email_failed", message }, 503, extra);
  }

  return json({ ok: true, message: "check_your_email" }, 200, extra);
}

/** Claim (or confirm ownership) using the logged-in session — no second email. */
async function claimSession(
  request: Request,
  env: Env,
  origin: string | null,
  creds: boolean,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, creds));
  const user = await resolveSessionUser(env, request);
  if (!user) {
    return privateJson({ error: "unauthorized" }, 401, extra);
  }

  let body: { slug?: string; editToken?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: "invalid_json" }, 400, extra);
  }

  const slug = body.slug?.toLowerCase();
  const editToken = body.editToken?.trim() || "";
  if (!slug) {
    return privateJson(
      { error: "invalid_request", hint: "slug required" },
      400,
      extra,
    );
  }

  const ownerId = await getSiteOwnerId(env, slug);
  if (ownerId && ownerId === user.id) {
    return privateJson(
      { ok: true, slug, already: true, email: user.email },
      200,
      extra,
    );
  }
  if (ownerId) {
    return privateJson({ error: "already_claimed" }, 409, extra);
  }

  if (!editToken) {
    return privateJson(
      {
        error: "edit_token_required",
        hint: "Open the deploy preview link that includes ?token= to claim",
      },
      400,
      extra,
    );
  }

  const storedHash = await getEditTokenHash(env, slug);
  if (!(await verifyEditToken(env, slug, editToken, storedHash))) {
    return privateJson({ error: "unauthorized" }, 401, extra);
  }

  const ip = clientIp(request);
  if (!(await rateLimit(env, `claim:ip:${ip}`, 20, 3600))) {
    return privateJson({ error: "rate_limited" }, 429, extra);
  }

  const ok = await assignSiteOwner(env, slug, user.id);
  if (!ok) {
    return privateJson({ error: "already_claimed" }, 409, extra);
  }

  trackClaim(env, request, slug, user.id);
  return privateJson({ ok: true, slug, email: user.email }, 200, extra);
}

async function claimVerify(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const token = url.searchParams.get("token") || "";
  const slug = url.searchParams.get("slug")?.toLowerCase() || "";

  if (!token || !slug) {
    return json({ error: "invalid_request" }, 400);
  }

  const row = await consumeMagicLink(env, token, slug);
  if (!row) {
    return json({ error: "invalid_or_expired_token" }, 400);
  }

  const user = await findOrCreateUser(env, row.email);
  const assigned = await assignSiteOwner(env, slug, user.id);
  if (!assigned) {
    return json({ error: "already_claimed" }, 409);
  }

  const session = await createSession(env, user.id);
  const root = env.ROOT_DOMAIN || "aft.page";
  const liveUrl = `https://${slug}.${root}`;
  const redirect = new URL(`https://${root}/preview`);
  redirect.searchParams.set("url", liveUrl);
  redirect.searchParams.set("claimed", "1");

  trackClaim(env, request, slug, user.id);

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect.toString(),
      "Set-Cookie": sessionCookieHeader(env, session.token, session.expiresAt),
    },
  });
}

export async function getSiteInfo(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const origin = request.headers.get("origin");
  const extra = Object.fromEntries(corsHeaders(origin, true));

  const root = env.ROOT_DOMAIN || "aft.page";
  const siteRow = await getSiteRow(env, slug);
  const raw = await env.SITES.get(`site:${slug}`);
  if (!siteRow && !raw) {
    return privateJson({ error: "not_found" }, 404, extra);
  }

  const ownerId = siteRow?.ownerUserId ?? (await getSiteOwnerId(env, slug));
  const visibility =
    siteRow?.visibility ?? (await getSiteVisibility(env, slug));
  const user = await resolveSessionUserSafe(env, request);
  const owned = Boolean(ownerId);
  const owner = Boolean(user && ownerId && user.id === ownerId);
  let role: "owner" | "edit" | "view" | null = null;
  if (owner) role = "owner";
  else if (user) {
    const memberRole = await getSiteMemberRole(env, slug, user.id);
    if (memberRole) role = memberRole;
  }

  const liveUrl = `https://${slug}.${root}`;
  const payload: Record<string, unknown> = {
    slug,
    owned,
    owner,
    visibility,
    role,
    email: user?.email ?? null,
    url: liveUrl,
    preview: `https://${root}/preview?url=${encodeURIComponent(liveUrl)}`,
    manage: `https://${root}/project/?slug=${encodeURIComponent(slug)}`,
    createdAt: siteRow?.createdAt ?? null,
    updatedAt: siteRow?.updatedAt ?? null,
    lastServedAt: siteRow?.lastServedAt ?? null,
    deployId: siteRow?.deployId ?? null,
  };

  if (owner || role === "edit" || role === "view") {
    payload.members = await listSiteMembers(env, slug);
    payload.invites = await listSiteInvites(env, slug);
    payload.deploys = await listDeploys(env, slug, 20);
    const caps = await getCapabilityGrant(env, slug);
    if (caps) {
      payload.capabilities = {
        requested: caps.requested,
        approved: caps.approved,
        status: caps.status,
        deployId: caps.deployId,
      };
    }
  }

  if (raw) {
    try {
      const meta = JSON.parse(raw) as { deployId?: string };
      if (meta.deployId) payload.deployId = meta.deployId;
    } catch {
      /* keep D1 deployId */
    }
  }

  return privateJson(payload, 200, extra);
}

async function resolveSessionUserSafe(
  env: Env,
  request: Request,
): Promise<{ id: string; email: string } | null> {
  return resolveSessionUser(env, request);
}

export async function authorizeDeployUpdate(
  env: Env,
  request: Request,
  slug: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const editToken =
    request.headers.get("x-aft-edit-token") ||
    new URL(request.url).searchParams.get("editToken") ||
    "";

  if (editToken) {
    const storedHash = await getEditTokenHash(env, slug);
    if (await verifyEditToken(env, slug, editToken, storedHash)) {
      return { ok: true };
    }
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const { resolveSessionUser } = await import("./auth");
  const user = await resolveSessionUser(env, request);
  if (!user) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const ownerId = await getSiteOwnerId(env, slug);
  if (ownerId === user.id) {
    return { ok: true };
  }
  const memberRole = await getSiteMemberRole(env, slug, user.id);
  if (memberRole === "edit") {
    return { ok: true };
  }
  return { ok: false, status: 403, error: "forbidden" };
}
