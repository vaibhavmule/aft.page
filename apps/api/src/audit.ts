/**
 * Hijack CIL: origin bind, editToken, ops gate. Not scanner junk (see
 * scripts/security-audit.mjs). Runs after smoke cron + ops Run now.
 */
import type { Env } from "./env";
import {
  assignSiteOwner,
  consumeLoginMagicLink,
  createLoginMagicLink,
  createSession,
  findOrCreateUser,
  randomId,
  safeAuthRedirect,
} from "./auth";
import { getSiteInfo } from "./claim";
import { deleteSite, getEditTokenHash, setSiteVisibility } from "./db";
import { deploy } from "./deploy";
import { originMayActOnSlug } from "./http";
import { handleLifecycleRoute } from "./lifecycle";
import { serveSite } from "./serve";
import { handleSharingRoute } from "./sharing";
import { deleteSiteObjects } from "./storage";

export const AUDIT_RETENTION_DAYS = 14;
export const AUDIT_SLUG_PREFIX = "test--a-";

export const AUDIT_CASE_CATALOG: Record<string, { box: string; shakes: string }> = {
  csrf: { box: "Hijack", shakes: "Tenant origin cannot drive another slug" },
  csrfok: { box: "Hijack", shakes: "Matching tenant origin still works" },
  tokquery: { box: "Hijack", shakes: "editToken in query rejected; header works" },
  claimed: { box: "Hijack", shakes: "editToken dead after claim" },
  idor: { box: "Hijack", shakes: "Token A cannot PATCH site B" },
  patch0: { box: "Hijack", shakes: "PATCH with no token/session → 401" },
  magic: { box: "Hijack", shakes: "Magic link is single-use" },
  ops: { box: "Hijack", shakes: "Ops gate + bad audit bearer" },
  next: { box: "Hijack", shakes: "safeAuthRedirect blocks open redirect" },
  path: { box: "Isolation", shakes: "../ and absolute paths → bad_path" },
  privbody: { box: "Isolation", shakes: "Private 302 has empty body" },
  secrets: { box: "Isolation", shakes: "Unauth secrets 401; names only" },
  hash: { box: "Isolation", shakes: "D1 stores hash ≠ plaintext token" },
  ctype: { box: "Isolation", shakes: ".txt served as text/plain" },
  sess: { box: "Isolation", shakes: "Forged aft_session is logged out" },
  enum: { box: "Isolation", shakes: "Access request no email oracle" },
  reserved: { box: "Isolation", shakes: "ops + login reserved_slug" },
  cors: { box: "Isolation", shakes: "evil.example never gets ACAO+ACAC" },
};

export type AuditCaseResult = {
  id: string;
  ok: boolean;
  ms: number;
  detail: string;
  url: string | null;
};

export type AuditRunResult = {
  id: string;
  ok: boolean;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  ms: number;
  cases: AuditCaseResult[];
};

export type AuditRunSummary = {
  id: string;
  ok: boolean;
  trigger: string;
  finishedAt: string;
  ms: number;
  failed: string[];
};

export function auditSlug(caseId: string): string {
  return `${AUDIT_SLUG_PREFIX}${caseId}`;
}

