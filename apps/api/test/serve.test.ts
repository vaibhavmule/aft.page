/** Serving a published site: routing, fallbacks, and content types. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
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
  it("404s an unknown slug", async () => {
    const res = await fetchSite("nobody-here");
    expect(res.status).toBe(404);
  });

  it("serves index.html at the root and tags the deploy", async () => {
    const out = await deployPaste("<h1>Root</h1>", "root-index");
    const res = await fetchSite("root-index");
    expect(res.headers.get("x-aft-slug")).toBe("root-index");
    expect(res.headers.get("x-aft-deploy")).toBe(out.deployId);
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
    const res = await fetchSite("admin");
    expect(res.status).toBe(404);
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
});
