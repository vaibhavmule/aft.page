/** Upload shapes a human or an agent can send, plus the abuse limits. */
import { describe, it, expect } from "vitest";
import { call, deployPaste, pasteHtml, uploadJson, fetchSite, API_ORIGIN } from "./helpers";

describe("deploy input", () => {
  it("accepts a raw HTML paste", async () => {
    const out = await deployPaste("<h1>Hello</h1>", "paste-raw");
    const res = await fetchSite(out.slug);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>Hello</h1>");
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
    const files = Array.from({ length: 51 }, (_, i) => ({
      path: `page-${i}.html`,
      content: "x",
    }));
    const res = await call(uploadJson(files));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "too_many_files" });
  });

  it("rejects a single oversized file", async () => {
    const res = await call(
      uploadJson([{ path: "big.html", content: "x".repeat(2 * 1024 * 1024 + 1) }]),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "file_too_large" });
  });

  it("rejects an oversized payload spread across files", async () => {
    const files = Array.from({ length: 4 }, (_, i) => ({
      path: `chunk-${i}.html`,
      content: "x".repeat(1_500_000),
    }));
    const res = await call(uploadJson(files));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
  });
});
