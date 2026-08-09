import { waitUntil } from "cloudflare:workers";
import type { Env } from "./env";
import { junkPathLikeBinds, junkPathSqlOr } from "./junk-path";

export const SITE_LOG_RETENTION_DAYS = 7;
const MAX_PATH = 200;

export type SiteLogRow = {
  createdAt: string;
  method: string;
  path: string;
  status: number;
  bytes: number | null;
  country: string | null;
};

/** Document / API hits and any error. Skip successful static assets. */
export function shouldKeepOwnerLog(path: string, status: number): boolean {
  if (status >= 400) return true;
  const p = (path || "/").split("?")[0] || "/";
  if (p === "/api" || p.startsWith("/api/")) return true;
  const last = p.split("/").filter(Boolean).pop() || "";
  if (!last.includes(".")) return true;
  return /\.html?$/i.test(last);
}

export async function insertSiteLog(
  env: Pick<Env, "DB">,
  row: {
    slug: string;
    method: string;
    path: string;
    status: number;
    bytes?: number;
    country?: string;
    createdAt?: string;
  },
): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO site_logs (slug, created_at, method, path, status, bytes, country)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.slug,
      row.createdAt ?? new Date().toISOString(),
      (row.method || "GET").slice(0, 16),
      (row.path || "/").slice(0, MAX_PATH),
      row.status,
      row.bytes ?? null,
      (row.country || "").slice(0, 8) || null,
    )
    .run();
}

export async function listSiteLogs(
  env: Pick<Env, "DB">,
  slug: string,
  limit = 100,
): Promise<SiteLogRow[]> {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT created_at, method, path, status, bytes, country
     FROM site_logs WHERE slug = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(slug, Math.min(Math.max(limit, 1), 200))
    .all<{
      created_at: string;
      method: string;
      path: string;
      status: number;
      bytes: number | null;
      country: string | null;
    }>();
  return (results || []).map((r) => ({
    createdAt: r.created_at,
    method: r.method,
    path: r.path,
    status: r.status,
    bytes: r.bytes,
    country: r.country,
  }));
}

export type ObsWindow = "12h" | "7d";

export type ObsBucket = {
  t: string;
  ok: number;
  fourxx: number;
  fivexx: number;
  bytes: number;
};

export function parseObsWindow(raw: string | null): ObsWindow {
  return raw === "7d" ? "7d" : "12h";
}

export function obsCutoffIso(window: ObsWindow, now = Date.now()): string {
  const ms = window === "7d" ? 7 * 86_400_000 : 12 * 3_600_000;
  return new Date(now - ms).toISOString();
}

function bucketKey(iso: string, window: ObsWindow): string {
  return window === "7d" ? iso.slice(0, 10) : iso.slice(0, 13);
}

function fillObsBuckets(
  grouped: Map<string, Omit<ObsBucket, "t">>,
  window: ObsWindow,
  now = Date.now(),
): ObsBucket[] {
  const out: ObsBucket[] = [];
  const step = window === "7d" ? 86_400_000 : 3_600_000;
  const n = window === "7d" ? 7 : 12;
  for (let i = n - 1; i >= 0; i--) {
    const iso = new Date(now - i * step).toISOString();
    const key = bucketKey(iso, window);
    const g = grouped.get(key) || { ok: 0, fourxx: 0, fivexx: 0, bytes: 0 };
    out.push({
      t: window === "7d" ? `${key}T00:00:00.000Z` : `${key}:00:00.000Z`,
      ...g,
    });
  }
  return out;
}

