/** Worker bindings and config. */
export interface Env {
  SITES: KVNamespace;
  /** Public status.aft.page probe history. */
  STATUS?: KVNamespace;
  BUCKET?: R2Bucket;
  METRICS?: AnalyticsEngineDataset;
  DB: D1Database;
  EMAIL?: SendEmail;
  ROOT_DOMAIN: string;
  AUTH_SECRET: string;
  /** Google OAuth web client — optional; login page still has magic link. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Comma-separated founder emails allowed on ops.aft.page. */
  OPS_EMAILS?: string;
  /** Comma-separated slugs that skip Drop product caps (dogfood). */
  UNLIMITED_SLUGS?: string;
  /** Thin remote MCP Worker (mcp.aft.page). */
  MCP?: Fetcher;
  /** Account Analytics Read — live Workers request/CPU on ops. SSL + Custom Hostnames Write for domains. */
  CF_API_TOKEN?: string;
  /** aft.page zone — custom hostname API. */
  CF_ZONE_ID?: string;
  /** CNAME target customers point at (fallback origin). */
  CUSTOM_DOMAIN_CNAME?: string;
  /** Bearer token for POST ops.aft.page/api/smoke/run (npm run smoke). */
  SMOKE_SECRET?: string;
}

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

export const MAX_FILES = 200;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Higher per-file cap for worker / lattice-js / next deploys. */
export const MAX_FILES_RUNTIME = 200;
export const MAX_TOTAL_BYTES_RUNTIME = 50 * 1024 * 1024;
export const MAX_FILE_BYTES_RUNTIME = 10 * 1024 * 1024;

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
