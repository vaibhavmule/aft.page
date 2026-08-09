/** Post-deploy HTTP matrix: empty host vs file-miss vs 500 vs pause/private. */
import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { assignSiteOwner, createSession, findOrCreateUser } from "../src/auth";
import { setSiteActive, setSiteVisibility } from "../src/db";
import {
  API_ORIGIN,
  call,
  deployPaste,
  fetchSite,
  uploadJson,
} from "./helpers";

async function hit(
  slug: string,
  path = "/",
  headers?: HeadersInit,
): Promise<Response> {
  return call(new Request(`https://${slug}.aft.page${path}`, { headers }));
}

describe("undeployed host", () => {
  it.each([
    {
      name: "HTML Accept is branded SITE_NOT_FOUND",
      headers: { accept: "text/html" },
      status: 404,
      error: "SITE_NOT_FOUND",
      type: /text\/html/,
      includes: "Nothing is deployed here",
    },
    {
      name: "xhtml Accept is still HTML",
      headers: { accept: "text/html,application/xhtml+xml" },
      status: 404,
      error: "SITE_NOT_FOUND",
      type: /text\/html/,
      includes: "nobody-pd.aft.page",
    },
    {
      name: "q-ranked HTML Accept is HTML",
      headers: { accept: "text/html;q=0.9,*/*;q=0.8" },
      status: 404,
      error: "SITE_NOT_FOUND",
      type: /text\/html/,
    },
    {
      name: "JSON Accept is SITE_NOT_FOUND json",
      headers: { accept: "application/json" },
      status: 404,
      error: "SITE_NOT_FOUND",
      type: /application\/json/,
      json: { error: "not_found", code: "SITE_NOT_FOUND", slug: "nobody-pd" },
    },
    {
      name: "no Accept is JSON",
      headers: undefined,
      status: 404,
      error: "SITE_NOT_FOUND",
      type: /application\/json/,
    },
    {
      name: "*/* Accept is JSON",
      headers: { accept: "*/*" },
      status: 404,
      error: "SITE_NOT_FOUND",
      type: /application\/json/,
    },
    {
      name: "text/plain Accept is JSON",
      headers: { accept: "text/plain" },
      status: 404,
      error: "SITE_NOT_FOUND",
      type: /application\/json/,
    },
  ] as const)("$name", async (row) => {
    const res = await hit("nobody-pd", "/", row.headers);
    expect(res.status).toBe(row.status);
    expect(res.headers.get("x-aft-error")).toBe(row.error);
    expect(res.headers.get("x-aft-slug")).toBe("nobody-pd");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type") || "").toMatch(row.type);
    if ("json" in row && row.json) {
      expect(await res.json()).toMatchObject(row.json);
      return;
    }
    const body = await res.text();
    if ("includes" in row && row.includes) expect(body).toContain(row.includes);
    expect(body).not.toContain("Claim this site");
    if ((res.headers.get("content-type") || "").includes("html")) {
      expect(body).toContain('name="robots" content="noindex"');
    }
  });

  it.each([
    { name: "deep path still SITE_NOT_FOUND", path: "/about" },
    { name: "README path still SITE_NOT_FOUND", path: "/README.md" },
    { name: "css path still SITE_NOT_FOUND", path: "/app.css" },
    { name: "api path still SITE_NOT_FOUND", path: "/api/health" },
  ] as const)("$name", async ({ path }) => {
    const res = await hit("nobody-pd", path, { accept: "application/json" });
    expect(res.status).toBe(404);
    expect(res.headers.get("x-aft-error")).toBe("SITE_NOT_FOUND");
    expect(await res.json()).toMatchObject({ code: "SITE_NOT_FOUND" });
  });

  it.each([
    { name: "path-serve root", url: `${API_ORIGIN}/s/nobody-pd/` },
    { name: "path-serve nested", url: `${API_ORIGIN}/s/nobody-pd/about` },
  ] as const)("$name is SITE_NOT_FOUND", async ({ url }) => {
    const res = await call(
      new Request(url, { headers: { accept: "application/json" } }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("x-aft-error")).toBe("SITE_NOT_FOUND");
  });

  it("sends CORS and Vary on branded 404", async () => {
    const res = await hit("nobody-pd", "/", { accept: "text/html" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("vary")).toMatch(/Accept/i);
  });
});

describe("file-miss after deploy (readme-only)", () => {
  beforeAll(async () => {
    const md = await call(
      uploadJson([{ path: "README.md", content: "# Hi from md\n" }], "pd-readme"),
    );
    expect(md.status).toBe(200);
    const txt = await call(
      uploadJson([{ path: "notes.txt", content: "plain notes" }], "pd-txt"),
    );
    expect(txt.status).toBe(200);
    const json = await call(
      uploadJson([{ path: "data.json", content: '{"ok":true}' }], "pd-json"),
    );
    expect(json.status).toBe(200);
    const both = await call(
      uploadJson(
        [
          { path: "README.md", content: "# docs" },
          { path: "index.html", content: "<h1>Has index</h1>" },
        ],
        "pd-both",
      ),
    );
    expect(both.status).toBe(200);
    await deployPaste("# pasted markdown\n\nnot html tags", "pd-paste-md");
  });

  it.each([
    {
      name: "readme-only root is file 404 not SITE_NOT_FOUND",
      slug: "pd-readme",
      path: "/",
      status: 404,
      error: null,
      body: "Not found",
    },
    {
      name: "readme-only /index.html is file 404",
      slug: "pd-readme",
      path: "/index.html",
      status: 404,
      error: null,
      body: "Not found",
    },
    {
      name: "readme-only SPA path is file 404",
      slug: "pd-readme",
      path: "/dashboard",
      status: 404,
      error: null,
      body: "Not found",
    },
    {
      name: "readme-only missing md is file 404",
      slug: "pd-readme",
      path: "/notes.md",
      status: 404,
      error: null,
      body: "Not found",
    },
    {
      name: "readme-only /README.md is 200",
      slug: "pd-readme",
      path: "/README.md",
      status: 200,
      error: null,
      body: "# Hi from md",
      type: "application/octet-stream",
    },
    {
      name: "txt-only root is file 404",
      slug: "pd-txt",
      path: "/",
      status: 404,
      error: null,
      body: "Not found",
    },
    {
      name: "txt-only /notes.txt is 200",
      slug: "pd-txt",
      path: "/notes.txt",
      status: 200,
      error: null,
      body: "plain notes",
      type: "text/plain; charset=utf-8",
    },
    {
      name: "json-only root is file 404",
      slug: "pd-json",
      path: "/",
      status: 404,
      error: null,
      body: "Not found",
    },
    {
      name: "json-only /data.json is 200",
      slug: "pd-json",
      path: "/data.json",
      status: 200,
      error: null,
      body: '{"ok":true}',
      type: "application/json",
    },
    {
      name: "readme+index root is 200",
      slug: "pd-both",
      path: "/",
      status: 200,
      error: null,
      body: "<h1>Has index</h1>",
    },
    {
      name: "paste markdown becomes index.html 200",
      slug: "pd-paste-md",
      path: "/",
      status: 200,
      error: null,
      body: "# pasted markdown",
    },
  ] as const)("$name", async (row) => {
    const res = await fetchSite(row.slug, row.path);
    expect(res.status).toBe(row.status);
    expect(res.status).not.toBe(500);
    expect(res.headers.get("x-aft-error")).toBe(row.error);
    if ("type" in row && row.type) {
      expect(res.headers.get("content-type")).toBe(row.type);
    }
    const text =
      (res.headers.get("content-type") || "").includes("octet-stream")
        ? new TextDecoder().decode(await res.arrayBuffer())
        : await res.text();
    expect(text).toContain(row.body);
  });

  it("path-serve readme-only root is file 404", async () => {
    const res = await call(new Request(`${API_ORIGIN}/s/pd-readme/`));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-aft-error")).toBeNull();
    expect(await res.text()).toBe("Not found");
  });

  it("path-serve readme file is 200", async () => {
    const res = await call(new Request(`${API_ORIGIN}/s/pd-readme/README.md`));
    expect(res.status).toBe(200);
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text).toContain("# Hi from md");
  });
});

describe("500 paths", () => {
  it.each([
    {
      name: "upstream 500 status",
      check: "status" as const,
    },
    {
      name: "upstream 500 body passthrough",
      check: "body" as const,
    },
    {
      name: "upstream 500 sets x-aft-upstream",
      check: "upstream" as const,
    },
    {
      name: "upstream 500 is not SITE_NOT_FOUND",
      check: "notFound" as const,
    },
  ])("$name", async ({ check }) => {
    await env.SITES.put(
      "site:pd-crash",
      JSON.stringify({
        deployId: "dep_pd_crash",
        runtime: "worker",
        upstreamUrl: "https://upstream.example/",
      }),
    );
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("boom from app", {
        status: 500,
        headers: { "content-type": "text/plain" },
      })) as typeof fetch;
    try {
      const res = await fetchSite("pd-crash");
      if (check === "status") expect(res.status).toBe(500);
      if (check === "body") expect(await res.text()).toBe("boom from app");
      if (check === "upstream") {
        expect(res.headers.get("x-aft-upstream")).toBe("https://upstream.example");
      }
      if (check === "notFound") {
        expect(res.headers.get("x-aft-error")).toBeNull();
        expect(await res.text()).not.toContain("Nothing is deployed here");
      }
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("corrupt site meta is platform JSON 500", async () => {
    await env.SITES.put("site:pd-broken", "not-json");
    const res = await fetchSite("pd-broken");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "internal" });
  });

  it("static /api/* is JSON 404 not 500", async () => {
    await deployPaste("<h1>static api</h1>", "pd-static-api");
    const res = await fetchSite("pd-static-api", "/api/hello");
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(500);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });
});

describe("paused private reserved hosts", () => {
  it("paused site is 503 branded HTML", async () => {
    await deployPaste("<h1>soon</h1>", "pd-paused");
    expect(await setSiteActive(env, "pd-paused", false)).toBe(true);
    const res = await hit("pd-paused", "/", { accept: "text/html" });
    expect(res.status).toBe(503);
    expect(res.headers.get("x-aft-active")).toBe("0");
    expect(res.headers.get("x-aft-slug")).toBe("pd-paused");
    const html = await res.text();
    expect(html).toContain("This site is paused");
    expect(html).toContain("pd-paused.aft.page");
  });

  it("private unsigned visit redirects to login", async () => {
    const { slug } = await deployPaste("<h1>secret</h1>", "pd-priv");
    const user = await findOrCreateUser(env, "pd-owner@example.com");
    expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
    await setSiteVisibility(env, slug, "private");
    const res = await fetchSite(slug);
    expect(res.status).toBe(302);
    expect(res.headers.get("location") || "").toContain(
      "https://aft.page/login?next=",
    );
  });

  it("private owner with cookie still gets 200", async () => {
    const { slug } = await deployPaste("<h1>mine</h1>", "pd-priv-ok");
    const user = await findOrCreateUser(env, "pd-owner-ok@example.com");
    expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
    await setSiteVisibility(env, slug, "private");
    const session = await createSession(env, user.id);
    const res = await call(
      new Request(`https://${slug}.aft.page/`, {
        headers: { cookie: `aft_session=${session.token}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>mine</h1>");
  });

  it.each([
    "admin",
    "app",
    "mail",
    "ftp",
    "drop",
    "docs",
    "login",
    "dashboard",
    "cdn",
    "static",
    "ai",
    "cron",
    "cname",
    "claim",
  ] as const)("reserved slug %s is 404 reserved", async (slug) => {
    const res = await fetchSite(slug);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "reserved" });
    expect(res.headers.get("x-aft-error")).not.toBe("SITE_NOT_FOUND");
  });

  it.each([
    { name: "apex", url: "https://aft.page/", error: "unknown_host" },
    { name: "www", url: "https://www.aft.page/", error: "unknown_host" },
    { name: "foreign host", url: "https://evil.example.com/", error: "unknown_host" },
  ] as const)("$name is unknown_host", async ({ url, error }) => {
    const res = await call(new Request(url));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error });
  });
});

describe("happy deploy coverage", () => {
  beforeAll(async () => {
    const res = await call(
      uploadJson(
        [
          { path: "index.html", content: "<!doctype html><html><body><h1>Home</h1></body></html>" },
          { path: "app.css", content: "h1{color:red}" },
          { path: "app.js", content: "console.log(1)" },
          { path: "data.json", content: "{}" },
          { path: "icon.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" },
          { path: "about/index.html", content: "<h1>About</h1>" },
        ],
        "pd-happy",
      ),
    );
    expect(res.status).toBe(200);
  });

  it.each([
    {
      name: "root html 200",
      path: "/",
      status: 200,
      type: /text\/html/,
      includes: "<h1>Home</h1>",
    },
    {
      name: "css mime",
      path: "/app.css",
      status: 200,
      type: "text/css; charset=utf-8",
    },
    {
      name: "js mime",
      path: "/app.js",
      status: 200,
      type: "text/javascript; charset=utf-8",
    },
    {
      name: "json mime",
      path: "/data.json",
      status: 200,
      type: "application/json",
    },
    {
      name: "svg mime",
      path: "/icon.svg",
      status: 200,
      type: "image/svg+xml",
    },
    {
      name: "nested directory index",
      path: "/about/",
      status: 200,
      includes: "<h1>About</h1>",
    },
    {
      name: "SPA fallback when index exists",
      path: "/dashboard/settings",
      status: 200,
      includes: "<h1>Home</h1>",
    },
  ] as const)("$name", async (row) => {
    const res = await fetchSite("pd-happy", row.path);
    expect(res.status).toBe(row.status);
    expect(res.headers.get("x-aft-slug")).toBe("pd-happy");
    expect(res.headers.get("x-aft-deploy")).toBeTruthy();
    if ("type" in row && row.type) {
      expect(res.headers.get("content-type") || "").toMatch(row.type);
    }
    if ("includes" in row && row.includes) {
      expect(await res.text()).toContain(row.includes);
    }
  });

  it("injects claim chrome on full HTML", async () => {
    const html = await (await fetchSite("pd-happy")).text();
    expect(html).toContain('id="aft-chrome"');
    expect(html).toContain("Claim this site");
  });

  it("deploy OPTIONS is 204", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy`, { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("site OPTIONS is 204", async () => {
    const res = await call(
      new Request("https://pd-happy.aft.page/", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
  });

  it("health on api host is 200", async () => {
    const res = await call(new Request(`${API_ORIGIN}/health`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
