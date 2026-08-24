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
    expect(ex.why).toMatch(/25 MB/);
    expect(ex.fix.toLowerCase()).toContain("shrink");
  });

  it("tells Next to deploy", () => {
    const ex = explainDeployFailure({ error: "needs_next_build" });
    expect(ex.fix).toMatch(/aft deploy/i);
  });

  it("tells custom server apps to set upstream", () => {
    const ex = explainDeployFailure({ error: "not_static" });
    expect(ex.fix).toMatch(/aft\.json/);
  });

  it("says db/queue is not a site", () => {
    const ex = explainDeployFailure({ error: "not_a_site" });
    expect(ex.why.toLowerCase()).toMatch(/database|queue|cache/);
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
