/**
 * Founder mail via existing EMAIL binding → OPS_EMAILS (hello@).
 * Not Sentry. Not per-request 400 (Class B noise).
 */
import type { Env } from "./env";
import { parseCsvLower } from "./env";
import {
  countDeploysSince,
  countFailuresByError,
  countFailuresSince,
} from "./db";
import type { AuditRunResult } from "./audit";
import type { SmokeRunResult } from "./smoke";
import { filterPublicSnapshot, type StatusSnapshot } from "./status";

const KV_PREFIX = "ops:alert:";
export const OPS_ALERT_DEBOUNCE_S = 30 * 60;

export type OpsAlertKind = "500" | "smoke" | "audit" | "status" | "digest";

export function opsAlertRecipients(env: Env): string[] {
  return parseCsvLower(env.OPS_EMAILS);
}

/** api / ops / status / mcp — not tenant `*.aft.page` (their Worker 500 is not ours). */
export function isPlatformAlertHost(host: string, root: string): boolean {
  const h = host.toLowerCase();
  const r = root.toLowerCase();
  if (h === `api.${r}` || h === `ops.${r}` || h === `status.${r}` || h === `mcp.${r}`) {
    return true;
  }
  if (h.endsWith(".workers.dev")) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  return false;
}

export async function sendOpsAlert(
  env: Env,
  opts: {
    kind: OpsAlertKind;
    subject: string;
    text: string;
    key?: string;
    debounceSec?: number;
  },
): Promise<boolean> {
  if (!env.EMAIL) return false;
  const to = opsAlertRecipients(env);
  if (to.length === 0) return false;

  const key = `${KV_PREFIX}${opts.key || opts.kind}`;
  const debounceSec = opts.debounceSec ?? OPS_ALERT_DEBOUNCE_S;
  if (debounceSec > 0 && env.STATUS) {
    const hit = await env.STATUS.get(key);
    if (hit) return false;
  }

  const root = env.ROOT_DOMAIN || "aft.page";
  try {
    await env.EMAIL.send({
      to,
      from: { email: `claim@${root}`, name: "aft.page ops" },
      subject: opts.subject,
      text: opts.text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "ops_alert", kind: opts.kind, message }));
    return false;
  }

  if (debounceSec > 0 && env.STATUS) {
    await env.STATUS.put(key, new Date().toISOString(), { expirationTtl: debounceSec });
  }
  return true;
}

export async function alertPlatform500(
  env: Env,
  request: Request,
  res: Response,
): Promise<boolean> {
  const root = env.ROOT_DOMAIN || "aft.page";
  const url = new URL(request.url);
  if (!isPlatformAlertHost(url.hostname, root)) return false;
  if (res.status < 500) return false;

  const ray = request.headers.get("cf-ray") || request.headers.get("x-aft-request-id") || "";
  return sendOpsAlert(env, {
    kind: "500",
    key: `500:${url.hostname}:${url.pathname}:${res.status}`,
    subject: `[aft.page] ${res.status} ${url.hostname}${url.pathname}`,
    text: [
      `${request.method} ${url.origin}${url.pathname}`,
      `status ${res.status}`,
      ray ? `request ${ray}` : "",
      "",
      `https://ops.${root}/failures`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function alertUnhandled(
  env: Env,
  request: Request,
  err: unknown,
): Promise<boolean> {
  const root = env.ROOT_DOMAIN || "aft.page";
  const url = new URL(request.url);
  if (!isPlatformAlertHost(url.hostname, root)) return false;
  const message = err instanceof Error ? err.message : String(err);
  return sendOpsAlert(env, {
    kind: "500",
    key: `throw:${url.hostname}:${url.pathname}:${message.slice(0, 80)}`,
    subject: `[aft.page] throw ${url.hostname}${url.pathname}`,
    text: [
      `${request.method} ${url.origin}${url.pathname}`,
      message,
      "",
      `https://ops.${root}/`,
    ].join("\n"),
  });
}

export async function alertIfSmokeFailed(
  env: Env,
  result: SmokeRunResult,
): Promise<boolean> {
  if (result.ok) return false;
  const root = env.ROOT_DOMAIN || "aft.page";
  const failed = result.cases
    .filter((c) => !c.ok)
    .map((c) => `${c.id}: ${c.detail}`)
    .join("\n");
  return sendOpsAlert(env, {
    kind: "smoke",
    key: `smoke:${result.id}`,
    debounceSec: 7 * 24 * 60 * 60,
    subject: `[aft.page] smoke FAIL (${result.trigger})`,
    text: [
      `${result.finishedAt} · ${result.ms} ms · ${result.id}`,
      failed || "(no case detail)",
      "",
      `https://ops.${root}/smoke`,
    ].join("\n"),
  });
}

export async function alertIfAuditFailed(
  env: Env,
  result: AuditRunResult,
): Promise<boolean> {
  if (result.ok) return false;
  const root = env.ROOT_DOMAIN || "aft.page";
  const failed = result.cases
    .filter((c) => !c.ok)
    .map((c) => `${c.id}: ${c.detail}`)
    .join("\n");
  return sendOpsAlert(env, {
    kind: "audit",
    key: `audit:${result.id}`,
    debounceSec: 7 * 24 * 60 * 60,
    subject: `[aft.page] hijack FAIL (${result.trigger})`,
    text: [
      `${result.finishedAt} · ${result.ms} ms · ${result.id}`,
      failed || "(no case detail)",
      "",
      `https://ops.${root}/audit`,
    ].join("\n"),
  });
}

export async function alertIfStatusMajor(
  env: Env,
  snapshot: StatusSnapshot,
): Promise<boolean> {
  const publicSnap = filterPublicSnapshot(snapshot);
  if (publicSnap.overall !== "major_outage") return false;
  const root = env.ROOT_DOMAIN || "aft.page";
  const bad = publicSnap.components
    .filter((c) => !c.ok)
    .map((c) => `${c.id} ${c.httpStatus ?? "—"} ${c.error || ""}`.trim())
    .join("\n");
  return sendOpsAlert(env, {
    kind: "status",
    key: "status:major",
    subject: `[aft.page] status major_outage`,
    text: [
      snapshot.checkedAt,
      bad || publicSnap.overall,
      "",
      `https://status.${root}/`,
    ].join("\n"),
  });
}

/** Once per UTC day, only if there were deploy rejects. Class B, not an outage. */
export async function maybeSendDeployDigest(env: Env): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const day = new Date().toISOString().slice(0, 10);
  const [okN, failN, byError] = await Promise.all([
    countDeploysSince(env, since),
    countFailuresSince(env, since),
    countFailuresByError(env, 1),
  ]);
  if (failN === 0) return false;
  const root = env.ROOT_DOMAIN || "aft.page";
  const lines = byError.map((c) => `${c.error} × ${c.n}`).join("\n");
  return sendOpsAlert(env, {
    kind: "digest",
    key: `digest:${day}`,
    debounceSec: 36 * 60 * 60,
    subject: `[aft.page] 24h deploy ${okN} ok / ${failN} fail`,
    text: [
      "Class B digest — not an outage. Named-client rate is the health number.",
      "",
      lines || `${failN} fails`,
      "",
      `https://ops.${root}/failures`,
    ].join("\n"),
  });
}
