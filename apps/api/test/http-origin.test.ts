/** Tenant origins must not drive account APIs (same-site cookie + CORS). */
import { describe, it, expect } from "vitest";
import { originMayActOnAccount, originMayActOnSlug } from "../src/http";

const root = "aft.page";
const req = (origin?: string) =>
  new Request("https://api.aft.page/v1/me", {
    headers: origin ? { origin } : {},
  });

describe("originMayActOnAccount", () => {
  it("allows missing origin, apex, reserved product hosts", () => {
    expect(originMayActOnAccount(req(), root)).toBe(true);
    expect(originMayActOnAccount(req("https://aft.page"), root)).toBe(true);
    expect(originMayActOnAccount(req("https://ops.aft.page"), root)).toBe(true);
    expect(originMayActOnAccount(req("https://preview.aft.page"), root)).toBe(true);
    expect(originMayActOnAccount(req("http://localhost:8788"), root)).toBe(true);
  });

  it("blocks tenant sites and preview labels", () => {
    expect(originMayActOnAccount(req("https://evil.aft.page"), root)).toBe(false);
    expect(
      originMayActOnAccount(req("https://152fffaf71c6--vic.aft.page"), root),
    ).toBe(false);
  });

  it("allows foreign sites (SameSite cookies are not sent)", () => {
    expect(originMayActOnAccount(req("https://evil.example"), root)).toBe(true);
  });
});

describe("originMayActOnSlug", () => {
  it("still allows the matching tenant origin", () => {
    expect(
      originMayActOnSlug(req("https://vic.aft.page"), "vic", root),
    ).toBe(true);
    expect(
      originMayActOnSlug(req("https://evil.aft.page"), "vic", root),
    ).toBe(false);
  });
});
