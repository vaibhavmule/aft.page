import type { Env } from "./env";
import {
  BRAND,
  BRAND_CSS_VARS,
  BRAND_FONT_LINKS,
  BRAND_WORDMARK_CSS,
} from "./brand";
import {
  createLoginMagicLink,
  createSession,
  findOrCreateUser,
  isValidEmail,
  normalizeEmail,
  randomId,
  randomToken,
  resolveSessionUser,
  sendInviteEmail,
  sendLoginEmail,
  sessionCookieHeader,
  sha256Hex,
} from "./auth";
import {
  acceptSiteInvite,
  createSiteInvite,
  deleteSite,
  deleteSiteInvite,
  findMemberByEmail,
  findPendingInviteByEmail,
  findSiteInviteByTokenHash,
  findUserByEmail,
  getSiteMemberRole,
  getSiteOwnerId,
  getSiteVisibility,
  listSiteInvites,
  listSiteMembers,
  removeSiteMember,
  setSiteActive,
  setSiteVisibility,
  upsertSiteMember,
  type SiteVisibility,
} from "./db";
import { corsHeaders, json, originMayActOnSlug, privateJson } from "./http";
import { rateLimit } from "./rate-limit";
import { clientIp } from "./http";
import { deleteSiteObjects } from "./storage";
import { releaseCustomDomains } from "./custom-domains";

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
  if (siteMatch && request.method === "DELETE") {
    return destroySite(request, env, siteMatch[1]!, origin);
  }

  const accessMatch = url.pathname.match(/^\/v1\/sites\/([a-z0-9-]+)\/access$/);
  if (accessMatch && request.method === "POST") {
    return requestSiteAccess(request, env, accessMatch[1]!, origin);
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

  const memberOneMatch = url.pathname.match(
    /^\/v1\/sites\/([a-z0-9-]+)\/members\/([a-zA-Z0-9_-]+)$/,
  );
  if (memberOneMatch) {
    const slug = memberOneMatch[1]!;
    const userId = memberOneMatch[2]!;
    if (request.method === "DELETE") {
      return revokeMember(request, env, slug, userId, origin);
    }
    if (request.method === "PATCH") {
      return patchMember(request, env, slug, userId, origin);
    }
  }

  return null;
}

export function sharingNeedsCredentials(pathname: string): boolean {
  return (
    pathname.startsWith("/v1/sites/") ||
    pathname === "/v1/invites/accept" ||
    pathname === "/v1/claim/start" ||
    pathname === "/v1/claim/session" ||
    pathname === "/v1/claim/verify"
  );
}

async function requireOwner(
  env: Env,
  request: Request,
  slug: string,
): Promise<{ id: string; email: string } | Response> {
  const root = env.ROOT_DOMAIN || "aft.page";
  if (!originMayActOnSlug(request, slug, root)) {
    return json({ error: "forbidden" }, 403, corsExtra(request));
  }
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

  let body: { visibility?: string; active?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const hasVisibility = body.visibility !== undefined;
  const hasActive = body.active !== undefined;
  if (!hasVisibility && !hasActive) {
    return json(
      { error: "invalid_request", hint: "provide visibility and/or active" },
      400,
      extra,
    );
  }

  if (hasVisibility) {
    if (body.visibility !== "public" && body.visibility !== "private") {
      return json(
        { error: "invalid_request", hint: "visibility must be public or private" },
        400,
        extra,
      );
    }
  }
  if (hasActive && typeof body.active !== "boolean") {
    return json(
      { error: "invalid_request", hint: "active must be true or false" },
      400,
      extra,
    );
  }

  const result: { slug: string; visibility?: string; active?: boolean } = {
    slug,
  };

  if (hasVisibility) {
    const ok = await setSiteVisibility(
      env,
      slug,
      body.visibility as SiteVisibility,
    );
    if (!ok) return json({ error: "not_found" }, 404, extra);
    result.visibility = body.visibility;
  }

  if (hasActive) {
    const ok = await setSiteActive(env, slug, body.active as boolean);
    if (!ok) return json({ error: "not_found" }, 404, extra);
    result.active = body.active;
  }

  return json(result, 200, extra);
}

/** Owner-only, irreversible: wipe the site row, its children, and stored files. */
async function destroySite(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;

  try {
    await releaseCustomDomains(env, slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: "error", where: "destroy_domains", slug, message }),
    );
  }

  const existed = await deleteSite(env, slug);
  if (!existed) {
    return json({ error: "not_found" }, 404, extra);
  }

  try {
    await deleteSiteObjects(env, slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: "error", where: "destroy_site", slug, message }),
    );
  }

  return json({ ok: true, slug }, 200, extra);
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

