import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { finishRunJob, getSiteRow, insertRunJob } from "../src/db";
import {
  EXPRESS_FIXTURE_SLUG,
  isEphemeralContainerOrigin,
  rebindContainerOrigin,
  sandboxIdForJob,
  tunnelOriginDead,
} from "../src/container-origin";
import { call, uploadJson } from "./helpers";

describe("container origin helpers", () => {
  it("detects Quick Tunnel hosts and tunnel-edge failures", () => {
    expect(isEphemeralContainerOrigin("https://abc.trycloudflare.com")).toBe(true);
    expect(isEphemeralContainerOrigin("https://aft-u-x.workers.dev")).toBe(false);
    expect(tunnelOriginDead(530)).toBe(true);
    expect(tunnelOriginDead(500)).toBe(false);
    expect(sandboxIdForJob("run_abc123")).toBe("run-run-abc123");
  });

  it("rebinds a live container origin through the runner", async () => {
    const slug = `rbd${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const deploy = await call(
      uploadJson(
        [
          { path: "index.html", content: "<p>map</p>" },
          {
            path: "aft.json",
            content: JSON.stringify({
              name: slug,
              runtime: "worker",
              upstream: "https://stale.trycloudflare.com",
            }),
          },
        ],
        slug,
      ),
    );
    expect(deploy.status).toBe(200);
    const id = await insertRunJob(env, {
      owner: "heroku",
      repo: "node-js-getting-started",
      url: "https://github.com/heroku/node-js-getting-started",
      trigger: "test",
      kind: "container",
      slug,
    });
    await finishRunJob(env, id, { status: "live", slug, httpStatus: 200 });

    const next = await rebindContainerOrigin(env, slug);
    expect(next).toBe("https://rebound.trycloudflare.com");
    const row = await getSiteRow(env, slug);
    expect(row?.upstreamUrl).toBe("https://rebound.trycloudflare.com");
  });

  it("keeps the Express fixture slug stable for status probes", () => {
    expect(EXPRESS_FIXTURE_SLUG).toBe("nodejs-getting-started-sky");
  });
});

describe("serve rebind", () => {
  it("retries a dead Quick Tunnel origin once", async () => {
    const slug = `rbds${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const deploy = await call(
      uploadJson(
        [
          { path: "index.html", content: "<p>map</p>" },
          {
            path: "aft.json",
            content: JSON.stringify({
              name: slug,
              runtime: "worker",
              upstream: "https://stale.trycloudflare.com",
            }),
          },
        ],
        slug,
      ),
    );
    expect(deploy.status).toBe(200);
    const id = await insertRunJob(env, {
      owner: "heroku",
      repo: "node-js-getting-started",
      url: "https://github.com/heroku/node-js-getting-started",
      trigger: "test",
      kind: "container",
      slug,
    });
    await finishRunJob(env, id, { status: "live", slug, httpStatus: 200 });

    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input instanceof Request ? input.url : input);
      if (href.includes("rebound.trycloudflare.com")) {
        return new Response("hello from rebound", { status: 200 });
      }
      return new Response("tunnel down", { status: 530 });
    }) as typeof fetch;
    try {
      const res = await call(new Request(`https://${slug}.aft.page/`));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("hello from rebound");
      expect((await getSiteRow(env, slug))?.upstreamUrl).toBe(
        "https://rebound.trycloudflare.com",
      );
    } finally {
      globalThis.fetch = orig;
    }
  });
});
