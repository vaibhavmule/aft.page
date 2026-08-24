/**
 * Deploy-time page screenshots → R2 (`__aft/thumb.jpg`).
 * Public sites only; private keeps letter fallback in the hub.
 *
 * Uses Cloudflare Browser Rendering REST (/screenshot) via CF_API_TOKEN.
 * Soft-fail: missing token or capture errors never block deploy.
 */
import { waitUntil } from "cloudflare:workers";
import type { Env } from "./env";
import { getSiteVisibility } from "./db";
import { getObject, putObject } from "./storage";
import { liveSiteUrl } from "./site-url";

export const THUMB_PATH = "__aft/thumb.jpg";

export function siteThumbPath(): string {
  return THUMB_PATH;
}

export function siteThumbUrl(
  slug: string,
  rootDomain: string,
  deployId?: string | null,
): string {
  const root = (rootDomain || "aft.page").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const base = `https://${slug}.${root}/${THUMB_PATH}`;
  return deployId ? `${base}?d=${encodeURIComponent(deployId)}` : base;
}

async function screenshotViaBrowser(
  env: Env,
  pageUrl: string,
): Promise<ArrayBuffer | null> {
  if (!env.BROWSER) return null;
  const res = await env.BROWSER.quickAction("screenshot", {
    url: pageUrl,
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 12000 },
    viewport: { width: 1280, height: 800 },
    screenshotOptions: { type: "jpeg", quality: 72, fullPage: false },
  });
  if (!res.ok) {
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "thumb.screenshot.quick",
        status: res.status,
        body: (await res.text().catch(() => "")).slice(0, 200),
      }),
    );
    return null;
  }
  return res.arrayBuffer();
}

async function screenshotViaRest(
  env: Env,
  pageUrl: string,
): Promise<ArrayBuffer | null> {
  const token = env.CF_API_TOKEN;
  const accountId = env.CF_ACCOUNT_ID;
  if (!token || !accountId) return null;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: pageUrl,
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 12000 },
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      screenshotOptions: { type: "jpeg", quality: 72, fullPage: false },
    }),
  });

  if (!res.ok) {
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "thumb.screenshot.rest",
        status: res.status,
        body: (await res.text().catch(() => "")).slice(0, 200),
      }),
    );
    return null;
  }

  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "thumb.screenshot.rest",
        body: (await res.text().catch(() => "")).slice(0, 200),
      }),
    );
    return null;
  }

  return res.arrayBuffer();
}

