/** Foreign websites must not pass the slug origin gate. */
import { describe, it, expect } from "vitest";
import { originMayActOnSlug } from "../src/http";

const root = "aft.page";
const slug = "acme";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://api.aft.page/v1/x", { headers });
}

describe("originMayActOnSlug", () => {
  it("allows CLI (no origin) and product / matching hosts", () => {
    expect(originMayActOnSlug(req(), slug, root)).toBe(true);
    expect(originMayActOnSlug(req({ origin: `https://${slug}.aft.page` }), slug, root)).toBe(
      true,
    );
    expect(originMayActOnSlug(req({ origin: "https://aft.page" }), slug, root)).toBe(true);
    expect(originMayActOnSlug(req({ origin: "https://www.aft.page" }), slug, root)).toBe(
      true,
    );
    expect(originMayActOnSlug(req({ origin: "http://localhost:8788" }), slug, root)).toBe(
      true,
    );
  });

  it("denies sibling tenants and foreign websites", () => {
    expect(originMayActOnSlug(req({ origin: "https://other.aft.page" }), slug, root)).toBe(
      false,
    );
    expect(originMayActOnSlug(req({ origin: "https://evil.example" }), slug, root)).toBe(
      false,
    );
    expect(
      originMayActOnSlug(req({ referer: "https://evil.example/app" }), slug, root),
    ).toBe(false);
    expect(originMayActOnSlug(req({ origin: "not-a-url" }), slug, root)).toBe(false);
  });
});
