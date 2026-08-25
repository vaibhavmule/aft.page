import { describe, expect, it } from "vitest";
import { randomToken, sha256Hex } from "../src/auth";
import { getRunJob, finishRunJob, insertRunJob } from "../src/db";
import { API_ORIGIN, call } from "./helpers";
import { env } from "cloudflare:test";

describe("run job API", () => {
  it("GET unknown job is 404", async () => {
    const res = await call(new Request(`${API_ORIGIN}/v1/jobs/run_doesnotexist`));
    expect(res.status).toBe(404);
  });

  it("PATCH without the job token is 401", async () => {
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hello-next",
      url: "https://github.com/octo/hello-next",
      trigger: "test",
      kind: "next",
      phase: "queued",
      slug: "jobtok1",
      jobTokenHash: await sha256Hex("run_tok_secret"),
    });
    const res = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phase: "building", line: "compiling" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("PATCH progress then complete maps runtime next", async () => {
    const token = randomToken("run_tok_");
    const slug = `nxtj${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hello-next",
      url: "https://github.com/octo/hello-next",
      trigger: "test",
      kind: "next",
      phase: "queued",
      slug,
      jobTokenHash: await sha256Hex(token),
    });

    const patch = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phase: "building", line: "opennextjs-cloudflare build" }),
      }),
    );
    expect(patch.status).toBe(200);
    const snap = await call(new Request(`${API_ORIGIN}/v1/jobs/${id}`));
    const body = (await snap.json()) as {
      phase: string;
      logTail: string;
      status: string;
    };
    expect(body.phase).toBe("building");
    expect(body.logTail).toContain("opennextjs-cloudflare build");
    expect(body.status).toBe("queued");

    const complete = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          upstream: `https://aft-u-${slug}.workers.dev`,
          log: "deployed",
        }),
      }),
    );
    expect(complete.status).toBe(200);
    const done = (await complete.json()) as { ok: boolean; slug: string; url: string };
    expect(done.ok).toBe(true);
    expect(done.slug).toBe(slug);

    const job = await getRunJob(env, id);
    expect(job?.status).toBe("live");
    expect(job?.phase).toBe("live");
    expect(job?.siteUrl).toContain(slug);
  });

  it("PATCH failed keeps streamed logTail", async () => {
    const token = randomToken("run_tok_");
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hello-next",
      url: "https://github.com/octo/hello-next",
      trigger: "test",
      kind: "next",
      phase: "queued",
      slug: "failkeep",
      jobTokenHash: await sha256Hex(token),
    });
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    };
    await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          phase: "building",
          line: "Error: No `open-next.config.ts` file was found",
        }),
      }),
    );
    const fail = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          phase: "failed",
          reason: "OpenNext build failed (middleware, env, size, or not a Next app).",
          line: "OpenNext build failed (middleware, env, size, or not a Next app).",
        }),
      }),
    );
    expect(fail.status).toBe(200);
    const snap = await call(new Request(`${API_ORIGIN}/v1/jobs/${id}`));
    const body = (await snap.json()) as { status: string; logTail: string; reason: string };
    expect(body.status).toBe("failed");
    expect(body.logTail).toContain("open-next.config.ts");
    expect(body.reason).toContain("OpenNext build failed");
  });

  it("GET /events streams a terminal snapshot then closes", async () => {
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "done",
      url: "https://github.com/octo/done",
      trigger: "test",
      kind: "next",
    });
    await finishRunJob(env, id, {
      status: "failed",
      error: "no_index",
      reason: "Need index.html or Next.js.",
      httpStatus: 422,
    });
    const res = await call(new Request(`${API_ORIGIN}/v1/jobs/${id}/events`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("failed");
    expect(text).toContain("Need index.html or Next.js.");
  });

  it("complete with files goes live (Vite dist)", async () => {
    const token = randomToken("run_tok_");
    const slug = `vitej${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hello-vite",
      url: "https://github.com/octo/hello-vite",
      trigger: "test",
      kind: "vite",
      phase: "queued",
      slug,
      jobTokenHash: await sha256Hex(token),
    });
    const complete = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          files: [{ path: "index.html", content: "<h1>vite dist</h1>" }],
        }),
      }),
    );
    expect(complete.status).toBe(200);
    const done = (await complete.json()) as { ok: boolean; slug: string };
    expect(done.ok).toBe(true);
    expect(done.slug).toBe(slug);
    const job = await getRunJob(env, id);
    expect(job?.status).toBe("live");
  });
});
