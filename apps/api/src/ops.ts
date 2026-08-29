/**
 * Founder ops.aft.page — health + failed deploys + product feedback. Not a customer product.
 */
import {
  DISTRIBUTE,
  STARTUP_30D,
  checklistListForId,
  checklistProgress,
  loadChecklistDone,
  toggleChecklistItem,
  type ChecklistItem,
} from "./ops-checklist";
import { parseCsvLower, type Env } from "./env";
import { resolveSessionUser, timingSafeEqual } from "./auth";
import {
  loadOrRunCfPractices,
  type CfPracticesResult,
} from "./cf-practices";
import { backfillSiteThumbs } from "./thumb";
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
  listWaitlistSignups,
  listRunJobs,
  countRunJobsByStatus,
  scoreWindow,
  type DeployFailureRow,
  type FeedbackRow,
  type OpsDomainRow,
  type OpsSiteListRow,
  type OpsSnapshot,
  type OpsUserRow,
  type RunJobRow,
  type ScoreWindow,
  type WaitlistSignupRow,
} from "./db";
import { setUserCustomDomains } from "./custom-domains";
import { alertIfAuditFailed, alertIfSmokeFailed } from "./ops-alert";
import {
  loadViewRollup,
  viewsForSlug,
  type ViewRollup,
} from "./metrics";
import {
  HELLO_SLUGS,
  loadVisitsPayload,
  parseVisitsRange,
  parseVisitsScope,
  type VisitBucket,
  type VisitsPayload,
  type VisitsRange,
  type VisitsScope,
} from "./visits";
import { listSiteSecretNames } from "./secrets";
import { deploy } from "./deploy";
import { SAMPLE_REPOS, runSampleRepos } from "./repo";
import { explainDeployFailure, formatBytes } from "./fail-explain";
import { json } from "./http";
import {
  BRAND,
  BRAND_CSS_VARS,
  BRAND_FONT_LINKS,
  BRAND_WORDMARK_CSS,
} from "./brand";
import { getFailurePayloadFile, listDeployFiles } from "./storage";
import {
  buildPayload,
  loadOpsStatusFailures,
  setStatusCheckHidden,
  type StatusCheckFailure,
  type StatusPayload,
} from "./status";
import { listProbeHits, type ProbeHitRow } from "./site-logs";
import {
  ANON_GC_WARN_DAYS,
  ANON_IDLE_DELETE_DAYS,
  anonGcDaysRemaining,
  isAnonGcWarn,
} from "./anon-gc";
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
const CF_LOGS_RUN =
  `https://dash.cloudflare.com/${CF_ACCOUNT}/workers/services/view/aft-run-container/production/observability/logs`;
const GHA_RUNS = "https://github.com/vaibhavmule/aft.page/actions";

const PREVIEW_MAX = 64 * 1024;
const PREVIEW_RE = /\.(html?|css|js|mjs|json|txt|svg|md)$/i;

export function isOpsHost(host: string, root: string): boolean {
  return host === `ops.${root}`;
}

/** Hub panels served as path segments on ops.aft.page (not hash). */
export const OPS_HUB_PANELS = [
  "overview",
  "audit",
  "smoke",
  "failures",
  "status-probes",
  "logs",
  "run",
  "sites",
  "users",
  "domains",
  "feedback",
  "cf",
  "network",
  "stories",
  "distribute",
  "todos",
] as const;

export type OpsHubPanel = (typeof OPS_HUB_PANELS)[number];

/** Map pathname → panel. `/` and `/overview` → overview. `/visits` is a redirect, not a panel. */
export function parseOpsHubPanel(pathname: string): OpsHubPanel | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "") return "overview";
  const seg = p.startsWith("/") ? p.slice(1) : p;
  if (seg.includes("/")) return null;
  return (OPS_HUB_PANELS as readonly string[]).includes(seg)
    ? (seg as OpsHubPanel)
    : null;
}

export function parseOpsEmails(raw: string | undefined): string[] {
  return parseCsvLower(raw);
}

export function isOpsEmail(env: Env, email: string): boolean {
  return parseOpsEmails(env.OPS_EMAILS).includes(email.trim().toLowerCase());
}

/** Founder / company / canary accounts — not a customer in the Users list. */
export function isInternalUserEmail(email: string, env: Env): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (isOpsEmail(env, e)) return true;
  const root = (env.ROOT_DOMAIN || "aft.page").toLowerCase();
  if (e.endsWith("@" + root)) return true;
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus < 1) return false;
  return isOpsEmail(env, local.slice(0, plus) + "@" + domain);
}

export function parseOpsUserFilter(
  raw: string | null | undefined,
): "all" | "internal" | "external" {
  if (raw === "all" || raw === "internal" || raw === "external") return raw;
  return "external";
}

async function authorizeSmokeTrigger(request: Request, env: Env): Promise<boolean> {
  const secret = env.SMOKE_SECRET?.trim();
  const auth = request.headers.get("authorization") || "";
  if (secret && timingSafeEqual(auth, `Bearer ${secret}`)) return true;
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
  statusProbes: StatusCheckFailure[];
  failureCounts: { error: string; n: number }[];
  deploysByDay: { day: string; n: number }[];
  feedback: FeedbackRow[];
  waitlist: WaitlistSignupRow[];
  snapshot: OpsSnapshot;
  sites: (OpsSiteListRow & { viewsToday: number; views7d: number })[];
  users: (OpsUserRow & { internal: boolean })[];
  domains: OpsDomainRow[];
  views: ViewRollup;
  timeToUrl: TimeToUrlScore;
  cost: WorkersCost;
  wfp: WfpTrigger;
  logs: { api: string; mcp: string };
  probes: ProbeHitRow[];
  runJobs: RunJobRow[];
  runCounts: { live: number; failed: number; queued: number };
  smoke: SmokeRunResult | null;
  smokeHistory: SmokeRunSummary[];
  audit: AuditRunResult | null;
  auditHistory: AuditRunSummary[];
  cfPractices: CfPracticesResult;
  visits: VisitsPayload;
};

const REQ_INCLUDED = 10_000_000;
const CPU_INCLUDED = 30_000_000;

/** Paid script cap is 500; leave headroom. ADR-TEMP-ACCOUNTS.md § Costing. */
export const WFP_WATCH_SCRIPTS = 400;
export const WFP_SWITCH_SCRIPTS = 450;
export const WFP_SCRIPT_CAP = 500;
export const WFP_EXTRA_FLOOR_USD = 20;

export type WfpStatus = "stay" | "watch" | "switch";

export type WfpTrigger = {
  status: WfpStatus;
  siteWorkers: number;
  watchAt: number;
  switchAt: number;
  cap: number;
  overageUsd: number;
  why: string;
};

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

export function decideWfpTrigger(
  siteWorkers: number,
  overageUsd: number,
): WfpTrigger {
  const scriptsSwitch = siteWorkers >= WFP_SWITCH_SCRIPTS;
  const scriptsWatch = siteWorkers >= WFP_WATCH_SCRIPTS;
  const billSwitch = overageUsd > WFP_EXTRA_FLOOR_USD;
  const billWatch = overageUsd > WFP_EXTRA_FLOOR_USD / 2;
  const status: WfpStatus = scriptsSwitch || billSwitch
    ? "switch"
    : scriptsWatch || billWatch
      ? "watch"
      : "stay";
  const why = scriptsSwitch
    ? `site Workers ${siteWorkers} ≥ ${WFP_SWITCH_SCRIPTS} — approaching ${WFP_SCRIPT_CAP} Paid cap`
    : billSwitch
      ? `overage $${overageUsd.toFixed(2)} > $${WFP_EXTRA_FLOOR_USD} WfP extra floor — if most of that is worker/next proxy (2 billed reqs), WfP $25 may win`
      : scriptsWatch
        ? `site Workers ${siteWorkers} ≥ ${WFP_WATCH_SCRIPTS} — start planning WfP`
        : billWatch
          ? `overage $${overageUsd.toFixed(2)} — WfP extra floor is $${WFP_EXTRA_FLOOR_USD}; watch proxy share`
          : `stay on $5 Paid. Switch at ~${WFP_WATCH_SCRIPTS} site Workers or when proxy double-bill > $${WFP_EXTRA_FLOOR_USD}/mo.`;
  return {
    status,
    siteWorkers,
    watchAt: WFP_WATCH_SCRIPTS,
    switchAt: WFP_SWITCH_SCRIPTS,
    cap: WFP_SCRIPT_CAP,
    overageUsd: roundUsd(overageUsd),
    why,
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

function shortHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 13) || iso;
  return `${String(d.getUTCHours()).padStart(2, "0")}h`;
}

function seriesLabel(t: string, hourly: boolean): string {
  return hourly ? shortHour(t) : shortDay(t);
}

/** Sparse labels for wide day strips (30d / 90d). */
function seriesLabelStep(n: number): number {
  if (n <= 12) return 1;
  if (n <= 31) return 3;
  return 7;
}

