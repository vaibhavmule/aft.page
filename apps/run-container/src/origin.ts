/** Keep in sync with apps/api/src/container-origin.ts */
export const CONTAINER_PUBLISH_PORT = 8080;

export function sandboxIdForJob(jobId: string): string {
  return `run-${jobId}`.replace(/[^a-z0-9-]/g, "-").slice(0, 60);
}

export function isSandboxId(id: string): boolean {
  return /^[a-z0-9-]{1,60}$/.test(id) && !id.includes("..");
}
