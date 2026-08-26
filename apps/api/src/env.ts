/**
 * Bindings from `wrangler types` (worker-configuration.d.ts).
 * Secrets are wrangler secrets — not in jsonc — so they are merged here.
 */
type SecretBindings = {
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  CF_API_TOKEN?: string;
  /** Set to "1" in Vitest so post-deploy thumbs never schedule waitUntil. */
  AFT_DISABLE_THUMB?: string;
  AFT_RUN_GITHUB_TOKEN?: string;
  AFT_RUN_GITHUB_REPO?: string;
  /** Base URL for the container Run worker (Sandbox). Prefer RUN_CONTAINER service binding. */
  AFT_RUN_CONTAINER_URL?: string;
  /** Service binding to aft-run-container (Worker-to-Worker; avoids custom-domain 522). */
  RUN_CONTAINER?: Fetcher;
  AFT_AI_GATEWAY?: string;
  AI?: {
    run: (
      model: string,
      inputs: unknown,
      options?: { gateway?: { id: string } },
    ) => Promise<unknown>;
  };
};

declare global {
  namespace Cloudflare {
    interface Env extends SecretBindings {}
  }
  interface Env extends SecretBindings {}
}

export type Env = Cloudflare.Env;

export function parseCsvLower(raw?: string): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export type SiteMeta = {
  deployId: string;
  createdAt: string;
  fileCount: number;
  runtime?: string;
  upstreamUrl?: string | null;
  mainModule?: string | null;
  badge?: boolean;
};

// Product caps. CF Workers request body is 100 MiB — JSON/base64 can 413 first.
export const MAX_FILES = 500;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Same caps for worker / next deploys (CF body still binds). */
export const MAX_FILES_RUNTIME = 500;
export const MAX_TOTAL_BYTES_RUNTIME = 100 * 1024 * 1024;
export const MAX_FILE_BYTES_RUNTIME = 25 * 1024 * 1024;

export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "mail",
  "ftp",
  "cdn",
  "static",
  "admin",
  "dashboard",
  "status",
  "ops",
  "docs",
  "login",
  "mcp",
  "sales",
  "drop",
  "cname",
  "aft",
  "aft-page",
  "ai",
  "cron",
  "job",
  "jobs",
  "schedule",
  "schedules",
  "automation",
  "automations",
  "brief",
  "plugin",
  "plugins",
  "claim",
  "auth",
  "preview",
  "blog",
  "help",
  "support",
  "test",
]);
