/** Hijack CIL runner + ops #audit. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { originMayActOnSlug } from "../src/http";
import { runAuditSuite } from "../src/audit";
import { call } from "./helpers";

describe("originMayActOnSlug", () => {
  const root = "aft.page";
  const req = (origin?: string) =>
    new Request("https://api.aft.page/v1/sites/vic", {
      headers: origin ? { origin } : {},
    });

  it("allows missing origin (curl / MCP)", () => {
    expect(originMayActOnSlug(req(), "vic", root)).toBe(true);
  });

  it("allows apex and blocks cross-tenant", () => {
    expect(originMayActOnSlug(req("https://aft.page"), "vic", root)).toBe(true);
    expect(originMayActOnSlug(req("https://ops.aft.page"), "vic", root)).toBe(true);
    expect(originMayActOnSlug(req("https://evil.aft.page"), "vic", root)).toBe(false);
    expect(originMayActOnSlug(req("https://vic.aft.page"), "vic", root)).toBe(true);
    expect(
      originMayActOnSlug(req("https://152fffaf71c6--vic.aft.page"), "vic", root),
    ).toBe(true);
    expect(
      originMayActOnSlug(req("https://152fffaf71c6--vic.aft.page"), "other", root),
    ).toBe(false);
  });
});

describe("audit suite", () => {
  it("passes locally and writes the last run", async () => {
    const result = await runAuditSuite(env, { trigger: "test" });
    const failed = result.cases.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.cases.length).toBeGreaterThan(12);
    expect(result.cases.some((c) => c.id === "cli" && c.ok)).toBe(true);
    const { loadLatestAuditRun } = await import("../src/audit");
    const latest = await loadLatestAuditRun(env);
    expect(latest?.id).toBe(result.id);
    expect(latest?.ok).toBe(true);
  });

  it("POST /api/audit/run accepts SMOKE_SECRET", async () => {
    const res = await call(
      new Request("https://ops.aft.page/api/audit/run", {
        method: "POST",
        headers: { authorization: "Bearer test-smoke-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; cases: { id: string; ok: boolean }[] };
    expect(body.ok).toBe(true);
    expect(body.cases.some((c) => c.id === "csrf" && c.ok)).toBe(true);
  });

  it("POST /api/audit/run rejects a bad secret", async () => {
    const res = await call(
      new Request("https://ops.aft.page/api/audit/run", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
