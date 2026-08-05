/** Unit tests for default Open Graph injection. */
import { describe, it, expect } from "vitest";
import { defaultOgImageUrl, ensureDefaultOgMeta, isHtmlContentType } from "../src/og";

describe("ensureDefaultOgMeta", () => {
  const opts = {
    slug: "demo",
    pageUrl: "https://demo.aft.page/",
    rootDomain: "aft.page",
  };

  it("skips HTML fragments without a head", () => {
    expect(ensureDefaultOgMeta("<h1>Hi</h1>", opts)).toBe("<h1>Hi</h1>");
  });

  it("injects og:image before </head>", () => {
    const out = ensureDefaultOgMeta(
      "<!doctype html><html><head><title>App</title></head><body></body></html>",
      opts,
    );
    expect(out).toContain('property="og:image" content="https://aft.page/og.png"');
    expect(out).toContain('property="og:title" content="App"');
    expect(out).toContain('property="og:url" content="https://demo.aft.page/"');
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("does not override an existing og:image", () => {
    const html =
      '<html><head><meta property="og:image" content="https://x/a.png" /></head></html>';
    expect(ensureDefaultOgMeta(html, opts)).toBe(html);
  });

  it("escapes titles used in attributes", () => {
    const out = ensureDefaultOgMeta(
      '<html><head><title>A & B "C"</title></head></html>',
      opts,
    );
    expect(out).toContain('content="A &amp; B &quot;C&quot;"');
  });
});

describe("helpers", () => {
  it("builds the marketing OG image URL", () => {
    expect(defaultOgImageUrl("aft.page")).toBe("https://aft.page/og.png");
  });

  it("detects HTML content types", () => {
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("application/json")).toBe(false);
  });
});
