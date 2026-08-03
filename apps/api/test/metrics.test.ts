/** Client header parsing + metric schema smoke (no AE network in tests). */
import { describe, it, expect } from "vitest";
import { resolveClient, writeMetric } from "../src/metrics";

describe("resolveClient", () => {
  it("reads X-Aft-Client", () => {
    expect(
      resolveClient(
        new Request("https://api.aft.page/v1/deploy", {
          headers: { "x-aft-client": "mcp" },
        }),
      ),
    ).toBe("mcp");
    expect(
      resolveClient(
        new Request("https://api.aft.page/v1/deploy", {
          headers: { "X-Aft-Client": "web" },
        }),
      ),
    ).toBe("web");
    expect(
      resolveClient(
        new Request("https://api.aft.page/v1/deploy", {
          headers: { "x-aft-client": "extension" },
        }),
      ),
    ).toBe("extension");
  });

  it("infers curl from User-Agent", () => {
    expect(
      resolveClient(
        new Request("https://api.aft.page/v1/deploy", {
          headers: { "user-agent": "curl/8.7.1" },
        }),
      ),
    ).toBe("curl");
  });

  it("falls back to other", () => {
    expect(resolveClient(new Request("https://api.aft.page/v1/deploy"))).toBe(
      "other",
    );
  });
});

describe("writeMetric", () => {
  it("no-ops without METRICS binding", () => {
    expect(() =>
      writeMetric(
        {},
        {
          event: "deploy",
          source: "web",
          status: "ok",
          ms: 12,
          httpStatus: 200,
        },
      ),
    ).not.toThrow();
  });

  it("calls writeDataPoint when bound", () => {
    const points: unknown[] = [];
    writeMetric(
      {
        METRICS: {
          writeDataPoint(p: unknown) {
            points.push(p);
          },
        } as AnalyticsEngineDataset,
      },
      {
        event: "page_view",
        source: "other",
        status: "ok",
        slug: "hello",
        deployer: "abcd",
        httpStatus: 200,
      },
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      indexes: ["page_view"],
      blobs: ["other", "ok", "hello", "abcd"],
    });
  });
});
