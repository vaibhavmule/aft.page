/**
 * Public status.aft.page — probe store + HTML / JSON surface.
 */
import type { Env } from "./env";
import { json } from "./http";
import { serveSite } from "./serve";
import {
  BRAND,
  BRAND_CSS_VARS,
  BRAND_FONT_LINKS,
  BRAND_WORDMARK_CSS,
} from "./brand";

export type ComponentState = "operational" | "degraded" | "major_outage" | "unknown";
export type OverallState = "operational" | "degraded" | "major_outage" | "unknown";

export type ProbeDef = {
  id: string;
  name: string;
  description: string;
  /** Public URL shown on the status page. */
  url: string;
  /** How to judge a successful response. */
  expect: "health_json" | "http_ok";
  /** Skip edge fetch — check inside this Worker (avoids 522 self-fetch). */
  mode: "internal_api" | "internal_site" | "internal_mcp" | "external";
  /** Slug for internal_site probes. */
  siteSlug?: string;
};

export type ProbeResult = {
  id: string;
  name: string;
  description: string;
  url: string;
  ok: boolean;
  status: ComponentState;
  httpStatus: number | null;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
};

export type StatusSnapshot = {
  checkedAt: string;
  overall: OverallState;
  components: ProbeResult[];
};

export type DayStrip = {
  day: string; // YYYY-MM-DD UTC
  overall: OverallState;
  checks: number;
  failures: number;
};

export type ComponentView = ProbeResult & {
  uptimePercent: number | null;
  history: DayStrip[];
};

export type StatusPayload = {
  service: string;
  overall: OverallState;
  checkedAt: string | null;
  historyDays: number;
  components: ComponentView[];
  /** Overall aggregate strip (same window as components). */
  history: DayStrip[];
  recentFailures: ProbeResult[];
};

const LATEST_KEY = "latest";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STRIP_DAYS = 90;
const DEFAULT_FAILURE_LIMIT = 12;

export const STATUS_PROBES: ProbeDef[] = [
  {
    id: "api",
    name: "API",
    description: "This Worker process is up (does not check D1/R2)",
    url: "https://api.aft.page/health",
    expect: "health_json",
    mode: "internal_api",
  },
  {
    id: "www",
    name: "Website",
    description: "aft.page landing, login, and docs",
    url: "https://aft.page/",
    expect: "http_ok",
    mode: "external",
  },
  {
    id: "sites",
    name: "Site serve",
    description: "Hosted applications",
    url: "https://hello.aft.page/",
    expect: "http_ok",
    mode: "internal_site",
    siteSlug: "hello",
  },
  {
    id: "mcp",
    name: "MCP",
    description: "Remote agent deploy (mcp.aft.page)",
    url: "https://mcp.aft.page/health",
    expect: "health_json",
    mode: "internal_mcp",
  },
];

export function isStatusHost(host: string, root: string): boolean {
  return host === `status.${root}`;
}

export function componentStatus(ok: boolean, httpStatus: number | null): ComponentState {
  if (ok) return "operational";
  if (httpStatus !== null && httpStatus >= 500) return "major_outage";
  if (httpStatus !== null && httpStatus >= 400) return "degraded";
  return "major_outage";
}

export function overallFromComponents(components: ProbeResult[]): OverallState {
  if (components.length === 0) return "unknown";
  if (components.every((c) => c.status === "unknown")) return "unknown";
  if (components.some((c) => c.status === "major_outage")) return "major_outage";
  if (components.some((c) => c.status === "degraded" || c.status === "unknown")) {
    return "degraded";
  }
  return "operational";
}

export function overallLabel(state: OverallState): string {
  switch (state) {
    case "operational":
      return "All systems operational";
    case "degraded":
      return "Partial disruption";
    case "major_outage":
      return "Major outage";
    default:
      return "Status unknown";
  }
}

function resultFromResponse(
  def: ProbeDef,
  checkedAt: string,
  started: number,
  res: Response,
  bodyOk: boolean | null = null,
): ProbeResult {
  const latencyMs = Date.now() - started;
  let ok = res.ok;
  if (bodyOk !== null) ok = ok && bodyOk;
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    url: def.url,
    ok,
    status: componentStatus(ok, res.status),
    httpStatus: res.status,
    latencyMs,
    error: ok ? null : `unexpected_status_${res.status}`,
    checkedAt,
  };
}

