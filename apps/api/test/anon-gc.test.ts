/** Unclaimed sites: keep serving until 30d idle, then hard-delete. */
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  ensureLoginSentinelSite,
  findOrCreateUser,
} from "../src/auth";
import { sweepUnusedAnonSites } from "../src/anon-gc";
import { getSiteRow, setSiteActive } from "../src/db";
import { deployPaste, fetchSite } from "./helpers";

const NOW = Date.parse("2026-08-09T12:00:00.000Z");

async function backdate(
  slug: string,
  daysAgo: number,
  lastServedDaysAgo?: number | null,
): Promise<void> {
  const updated = new Date(NOW - daysAgo * 86400000).toISOString();
  const served =
    lastServedDaysAgo == null
      ? null
      : new Date(NOW - lastServedDaysAgo * 86400000).toISOString();
  await env.DB.prepare(
    `UPDATE sites SET updated_at = ?, last_served_at = ? WHERE slug = ?`,
  )
    .bind(updated, served, slug)
    .run();
}

describe("sweepUnusedAnonSites", () => {
  it("deletes at 30d idle, keeps 8d / visited / claimed, unpauses leftover park", async () => {
    const idle8 = await deployPaste("<h1>idle8</h1>", "agc-idle8");
    const idle31 = await deployPaste("<h1>idle31</h1>", "agc-idle31");
    const fresh = await deployPaste("<h1>fresh</h1>", "agc-fresh");
    const visited = await deployPaste("<h1>visited</h1>", "agc-visited");
    const claimed = await deployPaste("<h1>claimed</h1>", "agc-claimed");
    const parked = await deployPaste("<h1>parked</h1>", "agc-parked");
    const user = await findOrCreateUser(env, "agc-owner@example.com");
    expect(await assignSiteOwner(env, claimed.slug, user.id)).toBe(true);
    await ensureLoginSentinelSite(env);

    await backdate(idle8.slug, 8);
    await backdate(idle31.slug, 31);
    await backdate(fresh.slug, 2);
    await backdate(visited.slug, 40, 1);
    await backdate(claimed.slug, 40);
    expect(await setSiteActive(env, parked.slug, false)).toBe(true);
    await backdate(parked.slug, 10);

    const out = await sweepUnusedAnonSites(env, NOW);
    expect(out.deleted).toBeGreaterThanOrEqual(1);
    expect(out.unpaused).toBeGreaterThanOrEqual(1);

    expect((await getSiteRow(env, idle8.slug))?.active).toBe(true);
    expect((await fetchSite(idle8.slug)).status).toBe(200);
    expect(await getSiteRow(env, idle31.slug)).toBeNull();
    expect((await getSiteRow(env, fresh.slug))?.active).toBe(true);
    expect((await getSiteRow(env, visited.slug))?.active).toBe(true);
    expect((await getSiteRow(env, claimed.slug))?.active).toBe(true);
    expect((await getSiteRow(env, parked.slug))?.active).toBe(true);
    expect((await fetchSite(parked.slug)).status).toBe(200);
    expect(await getSiteRow(env, "_login")).not.toBeNull();
  });
});
