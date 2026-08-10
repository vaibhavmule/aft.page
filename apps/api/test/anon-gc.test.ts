/** Unclaimed sites: pause at 7d idle, delete at 30d. */
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  ensureLoginSentinelSite,
  findOrCreateUser,
} from "../src/auth";
import { sweepUnusedAnonSites } from "../src/anon-gc";
import { getSiteRow, setSiteActive } from "../src/db";
import { API_ORIGIN, call, deployPaste, fetchSite } from "./helpers";

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

function patchDeploy(slug: string, html: string, editToken: string): Request {
  return new Request(`${API_ORIGIN}/v1/deploy?slug=${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-aft-edit-token": editToken,
    },
    body: html,
  });
}

describe("sweepUnusedAnonSites", () => {
  it("pauses at 7d, deletes at 30d, skips claimed / login / fresh / recently served", async () => {
    const idle8 = await deployPaste("<h1>idle8</h1>", "agc-idle8");
    const idle31 = await deployPaste("<h1>idle31</h1>", "agc-idle31");
    const fresh = await deployPaste("<h1>fresh</h1>", "agc-fresh");
    const visited = await deployPaste("<h1>visited</h1>", "agc-visited");
    const claimed = await deployPaste("<h1>claimed</h1>", "agc-claimed");
    const user = await findOrCreateUser(env, "agc-owner@example.com");
    expect(await assignSiteOwner(env, claimed.slug, user.id)).toBe(true);
    await ensureLoginSentinelSite(env);

    await backdate(idle8.slug, 8);
    await backdate(idle31.slug, 31);
    await backdate(fresh.slug, 2);
    await backdate(visited.slug, 40, 1);
    await backdate(claimed.slug, 40);

    const out = await sweepUnusedAnonSites(env, NOW);
    expect(out.paused).toBeGreaterThanOrEqual(1);
    expect(out.deleted).toBeGreaterThanOrEqual(1);

    expect((await getSiteRow(env, idle8.slug))?.active).toBe(false);
    expect(await getSiteRow(env, idle31.slug)).toBeNull();
    expect((await getSiteRow(env, fresh.slug))?.active).toBe(true);
    expect((await getSiteRow(env, visited.slug))?.active).toBe(true);
    expect((await getSiteRow(env, claimed.slug))?.active).toBe(true);
    expect(await getSiteRow(env, "_login")).not.toBeNull();
  });

  it("idle pause shows not-in-use; redeploy and claim bring it back", async () => {
    const site = await deployPaste("<h1>park</h1>", "agc-park");
    await setSiteActive(env, site.slug, false);
    await env.DB.prepare(
      `UPDATE sites SET updated_at = ?, owner_user_id = NULL WHERE slug = ?`,
    )
      .bind(new Date(NOW - 10 * 86400000).toISOString(), site.slug)
      .run();

    const paused = await fetchSite(site.slug);
    expect(paused.status).toBe(503);
    const html = await paused.text();
    expect(html).toContain("This site is not in use");
    expect(html).toContain("permanently deleted after 30 days");
    expect(html).not.toContain("deactivated by its owner");

    const patch = await call(
      patchDeploy(site.slug, "<h1>back</h1>", site.editToken),
    );
    expect(patch.status).toBe(200);
    expect((await getSiteRow(env, site.slug))?.active).toBe(true);
    expect((await fetchSite(site.slug)).status).toBe(200);

    await setSiteActive(env, site.slug, false);
    const user = await findOrCreateUser(env, "agc-claim@example.com");
    const session = await createSession(env, user.id);
    const claim = await call(
      new Request(`${API_ORIGIN}/v1/claim/session`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://aft.page",
          cookie: `aft_session=${session.token}`,
        },
        body: JSON.stringify({ slug: site.slug, editToken: site.editToken }),
      }),
    );
    expect(claim.status).toBe(200);
    expect((await getSiteRow(env, site.slug))?.active).toBe(true);
  });
});