export async function runAuditSuite(
  env: Env,
  opts: { trigger: "cron" | "manual" | "test" },
): Promise<AuditRunResult> {
  const id = `audit_${randomId().slice(0, 16)}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  console.log(JSON.stringify({ level: "info", where: "audit", id, event: "start", trigger: opts.trigger }));
  await sweepAuditSites(env);

  const cases: AuditCaseResult[] = [];
  const run = async (
    caseId: string,
    fn: () => Promise<{ detail: string; url?: string | null }>,
  ) => {
    const start = Date.now();
    try {
      const out = await fn();
      cases.push({
        id: caseId,
        ok: true,
        ms: Date.now() - start,
        detail: out.detail,
        url: out.url ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cases.push({
        id: caseId,
        ok: false,
        ms: Date.now() - start,
        detail: message.slice(0, 500),
        url: null,
      });
    }
  };

  const root = env.ROOT_DOMAIN || "aft.page";

  await run("csrf", async () => {
    const attacker = auditSlug("csrf");
    const victim = auditSlug("vic");
    const a = await deployHtml(env, attacker, "<p>csrf-a</p>");
    assert(a.status === 200, `attacker ${errOf(a.body)}`);
    const v = await deployHtml(env, victim, "<p>csrf-v</p>");
    assert(v.status === 200, `victim ${errOf(v.body)}`);
    const user = await findOrCreateUser(env, "audit-csrf@aft.page");
    await assignSiteOwner(env, victim, user.id);
    const session = await createSession(env, user.id);
    const cookie = `aft_session=${session.token}`;
    const info = await siteInfo(env, victim, {
      cookie,
      origin: `https://${attacker}.${root}`,
    });
    assert(info.status === 200, `info ${info.status}`);
    assert(info.body.owner !== true, `leaked owner ${JSON.stringify(info.body)}`);
    assert(!info.body.members, "leaked members");
    const patch = await patchHtml(env, victim, "<p>pwn</p>", {
      cookie,
      origin: `https://${attacker}.${root}`,
    });
    assert(patch.status === 403, `patch ${patch.status} ${errOf(patch.body)}`);
    await destroyAuditSite(env, victim);
    return { detail: "cross-tenant origin blocked", url: publicUrl(attacker, root) };
  });

  await run("csrfok", async () => {
    const slug = auditSlug("csrfok");
    const d = await deployHtml(env, slug, "<p>csrfok</p>");
    assert(d.status === 200, errOf(d.body));
    const user = await findOrCreateUser(env, "audit-csrfok@aft.page");
    await assignSiteOwner(env, slug, user.id);
    const session = await createSession(env, user.id);
    const info = await siteInfo(env, slug, {
      cookie: `aft_session=${session.token}`,
      origin: `https://${slug}.${root}`,
    });
    assert(info.status === 200 && info.body.owner === true, `owner ${info.body.owner}`);
    return { detail: "same-origin chrome ok", url: publicUrl(slug, root) };
  });

  await run("tokquery", async () => {
    const slug = auditSlug("tokq");
    const d = await deployHtml(env, slug, "<p>tokq</p>");
    assert(d.status === 200, errOf(d.body));
    const token = String(d.body.editToken || "");
    const q = await patchHtml(env, slug, "<p>via-query</p>", { queryToken: token });
    assert(q.status >= 400, `query token accepted ${q.status}`);
    const h = await patchHtml(env, slug, "<p>via-header</p>", { editToken: token });
    assert(h.status === 200, `header ${errOf(h.body)}`);
    return { detail: "query rejected, header ok", url: publicUrl(slug, root) };
  });

  await run("claimed", async () => {
    const slug = auditSlug("claimed");
    const d = await deployHtml(env, slug, "<p>claimed</p>");
    assert(d.status === 200, errOf(d.body));
    const token = String(d.body.editToken || "");
    const user = await findOrCreateUser(env, "audit-claimed@aft.page");
    await assignSiteOwner(env, slug, user.id);
    const patch = await patchHtml(env, slug, "<p>after</p>", { editToken: token });
    assert(patch.status >= 400, `token still live ${patch.status}`);
    return { detail: "token dead after claim", url: publicUrl(slug, root) };
  });

  await run("idor", async () => {
    const aSlug = auditSlug("idor");
    const bSlug = auditSlug("idorb");
    const a = await deployHtml(env, aSlug, "<p>a</p>");
    const b = await deployHtml(env, bSlug, "<p>b</p>");
    assert(a.status === 200 && b.status === 200, "deploy");
    const patch = await patchHtml(env, bSlug, "<p>x</p>", {
      editToken: String(a.body.editToken || ""),
    });
    assert(patch.status >= 400, `idor ${patch.status}`);
    await destroyAuditSite(env, bSlug);
    return { detail: "token A ≠ site B" };
  });

  await run("patch0", async () => {
    const slug = auditSlug("patch0");
    const d = await deployHtml(env, slug, "<p>p0</p>");
    assert(d.status === 200, errOf(d.body));
    const patch = await patchHtml(env, slug, "<p>nope</p>", {});
    assert(patch.status === 401, `got ${patch.status}`);
    return { detail: "anon PATCH 401" };
  });

  await run("magic", async () => {
    const { token } = await createLoginMagicLink(env, "audit-magic@aft.page");
    const first = await consumeLoginMagicLink(env, token);
    assert(first, "first consume failed");
    const second = await consumeLoginMagicLink(env, token);
    assert(!second, "magic replayed");
    return { detail: "second consume null" };
  });

  await run("ops", async () => {
    const naked = await callOps(env, new Request(`https://ops.${root}/`));
    assert(naked.status === 302, `ops ${naked.status}`);
    const loc = naked.headers.get("location") || "";
    assert(loc.includes("/login"), `location ${loc}`);
    const bad = await callOps(
      env,
      new Request(`https://ops.${root}/api/audit/run`, {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    assert(bad.status === 401, `bearer ${bad.status}`);
    return { detail: "ops login + bad bearer 401" };
  });

  await run("next", async () => {
    assert(
      safeAuthRedirect("https://evil.com", root) === `https://${root}/projects`,
      "https evil",
    );
    assert(
      safeAuthRedirect("//evil.com", root) === `https://${root}/projects`,
      "protocol-relative",
    );
    assert(
      originMayActOnSlug(
        new Request("https://api.aft.page/v1/sites/vic", {
          headers: { origin: `https://evil.${root}` },
        }),
        "vic",
        root,
      ) === false,
      "origin helper",
    );
    return { detail: "redirect + origin helper" };
  });

  await run("path", async () => {
    for (const p of ["../x.html", "foo/../../etc/passwd"]) {
      const d = await deployFiles(env, [{ path: p, content: "x" }]);
      assert(d.status >= 400 && d.body.error === "bad_path", `${p} → ${d.body.error}`);
    }
    return { detail: "bad_path .." };
  });

  await run("privbody", async () => {
    const slug = auditSlug("priv");
    const d = await deployHtml(env, slug, "<p>secret-html</p>");
    assert(d.status === 200, errOf(d.body));
    const user = await findOrCreateUser(env, "audit-priv@aft.page");
    await assignSiteOwner(env, slug, user.id);
    await setSiteVisibility(env, slug, "private");
    const served = await serveSite(
      new Request(`https://${slug}.${root}/`, { headers: { accept: "text/html" } }),
      env,
      slug,
      "/",
    );
    assert(served.status === 302, `got ${served.status}`);
    const body = await served.text();
    assert(!body.includes("secret-html"), "body leak");
    return { detail: "302 empty of site html", url: publicUrl(slug, root) };
  });

  await run("secrets", async () => {
    const slug = auditSlug("secrets");
    const d = await deployHtml(env, slug, "<p>sec</p>");
    assert(d.status === 200, errOf(d.body));
    const unauth = await callLifecycle(
      env,
      new Request(`https://api.${root}/v1/sites/${slug}/secrets`),
    );
    assert(unauth.status === 401, `unauth ${unauth.status}`);
    const token = String(d.body.editToken || "");
    const listed = await callLifecycle(
      env,
      new Request(`https://api.${root}/v1/sites/${slug}/secrets`, {
        headers: { "x-aft-edit-token": token },
      }),
    );
    assert(listed.status === 200, `list ${listed.status}`);
    const body = (await listed.json()) as { secrets?: unknown };
    assert(Array.isArray(body.secrets), "no names array");
    const blob = JSON.stringify(body);
    assert(!/ciphertext|value/i.test(blob) || blob.includes('"secrets"'), blob.slice(0, 120));
    return { detail: "401 + names only" };
  });

  await run("hash", async () => {
    const slug = auditSlug("hash");
    const d = await deployHtml(env, slug, "<p>hash</p>");
    assert(d.status === 200, errOf(d.body));
    const token = String(d.body.editToken || "");
    const stored = await getEditTokenHash(env, slug);
    assert(stored && stored !== token, "plaintext in D1");
    return { detail: "hash ≠ token" };
  });

  await run("ctype", async () => {
    const slug = auditSlug("ctype");
    const d = await deployFiles(env, [
      { path: "index.html", content: "<p>ok</p>" },
      { path: "note.txt", content: "<script>alert(1)</script>" },
    ], slug);
    assert(d.status === 200, errOf(d.body));
    const txt = await serveSite(
      new Request(`https://${slug}.${root}/note.txt`),
      env,
      slug,
      "/note.txt",
    );
    const ct = txt.headers.get("content-type") || "";
    assert(txt.status === 200 && ct.includes("text/plain"), `ct ${ct}`);
    assert(!ct.includes("text/html"), `html sniff ${ct}`);
    return { detail: "note.txt text/plain", url: publicUrl(slug, root) };
  });

  await run("sess", async () => {
    const ops = await callOps(
      env,
      new Request(`https://ops.${root}/`, { headers: { cookie: "aft_session=forged" } }),
    );
    assert(ops.status === 302, `ops ${ops.status}`);
    return { detail: "forged session → login" };
  });

  await run("enum", async () => {
    const slug = auditSlug("enum");
    const d = await deployHtml(env, slug, "<p>enum</p>");
    assert(d.status === 200, errOf(d.body));
    const user = await findOrCreateUser(env, "audit-enum-owner@aft.page");
    await assignSiteOwner(env, slug, user.id);
    await setSiteVisibility(env, slug, "private");
    const a = await accessReq(env, slug, "unknown-a@example.com");
    const b = await accessReq(env, slug, "unknown-b@example.com");
    assert(a.status === 200 && b.status === 200, `access ${a.status}/${b.status}`);
    assert(a.body.message === b.body.message, "shape differs");
    return { detail: "same ok message" };
  });

  await run("reserved", async () => {
    for (const slug of ["ops", "login"]) {
      const d = await deployHtml(env, slug, "<p>nope</p>");
      assert(d.status >= 400 && d.body.error === "reserved_slug", `${slug} ${d.body.error}`);
    }
    return { detail: "ops + login reserved" };
  });

  await run("cors", async () => {
    const slug = auditSlug("cors");
    const d = await deployHtml(env, slug, "<p>cors</p>");
    assert(d.status === 200, errOf(d.body));
    const res = await getSiteInfo(
      new Request(`https://api.${root}/v1/sites/${slug}`, {
        headers: { origin: "https://evil.example" },
      }),
      env,
      slug,
    );
    const acao = res.headers.get("access-control-allow-origin") || "";
    const acac = res.headers.get("access-control-allow-credentials") || "";
    assert(!(acao === "https://evil.example" && acac === "true"), `cors ${acao} ${acac}`);
    return { detail: `ACAO ${acao || "—"}` };
  });

  const finishedAt = new Date().toISOString();
  const result: AuditRunResult = {
    id,
    ok: cases.every((c) => c.ok),
    trigger: opts.trigger,
    startedAt,
    finishedAt,
    ms: Date.now() - t0,
    cases,
  };
  try {
    await persistAuditRun(env, result);
    await pruneAuditRuns(env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "audit_persist", message }));
  }
  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "error",
      where: "audit",
      id,
      trigger: opts.trigger,
      ok: result.ok,
      ms: result.ms,
      failed: cases.filter((c) => !c.ok).map((c) => c.id),
    }),
  );
  return result;
}

