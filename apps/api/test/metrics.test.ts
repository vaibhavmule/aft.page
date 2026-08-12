/** Client header parsing + metric schema smoke (no AE network in tests). */
import { describe, it, expect } from "vitest";
import {
  resolveClient,
  trackPageView,
  trackServe,
  trackWaitlist,
  writeMetric,
} from "../src/metrics";

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
    expect(
      resolveClient(
        new Request("https://api.aft.page/v1/deploy", {
          headers: { "x-aft-client": "mac" },
        }),
      ),
    ).toBe("mac");
    expect(
      resolveClient(
        new Request("https://api.aft.page/v1/deploy", {
          headers: { "x-aft-client": "mcp-remote" },
        }),
      ),
    ).toBe("mcp");
    expect(
      resolveClient(
        new Request("https://api.aft.page/v1/deploy", {
          headers: { "x-aft-client": "ops-retry" },
        }),
      ),
    ).toBe("ops-retry");
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
      blobs: ["other", "ok", "hello", "abcd", "", ""],
    });
  });

  it("records failing path and request id", () => {
    const points: Array<{ blobs?: string[] }> = [];
    writeMetric(
      {
        METRICS: {
          writeDataPoint(p: unknown) {
            points.push(p as { blobs?: string[] });
          },
        } as AnalyticsEngineDataset,
      },
      {
        event: "deploy",
        source: "mcp",
        status: "file_too_large",
        path: "big.bin",
        requestId: "ray-1",
        httpStatus: 400,
      },
    );
    expect(points[0]?.blobs?.[4]).toBe("big.bin");
    expect(points[0]?.blobs?.[5]).toBe("ray-1");
  });

  it("records serve with status, path, country, bytes", () => {
    const points: Array<{
      indexes?: string[];
      blobs?: string[];
      doubles?: number[];
    }> = [];
    trackServe(
      {
        METRICS: {
          writeDataPoint(p: unknown) {
            points.push(p as (typeof points)[number]);
          },
        } as AnalyticsEngineDataset,
      },
      new Request("https://hello.aft.page/about", {
        headers: { "cf-ipcountry": "IN", "cf-ray": "ray-9" },
      }),
      "hello",
      { httpStatus: 404, path: "/about", bytes: 12 },
    );
    expect(points[0]).toMatchObject({
      indexes: ["serve"],
      blobs: ["other", "404", "hello", "IN", "/about", "ray-9"],
      doubles: [0, 12, 0, 404],
    });
  });

  it("page_view only fires for HTML 200 and stores path", async () => {
    const points: unknown[] = [];
    const bound = {
      METRICS: {
        writeDataPoint(p: unknown) {
          points.push(p);
        },
      } as AnalyticsEngineDataset,
    };
    await trackPageView(
      bound,
      new Request("https://hello.aft.page/app.css"),
      "hello",
      { path: "/app.css", contentType: "text/css", httpStatus: 200 },
    );
    await trackPageView(bound, new Request("https://hello.aft.page/"), "hello", {
      path: "/",
      contentType: "text/html; charset=utf-8",
      httpStatus: 404,
    });
    await trackPageView(bound, new Request("https://hello.aft.page/"), "hello", {
      path: "/",
      contentType: "text/html; charset=utf-8",
      httpStatus: 200,
    });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      indexes: ["page_view"],
      blobs: ["other", "ok", "hello", expect.any(String), "/", expect.any(String)],
    });
  });

  it("records waitlist outcomes without personal identifiers", () => {
    const points: Array<{
      indexes?: string[];
      blobs?: string[];
      doubles?: number[];
    }> = [];
    trackWaitlist(
      {
        METRICS: {
          writeDataPoint(point: unknown) {
            points.push(point as (typeof points)[number]);
          },
        } as AnalyticsEngineDataset,
      },
      "new",
      200,
    );
    expect(points).toEqual([
      {
        indexes: ["waitlist"],
        blobs: ["web", "new", "", "", "", ""],
        doubles: [0, 0, 0, 200],
      },
    ]);
  });
});
