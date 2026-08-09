/** Owner-facing serve log: documents + errors, not successful assets. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { isJunkPath } from "../src/junk-path";
import {
  insertSiteLog,
  listProbeHits,
  loadSiteObservability,
  shouldKeepOwnerLog,
} from "../src/site-logs";
import { API_ORIGIN, call, deployPaste, fetchSite, uploadJson } from "./helpers";

async function ownSite(slug: string, email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

describe("loadSiteObservability", () => {
  it("fills 12 empty hours then counts a 4xx spike", async () => {
    const now = Date.parse("2026-08-09T12:00:00.000Z");
    await insertSiteLog(env, {
      slug: "obs-unit",
      method: "GET",
      path: "/gone",
      status: 404,
      bytes: 9,
      createdAt: "2026-08-09T11:40:00.000Z",
    });
    const out = await loadSiteObservability(env, "obs-unit", "12h", now);
    expect(out.buckets).toHaveLength(12);
    expect(out.totals.fourxx).toBe(1);
    expect(out.totals.ok).toBe(0);
    const spike = out.buckets.find((b) => b.fourxx === 1);
    expect(spike?.t).toBe("2026-08-09T11:00:00.000Z");
  });
});

describe("isJunkPath", () => {
  it("flags git/wordpress/env probes, not SPA routes", () => {
    expect(isJunkPath("/.git/config")).toBe(true);
    expect(isJunkPath("/wp-login.php")).toBe(true);
    expect(isJunkPath("//wp-includes/js/jquery/")).toBe(true);
    expect(isJunkPath("/api/.env")).toBe(true);
    expect(isJunkPath("/missing-spa-route")).toBe(false);
    expect(isJunkPath("/settings")).toBe(false);
  });
});

describe("listProbeHits", () => {
  it("groups scanner paths by slug status country", async () => {
    await insertSiteLog(env, {
      slug: "discovra",
      method: "GET",
      path: "/.git/config",
      status: 200,
      country: "US",
      createdAt: "2026-08-09T10:00:00.000Z",
    });
    await insertSiteLog(env, {
      slug: "discovra",
      method: "GET",
      path: "/.git/config",
      status: 200,
      country: "US",
      createdAt: "2026-08-09T11:00:00.000Z",
    });
    await insertSiteLog(env, {
      slug: "discovra",
      method: "GET",
      path: "/",
      status: 200,
      country: "IN",
      createdAt: "2026-08-09T11:30:00.000Z",
    });
    const rows = await listProbeHits(env, "2026-08-02T00:00:00.000Z");
    const hit = rows.find((r) => r.path === "/.git/config" && r.slug === "discovra");
    expect(hit?.n).toBe(2);
    expect(hit?.status).toBe(200);
    expect(hit?.country).toBe("US");
    expect(rows.some((r) => r.path === "/")).toBe(false);
  });
});

describe("shouldKeepOwnerLog", () => {
  it("keeps documents, APIs, and errors; drops successful assets", () => {
    expect(shouldKeepOwnerLog("/", 200)).toBe(true);
    expect(shouldKeepOwnerLog("/about", 200)).toBe(true);
    expect(shouldKeepOwnerLog("/index.html", 200)).toBe(true);
    expect(shouldKeepOwnerLog("/api/chat", 200)).toBe(true);
    expect(shouldKeepOwnerLog("/app.css", 200)).toBe(false);
    expect(shouldKeepOwnerLog("/app.js", 200)).toBe(false);
    expect(shouldKeepOwnerLog("/app.css", 404)).toBe(true);
  });
});

describe("GET /v1/sites/{slug}/logs", () => {
  it("returns document hits to the owner and skips successful assets", async () => {
    await call(
      uploadJson(
        [
          { path: "index.html", content: "<h1>logs</h1>" },
          { path: "app.css", content: "body{color:red}" },
        ],
        "owner-logs",
      ),
    );
    const cookie = await ownSite("owner-logs", "logs@example.com");
    await fetchSite("owner-logs", "/");
    await fetchSite("owner-logs", "/app.css");

    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/owner-logs/logs`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slug: string;
      views: { today: number; d7: number };
      events: { method: string; path: string; status: number }[];
    };
    expect(body.slug).toBe("owner-logs");
    expect(body.views.d7).toBeGreaterThanOrEqual(1);
    expect(body.events.some((e) => e.method === "GET" && e.path === "/" && e.status === 200)).toBe(
      true,
    );
    expect(body.events.some((e) => e.path === "/app.css" && e.status === 200)).toBe(false);
  });

  it("includes a 12h observability series with 4xx buckets", async () => {
    await deployPaste("<h1>obs</h1>", "owner-obs");
    const cookie = await ownSite("owner-obs", "obs@example.com");
    const now = Date.now();
    await insertSiteLog(env, {
      slug: "owner-obs",
      method: "GET",
      path: "/",
      status: 200,
      bytes: 100,
      createdAt: new Date(now - 30 * 60 * 1000).toISOString(),
    });
    await insertSiteLog(env, {
      slug: "owner-obs",
      method: "GET",
      path: "/missing",
      status: 404,
      bytes: 12,
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
    });
    await insertSiteLog(env, {
      slug: "owner-obs",
      method: "GET",
      path: "/boom",
      status: 500,
      bytes: 20,
      createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
    });

    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/owner-obs/logs?window=12h`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      observability: {
        window: string;
        buckets: { ok: number; fourxx: number; fivexx: number; bytes: number }[];
        totals: { ok: number; fourxx: number; fivexx: number; requests: number };
      };
    };
    expect(body.observability.window).toBe("12h");
    expect(body.observability.buckets).toHaveLength(12);
    expect(body.observability.totals.fourxx).toBeGreaterThanOrEqual(1);
    expect(body.observability.totals.fivexx).toBeGreaterThanOrEqual(1);
    expect(body.observability.totals.requests).toBeGreaterThanOrEqual(3);
  });

  it("rejects strangers", async () => {
    await deployPaste("<h1>nope</h1>", "logs-secret");
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/logs-secret/logs`, {
        headers: { origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
