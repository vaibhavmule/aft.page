/** Founder ops.aft.page — gate + failure trail. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createSession, findOrCreateUser } from "../src/auth";
import {
  CF_USAGE_KV_KEY,
  buildTimeToUrlScore,
  decideWfpTrigger,
  estimateWorkersPaid,
  fillDayWindow,
  formatT2u,
  isOpsEmail,
  parseOpsEmails,
  parseOpsHubPanel,
  percentileNearest,
  summarizeMs,
} from "../src/ops";
import {
  fillDaySeries,
  fillHourWindow,
  normalizeBucketKey,
  parseVisitsRange,
  parseVisitsScope,
  rollupCountries,
  visitsCacheKey,
} from "../src/visits";
import { saveSnapshot, type StatusSnapshot } from "../src/status";
import { compatDateFresh, runCfPracticeChecks } from "../src/cf-practices";
import { call, deployPaste, uploadJson } from "./helpers";

const snapshot: StatusSnapshot = {
  checkedAt: "2026-08-08T12:00:00.000Z",
  overall: "operational",
  components: [
    {
      id: "api",
      name: "API",
      description: "API",
      url: "https://api.aft.page/health",
      ok: true,
      status: "operational",
      httpStatus: 200,
      latencyMs: 1,
      error: null,
      checkedAt: "2026-08-08T12:00:00.000Z",
    },
  ],
};

async function sessionCookie(email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

describe("ops hub paths", () => {
  it("parses panel pathnames", () => {
    expect(parseOpsHubPanel("/")).toBe("overview");
    expect(parseOpsHubPanel("/overview")).toBe("overview");
    expect(parseOpsHubPanel("/sites")).toBe("sites");
    expect(parseOpsHubPanel("/sites/")).toBe("sites");
    expect(parseOpsHubPanel("/visits")).toBe(null);
    expect(parseOpsHubPanel("/distribute")).toBe("distribute");
    expect(parseOpsHubPanel("/nope")).toBe(null);
  });
});

describe("workers cost estimate", () => {
  it("is the $5 plan until included usage is exceeded", () => {
    expect(estimateWorkersPaid(3200, 8000)).toEqual({
      subscription: 5,
      requestsUsd: 0,
      cpuUsd: 0,
      totalUsd: 5,
    });
    const over = estimateWorkersPaid(12_000_000, 40_000_000);
    expect(over.requestsUsd).toBe(0.6);
    expect(over.cpuUsd).toBe(0.2);
    expect(over.totalUsd).toBe(5.8);
  });
});

describe("visits rollup helpers", () => {
  it("parses range/scope defaults and cache keys", () => {
    expect(parseVisitsRange(null)).toBe("7d");
    expect(parseVisitsRange("24h")).toBe("24h");
    expect(parseVisitsRange("nope")).toBe("7d");
    expect(parseVisitsScope(undefined)).toBe("all");
    expect(parseVisitsScope("all")).toBe("all");
    expect(parseVisitsScope("hello")).toBe("hello");
    expect(visitsCacheKey("hello", "7d")).toBe("ops:visits:hello:7d");
  });

  it("normalizes AE bucket keys and fills continuous windows", () => {
    expect(normalizeBucketKey("2026-08-11 09:15:00", true)).toBe(
      "2026-08-11T09:00:00.000Z",
    );
    expect(normalizeBucketKey("2026-08-11T12:00:00Z", false)).toBe("2026-08-11");
    const now = new Date("2026-08-11T18:30:00.000Z");
    const hours = fillHourWindow(
      [{ t: "2026-08-11T17:00:00.000Z", n: 4 }],
      24,
      now,
    );
    expect(hours).toHaveLength(24);
    expect(hours[hours.length - 1]).toEqual({
      t: "2026-08-11T18:00:00.000Z",
      n: 0,
    });
    expect(hours[hours.length - 2]).toEqual({
      t: "2026-08-11T17:00:00.000Z",
      n: 4,
    });
    const days = fillDaySeries(
      [{ t: "2026-08-10", n: 9 }],
      7,
      now,
    );
    expect(days).toHaveLength(7);
    expect(days[0].t).toBe("2026-08-05");
    expect(days.find((d) => d.t === "2026-08-10")?.n).toBe(9);
  });

  it("rolls top countries and Other", () => {
    const rows = Array.from({ length: 18 }, (_, i) => ({
      country: `C${i}`,
      n: 18 - i,
    }));
    const rolled = rollupCountries(rows, 15);
    expect(rolled).toHaveLength(16);
    expect(rolled[0]).toEqual({ country: "C0", n: 18 });
    expect(rolled[15].country).toBe("Other");
    expect(rolled[15].n).toBe(3 + 2 + 1); // C15..C17
  });
});

describe("wfp trigger", () => {
  it("stays until script count or overage crosses the ADR lines", () => {
    expect(decideWfpTrigger(3, 0).status).toBe("stay");
    expect(decideWfpTrigger(400, 0).status).toBe("watch");
    expect(decideWfpTrigger(450, 0).status).toBe("switch");
    expect(decideWfpTrigger(10, 10.01).status).toBe("watch");
    expect(decideWfpTrigger(10, 20.01).status).toBe("switch");
    expect(decideWfpTrigger(3, 0).why).toMatch(/stay on \$5/);
  });
});

describe("time to URL stats", () => {
  it("nearest-rank p50/p95 and format", () => {
    expect(percentileNearest([], 50)).toBe(null);
    expect(percentileNearest([10, 20, 30, 40], 50)).toBe(20);
    expect(percentileNearest([10, 20, 30, 40], 95)).toBe(40);
    expect(summarizeMs([100, 200, 300])).toEqual({
      n: 3,
      p50Ms: 200,
      p95Ms: 300,
      avgMs: 200,
    });
    expect(formatT2u(null)).toBe("—");
    expect(formatT2u(340)).toBe("340 ms");
    expect(formatT2u(1200)).toBe("1.2 s");
    expect(formatT2u(12_000)).toBe("12 s");
  });

  it("splits 24h vs 7d and fills empty UTC days", () => {
    const now = new Date("2026-08-09T18:00:00.000Z");
    const score = buildTimeToUrlScore(
      [
        { createdAt: "2026-08-09T17:00:00.000Z", ms: 400 },
        { createdAt: "2026-08-03T12:00:00.000Z", ms: 8000 },
      ],
      now,
    );
    expect(score.last24h).toEqual({ n: 1, p50Ms: 400, p95Ms: 400, avgMs: 400 });
    expect(score.last7d.n).toBe(2);
    expect(score.last7d.p50Ms).toBe(400);
    expect(score.last7d.p95Ms).toBe(8000);
    expect(score.days.map((d) => d.day)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
    expect(score.days[0]).toMatchObject({ day: "2026-08-03", n: 1, p50Ms: 8000 });
    expect(score.days[6]).toMatchObject({ day: "2026-08-09", n: 1, p50Ms: 400 });
    expect(score.days[1].n).toBe(0);
  });
});

describe("day chart window", () => {
  it("fills seven UTC days including zeros", () => {
    const now = new Date("2026-08-08T18:00:00.000Z");
    const filled = fillDayWindow(
      [{ day: "2026-08-08", successes: 19, failures: 2 }],
      7,
      now,
    );
    expect(filled.map((d) => d.day)).toEqual([
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ]);
    expect(filled[0]).toEqual({
      day: "2026-08-02",
      successes: 0,
      failures: 0,
    });
    expect(filled[6]).toEqual({
      day: "2026-08-08",
      successes: 19,
      failures: 2,
    });
  });
});

describe("cf practices", () => {
  it("flags a compatibility_date older than 6 months", () => {
    const now = new Date("2026-08-09T00:00:00.000Z");
    expect(compatDateFresh("2026-07-26", now)).toBe(true);
    expect(compatDateFresh("2025-01-01", now)).toBe(false);
  });

  it("passes on the test worker bindings", async () => {
    const result = await runCfPracticeChecks(env);
    const failed = result.cases.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("ops allowlist", () => {
  it("parses comma-separated emails", () => {
    expect(parseOpsEmails(" hello@aft.page, Ops@Example.com ")).toEqual([
      "hello@aft.page",
      "ops@example.com",
    ]);
    expect(isOpsEmail(env, "ops@example.com")).toBe(true);
    expect(isOpsEmail(env, "stranger@example.com")).toBe(false);
  });
});

describe("ops.aft.page host", () => {
  it("rejects ops as a site slug", async () => {
    const res = await call(
      new Request("https://api.aft.page/v1/deploy?slug=ops", {
        method: "POST",
        headers: { "content-type": "text/html" },
        body: "<h1>nope</h1>",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "reserved_slug" });
  });

  it("redirects anonymous visitors to login", async () => {
    const res = await call(new Request("https://ops.aft.page/"));
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") || "";
    expect(loc).toContain("https://aft.page/login?next=");
    expect(decodeURIComponent(loc)).toContain("https://ops.aft.page/");
  });

  it("forbids signed-in non-ops emails", async () => {
    const cookie = await sessionCookie("stranger@example.com");
    const res = await call(
      new Request("https://ops.aft.page/", { headers: { cookie } }),
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("founders only");
  });

  it("shows health, failures, and log links for ops email", async () => {
    await saveSnapshot(env, snapshot);
    await env.STATUS!.put(
      CF_USAGE_KV_KEY,
      JSON.stringify({
        checkedAt: "2026-08-08T18:00:00.000Z",
        scripts: [
          { name: "aft-page-api", requests: 2886, errors: 0 },
          { name: "aft-page-mcp", requests: 314, errors: 0 },
        ],
        requests: 3200,
        cpuMs: 8000,
      }),
    );
    await call(
      uploadJson([
        { path: "index.html", content: "<h1>ok</h1>" },
        { path: "big.bin", content: "y".repeat(25 * 1024 * 1024 + 1) },
      ]),
    );
    await env.DB.prepare(
      `INSERT INTO waitlist_signups (id, email, source, created_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind("wl-ops", "early@example.com", "marketing", "2026-08-01T00:00:00.000Z")
      .run();
    const cookie = await sessionCookie("ops@example.com");
    const htmlRes = await call(
      new Request("https://ops.aft.page/", { headers: { cookie } }),
    );
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain("aft-page-api");
    expect(html).toContain("aft-page-mcp");
    expect(html).toContain("file_too_large");
    expect(html).toContain("big.bin");
    expect(html).toContain("per-file cap");
    expect(html).toContain("day-chart");
    expect(html).toContain("day-ok");
    expect(html).toContain("hub-nav");
    expect(html).toContain('href="/overview"');
    expect(html).toContain(">Overview<");
    expect(html).toContain("id=\"overview\"");
    expect(html).toContain("Scanner");
    expect(html).toContain("waitlist");
    expect(html).toContain("Operate");
    expect(html).toContain("Cloudflare cost");
    expect(html).toContain("WfP trigger");
    expect(html).toContain('data-live="wfpStatus"');
    expect(html).toContain("stay on $5");
    expect(html).toContain("3,200");
    expect(html).toContain("KV snapshot");
    expect(html).not.toContain("Set CF_API_TOKEN");
    expect(html).not.toContain("chat session");
    expect(html).toContain('id="cf"');
    expect(html).toContain("CF practices");
    expect(html).toContain("nodejs_compat");
    expect(html).toContain("D1 binding");
    expect(html).toContain("id=\"network\"");
    expect(html).toContain('id="stories"');
    expect(html).toContain('id="distribute"');
    expect(html).toContain('id="todos"');
    expect(html).toContain("30-day checklist");
    expect(html).toContain("Plugin + CLI distribution");
    expect(html).toContain("Cursor marketplace");
    expect(html).toContain('href="/distribute"');
    expect(html).toContain('data-check-nav="distribute"');
    expect(html).toContain('data-check-nav="todos"');
    expect(html).toContain("data-check-id");
    expect(html).toContain("domain-primary");
    expect(html).toContain("Company email on domain");
    expect(html).toContain("X / Twitter handle claimed");
    expect(html).toContain("launch-now");
    expect(html).toContain("/api/checklist");
    expect(html).toContain("net-svg");
    expect(html).toContain("mcp.aft.page");
    expect(html).toContain("POST /v1/deploy");
    expect(html).toContain("API host → bind MCP");
    expect(html).toContain(
      "https://dash.cloudflare.com/44255ec64e0080b678670b53bf810d27/workers/services/view/aft-page-api/production/observability/logs",
    );
    expect(html).toContain("data-live=\"sites\"");
    expect(html).toContain('id="users"');
    expect(html).toContain('id="domains"');
    expect(html).toContain('href="/users"');
    expect(html).toContain("Time to URL");
    expect(html).toContain("data-live=\"t2uP5024\"");
    expect(html).toContain('id="smoke"');
    expect(html).toContain('id="audit"');
    expect(html).toContain("Hijack / audit");
    expect(html).toContain(">Critical<");
    expect(html).toContain(">Information<");
    expect(html.indexOf(">Critical<")).toBeLessThan(html.indexOf(">Information<"));
    expect(html.indexOf("Hijack / audit")).toBeLessThan(html.indexOf("Time to URL"));
    expect(html).toContain(">Probes<");
    expect(html).toContain("No scanner probes in 7 days.");
    expect(html).toContain("llis.nasa.gov/lesson/803");
    expect(html).toContain("Fail fast");
    expect(html).toContain("CIL / smoke");
    expect(html).toContain('id="sites"');
    expect(html).toContain("href=\"/sites\"");
    expect(html).toContain('href="/sites?filter=claimed"');
    expect(html).toContain('href="/sites?filter=served24h"');
    expect(html).toContain('href="/users#waitlist"');
    expect(html).toContain('id="waitlist"');
    expect(html).toContain("early@example.com");
    expect(html).toContain("Homepage email capture");
    expect(html).toContain("data-visits-root");
    expect(html).toContain("data-visits-range");
    expect(html).toContain(">Traffic<");
    expect(html).toContain(">Inventory<");
    expect(html).toContain("HTML views");
    expect(html).not.toContain('id="visits"');
    expect(html).not.toContain('href="#visits"');
    expect(html).not.toContain("Top sites (7d views)");

    const sitesRes = await call(
      new Request("https://ops.aft.page/sites", { headers: { cookie } }),
    );
    expect(sitesRes.status).toBe(200);
    expect(await sitesRes.text()).toContain('id="sites"');

    const visitsRedirect = await call(
      new Request("https://ops.aft.page/visits", {
        headers: { cookie },
        redirect: "manual",
      }),
    );
    expect(visitsRedirect.status).toBe(302);
    expect(visitsRedirect.headers.get("location")).toBe("https://ops.aft.page/sites");

    const jsonRes = await call(
      new Request("https://ops.aft.page/api.json", { headers: { cookie } }),
    );
    expect(jsonRes.status).toBe(200);
    const body = (await jsonRes.json()) as {
      service: string;
      successes24h: number;
      failures24h: number;
      rate: number | null;
      successes7d: number;
      failures7d: number;
      toFix: { error: string; n: number; why: string }[];
      failures: {
        id: string;
        error: string;
        path: string | null;
        why?: string;
        hasPayload?: boolean;
      }[];
      logs: { api: string; mcp: string };
      probes: { path: string; status: number; slug: string }[];
      feedback: { message: string }[];
      timeToUrl: {
        last24h: { n: number; p50Ms: number | null; p95Ms: number | null };
        last7d: { n: number; p50Ms: number | null };
      };
      wfp: { status: string; siteWorkers: number };
      snapshot: { siteWorkers: number };
      visits: {
        range: string;
        scope: string;
        viewsTotal: number;
        series: { t: string; n: number }[];
        countries: { country: string; n: number }[];
      };
    };
    expect(body.service).toBe("aft.page-ops");
    expect(body.visits.range).toBe("7d");
    expect(body.visits.scope).toBe("all");
    expect(body.visits.series.length).toBe(7);

    const visitsRes = await call(
      new Request("https://ops.aft.page/api/visits?range=24h&scope=hello", {
        headers: { cookie },
      }),
    );
    expect(visitsRes.status).toBe(200);
    const visitsBody = (await visitsRes.json()) as {
      range: string;
      scope: string;
      series: unknown[];
    };
    expect(visitsBody.range).toBe("24h");
    expect(visitsBody.scope).toBe("hello");
    expect(visitsBody.series.length).toBe(24);
    expect(body.wfp.status).toBe("stay");
    expect(body.snapshot.siteWorkers).toBe(0);
    expect(body.failures24h).toBeGreaterThanOrEqual(1);
    expect(body.successes24h).toBeGreaterThanOrEqual(0);
    expect(body.rate === null || (body.rate >= 0 && body.rate <= 1)).toBe(true);
    expect(body.toFix.some((f) => f.error === "file_too_large")).toBe(true);
    const hit = body.failures.find((f) => f.error === "file_too_large" && f.path === "big.bin");
    expect(hit?.why).toContain("big.bin");
    expect(hit?.hasPayload).toBe(true);
    expect(body.logs.api).toContain("aft-page-api");
    expect(body.logs.mcp).toContain("aft-page-mcp");
    expect(Array.isArray(body.probes)).toBe(true);
    expect(Array.isArray(body.feedback)).toBe(true);
    expect(body.timeToUrl.last24h.n).toBeGreaterThanOrEqual(0);
    expect(body.timeToUrl.last7d.n).toBeGreaterThanOrEqual(0);

    const detail = await call(
      new Request(`https://ops.aft.page/f/${hit!.id}`, { headers: { cookie } }),
    );
    expect(detail.status).toBe(200);
    const detailHtml = await detail.text();
    expect(detailHtml).toContain("Why");
    expect(detailHtml).toContain("big.bin");
    expect(detailHtml).toContain("index.html");
    expect(detailHtml).toContain("Uploaded files");
    expect(detailHtml).toContain("aft-page-api logs");
    expect(detailHtml).toContain("Retry deploy");

    const preview = await call(
      new Request(
        `https://ops.aft.page/f/${hit!.id}/file?path=${encodeURIComponent("index.html")}&preview=1`,
        { headers: { cookie } },
      ),
    );
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain("<h1>ok</h1>");

    const dl = await call(
      new Request(
        `https://ops.aft.page/f/${hit!.id}/file?path=${encodeURIComponent("big.bin")}`,
        { headers: { cookie } },
      ),
    );
    expect(dl.status).toBe(200);
    expect((await dl.arrayBuffer()).byteLength).toBe(25 * 1024 * 1024 + 1);

    const retry = await call(
      new Request(`https://ops.aft.page/f/${hit!.id}/retry`, {
        method: "POST",
        headers: { cookie, accept: "application/json" },
      }),
    );
    expect(retry.status).toBe(400);
    expect(await retry.json()).toMatchObject({ error: "file_too_large", path: "big.bin" });
  });

  it("retries a reserved_slug payload into a live site", async () => {
    const failRes = await call(
      uploadJson(
        [
          { path: "index.html", content: "<h1>retry me</h1>" },
          { path: "ok.txt", content: "hi" },
        ],
        "ops",
      ),
    );
    expect(failRes.status).toBe(400);
    expect(await failRes.json()).toMatchObject({ error: "reserved_slug" });

    const cookie = await sessionCookie("ops@example.com");
    const list = (await (
      await call(new Request("https://ops.aft.page/api.json", { headers: { cookie } }))
    ).json()) as {
      successes24h: number;
      failures24h: number;
      rate: number | null;
      failures: { id: string; error: string; hasPayload?: boolean }[];
    };
    const hit = list.failures.find((f) => f.error === "reserved_slug" && f.hasPayload);
    expect(hit).toBeTruthy();

    const retry = await call(
      new Request(`https://ops.aft.page/f/${hit!.id}/retry`, {
        method: "POST",
        headers: { cookie, accept: "application/json" },
      }),
    );
    expect(retry.status).toBe(200);
    const body = (await retry.json()) as { slug: string; url: string };
    expect(body.slug).toBeTruthy();
    expect(body.url).toContain(body.slug);

    const live = await call(new Request(`https://${body.slug}.aft.page/`));
    expect(live.status).toBe(200);
    expect(await live.text()).toContain("retry me");
  });

  it("records machine time-to-url on a successful deploy", async () => {
    await deployPaste("<h1>t2u</h1>");
    const cookie = await sessionCookie("ops@example.com");
    const res = await call(
      new Request("https://ops.aft.page/api.json", { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      timeToUrl: { last24h: { n: number; p50Ms: number | null } };
    };
    expect(body.timeToUrl.last24h.n).toBeGreaterThanOrEqual(1);
    expect(body.timeToUrl.last24h.p50Ms).toBeGreaterThanOrEqual(0);
  });

  it("lists product feedback", async () => {
    const posted = await call(
      new Request("https://api.aft.page/v1/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "ops should show this note",
          email: "user@example.com",
          page: "https://aft.page/",
        }),
      }),
    );
    expect(posted.status).toBe(200);

    const cookie = await sessionCookie("ops@example.com");
    const htmlRes = await call(
      new Request("https://ops.aft.page/", { headers: { cookie } }),
    );
    expect(htmlRes.status).toBe(200);
    expect(await htmlRes.text()).toContain("ops should show this note");

    const jsonRes = await call(
      new Request("https://ops.aft.page/api.json", { headers: { cookie } }),
    );
    const body = (await jsonRes.json()) as {
      feedback: { message: string; email: string | null; page: string | null }[];
    };
    expect(
      body.feedback.some(
        (f) =>
          f.message === "ops should show this note" &&
          f.email === "user@example.com" &&
          f.page === "https://aft.page/",
      ),
    ).toBe(true);
  });

  it("lists sites and shows per-slug detail", async () => {
    const deployed = await deployPaste("<h1>ops listed</h1>", "ops-listed");
    await call(new Request("https://ops-listed.aft.page/"));
    const cookie = await sessionCookie("ops@example.com");

    const listHtml = await (
      await call(new Request("https://ops.aft.page/", { headers: { cookie } }))
    ).text();
    expect(listHtml).toContain('id="sites"');
    expect(listHtml).toContain('href="/sites"');
    expect(listHtml).toContain('data-filter="claimed"');
    expect(listHtml).toContain('data-filter="served24h"');
    expect(listHtml).toContain('data-served24="1"');
    expect(listHtml).toContain("ops-listed");
    expect(listHtml).toContain("/s/ops-listed");
    expect(listHtml).toContain("Views today");
    expect(listHtml).toContain(">Traffic<");
    expect(listHtml).not.toContain("Top sites (7d views)");

    const detailRes = await call(
      new Request("https://ops.aft.page/s/ops-listed", { headers: { cookie } }),
    );
    expect(detailRes.status).toBe(200);
    const detailHtml = await detailRes.text();
    expect(detailHtml).toContain("unclaimed");
    expect(detailHtml).toContain(deployed.deployId);
    expect(detailHtml).toContain("No named secrets");
    expect(detailHtml).toContain("Identity");
    expect(detailHtml).toContain("Views 7d");

    const jsonRes = await call(
      new Request("https://ops.aft.page/s/ops-listed.json", { headers: { cookie } }),
    );
    expect(jsonRes.status).toBe(200);
    const body = (await jsonRes.json()) as {
      site: { slug: string; deployId: string; ownerEmail: string | null };
      views: { today: number; d7: number };
      secrets: string[];
      deploys: { id: string }[];
      files: { path: string }[];
    };
    expect(body.site.slug).toBe("ops-listed");
    expect(body.views.d7).toBeGreaterThanOrEqual(1);
    expect(body.site.ownerEmail).toBeNull();
    expect(body.site.deployId).toBe(deployed.deployId);
    expect(body.secrets).toEqual([]);
    expect(body.deploys.some((d) => d.id === deployed.deployId)).toBe(true);
    expect(body.files.some((f) => f.path === "index.html")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("token_hash");
    expect(JSON.stringify(body)).not.toContain(deployed.editToken);

    const stranger = await sessionCookie("stranger@example.com");
    const forbidden = await call(
      new Request("https://ops.aft.page/s/ops-listed", {
        headers: { cookie: stranger },
      }),
    );
    expect(forbidden.status).toBe(403);
  });
});
