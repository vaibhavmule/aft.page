/**
 * Ops CF tab — Workers / platform best-practice checks.
 * Cron refreshes at most once per STALE_MS (status cron is every 5m).
 * https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
 */
import type { Env } from "./env";

export const CF_PRACTICES_KV_KEY = "ops:cf-practices";
/** Keep in sync with apps/api/wrangler.jsonc compatibility_date. */
export const API_COMPAT_DATE = "2026-07-26";
const STALE_MS = 20 * 60 * 60 * 1000;
const DOCS =
  "https://developers.cloudflare.com/workers/best-practices/workers-best-practices/";

export type CfPracticeCase = {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
};

export type CfPracticesResult = {
  ok: boolean;
  checkedAt: string;
  docs: string;
  cases: CfPracticeCase[];
};

export function compatDateFresh(date: string, now = new Date(), days = 180): boolean {
  const t = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t < days * 86_400_000;
}

function nodeCompatOn(): boolean {
  const p = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof p?.versions?.node === "string";
}

function caseOf(id: string, name: string, ok: boolean, detail: string): CfPracticeCase {
  return { id, name, ok, detail };
}

export async function runCfPracticeChecks(
  env: Env,
  now = new Date(),
): Promise<CfPracticesResult> {
  const cases: CfPracticeCase[] = [];

  if (!env.DB) {
    cases.push(caseOf("d1", "D1 binding", false, "missing"));
  } else {
    try {
      await env.DB.prepare("SELECT 1 AS n").first<{ n: number }>();
      cases.push(caseOf("d1", "D1 binding", true, "SELECT 1"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cases.push(caseOf("d1", "D1 binding", false, message));
    }
  }

  cases.push(caseOf("r2", "R2 binding", Boolean(env.BUCKET), env.BUCKET ? "aft-page-sites" : "missing"));
  cases.push(caseOf("kv_sites", "KV SITES", Boolean(env.SITES), env.SITES ? "bound" : "missing"));
  cases.push(caseOf("kv_status", "KV STATUS", Boolean(env.STATUS), env.STATUS ? "bound" : "missing"));
  cases.push(
    caseOf("metrics", "Analytics Engine", Boolean(env.METRICS), env.METRICS ? "aft_page_metrics" : "missing"),
  );
  cases.push(caseOf("email", "Email binding", Boolean(env.EMAIL), env.EMAIL ? "bound" : "missing"));

  if (!env.MCP) {
    cases.push(caseOf("mcp_bind", "MCP service binding", false, "missing"));
  } else {
    try {
      const res = await env.MCP.fetch(
        new Request("https://mcp.aft.page/health", { signal: AbortSignal.timeout(4000) }),
      );
      const body = (await res.json()) as { ok?: boolean };
      const ok = res.ok && body.ok === true;
      cases.push(caseOf("mcp_bind", "MCP service binding", ok, ok ? "health ok" : `http ${res.status}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cases.push(caseOf("mcp_bind", "MCP service binding", false, message));
    }
  }

  const secretsOk = Boolean(env.AUTH_SECRET?.trim() && env.SMOKE_SECRET?.trim());
  cases.push(
    caseOf(
      "secrets",
      "Wrangler secrets",
      secretsOk,
      secretsOk ? "AUTH_SECRET + SMOKE_SECRET" : "unset",
    ),
  );

  cases.push(
    caseOf(
      "nodejs_compat",
      "nodejs_compat",
      nodeCompatOn(),
      nodeCompatOn() ? `node ${((globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node || "").trim()}` : "process missing",
    ),
  );

  const dateOk = compatDateFresh(API_COMPAT_DATE, now);
  cases.push(
    caseOf(
      "compat_date",
      "compatibility_date < 6mo",
      dateOk,
      API_COMPAT_DATE,
    ),
  );

  cases.push(
    caseOf(
      "saas_zone",
      "CF zone (custom hostnames)",
      Boolean(env.CF_ZONE_ID?.trim()),
      env.CF_ZONE_ID?.trim() ? "CF_ZONE_ID set" : "missing",
    ),
  );

  return {
    ok: cases.every((c) => c.ok),
    checkedAt: now.toISOString(),
    docs: DOCS,
    cases,
  };
}

export async function loadCfPractices(env: Env): Promise<CfPracticesResult | null> {
  if (!env.STATUS) return null;
  const raw = await env.STATUS.get(CF_PRACTICES_KV_KEY);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as CfPracticesResult;
    if (!Array.isArray(j.cases) || typeof j.checkedAt !== "string") return null;
    return {
      ok: j.ok === true,
      checkedAt: j.checkedAt,
      docs: typeof j.docs === "string" ? j.docs : DOCS,
      cases: j.cases.filter(
        (c) => c && typeof c.id === "string" && typeof c.name === "string",
      ),
    };
  } catch {
    return null;
  }
}

export async function saveCfPractices(env: Env, result: CfPracticesResult): Promise<void> {
  if (!env.STATUS) return;
  await env.STATUS.put(CF_PRACTICES_KV_KEY, JSON.stringify(result));
}

export async function loadOrRunCfPractices(env: Env): Promise<CfPracticesResult> {
  const prev = await loadCfPractices(env);
  if (prev) return prev;
  const next = await runCfPracticeChecks(env);
  await saveCfPractices(env, next);
  return next;
}

export async function refreshCfPracticesIfStale(env: Env, now = new Date()): Promise<CfPracticesResult> {
  const prev = await loadCfPractices(env);
  if (prev && now.getTime() - Date.parse(prev.checkedAt) < STALE_MS) return prev;
  const next = await runCfPracticeChecks(env, now);
  await saveCfPractices(env, next);
  return next;
}
