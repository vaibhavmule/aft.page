/** Founder ops mail: 500 + CIL + digest. Not per-request 400. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { Env } from "../src/env";
import { insertDeployFailure } from "../src/db";
import {
  alertIfSmokeFailed,
  alertIfStatusMajor,
  alertPlatform500,
  isPlatformAlertHost,
  maybeSendDeployDigest,
  sendOpsAlert,
} from "../src/ops-alert";
import type { SmokeRunResult } from "../src/smoke";
import type { StatusSnapshot } from "../src/status";

function mockMail() {
  const sent: { to: string[]; subject: string; text: string }[] = [];
  const EMAIL = {
    send: async (msg: { to: string | string[]; subject: string; text?: string }) => {
      sent.push({
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        text: msg.text || "",
      });
      return { messageId: "test" };
    },
  };
  const mailEnv = {
    EMAIL,
    OPS_EMAILS: "hello@aft.page,ops@example.com",
    ROOT_DOMAIN: "aft.page",
    STATUS: env.STATUS,
    DB: env.DB,
  } as unknown as Env;
  return { sent, env: mailEnv };
}

describe("ops alert", () => {
  it("skips when EMAIL is missing", async () => {
    const ok = await sendOpsAlert(
      { OPS_EMAILS: "hello@aft.page", ROOT_DOMAIN: "aft.page" } as Env,
      { kind: "500", subject: "x", text: "y" },
    );
    expect(ok).toBe(false);
  });

  it("mails OPS_EMAILS and debounces the same key", async () => {
    const { sent, env: mailEnv } = mockMail();
    const first = await sendOpsAlert(mailEnv, {
      kind: "500",
      key: `t-${crypto.randomUUID()}`,
      subject: "[aft.page] test",
      text: "hello",
    });
    const key = `t-${crypto.randomUUID()}`;
    const a = await sendOpsAlert(mailEnv, {
      kind: "500",
      key,
      subject: "[aft.page] once",
      text: "a",
    });
    const b = await sendOpsAlert(mailEnv, {
      kind: "500",
      key,
      subject: "[aft.page] twice",
      text: "b",
    });
    expect(first).toBe(true);
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(sent.some((m) => m.to.includes("hello@aft.page") && m.to.includes("ops@example.com"))).toBe(
      true,
    );
  });

  it("alerts platform 500, not tenant site 500", async () => {
    expect(isPlatformAlertHost("api.aft.page", "aft.page")).toBe(true);
    expect(isPlatformAlertHost("ops.aft.page", "aft.page")).toBe(true);
    expect(isPlatformAlertHost("hello.aft.page", "aft.page")).toBe(false);

    const { sent, env: mailEnv } = mockMail();
    const tenant = await alertPlatform500(
      mailEnv,
      new Request("https://hello.aft.page/"),
      new Response("boom", { status: 500 }),
    );
    const platform = await alertPlatform500(
      mailEnv,
      new Request("https://api.aft.page/v1/claim/verify?token=secret-token"),
      new Response(JSON.stringify({ error: "internal", token: "secret-token" }), { status: 500 }),
    );
    expect(tenant).toBe(false);
    expect(platform).toBe(true);
    const alert = sent.find((m) => m.subject.includes("api.aft.page/v1/claim/verify"));
    expect(alert).toBeDefined();
    expect(alert?.text).not.toContain("secret-token");
  });

  it("smoke ok is silent; smoke fail mails once per run id", async () => {
    const { sent, env: mailEnv } = mockMail();
    const okRun: SmokeRunResult = {
      id: "smoke-ok",
      ok: true,
      trigger: "test",
      startedAt: "2026-08-13T00:00:00.000Z",
      finishedAt: "2026-08-13T00:00:01.000Z",
      ms: 1,
      cases: [],
      flight: null,
    };
    const failRun: SmokeRunResult = {
      id: `smoke-fail-${crypto.randomUUID()}`,
      ok: false,
      trigger: "cron",
      startedAt: "2026-08-13T00:00:00.000Z",
      finishedAt: "2026-08-13T00:00:02.000Z",
      ms: 2,
      cases: [
        { id: "html", ok: false, ms: 1, detail: "no claimUrl", url: null },
      ],
      flight: null,
    };
    expect(await alertIfSmokeFailed(mailEnv, okRun)).toBe(false);
    expect(await alertIfSmokeFailed(mailEnv, failRun)).toBe(true);
    expect(await alertIfSmokeFailed(mailEnv, failRun)).toBe(false);
    expect(sent.some((m) => m.subject.includes("smoke FAIL") && m.text.includes("html:"))).toBe(
      true,
    );
  });

  it("24h digest sends once when there are deploy rejects", async () => {
    const { sent, env: mailEnv } = mockMail();
    await insertDeployFailure(mailEnv, {
      error: "internal",
      source: "test",
      httpStatus: 500,
      requestId: "aft_digest_test",
    });
    const first = await maybeSendDeployDigest(mailEnv);
    const second = await maybeSendDeployDigest(mailEnv);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(sent.some((m) => m.subject.includes("24h deploy") && m.text.includes("internal"))).toBe(
      true,
    );
  });

  it("does not page status major_outage for a sleeping Express fixture", async () => {
    const { sent, env: mailEnv } = mockMail();
    const snap: StatusSnapshot = {
      checkedAt: "2026-08-29T06:00:00.000Z",
      overall: "major_outage",
      components: [
        {
          id: "api",
          name: "API",
          description: "Deploy, claim, and project API",
          url: "https://api.aft.page/health",
          ok: true,
          status: "operational",
          httpStatus: 200,
          latencyMs: 1,
          error: null,
          checkedAt: "2026-08-29T06:00:00.000Z",
        },
        {
          id: "www",
          name: "Website",
          description: "aft.page",
          url: "https://aft.page/",
          ok: true,
          status: "operational",
          httpStatus: 200,
          latencyMs: 1,
          error: null,
          checkedAt: "2026-08-29T06:00:00.000Z",
        },
        {
          id: "sites",
          name: "Hosted apps",
          description: "Static hello.aft.page (not container Run)",
          url: "https://hello.aft.page/",
          ok: true,
          status: "operational",
          httpStatus: 200,
          latencyMs: 1,
          error: null,
          checkedAt: "2026-08-29T06:00:00.000Z",
        },
        {
          id: "mcp",
          name: "MCP",
          description: "Agent deploy",
          url: "https://mcp.aft.page/health",
          ok: true,
          status: "operational",
          httpStatus: 200,
          latencyMs: 1,
          error: null,
          checkedAt: "2026-08-29T06:00:00.000Z",
        },
        {
          id: "express",
          name: "Express fixture",
          description: "Container Run",
          url: "https://nodejs-getting-started-sand.aft.page/",
          ok: false,
          status: "major_outage",
          httpStatus: 530,
          latencyMs: 20,
          error: "sandbox asleep",
          checkedAt: "2026-08-29T06:00:00.000Z",
        },
      ],
    };
    expect(await alertIfStatusMajor(mailEnv, snap)).toBe(false);
    expect(sent.some((m) => m.subject.includes("status major_outage"))).toBe(false);
  });
});