export function renderVisitsSeries(series: VisitBucket[], range: VisitsRange): string {
  if (series.length === 0) {
    return `<p class="empty">No page views in this window.</p>`;
  }
  const hourly = range === "24h";
  const max = Math.max(1, ...series.map((b) => b.n));
  const step = seriesLabelStep(series.length);
  const cols = series
    .map((b, i) => {
      const h = (b.n / max) * 100;
      const label =
        i % step === 0 || i === series.length - 1
          ? escapeHtml(seriesLabel(b.t, hourly))
          : "";
      const title = `${b.t} — ${b.n} views`;
      const stack =
        b.n === 0
          ? `<span class="day-zero"></span>`
          : `<div class="day-stack" style="height:${h}%"><span class="day-ok" style="flex:1 1 0"></span></div>`;
      return `<div class="day-col" title="${escapeHtml(title)}">
        <span class="day-n">${b.n || ""}</span>
        <div class="day-track">${stack}</div>
        <span class="day-d">${label}</span>
      </div>`;
    })
    .join("");
  const aria = hourly
    ? "HTML page views per hour, last 24 hours"
    : `HTML page views per day, last ${range}`;
  return `<div class="day-chart" role="img" aria-label="${escapeHtml(aria)}" data-visits-series>
    <div class="day-legend"><span class="swatch ok"></span> HTML views (page_view)</div>
    <div class="day-cols" style="grid-template-columns: repeat(${series.length}, minmax(0, 1fr))">${cols}</div>
  </div>`;
}

export function renderVisitsCountries(
  countries: VisitsPayload["countries"],
): string {
  if (countries.length === 0) {
    return `<p class="empty" data-visits-countries>No serve-by-country rows in this window.</p>`;
  }
  const max = Math.max(1, ...countries.map((c) => c.n));
  const rows = countries
    .map((c) => {
      const pct = Math.round((c.n / max) * 100);
      return `<div class="country-row" title="${escapeHtml(c.country)} — ${c.n}">
        <span class="country-code">${escapeHtml(c.country)}</span>
        <div class="country-track"><span class="country-bar" style="width:${pct}%"></span></div>
        <span class="country-n">${c.n}</span>
      </div>`;
    })
    .join("");
  return `<div class="country-chart" role="img" aria-label="Serves by country" data-visits-countries>
    <div class="day-legend"><span class="swatch ok"></span> serves by country (serve · blob4)</div>
    ${rows}
  </div>`;
}

