import { describe, it, expect } from "vitest";
import { injectAftChrome } from "../src/aft-chrome";
import { liveSiteUrl } from "../src/site-url";

describe("liveSiteUrl", () => {
  it("is the bare slug host", () => {
    expect(liveSiteUrl("vite-hello", "aft.page")).toBe(
      "https://vite-hello.aft.page",
    );
  });

  it("puts claim token on the same host", () => {
    expect(liveSiteUrl("vite-hello", "aft.page", { token: "aft_edit_x" })).toBe(
      "https://vite-hello.aft.page/?token=aft_edit_x",
    );
  });

  it("smoke slugs stay on the slug host (Universal SSL)", () => {
    expect(liveSiteUrl("test--html", "aft.page")).toBe("https://test--html.aft.page");
  });
});

describe("injectAftChrome", () => {
  it("skips fragments without a body", () => {
    expect(injectAftChrome("<h1>Hi</h1>", { slug: "x", rootDomain: "aft.page" })).toBe(
      "<h1>Hi</h1>",
    );
  });

  it("injects claim chrome before </body>", () => {
    const out = injectAftChrome(
      "<!doctype html><html><body><h1>App</h1></body></html>",
      { slug: "demo", rootDomain: "aft.page" },
    );
    expect(out).toContain('id="aft-chrome"');
    expect(out).toContain("Claim this site");
    expect(out).toContain("/v1/claim/start");
    expect(out).toContain("demo");
    expect(out).not.toContain("/preview?url=");
    expect(out).not.toContain("▲");
    expect(out).toContain("#22c55e");
  });

  it("is idempotent", () => {
    const once = injectAftChrome(
      "<html><body></body></html>",
      { slug: "a", rootDomain: "aft.page" },
    );
    expect(injectAftChrome(once, { slug: "a", rootDomain: "aft.page" })).toBe(once);
  });
});
