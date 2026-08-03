import type { Env } from "./env";
import {
  createSession,
  findOrCreateUser,
  isValidEmail,
  normalizeEmail,
  randomId,
  randomToken,
  resolveSessionUser,
  sendInviteEmail,
  sessionCookieHeader,
  sha256Hex,
} from "./auth";
import {
  acceptSiteInvite,
  createSiteInvite,
  deleteSiteInvite,
  findSiteInviteByTokenHash,
  getSiteMemberRole,
  getSiteOwnerId,
  getSiteVisibility,
  listSiteInvites,
  listSiteMembers,
  removeSiteMember,
  setSiteVisibility,
  upsertSiteMember,
  type SiteVisibility,
} from "./db";
import { corsHeaders, json } from "./http";
import { rateLimit } from "./rate-limit";
import { clientIp } from "./http";

const INVITE_DAYS = 7;

export async function handleSharingRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const origin = request.headers.get("origin");

  const inviteAccept =
    url.pathname === "/v1/invites/accept" && request.method === "GET";
  if (inviteAccept) {
    return acceptInvite(request, env, url);
  }

  const siteMatch = url.pathname.match(/^\/v1\/sites\/([a-z0-9-]+)$/);
  if (siteMatch && request.method === "PATCH") {
    return patchSite(request, env, siteMatch[1]!, origin);
  }

  const inviteListMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/invites$/,
  );
  if (inviteListMatch) {
    const slug = inviteListMatch[1]!;
    if (request.method === "GET") {
      return listInvites(request, env, slug, origin);
    }
    if (request.method === "POST") {
      return createInvite(request, env, slug, origin);
    }
  }

  const inviteDeleteMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/invites\/([a-zA-Z0-9_-]+)$/,
  );
  if (inviteDeleteMatch && request.method === "DELETE") {
    return revokeInvite(
      request,
      env,
      inviteDeleteMatch[1]!,
      inviteDeleteMatch[2]!,
      origin,
    );
  }

  const membersMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/members$/,
  );
  if (membersMatch && request.method === "GET") {
    return listMembers(request, env, membersMatch[1]!, origin);
  }

  const memberDeleteMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/members\/([a-zA-Z0-9_-]+)$/,
  );
  if (memberDeleteMatch && request.method === "DELETE") {
    return revokeMember(
      request,
      env,
      memberDeleteMatch[1]!,
      memberDeleteMatch[2]!,
      origin,
    );
  }

  return null;
}

export function sharingNeedsCredentials(pathname: string): boolean {
  return (
    pathname.startsWith("/v1/sites/") ||
    pathname === "/v1/invites/accept" ||
    pathname === "/v1/claim/start" ||
    pathname === "/v1/claim/verify"
  );
}

async function requireOwner(
  env: Env,
  request: Request,
  slug: string,
): Promise<{ id: string; email: string } | Response> {
  const user = await resolveSessionUser(env, request);
  if (!user) {
    return json({ error: "unauthorized" }, 401, corsExtra(request));
  }
  const ownerId = await getSiteOwnerId(env, slug);
  if (!ownerId || ownerId !== user.id) {
    return json({ error: "forbidden" }, 403, corsExtra(request));
  }
  return user;
}

function corsExtra(request: Request): Record<string, string> {
  return Object.fromEntries(corsHeaders(request.headers.get("origin"), true));
}

