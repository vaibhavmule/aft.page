import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { Env } from "../src/env";
import { findOrCreateUser } from "../src/auth";
import { finishRunJob, insertRunJob } from "../src/db";
import { API_ORIGIN, call } from "./helpers";

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
    ...env,
    EMAIL,
    ROOT_DOMAIN: "aft.page",
  } as unknown as Env;
  return { sent, env: mailEnv };
}

describe("run job done notify", () => {
  it("skips when the job has no signed-in user", async () => {
    const { sent, env: mailEnv } = mockMail();
    const id = await insertRunJob(mailEnv, {
      owner: "octo",
      repo: "hello",
      url: "https://github.com/octo/hello",
      trigger: "test",
    });
    await finishRunJob(mailEnv, id, {
      status: "live",
      slug: "hello-mist",
      siteUrl: "https://hello-mist.aft.page",
      httpStatus: 200,
    });
    expect(sent).toEqual([]);
  });

  it("mails the signed-in user when live", async () => {
    const { sent, env: mailEnv } = mockMail();
    const user = await findOrCreateUser(mailEnv, "runner@example.com");
    const id = await insertRunJob(mailEnv, {
      owner: "octo",
      repo: "hello",
      url: "https://github.com/octo/hello",
      trigger: "web",
      userId: user.id,
      slug: "hello-jade",
    });
    await finishRunJob(mailEnv, id, {
      status: "live",
      slug: "hello-jade",
      siteUrl: "https://hello-jade.aft.page",
      httpStatus: 200,
    });
    expect(sent.length).toBe(1);
    expect(sent[0]?.to).toEqual(["runner@example.com"]);
    expect(sent[0]?.subject).toMatch(/hello-jade\.aft\.page/);
    expect(sent[0]?.text).toContain("https://hello-jade.aft.page");
  });

  it("repo check echoes credentialed CORS for the web origin", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/repo/check`, {
        method: "POST",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: "not-a-repo" }),
      }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://aft.page");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});
