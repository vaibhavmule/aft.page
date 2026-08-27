/** status.aft.page host, API payload, and overall aggregation. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { call } from "./helpers";
import {
  overallFromComponents,
  componentStatus,
  buildDayStrip,
  recentFailures,
  saveSnapshot,
  formatUptimePercent,
  publicProbeError,
  runProbes,
  STATUS_PROBES,
  type ProbeResult,
  type StatusSnapshot,
} from "../src/status";

function probe(
  partial: Partial<ProbeResult> & Pick<ProbeResult, "id" | "ok" | "status">,
): ProbeResult {
  return {
    name: partial.name || partial.id,
    description: partial.description || "",
    url: partial.url || `https://example.test/${partial.id}`,
    httpStatus: partial.httpStatus ?? (partial.ok ? 200 : 500),
    latencyMs: partial.latencyMs ?? 10,
    error: partial.error ?? (partial.ok ? null : "failed"),
    checkedAt: partial.checkedAt || "2026-08-07T12:00:00.000Z",
    ...partial,
  };
}

describe("status aggregation", () => {
  it("marks all-ok as operational", () => {
    expect(
      overallFromComponents([
        probe({ id: "a", ok: true, status: "operational" }),
        probe({ id: "b", ok: true, status: "operational" }),
      ]),
    ).toBe("operational");
  });

  it("marks any major outage as major_outage", () => {
    expect(
      overallFromComponents([
        probe({ id: "a", ok: true, status: "operational" }),
        probe({ id: "b", ok: false, status: "major_outage" }),
      ]),
    ).toBe("major_outage");
  });

  it("marks soft failures as degraded", () => {
    expect(componentStatus(false, 404)).toBe("degraded");
    expect(
      overallFromComponents([
        probe({ id: "a", ok: true, status: "operational" }),
        probe({ id: "b", ok: false, status: "degraded", httpStatus: 404 }),
      ]),
    ).toBe("degraded");
  });

  it("builds a day strip and recent failures", () => {
    const history: StatusSnapshot[] = [
      {
        checkedAt: "2026-08-07T10:00:00.000Z",
        overall: "operational",
        components: [probe({ id: "api", ok: true, status: "operational" })],
      },
      {
        checkedAt: "2026-08-07T11:00:00.000Z",
        overall: "major_outage",
        components: [
          probe({
            id: "api",
            ok: false,
            status: "major_outage",
            error: "down",
            checkedAt: "2026-08-07T11:00:00.000Z",
          }),
        ],
      },
    ];
    const strip = buildDayStrip(history, 7);
    expect(strip).toHaveLength(7);
    expect(recentFailures(history)[0]?.error).toBe("down");
  });

  it("formats uptime like Statuspage", () => {
    expect(formatUptimePercent(null)).toBe("No data yet");
    expect(formatUptimePercent(100)).toBe("100% uptime");
    expect(formatUptimePercent(99.976)).toBe("99.976% uptime");
    expect(formatUptimePercent(0)).toBe("0% uptime");
  });

  it("hides D1 dumps behind public copy", () => {
    expect(
      publicProbeError(
        "D1_ERROR: no such column: active at offset 191: SQLITE_ERROR",
      ),
    ).toBe("Database unavailable (migration)");
    expect(publicProbeError("down")).toBe("down");
    expect(publicProbeError("unexpected_status_502")).toBe("HTTP 502");
  });
});

describe("status.aft.page host", () => {
  it("serves branded HTML on the status host", async () => {
    const snapshot: StatusSnapshot = {
      checkedAt: "2026-08-07T12:00:00.000Z",
      overall: "operational",
      components: [
        probe({
          id: "api",
          name: "API",
          ok: true,
          status: "operational",
          description: "API",
        }),
        probe({
          id: "www",
          name: "Website",
          ok: true,
          status: "operational",
          description: "Website",
        }),
        probe({
          id: "sites",
          name: "Site serve",
          ok: true,
          status: "operational",
          description: "Sites",
        }),
      ],
    };
    await saveSnapshot(env, snapshot);

    const res = await call(new Request("https://status.aft.page/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("System status");
    expect(html).toContain("All systems operational");
    expect(html).toContain("API");
    expect(html).toContain("uptime");
    expect(html).toContain("90 days ago");
    expect(html).toContain("Today");
    expect(html).not.toMatch(/https:\/\/example\.test\//);
    expect(html).not.toMatch(/\d+ ms/);
  });

  it("does not leak D1 dumps on the public page", async () => {
    const at = "2026-08-08T07:10:53.141Z";
    await saveSnapshot(env, {
      checkedAt: at,
      overall: "major_outage",
      components: [
        probe({
          id: "sites",
          name: "Site serve",
          ok: false,
          status: "major_outage",
          error: "D1_ERROR: no such column: active at offset 191: SQLITE_ERROR",
          checkedAt: at,
        }),
      ],
    });

    const html = await (await call(new Request("https://status.aft.page/"))).text();
    expect(html).toContain("Database unavailable (migration)");
    expect(html).not.toContain("D1_ERROR");
    expect(html).not.toContain("no such column");

    const body = (await (
      await call(new Request("https://status.aft.page/api.json"))
    ).json()) as { recentFailures: { error: string }[] };
    expect(body.recentFailures.some((f) => f.error === "Database unavailable (migration)")).toBe(
      true,
    );
    expect(body.recentFailures.some((f) => /D1_ERROR|no such column/.test(f.error))).toBe(false);
  });

  it("serves machine-readable /api.json", async () => {
    const snapshot: StatusSnapshot = {
      checkedAt: "2026-08-07T12:30:00.000Z",
      overall: "degraded",
      components: [
        probe({ id: "api", name: "API", ok: true, status: "operational" }),
        probe({
          id: "www",
          name: "Website",
          ok: false,
          status: "degraded",
          httpStatus: 404,
        }),
        probe({ id: "sites", name: "Site serve", ok: true, status: "operational" }),
      ],
    };
    await saveSnapshot(env, snapshot);

    const res = await call(new Request("https://status.aft.page/api.json"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      service: string;
      overall: string;
      historyDays: number;
      components: { id: string; uptimePercent: number | null; history: unknown[] }[];
      history: unknown[];
    };
    expect(body.service).toBe("aft.page");
    expect(body.overall).toBe("degraded");
    expect(body.historyDays).toBe(90);
    expect(body.components).toHaveLength(3);
    expect(body.history).toHaveLength(90);
    expect(body.components[0]?.history).toHaveLength(90);
    expect(body.components[0]).toHaveProperty("uptimePercent");
  });

  it("persists checks in D1 for forever history", async () => {
    const at = "2026-08-07T13:00:00.000Z";
    await saveSnapshot(env, {
      checkedAt: at,
      overall: "major_outage",
      components: [
        probe({
          id: "api",
          name: "API",
          ok: false,
          status: "major_outage",
          error: "boom",
          checkedAt: at,
        }),
      ],
    });

    const row = await env.DB.prepare(
      `SELECT ok, error FROM status_checks WHERE checked_at = ? AND component_id = 'api'`,
    )
      .bind(at)
      .first<{ ok: number; error: string }>();
    expect(row?.ok).toBe(0);
    expect(row?.error).toBe("boom");

    const res = await call(new Request("https://status.aft.page/api.json"));
    const body = (await res.json()) as { recentFailures: { error: string }[] };
    expect(body.recentFailures.some((f) => f.error === "boom")).toBe(true);
  });

  it("probes MCP over the service binding", async () => {
    expect(
      STATUS_PROBES.some(
        (p) => p.id === "sites" && p.siteSlug === "hello" && p.url === "https://hello.aft.page/",
      ),
    ).toBe(true);
    expect(
      STATUS_PROBES.some(
        (p) =>
          p.id === "express" &&
          p.siteSlug === "nodejs-getting-started-sky" &&
          p.mode === "internal_site",
      ),
    ).toBe(true);
    expect(STATUS_PROBES.some((p) => p.id === "mcp" && p.mode === "internal_mcp")).toBe(
      true,
    );
    const snap = await runProbes(env);
    const mcp = snap.components.find((c) => c.id === "mcp");
    expect(mcp?.ok).toBe(true);
    expect(mcp?.status).toBe("operational");
    expect(mcp?.url).toBe("https://mcp.aft.page/health");
  });

  it("does not serve status as a user site slug", async () => {
    const res = await call(
      new Request("https://api.aft.page/v1/deploy?slug=status", {
        method: "POST",
        headers: { "content-type": "text/html" },
        body: "<h1>nope</h1>",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "reserved_slug" });
  });
});