async function patchMember(
  request: Request,
  env: Env,
  slug: string,
  userId: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, true));
  const owner = await requireOwner(env, request, slug);
  if (owner instanceof Response) return owner;

  let body: { role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }
  const role = body.role === "edit" ? "edit" : body.role === "view" ? "view" : null;
  if (!role) {
    return json({ error: "invalid_request", hint: "role must be view or edit" }, 400, extra);
  }

  const members = await listSiteMembers(env, slug);
  const mem = members.find((m) => m.userId === userId);
  if (!mem) return json({ error: "not_found" }, 404, extra);
  await upsertSiteMember(env, slug, mem.userId, mem.email, role);
  return json({ ok: true, member: { ...mem, role } }, 200, extra);
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
  const liveUrl = `https://${invite.slug}.${root}/`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: liveUrl,
      "Set-Cookie": sessionCookieHeader(env, session.token, session.expiresAt),
    },
  });
}

/** Who may view a private site (or any site when checking access). */
export async function canAccessSite(
  env: Env,
  request: Request,
  slug: string,
): Promise<{
  allowed: boolean;
  role: "owner" | "edit" | "view" | null;
  authenticated: boolean;
}> {
  const visibility = await getSiteVisibility(env, slug);
  if (visibility === "public") {
    return { allowed: true, role: null, authenticated: false };
  }

  const user = await resolveSessionUser(env, request);
  if (!user) return { allowed: false, role: null, authenticated: false };

  const ownerId = await getSiteOwnerId(env, slug);
  if (ownerId && ownerId === user.id) {
    return { allowed: true, role: "owner", authenticated: true };
  }

  const memberRole = await getSiteMemberRole(env, slug, user.id);
  if (memberRole) {
    return { allowed: true, role: memberRole, authenticated: true };
  }

  return { allowed: false, role: null, authenticated: true };
}

/** Shown when logged in but not invited (avoids login redirect loop). */
export function privateDeniedHtml(slug: string, root: string): string {
  const live = `https://${slug}.${root}`;
  const api = `https://api.${root}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="${BRAND.void}"/><title>Private site — aft.page</title>
${BRAND_FONT_LINKS}
<style>
${BRAND_CSS_VARS}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 var(--font-sans);color:var(--ink);background:var(--void);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;-webkit-font-smoothing:antialiased}
main{width:min(24rem,100%)}
${BRAND_WORDMARK_CSS}
.brand{display:inline-block;margin:0 0 1.25rem;font-size:1.15rem}
h1{font-size:1.25rem;margin:0 0 .35rem;font-weight:600}p{color:var(--quiet);margin:0 0 1rem}p strong{color:var(--ink)}
label{display:block;font-size:.82rem;font-weight:600;margin-bottom:.35rem;color:var(--quiet)}
input{width:100%;padding:.65rem .75rem;border:1px solid var(--line-bright);border-radius:4px;font:inherit;background:var(--bg-inset);color:var(--ink)}
input:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px var(--beacon-dim)}
button{margin-top:.75rem;width:100%;border:0;border-radius:4px;padding:.65rem 1rem;font:inherit;font-weight:650;cursor:pointer;background:var(--cta);color:var(--cta-ink);display:inline-flex;align-items:center;justify-content:center;gap:.45rem}
button:hover{background:var(--cta-hover)}button:disabled{opacity:.6;cursor:default}
.msg{margin-top:1rem;padding:.75rem .9rem;border-radius:4px;font-size:.9rem;display:none}
.msg.ok{display:block;background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good)}.msg.err{display:block;background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}
.hint{margin-top:1.25rem;font-size:.85rem;color:var(--quiet)}.hint a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.spinner{width:.9rem;height:.9rem;border-radius:999px;border:2px solid currentColor;border-right-color:transparent;animation:spin .65s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<main>
  <a class="brand" href="https://${root}/">aft<span>.</span>page</a>
  <h1>This site is private</h1>
  <p><strong>${slug}.${root}</strong> is only for people who have been invited. You’re signed in, but this account doesn’t have access yet. Enter your email to request a link, or ask the owner to invite you.</p>
  <form id="form">
    <label for="email">Work email</label>
    <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@company.com"/>
    <button type="submit" id="submit"><span class="label">Send access link</span></button>
  </form>
  <div class="msg" id="msg" role="status"></div>
  <p class="hint">Owner? Manage access from <a href="https://${root}/project/?slug=${encodeURIComponent(slug)}">your project</a>.</p>
</main>
<script>
(function(){
  var API=${JSON.stringify(api)};
  var slug=${JSON.stringify(slug)};
  var form=document.getElementById("form");
  var msg=document.getElementById("msg");
  var submit=document.getElementById("submit");
  var label=submit.querySelector(".label");
  form.addEventListener("submit",async function(e){
    e.preventDefault();
    msg.className="msg"; msg.textContent="";
    submit.disabled=true;
    label.innerHTML='<span class="spinner" aria-hidden="true"></span> Sending…';
    try{
      var res=await fetch(API+"/v1/sites/"+encodeURIComponent(slug)+"/access",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({email:document.getElementById("email").value.trim()})
      });
      var body=await res.json().catch(function(){return {};});
      if(!res.ok){
        msg.className="msg err";
        msg.textContent=body.hint||body.message||body.error||"Could not send email";
        return;
      }
      msg.className="msg ok";
      msg.textContent="If you were invited or already have access, check your email for a link. Otherwise ask the owner to invite you from the project page.";
      form.reset();
    }catch(err){
      msg.className="msg err";
      msg.textContent=String(err);
    }finally{
      submit.disabled=false;
      label.textContent="Send access link";
    }
  });
})();
</script>
</body></html>`;
}

