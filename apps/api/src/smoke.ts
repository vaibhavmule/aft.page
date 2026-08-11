/**
 * Prod smoke: deploy → canary `*.test.aft.page` → claim/MCP/auth.
 * Runs after deploy (`npm run smoke`) and twice daily (SMOKE_CRON).
 */
import type { Env } from "./env";
import { assignSiteOwner, createSession, findOrCreateUser, randomId, resolveSessionUser } from "./auth";
import { handleCliAuthRoute } from "./auth-cli";
import {
  createSiteInvite,
  deleteSite,
  deleteSiteInvite,
  listOpsCustomDomains,
  listSiteInvites,
  setSiteVisibility,
} from "./db";
import { handleLifecycleRoute } from "./lifecycle";
import { deploy } from "./deploy";
import { serveSite } from "./serve";
import { deleteSiteObjects } from "./storage";
import { smokeSlugForCase } from "./site-url";

export const SMOKE_CRON = "0 4,16 * * *";
export const SMOKE_RETENTION_DAYS = 14;

/** What each case shakes. Ops scoreboard + CIL. */
export const SMOKE_CASE_CATALOG: Record<string, { box: string; shakes: string }> = {
  html: { box: "Deploy", shakes: "HTML paste → slug + claimUrl + live bytes + noindex" },
  files: { box: "Deploy", shakes: "Multi-file deploy + CSS from R2/KV" },
  noidx: { box: "Serve", shakes: "No index.html → branded 404" },
  empty: { box: "Deploy", shakes: "Empty body rejected (no_files)" },
  reserved: { box: "Product hosts", shakes: "Reserved slug ai rejected" },
  clash: { box: "Deploy", shakes: "Slug collision suffixes; original unchanged" },
  patch: { box: "Lifecycle", shakes: "PATCH update + rollback to prior deployId" },
  gone: { box: "Lifecycle", shakes: "Destroy site → 404" },
  mcp: { box: "MCP", shakes: "Service binding /health (JSON-RPC is Node flight)" },
  claim: { box: "Claim", shakes: "D1 row for claimUrl (Pages /claim is Node)" },
  priv: { box: "Auth", shakes: "Private site → /login?next=" },
  invite: { box: "Auth", shakes: "Invite create + revoke (no email send)" },
  nope: { box: "Serve", shakes: "Unknown canary branded 404" },
  domains: { box: "Custom domains", shakes: "D1 inventory of hostnames + SSL status" },
  cli: { box: "Auth", shakes: "CLI loopback login start → exchange → Bearer /v1/me" },
};

export type SmokeCaseResult = {
  id: string;
  ok: boolean;
  ms: number;
  detail: string;
  url: string | null;
};

export type SmokeFlight = {
  mcp?: { ok: boolean; tools?: string[]; url?: string; error?: string };
  serve?: { ok: boolean; html?: string; files?: string; priv?: number; error?: string };
  domains?: {
    ok: boolean;
    total?: number;
    probed?: number;
    skipped?: number;
    failed?: string[];
    probes?: { host: string; ok: boolean; status?: number; ssl?: string; error?: string }[];
    error?: string;
  };
  claimPage?: { ok: boolean; status?: number };
};

export type SmokeRunResult = {
  id: string;
  ok: boolean;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  ms: number;
  cases: SmokeCaseResult[];
  flight: SmokeFlight | null;
};

export type SmokeRunSummary = {
  id: string;
  ok: boolean;
  trigger: string;
  finishedAt: string;
  ms: number;
  failed: string[];
  hasFlight: boolean;
};

const MARKER = "aft-smoke-html";
const OWNER_EMAIL = "smoke@aft.page";

