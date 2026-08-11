import type { Env } from "./env";
import { BRAND } from "./brand";
import { clearSiteEditTokenHash, ensureDb } from "./db";
import { cookieDomain } from "./http";

const SESSION_DAYS = 30;
const MAGIC_LINK_MINUTES = 15;

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}

export function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}${b64}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function verifyEditToken(
  env: Env,
  slug: string,
  editToken: string,
  storedHash: string | null,
): Promise<boolean> {
  if (!editToken || !storedHash) return false;
  const hash = await sha256Hex(`${env.AUTH_SECRET}:${slug}:${editToken}`);
  return timingSafeEqual(hash, storedHash);
}

export async function hashEditToken(
  env: Env,
  slug: string,
  editToken: string,
): Promise<string> {
  return sha256Hex(`${env.AUTH_SECRET}:${slug}:${editToken}`);
}

export async function createMagicLink(
  env: Env,
  slug: string,
  email: string,
): Promise<{ token: string; id: string }> {
  await ensureDb(env);
  const id = randomId();
  const token = randomToken("aft_magic_");
  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:magic:${token}`);
  const expiresAt = new Date(
    Date.now() + MAGIC_LINK_MINUTES * 60 * 1000,
  ).toISOString();
  await env.DB.prepare(
    `INSERT INTO magic_links (id, token_hash, slug, email, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  )
    .bind(id, tokenHash, slug, email, expiresAt)
    .run();
  return { token, id };
}

/** Sentinel slug for login magic links (not a real site). */
export const LOGIN_MAGIC_SLUG = "_login";

/** Prod D1 has magic_links.slug → sites(slug) FK; ensure sentinel row exists. */
export async function ensureLoginSentinelSite(env: Env): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO sites (slug, deploy_id, owner_user_id, visibility, created_at, updated_at)
     VALUES (?, 'system-login', NULL, 'public', ?, ?)
     ON CONFLICT(slug) DO NOTHING`,
  )
    .bind(LOGIN_MAGIC_SLUG, now, now)
    .run();
}

export async function createLoginMagicLink(
  env: Env,
  email: string,
): Promise<{ token: string; id: string }> {
  await ensureLoginSentinelSite(env);
  return createMagicLink(env, LOGIN_MAGIC_SLUG, email);
}

export async function consumeLoginMagicLink(
  env: Env,
  token: string,
): Promise<MagicLinkRow | null> {
  return consumeMagicLink(env, token, LOGIN_MAGIC_SLUG);
}

export type MagicLinkRow = {
  id: string;
  token_hash: string;
  slug: string;
  email: string;
  expires_at: string;
  used_at: string | null;
};

export async function consumeMagicLink(
  env: Env,
  token: string,
  slug: string,
): Promise<MagicLinkRow | null> {
  await ensureDb(env);
  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:magic:${token}`);
  const row = await env.DB.prepare(
    `SELECT id, token_hash, slug, email, expires_at, used_at
     FROM magic_links WHERE token_hash = ? AND slug = ?`,
  )
    .bind(tokenHash, slug)
    .first<MagicLinkRow>();
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  await env.DB.prepare(`UPDATE magic_links SET used_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), row.id)
    .run();
  return row;
}

export async function findOrCreateUser(
  env: Env,
  email: string,
): Promise<{ id: string; email: string }> {
  await ensureDb(env);
  const existing = await env.DB.prepare(`SELECT id, email FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string; email: string }>();
  if (existing) return existing;
  const id = `usr_${randomId().slice(0, 16)}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`)
    .bind(id, email, now)
    .run();
  return { id, email };
}

export async function assignSiteOwner(
  env: Env,
  slug: string,
  userId: string,
): Promise<boolean> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT owner_user_id FROM sites WHERE slug = ?`,
  )
    .bind(slug)
    .first<{ owner_user_id: string | null }>();
  if (!row) return false;
  if (row.owner_user_id && row.owner_user_id !== userId) return false;
  await env.DB.prepare(
    `UPDATE sites SET owner_user_id = ?, updated_at = ?,
        active = CASE WHEN owner_user_id IS NULL THEN 1 ELSE active END
     WHERE slug = ? AND (owner_user_id IS NULL OR owner_user_id = ?)`,
  )
    .bind(userId, new Date().toISOString(), slug, userId)
    .run();
  if (!row.owner_user_id) await clearSiteEditTokenHash(env, slug);
  return true;
}

export async function createSession(
  env: Env,
  userId: string,
): Promise<{ token: string; expiresAt: string }> {
  await ensureDb(env);
  const id = randomId();
  const token = randomToken("aft_sess_");
  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:session:${token}`);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, tokenHash, expiresAt, now)
    .run();
  return { token, expiresAt };
}

export function sessionCookieHeader(
  env: Env,
  token: string,
  expiresAt: string,
): string {
  const maxAge = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / 1000,
  );
  return `aft_session=${token}; Path=/; Domain=${cookieDomain(env)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader(env: Env): string {
  return `aft_session=; Path=/; Domain=${cookieDomain(env)}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function parseSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)aft_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Cookie or `Authorization: Bearer <aft_sess_…>` (CLI). */
export function parseSessionToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  if (bearer?.[1]) return bearer[1];
  return parseSessionCookie(request);
}