function failResult(
  def: ProbeDef,
  checkedAt: string,
  started: number,
  message: string,
): ProbeResult {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    url: def.url,
    ok: false,
    status: "major_outage",
    httpStatus: null,
    latencyMs: Date.now() - started,
    error: message.slice(0, 200),
    checkedAt,
  };
}

async function probeOne(
  def: ProbeDef,
  env: Env,
  fetcher: typeof fetch,
): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();

  try {
    if (def.mode === "internal_api") {
      // This Worker is the API. If cron/status handlers run, the API process is up.
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        url: def.url,
        ok: true,
        status: "operational",
        httpStatus: 200,
        latencyMs: Date.now() - started,
        error: null,
        checkedAt,
      };
    }

    if (def.mode === "internal_site") {
      const slug = def.siteSlug || "hello";
      const root = env.ROOT_DOMAIN || "aft.page";
      const req = new Request(`https://${slug}.${root}/`, {
        method: "GET",
        headers: { "user-agent": "aft.page-status/1.0" },
      });
      const res = await serveSite(req, env, slug, "/");
      return resultFromResponse(def, checkedAt, started, res);
    }

    if (def.mode === "internal_mcp") {
      if (!env.MCP) {
        return failResult(def, checkedAt, started, "mcp_binding_missing");
      }
      const res = await env.MCP.fetch(
        new Request(def.url, {
          method: "GET",
          headers: { "user-agent": "aft.page-status/1.0" },
        }),
      );
      let bodyOk: boolean | null = null;
      if (def.expect === "health_json") {
        try {
          const body = (await res.clone().json()) as { ok?: boolean };
          bodyOk = body?.ok === true;
        } catch {
          bodyOk = false;
        }
      }
      return resultFromResponse(def, checkedAt, started, res, bodyOk);
    }

    const res = await fetcher(def.url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "aft.page-status/1.0" },
    });
    let bodyOk: boolean | null = null;
    if (def.expect === "health_json") {
      try {
        const body = (await res.clone().json()) as { ok?: boolean };
        bodyOk = body?.ok === true;
      } catch {
        bodyOk = false;
      }
    }
    return resultFromResponse(def, checkedAt, started, res, bodyOk);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failResult(def, checkedAt, started, message);
  }
}

