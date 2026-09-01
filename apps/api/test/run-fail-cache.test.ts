import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { randomToken, sha256Hex } from "../src/auth";
import { insertRunJob, getRunJob } from "../src/db";
import {
  parseCachedRunFail,
  readCachedRunFail,
  runFailCacheKey,
  shaFromPlanJson,
  shouldCacheFail,
  writeCachedRunFail,
} from "../src/run-fail-cache";
import { API_ORIGIN, call } from "./helpers";

describe("run fail cache", () => {
  it("keys by owner/repo/sha/root and skips transient errors", () => {
    expect(runFailCacheKey("Octo", "HRMS", "AbC", "Backend")).toBe(
      "runfail:9:octo/hrms:abc:backend",
    );
    expect(shouldCacheFail("build_failed", "This API uses Postgres.")).toBe(true);
    expect(shouldCacheFail("stopped", "Stopped.")).toBe(false);
    expect(shouldCacheFail("rate_limited", "wait")).toBe(false);
    expect(shouldCacheFail("pick_root", "pick a folder")).toBe(false);
    expect(
      shouldCacheFail("build_failed", "Tunnel recovery attempts were exhausted"),
    ).toBe(false);
    expect(shaFromPlanJson(JSON.stringify({ runtime: "container", sha: "deadbeef" }))).toBe(
      "deadbeef",
    );
    expect(parseCachedRunFail(`{"error":"build_failed","reason":"needs pg"}`)?.reason).toBe(
      "needs pg",
    );
  });

  it("round-trips through SITES", async () => {
    await writeCachedRunFail(env, "octo", "hrms", "abc1234", "", {
      error: "build_failed",
      reason: "This API uses Postgres.",
    });
    const hit = await readCachedRunFail(env, "octo", "hrms", "abc1234", "");
    expect(hit?.reason).toMatch(/Postgres/);
  });

  it("PATCH failed with sha in plan_json stores the replay", async () => {
    const token = randomToken("run_tok_");
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hrms",
      url: "https://github.com/octo/hrms",
      trigger: "test",
      kind: "container",
      phase: "queued",
      slug: "cachefail1",
      jobTokenHash: await sha256Hex(token),
      planJson: JSON.stringify({
        runtime: "container",
        stack: "Express",
        sha: "cafebab",
      }),
    });
    const fail = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phase: "failed",
          reason: "This API uses Postgres. Try URLs have no Postgres.",
        }),
      }),
    );
    expect(fail.status).toBe(200);
    const job = await getRunJob(env, id);
    expect(job?.status).toBe("failed");
    const hit = await readCachedRunFail(env, "octo", "hrms", "cafebab", "");
    expect(hit?.reason).toMatch(/Postgres/);
  });
});
