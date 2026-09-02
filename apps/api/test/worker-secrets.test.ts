import { describe, expect, it } from "vitest";
import {
  needsWorkerSecretSync,
  workerScriptName,
} from "../src/worker-secrets";

describe("worker-secrets", () => {
  it("derives script name from workers.dev upstream", () => {
    expect(
      workerScriptName("chatcontract", "https://aft-chatcontract.workers.dev"),
    ).toBe("aft-chatcontract");
    expect(
      workerScriptName("x", "https://aft-u-x.vaibhavmule135.workers.dev"),
    ).toBe("aft-u-x");
  });

  it("falls back to aft-u-{slug}", () => {
    expect(workerScriptName("demo", null)).toBe("aft-u-demo");
  });

  it("ignores another site's workers.dev hostname", () => {
    expect(
      workerScriptName("evil", "https://aft-u-victim.workers.dev"),
    ).toBe("aft-u-evil");
    expect(
      workerScriptName("evil", "https://unrelated.workers.dev"),
    ).toBe("aft-u-evil");
  });

  it("knows when sync applies", () => {
    expect(needsWorkerSecretSync("next", "https://aft-u-x.workers.dev")).toBe(true);
    expect(needsWorkerSecretSync("static", "https://aft-u-x.workers.dev")).toBe(false);
    expect(needsWorkerSecretSync("next", null)).toBe(false);
  });
});
