/** Magic-link login (no claim). */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createLoginMagicLink,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { getSiteOwnerId } from "../src/db";
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

  it("verify sets session and redirects to projects", async () => {
    const email = "verify-login@example.com";
    const { token } = await createLoginMagicLink(env, email);
    const user = await findOrCreateUser(env, email);
    const site = await deployPaste("<h1>owned</h1>", "login-inv");
    await assignSiteOwner(env, site.slug, user.id);

    const res = await call(
      new Request(`${API_ORIGIN}/v1/auth/verify?token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://aft.page/projects");
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
    const body = (await me.json()) as {
      user: { email: string };
      sites: { slug: string }[];
    };
    expect(body.user.email).toBe(email);
    expect(body.sites.some((s) => s.slug === site.slug)).toBe(true);
  });

  it("verify honors next back to a site URL", async () => {
    const email = "verify-next@example.com";
    const { token } = await createLoginMagicLink(env, email);
    const next = "https://priv-return.aft.page/";
    const res = await call(
      new Request(
        `${API_ORIGIN}/v1/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`,
      ),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(next);
  });

  it("rejects bad verify token", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/auth/verify?token=aft_magic_bad`),
    );
    expect(res.status).toBe(400);
  });

  it("GET /v1/me returns 401 without session", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/me`, {
        headers: { origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("GET /v1/me returns user; logout clears session", async () => {
    const email = "me-logout@example.com";
    const user = await findOrCreateUser(env, email);
    const session = await createSession(env, user.id);
    const cookie = `aft_session=${session.token}`;

    const me = await call(
      new Request(`${API_ORIGIN}/v1/me`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as { id: string; email: string };
    expect(body.email).toBe(email);
    expect(body.id).toBe(user.id);

    const logout = await call(
      new Request(`${API_ORIGIN}/v1/auth/logout`, {
        method: "POST",
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(logout.status).toBe(200);
    const clear = logout.headers.get("set-cookie") || "";
    expect(clear).toMatch(/aft_session=/);
    expect(clear).toMatch(/Max-Age=0/i);
  });

  it("deploy with session auto-owns; anonymous stays unowned", async () => {
    const anon = await deployPaste("<h1>anon</h1>", "auto-own-anon");
    expect(await getSiteOwnerId(env, anon.slug)).toBeNull();

    const email = "auto-own@example.com";
    const user = await findOrCreateUser(env, email);
    const session = await createSession(env, user.id);

    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=auto-own-sess`, {
        method: "POST",
        headers: {
          "content-type": "text/html; charset=utf-8",
          cookie: `aft_session=${session.token}`,
          origin: "https://aft.page",
        },
        body: "<h1>owned on deploy</h1>",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(await getSiteOwnerId(env, body.slug)).toBe(user.id);
  });

  it("GET /v1/me accepts Bearer session token", async () => {
    const email = "bearer-me@example.com";
    const user = await findOrCreateUser(env, email);
    const session = await createSession(env, user.id);

    const me = await call(
      new Request(`${API_ORIGIN}/v1/me`, {
        headers: {
          authorization: `Bearer ${session.token}`,
          origin: "https://aft.page",
        },
      }),
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as { email: string };
    expect(body.email).toBe(email);
  });

  it("CLI login: start → complete → exchange", async () => {
    const state = "cli_state_test_01";
    const port = 38473;
    const start = await call(
      new Request(
        `${API_ORIGIN}/v1/auth/cli?port=${port}&state=${encodeURIComponent(state)}`,
      ),
    );
    expect(start.status).toBe(302);
    const loginLoc = start.headers.get("location") || "";
    expect(loginLoc).toContain("https://aft.page/login");
    expect(loginLoc).toContain("cli=1");
    expect(decodeURIComponent(loginLoc)).toContain(
      "/v1/auth/cli/complete?state=cli_state_test_01",
    );

    const email = "cli-login@example.com";
    const user = await findOrCreateUser(env, email);
    const session = await createSession(env, user.id);

    const complete = await call(
      new Request(
        `${API_ORIGIN}/v1/auth/cli/complete?state=${encodeURIComponent(state)}`,
        { headers: { cookie: `aft_session=${session.token}` } },
      ),
    );
    expect(complete.status).toBe(302);
    const cb = complete.headers.get("location") || "";
    expect(cb.startsWith(`http://127.0.0.1:${port}/callback?`)).toBe(true);
    const cbUrl = new URL(cb);
    expect(cbUrl.searchParams.get("state")).toBe(state);
    const code = cbUrl.searchParams.get("code") || "";
    expect(code.startsWith("aft_cli_")).toBe(true);

    const exchange = await call(
      new Request(`${API_ORIGIN}/v1/auth/cli/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, state }),
      }),
    );
    expect(exchange.status).toBe(200);
    const traded = (await exchange.json()) as {
      ok: boolean;
      token: string;
      email: string;
    };
    expect(traded.ok).toBe(true);
    expect(traded.email).toBe(email);
    expect(traded.token).toBe(session.token);

    const reuse = await call(
      new Request(`${API_ORIGIN}/v1/auth/cli/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, state }),
      }),
    );
    expect(reuse.status).toBe(400);

    const owned = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=cli-bearer-own`, {
        method: "POST",
        headers: {
          "content-type": "text/html; charset=utf-8",
          authorization: `Bearer ${traded.token}`,
        },
        body: "<h1>cli owned</h1>",
      }),
    );
    expect(owned.status).toBe(200);
    const site = (await owned.json()) as { slug: string };
    expect(await getSiteOwnerId(env, site.slug)).toBe(user.id);
  });

  it("CLI start rejects bad port; complete rejects bad state", async () => {
    const badPort = await call(
      new Request(`${API_ORIGIN}/v1/auth/cli?port=80&state=cli_state_ok_xx`),
    );
    expect(badPort.status).toBe(400);

    const badComplete = await call(
      new Request(`${API_ORIGIN}/v1/auth/cli/complete?state=nope`),
    );
    expect(badComplete.status).toBe(302);
    expect(badComplete.headers.get("location") || "").toContain("cli_invalid");
  });

  it("does not overwrite existing owner on redeploy with another session", async () => {
    const owner = await findOrCreateUser(env, "keep-owner@example.com");
    const ownerSession = await createSession(env, owner.id);
    const create = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=keep-owner-site`, {
        method: "POST",
        headers: {
          "content-type": "text/html; charset=utf-8",
          cookie: `aft_session=${ownerSession.token}`,
        },
        body: "<h1>mine</h1>",
      }),
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as { slug: string; editToken: string };
    expect(await getSiteOwnerId(env, created.slug)).toBe(owner.id);

    const thief = await findOrCreateUser(env, "thief@example.com");
    const thiefSession = await createSession(env, thief.id);
    const patch = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=${created.slug}`, {
        method: "PATCH",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-aft-edit-token": created.editToken,
          cookie: `aft_session=${thiefSession.token}`,
        },
        body: "<h1>hijack</h1>",
      }),
    );
    expect(patch.status).toBe(403);
    expect(await getSiteOwnerId(env, created.slug)).toBe(owner.id);
  });
});
