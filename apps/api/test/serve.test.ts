/** Serving a published site: routing, fallbacks, and content types. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { utcDayKey, viewDayKey } from "../src/metrics";
import { call, deployPaste, uploadJson, fetchSite, API_ORIGIN } from "./helpers";

describe("host routing", () => {
  it("answers health on the api host", async () => {
    const res = await call(new Request(`${API_ORIGIN}/health`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("does not treat the apex as a site", async () => {
    const res = await call(new Request("https://aft.page/"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "unknown_host" });
  });

  it("does not treat www as a site", async () => {
    const res = await call(new Request("https://www.aft.page/"));
    expect(res.status).toBe(404);
  });

  it("ignores hosts outside the root domain", async () => {
    const res = await call(new Request("https://evil.example.com/"));
    expect(res.status).toBe(404);
  });

  it("serves the same site over the /s/{slug} path", async () => {
    await deployPaste("<h1>Path served</h1>", "path-serve");
    const res = await call(new Request(`${API_ORIGIN}/s/path-serve/`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>Path served</h1>");
  });

  it("answers CORS preflight so the landing page can post", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy`, { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("serving files", () => {
  it("404s an unknown slug with a branded page for browsers", async () => {
    const res = await call(
      new Request("https://nobody-here.aft.page/", {
        headers: { accept: "text/html" },
      }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("x-aft-error")).toBe("SITE_NOT_FOUND");
    expect(res.headers.get("x-aft-slug")).toBe("nobody-here");
    expect(res.headers.get("content-type") || "").toMatch(/text\/html/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Nothing is deployed here");
    expect(html).toContain("nobody-here.aft.page");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).not.toContain("Claim this site");
  });

  it("shows build in progress when a Run job owns the slug but KV is empty", async () => {
    const { insertRunJob, patchRunJobProgress } = await import("../src/db");
    await insertRunJob(env, {
      owner: "mdn",
      repo: "todo-react",
      url: "https://github.com/mdn/todo-react",
      trigger: "test",
      kind: "vite",
      branch: "main",
      slug: "pending-vite",
    });
    await patchRunJobProgress(env, (
      await env.DB.prepare(
        `SELECT id FROM run_jobs WHERE slug = ? ORDER BY created_at DESC LIMIT 1`,
      )
        .bind("pending-vite")
        .first<{ id: string }>()
    )!.id, {
      phase: "building",
      line: "npm run build",
    });
    const res = await call(
      new Request("https://pending-vite.aft.page/", {
        headers: { accept: "text/html" },
      }),
    );
    expect(res.status).toBe(202);
    expect(res.headers.get("x-aft-error")).toBe("SITE_PENDING");
    expect(res.headers.get("x-aft-phase")).toBe("building");
    const html = await res.text();
    expect(html).toContain("Build in progress");
    expect(html).toContain("Building");
    expect(html).toContain("npm run build");
    expect(html).toContain("class=\"spinner\"");
    expect(html).toContain("Live log");
    expect(html).not.toContain("Nothing is deployed here");
  });

  it("shows going live when the job is live but KV has not caught up", async () => {
    const { insertRunJob, finishRunJob } = await import("../src/db");
    const id = await insertRunJob(env, {
      owner: "mdn",
      repo: "todo-react",
      url: "https://github.com/mdn/todo-react",
      trigger: "test",
      kind: "vite",
      branch: "main",
      slug: "kv-lag-vite",
    });
    await finishRunJob(env, id, {
      status: "live",
      slug: "kv-lag-vite",
      siteUrl: "https://kv-lag-vite.aft.page",
      phase: "live",
      httpStatus: 200,
    });
    const res = await call(
      new Request("https://kv-lag-vite.aft.page/", {
        headers: { accept: "text/html" },
      }),
    );
    expect(res.status).toBe(202);
    expect(res.headers.get("x-aft-error")).toBe("SITE_PENDING");
    expect(res.headers.get("x-aft-phase")).toBe("live");
    expect(await res.text()).toContain("Going live");
  });

  it("404s an unknown slug as JSON when Accept prefers it", async () => {
    const res = await fetchSite("nobody-here");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-aft-error")).toBe("SITE_NOT_FOUND");
    expect(await res.json()).toMatchObject({
      error: "not_found",
      code: "SITE_NOT_FOUND",
      slug: "nobody-here",
    });
  });

  it("serves index.html at the root and tags the deploy", async () => {
    const out = await deployPaste("<h1>Root</h1>", "root-index");
    const res = await fetchSite("root-index");
    expect(res.headers.get("x-aft-slug")).toBe("root-index");
    expect(res.headers.get("x-aft-deploy")).toBe(out.deployId);
  });

  it("serves a prior deploy on its immutable preview host", async () => {
    const first = await deployPaste("<h1>v1</h1>", "pin-prev");
    const patch = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=pin-prev`, {
        method: "PATCH",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-aft-edit-token": first.editToken,
        },
        body: "<h1>v2</h1>",
      }),
    );
    expect(patch.status).toBe(200);
    const short = first.deployId.replace(/^dep_/, "");
    const prev = await call(
      new Request(`https://${short}--pin-prev.aft.page/`),
    );
    expect(prev.status).toBe(200);
    expect(await prev.text()).toContain("<h1>v1</h1>");
    expect(prev.headers.get("x-aft-deploy")).toBe(first.deployId);
    expect(prev.headers.get("x-aft-preview")).toBe("1");
    expect(await (await fetchSite("pin-prev")).text()).toContain("<h1>v2</h1>");
  });

  it("404s an unknown preview deploy host", async () => {
    await deployPaste("<h1>live</h1>", "pin-miss");
    const res = await call(
      new Request("https://aaaaaaaaaaaa--pin-miss.aft.page/"),
    );
    expect(res.status).toBe(404);
  });

  it("injects claim chrome on full HTML documents", async () => {
    await deployPaste(
      "<!doctype html><html><body><h1>Chrome</h1></body></html>",
      "live-chrome",
    );
    const html = await (await fetchSite("live-chrome")).text();
    expect(html).toContain("<h1>Chrome</h1>");
    expect(html).toContain('id="aft-chrome"');
    expect(html).toContain("Claim this site");
  });

  it("allows the preview page to fetch source across subdomains", async () => {
    await deployPaste("<h1>View source</h1>", "source-view");
    const res = await fetchSite("source-view");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("serves nested index.html for a directory path", async () => {
    await call(
      uploadJson(
        [
          { path: "index.html", content: "<h1>Home</h1>" },
          { path: "about/index.html", content: "<h1>About</h1>" },
        ],
        "nested",
      ),
    );
    const res = await fetchSite("nested", "/about/");
    expect(await res.text()).toBe("<h1>About</h1>");
  });

  it("falls back to index.html for client-side routes", async () => {
    await deployPaste("<h1>SPA</h1>", "spa-app");
    const res = await fetchSite("spa-app", "/dashboard/settings");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>SPA</h1>");
  });

  it("404s scanner junk instead of SPA-falling-back to index.html", async () => {
    await deployPaste("<h1>SPA</h1>", "spa-junk");
    const git = await fetchSite("spa-junk", "/.git/config");
    expect(git.status).toBe(404);
    expect(git.headers.get("content-type") || "").toMatch(/text\/plain/);
    expect(await git.text()).toBe("Not found");

    const wp = await fetchSite("spa-junk", "/wp-login.php");
    expect(wp.status).toBe(404);

    const spa = await fetchSite("spa-junk", "/missing-spa-route");
    expect(spa.status).toBe(200);
    expect(await spa.text()).toBe("<h1>SPA</h1>");
  });

  it("guesses content types from the extension", async () => {
    await call(
      uploadJson(
        [
          { path: "index.html", content: "<h1>Types</h1>" },
          { path: "app.js", content: "console.log(1)" },
          { path: "data.json", content: "{}" },
        ],
        "mime-check",
      ),
    );

    const js = await fetchSite("mime-check", "/app.js");
    expect(js.headers.get("content-type")).toBe("text/javascript; charset=utf-8");

    const jsonFile = await fetchSite("mime-check", "/data.json");
    expect(jsonFile.headers.get("content-type")).toBe("application/json");
  });

  it("still serves sites whose files predate R2", async () => {
    // Simulate a pre-R2 deploy: blob written straight into KV.
    const slug = "legacy-kv";
    const deployId = "dep_legacy00001";
    await env.SITES.put(
      `file:${slug}:${deployId}:index.html`,
      new TextEncoder().encode("<h1>Legacy</h1>"),
      { metadata: { contentType: "text/html; charset=utf-8" } },
    );
    await env.SITES.put(
      `site:${slug}`,
      JSON.stringify({ deployId, createdAt: new Date().toISOString(), fileCount: 1 }),
    );

    const res = await fetchSite(slug);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>Legacy</h1>");
  });

  it("does not serve reserved names as tenant sites", async () => {
    for (const slug of ["admin", "ai", "cron"]) {
      const res = await fetchSite(slug);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: "reserved" });
    }
  });

  it("injects a default og:image when the page has a head but no social meta", async () => {
    await call(
      uploadJson(
        [
          {
            path: "index.html",
            content:
              "<!doctype html><html><head><title>BK Offers</title></head><body><div id='root'></div></body></html>",
          },
        ],
        "og-default",
      ),
    );
    const res = await fetchSite("og-default");
    const html = await res.text();
    expect(html).toContain('property="og:image" content="https://og-default.aft.page/__aft/og.png"');
    expect(html).toContain('property="og:title" content="BK Offers"');
    expect(html).toContain('name="twitter:image" content="https://og-default.aft.page/__aft/og.png"');
    expect(html).toContain('name="description" content="BK Offers — live on aft.page"');
    expect(html).toContain('property="og:description" content="BK Offers — live on aft.page"');
    expect(html).toContain('name="twitter:description" content="BK Offers — live on aft.page"');
  });

  it("serves a generated OG PNG for the site card", async () => {
    await call(
      uploadJson(
        [
          {
            path: "index.html",
            content:
              "<!doctype html><html><head><title>BK Offers</title></head><body></body></html>",
          },
        ],
        "og-card",
      ),
    );
    const res = await fetchSite("og-card", "/__aft/og.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toMatch(/image\/png/);
    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("leaves an existing og:image alone but still fills descriptions", async () => {
    await call(
      uploadJson(
        [
          {
            path: "index.html",
            content:
              '<!doctype html><html><head><title>Custom</title><meta property="og:image" content="https://cdn.example/hero.png" /></head><body></body></html>',
          },
        ],
        "og-custom",
      ),
    );
    const html = await (await fetchSite("og-custom")).text();
    expect(html).toContain('content="https://cdn.example/hero.png"');
    expect(html).not.toContain("__aft/og.png");
    expect(html).not.toContain("https://aft.page/og.png");
    expect(html).toContain('name="description" content="Custom — live on aft.page"');
  });

  it("returns JSON 500 when site metadata is corrupt", async () => {
    await env.SITES.put("site:broken-meta", "not-json");
    const res = await fetchSite("broken-meta");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "internal" });
  });

  it("passes through an upstream 500 for worker runtime sites", async () => {
    await env.SITES.put(
      "site:crash-app",
      JSON.stringify({
        deployId: "dep_crash",
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
      const res = await call(
        new Request("https://crash-app.aft.page/api/analyze", { method: "POST" }),
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("x-aft-upstream")).toBe("https://upstream.example");
      const body = await res.text();
      expect(body).toBe("boom from app");
      expect(body).not.toContain("Nothing is deployed here");

      const logs = await env.DB.prepare(
        `SELECT status, path, method FROM site_logs WHERE slug = ? ORDER BY created_at DESC LIMIT 1`,
      )
        .bind("crash-app")
        .first<{ status: number; path: string; method: string }>();
      expect(logs?.status).toBe(500);
      expect(logs?.path).toBe("/api/analyze");
      expect(logs?.method).toBe("POST");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("counts HTML 200 views and ignores CSS and 404s", async () => {
    await call(
      uploadJson(
        [
          { path: "index.html", content: "<h1>views</h1>" },
          { path: "app.css", content: "body{color:red}" },
        ],
        "view-count",
      ),
    );
    expect((await fetchSite("view-count")).status).toBe(200);
    expect((await fetchSite("view-count", "/app.css")).status).toBe(200);
    expect((await fetchSite("no-such-view-slug")).status).toBe(404);
    expect((await fetchSite("view-count")).status).toBe(200);

    const raw = await env.SITES.get(viewDayKey(utcDayKey()));
    expect(raw).toBeTruthy();
    const map = JSON.parse(raw!) as Record<string, number>;
    expect(map["view-count"]).toBe(2);
  });
});

describe("sign in with aft", () => {
  async function sessionFor(email: string) {
    const { createSession, findOrCreateUser } = await import("../src/auth");
    const user = await findOrCreateUser(env, email);
    const session = await createSession(env, user.id);
    return { user, cookie: `aft_session=${session.token}` };
  }

  it("exposes no viewer on a public site until signed in", async () => {
    await deployPaste("<h1>hello</h1>", "id-anon");
    const me = await fetchSite("id-anon", "/_aft/me");
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toMatch(/no-store/);
    expect(await me.json()).toEqual({ user: null });
    const page = await fetchSite("id-anon");
    expect(page.headers.get("aft-authenticated-user-email")).toBeNull();
    expect(page.headers.get("cache-control")).toMatch(/public/);
  });

  it("injects the session viewer and ignores spoofed identity headers", async () => {
    await deployPaste("<h1>hello</h1>", "id-user");
    const { user, cookie } = await sessionFor("viewer@example.com");
    const res = await call(
      new Request("https://id-user.aft.page/", {
        headers: {
          cookie,
          "aft-authenticated-user-email": "attacker@evil.test",
          "aft-authenticated-user-id": "usr_attacker",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("aft-authenticated-user-email")).toBe(
      "viewer@example.com",
    );
    expect(res.headers.get("aft-authenticated-user-id")).toBe(user.id);
    expect(res.headers.get("cache-control")).toMatch(/private/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const me = await call(
      new Request("https://id-user.aft.page/_aft/me", {
        headers: {
          cookie,
          "aft-authenticated-user-email": "attacker@evil.test",
        },
      }),
    );
    expect(await me.json()).toEqual({
      user: { id: user.id, email: "viewer@example.com" },
    });
  });

  it("sends anonymous viewers through /signin-with-aft", async () => {
    await deployPaste("<h1>hello</h1>", "id-login");
    const res = await fetchSite("id-login", "/signin-with-aft?return_to=/app");
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location.startsWith("https://aft.page/login?next=")).toBe(true);
    expect(location).toContain(encodeURIComponent("https://id-login.aft.page/app"));
  });

  it("rejects off-site, protocol-relative, and identity-loop return_to", async () => {
    await deployPaste("<h1>hello</h1>", "id-open");
    const home = encodeURIComponent("https://id-open.aft.page/");
    for (const raw of [
      "https://evil.example/",
      "//evil.example/",
      "/signin-with-aft",
      "/signout-with-aft",
      "/_aft/me",
      "javascript:alert(1)",
    ]) {
      const res = await fetchSite(
        "id-open",
        `/signin-with-aft?return_to=${encodeURIComponent(raw)}`,
      );
      const location = res.headers.get("location") || "";
      expect(location).toContain(home);
      expect(location).not.toContain("evil.example");
      expect(location).not.toContain("javascript");
    }
  });

  it("clears the session cookie with HttpOnly Secure SameSite on sign-out", async () => {
    await deployPaste("<h1>hello</h1>", "id-out");
    const { cookie } = await sessionFor("out@example.com");
    const res = await call(
      new Request("https://id-out.aft.page/signout-with-aft?return_to=/done", {
        headers: { cookie },
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://id-out.aft.page/done");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toMatch(/aft_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).toMatch(/Domain=\.aft\.page/i);
  });

  it("keeps /_aft/me public-anonymous and private-gated", async () => {
    const { assignSiteOwner } = await import("../src/auth");
    const { setSiteVisibility, upsertSiteMember } = await import("../src/db");
    await deployPaste("<h1>private</h1>", "id-priv");
    const owner = await sessionFor("owner-id@example.com");
    expect(await assignSiteOwner(env, "id-priv", owner.user.id)).toBe(true);
    await setSiteVisibility(env, "id-priv", "private");

    const anon = await fetchSite("id-priv", "/_aft/me");
    expect(anon.status).toBe(302);
    expect(anon.headers.get("location") || "").toContain("/login?next=");

    const ownerMe = await call(
      new Request("https://id-priv.aft.page/_aft/me", {
        headers: { cookie: owner.cookie },
      }),
    );
    expect(ownerMe.status).toBe(200);
    expect(await ownerMe.json()).toEqual({
      user: { id: owner.user.id, email: "owner-id@example.com" },
    });

    const member = await sessionFor("member-id@example.com");
    await upsertSiteMember(
      env,
      "id-priv",
      member.user.id,
      "member-id@example.com",
      "view",
    );
    const memberMe = await call(
      new Request("https://id-priv.aft.page/_aft/me", {
        headers: { cookie: member.cookie },
      }),
    );
    expect(memberMe.status).toBe(200);
    expect(await memberMe.json()).toEqual({
      user: { id: member.user.id, email: "member-id@example.com" },
    });

    const stranger = await sessionFor("stranger-id@example.com");
    const denied = await call(
      new Request("https://id-priv.aft.page/_aft/me", {
        headers: { cookie: stranger.cookie },
      }),
    );
    expect(denied.status).toBe(401);
  });
});
