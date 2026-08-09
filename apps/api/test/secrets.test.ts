/** Secrets vault HTTP endpoints (PUT/GET/DELETE /v1/sites/{slug}/secrets). */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { API_ORIGIN, call, deployPaste } from "./helpers";

async function ownSite(slug: string, email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

describe("secrets vault endpoints", () => {
  it("OPTIONS allows PUT (browser preflight for project secrets UI)", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/x/secrets/ANTHROPIC_API_KEY`, {
        method: "OPTIONS",
        headers: { origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(204);
    const allow = res.headers.get("access-control-allow-methods") || "";
    expect(allow).toMatch(/PUT/i);
  });

  it("requires auth to set a secret", async () => {
    const { slug } = await deployPaste("<h1>sec</h1>", "sec-auth");
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets/ANTHROPIC_API_KEY`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "sk-test" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("owner sets, lists names only, and deletes", async () => {
    const { slug } = await deployPaste("<h1>sec</h1>", "sec-crud");
    const cookie = await ownSite(slug, "sec@example.com");
    const secretValue = "sk-test-super-secret-value";

    const put = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets/ANTHROPIC_API_KEY`, {
        method: "PUT",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: secretValue }),
      }),
    );
    expect(put.status).toBe(200);
    expect(((await put.json()) as { ok: boolean }).ok).toBe(true);

    const listRes = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(listRes.status).toBe(200);
    const rawBody = await listRes.text();
    expect(rawBody).not.toContain(secretValue);
    const listed = JSON.parse(rawBody) as { secrets: string[] };
    expect(listed.secrets).toEqual(["ANTHROPIC_API_KEY"]);

    const del = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets/ANTHROPIC_API_KEY`, {
        method: "DELETE",
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(del.status).toBe(200);

    const afterList = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(((await afterList.json()) as { secrets: string[] }).secrets).toEqual(
      [],
    );
  });

  it("rejects empty and oversized secret values", async () => {
    const { slug } = await deployPaste("<h1>sec</h1>", "sec-validate");
    const cookie = await ownSite(slug, "sec-validate@example.com");

    const empty = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets/ANTHROPIC_API_KEY`, {
        method: "PUT",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: "" }),
      }),
    );
    expect(empty.status).toBe(400);

    const tooLong = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets/ANTHROPIC_API_KEY`, {
        method: "PUT",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: "x".repeat(8193) }),
      }),
    );
    expect(tooLong.status).toBe(400);
  });

  it("accepts an edit token instead of a session", async () => {
    const { slug, editToken } = await deployPaste("<h1>sec</h1>", "sec-token");
    const put = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/secrets/ANTHROPIC_API_KEY`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-aft-edit-token": editToken,
        },
        body: JSON.stringify({ value: "sk-token-path" }),
      }),
    );
    expect(put.status).toBe(200);
  });
});
