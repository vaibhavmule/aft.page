/**
 * Ops visits charts — AE SQL read path for page_view series + serve-by-country.
 */
import type { Env } from "./env";

export const CF_ACCOUNT_AE = "44255ec64e0080b678670b53bf810d27";
export const AE_DATASET = "aft_page_metrics";
export const HELLO_SLUGS = ["hello", "vite-hello", "next-hello"] as const;
export const VISITS_KV_TTL_SEC = 5 * 60;
export const COUNTRY_TOP_N = 15;

export type VisitsRange = "24h" | "7d" | "30d" | "90d";
export type VisitsScope = "hello" | "all";

export type VisitBucket = { t: string; n: number };
export type CountryCount = { country: string; n: number };

export type VisitsPayload = {
  range: VisitsRange;
  scope: VisitsScope;
  source: "ae" | null;
  checkedAt: string | null;
  viewsTotal: number;
  servesTotal: number;
  series: VisitBucket[];
  countries: CountryCount[];
  error: string | null;
};

const RANGES: VisitsRange[] = ["24h", "7d", "30d", "90d"];
const SCOPES: VisitsScope[] = ["hello", "all"];

export function parseVisitsRange(raw: string | null | undefined): VisitsRange {
  const v = (raw || "").trim().toLowerCase();
  return (RANGES as string[]).includes(v) ? (v as VisitsRange) : "7d";
}

export function parseVisitsScope(raw: string | null | undefined): VisitsScope {
  const v = (raw || "").trim().toLowerCase();
  return (SCOPES as string[]).includes(v) ? (v as VisitsScope) : "all";
}

export function visitsCacheKey(scope: VisitsScope, range: VisitsRange): string {
  return `ops:visits:${scope}:${range}`;
}

function rangeInterval(range: VisitsRange): { sql: string; hourly: boolean; days: number } {
  switch (range) {
    case "24h":
      return { sql: "INTERVAL '1' DAY", hourly: true, days: 1 };
    case "7d":
      return { sql: "INTERVAL '7' DAY", hourly: false, days: 7 };
    case "30d":
      return { sql: "INTERVAL '30' DAY", hourly: false, days: 30 };
    case "90d":
      return { sql: "INTERVAL '90' DAY", hourly: false, days: 90 };
  }
}

function slugFilterSql(scope: VisitsScope): string {
  if (scope === "all") return "";
  const list = HELLO_SLUGS.map((s) => `'${s}'`).join(", ");
  return ` AND blob3 IN (${list})`;
}

/** Normalize AE timestamp / day string to UTC hour ISO or YYYY-MM-DD. */
export function normalizeBucketKey(raw: unknown, hourly: boolean): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!hourly) {
    const day = s.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }
  // AE often returns "YYYY-MM-DD HH:MM:SS"
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const withZ = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const d = new Date(withZ);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export function fillHourWindow(
  rows: VisitBucket[],
  hours = 24,
  now = new Date(),
): VisitBucket[] {
  const map = new Map(rows.map((r) => [r.t, r.n]));
  const out: VisitBucket[] = [];
  const end = new Date(now);
  end.setUTCMinutes(0, 0, 0);
  for (let i = hours - 1; i >= 0; i--) {
    const t = new Date(end.getTime() - i * 3_600_000).toISOString();
    out.push({ t, n: map.get(t) || 0 });
  }
  return out;
}

export function fillDaySeries(
  rows: VisitBucket[],
  days: number,
  now = new Date(),
): VisitBucket[] {
  const map = new Map(rows.map((r) => [r.t, r.n]));
  const out: VisitBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const key = d.toISOString().slice(0, 10);
    out.push({ t: key, n: map.get(key) || 0 });
  }
  return out;
}

