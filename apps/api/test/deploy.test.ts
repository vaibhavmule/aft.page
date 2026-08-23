/** Upload shapes a human or an agent can send, plus the abuse limits. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { call, deployPaste, pasteHtml, uploadJson, fetchSite, API_ORIGIN } from "./helpers";

function manyTinyFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    path: `page-${i}.html`,
    content: "x",
  }));
}

describe("deploy input", () => {
  it("accepts a raw HTML paste", async () => {
    const out = await deployPaste("<h1>Hello</h1>", "paste-raw");
    const res = await fetchSite(out.slug);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>Hello</h1>");
  });

  it("uses aft.json slug when ?slug= is omitted", async () => {
    const res = await call(
      uploadJson([
        { path: "index.html", content: "<h1>from manifest</h1>" },
        {
          path: "aft.json",
          content: JSON.stringify({ slug: "from-manifest", runtime: "static" }),
        },
      ]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("from-manifest");
    expect(await (await fetchSite("from-manifest")).text()).toBe(
      "<h1>from manifest</h1>",
    );
  });

  it("uses aft.json name when slug is omitted", async () => {
    const res = await call(
      uploadJson([
        { path: "index.html", content: "<h1>named</h1>" },
        {
          path: "aft.json",
          content: JSON.stringify({ name: "my-vite-app", runtime: "static" }),
        },
      ]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("my-vite-app");
  });

  it("accepts a JSON file list from an agent", async () => {
    const res = await call(
      uploadJson(
        [
          { path: "index.html", content: "<h1>App</h1>" },
          { path: "styles.css", content: "h1{color:red}" },
        ],
        "json-upload",
      ),
    );
    expect(res.status).toBe(200);

    const css = await fetchSite("json-upload", "/styles.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
  });

  it("accepts multipart form uploads", async () => {
    const form = new FormData();
    form.append("files", new File(["<h1>Multi</h1>"], "index.html"));
    form.append("files", new File(["body{}"], "styles.css"));

    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=multipart`, {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json() as { files: number }).files).toBe(2);
  });

  it("types uploads by extension when the part is generic", async () => {
    const form = new FormData();
    form.append(
      "file0",
      new File(["<h1>Styled</h1>"], "index.html", { type: "application/octet-stream" }),
    );
    form.append("file0_path", "index.html");
    form.append(
      "file1",
      new File(["body{color:red}"], "style.css", { type: "application/octet-stream" }),
    );
    form.append("file1_path", "style.css");

    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=mime-by-ext`, {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const { slug } = (await res.json()) as { slug: string };

    const css = await fetchSite(slug, "/style.css");
    expect(css.headers.get("content-type")).toContain("text/css");
    const html = await fetchSite(slug, "/");
    expect(html.headers.get("content-type")).toContain("text/html");
  });

  it("decodes base64 content", async () => {
    const content = btoa("<h1>Base64</h1>");
    await call(
      uploadJson(
        [{ path: "index.html", content, encoding: "base64" }],
        "b64",
      ),
    );
    expect(await (await fetchSite("b64")).text()).toBe("<h1>Base64</h1>");
  });

  it("rejects an empty paste", async () => {
    const res = await call(pasteHtml("   "));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "no_files" });
  });
});

describe("deploy limits", () => {
  it("rejects path traversal", async () => {
    const res = await call(
      uploadJson([{ path: "../../etc/passwd", content: "x" }]),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_path" });
  });

  it("rejects too many files", async () => {
    const res = await call(uploadJson(manyTinyFiles(501)));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "too_many_files" });
  });

  it("rejects a single oversized file", async () => {
    const res = await call(
      uploadJson([{ path: "big.bin", content: "x".repeat(25 * 1024 * 1024 + 1) }]),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("x-aft-request-id")).toBeTruthy();
    expect(await res.json()).toMatchObject({ error: "file_too_large", path: "big.bin" });
    const row = await env.DB.prepare(
      `SELECT error, path FROM deploy_failures WHERE path = 'big.bin' ORDER BY created_at DESC LIMIT 1`,
    ).first<{ error: string; path: string }>();
    expect(row).toMatchObject({ error: "file_too_large", path: "big.bin" });
  });

  it("rejects an oversized payload spread across files", async () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      path: `chunk-${i}.html`,
      content: "x".repeat(21 * 1024 * 1024),
    }));
    const res = await call(uploadJson(files));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
  });
});

describe("unlimited dogfood caps", () => {
  it("allows 51 files on slug parakh", async () => {
    const res = await call(uploadJson(manyTinyFiles(51), "parakh"));
    expect(res.status).toBe(200);
    expect((await res.json()) as { slug: string }).toMatchObject({ slug: "parakh" });
  });

  it("allows 51 files for founder session on any slug", async () => {
    const user = await findOrCreateUser(env, "vaibhavmule135@gmail.com");
    const session = await createSession(env, user.id);
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=founder-unlim`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `aft_session=${session.token}`,
        },
        body: JSON.stringify({ files: manyTinyFiles(51) }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("allows oversized PATCH when owner is founder (edit token only)", async () => {
    const first = await deployPaste("<h1>owned</h1>", "owner-unlim");
    const user = await findOrCreateUser(env, "vaibhavmule135@gmail.com");
    expect(await assignSiteOwner(env, first.slug, user.id)).toBe(true);
    const session = await createSession(env, user.id);

    const files = Array.from({ length: 4 }, (_, i) => ({
      path: `chunk-${i}.html`,
      content: "x".repeat(1_500_000),
    }));
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=${first.slug}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `aft_session=${session.token}`,
          origin: "https://aft.page",
        },
        body: JSON.stringify({ files }),
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("web Drop is static-only; MCP/CLI use the engine", () => {
  const viteSource = [
    {
      path: "package.json",
      content: JSON.stringify({
        name: "vite-src",
        devDependencies: { vite: "5.0.0" },
      }),
    },
    { path: "index.html", content: "<div id=app></div>" },
  ];
  const expressSource = [
    {
      path: "package.json",
      content: JSON.stringify({ name: "api", dependencies: { express: "4.0.0" } }),
    },
    { path: "index.html", content: "<p>not a site</p>" },
  ];

  it("refuses Vite source from web Drop", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aft-client": "web",
        },
        body: JSON.stringify({ files: viteSource }),
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("needs_build");
  });

  it("refuses Express source from MCP (engine, not a fake URL)", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aft-client": "mcp",
        },
        body: JSON.stringify({ files: expressSource }),
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe("needs_container");
    expect(body.reason).toMatch(/Express/);
  });
});
