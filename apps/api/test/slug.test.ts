/**
 * Slug allocation — the rules that protect a published URL.
 *
 * Regression origin: a paste with the same <title> silently overwrote an
 * existing site (about-me.aft.page lost its original content).
 */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { slugFromHint } from "../src/slug";
import { call, deployPaste, pasteHtml } from "./helpers";

const page = (body: string) => `<html><body>${body}</body></html>`;

describe("slug allocation", () => {
  it("uses the requested name when it is free", async () => {
    const out = await deployPaste(page("first"), "my-notes");
    expect(out.slug).toBe("my-notes");
    expect(out.url).toBe("https://my-notes.aft.page");
  });

  it("never overwrites an existing site", async () => {
    const first = await deployPaste(page("original"), "about-me");
    const second = await deployPaste(page("different"), "about-me");

    expect(first.slug).toBe("about-me");
    expect(second.slug).not.toBe("about-me");
    expect(second.deployId).not.toBe(first.deployId);

    // The original pointer is untouched.
    const meta = JSON.parse((await env.SITES.get("site:about-me"))!) as {
      deployId: string;
    };
    expect(meta.deployId).toBe(first.deployId);
  });

  it("suffixes collisions with a readable name", async () => {
    await deployPaste(page("one"), "portfolio");
    const second = await deployPaste(page("two"), "portfolio");

    expect(second.slug).toMatch(/^portfolio-[a-z]+(-[a-z]+)?$/);
  });

  it("keeps minting new names across repeated pastes", async () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const out = await deployPaste(page(`v${i}`), "changelog");
      slugs.add(out.slug);
    }
    expect(slugs.size).toBe(6);
  });

  it("mints a random name when none is requested and there is no title", async () => {
    const out = await deployPaste(page("anon"));
    expect(out.slug).toMatch(/^[a-z0-9]{8}$/);
  });

  it("uses <title> as the slug base when none is requested (Drop parity)", async () => {
    const html =
      "<!doctype html><html><head><title>Signal Garden</title></head><body><h1>Signal Garden</h1></body></html>";
    const out = await deployPaste(html);
    expect(out.slug).toBe("signal-garden");
    expect(out.url).toBe("https://signal-garden.aft.page");
  });

  it("derives a slug from a long title without a trailing hyphen", () => {
    expect(
      slugFromHint(
        "Include XI — Intelligence that sells. Systems that scale.",
      ),
    ).toBe("include-xi-intelligence-that-sells-systems-that");
  });

  it("ignores generic nested package names", () => {
    expect(slugFromHint("backend")).toBeUndefined();
    expect(slugFromHint("frontend")).toBeUndefined();
    expect(slugFromHint("Odoo_HRMS")).toBe("odoo-hrms");
  });

  it("uses a long marketing title on deploy instead of a random slug", async () => {
    const html =
      '<!doctype html><html><head><title>Include XI — Intelligence that sells. Systems that scale.</title></head><body><h1>Hi</h1></body></html>';
    const out = await deployPaste(html);
    expect(out.slug).toBe("include-xi-intelligence-that-sells-systems-that");
    expect(out.slug).not.toMatch(/^[a-z0-9]{8}$/);
  });

  it("suffixes a taken title-based slug instead of overwriting", async () => {
    const html =
      "<!doctype html><html><head><title>Moonlit Harbor</title></head><body></body></html>";
    const first = await deployPaste(html);
    const second = await deployPaste(html);
    expect(first.slug).toBe("moonlit-harbor");
    expect(second.slug).toMatch(/^moonlit-harbor-[a-z]+(-[a-z]+)?$/);
  });

  it("falls back to a random name when the request slug is malformed and there is no title", async () => {
    const out = await deployPaste(page("weird"), "Not A Slug!!");
    expect(out.slug).toMatch(/^[a-z0-9]{8}$/);
  });

  it("rejects reserved names instead of hijacking them", async () => {
    for (const reserved of ["www", "api", "admin", "ai", "cron", "cname", "code"]) {
      const res = await call(pasteHtml(page("nope"), reserved));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "reserved_slug" });
    }
  });
});