function renderVisitsSection(visits: VisitsPayload): string {
  const ranges: VisitsRange[] = ["24h", "7d", "30d", "90d"];
  const scopes: VisitsScope[] = ["hello", "all"];
  const rangePills = ranges
    .map(
      (r) =>
        `<button type="button" data-visits-range="${r}"${
          r === visits.range ? ' aria-current="true"' : ""
        }>${r === "90d" ? "90d (all)" : r}</button>`,
    )
    .join("");
  const scopePills = scopes
    .map(
      (s) =>
        `<button type="button" data-visits-scope="${s}"${
          s === visits.scope ? ' aria-current="true"' : ""
        }>${s === "hello" ? "Hello" : "All sites"}</button>`,
    )
    .join("");
  const helloList = HELLO_SLUGS.join(", ");
  const emptyNote =
    visits.source == null
      ? `<p class="empty" data-visits-note>${
          visits.error === "cf_api_token_missing"
            ? "CF_API_TOKEN missing — needs Account Analytics Engine Read. See METRICS.md for curl SQL."
            : `AE SQL unavailable${visits.error ? ` (${escapeHtml(visits.error)})` : ""}. Cached KV views still on Overview.`
        }</p>`
      : `<p class="empty" data-visits-note>HTML views ≠ serves-by-country (country only on serve). Scope Hello = ${escapeHtml(helloList)}. Cache ~5m.${
          visits.checkedAt ? ` As of ${escapeHtml(visits.checkedAt)}.` : ""
        }${visits.error ? ` Partial: ${escapeHtml(visits.error)}.` : ""}</p>`;

  return `<div data-visits-root data-range="${escapeHtml(visits.range)}" data-scope="${escapeHtml(visits.scope)}">
    <div class="filters" data-visits-scopes>${scopePills}</div>
    <div class="filters" data-visits-ranges>${rangePills}</div>
    <div class="stat-grid" data-visits-totals>
      <div class="card"><strong data-visits-views>${visits.viewsTotal}</strong><span>HTML views</span></div>
      <div class="card"><strong data-visits-serves>${visits.servesTotal}</strong><span>serves (countries)</span></div>
      <div class="card"><strong data-visits-src>${visits.source || "—"}</strong><span>source</span></div>
    </div>
    <h3>Views over time</h3>
    <div data-visits-series-wrap>${renderVisitsSeries(visits.series, visits.range)}</div>
    <h3>By region</h3>
    <div data-visits-countries-wrap>${renderVisitsCountries(visits.countries)}</div>
    ${emptyNote}
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
    waitlist,
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
    cfPractices,
    visits,
    runJobs,
    runCounts,
    statusProbes,
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
    listWaitlistSignups(env, 200),
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
    loadOrRunCfPractices(env),
    loadVisitsPayload(env, { range: "7d", scope: "all" }),
    listRunJobs(env, 50).catch(() => [] as RunJobRow[]),
    countRunJobsByStatus(env).catch(() => ({ live: 0, failed: 0, queued: 0 })),
    loadOpsStatusFailures(env, 50),
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
    statusProbes,
    failureCounts,
    deploysByDay,
    feedback,
    waitlist,
    snapshot,
    sites: sites.map((s) => {
      const v = viewsForSlug(views, s.slug);
      return { ...s, viewsToday: v.today, views7d: v.d7 };
    }),
    users: users.map((u) => ({
      ...u,
      internal: isInternalUserEmail(u.email, env),
    })),
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
    wfp: decideWfpTrigger(snapshot.siteWorkers, priced.requestsUsd + priced.cpuUsd),
    logs: { api: CF_LOGS_API, mcp: CF_LOGS_MCP },
    probes,
    runJobs,
    runCounts,
    smoke,
    smokeHistory,
    audit,
    auditHistory,
    cfPractices,
    visits,
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
    ctx?.waitUntil(alertIfAuditFailed(env, result).catch(() => false));
    return json(result);
  }

  if (url.pathname === "/api/smoke/run" && request.method === "POST") {
    const allowed = await authorizeSmokeTrigger(request, env);
    if (!allowed) return json({ error: "unauthorized" }, 401);
    const result = await runSmokeSuite(env, { trigger: "manual" });
    ctx?.waitUntil(alertIfSmokeFailed(env, result).catch(() => false));
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

  if (url.pathname === "/api/run/sample" && request.method === "POST") {
    const allowed = await authorizeSmokeTrigger(request, env);
    if (!allowed) return json({ error: "unauthorized" }, 401);
    const run = runSampleRepos(env);
    ctx?.waitUntil(run);
    const jobs = await run;
    return json({
      ok: jobs.every((j) => j.status === "live"),
      n: jobs.length,
      live: jobs.filter((j) => j.status === "live").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      jobs: jobs.map((j) => ({
        id: j.id,
        owner: j.owner,
        repo: j.repo,
        status: j.status,
        error: j.error,
        reason: j.reason,
        slug: j.slug,
        siteUrl: j.siteUrl,
        ms: j.ms,
      })),
    });
  }

  if (url.pathname === "/api/thumbs/backfill" && request.method === "POST") {
    const allowed = await authorizeSmokeTrigger(request, env);
    if (!allowed) return json({ error: "unauthorized" }, 401);
    let body: { force?: boolean; limit?: number; offset?: number } = {};
    try {
      if ((request.headers.get("content-type") || "").includes("json")) {
        body = (await request.json()) as typeof body;
      }
    } catch {
      /* empty body ok */
    }
    const result = await backfillSiteThumbs(env, {
      force: Boolean(body.force),
      limit: body.limit,
      offset: body.offset,
    });
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

  if (url.pathname === "/api/checklist" && request.method === "POST") {
    let body: { id?: string; done?: boolean; note?: string };
    try {
      body = (await request.json()) as { id?: string; done?: boolean; note?: string };
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const id = String(body.id || "");
    if (!id || typeof body.done !== "boolean") {
      return json({ error: "invalid_body" }, 400);
    }
    const ok = await toggleChecklistItem(env, id, body.done, body.note);
    if (!ok) return json({ error: "unknown_id" }, 404);
    const done = await loadChecklistDone(env);
    const list = checklistListForId(id) || "todos";
    const items = list === "distribute" ? DISTRIBUTE : STARTUP_30D;
    return json({
      ok: true,
      id,
      done: body.done,
      list,
      progress: checklistProgress(done, items),
    });
  }

  if (url.pathname === "/api/status/hide" && request.method === "POST") {
    let body: { id?: number; hidden?: boolean };
    try {
      body = (await request.json()) as { id?: number; hidden?: boolean };
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const rowId = Number(body.id);
    if (!Number.isInteger(rowId) || typeof body.hidden !== "boolean") {
      return json({ error: "invalid_body" }, 400);
    }
    const ok = await setStatusCheckHidden(env, rowId, body.hidden);
    if (!ok) return json({ error: "not_found" }, 404);
    return json({ ok: true, id: rowId, hidden: body.hidden });
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

  if (url.pathname === "/api/visits") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const visits = await loadVisitsPayload(env, {
      range: parseVisitsRange(url.searchParams.get("range")),
      scope: parseVisitsScope(url.searchParams.get("scope")),
    });
    const body = JSON.stringify(visits, null, 2);
    return new Response(request.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (url.pathname === "/visits" || url.pathname === "/visits/") {
    return Response.redirect(`https://ops.${root}/sites`, 302);
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

  const panel = parseOpsHubPanel(url.pathname);
  if (panel) {
    const checklistDone = await loadChecklistDone(env);
    const html = renderOpsHtml(
      payload,
      user.email,
      root,
      panel,
      checklistDone,
      parseOpsUserFilter(url.searchParams.get("filter")),
      url.searchParams.get("owner") || "",
    );
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

function renderCfPractices(result: CfPracticesResult): string {
  const pill = result.ok
    ? `<span class="pill ok" data-live="cfOk">pass</span>`
    : `<span class="pill fail" data-live="cfOk">fail</span>`;
  const rows = result.cases
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${c.ok ? `<span class="pill ok">ok</span>` : `<span class="pill fail">fail</span>`}</td>
        <td>${escapeHtml(c.detail)}</td>
      </tr>`,
    )
    .join("");
  return `<p class="empty">Workers + platform bindings vs
    <a href="${escapeHtml(result.docs)}">Cloudflare best practices</a>.
    Status cron refreshes when the snapshot is older than 20h (at least daily).</p>
    <p class="smoke-run">${pill} · <span data-live="cfAt">${escapeHtml(result.checkedAt)}</span>
    · ${result.cases.filter((c) => c.ok).length}/${result.cases.length} ok</p>
    <table><thead><tr><th>Check</th><th></th><th>Detail</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderNetworkDiagram(): string {
  const dash = `https://dash.cloudflare.com/${CF_ACCOUNT}`;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    sub: string,
    href?: string,
  ) => {
    const inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#0a0a0a" stroke="#27272a"/>
     <text x="${x + w / 2}" y="${y + (sub ? 22 : 30)}" text-anchor="middle" fill="#fafafa" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeHtml(title)}</text>
     ${sub ? `<text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" fill="#a1a1aa" font-size="11" font-family="ui-monospace,monospace">${escapeHtml(sub)}</text>` : ""}`;
    if (!href) return inner;
    const ext = href.startsWith("http") ? ` target="_blank" rel="noopener"` : "";
    return `<a href="${escapeHtml(href)}"${ext}>${inner}</a>`;
  };
  const edge = (x: number, y: number, label: string) =>
    `<text x="${x}" y="${y}" fill="#52525b" font-size="10" font-family="ui-monospace,monospace">${escapeHtml(label)}</text>`;
  return `<figure class="net">
  <svg class="net-svg" viewBox="0 0 760 500" role="img" aria-label="aft.page network">
    <defs>
      <marker id="net-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0 0L7 3.5L0 7Z" fill="#52525b"/>
      </marker>
    </defs>
    ${box(30, 16, 210, 52, "MCP / CLI", "detect → build → URL")}
    ${box(275, 16, 210, 52, "Drop", "static HTML / dist")}
    ${box(520, 16, 210, 52, "Run", "GitHub → same engine")}
    ${box(30, 118, 210, 58, "mcp.aft.page", "API host → bind MCP", CF_LOGS_MCP)}
    ${box(275, 118, 210, 58, "api + *.aft.page", "engine → URL", CF_LOGS_API)}
    ${box(520, 118, 210, 58, "aft.page", "Cloudflare Pages", `${dash}/pages/view/aft-page`)}
    ${box(30, 206, 210, 52, "GHA", "Vite · Next build", GHA_RUNS)}
    ${box(275, 206, 210, 52, "Sandbox", "Express · Flask · nested UI", CF_LOGS_RUN)}
    ${box(520, 206, 210, 52, "AI Gateway", "plan · sqlite ORM")}
    ${box(55, 296, 130, 50, "D1", "sites · deploys", `${dash}/workers/d1/databases/49430d21-12f7-44dd-bd74-fb649148b34c`)}
    ${box(215, 296, 130, 50, "R2", "file bytes", `${dash}/r2/default/buckets/aft-page-sites`)}
    ${box(375, 296, 130, 50, "KV", "sessions · views", `${dash}/workers/kv/namespaces/3bc4889e9e974a2bbb09433c8b932870`)}
    ${box(535, 296, 130, 50, "AE", "aft_page_metrics", `${dash}/workers/observability`)}
    ${box(275, 392, 210, 52, "*.aft.page", "R2 or process proxy", "/sites")}
    <g fill="none" stroke="#52525b" stroke-width="1.25" marker-end="url(#net-arr)">
      <path d="M135 68V118"/>
      <path d="M380 68V118"/>
      <path d="M625 68C560 90 430 105 380 118"/>
      <path d="M240 147H275"/>
      <path d="M520 147H485"/>
      <path d="M380 176V206"/>
      <path d="M330 166C200 180 135 196 135 206"/>
      <path d="M430 166C560 180 625 196 625 206"/>
      <path d="M135 258V296"/>
      <path d="M380 258V296"/>
      <path d="M280 346V392"/>
    </g>
    ${edge(145, 98, "/mcp")}
    ${edge(288, 98, "POST /v1/deploy")}
    ${edge(635, 98, "/v1/repo")}
    ${edge(248, 142, "bind")}
    ${edge(500, 85, "drop · login")}
    ${edge(148, 192, "build")}
    ${edge(390, 192, "container")}
    ${edge(640, 192, "plan")}
    ${edge(148, 284, "meta")}
    ${edge(300, 284, "bytes")}
    ${edge(410, 284, "sess")}
    ${edge(530, 284, "write")}
    ${edge(268, 378, "serve")}
  </svg>
  <figcaption>Product counts (D1) refresh every 8s. Cloudflare request/CPU is GraphQL adaptive analytics — minutes late, not a stream. No Worker API exposes a live usage socket. Sandbox is try-URL process (sqlite ORM; pg needs DATABASE_URL). D1 here is platform meta, not app data.</figcaption>
</figure>`;
}

function renderList(title: string, lines: string[]): string {
  return `<h3>${escapeHtml(title)}</h3><ul class="stories">${lines
    .map((l) => `<li>${escapeHtml(l)}</li>`)
    .join("")}</ul>`;
}

function renderStories(): string {
  return `${renderList("Engine", [
    "MCP, CLI, and Run share one path: detect → build (pass/fail) → URL.",
    "Runners shipped: static, Vite/Next (GHA). Container Run is an ephemeral try URL (Express/Flask/Django, nested frontend+backend). Ops watches one Express fixture; public status does not.",
    "Try URL sqlite only for Django/SQLAlchemy engine switch. pg/mysql2 fail: claim, add DATABASE_URL. D1 is Code, not Run.",
    "Drop/CLI upload of server source still refuses needs_container — paste the public GitHub on Run instead.",
    "DB / Redis / queue-only (Celery, Bull, Prisma with no web) fail not_a_site.",
    "Do not host a fake index.html for those stacks.",
  ])}
  ${renderList("Workflow", [
    "Agent or human ships through a door → live https://{slug}.aft.page (no account).",
    "Anyone opens that URL now.",
    "Owner claims it (email or Google) → slug stays, they own it.",
    "After claim, further ships need owner/editor login (edit token dies).",
    "Owner makes it private and invites view or edit.",
    "Teammate clicks invite → signed in → opens the same URL.",
    "Owner rolls back, secrets, logs, pause, destroy from /project.",
    "Optional: custom domain (ops approves) or connector (expenses:read).",
  ])}
  ${renderList("Agent (MCP / CLI)", [
    "Same engine as Run. Detect the repo, then build or refuse honestly.",
    "Vite/CSR: npm run build, then deploy dist/.",
    "Next SSR: OpenNext + wrangler, then mapping site.",
    "Redeploy the same slug (before claim: edit token; after: owner session).",
    "List deploys and roll back. Ping health.",
  ])}
  ${renderList("Human", [
    "Drop is static only: HTML or a built dist/ with index.html.",
    "Next/Vite source → GitHub import or aft deploy, not Drop.",
    "curl POST /v1/deploy is the same upload as Drop when the client is web.",
    "Sign in (magic link or Google).",
    "Join waitlist / send feedback.",
    "Read docs, MCP setup, changelog.",
  ])}
  ${renderList("Owner (after claim)", [
    "See all my sites under Projects.",
    "Set public / private.",
    "Invite / revoke view or edit.",
    "Change member role or remove them.",
    "Redeploy, rollback, browse source.",
    "Read logs (7d, no IPs).",
    "Save / delete secrets (vault for hosted runtimes).",
    "Approve aft.json capabilities.",
    "Pause serving (503) or destroy the project.",
    "Request a custom domain; after ops approves, CNAME to cname.aft.page.",
    "Mint a connector token for in-network expenses:read.",
  ])}
  ${renderList("Teammate", [
    "View: open a private site + hub overview / deploys / source.",
    "Edit: plus redeploy, rollback, secrets, logs.",
    "Unsigned private hit → login, then back to the app.",
  ])}
  ${renderList("Visitor on *.aft.page", [
    "Public site just loads.",
    "Private + logged out → login.",
    "Private + logged in, not invited → 401 + request access.",
    "Custom hostname serves the same slug.",
  ])}
  ${renderList("Founder (this page)", [
    "Scoreboard: health, T2U, fails, cost, counts.",
    "Retry a failed upload.",
    "Smoke + hijack audit.",
    "Approve domain access.",
    "See every site / user / domain / network.",
  ])}
  ${renderList("Not the product yet", [
    "Billing checkout, company SSO, public plugin store UI.",
    "MCP does not do secrets / invites / billing.",
    "Connector is expenses:read only.",
    "Dockerfile in the runner not yet. Rails / Go / Rust still fail honestly.",
    "Drop does not build. Vite/Next builds are CLI, MCP (agent-side), or GitHub Run.",
  ])}`;
}

function renderChecklist(
  items: readonly ChecklistItem[],
  doneMap: Map<string, { done: boolean; note: string }>,
  opts: { list: "todos" | "distribute"; blurb: string },
): string {
  const prog = checklistProgress(doneMap, items);
  const groups = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const list = groups.get(item.group) || [];
    list.push(item);
    groups.set(item.group, list);
  }
  const sections: string[] = [];
  for (const [group, groupItems] of groups) {
    const lis = groupItems
      .map((item) => {
        const st = doneMap.get(item.id);
        const checked = st?.done ? " checked" : "";
        const hint = item.hint
          ? `<span class="hint">${escapeHtml(item.hint)}</span>`
          : "";
        const src = item.src
          ? `<span class="src">${escapeHtml(item.src)}</span>`
          : "";
        return `<li>
          <label>
            <input type="checkbox" data-check-id="${escapeHtml(item.id)}" data-check-list="${opts.list}"${checked} />
            <span class="lab">${escapeHtml(item.label)}</span>
          </label>
          ${hint}${src}
        </li>`;
      })
      .join("");
    sections.push(
      `<h3>${escapeHtml(group)}</h3><ul class="todos check">${lis}</ul>`,
    );
  }
  return `<p class="empty">${escapeHtml(opts.blurb)}
    Progress: <strong data-check-progress="${opts.list}">${prog.done}/${prog.total}</strong>.
    Tap a box to save.</p>
  ${sections.join("\n")}`;
}

function renderTodos(
  doneMap: Map<string, { done: boolean; note: string }>,
): string {
  return renderChecklist(STARTUP_30D, doneMap, {
    list: "todos",
    blurb:
      "30-day founder check-in — domains, email, socials, entity, then YC motion.",
  });
}

function renderDistribute(
  doneMap: Map<string, { done: boolean; note: string }>,
): string {
  return renderChecklist(DISTRIBUTE, doneMap, {
    list: "distribute",
    blurb:
      "Plugin + CLI distribution — ready → marketplace listings → stranger proof. Not a store.",
  });
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

function renderStatusProbes(rows: StatusCheckFailure[]): string {
  if (rows.length === 0) {
    return `<p class="empty">No probe failures in D1.</p>`;
  }
  return `<table data-status-probes><thead><tr>
    <th>When</th><th>Id</th><th>Name</th><th>Error</th><th></th>
  </tr></thead><tbody>${rows
    .map((r) => {
      const label = r.hidden ? "Unhide" : "Hide";
      return `<tr>
        <td>${escapeHtml(r.checkedAt)}</td>
        <td><code>${escapeHtml(r.id)}</code></td>
        <td>${escapeHtml(r.name)}</td>
        <td class="why">${escapeHtml(r.error || "—")}</td>
        <td><button type="button" data-status-hide="${r.rowId}" data-hidden="${r.hidden ? "1" : "0"}">${label}</button></td>
      </tr>`;
    })
    .join("")}</tbody></table>`;
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
  owner = "",
): string {
  const ownerLc = owner.trim().toLowerCase();
  if (sites.length === 0) {
    return ownerLc
      ? `<p class="empty">No sites for <code>${escapeHtml(ownerLc)}</code>. <a href="/sites">All sites</a></p>`
      : `<p class="empty">No sites yet.</p>`;
  }
  const now = Date.now();
  const rows = sites
    .map((s) => {
      const claimed = s.ownerEmail ? "1" : "0";
      const active = s.active ? "1" : "0";
      const served24 =
        s.lastServedAt && Date.parse(s.lastServedAt) >= now - 24 * 60 * 60 * 1000
          ? "1"
          : "0";
      const gcWarn = isAnonGcWarn(s, now);
      const gcDays = anonGcDaysRemaining(s, now);
      const live = `https://${s.slug}.${root}`;
      const preview = `https://${root}/preview?url=${encodeURIComponent(live)}`;
      const gcTitle =
        gcDays == null
          ? ""
          : gcDays <= 0
            ? ` title="Anon GC overdue (${ANON_IDLE_DELETE_DAYS}d idle)"`
            : ` title="Anon GC in ~${gcDays}d (${ANON_IDLE_DELETE_DAYS}d idle delete)"`;
      const servedCell =
        gcWarn && gcDays != null
          ? `${escapeHtml(s.lastServedAt || "—")} <span class="pill warn">${
              gcDays <= 0 ? "GC now" : `GC ${gcDays}d`
            }</span>`
          : escapeHtml(s.lastServedAt || "—");
      const rowOwner = (s.ownerEmail || "").toLowerCase();
      const hide = ownerLc && rowOwner !== ownerLc ? ' style="display:none"' : "";
      return `<tr data-claimed="${claimed}" data-active="${active}" data-served24="${served24}" data-gc="${gcWarn ? "1" : "0"}" data-owner="${escapeHtml(rowOwner)}"${gcTitle}${hide}>
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
        <td>${servedCell}</td>
        <td><a href="${escapeHtml(live)}">live</a> · <a href="${escapeHtml(preview)}">preview</a></td>
      </tr>`;
    })
    .join("");
  const ownerNote = ownerLc
    ? `<p class="empty">Owner <code>${escapeHtml(ownerLc)}</code>. <a href="/sites">All sites</a></p>`
    : "";
  return `${ownerNote}<div class="filters" data-site-filters>
      <button type="button" data-filter="all" aria-current="true">All</button>
      <button type="button" data-filter="claimed">Claimed</button>
      <button type="button" data-filter="unclaimed">Unclaimed</button>
      <button type="button" data-filter="served24h">Served 24h</button>
      <button type="button" data-filter="inactive">Inactive</button>
      <button type="button" data-filter="gc" title="Unclaimed idle ≥${ANON_IDLE_DELETE_DAYS - ANON_GC_WARN_DAYS}d — hard-delete at ${ANON_IDLE_DELETE_DAYS}d">Deleting ≤${ANON_GC_WARN_DAYS}d</button>
    </div>
    <table data-sites><thead><tr>
      <th>Slug</th><th>Owner</th><th>Vis</th><th>Runtime</th><th>Active</th>
      <th>Deploys</th><th>Bytes</th><th>Fails</th><th>Views today</th><th>Views 7d</th><th>Last served</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderUsersTable(
  users: (OpsUserRow & { internal: boolean })[],
  filter: "all" | "internal" | "external" = "external",
): string {
  if (users.length === 0) return `<p class="empty">No users yet.</p>`;
  const internalN = users.filter((u) => u.internal).length;
  const externalN = users.length - internalN;
  const rows = users
    .map((u) => {
      const access = u.customDomains || "none";
      const approve =
        access === "requested"
          ? `<button type="button" data-approve-domains="${escapeHtml(u.id)}">Approve</button>`
          : "";
      const kind = u.internal ? "internal" : "external";
      const hide = filter !== "all" && kind !== filter ? ' style="display:none"' : "";
      const sitesHref = `/sites?owner=${encodeURIComponent(u.email)}`;
      return `<tr data-kind="${kind}"${hide}>
        <td>${escapeHtml(u.email)}</td>
        <td><a href="${escapeHtml(sitesHref)}" aria-label="Sites for ${escapeHtml(u.email)}">${u.sites}</a></td>
        <td>${escapeHtml(access)}</td>
        <td>${escapeHtml(u.createdAt)}</td>
        <td>${approve}</td>
      </tr>`;
    })
    .join("");
  const cur = (v: string) => (filter === v ? ' aria-current="true"' : "");
  return `<div class="filters" data-user-filters>
      <button type="button" data-user-filter="all"${cur("all")}>All</button>
      <button type="button" data-user-filter="internal"${cur("internal")}>Internal <span class="n">${internalN}</span></button>
      <button type="button" data-user-filter="external"${cur("external")}>External <span class="n">${externalN}</span></button>
    </div>
    <table data-users><thead><tr>
    <th>Email</th><th>Sites</th><th>Domains</th><th>Joined</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderWaitlistTable(rows: WaitlistSignupRow[]): string {
  if (rows.length === 0) {
    return `<p class="empty">No waitlist signups.</p>`;
  }
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.email)}</td>
        <td>${escapeHtml(r.source)}</td>
        <td>${escapeHtml(r.createdAt)}</td>
      </tr>`,
    )
    .join("");
  return `<table data-waitlist><thead><tr>
    <th>Email</th><th>Source</th><th>Signed up</th>
  </tr></thead><tbody>${body}</tbody></table>`;
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
      <a href="/sites">← all sites</a>
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

function renderRunSection(
  jobs: RunJobRow[],
  counts: { live: number; failed: number; queued: number },
): string {
  const intro = `<p class="empty">Same engine as MCP/CLI. Static <code>index.html</code> sync · Vite <code>npm run build</code> · Next OpenNext. Servers and db/redis/queue fail honestly. Ops sample skips Vite/Next runners. <button type="button" class="smoke-go" data-run-sample>Try ${SAMPLE_REPOS.length} public repos</button></p>
    <p class="smoke-run">
      <span class="pill ok">${counts.live} live</span>
      · <span class="pill fail">${counts.failed} failed</span>
      · ${counts.queued} queued
    </p>`;
  if (jobs.length === 0) return intro;
  const rows = jobs
    .map((j) => {
      const repo =
        j.owner !== "-"
          ? `<a href="${escapeHtml(j.url)}">${escapeHtml(j.owner)}/${escapeHtml(j.repo)}</a>`
          : escapeHtml(j.url);
      const live = j.siteUrl
        ? `<a href="${escapeHtml(j.siteUrl)}">${escapeHtml(j.slug || j.siteUrl)}</a>`
        : j.slug
          ? `<code>${escapeHtml(j.slug)}</code>`
          : "—";
      const pill =
        j.status === "live"
          ? `<span class="pill ok">live</span>`
          : j.status === "queued"
            ? `<span class="pill warn">${escapeHtml(j.phase || "queued")}</span>`
            : `<span class="pill fail">${escapeHtml(j.error || "failed")}</span>`;
      const tail = (j.logTail || "").trim();
      const logLine = tail.split("\n").pop() || "";
      const logCell = tail
        ? `<details><summary>${escapeHtml(logLine.slice(0, 100) || j.id)}</summary><pre class="job-log">${escapeHtml(tail)}</pre></details>`
        : "—";
      return `<tr>
        <td>${escapeHtml(j.finishedAt || j.createdAt)}</td>
        <td>${repo}</td>
        <td>${escapeHtml(j.kind)}</td>
        <td>${pill}</td>
        <td>${escapeHtml(j.reason || "—")}</td>
        <td>${logCell}</td>
        <td>${live}</td>
        <td>${j.ms ?? "—"}</td>
        <td>${escapeHtml(j.trigger)}</td>
      </tr>`;
    })
    .join("");
  return `${intro}
    <table><thead><tr><th>When</th><th>Repo</th><th>Kind</th><th>Phase</th><th>Why</th><th>Log</th><th>Site</th><th>ms</th><th>Trigger</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
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