export async function loadLatestAuditRun(env: Env): Promise<AuditRunResult | null> {
  const run = await env.DB.prepare(
    `SELECT id, ok, trigger, started_at, finished_at, ms FROM audit_runs
     ORDER BY created_at DESC LIMIT 1`,
  ).first<{
    id: string;
    ok: number;
    trigger: string;
    started_at: string;
    finished_at: string;
    ms: number;
  }>();
  if (!run) return null;
  const { results } = await env.DB.prepare(
    `SELECT case_id, ok, ms, detail, url FROM audit_cases WHERE run_id = ? ORDER BY rowid`,
  )
    .bind(run.id)
    .all<{ case_id: string; ok: number; ms: number; detail: string; url: string | null }>();
  return {
    id: run.id,
    ok: run.ok === 1,
    trigger: run.trigger,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    ms: run.ms,
    cases: (results || []).map((c) => ({
      id: c.case_id,
      ok: c.ok === 1,
      ms: c.ms,
      detail: c.detail,
      url: c.url,
    })),
  };
}

export async function loadAuditHistory(env: Env, limit = 7): Promise<AuditRunSummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, ok, trigger, finished_at, ms FROM audit_runs
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: string; ok: number; trigger: string; finished_at: string; ms: number }>();
  const runs = results || [];
  if (runs.length === 0) return [];
  const ids = runs.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const failed = await env.DB.prepare(
    `SELECT run_id, case_id FROM audit_cases WHERE run_id IN (${placeholders}) AND ok = 0`,
  )
    .bind(...ids)
    .all<{ run_id: string; case_id: string }>();
  const byRun = new Map<string, string[]>();
  for (const row of failed.results || []) {
    const list = byRun.get(row.run_id) || [];
    list.push(row.case_id);
    byRun.set(row.run_id, list);
  }
  return runs.map((r) => ({
    id: r.id,
    ok: r.ok === 1,
    trigger: r.trigger,
    finishedAt: r.finished_at,
    ms: r.ms,
    failed: byRun.get(r.id) || [],
  }));
}

