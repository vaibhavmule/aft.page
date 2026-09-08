/** Founder ops mail: 500 + status + digest. Not per-request 400. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { Env } from "../src/env";
import { insertDeployFailure } from "../src/db";
import {
  alertIfStatusMajor,
  alertPlatform500,
  isPlatformAlertHost,
  maybeSendDeployDigest,
  sendOpsAlert,
} from "../src/ops-alert";
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

  it("status major_outage mails; operational is silent", async () => {
    const { sent, env: mailEnv } = mockMail();
    const major: StatusSnapshot = {
      checkedAt: new Date().toISOString(),
      overall: "major_outage",
      components: [
        {
          id: "api",
          name: "API",
          ok: false,
          status: "major_outage",
          httpStatus: 503,
          latencyMs: 1,
          checkedAt: new Date().toISOString(),
          error: "down",
        },
      ],
      recentFailures: [],
    };
    const okSnap: StatusSnapshot = {
      ...major,
      overall: "operational",
      components: [{ ...major.components[0]!, ok: true, status: "operational", error: null }],
    };
    expect(await alertIfStatusMajor(mailEnv, okSnap)).toBe(false);
    expect(await alertIfStatusMajor(mailEnv, major)).toBe(true);
    expect(sent.some((m) => m.subject.includes("major_outage"))).toBe(true);
  });

  it("deploy digest only when fails exist", async () => {
    const { sent, env: mailEnv } = mockMail();
    expect(await maybeSendDeployDigest(mailEnv)).toBe(false);
    await insertDeployFailure(mailEnv, {
      error: "no_files",
      source: "cli",
      httpStatus: 400,
      requestId: `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    });
    expect(await maybeSendDeployDigest(mailEnv)).toBe(true);
    expect(sent.some((m) => m.subject.includes("deploy"))).toBe(true);
  });
});