/** Hourly (12h) or daily (7d) request mix from owner logs. 4xx/5xx are complete; 2xx omit successful assets. */
export async function loadSiteObservability(
  env: Pick<Env, "DB">,
  slug: string,
  window: ObsWindow,
  now = Date.now(),
): Promise<{
  window: ObsWindow;
  buckets: ObsBucket[];
  totals: { ok: number; fourxx: number; fivexx: number; bytes: number; requests: number };
}> {
  const empty = {
    window,
    buckets: fillObsBuckets(new Map(), window, now),
    totals: { ok: 0, fourxx: 0, fivexx: 0, bytes: 0, requests: 0 },
  };
  if (!env.DB) return empty;
  const keyLen = window === "7d" ? 10 : 13;
  const { results } = await env.DB.prepare(
    `SELECT substr(created_at, 1, ?) AS bucket,
            SUM(CASE WHEN status < 400 THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END) AS fourxx,
            SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS fivexx,
            COALESCE(SUM(bytes), 0) AS bytes
     FROM site_logs
     WHERE slug = ? AND created_at >= ?
     GROUP BY bucket`,
  )
    .bind(keyLen, slug, obsCutoffIso(window, now))
    .all<{
      bucket: string;
      ok: number;
      fourxx: number;
      fivexx: number;
      bytes: number;
    }>();
  const grouped = new Map<string, Omit<ObsBucket, "t">>();
  for (const r of results || []) {
    grouped.set(r.bucket, {
      ok: Number(r.ok) || 0,
      fourxx: Number(r.fourxx) || 0,
      fivexx: Number(r.fivexx) || 0,
      bytes: Number(r.bytes) || 0,
    });
  }
  const buckets = fillObsBuckets(grouped, window, now);
  const totals = buckets.reduce(
    (a, b) => ({
      ok: a.ok + b.ok,
      fourxx: a.fourxx + b.fourxx,
      fivexx: a.fivexx + b.fivexx,
      bytes: a.bytes + b.bytes,
      requests: a.requests + b.ok + b.fourxx + b.fivexx,
    }),
    { ok: 0, fourxx: 0, fivexx: 0, bytes: 0, requests: 0 },
  );
  return { window, buckets, totals };
}

export type ProbeHitRow = {
  slug: string;
  path: string;
  status: number;
  country: string | null;
  n: number;
  firstAt: string;
  lastAt: string;
};

export async function listProbeHits(
  env: Pick<Env, "DB">,
  sinceIso: string,
  limit = 50,
): Promise<ProbeHitRow[]> {
  if (!env.DB) return [];
  const likes = junkPathLikeBinds();
  const { results } = await env.DB.prepare(
    `SELECT slug, path, status, country, COUNT(*) AS n,
            MIN(created_at) AS first_at, MAX(created_at) AS last_at
     FROM site_logs
     WHERE created_at >= ? AND (${junkPathSqlOr("path")})
     GROUP BY slug, path, status, country
     ORDER BY last_at DESC
     LIMIT ?`,
  )
    .bind(sinceIso, ...likes, Math.min(Math.max(limit, 1), 100))
    .all<{
      slug: string;
      path: string;
      status: number;
      country: string | null;
      n: number;
      first_at: string;
      last_at: string;
    }>();
  return (results || []).map((r) => ({
    slug: r.slug,
    path: r.path,
    status: Number(r.status),
    country: r.country,
    n: Number(r.n) || 0,
    firstAt: r.first_at,
    lastAt: r.last_at,
  }));
}

export async function pruneSiteLogs(env: Pick<Env, "DB">): Promise<void> {
  if (!env.DB) return;
  const cutoff = new Date(
    Date.now() - SITE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await env.DB.prepare(`DELETE FROM site_logs WHERE created_at < ?`)
    .bind(cutoff)
    .run();
}

/** Fire-and-forget. No IP. */
// ponytail: one D1 write per document/error; 7d prune. Per-slug cap if a public site gets slashdotted.
export function queueOwnerLog(
  env: Pick<Env, "DB">,
  request: Request,
  slug: string,
  opts: { httpStatus: number; path?: string; bytes?: number },
): void {
  if (!env.DB) return;
  if (!shouldKeepOwnerLog(opts.path || "/", opts.httpStatus)) return;
  const task = insertSiteLog(env, {
    slug,
    method: request.method || "GET",
    path: opts.path || "/",
    status: opts.httpStatus,
    bytes: opts.bytes,
    country: request.headers.get("cf-ipcountry") || "",
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "site_log", message }));
  });
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}
