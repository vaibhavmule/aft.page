import { describe, expect, it } from "vitest";
import { randomToken, sha256Hex } from "../src/auth";
import { getRunJob, finishRunJob, insertRunJob, getSiteRow } from "../src/db";
import { API_ORIGIN, call } from "./helpers";
import { env } from "cloudflare:test";

describe("run job API", () => {
  it("GET unknown job is 404", async () => {
    const res = await call(new Request(`${API_ORIGIN}/v1/jobs/run_doesnotexist`));
    expect(res.status).toBe(404);
  });

  it("PATCH with a forged JWT is 401", async () => {
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hello-next",
      url: "https://github.com/octo/hello-next",
      trigger: "test",
      kind: "next",
      phase: "queued",
      slug: "jobjwt1",
      jobTokenHash: await sha256Hex("run_tok_secret"),
    });
    const res = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer eyJhbGciOiJub25lIn0.eyJhdWQiOiJ4In0.",
        },
        body: JSON.stringify({ phase: "building", line: "nope" }),
      }),
    );
    expect(res.status).toBe(401);
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
        body: JSON.stringify({ phase: "building", line: "Building Next.js" }),
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
    expect(body.logTail).toContain("Building Next.js");
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
    expect(body.logTail).toMatch(/next/i);
    expect(body.reason).toMatch(/Next\.js build failed/i);
    expect(body.logTail).not.toMatch(/OpenNext|Wrangler|Cloudflare|opennextjs/i);
    expect(body.reason).not.toMatch(/OpenNext|Wrangler|Cloudflare|opennextjs/i);
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

  it("container complete maps runtime worker + upstream", async () => {
    const token = randomToken("run_tok_");
    const slug = `ctrj${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hello-express",
      url: "https://github.com/octo/hello-express",
      trigger: "test",
      kind: "container",
      phase: "queued",
      slug,
      jobTokenHash: await sha256Hex(token),
    });
    const upstream = "https://example-tunnel.trycloudflare.com";
    const complete = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ upstream, log: "live" }),
      }),
    );
    expect(complete.status).toBe(200);
    const done = (await complete.json()) as { ok: boolean; slug: string };
    expect(done.ok).toBe(true);

    const meta = JSON.parse((await env.SITES.get(`site:${slug}`))!) as {
      runtime: string;
      upstreamUrl: string;
    };
    expect(meta.runtime).toBe("worker");
    expect(meta.upstreamUrl).toBe("https://example-tunnel.trycloudflare.com");

    const row = await getSiteRow(env, slug);
    expect(row?.runtime).toBe("worker");
    expect(row?.upstreamUrl).toBe("https://example-tunnel.trycloudflare.com");

    const job = await getRunJob(env, id);
    expect(job?.status).toBe("live");
  });

  it("POST stop marks failed so complete cannot go live", async () => {
    const token = randomToken("run_tok_");
    const id = await insertRunJob(env, {
      owner: "octo",
      repo: "hello-next",
      url: "https://github.com/octo/hello-next",
      trigger: "test",
      kind: "next",
      phase: "cloning",
      slug: "stopjob1",
      jobTokenHash: await sha256Hex(token),
    });
    const stop = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}/stop`, { method: "POST" }),
    );
    expect(stop.status).toBe(200);
    const job = await getRunJob(env, id);
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("stopped");
    const complete = await call(
      new Request(`${API_ORIGIN}/v1/jobs/${id}/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ upstream: "https://example.com" }),
      }),
    );
    expect(complete.status).toBe(409);
  });
});

describe("ghaDispatchInputs", () => {
  it("never includes a job bearer token", async () => {
    const { ghaDispatchInputs } = await import("../src/jobs");
    const next = ghaDispatchInputs({
      kind: "next",
      jobId: "run_abc",
      owner: "octo",
      repo: "hello",
      slug: "hello",
      branch: "main",
    });
    expect(next).toEqual({
      job_id: "run_abc",
      owner: "octo",
      repo: "hello",
      slug: "hello",
      branch: "main",
    });
    expect(Object.keys(next).join(",")).not.toMatch(/token/i);

    const stat = ghaDispatchInputs({
      kind: "static_build",
      jobId: "run_abc",
      owner: "octo",
      repo: "hello",
      slug: "hello",
      branch: "main",
      plan: {
        runtime: "static",
        stack: "Vite",
        install: "npm ci",
        build: "npm run build",
        outputDirs: ["dist"],
        root: "web",
      },
    });
    expect(stat.job_token).toBeUndefined();
    expect(stat.install).toBe("npm ci");
    expect(stat.root).toBe("web");
  });
});

describe("runContainerRunUrl", () => {
  it("defaults and strips trailing slash", async () => {
    const { runContainerRunUrl } = await import("../src/jobs");
    expect(runContainerRunUrl({})).toBe("https://run-container.aft.page/v1/run");
    expect(runContainerRunUrl({ AFT_RUN_CONTAINER_URL: "https://run-container.aft.page/" })).toBe(
      "https://run-container.aft.page/v1/run",
    );
  });
});

describe("dispatchRunContainer", () => {
  it("posts to the RUN_CONTAINER mock and succeeds", async () => {
    const { dispatchRunBuildWorkflow } = await import("../src/jobs");
    expect(env.RUN_CONTAINER).toBeTruthy();
    const out = await dispatchRunBuildWorkflow(env, {
      kind: "container",
      jobId: "run_testcontainer",
      jobToken: "tok",
      owner: "octo",
      repo: "hello-express",
      slug: "hello-express",
      branch: "main",
      plan: {
        runtime: "container",
        stack: "Express",
        install: "npm install",
        start: "npm start",
        port: 3000,
      },
    });
    expect(out).toEqual({ ok: true });
  });
});