export async function runSmokeSuite(
  env: Env,
  opts: { trigger: "cron" | "manual" | "test" },
): Promise<SmokeRunResult> {
  const id = `smoke_${randomId().slice(0, 16)}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  console.log(JSON.stringify({ level: "info", where: "smoke", id, event: "start", trigger: opts.trigger }));
  await sweepSmokeSites(env);
  console.log(JSON.stringify({ level: "info", where: "smoke", id, event: "swept", ms: Date.now() - t0 }));

  const cases: SmokeCaseResult[] = [];
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
      console.log(JSON.stringify({ level: "info", where: "smoke", id, event: "case", caseId, ok: true, ms: Date.now() - start }));
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

  await run("html", async () => {
    const slug = smokeSlugForCase("html");
    const html = `<!doctype html><html><head><title>smoke</title></head><body><p>${MARKER}</p></body></html>`;
    const d = await deployJson(env, { html, slug });
    assert(d.status === 200, `deploy ${d.status} ${errOf(d.body)}`);
    assert(typeof d.body.claimUrl === "string" && String(d.body.claimUrl).includes("/claim"), "no claimUrl");
    const url = publicCanaryUrl("html", root);
    assert(d.body.url === url, `url ${d.body.url} != ${url}`);
    const served = await serveCanary(env, "html");
    assert(served.status === 200, `serve ${served.status}`);
    const body = await served.text();
    assert(body.includes(MARKER), "body mismatch");
    assert(body.includes('name="robots"') || body.includes("noindex"), "missing noindex");
    return { detail: "paste 200 + claimUrl + canary bytes", url };
  });

  await run("files", async () => {
    const slug = smokeSlugForCase("files");
    const d = await deployJson(env, {
      slug,
      files: [
        { path: "index.html", content: `<!doctype html><h1>${MARKER}-files</h1>` },
        { path: "app.css", content: "h1{color:red}" },
      ],
    });
    assert(d.status === 200, `deploy ${d.status} ${errOf(d.body)}`);
    const css = await serveCanary(env, "files", "/app.css");
    assert(css.status === 200, `css ${css.status}`);
    assert((await css.text()).includes("color:red"), "css mismatch");
    return { detail: "multi-file + index.html", url: publicCanaryUrl("files", root) };
  });

  await run("noidx", async () => {
    const slug = smokeSlugForCase("noidx");
    const d = await deployJson(env, {
      slug,
      files: [{ path: "app.css", content: "body{}" }],
    });
    assert(d.status === 200, `deploy ${d.status} ${errOf(d.body)}`);
    const served = await serveCanary(env, "noidx");
    assert(served.status === 404, `expected 404 got ${served.status}`);
    return { detail: "no index.html → serve 404", url: publicCanaryUrl("noidx", root) };
  });

  await run("empty", async () => {
    const d = await deployJson(env, { files: [] });
    assert(d.status >= 400, `expected error got ${d.status}`);
    assert(d.body.error === "no_files", `error ${d.body.error}`);
    return { detail: "no_files" };
  });

  await run("reserved", async () => {
    const d = await deployJson(env, {
      slug: "ai",
      html: `<!doctype html><p>${MARKER}</p>`,
    });
    assert(d.status >= 400, `expected error got ${d.status}`);
    assert(d.body.error === "reserved_slug", `error ${d.body.error}`);
    return { detail: "reserved_slug ai" };
  });

  await run("clash", async () => {
    const slug = smokeSlugForCase("clash");
    const a = await deployJson(env, {
      slug,
      html: `<!doctype html><p>${MARKER}-a</p>`,
    });
    assert(a.status === 200 && a.body.slug === slug, `first ${a.body.slug}`);
    const b = await deployJson(env, {
      slug,
      html: `<!doctype html><p>${MARKER}-b</p>`,
    });
    assert(b.status === 200, `second ${b.status}`);
    assert(b.body.slug !== slug, `second reused ${b.body.slug}`);
    const served = await serveCanary(env, "clash");
    assert((await served.text()).includes(`${MARKER}-a`), "original mutated");
    if (typeof b.body.slug === "string") await destroySmokeSite(env, b.body.slug);
    return { detail: `suffix ${b.body.slug}`, url: publicCanaryUrl("clash", root) };
  });

  await run("patch", async () => {
    const slug = smokeSlugForCase("patch");
    const v1 = await deployJson(env, {
      slug,
      html: `<!doctype html><p>${MARKER}-v1</p>`,
    });
    assert(v1.status === 200, `v1 ${errOf(v1.body)}`);
    const token = String(v1.body.editToken || "");
    const deployId = String(v1.body.deployId || "");
    const v2 = await deployJson(env, {
      slug,
      editToken: token,
      html: `<!doctype html><p>${MARKER}-v2</p>`,
    });
    assert(v2.status === 200, `v2 ${errOf(v2.body)}`);
    assert((await (await serveCanary(env, "patch")).text()).includes(`${MARKER}-v2`), "v2 not live");
    const rb = await handleLifecycleRoute(
      new Request(`https://api.aft.page/v1/sites/${slug}/rollback`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aft-edit-token": token,
        },
        body: JSON.stringify({ deployId }),
      }),
      env,
      new URL(`https://api.aft.page/v1/sites/${slug}/rollback`),
    );
    assert(rb && rb.status === 200, `rollback ${rb?.status}`);
    assert((await (await serveCanary(env, "patch")).text()).includes(`${MARKER}-v1`), "rollback miss");
    return { detail: "update + rollback", url: publicCanaryUrl("patch", root) };
  });

  await run("gone", async () => {
    const slug = smokeSlugForCase("gone");
    const d = await deployJson(env, {
      slug,
      html: `<!doctype html><p>${MARKER}</p>`,
    });
    assert(d.status === 200, errOf(d.body));
    await destroySmokeSite(env, slug);
    const served = await serveCanary(env, "gone");
    assert(served.status === 404, `after destroy ${served.status}`);
    return { detail: "destroy → 404" };
  });

  await run("mcp", async () => {
    if (!env.MCP) throw new Error("MCP binding missing");
    // Binding /health only. tools/call is API→MCP→API and deadlocks this isolate —
    // npm run smoke does JSON-RPC from Node after this suite returns.
    const res = await env.MCP.fetch(new Request("https://mcp.aft.page/health"));
    const body = (await res.json()) as { ok?: boolean; service?: string };
    assert(res.status === 200 && body.ok === true, `mcp health ${res.status}`);
    return {
      detail: body.service
        ? `binding /health (${body.service})`
        : "binding /health",
    };
  });

  await run("claim", async () => {
    const slug = smokeSlugForCase("html");
    const row = await env.DB.prepare(`SELECT slug FROM sites WHERE slug = ?`)
      .bind(slug)
      .first<{ slug: string }>();
    assert(row?.slug === slug, "html canary missing for claimUrl check");
    // Pages lives on the apex — fetching it from this isolate can 522/hang.
    // npm run smoke GETs /claim from Node.
    return { detail: "claimUrl row present (Pages checked from npm run smoke)" };
  });

  await run("priv", async () => {
    const slug = smokeSlugForCase("priv");
    const d = await deployJson(env, {
      slug,
      html: `<!doctype html><p>${MARKER}-priv</p>`,
    });
    assert(d.status === 200, errOf(d.body));
    const user = await findOrCreateUser(env, OWNER_EMAIL);
    await assignSiteOwner(env, slug, user.id);
    await setSiteVisibility(env, slug, "private");
    const served = await serveCanary(env, "priv");
    assert(served.status === 302, `expected 302 got ${served.status}`);
    const loc = served.headers.get("location") || "";
    assert(loc.includes("/login") && loc.includes("next="), `location ${loc}`);
    return { detail: "private → /login?next=", url: publicCanaryUrl("priv", root) };
  });

  await run("invite", async () => {
    const slug = smokeSlugForCase("inv");
    const d = await deployJson(env, {
      slug,
      html: `<!doctype html><p>${MARKER}-inv</p>`,
    });
    assert(d.status === 200, errOf(d.body));
    const user = await findOrCreateUser(env, OWNER_EMAIL);
    await assignSiteOwner(env, slug, user.id);
    const inviteId = `sminv_${randomId().slice(0, 12)}`;
    await createSiteInvite(env, {
      id: inviteId,
      slug,
      email: "smoke-guest@aft.page",
      role: "view",
      tokenHash: `smoke_${inviteId}`,
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
    const listed = await listSiteInvites(env, slug);
    assert(listed.some((i) => i.id === inviteId), "invite missing");
    assert(await deleteSiteInvite(env, slug, inviteId), "revoke failed");
    const after = await listSiteInvites(env, slug);
    assert(!after.some((i) => i.id === inviteId), "invite still listed");
    return { detail: "invite + revoke", url: publicCanaryUrl("inv", root) };
  });

  await run("nope", async () => {
    const served = await serveCanary(env, "nope");
    assert(served.status === 404, `expected 404 got ${served.status}`);
    const text = await served.text();
    assert(/not deployed|not found|aft/i.test(text), "unbranded 404");
    return { detail: "unknown canary 404", url: publicCanaryUrl("nope", root) };
  });

  await run("domains", async () => {
    const rows = await listOpsCustomDomains(env, 200);
    const active = rows.filter((r) => r.status === "active").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const errored = rows.filter((r) => r.status === "error" || r.error).length;
    // Inventory only. Public HTTPS + SSL handshake is npm run smoke (Node).
    return {
      detail: `${rows.length} total · ${active} active · ${pending} pending · ${errored} error`,
    };
  });

  await run("cli", async () => {
    const state = `smkcli_${randomId().slice(0, 10)}`;
    const port = 38473;
    const startUrl = new URL("https://api.aft.page/v1/auth/cli");
    startUrl.searchParams.set("port", String(port));
    startUrl.searchParams.set("state", state);
    const start = await handleCliAuthRoute(
      new Request(startUrl.toString()),
      env,
      startUrl,
    );
    assert(start && start.status === 302, `cli start ${start?.status}`);
    const loginLoc = start.headers.get("location") || "";
    assert(loginLoc.includes("/login") && loginLoc.includes("cli=1"), `login ${loginLoc}`);

    const user = await findOrCreateUser(env, "smoke-cli@aft.page");
    const session = await createSession(env, user.id);
    const completeUrl = new URL("https://api.aft.page/v1/auth/cli/complete");
    completeUrl.searchParams.set("state", state);
    const complete = await handleCliAuthRoute(
      new Request(completeUrl.toString(), {
        headers: { cookie: `aft_session=${session.token}` },
      }),
      env,
      completeUrl,
    );
    assert(complete && complete.status === 302, `complete ${complete?.status}`);
    const cb = complete.headers.get("location") || "";
    assert(cb.startsWith(`http://127.0.0.1:${port}/callback?`), `cb ${cb}`);
    const code = new URL(cb).searchParams.get("code") || "";
    assert(code.startsWith("aft_cli_"), "missing code");

    const exchange = await handleCliAuthRoute(
      new Request("https://api.aft.page/v1/auth/cli/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, state }),
      }),
      env,
      new URL("https://api.aft.page/v1/auth/cli/exchange"),
    );
    assert(exchange && exchange.status === 200, `exchange ${exchange?.status}`);
    const traded = (await exchange.json()) as { token?: string; email?: string };
    assert(traded.token === session.token && traded.email === "smoke-cli@aft.page", "token/email");

    const meUser = await resolveSessionUser(
      env,
      new Request("https://api.aft.page/v1/me", {
        headers: { authorization: `Bearer ${traded.token}` },
      }),
    );
    assert(meUser?.email === "smoke-cli@aft.page", `me ${meUser?.email}`);
    return { detail: "start → complete → exchange → Bearer me" };
  });

  const finishedAt = new Date().toISOString();
  const result: SmokeRunResult = {
    id,
    ok: cases.every((c) => c.ok),
    trigger: opts.trigger,
    startedAt,
    finishedAt,
    ms: Date.now() - t0,
    cases,
    flight: null,
  };
  try {
    await persistSmokeRun(env, result);
    await pruneSmokeRuns(env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "smoke_persist", message }));
  }
  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "error",
      where: "smoke",
      id,
      trigger: opts.trigger,
      ok: result.ok,
      ms: result.ms,
      failed: cases.filter((c) => !c.ok).map((c) => c.id),
    }),
  );
  return result;
}

