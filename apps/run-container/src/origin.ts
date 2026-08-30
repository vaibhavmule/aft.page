/** Keep in sync with apps/api/src/container-origin.ts */
export const CONTAINER_PUBLISH_PORT = 8080;

/** Service-binding host the API uses. Public routes stay on run-container.aft.page. */
export const INTERNAL_RUN_HOST = "run-container.internal";

export function sandboxIdForJob(jobId: string): string {
  return `run-${jobId}`.replace(/[^a-z0-9-]/g, "-").slice(0, 60);
}

export function isSandboxId(id: string): boolean {
  return /^[a-z0-9-]{1,60}$/.test(id) && !id.includes("..");
}

export function isInternalRunHost(hostname: string): boolean {
  return hostname.toLowerCase() === INTERNAL_RUN_HOST;
}

/** Public POST /v1/rebind must not mint a raw origin. API already sends 8080. */
export function acceptRebind(
  body: unknown,
): { ok: true; sandboxId: string; port: number } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_json" };
  }
  const b = body as { sandbox_id?: unknown; port?: unknown };
  const sandboxId = typeof b.sandbox_id === "string" ? b.sandbox_id.trim() : "";
  if (!isSandboxId(sandboxId)) return { ok: false, error: "invalid_sandbox" };
  const port =
    b.port === undefined || b.port === null ? CONTAINER_PUBLISH_PORT : b.port;
  if (port !== CONTAINER_PUBLISH_PORT) return { ok: false, error: "invalid_port" };
  return { ok: true, sandboxId, port };
}
