/** Anon quick-view expiry: ?expires= deploys 404 after the deadline, soft-delete. */
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { findOrCreateUser, createSession } from "../src/auth";
import { getSiteRow } from "../src/db";
import { sweepExpiredSites } from "../src/anon-gc";
import {
  deployPasteExpires,
  fetchSite,
  call,
  API_ORIGIN,
  uploadJson,
} from "./helpers";

describe("expiry deploy", () => {
  it("accepts ?expires=1h and returns expiresAt", async () => {
    const out = await deployPasteExpires("<h1>quick</h1>", "exp-1h", "1h");
    expect(out.expiresAt).toBeTruthy();
    const ms = Date.parse(out.expiresAt) - Date.now();
    expect(ms).toBeGreaterThan(55 * 60 * 1000);
    expect(ms).toBeLessThan(65 * 60 * 1000);
    expect(out.notice).toMatch(/expires/);
  });

  it("accepts ?expires=90s and serves before deadline", async () => {
    const out = await deployPasteExpires("<h1>quick</h1>", "exp-90s", "90s");
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now());
    expect((await fetchSite("exp-90s")).status).toBe(200);
    expect(await (await fetchSite("exp-90s")).text()).toBe("<h1>quick</h1>");
  });

  it("rejects an invalid ?expires", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=exp-bad&expires=nope`, {
        method: "POST",
        headers: { "content-type": "text/html" },
        body: "<h1>x</h1>",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_expires" });
  });

  it("rejects ?expires on a logged-in (claimed) deploy", async () => {
    const user = await findOrCreateUser(env, "exp-owner@example.com");
    const session = await createSession(env, user.id);
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=exp-claimed&expires=1h`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `aft_session=${session.token}`,
        },
        body: JSON.stringify({ files: [{ path: "index.html", content: "<h1>x</h1>" }] }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "expires_claimed" });
  });
});

describe("expiry serve + sweep", () => {
  it("404s and soft-deletes once past the deadline", async () => {
    const out = await deployPasteExpires("<h1>gone</h1>", "exp-past", "1h");
    // Backdate the expiry so serve sees it as past.
    await env.DB.prepare(
      `UPDATE sites SET expires_at = ? WHERE slug = ?`,
    )
      .bind(new Date(Date.now() - 1000).toISOString(), "exp-past")
      .run();
    await env.SITES.put(
      `site:exp-past`,
      JSON.stringify({
        deployId: out.deployId,
        createdAt: new Date().toISOString(),
        fileCount: 1,
        runtime: "static",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );

    const res = await fetchSite("exp-past");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-aft-expired")).toBe("1");
    expect(await res.text()).toMatch(/expired/i);

    // Soft delete: D1 row kept and marked expired.
    const row = await getSiteRow(env, "exp-past");
    expect(row?.expired).toBe(true);
    // Slug freed: KV pointer gone.
    expect(await env.SITES.get(`site:exp-past`)).toBeNull();
  });

  it("sweeper marks past-due anon sites expired and keeps the row", async () => {
    const out = await deployPasteExpires("<h1>sweep</h1>", "exp-sweep", "1h");
    await env.DB.prepare(
      `UPDATE sites SET expires_at = ? WHERE slug = ?`,
    )
      .bind(new Date(Date.now() - 1000).toISOString(), "exp-sweep")
      .run();

    const res = await sweepExpiredSites(env, Date.now());
    expect(res.expired).toBeGreaterThanOrEqual(1);
    const row = await getSiteRow(env, "exp-sweep");
    expect(row?.expired).toBe(true);
    // Slug freed.
    expect(await env.SITES.get(`site:${out.slug}`)).toBeNull();
  });
});
