/**
 * Founder ops.aft.page — health + failed deploys + product feedback. Not a customer product.
 */
import { parseCsvLower, type Env } from "./env";
import { resolveSessionUser } from "./auth";
import {
  countDeploysByClient,
  countDeploysByDay,
  countDeploysSince,
  countFailuresByDay,
  countFailuresByError,
  countFailuresBySource,
  countFailuresSince,
  countOpsSnapshot,
  getCapabilityGrant,
  getDeployFailure,
  getSiteOwnerEmail,
  getSiteRow,
  listAllSites,
  listConnectorsForOps,
  listOpsCustomDomains,
  listOpsUsers,
  listDeployFailures,
  listDeployFailuresForSlug,
  listDeployMsSince,
  listDeploys,
  listFeedback,
  listSiteInvites,
  listSiteMembers,
  scoreWindow,
  type DeployFailureRow,
  type FeedbackRow,
  type OpsDomainRow,
  type OpsSiteListRow,
  type OpsSnapshot,
  type OpsUserRow,
  type ScoreWindow,
} from "./db";
import { setUserCustomDomains } from "./custom-domains";
import {
  loadViewRollup,
  viewsForSlug,
  type ViewRollup,
} from "./metrics";
import { listSiteSecretNames } from "./secrets";
import { deploy } from "./deploy";
import { explainDeployFailure, formatBytes } from "./fail-explain";
import { json } from "./http";
import {
  BRAND,
  BRAND_CSS_VARS,
  BRAND_FONT_LINKS,
  BRAND_WORDMARK_CSS,
} from "./brand";
import { getFailurePayloadFile, listDeployFiles } from "./storage";
import { buildPayload, type StatusPayload } from "./status";
import { listProbeHits, type ProbeHitRow } from "./site-logs";
import {
  attachPublicFlight,
  loadLatestSmokeRun,
  loadSmokeHistory,
  runSmokeSuite,
  saveSmokeFlight,
  SMOKE_CASE_CATALOG,
  type SmokeFlight,
  type SmokeRunResult,
  type SmokeRunSummary,
} from "./smoke";
import {
  AUDIT_CASE_CATALOG,
  loadAuditHistory,
  loadLatestAuditRun,
  runAuditSuite,
  type AuditRunResult,
  type AuditRunSummary,
} from "./audit";

const CF_ACCOUNT = "44255ec64e0080b678670b53bf810d27";
const CF_LOGS_API =
  `https://dash.cloudflare.com/${CF_ACCOUNT}/workers/services/view/aft-page-api/production/observability/logs`;
const CF_LOGS_MCP =
  `https://dash.cloudflare.com/${CF_ACCOUNT}/workers/services/view/aft-page-mcp/production/observability/logs`;

const PREVIEW_MAX = 64 * 1024;
const PREVIEW_RE = /\.(html?|css|js|mjs|json|txt|svg|md)$/i;

export function isOpsHost(host: string, root: string): boolean {
  return host === `ops.${root}`;
}

export function parseOpsEmails(raw: string | undefined): string[] {
  return parseCsvLower(raw);
}

export function isOpsEmail(env: Env, email: string): boolean {
  return parseOpsEmails(env.OPS_EMAILS).includes(email.trim().toLowerCase());
}

async function authorizeSmokeTrigger(request: Request, env: Env): Promise<boolean> {
  const secret = env.SMOKE_SECRET?.trim();
  const auth = request.headers.get("authorization") || "";
  if (secret && auth === `Bearer ${secret}`) return true;
  const user = await resolveSessionUser(env, request);
  return Boolean(user && isOpsEmail(env, user.email));
}

function loginRedirect(root: string): string {
  const next = `https://ops.${root}/`;
  return `https://${root}/login?next=${encodeURIComponent(next)}`;
}

export type SourceScore = {
  source: string;
  successes: number;
  failures: number;
};

export type DayScore = {
  day: string;
  successes: number;
  failures: number;
};

export type FixItem = { error: string; n: number; why: string };

export type TimeToUrlStat = {
  n: number;
  p50Ms: number | null;
  p95Ms: number | null;
  avgMs: number | null;
};

export type TimeToUrlDay = TimeToUrlStat & { day: string };

export type TimeToUrlScore = {
  last24h: TimeToUrlStat;
  last7d: TimeToUrlStat;
  days: TimeToUrlDay[];
};

export const CF_USAGE_KV_KEY = "ops:cf-usage";

export type CfUsageSnap = {
  checkedAt: string;
  scripts: { name: string; requests: number; errors: number }[];
  requests: number;
  cpuMs: number;
};

export type WorkersCost = {
  subscription: number;
  requestsUsd: number;
  cpuUsd: number;
  totalUsd: number;
  requests: number;
  cpuMs: number;
  requestsIncluded: number;
  cpuIncluded: number;
  live: boolean;
  source: "graphql" | "kv" | null;
  checkedAt: string | null;
  scripts: { name: string; requests: number; errors: number }[];
};

export type OpsPayload = {
  service: string;
  health: StatusPayload;
  successes24h: number;
  failures24h: number;
  rate: number | null;
  successes7d: number;
  failures7d: number;
  rate7d: number | null;
  last24h: ScoreWindow;
  last7d: ScoreWindow;
  bySource: SourceScore[];
  days: DayScore[];
  toFix: FixItem[];
  failures: DeployFailureRow[];
  failureCounts: { error: string; n: number }[];
  deploysByDay: { day: string; n: number }[];
  feedback: FeedbackRow[];
  snapshot: OpsSnapshot;
  sites: (OpsSiteListRow & { viewsToday: number; views7d: number })[];
  users: OpsUserRow[];
  domains: OpsDomainRow[];
  views: ViewRollup;
  timeToUrl: TimeToUrlScore;
  cost: WorkersCost;
  logs: { api: string; mcp: string };
  probes: ProbeHitRow[];
  smoke: SmokeRunResult | null;
  smokeHistory: SmokeRunSummary[];
  audit: AuditRunResult | null;
  auditHistory: AuditRunSummary[];
};

const REQ_INCLUDED = 10_000_000;
const CPU_INCLUDED = 30_000_000;

export function estimateWorkersPaid(
  requests: number,
  cpuMs: number,
): Pick<WorkersCost, "subscription" | "requestsUsd" | "cpuUsd" | "totalUsd"> {
  const requestsUsd = Math.max(0, requests - REQ_INCLUDED) / 1e6 * 0.3;
  const cpuUsd = Math.max(0, cpuMs - CPU_INCLUDED) / 1e6 * 0.02;
  return {
    subscription: 5,
    requestsUsd: roundUsd(requestsUsd),
    cpuUsd: roundUsd(cpuUsd),
    totalUsd: roundUsd(5 + requestsUsd + cpuUsd),
  };
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthStartUtc(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

type GqlAdaptive = {
  sum?: { requests?: number; errors?: number };
  quantiles?: { cpuTimeP50?: number };
};

async function readUsageSnap(env: Env): Promise<CfUsageSnap | null> {
  if (!env.STATUS) return null;
  const raw = await env.STATUS.get(CF_USAGE_KV_KEY);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as CfUsageSnap;
    if (typeof j.requests !== "number" || typeof j.cpuMs !== "number") return null;
    return {
      checkedAt: typeof j.checkedAt === "string" ? j.checkedAt : "",
      scripts: Array.isArray(j.scripts) ? j.scripts : [],
      requests: j.requests,
      cpuMs: j.cpuMs,
    };
  } catch {
    return null;
  }
}

async function fetchWorkersMonthUsage(
  token: string,
): Promise<{ scripts: WorkersCost["scripts"]; requests: number; cpuMs: number } | null> {
  const start = monthStartUtc();
  const end = new Date().toISOString();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      signal: ac.signal,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query($accountTag: string!, $start: Time!, $end: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              api: workersInvocationsAdaptive(limit: 1, filter: {
                datetime_geq: $start, datetime_leq: $end, scriptName: "aft-page-api"
              }) { sum { requests errors } quantiles { cpuTimeP50 } }
              mcp: workersInvocationsAdaptive(limit: 1, filter: {
                datetime_geq: $start, datetime_leq: $end, scriptName: "aft-page-mcp"
              }) { sum { requests errors } quantiles { cpuTimeP50 } }
            }
          }
        }`,
        variables: { accountTag: CF_ACCOUNT, start, end },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: {
        viewer?: {
          accounts?: Array<{ api?: GqlAdaptive[]; mcp?: GqlAdaptive[] }>;
        };
      };
    };
    const acc = body.data?.viewer?.accounts?.[0];
    if (!acc) return null;
    const scripts: WorkersCost["scripts"] = [];
    let requests = 0;
    let cpuMs = 0;
    for (const [name, rows] of [
      ["aft-page-api", acc.api],
      ["aft-page-mcp", acc.mcp],
    ] as const) {
      const row = rows?.[0];
      const req = Number(row?.sum?.requests ?? 0);
      const err = Number(row?.sum?.errors ?? 0);
      const p50us = Number(row?.quantiles?.cpuTimeP50 ?? 0);
      scripts.push({ name, requests: req, errors: err });
      requests += req;
      // GraphQL cpuTimeP50 is microseconds.
      cpuMs += req * (p50us / 1000);
    }
    return { scripts, requests, cpuMs };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWorkersUsage(env: Env): Promise<{
  scripts: WorkersCost["scripts"];
  requests: number;
  cpuMs: number;
  checkedAt: string;
  source: "graphql" | "kv";
} | null> {
  if (env.CF_API_TOKEN) {
    const live = await fetchWorkersMonthUsage(env.CF_API_TOKEN);
    if (live) {
      return {
        ...live,
        checkedAt: new Date().toISOString(),
        source: "graphql",
      };
    }
  }
  const snap = await readUsageSnap(env);
  if (!snap) return null;
  return { ...snap, source: "kv" };
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function mergeSources(
  ok: { client: string; n: number }[],
  fail: { source: string; n: number }[],
): SourceScore[] {
  const map = new Map<string, SourceScore>();
  for (const c of ok) {
    map.set(c.client, { source: c.client, successes: c.n, failures: 0 });
  }
  for (const s of fail) {
    const cur = map.get(s.source) || {
      source: s.source,
      successes: 0,
      failures: 0,
    };
    cur.failures = s.n;
    map.set(s.source, cur);
  }
  return [...map.values()].sort(
    (a, b) => b.successes + b.failures - (a.successes + a.failures),
  );
}

function mergeDays(
  ok: { day: string; n: number }[],
  fail: { day: string; n: number }[],
): DayScore[] {
  const map = new Map<string, DayScore>();
  for (const d of ok) {
    map.set(d.day, { day: d.day, successes: d.n, failures: 0 });
  }
  for (const d of fail) {
    const cur = map.get(d.day) || { day: d.day, successes: 0, failures: 0 };
    cur.failures = d.n;
    map.set(d.day, cur);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Last `days` UTC calendar days, zeros filled so the chart axis is continuous. */
export function fillDayWindow(
  rows: DayScore[],
  days = 7,
  now = new Date(),
): DayScore[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  const out: DayScore[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const key = d.toISOString().slice(0, 10);
    out.push(map.get(key) || { day: key, successes: 0, failures: 0 });
  }
  return out;
}

/** Nearest-rank percentile. sortedAsc must already be sorted. */
export function percentileNearest(
  sortedAsc: number[],
  p: number,
): number | null {
  if (!sortedAsc.length) return null;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, rank))]!;
}

export function summarizeMs(values: number[]): TimeToUrlStat {
  if (!values.length) return { n: 0, p50Ms: null, p95Ms: null, avgMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    p50Ms: percentileNearest(sorted, 50),
    p95Ms: percentileNearest(sorted, 95),
    avgMs: Math.round(sum / sorted.length),
  };
}

export function buildTimeToUrlScore(
  rows: { createdAt: string; ms: number }[],
  now = new Date(),
): TimeToUrlScore {
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last24h = summarizeMs(
    rows.filter((r) => r.createdAt >= since24h).map((r) => r.ms),
  );
  const last7d = summarizeMs(rows.map((r) => r.ms));
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const day = r.createdAt.slice(0, 10);
    const list = byDay.get(day) || [];
    list.push(r.ms);
    byDay.set(day, list);
  }
  const days = fillDayWindow([], 7, now).map((d) => ({
    day: d.day,
    ...summarizeMs(byDay.get(d.day) || []),
  }));
  return { last24h, last7d, days };
}

export function formatT2u(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`;
}

