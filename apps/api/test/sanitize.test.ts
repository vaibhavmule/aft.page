import { describe, it, expect } from "vitest";
import { sanitizeHtmlDocument } from "../src/index";
import { call, pasteHtml, fetchSite } from "./helpers";

describe("sanitizeHtmlDocument", () => {
  it("strips Deploy scraped after </html>", () => {
    const dirty =
      "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>Deploy";
    expect(sanitizeHtmlDocument(dirty)).toBe(
      "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>",
    );
  });

  it("strips Deploy to aft.page menu label", () => {
    const dirty = "<html><body>x</body></html>\nDeploy to aft.page";
    expect(sanitizeHtmlDocument(dirty)).toBe("<html><body>x</body></html>");
  });
});

describe("deploy strips extension chrome", () => {
  it("does not publish trailing Deploy text", async () => {
    const dirty =
      '<!DOCTYPE html><html><head><title>Clean Me</title></head><body><h1>Ok</h1></body></html>Deploy';
    const res = await call(pasteHtml(dirty, "clean-me"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    const page = await fetchSite(body.slug);
    const html = await page.text();
    expect(html.endsWith("</html>")).toBe(true);
    expect(html).not.toMatch(/Deploy/);
  });
});
