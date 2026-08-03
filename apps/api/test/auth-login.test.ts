/** Magic-link login (no claim). */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createLoginMagicLink,
  findOrCreateUser,
} from "../src/auth";
import { API_ORIGIN, call, deployPaste } from "./helpers";

describe("auth login", () => {
  it("rejects invalid email on start", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/auth/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://aft.page",
        },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts start (email may fail without EMAIL binding)", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/auth/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://aft.page",
        },
        body: JSON.stringify({ email: "login@example.com" }),
      }),
    );
    expect([200, 503]).toContain(res.status);
  });

  it("verify sets session and redirects to inventory", async () => {
    const email = "verify-login@example.com";
    const { token } = await createLoginMagicLink(env, email);
    const user = await findOrCreateUser(env, email);
    const site = await deployPaste("<h1>owned</h1>", "login-inv");
    await assignSiteOwner(env, site.slug, user.id);

    const res = await call(
      new Request(`${API_ORIGIN}/v1/auth/verify?token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://aft.page/inventory");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toMatch(/aft_session=/);

    const me = await call(
      new Request(`${API_ORIGIN}/v1/me/sites`, {
        headers: {
          cookie: setCookie.split(";")[0]!,
          origin: "https://aft.page",
        },
      }),
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as { sites: { slug: string }[] };
    expect(body.sites.some((s) => s.slug === site.slug)).toBe(true);
  });

  it("rejects bad verify token", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/auth/verify?token=aft_magic_bad`),
    );
    expect(res.status).toBe(400);
  });
});
