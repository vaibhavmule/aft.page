/** Worker bindings and config. */
export interface Env {
  SITES: KVNamespace;
  BUCKET?: R2Bucket;
  METRICS?: AnalyticsEngineDataset;
  DB: D1Database;
  EMAIL?: SendEmail;
  ROOT_DOMAIN: string;
  AUTH_SECRET: string;
}

export type SiteMeta = {
  deployId: string;
  createdAt: string;
  fileCount: number;
  runtime?: string;
  upstreamUrl?: string | null;
  mainModule?: string | null;
};

export const MAX_FILES = 50;
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Higher caps for worker / lattice-js / next deploys. */
export const MAX_FILES_RUNTIME = 200;
export const MAX_TOTAL_BYTES_RUNTIME = 25 * 1024 * 1024;
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
  "docs",
  "login",
]);