function renderOpsHtml(
  payload: OpsPayload,
  email: string,
  root: string,
  activePanel: OpsHubPanel = "overview",
  checklistDone: Map<string, { done: boolean; note: string }> = new Map(),
  userFilter: "all" | "internal" | "external" = "external",
  siteOwner = "",
): string {
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
  const healthOk = health.overall === "operational";
  const junk200 = payload.probes.filter(
    (p) =>
      p.status === 200 &&
      !p.slug.startsWith("test--") &&
      !p.slug.startsWith("probe404"),
  ).length;

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
    h1 { font-size: 1.6rem; letter-spacing: -0.03em; margin: 0 0 0.4rem; }
    .lede { color: var(--quiet); margin: 0 0 0.35rem; }
    .who { font-family: var(--font-mono); font-size: 0.75rem; color: var(--faint); margin: 0 0 1.25rem; }
    .hub-shell { display: grid; grid-template-columns: 11.5rem minmax(0, 1fr); gap: 1.25rem 1.5rem; align-items: start; }
    .hub-nav { display: flex; flex-direction: column; gap: 0.15rem; position: sticky; top: 1.25rem; }
    .hub-nav .nav-g { font-size: 0.65rem; letter-spacing: 0.07em; text-transform: uppercase; color: var(--faint); padding: 0.75rem 0.65rem 0.15rem; }
    .hub-nav .nav-g:first-child { padding-top: 0; }
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
    details summary { cursor: pointer; }
    pre.job-log { white-space: pre-wrap; font-size: 0.75rem; max-height: 16rem; overflow: auto; margin: 0.4rem 0 0; font-family: var(--font-mono); }
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
    .country-chart { border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); padding: 0.75rem 1rem 0.85rem; }
    .country-row { display: grid; grid-template-columns: 3.2rem 1fr 3.5rem; gap: 0.55rem; align-items: center; margin: 0.35rem 0; }
    .country-code { font-family: var(--font-mono); font-size: 0.78rem; color: var(--quiet); }
    .country-track { height: 0.55rem; background: var(--line); border-radius: 0.15rem; overflow: hidden; }
    .country-bar { display: block; height: 100%; background: var(--good); border-radius: 0.15rem; min-width: 2px; }
    .country-n { font-variant-numeric: tabular-nums; font-size: 0.78rem; color: var(--quiet); text-align: right; }
    .score { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
    .score.crit { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
    .stat-grid .card { padding: 0.7rem 0.8rem; }
    .stat-grid strong { display: block; font-size: 1.25rem; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .stat-grid span { color: var(--quiet); font-size: 0.75rem; }
    .cost-note { color: var(--quiet); font-size: 0.82rem; margin: 0.5rem 0 0; }
    .live { display: inline-flex; align-items: center; gap: 0.35rem; }
    .live i { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--faint); display: inline-block; }
    .live i[data-on] { background: var(--good); }
    .net { margin: 0; padding: 0.75rem 0.85rem 0.65rem; border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); }
    .net-svg { width: 100%; height: auto; display: block; }
    .net-svg a { text-decoration: none; }
    .net-svg a:hover rect { stroke: var(--ink); }
    .net figcaption { color: var(--quiet); font-size: 0.78rem; margin: 0.65rem 0.1rem 0.1rem; }
    .stories, .todos { margin: 0 0 1rem; padding-left: 0; list-style: none; color: var(--quiet); }
    .stories { padding-left: 1.2rem; list-style: disc; }
    .stories li, .todos li { margin: 0.35rem 0; }
    .todos.check li { display: flex; flex-wrap: wrap; gap: 0.35rem 0.6rem; align-items: baseline; }
    .todos.check label { display: flex; gap: 0.5rem; align-items: flex-start; cursor: pointer; color: var(--ink); flex: 1 1 14rem; }
    .todos.check input { margin-top: 0.2rem; }
    .todos.check .lab { font-weight: 500; }
    .todos.check .hint { font-size: 0.8rem; color: var(--faint); flex: 1 1 100%; padding-left: 1.5rem; }
    .todos .src { color: var(--faint); font-size: 0.75rem; }
    .card { border: 1px solid var(--line); border-radius: 0.4rem; background: var(--panel); padding: 0.9rem 1rem; }
    a.card-link { text-decoration: none; color: inherit; display: block; cursor: pointer; }
    a.card-link:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
    .filters { display: flex; gap: 0.35rem; margin: 0 0 0.75rem; flex-wrap: wrap; }
    ol.top-views { margin: 0 0 1rem; padding-left: 1.2rem; color: var(--quiet); }
    ol.top-views .faint { color: var(--faint); }
    .filters button { font: inherit; font-size: 0.82rem; padding: 0.3rem 0.6rem; border: 1px solid var(--line); border-radius: 0.3rem; background: transparent; color: var(--quiet); cursor: pointer; }
    .filters button[aria-current="true"] { color: var(--ink); background: color-mix(in srgb, var(--ink) 10%, transparent); }
    .pill { display: inline-block; font-size: 0.78rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 0.25rem; }
    .pill.ok { background: color-mix(in srgb, var(--good) 22%, transparent); }
    .pill.warn { background: color-mix(in srgb, var(--warn) 22%, transparent); }
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
      .hub-nav .nav-g { display: none; }
      .score, .score.crit, .stat-grid { grid-template-columns: 1fr 1fr; }
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
    <p class="lede">Is it up. Can they ship. What’s broken. Drop is static. MCP, CLI, and Run share one engine.</p>
    <p class="who">${escapeHtml(email)} · <span class="live"><i data-live-dot></i>D1 · 8s</span></p>

    <div class="hub-shell">
      <nav class="hub-nav" aria-label="Ops sections">
        <span class="nav-g">Operate</span>
        <a href="/overview"${activePanel === "overview" ? ' aria-current="page"' : ""}>Overview</a>
        <a href="/audit"${activePanel === "audit" ? ' aria-current="page"' : ""}>Audit <span class="n" data-live="auditN">${payload.audit?.cases.length ?? 0}</span></a>
        <a href="/smoke"${activePanel === "smoke" ? ' aria-current="page"' : ""}>Smoke <span class="n" data-live="smokeN">${payload.smoke?.cases.length ?? 0}</span></a>
        <a href="/run"${activePanel === "run" ? ' aria-current="page"' : ""}>Run <span class="n">${payload.runJobs.length}</span></a>
        <a href="/failures"${activePanel === "failures" ? ' aria-current="page"' : ""}>Failures <span class="n">${payload.failures.length}</span></a>
        <a href="/status-probes"${activePanel === "status-probes" ? ' aria-current="page"' : ""}>Status <span class="n">${payload.statusProbes.length}</span></a>
        <a href="/logs"${activePanel === "logs" ? ' aria-current="page"' : ""}>Logs <span class="n">${payload.probes.length}</span></a>
        <span class="nav-g">Inventory</span>
        <a href="/sites"${activePanel === "sites" ? ' aria-current="page"' : ""}>Sites <span class="n" data-live="sites">${s.sites}</span></a>
        <a href="/users?filter=external"${activePanel === "users" ? ' aria-current="page"' : ""}>Users <span class="n" data-live="users">${s.users}</span></a>
        <a href="/domains"${activePanel === "domains" ? ' aria-current="page"' : ""}>Domains <span class="n" data-live="domains">${s.domains}</span></a>
        <a href="/feedback"${activePanel === "feedback" ? ' aria-current="page"' : ""}>Feedback <span class="n">${payload.feedback.length}</span></a>
        <span class="nav-g">Map</span>
        <a href="/cf"${activePanel === "cf" ? ' aria-current="page"' : ""}>CF <span class="n" data-live="cfN">${payload.cfPractices.cases.length}</span></a>
        <a href="/network"${activePanel === "network" ? ' aria-current="page"' : ""}>Network</a>
        <a href="/stories"${activePanel === "stories" ? ' aria-current="page"' : ""}>Stories</a>
        <span class="nav-g">Grow</span>
        <a href="/distribute"${activePanel === "distribute" ? ' aria-current="page"' : ""}>Distribute <span class="n" data-check-nav="distribute">${checklistProgress(checklistDone, DISTRIBUTE).done}/${DISTRIBUTE.length}</span></a>
        <a href="/todos"${activePanel === "todos" ? ' aria-current="page"' : ""}>Todos <span class="n" data-check-nav="todos">${checklistProgress(checklistDone, STARTUP_30D).done}/${STARTUP_30D.length}</span></a>
      </nav>
      <div class="hub-main">
        <section class="panel${activePanel === "overview" ? " is-active" : ""}" id="overview">
          <h2>Critical</h2>
          <div class="score crit">
            <a class="card card-link" href="https://status.aft.page/">
              <h3>Health</h3>
              <div class="nums">
                <div><strong><span class="pill ${healthOk ? "ok" : "fail"}">${escapeHtml(health.overall.replace(/_/g, " "))}</span></strong><span>status probes</span></div>
              </div>
            </a>
            <a class="card card-link" href="/audit">
              <h3>Hijack / audit</h3>
              <div class="nums">
                <div><strong><span class="pill ${payload.audit?.ok ? "ok" : "fail"}" data-live="auditOk">${payload.audit ? (payload.audit.ok ? "pass" : "fail") : "—"}</span></strong><span data-live="auditN">${payload.audit?.cases.length ?? 0}</span><span>cases</span></div>
              </div>
            </a>
            <a class="card card-link" href="/smoke">
              <h3>CIL / smoke</h3>
              <div class="nums">
                <div><strong><span class="pill ${payload.smoke?.ok ? "ok" : "fail"}" data-live="smokeOk">${payload.smoke ? (payload.smoke.ok ? "pass" : "fail") : "—"}</span></strong><span data-live="smokeN">${payload.smoke?.cases.length ?? 0}</span><span>cases</span></div>
              </div>
            </a>
            <a class="card card-link" href="/run">
              <h3>Run (GitHub)</h3>
              <div class="nums">
                <div><strong>${payload.runCounts.live}</strong><span>live</span></div>
                <div><strong>${payload.runCounts.failed}</strong><span>failed</span></div>
                <div><strong>${payload.runCounts.queued}</strong><span>queued</span></div>
              </div>
            </a>
            <a class="card card-link" href="/failures">
              <h3>Deploy fails</h3>
              <div class="nums">
                <div><strong data-live="failn">${payload.failures.length}</strong><span>inbox</span></div>
                <div><strong data-live="toFix">${payload.toFix.length}</strong><span>codes 7d</span></div>
              </div>
            </a>
            <a class="card card-link" href="/logs">
              <h3>Scanner</h3>
              <div class="nums">
                <div><strong><span class="pill ${junk200 ? "fail" : "ok"}">${junk200 || "ok"}</span></strong><span>${junk200 ? "junk 200s" : "no junk 200"}</span></div>
              </div>
            </a>
          </div>
          <h3>What to fix (7d)</h3>
          ${toFix}
          <p class="empty">API probe = isolate alive, not D1/R2. Status has the four probes.</p>
          <h2>Information</h2>
          <div class="score">
            <div class="card">
              <h3>Time to URL</h3>
              <div class="nums">
                <div><strong data-live="t2uP5024">${escapeHtml(formatT2u(t2u.last24h.p50Ms))}</strong><span>p50 24h · n <span data-live="t2uN24">${t2u.last24h.n}</span></span></div>
                <div><strong data-live="t2uP9524">${escapeHtml(formatT2u(t2u.last24h.p95Ms))}</strong><span>p95 24h</span></div>
                <div><strong data-live="t2uP507">${escapeHtml(formatT2u(t2u.last7d.p50Ms))}</strong><span>p50 7d · n <span data-live="t2uN7">${t2u.last7d.n}</span></span></div>
                <div><strong data-live="t2uP957">${escapeHtml(formatT2u(t2u.last7d.p95Ms))}</strong><span>p95 7d</span></div>
              </div>
            </div>
            <div class="card">
              <h3>Deploys 24h</h3>
              <div class="nums">
                <div><strong data-live="ok24">${payload.successes24h}</strong><span>ok</span></div>
                <div><strong data-live="fail24">${payload.failures24h}</strong><span>fail</span></div>
                <div><strong data-live="rate24">${escapeHtml(pct(payload.rate))}</strong><span>rate</span></div>
              </div>
            </div>
            <div class="card">
              <h3>Deploys 7d</h3>
              <div class="nums">
                <div><strong data-live="ok7">${payload.successes7d}</strong><span>ok</span></div>
                <div><strong data-live="fail7">${payload.failures7d}</strong><span>fail</span></div>
                <div><strong data-live="rate7">${escapeHtml(pct(payload.rate7d))}</strong><span>rate</span></div>
              </div>
            </div>
          </div>
          ${t2uDays}
          <p class="empty">Machine clock: Worker → URL. Bar: p50 &lt; 3s · p95 &lt; 10s.</p>
          <h3>Day strip</h3>
          ${days}
          <h3>Product</h3>
          <div class="stat-grid">
            <a class="card card-link" href="/sites"><strong data-live="sites">${s.sites}</strong><span>sites</span></a>
            <a class="card card-link" href="/sites?filter=claimed"><strong data-live="claimed">${s.claimed}</strong><span>claimed</span></a>
            <a class="card card-link" href="/users?filter=external"><strong data-live="users">${s.users}</strong><span>users</span></a>
            <a class="card card-link" href="/domains"><strong data-live="domains">${s.domains}</strong><span>domains</span></a>
            <a class="card card-link" href="/sites?filter=served24h"><strong data-live="active24h">${s.active24h}</strong><span>served 24h</span></a>
            <a class="card card-link" href="/sites"><strong data-live="views7d">${payload.views.d7}</strong><span>views 7d</span></a>
            <a class="card card-link" href="/sites"><strong data-live="deploysMtd">${s.deploysMtd}</strong><span>deploys MTD</span></a>
            <a class="card card-link" href="/users#waitlist"><strong data-live="waitlist">${s.waitlist}</strong><span>waitlist</span></a>
          </div>
          <div class="score">
            <a class="card card-link" href="/cf">
              <h3>CF practices</h3>
              <div class="nums">
                <div><strong><span class="pill ${payload.cfPractices.ok ? "ok" : "fail"}" data-live="cfOk">${payload.cfPractices.ok ? "pass" : "fail"}</span></strong><span data-live="cfN">${payload.cfPractices.cases.length}</span><span>checks · daily</span></div>
              </div>
            </a>
          </div>
          <h3>Cloudflare cost (MTD)</h3>
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
            <div class="card">
              <h3>WfP trigger</h3>
              <div class="nums">
                <div><strong><span class="pill ${payload.wfp.status === "switch" ? "fail" : payload.wfp.status === "watch" ? "warn" : "ok"}" data-live="wfpStatus">${escapeHtml(payload.wfp.status)}</span></strong><span>vs $5 Paid</span></div>
                <div><strong data-live="siteWorkers">${payload.wfp.siteWorkers}</strong><span>site Workers / ${payload.wfp.watchAt} watch · ${payload.wfp.cap} cap</span></div>
              </div>
              <p class="cost-note" data-live="wfpWhy">${escapeHtml(payload.wfp.why)} Static Drop is not this count. ADR-TEMP-ACCOUNTS.</p>
            </div>
          </div>
          <h3>By source (7d)</h3>
          ${sources}
        </section>
        <section class="panel${activePanel === "audit" ? " is-active" : ""}" id="audit">
          <h2>Audit</h2>
          ${renderAuditSection(payload.audit, payload.auditHistory)}
        </section>
        <section class="panel${activePanel === "smoke" ? " is-active" : ""}" id="smoke">
          <h2>Smoke</h2>
          ${renderSmokeSection(payload.smoke, payload.smokeHistory)}
        </section>
        <section class="panel${activePanel === "run" ? " is-active" : ""}" id="run">
          <h2>Run</h2>
          ${renderRunSection(payload.runJobs, payload.runCounts)}
        </section>
        <section class="panel${activePanel === "failures" ? " is-active" : ""}" id="failures">
          <h2>Failures</h2>
          <p class="empty">Click the error code → why / files / retry. <code>needs_container</code> on Drop/upload means use Run with a public GitHub URL; <code>not_a_site</code> is an honest detect fail.</p>
          ${rows}
        </section>
        <section class="panel${activePanel === "status-probes" ? " is-active" : ""}" id="status-probes">
          <h2>Status probes</h2>
          <p class="empty">Public status is API, website, static hello, MCP. Express fixture and other try-URL canaries stay here — Hide only drops a row from the public list.</p>
          ${renderStatusProbes(payload.statusProbes)}
        </section>
        <section class="panel${activePanel === "logs" ? " is-active" : ""}" id="logs">
          <h2>Probes</h2>
          <p class="empty">Scanner hits from owner site_logs (path + country, no IP). Last 7 days.</p>
          ${renderProbeHits(payload.probes)}
          <h2>Workers Logs</h2>
          <p class="logs">One Cursor MCP call is two streams:
            <a href="${CF_LOGS_API}">aft-page-api</a> (host + deploy) ·
            <a href="${CF_LOGS_MCP}">aft-page-mcp</a> (protocol / Zod).
          </p>
        </section>
        <section class="panel${activePanel === "sites" ? " is-active" : ""}" id="sites">
          <h2>Sites</h2>
          <h3>Traffic</h3>
          ${renderVisitsSection(payload.visits)}
          <h3>Inventory</h3>
          ${renderSitesTable(payload.sites, root, siteOwner)}
        </section>
        <section class="panel${activePanel === "users" ? " is-active" : ""}" id="users">
          <h2>Users</h2>
          <p class="empty">Requested custom domains sort first. Approve here.</p>
          ${renderUsersTable(payload.users, userFilter)}
          <h3 id="waitlist">Waitlist</h3>
          <p class="empty">Homepage email capture. Not accounts.</p>
          ${renderWaitlistTable(payload.waitlist)}
        </section>
        <section class="panel${activePanel === "domains" ? " is-active" : ""}" id="domains">
          <h2>Domains</h2>
          ${renderDomainsTable(payload.domains, root)}
        </section>
        <section class="panel${activePanel === "feedback" ? " is-active" : ""}" id="feedback">
          <h2>Feedback</h2>
          ${notes}
        </section>
        <section class="panel${activePanel === "cf" ? " is-active" : ""}" id="cf">
          <h2>Cloudflare</h2>
          ${renderCfPractices(payload.cfPractices)}
        </section>
        <section class="panel${activePanel === "network" ? " is-active" : ""}" id="network">
          <h2>Network</h2>
          ${renderNetworkDiagram()}
        </section>
        <section class="panel${activePanel === "stories" ? " is-active" : ""}" id="stories">
          <h2>Stories</h2>
          <p class="empty">Shipped one-liners. What a person can do — not a second product host.</p>
          ${renderStories()}
        </section>
        <section class="panel${activePanel === "distribute" ? " is-active" : ""}" id="distribute">
          <h2>Distribute</h2>
          ${renderDistribute(checklistDone)}
        </section>
        <section class="panel${activePanel === "todos" ? " is-active" : ""}" id="todos">
          <h2>30-day checklist</h2>
          ${renderTodos(checklistDone)}
        </section>
      </div>
    </div>
    <p class="cil">We follow <a href="https://llis.nasa.gov/lesson/803">NASA LLIS 803</a> — identify critical items early, keep a list, test or name the gap. This page is that list.</p>
  </div>
  <script>
    (function () {
      var tabs = ${JSON.stringify([...OPS_HUB_PANELS])};
      var initial = ${JSON.stringify(activePanel)};
      function pathFor(name) {
        return name === "overview" ? "/overview" : "/" + name;
      }
      function panelFromPath() {
        var p = (location.pathname || "/").replace(/\\/+$/, "") || "/";
        if (p === "/" || p === "") return "overview";
        if (p === "/visits") return "sites";
        var seg = p.slice(1);
        if (seg === "visits") return "sites";
        return tabs.indexOf(seg) >= 0 ? seg : "overview";
      }
      function show(name, push, href) {
        if (name === "visits") name = "sites";
        if (tabs.indexOf(name) < 0) name = "overview";
        document.querySelectorAll(".hub-nav a").forEach(function (a) {
          var navHref = a.getAttribute("href") || "";
          var navPath = navHref.split("?")[0].split("#")[0];
          if (navPath === pathFor(name) || (name === "overview" && (navPath === "/" || navPath === "/overview"))) {
            a.setAttribute("aria-current", "page");
          } else a.removeAttribute("aria-current");
        });
        document.querySelectorAll(".hub-main .panel").forEach(function (p) {
          p.classList.toggle("is-active", p.id === name);
        });
        var search = "";
        var hash = "";
        if (href) {
          var noHash = href.split("#")[0];
          search = noHash.indexOf("?") >= 0 ? "?" + noHash.split("?")[1] : "";
          hash = href.indexOf("#") >= 0 ? href.slice(href.indexOf("#")) : "";
        } else if (!push) {
          search = name === "sites" || name === "users" ? location.search : "";
          hash = location.hash || "";
        }
        if (name === "users" && !new URLSearchParams(search).get("filter")) {
          search = (search ? search + "&" : "?") + "filter=external";
        }
        var next = pathFor(name) + search + hash;
        var here = location.pathname + location.search + location.hash;
        if (here !== next) {
          if (push) history.pushState(null, "", next);
          else history.replaceState(null, "", next);
        }
        applySiteFilter(
          name === "sites" ? new URLSearchParams(search).get("filter") || "all" : "all",
          name === "sites" ? new URLSearchParams(search).get("owner") || "" : "",
        );
        applyUserFilter(name === "users" ? new URLSearchParams(search).get("filter") || "external" : "external");
        if (hash.length > 1) {
          var el = document.getElementById(hash.slice(1));
          if (el) el.scrollIntoView({ block: "start" });
        }
      }
      function applySiteFilter(f, owner) {
        var root = document.querySelector("[data-site-filters]");
        if (!root) return;
        if (!f || !root.querySelector('[data-filter="' + f + '"]')) f = "all";
        owner = String(owner || "").trim().toLowerCase();
        root.querySelectorAll("[data-filter]").forEach(function (x) {
          if (x.getAttribute("data-filter") === f) x.setAttribute("aria-current", "true");
          else x.removeAttribute("aria-current");
        });
        document.querySelectorAll("[data-sites] tbody tr").forEach(function (tr) {
          var claimed = tr.getAttribute("data-claimed") === "1";
          var active = tr.getAttribute("data-active") === "1";
          var gc = tr.getAttribute("data-gc") === "1";
          var served24 = tr.getAttribute("data-served24") === "1";
          var rowOwner = (tr.getAttribute("data-owner") || "").toLowerCase();
          var ownerOk = !owner || rowOwner === owner;
          var showRow =
            ownerOk &&
            (f === "all" ||
            (f === "claimed" && claimed) ||
            (f === "unclaimed" && !claimed) ||
            (f === "inactive" && !active) ||
            (f === "gc" && gc) ||
            (f === "served24h" && served24));
          tr.style.display = showRow ? "" : "none";
        });
      }
      function applyUserFilter(f) {
        var root = document.querySelector("[data-user-filters]");
        if (!root) return;
        if (!f || !root.querySelector('[data-user-filter="' + f + '"]')) f = "all";
        root.querySelectorAll("[data-user-filter]").forEach(function (x) {
          if (x.getAttribute("data-user-filter") === f) x.setAttribute("aria-current", "true");
          else x.removeAttribute("aria-current");
        });
        document.querySelectorAll("[data-users] tbody tr").forEach(function (tr) {
          var kind = tr.getAttribute("data-kind") || "external";
          tr.style.display = f === "all" || kind === f ? "" : "none";
        });
      }
      document.querySelector(".wrap").addEventListener("click", function (e) {
        var a = e.target.closest("a[href]");
        if (!a || a.getAttribute("target") === "_blank") return;
        var href = a.getAttribute("href") || "";
        if (href.charAt(0) !== "/") return;
        if (href.indexOf("//") === 0) return;
        var path = href.split("?")[0].split("#")[0];
        if (path === "/visits") {
          e.preventDefault();
          show("sites", true, "/sites");
          return;
        }
        var seg = path === "/" || path === "/overview" ? "overview" : path.replace(/^\\//, "");
        if (tabs.indexOf(seg) < 0) return;
        e.preventDefault();
        show(seg, true, href);
      });
      window.addEventListener("popstate", function () {
        show(panelFromPath(), false);
      });
      if (location.hash === "#visits" || location.pathname === "/visits") {
        show("sites", false, "/sites");
      } else if (location.hash && location.hash.length > 1) {
        var legacy = location.hash.slice(1);
        if (legacy === "visits") show("sites", false, "/sites");
        else if (tabs.indexOf(legacy) >= 0) show(legacy, false);
        else show(initial, false, location.pathname + location.search + location.hash);
      } else {
        show(initial, false, location.pathname + location.search + location.hash);
      }

      var filters = document.querySelector("[data-site-filters]");
      if (filters) {
        filters.addEventListener("click", function (e) {
          var b = e.target.closest("[data-filter]");
          if (!b) return;
          var f = b.getAttribute("data-filter") || "all";
          var owner = new URLSearchParams(location.search).get("owner") || "";
          applySiteFilter(f, owner);
          var q = [];
          if (f !== "all") q.push("filter=" + encodeURIComponent(f));
          if (owner) q.push("owner=" + encodeURIComponent(owner));
          var next = "/sites" + (q.length ? "?" + q.join("&") : "");
          if (location.pathname + location.search !== next) history.pushState(null, "", next);
        });
      }

      var userFilters = document.querySelector("[data-user-filters]");
      if (userFilters) {
        userFilters.addEventListener("click", function (e) {
          var b = e.target.closest("[data-user-filter]");
          if (!b) return;
          var f = b.getAttribute("data-user-filter") || "all";
          applyUserFilter(f);
          var next = "/users" + (f !== "all" ? "?filter=" + encodeURIComponent(f) : "");
          if (location.pathname + location.search !== next) history.pushState(null, "", next);
        });
      }

      (function visitsUi() {
        var root = document.querySelector("[data-visits-root]");
        if (!root) return;
        var loading = false;
        function esc(s) {
          return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        }
        function shortDay(iso) {
          var p = String(iso).split("-");
          return Number(p[1]) + "/" + Number(p[2]);
        }
        function shortHour(iso) {
          var d = new Date(iso);
          if (isNaN(d.getTime())) return String(iso).slice(11, 13) || iso;
          return String(d.getUTCHours()).padStart(2, "0") + "h";
        }
        function labelStep(n) {
          if (n <= 12) return 1;
          if (n <= 31) return 3;
          return 7;
        }
        function renderSeries(series, range) {
          if (!series || !series.length) return '<p class="empty">No page views in this window.</p>';
          var hourly = range === "24h";
          var max = 1;
          series.forEach(function (b) { if (b.n > max) max = b.n; });
          var step = labelStep(series.length);
          var cols = series.map(function (b, i) {
            var h = (b.n / max) * 100;
            var lab = (i % step === 0 || i === series.length - 1)
              ? esc(hourly ? shortHour(b.t) : shortDay(b.t))
              : "";
            var stack = b.n === 0
              ? '<span class="day-zero"></span>'
              : '<div class="day-stack" style="height:' + h + '%"><span class="day-ok" style="flex:1 1 0"></span></div>';
            return '<div class="day-col" title="' + esc(b.t + " — " + b.n + " views") + '">' +
              '<span class="day-n">' + (b.n || "") + '</span>' +
              '<div class="day-track">' + stack + '</div>' +
              '<span class="day-d">' + lab + '</span></div>';
          }).join("");
          return '<div class="day-chart" role="img" aria-label="HTML page views" data-visits-series>' +
            '<div class="day-legend"><span class="swatch ok"></span> HTML views (page_view)</div>' +
            '<div class="day-cols" style="grid-template-columns: repeat(' + series.length + ', minmax(0, 1fr))">' + cols + '</div></div>';
        }
        function renderCountries(countries) {
          if (!countries || !countries.length) {
            return '<p class="empty" data-visits-countries>No serve-by-country rows in this window.</p>';
          }
          var max = 1;
          countries.forEach(function (c) { if (c.n > max) max = c.n; });
          var rows = countries.map(function (c) {
            var pct = Math.round((c.n / max) * 100);
            return '<div class="country-row" title="' + esc(c.country + " — " + c.n) + '">' +
              '<span class="country-code">' + esc(c.country) + '</span>' +
              '<div class="country-track"><span class="country-bar" style="width:' + pct + '%"></span></div>' +
              '<span class="country-n">' + c.n + '</span></div>';
          }).join("");
          return '<div class="country-chart" role="img" aria-label="Serves by country" data-visits-countries>' +
            '<div class="day-legend"><span class="swatch ok"></span> serves by country (serve · blob4)</div>' + rows + '</div>';
        }
        function apply(v) {
          root.setAttribute("data-range", v.range);
          root.setAttribute("data-scope", v.scope);
          root.querySelectorAll("[data-visits-range]").forEach(function (b) {
            if (b.getAttribute("data-visits-range") === v.range) b.setAttribute("aria-current", "true");
            else b.removeAttribute("aria-current");
          });
          root.querySelectorAll("[data-visits-scope]").forEach(function (b) {
            if (b.getAttribute("data-visits-scope") === v.scope) b.setAttribute("aria-current", "true");
            else b.removeAttribute("aria-current");
          });
          var viewsEl = root.querySelector("[data-visits-views]");
          var servesEl = root.querySelector("[data-visits-serves]");
          var srcEl = root.querySelector("[data-visits-src]");
          if (viewsEl) viewsEl.textContent = v.viewsTotal || 0;
          if (servesEl) servesEl.textContent = v.servesTotal || 0;
          if (srcEl) srcEl.textContent = v.source || "—";
          var sw = root.querySelector("[data-visits-series-wrap]");
          var cw = root.querySelector("[data-visits-countries-wrap]");
          if (sw) sw.innerHTML = renderSeries(v.series || [], v.range);
          if (cw) cw.innerHTML = renderCountries(v.countries || []);
          var note = root.querySelector("[data-visits-note]");
          if (note) {
            if (!v.source) {
              note.textContent = v.error === "cf_api_token_missing"
                ? "CF_API_TOKEN missing — needs Account Analytics Engine Read. See METRICS.md for curl SQL."
                : "AE SQL unavailable" + (v.error ? " (" + v.error + ")" : "") + ". Cached KV views still on Overview.";
            } else {
              note.textContent = "HTML views ≠ serves-by-country (country only on serve). Cache ~5m." +
                (v.checkedAt ? " As of " + v.checkedAt + "." : "") +
                (v.error ? " Partial: " + v.error + "." : "");
            }
          }
        }
        async function load(range, scope) {
          if (loading) return;
          loading = true;
          try {
            var r = await fetch("/api/visits?range=" + encodeURIComponent(range) + "&scope=" + encodeURIComponent(scope), {
              credentials: "same-origin",
            });
            if (!r.ok) return;
            apply(await r.json());
          } catch (e) {}
          loading = false;
        }
        root.addEventListener("click", function (e) {
          var rb = e.target.closest("[data-visits-range]");
          var sb = e.target.closest("[data-visits-scope]");
          if (!rb && !sb) return;
          var range = rb ? rb.getAttribute("data-visits-range") : root.getAttribute("data-range");
          var scope = sb ? sb.getAttribute("data-visits-scope") : root.getAttribute("data-scope");
          load(range, scope);
        });
      })();

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
          set("waitlist", s.waitlist);
          set("sites", s.sites);
          set("claimed", s.claimed);
          set("users", s.users);
          set("domains", s.domains);
          set("active24h", s.active24h);
          set("views7d", (p.views && p.views.d7) || 0);
          set("deploysMtd", s.deploysMtd);
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
          set("cfN", (p.cfPractices && p.cfPractices.cases && p.cfPractices.cases.length) || 0);
          if (p.cfPractices) {
            set("cfOk", p.cfPractices.ok ? "pass" : "fail");
          }
          var w = p.wfp;
          if (w) {
            set("siteWorkers", w.siteWorkers);
            set("wfpStatus", w.status);
            set("wfpWhy", w.why + " Static Drop is not this count. ADR-TEMP-ACCOUNTS.");
            document.querySelectorAll('[data-live="wfpStatus"]').forEach(function (el) {
              el.className = "pill " + (w.status === "switch" ? "fail" : w.status === "watch" ? "warn" : "ok");
            });
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
            location.assign("/smoke");
          } catch (e) {
            go.disabled = false;
            go.textContent = "Run now";
          }
        });
      }
      var rgo = document.querySelector("[data-run-sample]");
      if (rgo) {
        rgo.addEventListener("click", async function () {
          rgo.disabled = true;
          rgo.textContent = "Trying 10…";
          try {
            var rr = await fetch("/api/run/sample", { method: "POST", credentials: "same-origin" });
            if (!rr.ok) throw new Error("http " + rr.status);
            location.assign("/run");
          } catch (e) {
            rgo.disabled = false;
            rgo.textContent = "Try 10 public repos";
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
            location.assign("/audit");
          } catch (e) {
            ago.disabled = false;
            ago.textContent = "Run now";
          }
        });
      }
      document.querySelectorAll("[data-check-id]").forEach(function (box) {
        box.addEventListener("change", async function () {
          var id = box.getAttribute("data-check-id");
          var list = box.getAttribute("data-check-list") || "todos";
          var done = !!box.checked;
          box.disabled = true;
          try {
            var r = await fetch("/api/checklist", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: id, done: done }),
            });
            if (!r.ok) throw new Error("http " + r.status);
            var j = await r.json();
            var p = j && j.progress ? j.progress.done + "/" + j.progress.total : "";
            var which = (j && j.list) || list;
            document.querySelectorAll('[data-check-progress="' + which + '"], [data-check-nav="' + which + '"]').forEach(function (el) {
              if (p) el.textContent = p;
            });
          } catch (e) {
            box.checked = !done;
          }
          box.disabled = false;
        });
      });
      document.querySelectorAll("[data-status-hide]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = Number(btn.getAttribute("data-status-hide"));
          var hidden = btn.getAttribute("data-hidden") !== "1";
          btn.disabled = true;
          try {
            var r = await fetch("/api/status/hide", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: id, hidden: hidden }),
            });
            if (!r.ok) throw new Error("http " + r.status);
            location.assign("/status-probes");
          } catch (e) {
            btn.disabled = false;
          }
        });
      });
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