export async function runProbes(
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<StatusSnapshot> {
  const components = await Promise.all(
    STATUS_PROBES.map((def) => probeOne(def, env, fetcher)),
  );
  return {
    checkedAt: new Date().toISOString(),
    overall: overallFromComponents(components),
    components,
  };
}

function statusKv(env: Env): KVNamespace | null {
  return env.STATUS ?? null;
}

export async function insertStatusSnapshot(
  env: Env,
  snapshot: StatusSnapshot,
): Promise<void> {
  if (!snapshot.components.length) {
    await env.DB.prepare(
      `INSERT INTO status_checks (
        checked_at, overall, component_id, component_name, component_description,
        url, ok, status, http_status, latency_ms, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        snapshot.checkedAt,
        snapshot.overall,
        "_snapshot",
        "snapshot",
        "",
        "",
        snapshot.overall === "operational" ? 1 : 0,
        snapshot.overall,
        null,
        0,
        null,
      )
      .run();
    return;
  }

  const stmt = env.DB.prepare(
    `INSERT INTO status_checks (
      checked_at, overall, component_id, component_name, component_description,
      url, ok, status, http_status, latency_ms, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await env.DB.batch(
    snapshot.components.map((c) =>
      stmt.bind(
        snapshot.checkedAt,
        snapshot.overall,
        c.id,
        c.name,
        c.description,
        c.url,
        c.ok ? 1 : 0,
        c.status,
        c.httpStatus,
        c.latencyMs,
        c.error,
      ),
    ),
  );
}

export async function clearStatusHistory(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM status_checks`).run();
  const kv = statusKv(env);
  if (kv) {
    await kv.delete(LATEST_KEY);
  }
}

export async function saveSnapshot(
  env: Env,
  snapshot: StatusSnapshot,
  opts: { reset?: boolean } = {},
): Promise<void> {
  if (opts.reset) {
    await clearStatusHistory(env);
  }

  await insertStatusSnapshot(env, snapshot);

  const kv = statusKv(env);
  if (kv) {
    await kv.put(LATEST_KEY, JSON.stringify(snapshot));
  }
}

export async function loadLatest(env: Env): Promise<StatusSnapshot | null> {
  const kv = statusKv(env);
  if (kv) {
    try {
      const raw = await kv.get(LATEST_KEY);
      if (raw) return JSON.parse(raw) as StatusSnapshot;
    } catch {
      /* fall through to D1 */
    }
  }

  const row = await env.DB.prepare(
    `SELECT checked_at, overall FROM status_checks ORDER BY checked_at DESC LIMIT 1`,
  ).first<{ checked_at: string; overall: OverallState }>();
  if (!row) return null;

  const components = await env.DB.prepare(
    `SELECT component_id, component_name, component_description, url, ok, status,
            http_status, latency_ms, error, checked_at
     FROM status_checks
     WHERE checked_at = ? AND component_id != '_snapshot'`,
  )
    .bind(row.checked_at)
    .all<{
      component_id: string;
      component_name: string;
      component_description: string;
      url: string;
      ok: number;
      status: ComponentState;
      http_status: number | null;
      latency_ms: number;
      error: string | null;
      checked_at: string;
    }>();

  return {
    checkedAt: row.checked_at,
    overall: row.overall,
    components: (components.results || []).map((c) => ({
      id: c.component_id,
      name: c.component_name,
      description: c.component_description,
      url: c.url,
      ok: c.ok === 1,
      status: c.status,
      httpStatus: c.http_status,
      latencyMs: c.latency_ms,
      error: c.error,
      checkedAt: c.checked_at,
    })),
  };
}

type DayAggRow = {
  day: string;
  checks: number;
  failures: number;
  severity: number;
};

function severityToOverall(severity: number): OverallState {
  if (severity >= 3) return "major_outage";
  if (severity >= 2) return "degraded";
  if (severity >= 1) return "operational";
  return "unknown";
}

export async function loadDayStrip(
  env: Env,
  days = DEFAULT_STRIP_DAYS,
  componentId?: string,
): Promise<DayStrip[]> {
  const start = new Date(Date.now() - (days - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const startIso = `${start}T00:00:00.000Z`;

  const rows = componentId
    ? await env.DB.prepare(
        `SELECT
           substr(checked_at, 1, 10) AS day,
           COUNT(*) AS checks,
           SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures,
           MAX(CASE status
             WHEN 'major_outage' THEN 3
             WHEN 'degraded' THEN 2
             WHEN 'operational' THEN 1
             ELSE 0
           END) AS severity
         FROM status_checks
         WHERE checked_at >= ? AND component_id = ?
         GROUP BY substr(checked_at, 1, 10)`,
      )
        .bind(startIso, componentId)
        .all<DayAggRow>()
    : await env.DB.prepare(
        `SELECT
           substr(checked_at, 1, 10) AS day,
           COUNT(DISTINCT checked_at) AS checks,
           COUNT(DISTINCT CASE WHEN overall != 'operational' THEN checked_at END) AS failures,
           MAX(CASE overall
             WHEN 'major_outage' THEN 3
             WHEN 'degraded' THEN 2
             WHEN 'operational' THEN 1
             ELSE 0
           END) AS severity
         FROM status_checks
         WHERE checked_at >= ?
         GROUP BY substr(checked_at, 1, 10)`,
      )
        .bind(startIso)
        .all<DayAggRow>();

  const byDay = new Map(
    (rows.results || []).map((r) => [
      r.day,
      {
        day: r.day,
        overall: severityToOverall(Number(r.severity) || 0),
        checks: Number(r.checks) || 0,
        failures: Number(r.failures) || 0,
      } satisfies DayStrip,
    ]),
  );

  const strips: DayStrip[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    strips.push(
      byDay.get(day) || { day, overall: "unknown", checks: 0, failures: 0 },
    );
  }
  return strips;
}

export async function loadComponentUptime(
  env: Env,
  componentId: string,
  days = DEFAULT_STRIP_DAYS,
): Promise<{ uptimePercent: number | null; history: DayStrip[] }> {
  const start = new Date(Date.now() - (days - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const startIso = `${start}T00:00:00.000Z`;

  const [stats, history] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok_count
       FROM status_checks
       WHERE component_id = ? AND checked_at >= ?`,
    )
      .bind(componentId, startIso)
      .first<{ total: number; ok_count: number }>(),
    loadDayStrip(env, days, componentId),
  ]);

  const total = Number(stats?.total) || 0;
  if (total === 0) {
    return { uptimePercent: null, history };
  }
  const okCount = Number(stats?.ok_count) || 0;
  return {
    uptimePercent: (okCount / total) * 100,
    history,
  };
}

export function formatUptimePercent(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return "No data yet";
  if (pct >= 100) return "100% uptime";
  if (pct <= 0) return "0% uptime";
  return `${pct.toFixed(3)}% uptime`;
}

/** Public status copy — keep D1/SQLite dumps in the store, not on status.aft.page. */
export function publicProbeError(error: string | null): string {
  if (!error) return "failed";
  if (/d1_|sqlite|no such (column|table)/i.test(error)) {
    return "Database unavailable (migration)";
  }
  if (error.startsWith("unexpected_status_")) {
    return `HTTP ${error.slice("unexpected_status_".length)}`;
  }
  if (error === "mcp_binding_missing") return "MCP unavailable";
  if (/timeout|timed out/i.test(error)) return "Timed out";
  if (/failed to fetch|network|dns|econnrefused/i.test(error)) return "Unreachable";
  if (error.length > 48 || /Error:|Exception| at /.test(error)) {
    return "Service unavailable";
  }
  return error;
}

function toPublicPayload(payload: StatusPayload): StatusPayload {
  return {
    ...payload,
    components: payload.components.map((c) => ({
      ...c,
      error: c.ok ? null : publicProbeError(c.error),
    })),
    recentFailures: payload.recentFailures.map((f) => ({
      ...f,
      error: publicProbeError(f.error),
    })),
  };
}

export async function loadRecentFailures(
  env: Env,
  limit = DEFAULT_FAILURE_LIMIT,
): Promise<ProbeResult[]> {
  const rows = await env.DB.prepare(
    `SELECT component_id, component_name, component_description, url, ok, status,
            http_status, latency_ms, error, checked_at
     FROM status_checks
     WHERE ok = 0 AND component_id != '_snapshot'
     ORDER BY checked_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      component_id: string;
      component_name: string;
      component_description: string;
      url: string;
      ok: number;
      status: ComponentState;
      http_status: number | null;
      latency_ms: number;
      error: string | null;
      checked_at: string;
    }>();

  return (rows.results || []).map((c) => ({
    id: c.component_id,
    name: c.component_name,
    description: c.component_description,
    url: c.url,
    ok: false,
    status: c.status,
    httpStatus: c.http_status,
    latencyMs: c.latency_ms,
    error: c.error,
    checkedAt: c.checked_at,
  }));
}

/** @deprecated Prefer loadDayStrip — kept for unit tests over in-memory snapshots. */
export function buildDayStrip(history: StatusSnapshot[], days = 7): DayStrip[] {
  const now = Date.now();
  const strips: DayStrip[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(now - i * DAY_MS);
    const day = start.toISOString().slice(0, 10);
    const dayStart = Date.parse(`${day}T00:00:00.000Z`);
    const dayEnd = dayStart + DAY_MS;
    const inDay = history.filter((h) => {
      const t = Date.parse(h.checkedAt);
      return t >= dayStart && t < dayEnd;
    });
    if (inDay.length === 0) {
      strips.push({ day, overall: "unknown", checks: 0, failures: 0 });
      continue;
    }
    const failures = inDay.filter((h) => h.overall !== "operational").length;
    const worst = inDay.reduce<OverallState>((acc, h) => {
      const order: OverallState[] = [
        "unknown",
        "operational",
        "degraded",
        "major_outage",
      ];
      return order.indexOf(h.overall) > order.indexOf(acc) ? h.overall : acc;
    }, "operational");
    strips.push({
      day,
      overall: worst,
      checks: inDay.length,
      failures,
    });
  }
  return strips;
}

/** @deprecated Prefer loadRecentFailures — kept for unit tests. */
export function recentFailures(
  history: StatusSnapshot[],
  limit = 12,
): ProbeResult[] {
  const failed: ProbeResult[] = [];
  for (let i = history.length - 1; i >= 0 && failed.length < limit; i--) {
    const snap = history[i]!;
    for (const c of snap.components) {
      if (!c.ok) {
        failed.push(c);
        if (failed.length >= limit) break;
      }
    }
  }
  return failed;
}

export async function buildPayload(
  env: Env,
  opts: { days?: number } = {},
): Promise<StatusPayload> {
  const days =
    opts.days && opts.days > 0 ? Math.min(opts.days, 365) : DEFAULT_STRIP_DAYS;
  let latest = await loadLatest(env);
  if (!latest) {
    latest = await runProbes(env);
    await saveSnapshot(env, latest);
  }
  const [history, failures, ...componentUptime] = await Promise.all([
    loadDayStrip(env, days),
    loadRecentFailures(env),
    ...latest.components.map((c) => loadComponentUptime(env, c.id, days)),
  ]);

  const components: ComponentView[] = latest.components.map((c, i) => ({
    ...c,
    uptimePercent: componentUptime[i]?.uptimePercent ?? null,
    history: componentUptime[i]?.history ?? [],
  }));

  return {
    service: "aft.page",
    overall: latest.overall,
    checkedAt: latest.checkedAt,
    historyDays: days,
    components,
    history,
    recentFailures: failures,
  };
}

export async function runStatusChecks(
  env: Env,
  fetcher: typeof fetch = fetch,
  opts: { reset?: boolean } = {},
): Promise<StatusSnapshot> {
  const snapshot = await runProbes(env, fetcher);
  await saveSnapshot(env, snapshot, opts);
  return snapshot;
}

export async function handleStatus(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
      },
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const refresh = url.searchParams.get("refresh") === "1";
  const reset = url.searchParams.get("reset") === "1";
  if (refresh || reset) {
    await runStatusChecks(env, fetch, { reset });
  }

  const daysParam = Number(url.searchParams.get("days") || "");
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;

  if (url.pathname === "/api.json" || url.pathname === "/api") {
    const payload = toPublicPayload(await buildPayload(env, { days }));
    const body = JSON.stringify(payload, null, 2);
    return new Response(request.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  }

  if (url.pathname === "/" || url.pathname === "") {
    const payload = toPublicPayload(await buildPayload(env, { days }));
    const html = renderStatusHtml(payload);
    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return json({ error: "not_found" }, 404);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stateClass(state: OverallState | ComponentState): string {
  return `state-${state.replace(/_/g, "-")}`;
}

function renderComponentStrip(history: DayStrip[], days: number): string {
  const bars = history
    .map((d) => {
      const title = `${d.day}: ${d.overall}${d.checks ? ` (${d.checks} checks)` : " (no data)"}`;
      return `<div class="day ${stateClass(d.overall)}" title="${escapeHtml(title)}"></div>`;
    })
    .join("");
  return `<div class="uptime-strip" style="--days:${days}" aria-hidden="true">${bars}</div>
      <div class="uptime-labels">
        <span>${days} days ago</span>
        <span>Today</span>
      </div>`;
}

export function renderStatusHtml(payload: StatusPayload): string {
  const overall = payload.overall;
  const days = payload.historyDays || DEFAULT_STRIP_DAYS;
  const checked = payload.checkedAt
    ? new Date(payload.checkedAt).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")
    : "—";

  const components = payload.components
    .map((c) => {
      const uptime = formatUptimePercent(c.uptimePercent ?? null);
      const strip = renderComponentStrip(c.history || [], days);
      return `<li class="component ${stateClass(c.status)}">
        <div class="component-top">
          <div class="component-heading">
            <h2>${escapeHtml(c.name)}</h2>
            <p class="uptime">${escapeHtml(uptime)}</p>
          </div>
          <span class="badge"><span class="dot" aria-hidden="true"></span>${escapeHtml(c.status.replace(/_/g, " "))}</span>
        </div>
        ${strip}
      </li>`;
    })
    .join("\n");

  const failures =
    payload.recentFailures.length === 0
      ? `<p class="empty">No recent failures.</p>`
      : `<ul class="failures">${payload.recentFailures
          .map(
            (f) =>
              `<li><span class="when">${escapeHtml(f.checkedAt)}</span> <strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.error || "failed")} <span class="code">${f.httpStatus ?? "—"}</span></li>`,
          )
          .join("")}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Status — aft.page</title>
  <meta name="description" content="Live status for aft.page API, MCP, website, and site serving." />
  <meta name="theme-color" content="${BRAND.void}" />
  <link rel="canonical" href="https://status.aft.page/" />
  ${BRAND_FONT_LINKS}
  <style>
    ${BRAND_CSS_VARS}
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--font-sans);
      background: var(--void);
      color: var(--ink);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }
    code { font-family: var(--font-mono); font-size: 0.85em; }
    .wrap {
      width: min(760px, calc(100% - 2rem));
      margin: 0 auto;
      padding: 2rem 0 4rem;
    }
    ${BRAND_WORDMARK_CSS}
    .brand { font-size: 1.35rem; }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 2.5rem;
    }
    .top-links { display: flex; gap: 1rem; color: var(--quiet); font-size: 0.9rem; font-weight: 500; }
    .top-links a { text-decoration: none; }
    .top-links a:hover { color: var(--ink); }
    .hero {
      padding: 1.75rem 0 2rem;
      border-bottom: 1px solid var(--line);
      margin-bottom: 2rem;
    }
    .hero h1 {
      margin: 0 0 0.5rem;
      font-size: clamp(1.6rem, 4vw, 2.1rem);
      letter-spacing: -0.03em;
      font-weight: 600;
    }
    .hero .lede { margin: 0; color: var(--quiet); }
    .overall {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      margin-top: 1.25rem;
      padding: 0.55rem 0.9rem;
      border-radius: 4px;
      border: 1px solid var(--line);
      background: var(--panel);
      font-weight: 600;
      font-size: 0.95rem;
    }
    .overall .dot, .component .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--faint);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--faint) 25%, transparent);
    }
    .state-operational .dot { background: var(--good); box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 25%, transparent); }
    .state-degraded .dot { background: var(--warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 25%, transparent); }
    .state-major-outage .dot { background: var(--bad); box-shadow: 0 0 0 3px color-mix(in srgb, var(--bad) 25%, transparent); }
    .state-unknown .dot { background: var(--faint); }
    .checked {
      margin: 0.85rem 0 0;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--faint);
    }
    .section-title {
      margin: 0 0 1rem;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--faint);
      font-weight: 600;
    }
    .components { list-style: none; margin: 0 0 2.5rem; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
    .component {
      padding: 1.15rem 1.2rem 1rem;
      border: 1px solid var(--line);
      border-radius: 0.4rem;
      background: var(--panel);
    }
    .component-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.85rem;
    }
    .component-heading { min-width: 0; }
    .component h2 { margin: 0; font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em; }
    .uptime {
      margin: 0.2rem 0 0;
      color: var(--quiet);
      font-size: 0.92rem;
      font-weight: 500;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      flex-shrink: 0;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--quiet);
      margin-top: 0.2rem;
    }
    .state-operational .badge { color: var(--good); }
    .state-degraded .badge { color: var(--warn); }
    .state-major-outage .badge { color: var(--bad); }
    .uptime-strip {
      display: grid;
      grid-template-columns: repeat(var(--days, 90), minmax(0, 1fr));
      gap: 1px;
      height: 2.1rem;
      width: 100%;
    }
    .day {
      min-width: 0;
      border-radius: 1px;
      background: var(--line);
    }
    .day.state-operational { background: color-mix(in srgb, var(--good) 70%, var(--panel)); }
    .day.state-degraded { background: color-mix(in srgb, var(--warn) 70%, var(--panel)); }
    .day.state-major-outage { background: color-mix(in srgb, var(--bad) 70%, var(--panel)); }
    .day.state-unknown { background: color-mix(in srgb, var(--line) 85%, var(--panel)); }
    .uptime-labels {
      display: flex;
      justify-content: space-between;
      margin: 0.4rem 0 0.65rem;
      font-size: 0.72rem;
      color: var(--faint);
    }
    .failures { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.55rem; }
    .failures li {
      padding: 0.75rem 0.9rem;
      border: 1px solid var(--line);
      border-radius: 0.35rem;
      font-size: 0.88rem;
      color: var(--quiet);
    }
    .failures .when { font-family: var(--font-mono); font-size: 0.72rem; color: var(--faint); display: block; margin-bottom: 0.2rem; }
    .failures .code { font-family: var(--font-mono); color: var(--faint); }
    .empty { color: var(--faint); font-size: 0.9rem; }
    .api-link {
      margin-top: 2.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--line);
      font-size: 0.88rem;
      color: var(--quiet);
    }
    .api-link a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; font-weight: 600; }
    .api-link a:hover { color: var(--quiet); }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="https://aft.page/">aft<span>.</span>page</a>
      <nav class="top-links" aria-label="Related">
        <a href="https://aft.page/">Home</a>
        <a href="https://aft.page/mcp">MCP</a>
        <a href="/api.json">API</a>
      </nav>
    </header>

    <section class="hero">
      <h1>System status</h1>
      <p class="lede">Live checks for the aft.page API, remote MCP, website, and hosted apps.</p>
      <div class="overall ${stateClass(overall)}">
        <span class="dot" aria-hidden="true"></span>
        ${escapeHtml(overallLabel(overall))}
      </div>
      <p class="checked">Last checked ${escapeHtml(checked)}</p>
    </section>

    <h2 class="section-title">Uptime</h2>
    <ul class="components">
      ${components}
    </ul>

    <h2 class="section-title">Recent failures</h2>
    ${failures}

    <p class="api-link">Machine-readable: <a href="/api.json">/api.json</a></p>
  </div>
</body>
</html>`;
}
