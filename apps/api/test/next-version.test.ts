import { describe, expect, it } from "vitest";
import {
  NEXT_MIN_15,
  NEXT_MIN_16,
  nextVersionUnsupported,
  nextVersionUnsupportedReason,
} from "../src/next-version";

describe("nextVersionUnsupported", () => {
  it("refuses Next 14 and empty", () => {
    expect(nextVersionUnsupported("")).toBe(true);
    expect(nextVersionUnsupported("14.2.5")).toBe(true);
  });

  it("refuses 15.x and 16.x below the Aug 2026 floor", () => {
    expect(nextVersionUnsupported("15.5.21")).toBe(true);
    expect(nextVersionUnsupported("15.5.23")).toBe(true);
    expect(nextVersionUnsupported("16.2.11")).toBe(true);
    expect(nextVersionUnsupported("16.3.2")).toBe(true);
  });

  it("allows patched 15/16 and newer majors", () => {
    expect(nextVersionUnsupported(NEXT_MIN_15)).toBe(false);
    expect(nextVersionUnsupported("15.5.25")).toBe(false);
    expect(nextVersionUnsupported(NEXT_MIN_16)).toBe(false);
    expect(nextVersionUnsupported("17.0.0")).toBe(false);
  });

  it("names the floor in the fail reason", () => {
    expect(nextVersionUnsupportedReason("15.5.21")).toContain(NEXT_MIN_15);
    expect(nextVersionUnsupportedReason("15.5.21")).toContain(NEXT_MIN_16);
  });
});