async function screenshotJpeg(
  env: Env,
  pageUrl: string,
): Promise<ArrayBuffer | null> {
  try {
    const viaBrowser = await screenshotViaBrowser(env, pageUrl);
    if (viaBrowser && viaBrowser.byteLength >= 64) return viaBrowser;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "thumb.screenshot.browser",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
  return screenshotViaRest(env, pageUrl);
}

/** True when Browser Rendering or REST screenshot can run for real. */
export function canCaptureSiteThumb(env: Env): boolean {
  // Vitest: explicit flag and/or test AUTH_SECRET — never schedule waitUntil thumbs.
  if (env.AFT_DISABLE_THUMB === "1") return false;
  if (env.AUTH_SECRET === "test-auth-secret-for-vitest-only") return false;
  if (env.BROWSER) return true;
  const token = env.CF_API_TOKEN?.trim();
  const account = env.CF_ACCOUNT_ID?.trim();
  return Boolean(token && account);
}

export async function captureSiteThumb(
  env: Env,
  opts: {
    slug: string;
    deployId: string;
    visibility?: string | null;
    /** Skip post-deploy warm wait (backfill of already-live sites). */
    skipWarmWait?: boolean;
  },
): Promise<boolean> {
  if (!canCaptureSiteThumb(env)) return false;
  const visibility =
    opts.visibility ?? (await getSiteVisibility(env, opts.slug));
  if (visibility === "private") return false;

  const root = env.ROOT_DOMAIN || "aft.page";
  const pageUrl = liveSiteUrl(opts.slug, root);
  // Brief pause so a brand-new deploy is reachable before headless loads it.
  if (!opts.skipWarmWait) {
    await new Promise((r) => setTimeout(r, 1500));
  }
  const jpeg = await screenshotJpeg(env, pageUrl);
  if (!jpeg || jpeg.byteLength < 64) return false;

  await putObject(env, opts.slug, opts.deployId, THUMB_PATH, jpeg, "image/jpeg");
  return true;
}

/** Fire-and-forget after a successful deploy. */
export function scheduleSiteThumb(
  env: Env,
  opts: { slug: string; deployId: string; visibility?: string | null },
): void {
  if (!canCaptureSiteThumb(env)) return;
  const task = captureSiteThumb(env, opts).catch((err) => {
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "thumb.schedule",
        slug: opts.slug,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  });
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}

export type ThumbBackfillRow = {
  slug: string;
  deployId: string;
  visibility: string;
};

export type ThumbBackfillResult = {
  ok: boolean;
  total: number;
  captured: number;
  skipped: number;
  failed: number;
  errors: Array<{ slug: string; error: string }>;
};

/** Public, active, non-test sites with a deploy id — candidates for hub thumbs. */
export async function listPublicSitesForThumbs(
  env: Env,
  limit = 500,
): Promise<ThumbBackfillRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT slug, deploy_id, COALESCE(visibility, 'public') AS visibility
     FROM sites
     WHERE COALESCE(visibility, 'public') != 'private'
       AND COALESCE(active, 1) = 1
       AND deploy_id IS NOT NULL
       AND deploy_id != ''
       AND slug NOT LIKE 'test--%'
       AND slug NOT LIKE 'test-%'
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(Math.min(Math.max(limit, 1), 1000))
    .all<{ slug: string; deploy_id: string; visibility: string }>();

  return (results || []).map((r) => ({
    slug: r.slug,
    deployId: r.deploy_id,
    visibility: r.visibility === "private" ? "private" : "public",
  }));
}

async function thumbExists(
  env: Env,
  slug: string,
  deployId: string,
): Promise<boolean> {
  const obj = await getObject(env, slug, deployId, THUMB_PATH);
  return Boolean(obj);
}

/**
 * Capture thumbs for existing public sites (ops backfill).
 * Batched via limit/offset so each ops call stays under Worker wall-clock.
 */
export async function backfillSiteThumbs(
  env: Env,
  opts?: { force?: boolean; limit?: number; offset?: number },
): Promise<ThumbBackfillResult & { offset: number; nextOffset: number | null }> {
  const force = Boolean(opts?.force);
  const batchLimit = Math.min(Math.max(opts?.limit ?? 8, 1), 25);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const all = await listPublicSitesForThumbs(env, 1000);
  const rows = all.slice(offset, offset + batchLimit);
  const result: ThumbBackfillResult & {
    offset: number;
    nextOffset: number | null;
  } = {
    ok: true,
    total: all.length,
    captured: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    offset,
    nextOffset: offset + batchLimit < all.length ? offset + batchLimit : null,
  };

  if (!env.BROWSER && (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID)) {
    result.ok = false;
    result.failed = rows.length;
    result.errors.push({
      slug: "*",
      error: "BROWSER binding or CF_API_TOKEN+CF_ACCOUNT_ID required",
    });
    return result;
  }

  for (const row of rows) {
    try {
      if (!force && (await thumbExists(env, row.slug, row.deployId))) {
        result.skipped += 1;
        continue;
      }
      const ok = await captureSiteThumb(env, {
        slug: row.slug,
        deployId: row.deployId,
        visibility: row.visibility,
        skipWarmWait: true,
      });
      if (ok) result.captured += 1;
      else {
        result.failed += 1;
        result.errors.push({ slug: row.slug, error: "capture_failed" });
      }
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        slug: row.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  result.ok = result.failed === 0;
  return result;
}
