/** Prod smoke runner + `*.test.aft.page` canaries. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { testHostCase } from "../src/http";
import { attachPublicFlight, loadLatestSmokeRun, runSmokeSuite } from "../src/smoke";
import { call, pasteHtml } from "./helpers";

describe("test host routing", () => {
  it("parses case.test.aft.page and apex", () => {
    expect(testHostCase("html.test.aft.page", "aft.page")).toBe("html");
    expect(testHostCase("test.aft.page", "aft.page")).toBe("");
    expect(testHostCase("foo.bar.test.aft.page", "aft.page")).toBe(null);
    expect(testHostCase("html.aft.page", "aft.page")).toBe(null);
  });

  it("redirects test.aft.page to ops smoke", async () => {
    const res = await call(new Request("https://test.aft.page/"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://ops.aft.page/smoke");
  });

  it("serves canary host after smoke slug deploy", async () => {
    const up = await call(
      pasteHtml(
        "<!doctype html><html><body><p>canary-host</p></body></html>",
        "test--html",
      ),
    );
    expect(up.status).toBe(200);
    const body = (await up.json()) as { url: string };
    expect(body.url).toBe("https://test--html.aft.page");

    const res = await call(
      new Request("https://html.test.aft.page/", {
        headers: { accept: "text/html" },
      }),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("canary-host");
    expect(html).toMatch(/noindex/i);
  });

  it("unknown canary is branded 404", async () => {
    const res = await call(
      new Request("https://nope.test.aft.page/", {
        headers: { accept: "text/html" },
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/not deployed|Nothing is deployed/i);
  });

  it("rejects deploy slug test as reserved", async () => {
    const res = await call(pasteHtml("<h1>nope</h1>", "test"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "reserved_slug" });
  });
});

describe("smoke suite", () => {
  it("passes locally and writes the last run", async () => {
    const result = await runSmokeSuite(env, { trigger: "test" });
    const failed = result.cases.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.cases.length).toBeGreaterThan(8);
    expect(result.cases.some((c) => c.id === "domains" && c.ok)).toBe(true);
    expect(result.cases.some((c) => c.id === "cli" && c.ok)).toBe(true);
    expect(result.flight).toBe(null);
    await attachPublicFlight(env, result.id);
    const latest = await loadLatestSmokeRun(env);
    expect(latest?.flight?.serve?.ok).toBe(true);
  });

  it("POST /api/smoke/run accepts SMOKE_SECRET", async () => {
    const res = await call(
      new Request("https://ops.aft.page/api/smoke/run", {
        method: "POST",
        headers: { authorization: "Bearer test-smoke-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; cases: { id: string; ok: boolean }[] };
    expect(body.ok).toBe(true);
    expect(body.cases.some((c) => c.id === "html" && c.ok)).toBe(true);
    expect(body.cases.some((c) => c.id === "domains" && c.ok)).toBe(true);
  });

  it("GET /api/smoke/domains accepts SMOKE_SECRET", async () => {
    const res = await call(
      new Request("https://ops.aft.page/api/smoke/domains", {
        headers: { authorization: "Bearer test-smoke-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { domains: unknown[] };
    expect(Array.isArray(body.domains)).toBe(true);
  });

  it("POST /api/smoke/flight attaches TLS+MCP to the run", async () => {
    const run = await call(
      new Request("https://ops.aft.page/api/smoke/run", {
        method: "POST",
        headers: { authorization: "Bearer test-smoke-secret" },
      }),
    );
    const started = (await run.json()) as { id: string };
    const res = await call(
      new Request("https://ops.aft.page/api/smoke/flight", {
        method: "POST",
        headers: {
          authorization: "Bearer test-smoke-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: started.id,
          flight: { serve: { ok: true, html: "https://test--html.aft.page" } },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const { loadLatestSmokeRun } = await import("../src/smoke");
    const latest = await loadLatestSmokeRun(env);
    expect(latest?.id).toBe(started.id);
    expect(latest?.flight?.serve?.ok).toBe(true);
    expect(latest?.flight?.serve?.html).toBe("https://test--html.aft.page");
  });

  it("POST /api/smoke/run rejects a bad secret", async () => {
    const res = await call(
      new Request("https://ops.aft.page/api/smoke/run", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
