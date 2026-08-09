import { describe, it, expect } from "vitest";
import { explainDeployFailure, formatBytes } from "../src/fail-explain";

describe("explainDeployFailure", () => {
  it("says which file blew the cap", () => {
    const ex = explainDeployFailure({
      error: "file_too_large",
      path: "big.bin",
      bytes: 2 * 1024 * 1024 + 1,
    });
    expect(ex.why).toContain("big.bin");
    expect(ex.why).toMatch(/10 MB/);
    expect(ex.fix.toLowerCase()).toContain("shrink");
  });

  it("surfaces internal hint", () => {
    const ex = explainDeployFailure({
      error: "internal",
      hint: "R2 put failed",
    });
    expect(ex.why).toContain("R2 put failed");
  });
});

describe("formatBytes", () => {
  it("formats", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});
