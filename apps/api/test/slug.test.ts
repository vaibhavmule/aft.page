/**
 * Slug allocation — the rules that protect a published URL.
 *
 * Regression origin: a paste with the same <title> silently overwrote an
 * existing site (about-me.aft.page lost its original content).
 */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
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

  it("mints a random name when none is requested", async () => {
    const out = await deployPaste(page("anon"));
    expect(out.slug).toMatch(/^[a-z0-9]{8}$/);
  });

  it("falls back to a random name when the request slug is malformed", async () => {
    const out = await deployPaste(page("weird"), "Not A Slug!!");
    expect(out.slug).toMatch(/^[a-z0-9]{8}$/);
  });

  it("rejects reserved names instead of hijacking them", async () => {
    for (const reserved of ["www", "api", "admin"]) {
      const res = await call(pasteHtml(page("nope"), reserved));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "reserved_slug" });
    }
  });
});