function shortDay(iso: string): string {
  const parts = iso.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function renderDayChart(days: DayScore[]): string {
  if (days.length === 0) return `<p class="empty">No activity in 7 days.</p>`;
  const max = Math.max(1, ...days.map((d) => d.successes + d.failures));
  const cols = days
    .map((d) => {
      const total = d.successes + d.failures;
      const h = (total / max) * 100;
      const title = `${d.day} — ${d.successes} ok / ${d.failures} fail`;
      const stack =
        total === 0
          ? `<span class="day-zero"></span>`
          : `<div class="day-stack" style="height:${h}%">${
              d.failures
                ? `<span class="day-fail" style="flex:${d.failures} 1 0"></span>`
                : ""
            }${
              d.successes
                ? `<span class="day-ok" style="flex:${d.successes} 1 0"></span>`
                : ""
            }</div>`;
      return `<div class="day-col" title="${escapeHtml(title)}">
        <span class="day-n">${total || ""}</span>
        <div class="day-track">${stack}</div>
        <span class="day-d">${escapeHtml(shortDay(d.day))}</span>
      </div>`;
    })
    .join("");
  return `<div class="day-chart" role="img" aria-label="Deploys per day, last 7 days">
    <div class="day-legend"><span class="swatch ok"></span> ok <span class="swatch fail"></span> fail</div>
    <div class="day-cols">${cols}</div>
  </div>`;
}

async function buildOpsPayload(env: Env): Promise<OpsPayload> {
  const since24h = isoAgo(24 * 60 * 60 * 1000);
  const since7d = isoAgo(7 * 24 * 60 * 60 * 1000);
  const mtd = monthStartUtc();
  const [
    health,
    failures,
    failureCounts,
    deploysByDay,
    failuresByDay,
    successes24h,
    failures24h,
    successes7d,
    failures7d,
    deploysByClient,
    failuresBySource,
    feedback,
    snapshot,
    sites,
    users,
    domains,
    usage,
    views,
    deployMs,
    smoke,
    smokeHistory,
    probes,
    audit,
    auditHistory,
  ] = await Promise.all([
    buildPayload(env),
    listDeployFailures(env, 50),
    countFailuresByError(env, 7),
    countDeploysByDay(env, 7),
    countFailuresByDay(env, 7),
    countDeploysSince(env, since24h),
    countFailuresSince(env, since24h),
    countDeploysSince(env, since7d),
    countFailuresSince(env, since7d),
    countDeploysByClient(env, since7d),
    countFailuresBySource(env, since7d),
    listFeedback(env, 50),
    countOpsSnapshot(env, since7d, mtd, since24h),
    listAllSites(env, 200),
    listOpsUsers(env, 200),
    listOpsCustomDomains(env, 200),
    resolveWorkersUsage(env),
    env.SITES ? loadViewRollup(env.SITES, 7) : Promise.resolve({
      today: 0,
      d7: 0,
      bySlug: [],
    } satisfies ViewRollup),
    listDeployMsSince(env, since7d),
    loadLatestSmokeRun(env).catch(() => null),
    loadSmokeHistory(env, 7).catch(() => [] as SmokeRunSummary[]),
    listProbeHits(env, since7d),
    loadLatestAuditRun(env).catch(() => null),
    loadAuditHistory(env, 7).catch(() => [] as AuditRunSummary[]),
  ]);
  const last24h = scoreWindow(successes24h, failures24h);
  const last7d = scoreWindow(successes7d, failures7d);
  const requests = usage?.requests ?? 0;
  const cpuMs = usage?.cpuMs ?? 0;
  const priced = estimateWorkersPaid(requests, cpuMs);
  return {
    service: "aft.page-ops",
    health,
    successes24h,
    failures24h,
    rate: last24h.rate,
    successes7d,
    failures7d,
    rate7d: last7d.rate,
    last24h,
    last7d,
    bySource: mergeSources(deploysByClient, failuresBySource),
    days: fillDayWindow(mergeDays(deploysByDay, failuresByDay)),
    toFix: failureCounts.map((c) => ({
      error: c.error,
      n: c.n,
      why: explainDeployFailure({ error: c.error }).why,
    })),
    failures,
    failureCounts,
    deploysByDay,
    feedback,
    snapshot,
    sites: sites.map((s) => {
      const v = viewsForSlug(views, s.slug);
      return { ...s, viewsToday: v.today, views7d: v.d7 };
    }),
    users,
    domains,
    views,
    timeToUrl: buildTimeToUrlScore(deployMs),
    cost: {
      ...priced,
      requests,
      cpuMs,
      requestsIncluded: REQ_INCLUDED,
      cpuIncluded: CPU_INCLUDED,
      live: Boolean(usage),
      source: usage?.source ?? null,
      checkedAt: usage?.checkedAt ?? null,
      scripts: usage?.scripts ?? [],
    },
    logs: { api: CF_LOGS_API, mcp: CF_LOGS_MCP },
    probes,
    smoke,
    smokeHistory,
    audit,
    auditHistory,
  };
}

export async function handleOps(
  request: Request,
  env: Env,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const root = (env.ROOT_DOMAIN || "aft.page").toLowerCase();

  if (url.pathname === "/api/audit/run" && request.method === "POST") {
    const allowed = await authorizeSmokeTrigger(request, env);
    if (!allowed) return json({ error: "unauthorized" }, 401);
    const result = await runAuditSuite(env, { trigger: "manual" });
    return json(result);
  }

  if (url.pathname === "/api/smoke/run" && request.method === "POST") {
    const allowed = await authorizeSmokeTrigger(request, env);
    if (!allowed) return json({ error: "unauthorized" }, 401);
    const result = await runSmokeSuite(env, { trigger: "manual" });
    const skipFlight = request.headers.get("x-aft-skip-flight") === "1";
    if (!skipFlight) {
      ctx?.waitUntil(
        attachPublicFlight(env, result.id).catch((err) => {
          console.error(
            JSON.stringify({
              level: "error",
              where: "smoke_flight",
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        }),
      );
    }
    return json(result);
  }

  if (url.pathname === "/api/smoke/domains" && request.method === "GET") {
    const allowed = await authorizeSmokeTrigger(request, env);
    if (!allowed) return json({ error: "unauthorized" }, 401);
    const rows = await listOpsCustomDomains(env, 200);
    return json({
      domains: rows.map((d) => ({
        hostname: d.hostname,
        slug: d.slug,
        status: d.status,
        sslStatus: d.sslStatus,
      })),
    });
  }

  if (url.pathname === "/api/smoke/flight" && request.method === "POST") {
    const allowed = await authorizeSmokeTrigger(request, env);
    if (!allowed) return json({ error: "unauthorized" }, 401);
    let body: { runId?: string; flight?: SmokeFlight };
    try {
      body = (await request.json()) as { runId?: string; flight?: SmokeFlight };
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const runId = String(body.runId || "");
    if (!body.flight || typeof body.flight !== "object") {
      return json({ error: "invalid_flight" }, 400);
    }
    const ok = await saveSmokeFlight(env, runId, body.flight);
    if (!ok) return json({ error: "unknown_run" }, 404);
    return json({ ok: true, runId });
  }

  const user = await resolveSessionUser(env, request);
  if (!user) {
    return Response.redirect(loginRedirect(root), 302);
  }
  if (!isOpsEmail(env, user.email)) {
    const html = renderDeniedHtml(user.email);
    return new Response(request.method === "HEAD" ? null : html, {
      status: 403,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  const siteMatch = url.pathname.match(/^\/s\/([a-z0-9-]+)(\.json)?$/i);
  if (siteMatch) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const slug = siteMatch[1]!.toLowerCase();
    const detail = await loadOpsSiteDetail(env, slug, root);
    if (!detail) return json({ error: "not_found" }, 404);
    if (siteMatch[2] === ".json") {
      const body = JSON.stringify(detail, null, 2);
      return new Response(request.method === "HEAD" ? null : body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "private, no-store",
        },
      });
    }
    const html = renderSiteHtml(detail, user.email, root);
    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  const failIdMatch = url.pathname.match(/^\/f\/(fail_[a-z0-9]+)(\/file|\/retry|\.json)?$/i);
  if (failIdMatch) {
    const failId = failIdMatch[1]!;
    const tail = (failIdMatch[2] || "").toLowerCase();
    const row = await getDeployFailure(env, failId);
    if (!row) return json({ error: "not_found" }, 404);

    if (tail === "/file") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json({ error: "method_not_allowed" }, 405);
      }
      return serveFailureFile(request, env, row, url);
    }

    if (tail === "/retry") {
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
      }
      return retryFailure(request, env, row);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const explained = explainDeployFailure(row);
    if (tail === ".json") {
      const body = JSON.stringify(
        { ...row, ...explained, logs: { api: CF_LOGS_API, mcp: CF_LOGS_MCP } },
        null,
        2,
      );
      return new Response(request.method === "HEAD" ? null : body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "private, no-store",
        },
      });
    }
    const html = renderFailureHtml(row, explained, user.email);
    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  const approveMatch = url.pathname.match(
    /^\/api\/users\/(usr_[a-z0-9]+)\/custom-domains$/i,
  );
  if (approveMatch) {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const ok = await setUserCustomDomains(env, approveMatch[1]!, "approved");
    if (!ok) return json({ error: "not_found" }, 404);
    return json({ ok: true, access: "approved" });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const payload = await buildOpsPayload(env);

  if (url.pathname === "/api.json" || url.pathname === "/api") {
    const body = JSON.stringify(
      {
        ...payload,
        failures: payload.failures.map((f) => ({ ...f, ...explainDeployFailure(f) })),
      },
      null,
      2,
    );
    return new Response(request.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/" || url.pathname === "") {
    const html = renderOpsHtml(payload, user.email, root);
    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  return json({ error: "not_found" }, 404);
}

function wantsHtml(request: Request): boolean {
  return (request.headers.get("accept") || "").includes("text/html");
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function serveFailureFile(
  request: Request,
  env: Env,
  row: DeployFailureRow,
  url: URL,
): Promise<Response> {
  const path = url.searchParams.get("path") || "";
  if (!path) return json({ error: "missing_path" }, 400);
  const file = await getFailurePayloadFile(env, row.id, path);
  if (!file) return json({ error: "not_found" }, 404);
  const preview = url.searchParams.has("preview");
  if (preview) {
    if (!PREVIEW_RE.test(path)) {
      return json({ error: "not_text" }, 400);
    }
    const raw = new Uint8Array(file.body);
    const slice = raw.subarray(0, PREVIEW_MAX);
    const text = new TextDecoder().decode(slice);
    const suffix = raw.length > PREVIEW_MAX ? `\n\n… truncated at ${PREVIEW_MAX} bytes` : "";
    return new Response(request.method === "HEAD" ? null : text + suffix, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
        "x-aft-truncated": raw.length > PREVIEW_MAX ? "1" : "0",
      },
    });
  }
  const name = path.split("/").pop() || "file";
  return new Response(request.method === "HEAD" ? null : file.body, {
    status: 200,
    headers: {
      "content-type": file.contentType || "application/octet-stream",
      "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}

async function retryFailure(
  request: Request,
  env: Env,
  row: DeployFailureRow,
): Promise<Response> {
  if (!row.hasPayload || !row.upload?.files?.length) {
    return json({ error: "no_payload" }, 400);
  }
  const files: { path: string; content: string; encoding: "base64" }[] = [];
  for (const f of row.upload.files) {
    const got = await getFailurePayloadFile(env, row.id, f.path);
    if (!got) {
      return json({ error: "payload_missing", path: f.path }, 404);
    }
    files.push({
      path: f.path,
      content: bytesToBase64(got.body),
      encoding: "base64",
    });
  }
  const retryReq = new Request("https://api.aft.page/v1/deploy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aft-client": "ops-retry",
    },
    body: JSON.stringify({ files }),
  });
  const res = await deploy(retryReq, env);
  const data = (await res.json()) as Record<string, unknown>;
  if (wantsHtml(request)) {
    const html = renderRetryResultHtml(row, res.status, data);
    return new Response(html, {
      status: res.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }
  return json(data, res.status);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

function renderNetworkDiagram(): string {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#0a0a0a" stroke="#27272a"/>
     <text x="${x + w / 2}" y="${y + (sub ? 22 : 30)}" text-anchor="middle" fill="#fafafa" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeHtml(title)}</text>
     ${sub ? `<text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" fill="#a1a1aa" font-size="11" font-family="ui-monospace,monospace">${escapeHtml(sub)}</text>` : ""}`;
  return `<figure class="net">
  <svg class="net-svg" viewBox="0 0 760 390" role="img" aria-label="aft.page network">
    <defs>
      <marker id="net-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0 0L7 3.5L0 7Z" fill="#52525b"/>
      </marker>
    </defs>
    ${box(30, 16, 210, 52, "Agents", "Claude · Cursor · Codex")}
    ${box(275, 16, 210, 52, "Drop / cURL", "files → URL")}
    ${box(520, 16, 210, 52, "Humans", "browser")}
    ${box(30, 118, 210, 58, "mcp.aft.page", "aft-page-mcp")}
    ${box(275, 118, 210, 58, "api + *.aft.page", "aft-page-api")}
    ${box(520, 118, 210, 58, "aft.page", "Cloudflare Pages")}
    ${box(55, 228, 130, 50, "D1", "sites · deploys")}
    ${box(215, 228, 130, 50, "R2", "file bytes")}
    ${box(375, 228, 130, 50, "KV", "sessions")}
    ${box(535, 228, 130, 50, "AE", "metrics")}
    ${box(275, 322, 210, 52, "*.aft.page", "serve from R2")}
    <g fill="none" stroke="#52525b" stroke-width="1.25" marker-end="url(#net-arr)">
      <path d="M135 68V118"/>
      <path d="M380 68V118"/>
      <path d="M625 68V118"/>
      <path d="M240 147H275"/>
      <path d="M520 147H485"/>
      <path d="M590 68C520 90 430 100 380 118"/>
      <path d="M330 176L120 228"/>
      <path d="M360 176L280 228"/>
      <path d="M400 176L440 228"/>
      <path d="M430 176L600 228"/>
      <path d="M280 278V322"/>
    </g>
    <text x="248" y="142" fill="#52525b" font-size="10" font-family="ui-monospace,monospace">bind</text>
    <text x="268" y="308" fill="#52525b" font-size="10" font-family="ui-monospace,monospace">serve</text>
  </svg>
  <figcaption>Product counts (D1) refresh every 8s. Cloudflare request/CPU is GraphQL adaptive analytics — minutes late, not a stream. No Worker API exposes a live usage socket.</figcaption>
</figure>`;
}

async function loadOpsSiteDetail(env: Env, slug: string, root: string) {
  const site = await getSiteRow(env, slug);
  if (!site) return null;
  const [
    ownerEmail,
    members,
    invites,
    deploys,
    files,
    secrets,
    capabilities,
    connectors,
    failures,
    viewRollup,
  ] = await Promise.all([
    getSiteOwnerEmail(env, slug),
    listSiteMembers(env, slug),
    listSiteInvites(env, slug),
    listDeploys(env, slug, 50),
    listDeployFiles(env, slug, site.deployId),
    listSiteSecretNames(env, slug),
    getCapabilityGrant(env, slug),
    listConnectorsForOps(env, slug),
    listDeployFailuresForSlug(env, slug, 20),
    env.SITES ? loadViewRollup(env.SITES, 7) : Promise.resolve({
      today: 0,
      d7: 0,
      bySlug: [],
    } satisfies ViewRollup),
  ]);
  const liveUrl = `https://${slug}.${root}`;
  const siteViews = viewsForSlug(viewRollup, slug);
  return {
    site: { ...site, ownerEmail },
    views: siteViews,
    liveUrl,
    previewUrl: `https://${root}/preview?url=${encodeURIComponent(liveUrl)}`,
    members: members.map((m) => ({ email: m.email, role: m.role })),
    invites,
    deploys,
    files,
    secrets,
    capabilities,
    connectors,
    failures,
  };
}

function renderTopViews(bySlug: ViewRollup["bySlug"]): string {
  const top = bySlug.filter((r) => r.d7 > 0).slice(0, 10);
  if (top.length === 0) return "";
  return `<h2>Top sites (7d views)</h2>
    <ol class="top-views">${top
      .map(
        (r) =>
          `<li><a href="/s/${escapeHtml(r.slug)}"><code>${escapeHtml(r.slug)}</code></a> · ${r.d7} <span class="faint">(today ${r.today})</span></li>`,
      )
      .join("")}</ol>`;
}

function renderProbeHits(rows: ProbeHitRow[]): string {
  if (rows.length === 0) {
    return `<p class="empty">No scanner probes in 7 days.</p>`;
  }
  return `<table data-probes><thead><tr>
    <th>Path</th><th>Status</th><th>Slug</th><th>Country</th><th>n</th><th>Last</th>
  </tr></thead><tbody>${rows
    .map(
      (r) => `<tr>
        <td><code>${escapeHtml(r.path)}</code></td>
        <td>${r.status}</td>
        <td><a href="/s/${escapeHtml(r.slug)}">${escapeHtml(r.slug)}</a></td>
        <td>${escapeHtml(r.country || "—")}</td>
        <td>${r.n}</td>
        <td>${escapeHtml(r.lastAt)}</td>
      </tr>`,
    )
    .join("")}</tbody></table>`;
}

function renderSitesTable(
  sites: (OpsSiteListRow & { viewsToday: number; views7d: number })[],
  root: string,
): string {
  if (sites.length === 0) return `<p class="empty">No sites yet.</p>`;
  const rows = sites
    .map((s) => {
      const claimed = s.ownerEmail ? "1" : "0";
      const active = s.active ? "1" : "0";
      const live = `https://${s.slug}.${root}`;
      const preview = `https://${root}/preview?url=${encodeURIComponent(live)}`;
      return `<tr data-claimed="${claimed}" data-active="${active}">
        <td><a href="/s/${escapeHtml(s.slug)}"><code>${escapeHtml(s.slug)}</code></a></td>
        <td>${escapeHtml(s.ownerEmail || "unclaimed")}</td>
        <td>${escapeHtml(s.visibility)}</td>
        <td>${escapeHtml(s.runtime)}</td>
        <td>${s.active ? "yes" : "no"}</td>
        <td>${s.deployCount}</td>
        <td>${escapeHtml(formatBytes(s.deployBytes))}</td>
        <td>${s.failureCount}</td>
        <td>${s.viewsToday}</td>
        <td>${s.views7d}</td>
        <td>${escapeHtml(s.lastServedAt || "—")}</td>
        <td><a href="${escapeHtml(live)}">live</a> · <a href="${escapeHtml(preview)}">preview</a></td>
      </tr>`;
    })
    .join("");
  return `<div class="filters" data-site-filters>
      <button type="button" data-filter="all" aria-current="true">All</button>
      <button type="button" data-filter="claimed">Claimed</button>
      <button type="button" data-filter="unclaimed">Unclaimed</button>
      <button type="button" data-filter="inactive">Inactive</button>
    </div>
    <table data-sites><thead><tr>
      <th>Slug</th><th>Owner</th><th>Vis</th><th>Runtime</th><th>Active</th>
      <th>Deploys</th><th>Bytes</th><th>Fails</th><th>Views today</th><th>Views 7d</th><th>Last served</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderUsersTable(users: OpsUserRow[]): string {
  if (users.length === 0) return `<p class="empty">No users yet.</p>`;
  const rows = users
    .map((u) => {
      const access = u.customDomains || "none";
      const approve =
        access === "requested"
          ? `<button type="button" data-approve-domains="${escapeHtml(u.id)}">Approve</button>`
          : "";
      return `<tr>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.sites}</td>
        <td>${escapeHtml(access)}</td>
        <td>${escapeHtml(u.createdAt)}</td>
        <td>${approve}</td>
      </tr>`;
    })
    .join("");
  return `<table data-users><thead><tr>
    <th>Email</th><th>Sites</th><th>Domains</th><th>Joined</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderDomainsTable(domains: OpsDomainRow[], root: string): string {
  if (domains.length === 0) return `<p class="empty">No custom domains yet.</p>`;
  const rows = domains
    .map((d) => {
      const href = `https://${d.hostname}`;
      return `<tr>
        <td><a href="${escapeHtml(href)}"><code>${escapeHtml(d.hostname)}</code></a></td>
        <td><a href="/s/${escapeHtml(d.slug)}"><code>${escapeHtml(d.slug)}</code></a></td>
        <td>${escapeHtml(d.ownerEmail || "—")}</td>
        <td>${escapeHtml(d.status)}</td>
        <td>${escapeHtml(d.sslStatus || "—")}</td>
        <td>${escapeHtml(d.error || "")}</td>
        <td><a href="https://${escapeHtml(d.slug)}.${escapeHtml(root)}">*.aft</a></td>
      </tr>`;
    })
    .join("");
  return `<table data-domains><thead><tr>
    <th>Hostname</th><th>Slug</th><th>Owner</th><th>Status</th><th>SSL</th><th>Error</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSiteHtml(
  detail: NonNullable<Awaited<ReturnType<typeof loadOpsSiteDetail>>>,
  email: string,
  root: string,
): string {
  const s = detail.site;
  const dl = (rows: [string, string][]) =>
    `<dl>${rows
      .map(
        ([k, v]) =>
          `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`,
      )
      .join("")}</dl>`;
  const deploys = detail.deploys.length
    ? `<table class="files"><thead><tr><th>Id</th><th>When</th><th>Source</th><th>Client</th><th>Files</th><th>Bytes</th></tr></thead><tbody>${detail.deploys
        .map(
          (d) =>
            `<tr><td><code>${escapeHtml(d.id)}</code></td><td>${escapeHtml(d.createdAt)}</td><td>${escapeHtml(d.source)}</td><td>${escapeHtml(d.client)}</td><td>${d.fileCount}</td><td>${escapeHtml(formatBytes(d.bytes))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p>No deploys recorded.</p>`;
  const files = detail.files.length
    ? `<table class="files"><thead><tr><th>Path</th><th>Size</th></tr></thead><tbody>${detail.files
        .map(
          (f) =>
            `<tr><td>${escapeHtml(f.path)}</td><td>${escapeHtml(formatBytes(f.bytes))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p>No files listed for the current deploy.</p>`;
  const members = detail.members.length
    ? `<ul>${detail.members.map((m) => `<li>${escapeHtml(m.email)} · ${escapeHtml(m.role)}</li>`).join("")}</ul>`
    : `<p>No members.</p>`;
  const invites = detail.invites.length
    ? `<ul>${detail.invites.map((i) => `<li>${escapeHtml(i.email)} · ${escapeHtml(i.role)} · exp ${escapeHtml(i.expiresAt)}</li>`).join("")}</ul>`
    : `<p>No pending invites.</p>`;
  const secrets = detail.secrets.length
    ? `<ul>${detail.secrets.map((n) => `<li><code>${escapeHtml(n)}</code></li>`).join("")}</ul>`
    : `<p>No named secrets.</p>`;
  const caps = detail.capabilities
    ? `<p>Status <code>${escapeHtml(detail.capabilities.status)}</code>${
        detail.capabilities.deployId
          ? ` · deploy <code>${escapeHtml(detail.capabilities.deployId)}</code>`
          : ""
      }</p>
      <p>Requested <code>${escapeHtml(JSON.stringify(detail.capabilities.requested))}</code></p>
      <p>Approved <code>${escapeHtml(JSON.stringify(detail.capabilities.approved))}</code></p>`
    : `<p>No capability grant.</p>`;
  const connectors = detail.connectors.length
    ? `<ul>${detail.connectors
        .map(
          (c) =>
            `<li><code>${escapeHtml(c.id)}</code> · ${escapeHtml(c.label || "—")} · seen ${escapeHtml(c.lastSeenAt || "never")}</li>`,
        )
        .join("")}</ul>`
    : `<p>No connectors.</p>`;
  const fails = detail.failures.length
    ? `<ul>${detail.failures
        .map(
          (f) =>
            `<li><a href="/f/${escapeHtml(f.id)}"><code>${escapeHtml(f.error)}</code></a> · ${escapeHtml(f.createdAt)}${
              f.path ? ` · ${escapeHtml(f.path)}` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : `<p>No deploy failures for this slug.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(s.slug)} — ops.aft.page</title>
  <meta name="robots" content="noindex" />
  ${BRAND_FONT_LINKS}
  <style>
    ${BRAND_CSS_VARS}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--font-sans); background: var(--void); color: var(--ink); line-height: 1.5; }
    a { color: inherit; }
    code { font-family: var(--font-mono); font-size: 0.85em; }
    .wrap { width: min(900px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
    ${BRAND_WORDMARK_CSS}
    .brand { font-size: 1.35rem; }
    .top { display: flex; justify-content: space-between; margin-bottom: 2rem; }
    .top a { color: var(--quiet); text-decoration: none; }
    h1 { font-size: 1.4rem; letter-spacing: -0.03em; }
    .panel { border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); padding: 1rem 1.1rem; margin: 0 0 1rem; }
    .panel h2 { margin: 0 0 0.5rem; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); }
    .panel p, .panel li { margin: 0 0 0.35rem; color: var(--quiet); }
    .panel a { font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
    dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.35rem 0.75rem; margin: 0; }
    dt { color: var(--faint); font-size: 0.8rem; }
    dd { margin: 0; word-break: break-all; }
    .who { font-family: var(--font-mono); font-size: 0.75rem; color: var(--faint); }
    table.files { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.4rem; }
    table.files th, table.files td { text-align: left; padding: 0.3rem 0.35rem; border-bottom: 1px solid var(--line); }
    table.files th { color: var(--faint); font-size: 0.72rem; text-transform: uppercase; }
    ul { padding-left: 1.1rem; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="https://${escapeHtml(root)}/">aft<span>.</span>page</a>
      <a href="/#sites">← all sites</a>
    </header>
    <h1><code>${escapeHtml(s.slug)}</code></h1>
    <p class="who">${escapeHtml(email)} · <a href="${escapeHtml(detail.liveUrl)}">${escapeHtml(detail.liveUrl)}</a>
      · <a href="${escapeHtml(detail.previewUrl)}">preview</a></p>
    <div class="panel">
      <h2>Identity</h2>
      ${dl([
        ["Active", s.active ? "yes" : "no"],
        ["Visibility", escapeHtml(s.visibility)],
        ["Runtime", escapeHtml(s.runtime)],
        ["Upstream", escapeHtml(s.upstreamUrl || "—")],
        ["Main module", escapeHtml(s.mainModule || "—")],
        ["Deploy", `<code>${escapeHtml(s.deployId)}</code>`],
        ["Created", escapeHtml(s.createdAt)],
        ["Updated", escapeHtml(s.updatedAt)],
        ["Last served", escapeHtml(s.lastServedAt || "—")],
        ["Views today", String(detail.views.today)],
        ["Views 7d", String(detail.views.d7)],
      ])}
    </div>
    <div class="panel">
      <h2>Owner</h2>
      <p>${escapeHtml(s.ownerEmail || "unclaimed")}</p>
      <h2>Members</h2>
      ${members}
      <h2>Invites</h2>
      ${invites}
    </div>
    <div class="panel">
      <h2>Deploys</h2>
      ${deploys}
    </div>
    <div class="panel">
      <h2>Files (current deploy)</h2>
      ${files}
    </div>
    <div class="panel">
      <h2>Secrets</h2>
      <p>Names only — never values.</p>
      ${secrets}
    </div>
    <div class="panel">
      <h2>Capabilities</h2>
      ${caps}
    </div>
    <div class="panel">
      <h2>Connectors</h2>
      ${connectors}
    </div>
    <div class="panel">
      <h2>Failures</h2>
      ${fails}
    </div>
  </div>
</body>
</html>`;
}

function renderDeniedHtml(email: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Ops — aft.page</title>
${BRAND_FONT_LINKS}<style>${BRAND_CSS_VARS} body{margin:2rem;font-family:var(--font-sans);background:var(--void);color:var(--ink)} a{color:var(--ink)}</style>
</head><body>
<p>This page is for founders only. Signed in as ${escapeHtml(email)}.</p>
<p><a href="https://aft.page/">Home</a></p>
</body></html>`;
}

function renderSmokeSection(
  smoke: SmokeRunResult | null,
  history: SmokeRunSummary[] = [],
): string {
  const schedule = `<p class="empty">Fail fast: cron 04:00 + 16:00 UTC + Run now shake the isolate, then <code>aft-page-mcp</code> flies public HTTPS (TLS + custom domains + /claim). <code>npm run smoke</code> still checks MCP JSON-RPC as a real client. <button type="button" class="smoke-go" data-smoke-run>Run now</button></p>`;
  if (!smoke) return schedule;
  const pill = smoke.ok
    ? `<span class="pill ok" data-live="smokeOk">pass</span>`
    : `<span class="pill fail" data-live="smokeOk">fail</span>`;
  const failed = smoke.cases.filter((c) => !c.ok).map((c) => c.id);
  const rows = smoke.cases
    .map((c) => {
      const meta = SMOKE_CASE_CATALOG[c.id] || { box: "—", shakes: c.detail };
      const link = c.url
        ? `<a href="${escapeHtml(c.url)}">${escapeHtml(c.url.replace(/^https:\/\//, ""))}</a>`
        : "—";
      return `<tr>
        <td>${escapeHtml(meta.box)}</td>
        <td><code>${escapeHtml(c.id)}</code></td>
        <td>${escapeHtml(meta.shakes)}</td>
        <td>${c.ok ? "ok" : "fail"}</td>
        <td>${c.ms}</td>
        <td>${escapeHtml(c.detail)}</td>
        <td>${link}</td>
      </tr>`;
    })
    .join("");
  const hist =
    history.length === 0
      ? ""
      : `<h3>Last ${history.length} runs</h3>
        <table class="smoke-hist"><thead><tr><th>When</th><th></th><th>Trigger</th><th>ms</th><th>Failed</th><th>Flight</th></tr></thead><tbody>${history
          .map(
            (h) => `<tr>
              <td>${escapeHtml(h.finishedAt)}</td>
              <td>${h.ok ? "pass" : "fail"}</td>
              <td>${escapeHtml(h.trigger)}</td>
              <td>${h.ms}</td>
              <td>${h.failed.length ? escapeHtml(h.failed.join(", ")) : "—"}</td>
              <td>${h.hasFlight ? "public TLS" : "isolate"}</td>
            </tr>`,
          )
          .join("")}</tbody></table>`;
  return `${schedule}
    <p class="smoke-run">${pill}
    · <span data-live="smokeAt">${escapeHtml(smoke.finishedAt)}</span>
    · ${smoke.ms} ms · ${escapeHtml(smoke.trigger)} · <code>${escapeHtml(smoke.id)}</code>
    ${failed.length ? ` · failed: ${escapeHtml(failed.join(", "))}` : ""}
    · <button type="button" class="smoke-go" data-smoke-run>Run now</button></p>
    <h3>What we shook (isolate)</h3>
    <table><thead><tr><th>Box</th><th>Case</th><th>Shaken</th><th></th><th>ms</th><th>Result</th><th>Evidence</th></tr></thead>
    <tbody data-smoke-cases>${rows}</tbody></table>
    ${renderSmokeFlight(smoke.flight)}
    ${hist}`;
}

function renderAuditSection(
  audit: AuditRunResult | null,
  history: AuditRunSummary[] = [],
): string {
  const schedule = `<p class="empty">Hijack CIL: tenant origin cannot drive another slug; editToken dies on claim. Cron after smoke + Run now. Scanner junk is <code>npm run audit:security</code>. <button type="button" class="smoke-go" data-audit-run>Run now</button></p>`;
  if (!audit) return schedule;
  const pill = audit.ok
    ? `<span class="pill ok" data-live="auditOk">pass</span>`
    : `<span class="pill fail" data-live="auditOk">fail</span>`;
  const failed = audit.cases.filter((c) => !c.ok).map((c) => c.id);
  const rows = audit.cases
    .map((c) => {
      const meta = AUDIT_CASE_CATALOG[c.id] || { box: "—", shakes: c.detail };
      const link = c.url
        ? `<a href="${escapeHtml(c.url)}">${escapeHtml(c.url.replace(/^https:\/\//, ""))}</a>`
        : "—";
      return `<tr>
        <td>${escapeHtml(meta.box)}</td>
        <td><code>${escapeHtml(c.id)}</code></td>
        <td>${escapeHtml(meta.shakes)}</td>
        <td>${c.ok ? "ok" : "fail"}</td>
        <td>${c.ms}</td>
        <td>${escapeHtml(c.detail)}</td>
        <td>${link}</td>
      </tr>`;
    })
    .join("");
  const hist =
    history.length === 0
      ? ""
      : `<h3>Last ${history.length} runs</h3>
        <table class="smoke-hist"><thead><tr><th>When</th><th></th><th>Trigger</th><th>ms</th><th>Failed</th></tr></thead><tbody>${history
          .map(
            (h) => `<tr>
              <td>${escapeHtml(h.finishedAt)}</td>
              <td>${h.ok ? "pass" : "fail"}</td>
              <td>${escapeHtml(h.trigger)}</td>
              <td>${h.ms}</td>
              <td>${h.failed.length ? escapeHtml(h.failed.join(", ")) : "—"}</td>
            </tr>`,
          )
          .join("")}</tbody></table>`;
  return `${schedule}
    <p class="smoke-run">${pill}
    · <span data-live="auditAt">${escapeHtml(audit.finishedAt)}</span>
    · ${audit.ms} ms · ${escapeHtml(audit.trigger)} · <code>${escapeHtml(audit.id)}</code>
    ${failed.length ? ` · failed: ${escapeHtml(failed.join(", "))}` : ""}
    · <button type="button" class="smoke-go" data-audit-run>Run now</button></p>
    <table><thead><tr><th>Box</th><th>Case</th><th>Shaken</th><th></th><th>ms</th><th>Result</th><th>Evidence</th></tr></thead>
    <tbody>${rows}</tbody></table>
    ${hist}`;
}

function renderSmokeFlight(flight: SmokeFlight | null): string {
  if (!flight) {
    return `<h3>Public flight</h3><p class="empty">Not attached — MCP /flight missed. Isolate cases still ran. Fix the probe, don't ignore it.</p>`;
  }
  const mcp = flight.mcp
    ? flight.mcp.ok
      ? `ok · tools ${escapeHtml((flight.mcp.tools || []).join(", "))}${flight.mcp.url ? ` · <a href="${escapeHtml(flight.mcp.url)}">${escapeHtml(flight.mcp.url.replace(/^https:\/\//, ""))}</a>` : ""}`
      : `fail · ${escapeHtml(flight.mcp.error || "error")}`
    : "—";
  const serve = flight.serve
    ? flight.serve.ok
      ? `ok · <a href="${escapeHtml(flight.serve.html || "#")}">test--html</a> + <a href="${escapeHtml(flight.serve.files || "#")}">test--files</a> + priv ${flight.serve.priv ?? "—"}`
      : `fail · ${escapeHtml(flight.serve.error || "error")}`
    : "—";
  const claim = flight.claimPage
    ? flight.claimPage.ok
      ? `ok · GET /claim ${flight.claimPage.status ?? 200}`
      : `fail · GET /claim ${flight.claimPage.status ?? "?"}`
    : "—";
  const probes = (flight.domains?.probes || [])
    .map((p) => {
      const st = p.ok ? String(p.status ?? "ok") : p.error || String(p.status ?? "fail");
      return `<tr><td><a href="https://${escapeHtml(p.host)}">${escapeHtml(p.host)}</a></td><td>${p.ok ? "ok" : "fail"}</td><td>${escapeHtml(st)}</td><td>${escapeHtml(p.ssl || "—")}</td></tr>`;
    })
    .join("");
  const domains = flight.domains
    ? `${flight.domains.ok ? "ok" : "fail"} · ${flight.domains.probed ?? 0} probed / ${flight.domains.total ?? 0} total · ${flight.domains.skipped ?? 0} skipped (pending)${flight.domains.error ? ` · ${escapeHtml(flight.domains.error)}` : ""}`
    : "—";
  return `<h3>Public flight (TLS + MCP client)</h3>
    <dl class="smoke-flight">
      <dt>Pages /claim</dt><dd>${claim}</dd>
      <dt>Universal SSL + serve</dt><dd>${serve}</dd>
      <dt>MCP JSON-RPC</dt><dd>${mcp}</dd>
      <dt>Custom domains</dt><dd>${domains}</dd>
    </dl>
    ${probes ? `<table><thead><tr><th>Hostname</th><th></th><th>HTTP</th><th>SSL</th></tr></thead><tbody>${probes}</tbody></table>` : ""}`;
}

function renderOpsHtml(payload: OpsPayload, email: string, root: string): string {
  const health = payload.health;
  const s = payload.snapshot;
  const c = payload.cost;
  const t2u = payload.timeToUrl;
  const t2uDays = `<table class="files"><thead><tr><th>Day</th><th>n</th><th>p50</th><th>p95</th></tr></thead><tbody>${t2u.days
    .map(
      (d) =>
        `<tr><td>${escapeHtml(shortDay(d.day))}</td><td>${d.n || "—"}</td><td>${escapeHtml(formatT2u(d.p50Ms))}</td><td>${escapeHtml(formatT2u(d.p95Ms))}</td></tr>`,
    )
    .join("")}</tbody></table>`;
  const components = health.components
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(c.status.replace(/_/g, " "))} <code>${escapeHtml(c.url)}</code></li>`,
    )
    .join("");

  const toFix =
    payload.toFix.length === 0
      ? `<p class="empty">Nothing to fix — no failures in 7 days.</p>`
      : `<ul class="fix">${payload.toFix
          .map(
            (c) =>
              `<li><code>${escapeHtml(c.error)}</code> × ${c.n} — ${escapeHtml(c.why)}</li>`,
          )
          .join("")}</ul>`;

  const sources =
    payload.bySource.length === 0
      ? `<p class="empty">No deploys in 7 days.</p>`
      : `<table><thead><tr><th>Source</th><th>OK</th><th>Fail</th></tr></thead><tbody>${payload.bySource
          .map(
            (s) =>
              `<tr><td>${escapeHtml(s.source)}</td><td>${s.successes}</td><td>${s.failures}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  const days = renderDayChart(payload.days);

  const rows =
    payload.failures.length === 0
      ? `<p class="empty">No recorded deploy failures.</p>`
      : `<table><thead><tr><th>When</th><th>Error</th><th>Why</th><th>Path</th><th>Source</th></tr></thead><tbody>${payload.failures
          .map((f) => {
            const ex = explainDeployFailure(f);
            return `<tr><td>${escapeHtml(f.createdAt)}</td><td><a href="/f/${escapeHtml(f.id)}"><code>${escapeHtml(f.error)}</code></a></td><td class="why">${escapeHtml(ex.why)}</td><td>${escapeHtml(f.path || "—")}</td><td>${escapeHtml(f.source)}</td></tr>`;
          })
          .join("")}</tbody></table>`;

  const notes =
    payload.feedback.length === 0
      ? `<p class="empty">No product feedback yet.</p>`
      : `<table><thead><tr><th>When</th><th>Page</th><th>Email</th><th>Message</th></tr></thead><tbody>${payload.feedback
          .map(
            (f) =>
              `<tr><td>${escapeHtml(f.createdAt)}</td><td>${escapeHtml(f.page || "—")}</td><td>${escapeHtml(f.email || "—")}</td><td class="note">${escapeHtml(f.message)}</td></tr>`,
          )
          .join("")}</tbody></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ops — aft.page</title>
  <meta name="robots" content="noindex" />
  <meta name="theme-color" content="${BRAND.void}" />
  ${BRAND_FONT_LINKS}
  <style>
    ${BRAND_CSS_VARS}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--font-sans); background: var(--void); color: var(--ink); line-height: 1.5; }
    a { color: inherit; }
    code { font-family: var(--font-mono); font-size: 0.82em; }
    .wrap { width: min(1100px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
    ${BRAND_WORDMARK_CSS}
    .brand { font-size: 1.35rem; }
    .top { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; align-items: center; }
    .top-links { display: flex; gap: 1rem; color: var(--quiet); font-size: 0.9rem; }
    .top-links a { text-decoration: none; }
    .note { padding: 0.9rem 1rem; border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); color: var(--quiet); margin: 0 0 1.25rem; }
    h1 { font-size: 1.6rem; letter-spacing: -0.03em; margin: 0 0 0.4rem; }
    .lede { color: var(--quiet); margin: 0 0 0.35rem; }
    .who { font-family: var(--font-mono); font-size: 0.75rem; color: var(--faint); margin: 0 0 1.25rem; }
    .hub-shell { display: grid; grid-template-columns: 11.5rem minmax(0, 1fr); gap: 1.25rem 1.5rem; align-items: start; }
    .hub-nav { display: flex; flex-direction: column; gap: 0.15rem; position: sticky; top: 1.25rem; }
    .hub-nav a { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.45rem 0.65rem; border-radius: 4px; color: var(--quiet); text-decoration: none; font-size: 0.88rem; font-weight: 550; }
    .hub-nav a:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
    .hub-nav a[aria-current="page"] { color: var(--ink); background: color-mix(in srgb, var(--ink) 10%, transparent); }
    .hub-nav .n { font-variant-numeric: tabular-nums; font-size: 0.78rem; color: var(--faint); }
    .hub-nav a[aria-current="page"] .n { color: var(--quiet); }
    .hub-main .panel { display: none; }
    .hub-main .panel.is-active { display: block; }
    h2 { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); margin: 1.5rem 0 0.75rem; }
    .hub-main .panel > h2:first-child { margin-top: 0; }
    ul { padding-left: 1.2rem; }
    .empty { color: var(--faint); }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--faint); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
    td.why { color: var(--quiet); max-width: 28rem; }
    td.note { white-space: pre-wrap; max-width: 36rem; word-break: break-word; }
    table a { text-decoration: underline; text-underline-offset: 2px; }
    table button { font: inherit; font-size: 0.78rem; padding: 0.2rem 0.55rem; border: 1px solid var(--line); border-radius: 0.3rem; background: transparent; color: var(--ink); cursor: pointer; }
    .day-chart { border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); padding: 0.75rem 1rem 0.85rem; }
    .day-legend { display: flex; align-items: center; gap: 0.45rem; font-size: 0.75rem; color: var(--quiet); margin-bottom: 0.6rem; }
    .swatch { width: 0.55rem; height: 0.55rem; border-radius: 0.1rem; display: inline-block; }
    .swatch.ok { background: var(--good); }
    .swatch.fail { background: var(--bad); }
    .day-cols { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.45rem; height: 11rem; align-items: stretch; }
    .day-col { display: flex; flex-direction: column; align-items: center; min-width: 0; height: 100%; }
    .day-n { font-variant-numeric: tabular-nums; font-size: 0.72rem; color: var(--quiet); min-height: 1rem; }
    .day-track { flex: 1; width: 70%; max-width: 2.4rem; display: flex; flex-direction: column; justify-content: flex-end; min-height: 0; }
    .day-stack { display: flex; flex-direction: column; width: 100%; min-height: 3px; border-radius: 0.15rem 0.15rem 0 0; overflow: hidden; }
    .day-ok { background: var(--good); min-height: 2px; }
    .day-fail { background: var(--bad); min-height: 2px; }
    .day-zero { height: 2px; width: 100%; background: var(--line); }
    .day-d { font-size: 0.7rem; color: var(--faint); margin-top: 0.35rem; font-variant-numeric: tabular-nums; }
    .score { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.5rem; }
    .stat-grid .card { padding: 0.7rem 0.8rem; }
    .stat-grid strong { display: block; font-size: 1.25rem; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .stat-grid span { color: var(--quiet); font-size: 0.75rem; }
    .cost-note { color: var(--quiet); font-size: 0.82rem; margin: 0.5rem 0 0; }
    .live { display: inline-flex; align-items: center; gap: 0.35rem; }
    .live i { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--faint); display: inline-block; }
    .live i[data-on] { background: var(--good); }
    .net { margin: 0; padding: 0.75rem 0.85rem 0.65rem; border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); }
    .net-svg { width: 100%; height: auto; display: block; }
    .net figcaption { color: var(--quiet); font-size: 0.78rem; margin: 0.65rem 0.1rem 0.1rem; }
    .card { border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); padding: 0.9rem 1rem; }
    a.card-link { text-decoration: none; color: inherit; display: block; }
    a.card-link:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
    .filters { display: flex; gap: 0.35rem; margin: 0 0 0.75rem; flex-wrap: wrap; }
    ol.top-views { margin: 0 0 1rem; padding-left: 1.2rem; color: var(--quiet); }
    ol.top-views .faint { color: var(--faint); }
    .filters button { font: inherit; font-size: 0.82rem; padding: 0.3rem 0.6rem; border: 1px solid var(--line); border-radius: 0.3rem; background: transparent; color: var(--quiet); cursor: pointer; }
    .filters button[aria-current="true"] { color: var(--ink); background: color-mix(in srgb, var(--ink) 10%, transparent); }
    .pill { display: inline-block; font-size: 0.78rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 0.25rem; }
    .pill.ok { background: color-mix(in srgb, var(--good) 22%, transparent); }
    .pill.fail { background: color-mix(in srgb, var(--bad, #c44) 22%, transparent); }
    .smoke-run { margin: 0 0 0.85rem; color: var(--quiet); font-size: 0.88rem; }
    .hub-main .panel h3 { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); margin: 1.25rem 0 0.55rem; }
    dl.smoke-flight { display: grid; grid-template-columns: 11rem 1fr; gap: 0.35rem 0.75rem; margin: 0 0 0.85rem; }
    dl.smoke-flight dt { color: var(--faint); font-size: 0.8rem; }
    dl.smoke-flight dd { margin: 0; color: var(--quiet); }
    table.smoke-hist { margin-top: 0.25rem; }
    button.smoke-go { font: inherit; font-size: 0.85rem; padding: 0.35rem 0.7rem; border: 1px solid var(--line); border-radius: 0.3rem; background: transparent; color: var(--ink); cursor: pointer; }
    button.smoke-go:disabled { opacity: 0.5; cursor: wait; }
    .card h3 { margin: 0 0 0.4rem; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); }
    .nums { display: flex; gap: 1.25rem; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
    .nums strong { display: block; font-size: 1.5rem; letter-spacing: -0.03em; }
    .nums span { color: var(--quiet); font-size: 0.8rem; }
    .fix { padding-left: 1.1rem; }
    .fix li { margin: 0.35rem 0; }
    .logs a { color: var(--ink); font-weight: 600; }
    .cil { margin: 2rem 0 0; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--faint); font-size: 0.78rem; }
    .cil a { color: var(--quiet); }
    @media (max-width: 800px) {
      .hub-shell { grid-template-columns: 1fr; }
      .hub-nav { flex-direction: row; flex-wrap: wrap; position: static; }
      .score, .stat-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="https://aft.page/">aft<span>.</span>page</a>
      <nav class="top-links">
        <a href="https://status.aft.page/">Status</a>
        <a href="/api.json">JSON</a>
      </nav>
    </header>
    <h1>Ops</h1>
    <p class="lede">Time-to-URL every day. Success vs failure. Fix the top codes. Retry a failed upload after you change the product. Critical items: name them, test them, or leave them on the list.</p>
    <p class="who">${escapeHtml(email)} · <span class="live"><i data-live-dot></i>D1 · 8s</span></p>

    <div class="hub-shell">
      <nav class="hub-nav" aria-label="Ops sections">
        <a href="#overview" aria-current="page">Overview</a>
        <a href="#smoke">Smoke <span class="n" data-live="smokeN">${payload.smoke?.cases.length ?? 0}</span></a>
        <a href="#audit">Audit <span class="n" data-live="auditN">${payload.audit?.cases.length ?? 0}</span></a>
        <a href="#sites">Sites <span class="n" data-live="sites">${s.sites}</span></a>
        <a href="#users">Users <span class="n" data-live="users">${s.users}</span></a>
        <a href="#domains">Domains <span class="n" data-live="domains">${s.domains}</span></a>
        <a href="#network">Network</a>
        <a href="#failures">Failures <span class="n">${payload.failures.length}</span></a>
        <a href="#feedback">Feedback <span class="n">${payload.feedback.length}</span></a>
        <a href="#logs">Logs <span class="n">${payload.probes.length}</span></a>
      </nav>
      <div class="hub-main">
        <section class="panel is-active" id="overview">
          <h2>Overview</h2>
          <div class="score">
            <div class="card">
              <h3>Time to URL · 24h</h3>
              <div class="nums">
                <div><strong data-live="t2uN24">${t2u.last24h.n}</strong><span>ok with ms</span></div>
                <div><strong data-live="t2uP5024">${escapeHtml(formatT2u(t2u.last24h.p50Ms))}</strong><span>p50</span></div>
                <div><strong data-live="t2uP9524">${escapeHtml(formatT2u(t2u.last24h.p95Ms))}</strong><span>p95</span></div>
              </div>
            </div>
            <div class="card">
              <h3>Time to URL · 7d</h3>
              <div class="nums">
                <div><strong data-live="t2uN7">${t2u.last7d.n}</strong><span>ok with ms</span></div>
                <div><strong data-live="t2uP507">${escapeHtml(formatT2u(t2u.last7d.p50Ms))}</strong><span>p50</span></div>
                <div><strong data-live="t2uP957">${escapeHtml(formatT2u(t2u.last7d.p95Ms))}</strong><span>p95</span></div>
              </div>
            </div>
          </div>
          ${t2uDays}
          <p class="empty">Machine clock: Worker → URL. Human T2U is a stopwatch — see time-to-url.txt. Bar: p50 &lt; 3s · p95 &lt; 10s.</p>
          <div class="score">
            <div class="card">
              <h3>Last 24h</h3>
              <div class="nums">
                <div><strong data-live="ok24">${payload.successes24h}</strong><span>ok</span></div>
                <div><strong data-live="fail24">${payload.failures24h}</strong><span>fail</span></div>
                <div><strong data-live="rate24">${escapeHtml(pct(payload.rate))}</strong><span>rate</span></div>
              </div>
            </div>
            <div class="card">
              <h3>Last 7d</h3>
              <div class="nums">
                <div><strong data-live="ok7">${payload.successes7d}</strong><span>ok</span></div>
                <div><strong data-live="fail7">${payload.failures7d}</strong><span>fail</span></div>
                <div><strong data-live="rate7">${escapeHtml(pct(payload.rate7d))}</strong><span>rate</span></div>
              </div>
            </div>
            <div class="card">
              <h3>Inbox</h3>
              <div class="nums">
                <div><strong data-live="failn">${payload.failures.length}</strong><span>failures</span></div>
                <div><strong data-live="feedback">${s.feedback}</strong><span>feedback</span></div>
                <div><strong data-live="waitlist">${s.waitlist}</strong><span>waitlist</span></div>
              </div>
            </div>
          </div>
          <h2>CIL / smoke</h2>
          <p class="empty">${
            payload.smoke
              ? `<a href="#smoke">${payload.smoke.ok ? "pass" : "fail"}</a> · ${payload.smoke.cases.length} isolate cases · ${escapeHtml(payload.smoke.trigger)} · ${escapeHtml(payload.smoke.finishedAt)}${payload.smoke.flight ? " · public TLS attached" : " · isolate only — /flight missed"}`
              : `No smoke yet. Cron 04:00 + 16:00 UTC · <a href="#smoke">open scoreboard</a>`
          }</p>
          <h2>Hijack / audit</h2>
          <p class="empty">${
            payload.audit
              ? `<a href="#audit">${payload.audit.ok ? "pass" : "fail"}</a> · ${payload.audit.cases.length} cases · ${escapeHtml(payload.audit.trigger)} · ${escapeHtml(payload.audit.finishedAt)}`
              : `No audit yet. Same cron as smoke · <a href="#audit">open scoreboard</a>`
          }</p>
          <h2>Product</h2>
          <div class="stat-grid">
            <a class="card card-link" href="#sites"><strong data-live="sites">${s.sites}</strong><span>sites</span></a>
            <a class="card card-link" href="#users"><strong data-live="users">${s.users}</strong><span>users</span></a>
            <a class="card card-link" href="#domains"><strong data-live="domains">${s.domains}</strong><span>domains</span></a>
            <div class="card"><strong data-live="domainRequests">${s.domainRequests}</strong><span>domain requests</span></div>
            <div class="card"><strong data-live="claimed">${s.claimed}</strong><span>claimed</span></div>
            <div class="card"><strong data-live="active24h">${s.active24h}</strong><span>served 24h</span></div>
            <div class="card"><strong data-live="viewsToday">${payload.views.today}</strong><span>views today</span></div>
            <div class="card"><strong data-live="views7d">${payload.views.d7}</strong><span>views 7d</span></div>
            <div class="card"><strong data-live="waitlist7d">${s.waitlist7d}</strong><span>waitlist 7d</span></div>
            <div class="card"><strong data-live="deploys">${s.deploys}</strong><span>deploys all</span></div>
            <div class="card"><strong data-live="deploysMtd">${s.deploysMtd}</strong><span>deploys MTD</span></div>
            <div class="card"><strong data-live="deployBytes">${escapeHtml(formatBytes(s.deployBytes))}</strong><span>deploy bytes</span></div>
            <div class="card"><strong data-live="feedback">${s.feedback}</strong><span>feedback all</span></div>
            <div class="card"><strong data-live="toFix">${payload.toFix.length}</strong><span>codes to fix</span></div>
          </div>
          <h2>Cloudflare cost (MTD)</h2>
          <div class="score">
            <div class="card">
              <h3>Estimated</h3>
              <div class="nums">
                <div><strong>$${c.totalUsd.toFixed(2)}</strong><span>this month</span></div>
                <div><strong>$${c.subscription.toFixed(2)}</strong><span>plan</span></div>
                <div><strong>$${(c.requestsUsd + c.cpuUsd).toFixed(2)}</strong><span>overage</span></div>
              </div>
            </div>
            <div class="card">
              <h3>Workers usage</h3>
              <div class="nums">
                <div><strong>${c.live ? c.requests.toLocaleString("en-US") : "—"}</strong><span>requests / ${Math.round(c.requestsIncluded / 1e6)}M</span></div>
                <div><strong>${c.live ? Math.round(c.cpuMs).toLocaleString("en-US") : "—"}</strong><span>CPU-ms / ${Math.round(c.cpuIncluded / 1e6)}M</span></div>
              </div>
              <p class="cost-note">${
                c.live
                  ? `${c.scripts
                      .map((x) => `${x.name} ${x.requests.toLocaleString("en-US")} req`)
                      .join(" · ")}${
                      c.checkedAt
                        ? ` · as of ${escapeHtml(c.checkedAt)}${c.source === "kv" ? " (KV snapshot)" : ""}`
                        : ""
                    }`
                  : "$5 Workers Paid floor · 10M req / 30M CPU-ms included. Usage snapshot not loaded yet."
              }</p>
            </div>
          </div>
          <h2>Day strip</h2>
          ${days}
          <h2>What to fix (7d)</h2>
          ${toFix}
          <h2>By source (7d)</h2>
          ${sources}
          <h2>Health</h2>
          <p>Overall: <strong>${escapeHtml(health.overall.replace(/_/g, " "))}</strong>
            · API probe means this Worker is alive, not that D1/R2 are healthy.</p>
          <ul>${components}</ul>
        </section>
        <section class="panel" id="smoke">
          <h2>Smoke</h2>
          ${renderSmokeSection(payload.smoke, payload.smokeHistory)}
        </section>
        <section class="panel" id="audit">
          <h2>Audit</h2>
          ${renderAuditSection(payload.audit, payload.auditHistory)}
        </section>
        <section class="panel" id="sites">
          <h2>Sites</h2>
          ${renderTopViews(payload.views.bySlug)}
          ${renderSitesTable(payload.sites, root)}
        </section>
        <section class="panel" id="users">
          <h2>Users</h2>
          <p class="empty">Requested custom domains sort first. Approve here.</p>
          ${renderUsersTable(payload.users)}
        </section>
        <section class="panel" id="domains">
          <h2>Domains</h2>
          ${renderDomainsTable(payload.domains, root)}
        </section>
        <section class="panel" id="network">
          <h2>Network</h2>
          ${renderNetworkDiagram()}
        </section>
        <section class="panel" id="failures">
          <h2>Failures</h2>
          <p class="empty">Click the error code → why / files / retry.</p>
          ${rows}
        </section>
        <section class="panel" id="feedback">
          <h2>Feedback</h2>
          ${notes}
        </section>
        <section class="panel" id="logs">
          <h2>Probes</h2>
          <p class="empty">Scanner hits from owner site_logs (path + country, no IP). Last 7 days.</p>
          ${renderProbeHits(payload.probes)}
          <h2>Workers Logs</h2>
          <p class="logs">One Cursor MCP call is two streams:
            <a href="${CF_LOGS_API}">aft-page-api</a> (host + deploy) ·
            <a href="${CF_LOGS_MCP}">aft-page-mcp</a> (protocol / Zod).
          </p>
        </section>
      </div>
    </div>
    <p class="cil">We follow <a href="https://llis.nasa.gov/lesson/803">NASA LLIS 803</a> — identify critical items early, keep a list, test or name the gap. This page is that list.</p>
  </div>
  <script>
    (function () {
      var tabs = ["overview", "smoke", "audit", "sites", "users", "domains", "network", "failures", "feedback", "logs"];
      function show(name) {
        if (tabs.indexOf(name) < 0) name = "overview";
        document.querySelectorAll(".hub-nav a").forEach(function (a) {
          if (a.getAttribute("href") === "#" + name) a.setAttribute("aria-current", "page");
          else a.removeAttribute("aria-current");
        });
        document.querySelectorAll(".hub-main .panel").forEach(function (p) {
          p.classList.toggle("is-active", p.id === name);
        });
        if ((location.hash || "").replace(/^#/, "") !== name) {
          history.replaceState(null, "", "#" + name);
        }
      }
      document.querySelector(".hub-nav").addEventListener("click", function (e) {
        var a = e.target.closest("a[href^='#']");
        if (!a) return;
        e.preventDefault();
        show(a.getAttribute("href").slice(1));
      });
      window.addEventListener("hashchange", function () {
        show((location.hash || "#overview").slice(1));
      });
      show((location.hash || "#overview").slice(1));

      var filters = document.querySelector("[data-site-filters]");
      if (filters) {
        filters.addEventListener("click", function (e) {
          var b = e.target.closest("[data-filter]");
          if (!b) return;
          var f = b.getAttribute("data-filter");
          filters.querySelectorAll("[data-filter]").forEach(function (x) {
            if (x === b) x.setAttribute("aria-current", "true");
            else x.removeAttribute("aria-current");
          });
          document.querySelectorAll("[data-sites] tbody tr").forEach(function (tr) {
            var claimed = tr.getAttribute("data-claimed") === "1";
            var active = tr.getAttribute("data-active") === "1";
            var showRow =
              f === "all" ||
              (f === "claimed" && claimed) ||
              (f === "unclaimed" && !claimed) ||
              (f === "inactive" && !active);
            tr.style.display = showRow ? "" : "none";
          });
        });
      }

      function bytes(n) {
        if (n < 1024) return n + " B";
        if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
        return (n / 1048576).toFixed(2) + " MB";
      }
      function pct(rate) {
        if (rate == null) return "—";
        return Math.round(rate * 1000) / 10 + "%";
      }
      function t2u(ms) {
        if (ms == null) return "—";
        if (ms < 1000) return ms + " ms";
        var s = ms / 1000;
        return s >= 10 ? Math.round(s) + " s" : s.toFixed(1) + " s";
      }
      function set(k, v) {
        document.querySelectorAll('[data-live="' + k + '"]').forEach(function (el) {
          el.textContent = v;
        });
      }
      async function tick() {
        if (document.visibilityState === "hidden") return;
        try {
          var r = await fetch("/api.json", { credentials: "same-origin" });
          if (!r.ok) return;
          var p = await r.json();
          var s = p.snapshot || {};
          var t = p.timeToUrl || {};
          var t24 = t.last24h || {};
          var t7 = t.last7d || {};
          set("t2uN24", t24.n || 0);
          set("t2uP5024", t2u(t24.p50Ms));
          set("t2uP9524", t2u(t24.p95Ms));
          set("t2uN7", t7.n || 0);
          set("t2uP507", t2u(t7.p50Ms));
          set("t2uP957", t2u(t7.p95Ms));
          set("ok24", p.successes24h);
          set("fail24", p.failures24h);
          set("rate24", pct(p.rate));
          set("ok7", p.successes7d);
          set("fail7", p.failures7d);
          set("rate7", pct(p.rate7d));
          set("failn", (p.failures || []).length);
          set("feedback", s.feedback);
          set("waitlist", s.waitlist);
          set("sites", s.sites);
          set("claimed", s.claimed);
          set("users", s.users);
          set("domains", s.domains);
          set("domainRequests", s.domainRequests);
          set("active24h", s.active24h);
          set("viewsToday", (p.views && p.views.today) || 0);
          set("views7d", (p.views && p.views.d7) || 0);
          set("waitlist7d", s.waitlist7d);
          set("deploys", s.deploys);
          set("deploysMtd", s.deploysMtd);
          set("deployBytes", bytes(s.deployBytes || 0));
          set("toFix", (p.toFix || []).length);
          set("smokeN", (p.smoke && p.smoke.cases && p.smoke.cases.length) || 0);
          if (p.smoke) {
            set("smokeOk", p.smoke.ok ? "pass" : "fail");
            set("smokeAt", p.smoke.finishedAt || "");
          }
          set("auditN", (p.audit && p.audit.cases && p.audit.cases.length) || 0);
          if (p.audit) {
            set("auditOk", p.audit.ok ? "pass" : "fail");
            set("auditAt", p.audit.finishedAt || "");
          }
          var dot = document.querySelector("[data-live-dot]");
          if (dot) dot.setAttribute("data-on", "");
        } catch (e) {}
      }
      var usersTable = document.querySelector("[data-users]");
      if (usersTable) {
        usersTable.addEventListener("click", async function (e) {
          var b = e.target.closest("[data-approve-domains]");
          if (!b) return;
          b.disabled = true;
          b.textContent = "…";
          try {
            var r = await fetch("/api/users/" + b.getAttribute("data-approve-domains") + "/custom-domains", {
              method: "POST",
              credentials: "same-origin",
            });
            if (!r.ok) throw new Error("http");
            location.reload();
          } catch (err) {
            b.disabled = false;
            b.textContent = "Approve";
          }
        });
      }
      var go = document.querySelector("[data-smoke-run]");
      if (go) {
        go.addEventListener("click", async function () {
          go.disabled = true;
          go.textContent = "Running…";
          try {
            var r = await fetch("/api/smoke/run", { method: "POST", credentials: "same-origin" });
            if (!r.ok) throw new Error("http " + r.status);
            go.textContent = "TLS…";
            await new Promise(function (ok) { setTimeout(ok, 20000); });
            location.hash = "#smoke";
            location.reload();
          } catch (e) {
            go.disabled = false;
            go.textContent = "Run now";
          }
        });
      }
      var ago = document.querySelector("[data-audit-run]");
      if (ago) {
        ago.addEventListener("click", async function () {
          ago.disabled = true;
          ago.textContent = "Running…";
          try {
            var ar = await fetch("/api/audit/run", { method: "POST", credentials: "same-origin" });
            if (!ar.ok) throw new Error("http " + ar.status);
            location.hash = "#audit";
            location.reload();
          } catch (e) {
            ago.disabled = false;
            ago.textContent = "Run now";
          }
        });
      }
      setInterval(tick, 8000);
    })();
  </script>
</body>
</html>`;
}

function renderFailureHtml(
  row: DeployFailureRow,
  explained: { why: string; fix: string },
  email: string,
): string {
  const size = row.bytes != null ? formatBytes(row.bytes) : "—";
  const files = row.files != null ? String(row.files) : "—";
  const fileRows = row.upload?.files?.length
    ? `<table class="files"><thead><tr><th>Path</th><th>Size</th><th>Type</th><th></th></tr></thead><tbody>${row.upload.files
        .map((f) => {
          const hit = row.path && f.path === row.path;
          const q = encodeURIComponent(f.path);
          const text = PREVIEW_RE.test(f.path);
          const links = row.hasPayload
            ? `<a href="/f/${escapeHtml(row.id)}/file?path=${q}">download</a>${
                text
                  ? ` · <a href="/f/${escapeHtml(row.id)}/file?path=${q}&preview=1">preview</a>`
                  : ""
              }`
            : "—";
          return `<tr${hit ? ' class="hit"' : ""}><td>${escapeHtml(f.path)}</td><td>${escapeHtml(formatBytes(f.bytes))}</td><td>${escapeHtml(f.type || "—")}</td><td>${links}</td></tr>`;
        })
        .join("")}</tbody></table>
            <p style="margin-top:.75rem">Request <code>${escapeHtml(row.upload.contentType || "—")}</code>
            · UA <code>${escapeHtml(row.upload.userAgent || "—")}</code></p>`
    : `<p>No file list on this row (failures recorded before upload capture, or the body was empty).</p>`;

  const retry = row.hasPayload
    ? `<form method="post" action="/f/${escapeHtml(row.id)}/retry">
        <button type="submit">Retry deploy</button>
        <p class="who" style="margin:.5rem 0 0">Replays bytes from R2 as a new anonymous POST. Same limits — it will fail again until the product or the files change.</p>
      </form>`
    : `<p>No payload stored (auth-before-body or empty upload). Cannot retry from ops.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(row.error)} — ops.aft.page</title>
  <meta name="robots" content="noindex" />
  ${BRAND_FONT_LINKS}
  <style>
    ${BRAND_CSS_VARS}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--font-sans); background: var(--void); color: var(--ink); line-height: 1.5; }
    a { color: inherit; }
    code { font-family: var(--font-mono); font-size: 0.85em; }
    .wrap { width: min(720px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
    ${BRAND_WORDMARK_CSS}
    .brand { font-size: 1.35rem; }
    .top { display: flex; justify-content: space-between; margin-bottom: 2rem; }
    .top a { color: var(--quiet); text-decoration: none; }
    h1 { font-size: 1.4rem; letter-spacing: -0.03em; }
    .panel { border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); padding: 1rem 1.1rem; margin: 0 0 1rem; }
    .panel h2 { margin: 0 0 0.5rem; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); }
    .panel p { margin: 0; color: var(--quiet); }
    .panel a { font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
    dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.35rem 0.75rem; margin: 0; }
    dt { color: var(--faint); font-size: 0.8rem; }
    dd { margin: 0; word-break: break-all; }
    .who { font-family: var(--font-mono); font-size: 0.75rem; color: var(--faint); }
    table.files { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.4rem; }
    table.files th, table.files td { text-align: left; padding: 0.3rem 0.35rem; border-bottom: 1px solid var(--line); }
    table.files th { color: var(--faint); font-size: 0.72rem; text-transform: uppercase; }
    table.files tr.hit td { color: var(--bad); font-weight: 600; }
    button { font: inherit; background: var(--ink); color: var(--void); border: 0; border-radius: 0.3rem; padding: 0.45rem 0.9rem; cursor: pointer; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="https://aft.page/">aft<span>.</span>page</a>
      <a href="/#failures">← all failures</a>
    </header>
    <h1><code>${escapeHtml(row.error)}</code></h1>
    <p class="who">${escapeHtml(email)} · ${escapeHtml(row.id)}</p>

    <div class="panel">
      <h2>Why</h2>
      <p>${escapeHtml(explained.why)}</p>
    </div>
    <div class="panel">
      <h2>Fix</h2>
      <p>${escapeHtml(explained.fix)}</p>
    </div>
    <div class="panel">
      <h2>Retry</h2>
      ${retry}
    </div>
    <div class="panel">
      <h2>Evidence</h2>
      <dl>
        <dt>When</dt><dd>${escapeHtml(row.createdAt)}</dd>
        <dt>Path</dt><dd>${escapeHtml(row.path || "—")}</dd>
        <dt>Slug</dt><dd>${escapeHtml(row.slug || "—")}</dd>
        <dt>Source</dt><dd>${escapeHtml(row.source)}</dd>
        <dt>HTTP</dt><dd>${row.httpStatus}</dd>
        <dt>Files</dt><dd>${escapeHtml(files)}</dd>
        <dt>Bytes</dt><dd>${escapeHtml(size)}</dd>
        <dt>Payload</dt><dd>${row.hasPayload ? "R2" : "none"}</dd>
        <dt>Hint</dt><dd>${escapeHtml(row.hint || "—")}</dd>
        <dt>Request</dt><dd><code>${escapeHtml(row.requestId)}</code></dd>
      </dl>
    </div>
    <div class="panel">
      <h2>Uploaded files${
        row.upload?.files?.length ? ` (${row.upload.files.length})` : ""
      }</h2>
      ${fileRows}
    </div>
    <div class="panel">
      <h2>Logs</h2>
      <p>Paste <code>${escapeHtml(row.requestId)}</code> into
        <a href="${CF_LOGS_API}">aft-page-api logs</a>${
          row.source === "mcp"
            ? ` and <a href="${CF_LOGS_MCP}">aft-page-mcp logs</a>`
            : ""
        }.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function renderRetryResultHtml(
  row: DeployFailureRow,
  status: number,
  data: Record<string, unknown>,
): string {
  const ok = status < 400 && typeof data.url === "string";
  const err = typeof data.error === "string" ? data.error : `http_${status}`;
  const url = typeof data.url === "string" ? data.url : "";
  const slug = typeof data.slug === "string" ? data.slug : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Retry — ops.aft.page</title>
${BRAND_FONT_LINKS}<style>${BRAND_CSS_VARS}
body{margin:0;font-family:var(--font-sans);background:var(--void);color:var(--ink);line-height:1.5}
.wrap{width:min(640px,calc(100% - 2rem));margin:0 auto;padding:2rem 0}
a{color:inherit}
code{font-family:var(--font-mono);font-size:.85em}
</style></head><body><div class="wrap">
<p><a href="/f/${escapeHtml(row.id)}">← ${escapeHtml(row.id)}</a></p>
${
  ok
    ? `<h1>Live</h1><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>slug <code>${escapeHtml(slug)}</code></p>`
    : `<h1>Still failing</h1><p><code>${escapeHtml(err)}</code></p><p>Another failure row was recorded. Limits or paths did not change.</p>`
}
</div></body></html>`;
}