async function patchSite(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;

  let body: { visibility?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const visibility = body.visibility;
  if (visibility !== "public" && visibility !== "private") {
    return json(
      { error: "invalid_request", hint: "visibility must be public or private" },
      400,
      extra,
    );
  }

  const ok = await setSiteVisibility(env, slug, visibility as SiteVisibility);
  if (!ok) {
    return json({ error: "not_found" }, 404, extra);
  }

  return json({ slug, visibility }, 200, extra);
}

async function listMembers(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;
  const members = await listSiteMembers(env, slug);
  return json({ members }, 200, extra);
}

async function listInvites(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;
  const invites = await listSiteInvites(env, slug);
  return json({ invites }, 200, extra);
}

async function createInvite(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;

  let body: { email?: string; role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const email = body.email ? normalizeEmail(body.email) : "";
  const role = body.role === "edit" ? "edit" : "view";
  if (!isValidEmail(email)) {
    return json({ error: "invalid_request", hint: "valid email required" }, 400, extra);
  }

  if (email === owner.email) {
    return json({ error: "invalid_request", hint: "cannot invite yourself" }, 400, extra);
  }

  const ip = clientIp(request);
  if (!(await rateLimit(env, `invite:ip:${ip}`, 30, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }
  if (!(await rateLimit(env, `invite:slug:${slug}`, 40, 3600))) {
    return json({ error: "rate_limited" }, 429, extra);
  }

  const id = randomId();
  const token = randomToken("aft_inv_");
  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:invite:${token}`);
  const expiresAt = new Date(
    Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await createSiteInvite(env, {
    id,
    slug,
    email,
    role,
    tokenHash,
    invitedBy: owner.id,
    expiresAt,
  });

  try {
    await sendInviteEmail(env, email, slug, token, role);
  } catch (err) {
    await deleteSiteInvite(env, slug, id);
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "invite_email", message }));
    return json({ error: "email_failed", message }, 503, extra);
  }

  return json(
    { ok: true, invite: { id, email, role, expiresAt } },
    200,
    extra,
  );
}

async function revokeInvite(
  request: Request,
  env: Env,
  slug: string,
  inviteId: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;
  const ok = await deleteSiteInvite(env, slug, inviteId);
  if (!ok) return json({ error: "not_found" }, 404, extra);
  return json({ ok: true }, 200, extra);
}

async function revokeMember(
  request: Request,
  env: Env,
  slug: string,
  userId: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;
  const ok = await removeSiteMember(env, slug, userId);
  if (!ok) return json({ error: "not_found" }, 404, extra);
  return json({ ok: true }, 200, extra);
}

async function acceptInvite(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const token = url.searchParams.get("token") || "";
  if (!token) {
    return json({ error: "invalid_request" }, 400);
  }

  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:invite:${token}`);
  const invite = await findSiteInviteByTokenHash(env, tokenHash);
  if (!invite || invite.accepted_at) {
    return json({ error: "invalid_or_expired_token" }, 400);
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: "invalid_or_expired_token" }, 400);
  }

  const role = invite.role === "edit" ? "edit" : "view";
  const user = await findOrCreateUser(env, normalizeEmail(invite.email));
  await upsertSiteMember(env, invite.slug, user.id, user.email, role);
  await acceptSiteInvite(env, invite.id);

  // Auto-private when first invite is accepted if still public? Keep owner-controlled.
  const session = await createSession(env, user.id);
  const root = env.ROOT_DOMAIN || "aft.page";
  const liveUrl = `https://${invite.slug}.${root}`;
  const redirect = new URL(`https://${root}/preview`);
  redirect.searchParams.set("url", liveUrl);
  redirect.searchParams.set("invited", "1");

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect.toString(),
      "Set-Cookie": sessionCookieHeader(env, session.token, session.expiresAt),
    },
  });
}

/** Who may view a private site (or any site when checking access). */
export async function canAccessSite(
  env: Env,
  request: Request,
  slug: string,
): Promise<{ allowed: boolean; role: "owner" | "edit" | "view" | null }> {
  const visibility = await getSiteVisibility(env, slug);
  if (visibility === "public") {
    return { allowed: true, role: null };
  }

  const user = await resolveSessionUser(env, request);
  if (!user) return { allowed: false, role: null };

  const ownerId = await getSiteOwnerId(env, slug);
  if (ownerId && ownerId === user.id) {
    return { allowed: true, role: "owner" };
  }

  const memberRole = await getSiteMemberRole(env, slug, user.id);
  if (memberRole) {
    return { allowed: true, role: memberRole };
  }

  return { allowed: false, role: null };
}

export function privateDeniedHtml(slug: string, root: string): string {
  const preview = `https://${root}/preview?url=${encodeURIComponent(`https://${slug}.${root}`)}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Private site — aft.page</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1.25rem;color:#0d1117;line-height:1.5}
h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#4a5568}a{color:#c44a0f}</style></head><body>
<h1>This site is private</h1>
<p><strong>${slug}.${root}</strong> is only visible to people who have been invited.</p>
<p>If you were invited, open the link in your email. Owners can manage access from <a href="${preview}">preview</a>.</p>
</body></html>`;
}
