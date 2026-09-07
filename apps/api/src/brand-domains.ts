/**
 * Brand-domain release watch (aft.dev / aft.app).
 *
 * Founder ops: once a day, ask the public RDAP registry whether the brand
 * domains are still registered, and store the answer in D1 so ops.aft.page
 * can show it. When either drops / changes hands the ops Domains panel flips.
 *
 * Ground truth is RDAP (RFC 7483) — public registry JSON, no key. Cloudflare
 * Registrar only knows domains inside our own account, so it cannot see these.
 * Source: https://data.iana.org/rdap/dns.json → .dev/.app → pubapi.registry.google.
 */
import type { Env } from "./env";
import { ensureDb } from "./db/core";
import {
  listBrandDomainWatch,
  upsertBrandDomainWatch,
  type BrandDomainWatchRow,
} from "./db/ops-reports";

export const BRAND_DOMAIN_CRON = "0 9 * * *";
export const BRAND_WATCH_DOMAINS = ["aft.dev", "aft.app"] as const;

/** RDAP per-TLD bootstrap base (IANA dns.json, 2026-09-06). */
const RDAP_BASES: Record<string, string> = {
  dev: "https://pubapi.registry.google/rdap/",
  app: "https://pubapi.registry.google/rdap/",
};

const RDAP_TIMEOUT_MS = 10_000;

export type BrandDomainStatus = "registered" | "available" | "unknown";

export type BrandDomainProbe = {
  domain: string;
  status: BrandDomainStatus;
  expiresAt?: string;
  registrar?: string;
  error?: string;
};

type RdapEntity = {
  roles?: string[];
  vcardArray?: ["vcard", Array<[string, unknown, string, string]>];
};

type RdapDomainResponse = {
  objectClassName?: string;
  status?: string[];
  events?: { eventAction?: string; eventDate?: string }[];
  entities?: RdapEntity[];
  errorCode?: number;
  title?: string;
};

function firstEventDate(body: RdapDomainResponse, action: string): string | undefined {
  const hit = (body.events || []).find((e) => e.eventAction === action);
  return hit?.eventDate;
}

/** Registrar "fn" vCard from the entity whose roles include "registrar". */
function registrarName(body: RdapDomainResponse): string | undefined {
  const reg = (body.entities || []).find((e) => (e.roles || []).includes("registrar"));
  const vcard = reg?.vcardArray?.[1];
  if (!vcard) return undefined;
  const fn = vcard.find((row) => row[0] === "fn");
  return fn ? fn[3] : undefined;
}

function tldBase(domain: string): string | undefined {
  const dot = domain.lastIndexOf(".");
  if (dot <= 0 || dot === domain.length - 1) return undefined;
  return RDAP_BASES[domain.slice(dot + 1).toLowerCase()];
}

/**
 * Pure RDAP → probe. `parseRdap` is the injectable fetch for tests.
 */
export function parseRdapResponse(
  domain: string,
  body: RdapDomainResponse | null,
  httpStatus: number,
): BrandDomainProbe {
  // A domain with no registration is a 404 "No match" (RFC 7483 §5).
  if (body == null || httpStatus === 404 || body.objectClassName !== "domain") {
    if (httpStatus === 404 || body?.objectClassName === "error") {
      return { domain, status: "available" };
    }
    return { domain, status: "unknown", error: `rdap http ${httpStatus}` };
  }
  const expiresAt = firstEventDate(body, "expiration");
  const registrar = registrarName(body);
  const active =
    Array.isArray(body.status) && body.status.length > 0
      ? body.status.some((s) => !s.toLowerCase().includes("inactive"))
      : true;
  return {
    domain,
    status: active ? "registered" : "unknown",
    expiresAt,
    registrar,
    error: active ? undefined : "rdap status inactive",
  };
}

export async function queryRdap(
  domain: string,
  fetchFn: typeof fetch = fetch,
): Promise<BrandDomainProbe> {
  const base = tldBase(domain);
  if (!base) {
    return { domain, status: "unknown", error: `no rdap base for ${domain}` };
  }
  let res: Response;
  try {
    res = await fetchFn(`${base}domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      domain,
      status: "unknown",
      error: err instanceof Error ? err.message.slice(0, 120) : "rdap fetch failed",
    };
  }
  let body: RdapDomainResponse | null = null;
  try {
    body = (await res.json()) as RdapDomainResponse;
  } catch {
    body = null;
  }
  return parseRdapResponse(domain, body, res.status);
}

/**
 * One daily pass over BRAND_WATCH_DOMAINS: query RDAP, upsert the row, and
 * bump changed_at only when status/expiry/registrar actually moved. Idempotent.
 */
export async function refreshBrandDomains(
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<BrandDomainProbe[]> {
  await ensureDb(env);
  const prev = new Map((await listBrandDomainWatch(env)).map((r) => [r.domain, r]));
  const checkedAt = new Date().toISOString();
  const out: BrandDomainProbe[] = [];

  for (const domain of BRAND_WATCH_DOMAINS) {
    const probe = await queryRdap(domain, fetchFn);
    const before = prev.get(domain);
    const changed =
      !before ||
      before.status !== probe.status ||
      (before.expiresAt || undefined) !== probe.expiresAt ||
      (before.registrar || undefined) !== probe.registrar;
    await upsertBrandDomainWatch(env, {
      domain,
      status: probe.status,
      expiresAt: probe.expiresAt ?? null,
      registrar: probe.registrar ?? null,
      error: probe.error ?? null,
      checkedAt,
      changedAt: changed ? checkedAt : before?.changedAt || checkedAt,
    });
    out.push(probe);
  }
  return out;
}

export type { BrandDomainWatchRow };