export async function loadLatestSmokeRun(env: Env): Promise<SmokeRunResult | null> {
  const run = await env.DB.prepare(
    `SELECT id, ok, trigger, started_at, finished_at, ms, flight FROM smoke_runs
     ORDER BY created_at DESC LIMIT 1`,
  ).first<{
    id: string;
    ok: number;
    trigger: string;
    started_at: string;
    finished_at: string;
    ms: number;
    flight: string | null;
  }>();
  if (!run) return null;
  const { results } = await env.DB.prepare(
    `SELECT case_id, ok, ms, detail, url FROM smoke_cases WHERE run_id = ? ORDER BY rowid`,
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
    flight: parseFlight(run.flight),
  };
}

export async function loadSmokeHistory(env: Env, limit = 7): Promise<SmokeRunSummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, ok, trigger, finished_at, ms, flight FROM smoke_runs
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      ok: number;
      trigger: string;
      finished_at: string;
      ms: number;
      flight: string | null;
    }>();
  const runs = results || [];
  if (runs.length === 0) return [];
  const ids = runs.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const failed = await env.DB.prepare(
    `SELECT run_id, case_id FROM smoke_cases WHERE run_id IN (${placeholders}) AND ok = 0`,
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
    hasFlight: Boolean(parseFlight(r.flight)),
  }));
}

