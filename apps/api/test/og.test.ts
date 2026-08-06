/** Unit tests for default Open Graph injection. */
import { describe, it, expect } from "vitest";
import { defaultOgImageUrl, ensureDefaultOgMeta, isHtmlContentType, siteOgImageUrl } from "../src/og";

describe("ensureDefaultOgMeta", () => {
  const opts = {
    slug: "demo",
    pageUrl: "https://demo.aft.page/",
    rootDomain: "aft.page",
  };

  it("skips HTML fragments without a head", () => {
    expect(ensureDefaultOgMeta("<h1>Hi</h1>", opts)).toBe("<h1>Hi</h1>");
  });

  it("injects image and description defaults before </head>", () => {
    const out = ensureDefaultOgMeta(
      "<!doctype html><html><head><title>App</title></head><body></body></html>",
      opts,
    );
    expect(out).toContain('property="og:image" content="https://demo.aft.page/__aft/og.png"');
    expect(out).toContain('property="og:title" content="App"');
    expect(out).toContain('property="og:description" content="App — live on aft.page"');
    expect(out).toContain('name="description" content="App — live on aft.page"');
    expect(out).toContain('name="twitter:description" content="App — live on aft.page"');
    expect(out).toContain('property="og:url" content="https://demo.aft.page/"');
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("does not override an existing og:image but still fills descriptions", async () => {
    const html =
      '<html><head><title>Custom</title><meta property="og:image" content="https://x/a.png" /></head></html>';
    const out = ensureDefaultOgMeta(html, opts);
    expect(out).toContain('content="https://x/a.png"');
    expect(out).not.toContain("__aft/og.png");
    expect(out).not.toContain("https://aft.page/og.png");
    expect(out).toContain('name="description" content="Custom — live on aft.page"');
    expect(out).toContain('property="og:description"');
    expect(out).toContain('name="twitter:description"');
  });

  it("reuses an existing meta description", () => {
    const out = ensureDefaultOgMeta(
      '<html><head><title>App</title><meta name="description" content="Ship internal tools" /></head></html>',
      opts,
    );
    expect(out).toContain('property="og:description" content="Ship internal tools"');
    expect(out).toContain('name="twitter:description" content="Ship internal tools"');
    expect(out.match(/name="description"/g)?.length).toBe(1);
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

  it("builds a per-site OG image URL", () => {
    expect(siteOgImageUrl("demo", "aft.page")).toBe("https://demo.aft.page/__aft/og.png");
  });

  it("detects HTML content types", () => {
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("application/json")).toBe(false);
  });
});