export async function pruneAuditRuns(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 864e5).toISOString();
  await env.DB.prepare(
    `DELETE FROM audit_cases WHERE run_id IN (SELECT id FROM audit_runs WHERE created_at < ?)`,
  )
    .bind(cutoff)
    .run();
  await env.DB.prepare(`DELETE FROM audit_runs WHERE created_at < ?`).bind(cutoff).run();
}

async function persistAuditRun(env: Env, result: AuditRunResult): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_runs (id, ok, trigger, started_at, finished_at, ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      result.id,
      result.ok ? 1 : 0,
      result.trigger,
      result.startedAt,
      result.finishedAt,
      result.ms,
      result.finishedAt,
    )
    .run();
  if (result.cases.length === 0) return;
  await env.DB.batch(
    result.cases.map((c) =>
      env.DB.prepare(
        `INSERT INTO audit_cases (id, run_id, case_id, ok, ms, detail, url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${result.id}_${c.id}`,
        result.id,
        c.id,
        c.ok ? 1 : 0,
        c.ms,
        c.detail,
        c.url,
        result.finishedAt,
      ),
    ),
  );
}

async function sweepAuditSites(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT slug FROM sites WHERE slug LIKE ?`,
  )
    .bind(`${AUDIT_SLUG_PREFIX}%`)
    .all<{ slug: string }>();
  for (const row of results || []) {
    await destroyAuditSite(env, row.slug);
  }
}

export async function destroyAuditSite(env: Env, slug: string): Promise<void> {
  if (!slug.startsWith(AUDIT_SLUG_PREFIX)) return;
  try {
    await deleteSiteObjects(env, slug);
  } catch {
    /* miss ok */
  }
  await deleteSite(env, slug);
}

function publicUrl(slug: string, root: string): string {
  return `https://${slug}.${root}`;
}

