/** Worker/Next upstream errors are the site’s 500, not a platform page. */
import { describe, expect, it } from "vitest";
import { proxyUpstream } from "../src/runtimes/proxy";

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
});
