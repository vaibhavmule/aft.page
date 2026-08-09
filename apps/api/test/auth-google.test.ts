/** Google OAuth lands on the same session as magic link. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import {
  googleAuthConfigured,
  googleEmailFromCode,
  googleHttp,
  googleRedirectUri,
} from "../src/auth-google";
import { API_ORIGIN, call } from "./helpers";

const realGoogleFetch = googleHttp.fetch;

function enableGoogle() {
  env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  env.GOOGLE_CLIENT_SECRET = "test-google-secret";
}

function disableGoogle() {
  delete env.GOOGLE_CLIENT_ID;
  delete env.GOOGLE_CLIENT_SECRET;
}

describe("google login", () => {
  beforeEach(() => {
    disableGoogle();
    googleHttp.fetch = realGoogleFetch;
  });

  afterEach(() => {
    googleHttp.fetch = realGoogleFetch;
  });

  it("start without config sends you back to login", async () => {
    expect(googleAuthConfigured(env)).toBe(false);
    const res = await call(new Request(`${API_ORIGIN}/v1/auth/google`));
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") || "";
    expect(loc).toContain("https://aft.page/login");
    expect(loc).toContain("error=google_unavailable");
  });

  it("start redirects to Google and sets aft_oauth", async () => {
    enableGoogle();
    const next = "https://priv-g.aft.page/";
    const res = await call(
      new Request(
        `${API_ORIGIN}/v1/auth/google?next=${encodeURIComponent(next)}`,
      ),
    );
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") || "");
    expect(loc.origin + loc.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(loc.searchParams.get("client_id")).toBe(env.GOOGLE_CLIENT_ID);
    expect(loc.searchParams.get("redirect_uri")).toBe(googleRedirectUri(env));
    expect(loc.searchParams.get("scope")).toBe("openid email");
    expect(loc.searchParams.get("state")).toBeTruthy();
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toMatch(/aft_oauth=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("callback rejects a bad state without hitting Google", async () => {
    enableGoogle();
    const start = await call(new Request(`${API_ORIGIN}/v1/auth/google`));
    const cookie = (start.headers.get("set-cookie") || "").split(";")[0]!;
    const res = await call(
      new Request(
        `${API_ORIGIN}/v1/auth/google/callback?code=fake&state=wrong`,
        { headers: { cookie } },
      ),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location") || "").toContain("error=google_failed");
  });

  it("callback with mocked Google sets aft_session and honors next", async () => {
    enableGoogle();
    googleHttp.fetch = async (url, init) => {
      if (url.includes("/token")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ access_token: "ya29.test" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ email: "Ada@Example.COM", email_verified: true }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const next = "https://back-g.aft.page/app";
    const start = await call(
      new Request(
        `${API_ORIGIN}/v1/auth/google?next=${encodeURIComponent(next)}`,
      ),
    );
    const loc = new URL(start.headers.get("location") || "");
    const state = loc.searchParams.get("state") || "";
    const cookie = (start.headers.get("set-cookie") || "").split(";")[0]!;

    const res = await call(
      new Request(
        `${API_ORIGIN}/v1/auth/google/callback?code=good-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie } },
      ),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(next);
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const sessionLine =
      setCookies.find((c) => c.startsWith("aft_session=")) ||
      res.headers.get("set-cookie") ||
      "";
    expect(sessionLine).toMatch(/aft_session=/);

    const sessionCookie = sessionLine.split(";")[0]!;
    const me = await call(
      new Request(`${API_ORIGIN}/v1/me`, {
        headers: { cookie: sessionCookie, origin: "https://aft.page" },
      }),
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as { email: string };
    expect(body.email).toBe("ada@example.com");
  });

  it("rejects unverified Google emails", async () => {
    enableGoogle();
    const email = await googleEmailFromCode(
      env,
      "code",
      googleRedirectUri(env),
      async (url) => {
        if (url.includes("/token")) {
          return new Response(JSON.stringify({ access_token: "ya29.test" }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({ email: "nope@example.com", email_verified: false }),
          { status: 200 },
        );
      },
    );
    expect(email).toBe("unverified");
  });
});