export async function saveSmokeFlight(
  env: Env,
  runId: string,
  flight: SmokeFlight,
): Promise<boolean> {
  if (!runId.startsWith("smoke_")) return false;
  const res = await env.DB.prepare(`UPDATE smoke_runs SET flight = ? WHERE id = ?`)
    .bind(JSON.stringify(flight), runId)
    .run();
  return (res.meta.changes || 0) > 0;
}

function parseFlight(raw: string | null | undefined): SmokeFlight | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SmokeFlight;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export async function pruneSmokeRuns(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - SMOKE_RETENTION_DAYS * 864e5).toISOString();
  await env.DB.prepare(
    `DELETE FROM smoke_cases WHERE run_id IN (SELECT id FROM smoke_runs WHERE created_at < ?)`,
  )
    .bind(cutoff)
    .run();
  await env.DB.prepare(`DELETE FROM smoke_runs WHERE created_at < ?`).bind(cutoff).run();
}

/** After isolate suite returns — never from inside a request that MCP must call back into. */
export async function attachPublicFlight(env: Env, runId: string): Promise<SmokeFlight | null> {
  const flight = await probePublicFlight(env);
  if (!flight) return null;
  await saveSmokeFlight(env, runId, flight);
  if (!publicFlightOk(flight)) {
    await env.DB.prepare(`UPDATE smoke_runs SET ok = 0 WHERE id = ?`).bind(runId).run();
  } else {
    await env.DB.prepare(
      `UPDATE smoke_runs SET ok = 1 WHERE id = ? AND NOT EXISTS (
         SELECT 1 FROM smoke_cases WHERE run_id = ? AND ok = 0)`,
    )
      .bind(runId, runId)
      .run();
  }
  return flight;
}