/** Allow /path or https://{slug}.aft.page/... — never open redirects. */
export function safeAuthRedirect(next: string, root: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) {
    return `https://${root}${next}`;
  }
  try {
    const u = new URL(next);
    if (u.protocol !== "https:") return `https://${root}/projects`;
    const host = u.hostname.toLowerCase();
    if (host === root || host.endsWith(`.${root}`)) {
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return `https://${root}/projects`;
}

export async function resolveSessionUser(
  env: Env,
  request: Request,
): Promise<{ id: string; email: string } | null> {
  const token = parseSessionToken(request);
  if (!token) return null;
  await ensureDb(env);
  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:session:${token}`);
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.expires_at, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string; email: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { id: row.user_id, email: row.email };
}

export async function sendClaimEmail(
  env: Env,
  to: string,
  slug: string,
  magicToken: string,
): Promise<void> {
  if (!env.EMAIL) {
    throw new Error("EMAIL binding not configured");
  }
  const root = env.ROOT_DOMAIN || "aft.page";
  const verifyUrl = new URL(`https://api.${root}/v1/claim/verify`);
  verifyUrl.searchParams.set("token", magicToken);
  verifyUrl.searchParams.set("slug", slug);
  const liveUrl = `https://${slug}.${root}`;

  const subject = "Claim your site on aft.page";
  const text = [
    `Claim ${liveUrl} on aft.page.`,
    "",
    `Open this link within 15 minutes:`,
    verifyUrl.toString(),
    "",
    `After claiming, manage the site at ${liveUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0d1117">
<p>Claim <strong>${liveUrl}</strong> on aft.page.</p>
<p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:${BRAND.ctaInk};color:${BRAND.cta};text-decoration:none;border-radius:6px;font-weight:600">Claim this site</a></p>
<p style="color:#4a5568;font-size:14px">This link expires in 15 minutes. If you didn't deploy this site, ignore this email.</p>
</body></html>`;

  await env.EMAIL.send({
    to,
    from: { email: `claim@${root}`, name: "aft.page" },
    subject,
    text,
    html,
  });
}

export async function sendLoginEmail(
  env: Env,
  to: string,
  magicToken: string,
  opts?: { next?: string },
): Promise<void> {
  if (!env.EMAIL) {
    throw new Error("EMAIL binding not configured");
  }
  const root = env.ROOT_DOMAIN || "aft.page";
  const verifyUrl = new URL(`https://api.${root}/v1/auth/verify`);
  verifyUrl.searchParams.set("token", magicToken);
  if (opts?.next) {
    verifyUrl.searchParams.set("next", opts.next);
  }
  const after =
    opts?.next && opts.next.startsWith("http")
      ? opts.next
      : `https://${root}${opts?.next?.startsWith("/") ? opts.next : "/projects"}`;

  // Access framing when returning to a private site / preview — not "create account".
  const isAccess =
    Boolean(opts?.next) &&
    (/^https:\/\/[a-z0-9.-]+\.aft\.page(?:\/|$)/i.test(opts!.next!) ||
      /\/preview\?/.test(opts!.next!));
  const subject = isAccess ? "Access your aft.page site" : "Log in to aft.page";
  const lead = isAccess
    ? "Use this link to access your private aft.page site."
    : "Log in to aft.page.";
  const cta = isAccess ? "Continue" : "Log in";
  const text = [
    lead,
    "",
    `Open this link within 15 minutes:`,
    verifyUrl.toString(),
    "",
    `Then: ${after}`,
  ].join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0d1117">
<p>${lead}</p>
<p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:${BRAND.ctaInk};color:${BRAND.cta};text-decoration:none;border-radius:6px;font-weight:600">${cta}</a></p>
<p style="color:#4a5568;font-size:14px">This link expires in 15 minutes. No password or signup — just this email. If you didn't request this, ignore it.</p>
</body></html>`;

  await env.EMAIL.send({
    to,
    from: { email: `claim@${root}`, name: "aft.page" },
    subject,
    text,
    html,
  });
}

export async function sendInviteEmail(
  env: Env,
  to: string,
  slug: string,
  inviteToken: string,
  role: "view" | "edit",
): Promise<void> {
  if (!env.EMAIL) {
    throw new Error("EMAIL binding not configured");
  }
  const root = env.ROOT_DOMAIN || "aft.page";
  const acceptUrl = new URL(`https://api.${root}/v1/invites/accept`);
  acceptUrl.searchParams.set("token", inviteToken);
  const liveUrl = `https://${slug}.${root}`;
  const access =
    role === "edit" ? "view and edit" : "view";

  const subject = `You're invited to ${slug}.${root}`;
  const text = [
    `You've been invited to ${access} ${liveUrl} on aft.page.`,
    "",
    `Open this link within 7 days:`,
    acceptUrl.toString(),
    "",
    `If you weren't expecting this, ignore this email.`,
  ].join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0d1117">
<p>You've been invited to <strong>${access}</strong> <strong>${liveUrl}</strong> on aft.page.</p>
<p><a href="${acceptUrl}" style="display:inline-block;padding:12px 20px;background:${BRAND.ctaInk};color:${BRAND.cta};text-decoration:none;border-radius:6px;font-weight:600">Accept invite</a></p>
<p style="color:#4a5568;font-size:14px">This link expires in 7 days.</p>
</body></html>`;

  await env.EMAIL.send({
    to,
    from: { email: `claim@${root}`, name: "aft.page" },
    subject,
    text,
    html,
  });
}
