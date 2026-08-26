/** Worker/Next upstream errors are the site’s 500, not a platform page. */
import { describe, expect, it } from "vitest";
import {
  filterPlatformCookies,
  proxyUpstream,
  sanitizeUpstreamSetCookie,
} from "../src/runtimes/proxy";

describe("proxyUpstream", () => {
  it("passes through an upstream 500 without wrapping it", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("boom from app", {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "content-type": "text/plain" },
      })) as typeof fetch;
    try {
      const res = await proxyUpstream(
        new Request("https://crash.aft.page/"),
        "https://upstream.example/",
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("x-aft-upstream")).toBe("https://upstream.example");
      const body = await res.text();
      expect(body).toBe("boom from app");
      expect(body).not.toContain("Nothing is deployed here");
      expect(body).not.toContain("SITE_NOT_FOUND");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("overwrites spoofed identity headers before reaching upstream", async () => {
    const orig = globalThis.fetch;
    let sent: Headers | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response("ok");
    }) as typeof fetch;
    try {
      await proxyUpstream(
        new Request("https://app.aft.page/", {
          headers: { "aft-authenticated-user-email": "attacker@evil.test" },
        }),
        "https://upstream.example/",
        { id: "usr_1", email: "owner@example.com" },
      );
      expect(sent?.get("aft-authenticated-user-email")).toBe("owner@example.com");
      expect(sent?.get("aft-authenticated-user-id")).toBe("usr_1");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("strips spoofed identity headers when the viewer is anonymous", async () => {
    const orig = globalThis.fetch;
    let sent: Headers | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response("ok");
    }) as typeof fetch;
    try {
      await proxyUpstream(
        new Request("https://app.aft.page/", {
          headers: {
            "aft-authenticated-user-email": "attacker@evil.test",
            "aft-authenticated-user-id": "usr_attacker",
          },
        }),
        "https://upstream.example/",
        null,
      );
      expect(sent?.has("aft-authenticated-user-email")).toBe(false);
      expect(sent?.has("aft-authenticated-user-id")).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("does not forward platform session cookies or edit tokens upstream", async () => {
    const orig = globalThis.fetch;
    let sent: Headers | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response("ok");
    }) as typeof fetch;
    try {
      await proxyUpstream(
        new Request("https://evil.aft.page/", {
          headers: {
            cookie: "aft_session=sess_secret; theme=dark; aft_oauth=oauth_secret",
            authorization: "Bearer aft_sess_stolen",
            "x-aft-edit-token": "aft_edit_stolen",
          },
        }),
        "https://attacker.example/",
      );
      expect(sent?.get("cookie")).toBe("theme=dark");
      expect(sent?.has("authorization")).toBe(false);
      expect(sent?.has("x-aft-edit-token")).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("drops platform Set-Cookie and parent-domain cookies from upstream", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      const headers = new Headers();
      headers.append(
        "set-cookie",
        "aft_session=stolen; Domain=.aft.page; Path=/; HttpOnly",
      );
      headers.append("set-cookie", "sid=app; Domain=.aft.page; Path=/");
      headers.append("set-cookie", "sid=app; Path=/");
      return new Response("ok", { headers });
    }) as typeof fetch;
    try {
      const res = await proxyUpstream(
        new Request("https://evil.aft.page/"),
        "https://attacker.example/",
      );
      const cookies = res.headers.getSetCookie();
      expect(cookies.some((c) => /aft_session=/i.test(c))).toBe(false);
      expect(cookies.some((c) => /domain=\.?aft\.page/i.test(c))).toBe(false);
      expect(cookies.some((c) => c.startsWith("sid=app") && /Path=\//i.test(c))).toBe(
        true,
      );
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("proxy cookie filters", () => {
  it("keeps tenant cookies and drops platform names", () => {
    expect(
      filterPlatformCookies("aft_session=s; theme=dark; aft_oauth=o"),
    ).toBe("theme=dark");
    expect(filterPlatformCookies("aft_session=s")).toBeNull();
  });

  it("strips Domain=.aft.page and drops aft_session Set-Cookie", () => {
    expect(
      sanitizeUpstreamSetCookie(
        "aft_session=stolen; Domain=.aft.page; Path=/",
        "aft.page",
      ),
    ).toBeNull();
    expect(
      sanitizeUpstreamSetCookie("sid=1; Domain=.aft.page; Path=/", "aft.page"),
    ).toBe("sid=1; Path=/");
    expect(sanitizeUpstreamSetCookie("sid=1; Path=/", "aft.page")).toBe(
      "sid=1; Path=/",
    );
  });
});