/** Top N countries; remainder → Other. Empty country → XX. */
export function rollupCountries(
  rows: CountryCount[],
  topN = COUNTRY_TOP_N,
): CountryCount[] {
  const cleaned = rows
    .map((r) => ({
      country: (r.country || "").trim().toUpperCase() || "XX",
      n: Math.max(0, Math.round(Number(r.n) || 0)),
    }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.country.localeCompare(b.country));
  if (cleaned.length <= topN) return cleaned;
  const top = cleaned.slice(0, topN);
  const other = cleaned.slice(topN).reduce((a, r) => a + r.n, 0);
  if (other > 0) top.push({ country: "Other", n: other });
  return top;
}

type AeSqlJson = {
  data?: Record<string, unknown>[];
  rows?: number;
  errors?: { message?: string }[];
  error?: string;
};

export async function queryAeSql(
  token: string,
  sql: string,
  accountId = CF_ACCOUNT_AE,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
      {
        method: "POST",
        signal: ac.signal,
        headers: { authorization: `Bearer ${token}` },
        body: sql,
      },
    );
    const text = await res.text();
    let body: AeSqlJson;
    try {
      body = JSON.parse(text) as AeSqlJson;
    } catch {
      return { rows: [], error: `ae_sql_bad_json:${res.status}` };
    }
    if (!res.ok) {
      const msg =
        body.error ||
        body.errors?.[0]?.message ||
        `ae_sql_http_${res.status}`;
      return { rows: [], error: msg };
    }
    return { rows: Array.isArray(body.data) ? body.data : [], error: null };
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError"
      ? "ae_sql_timeout"
      : "ae_sql_fetch_failed";
    return { rows: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function emptyVisits(
  range: VisitsRange,
  scope: VisitsScope,
  error: string | null,
): VisitsPayload {
  const { hourly, days } = rangeInterval(range);
  return {
    range,
    scope,
    source: null,
    checkedAt: null,
    viewsTotal: 0,
    servesTotal: 0,
    series: hourly ? fillHourWindow([], 24) : fillDaySeries([], days),
    countries: [],
    error,
  };
}

function buildSeriesSql(range: VisitsRange, scope: VisitsScope): string {
  const { sql: interval, hourly } = rangeInterval(range);
  const bucket = hourly
    ? "toStartOfInterval(timestamp, INTERVAL '1' HOUR)"
    : "toStartOfInterval(timestamp, INTERVAL '1' DAY)";
  return `SELECT
  ${bucket} AS t,
  SUM(_sample_interval) AS n
FROM ${AE_DATASET}
WHERE index1 = 'page_view'
  AND timestamp > NOW() - ${interval}${slugFilterSql(scope)}
GROUP BY t
ORDER BY t`;
}

function buildCountrySql(range: VisitsRange, scope: VisitsScope): string {
  const { sql: interval } = rangeInterval(range);
  return `SELECT
  blob4 AS country,
  SUM(_sample_interval) AS n
FROM ${AE_DATASET}
WHERE index1 = 'serve'
  AND timestamp > NOW() - ${interval}${slugFilterSql(scope)}
GROUP BY country
ORDER BY n DESC
LIMIT 50`;
}

function parseSeriesRows(
  rows: Record<string, unknown>[],
  hourly: boolean,
): VisitBucket[] {
  const out: VisitBucket[] = [];
  for (const row of rows) {
    const t = normalizeBucketKey(row.t, hourly);
    if (!t) continue;
    out.push({ t, n: Math.max(0, Math.round(Number(row.n) || 0)) });
  }
  return out;
}

function parseCountryRows(rows: Record<string, unknown>[]): CountryCount[] {
  return rows.map((row) => ({
    country: String(row.country ?? ""),
    n: Math.max(0, Math.round(Number(row.n) || 0)),
  }));
}

async function fetchVisitsFromAe(
  token: string,
  range: VisitsRange,
  scope: VisitsScope,
  now = new Date(),
): Promise<VisitsPayload> {
  const { hourly, days } = rangeInterval(range);
  const [seriesRes, countryRes] = await Promise.all([
    queryAeSql(token, buildSeriesSql(range, scope)),
    queryAeSql(token, buildCountrySql(range, scope)),
  ]);
  const err = seriesRes.error || countryRes.error;
  if (err && !seriesRes.rows.length && !countryRes.rows.length) {
    return emptyVisits(range, scope, err);
  }
  const rawSeries = parseSeriesRows(seriesRes.rows, hourly);
  const series = hourly
    ? fillHourWindow(rawSeries, 24, now)
    : fillDaySeries(rawSeries, days, now);
  const countries = rollupCountries(parseCountryRows(countryRes.rows));
  return {
    range,
    scope,
    source: "ae",
    checkedAt: now.toISOString(),
    viewsTotal: series.reduce((a, b) => a + b.n, 0),
    servesTotal: countries.reduce((a, b) => a + b.n, 0),
    series,
    countries,
    error: err,
  };
}

async function readVisitsCache(
  kv: KVNamespace,
  scope: VisitsScope,
  range: VisitsRange,
): Promise<VisitsPayload | null> {
  const raw = await kv.get(visitsCacheKey(scope, range));
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as VisitsPayload;
    if (!j || !Array.isArray(j.series) || !Array.isArray(j.countries)) return null;
    return j;
  } catch {
    return null;
  }
}

async function writeVisitsCache(
  kv: KVNamespace,
  payload: VisitsPayload,
): Promise<void> {
  await kv.put(
    visitsCacheKey(payload.scope, payload.range),
    JSON.stringify(payload),
    { expirationTtl: VISITS_KV_TTL_SEC },
  );
}

/** Load visits for ops (AE SQL + 5m STATUS KV cache). */
export async function loadVisitsPayload(
  env: Env,
  opts?: { range?: VisitsRange; scope?: VisitsScope; now?: Date },
): Promise<VisitsPayload> {
  const range = opts?.range ?? "7d";
  const scope = opts?.scope ?? "all";
  const now = opts?.now ?? new Date();

  if (env.STATUS) {
    const cached = await readVisitsCache(env.STATUS, scope, range);
    if (cached) return cached;
  }

  if (!env.CF_API_TOKEN) {
    return emptyVisits(range, scope, "cf_api_token_missing");
  }

  const payload = await fetchVisitsFromAe(env.CF_API_TOKEN, range, scope, now);
  if (env.STATUS && payload.source === "ae") {
    try {
      await writeVisitsCache(env.STATUS, payload);
    } catch {
      /* cache miss next time is fine */
    }
  }
  return payload;
}