export async function probePublicFlight(env: Env): Promise<SmokeFlight | null> {
  if (!env.MCP || !env.SMOKE_SECRET?.trim()) return null;
  try {
    const res = await env.MCP.fetch(
      new Request("https://mcp.aft.page/flight", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.SMOKE_SECRET.trim()}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(50_000),
      }),
    );
    if (!res.ok) {
      console.error(JSON.stringify({ level: "error", where: "smoke_flight", status: res.status }));
      return null;
    }
    const flight = (await res.json()) as SmokeFlight;
    if (!flight || typeof flight !== "object") return null;
    if (!("serve" in flight) && !("claimPage" in flight) && !("domains" in flight)) return null;
    return flight;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        where: "smoke_flight",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

function publicFlightOk(flight: SmokeFlight): boolean {
  if (flight.serve && flight.serve.ok === false) return false;
  if (flight.claimPage && flight.claimPage.ok === false) return false;
  if (flight.domains && flight.domains.ok === false) return false;
  return true;
}

async function persistSmokeRun(env: Env, result: SmokeRunResult): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO smoke_runs (id, ok, trigger, started_at, finished_at, ms, created_at, flight)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      result.id,
      result.ok ? 1 : 0,
      result.trigger,
      result.startedAt,
      result.finishedAt,
      result.ms,
      result.finishedAt,
      result.flight ? JSON.stringify(result.flight) : null,
    )
    .run();
  if (result.cases.length === 0) return;
  const stmts = result.cases.map((c) =>
    env.DB.prepare(
      `INSERT INTO smoke_cases (id, run_id, case_id, ok, ms, detail, url, created_at)
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
  );
  await env.DB.batch(stmts);
}

async function sweepSmokeSites(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT slug FROM sites WHERE slug LIKE 'test--%'`,
  ).all<{ slug: string }>();
  for (const row of results || []) {
    await destroySmokeSite(env, row.slug);
  }
}

export async function destroySmokeSite(env: Env, slug: string): Promise<void> {
  if (!slug.startsWith("test--")) return;
  try {
    await deleteSiteObjects(env, slug);
  } catch {
    /* KV/R2 miss is fine */
  }
  await deleteSite(env, slug);
}

function publicCanaryUrl(caseId: string, root: string): string {
  return `https://${smokeSlugForCase(caseId)}.${root}`;
}

async function serveCanary(env: Env, caseId: string, path = "/"): Promise<Response> {
  const root = env.ROOT_DOMAIN || "aft.page";
  // In-process: exercise `{case}.test.{root}` mapping (no TLS).
  const url = `https://${caseId}.test.${root}${path}`;
  return serveSite(
    new Request(url, { headers: { accept: "text/html" } }),
    env,
    smokeSlugForCase(caseId),
    path,
  );
}

async function deployJson(
  env: Env,
  opts: {
    html?: string;
    files?: { path: string; content: string }[];
    slug?: string;
    editToken?: string;
    method?: "POST" | "PATCH";
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL("https://api.aft.page/v1/deploy");
  if (opts.slug) url.searchParams.set("slug", opts.slug);
  const headers: Record<string, string> = { "x-aft-client": "smoke" };
  if (opts.editToken) headers["x-aft-edit-token"] = opts.editToken;
  let body: BodyInit;
  if (opts.html != null) {
    headers["content-type"] = "text/html; charset=utf-8";
    body = opts.html;
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ files: opts.files || [] });
  }
  const method = opts.method || (opts.editToken ? "PATCH" : "POST");
  const res = await deploy(new Request(url, { method, headers, body }), env);
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
