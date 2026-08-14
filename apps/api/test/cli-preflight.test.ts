import { describe, expect, it } from "vitest";
import {
  adviseFromSnapshot,
  sanitizeSnapshot,
} from "../src/cli-preflight";
import { API_ORIGIN, call } from "./helpers";

describe("adviseFromSnapshot", () => {
  it("refuses Next SSR before upload", () => {
    const a = adviseFromSnapshot({
      framework: "next-ssr",
      runtime: "next",
      staticDeployable: false,
      hasIndexHtml: false,
    });
    expect(a.ok).toBe(false);
    expect(a.error).toBe("not_static");
    expect(a.action).toBe("refuse");
    expect(a.fix).toMatch(/export/);
  });

  it("asks for a build when output is missing", () => {
    const a = adviseFromSnapshot({
      framework: "vite",
      runtime: "static",
      staticDeployable: true,
      needsBuild: true,
      buildScript: "build",
      hasIndexHtml: false,
    });
    expect(a.action).toBe("run_build");
    expect(a.error).toBe("needs_build");
  });

  it("ok when index.html is present", () => {
    expect(
      adviseFromSnapshot({
        hasIndexHtml: true,
        runtime: "static",
        staticDeployable: true,
        fileCount: 4,
      }).ok,
    ).toBe(true);
  });
});

describe("POST /v1/cli/preflight", () => {
  it("returns rules advice without requiring AI", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/cli/preflight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.50",
        },
        body: JSON.stringify({
          framework: "next-ssr",
          runtime: "next",
          staticDeployable: false,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      action: string;
      source: string;
    };
    expect(body).toMatchObject({
      ok: false,
      error: "not_static",
      action: "refuse",
      source: "rules",
    });
  });

  it("rejects junk bodies", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/cli/preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "[]",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("sanitizeSnapshot", () => {
  it("drops unknown fields and caps paths", () => {
    const s = sanitizeSnapshot({
      framework: "vite",
      extra: "nope",
      samplePaths: Array.from({ length: 50 }, (_, i) => `f${i}.js`),
    });
    expect(s?.framework).toBe("vite");
    expect(s && "extra" in s).toBe(false);
    expect(s?.samplePaths).toHaveLength(40);
  });
});