/**
 * Cold hit on a private site: email → resend invite or login magic link.
 * Always returns the same success message (no invite oracle).
 */
async function requestSiteAccess(
  request: Request,
  env: Env,
  slug: string,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, false));
  const visibility = await getSiteVisibility(env, slug);
  if (visibility !== "private") {
    return privateJson(
      { error: "not_private", hint: "This site is public" },
      400,
      extra,
    );
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: "invalid_json" }, 400, extra);
  }

  const email = body.email ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) {
    return privateJson(
      { error: "invalid_request", hint: "valid email required" },
      400,
      extra,
    );
  }

  const ip = clientIp(request);
  if (!(await rateLimit(env, `access:ip:${ip}`, 20, 3600))) {
    return privateJson({ error: "rate_limited" }, 429, extra);
  }
  if (!(await rateLimit(env, `access:email:${email}`, 5, 3600))) {
    return privateJson({ error: "rate_limited" }, 429, extra);
  }

  const root = env.ROOT_DOMAIN || "aft.page";
  const liveUrl = `https://${slug}.${root}`;
  const okMsg = { ok: true, message: "check_your_email" };

  try {
    const pending = await findPendingInviteByEmail(env, slug, email);
    if (pending) {
      await deleteSiteInvite(env, slug, pending.id);
      const id = randomId();
      const token = randomToken("aft_inv_");
      const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:invite:${token}`);
      const expiresAt = new Date(
        Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const ownerId = await getSiteOwnerId(env, slug);
      await createSiteInvite(env, {
        id,
        slug,
        email,
        role: pending.role === "edit" ? "edit" : "view",
        tokenHash,
        invitedBy: ownerId || "system",
        expiresAt,
      });
      await sendInviteEmail(
        env,
        email,
        slug,
        token,
        pending.role === "edit" ? "edit" : "view",
      );
      return privateJson(okMsg, 200, extra);
    }

    const member = await findMemberByEmail(env, slug, email);
    const ownerId = await getSiteOwnerId(env, slug);
    const user = await findUserByEmail(env, email);
    const isOwner = Boolean(user && ownerId && user.id === ownerId);
    if (member || isOwner) {
      const { token } = await createLoginMagicLink(env, email);
      await sendLoginEmail(env, email, token, { next: liveUrl });
      return privateJson(okMsg, 200, extra);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: "error", where: "site_access", message }),
    );
    return privateJson({ error: "email_failed", message }, 503, extra);
  }

  // Same response whether invited or not — no enumeration.
  return privateJson(okMsg, 200, extra);
}
