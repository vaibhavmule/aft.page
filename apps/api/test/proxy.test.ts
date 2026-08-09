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
});