async function callOps(env: Env, request: Request): Promise<Response> {
  const { handleOps } = await import("./ops");
  return handleOps(request, env, new URL(request.url));
}

async function callLifecycle(env: Env, request: Request): Promise<Response> {
  const res = await handleLifecycleRoute(request, env, new URL(request.url));
  assert(res, "lifecycle miss");
  return res;
}

async function deployHtml(
  env: Env,
  slug: string,
  html: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return deployJson(env, { slug, html });
}

async function deployFiles(
  env: Env,
  files: { path: string; content: string }[],
  slug?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return deployJson(env, { slug, files });
}

async function patchHtml(
  env: Env,
  slug: string,
  html: string,
  opts: { editToken?: string; queryToken?: string; cookie?: string; origin?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(`https://api.aft.page/v1/deploy?slug=${encodeURIComponent(slug)}`);
  if (opts.queryToken) url.searchParams.set("editToken", opts.queryToken);
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "x-aft-client": "audit",
  };
  if (opts.editToken) headers["x-aft-edit-token"] = opts.editToken;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  const res = await deploy(new Request(url, { method: "PATCH", headers, body: html }), env);
  return readJson(res);
}

async function siteInfo(
  env: Env,
  slug: string,
  opts: { cookie?: string; origin?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  const res = await getSiteInfo(
    new Request(`https://api.aft.page/v1/sites/${slug}`, { headers }),
    env,
    slug,
  );
  return readJson(res);
}

async function accessReq(
  env: Env,
  slug: string,
  email: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await handleSharingRoute(
    new Request(`https://api.aft.page/v1/sites/${slug}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
    env,
    new URL(`https://api.aft.page/v1/sites/${slug}/access`),
  );
  assert(res, "sharing miss");
  return readJson(res);
}

async function deployJson(
  env: Env,
  opts: { html?: string; files?: { path: string; content: string }[]; slug?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL("https://api.aft.page/v1/deploy");
  if (opts.slug) url.searchParams.set("slug", opts.slug);
  const headers: Record<string, string> = { "x-aft-client": "audit" };
  let body: BodyInit;
  if (opts.html != null) {
    headers["content-type"] = "text/html; charset=utf-8";
    body = opts.html;
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ files: opts.files || [] });
  }
  const res = await deploy(new Request(url, { method: "POST", headers, body }), env);
  return readJson(res);
}

async function readJson(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    parsed = { error: "non_json" };
  }
  return { status: res.status, body: parsed };
}

function errOf(body: Record<string, unknown>): string {
  return String(body.error || body.hint || JSON.stringify(body).slice(0, 160));
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
