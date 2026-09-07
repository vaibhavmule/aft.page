/** AI-discovery surface on the API host — llms.txt, openapi.json, mcp.json. */
import { describe, it, expect } from "vitest";
import { call, API_ORIGIN } from "./helpers";

describe("AI-discovery endpoints on api.aft.page", () => {
  it("GET /llms.txt serves agent index as text/plain", async () => {
    const res = await call(new Request(`${API_ORIGIN}/llms.txt`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toContain("# aft.page API");
    expect(body).toContain("https://api.aft.page");
    expect(body).toContain("POST /v1/deploy");
  });

  it("GET /openapi.json serves a valid OpenAPI 3.1 doc", async () => {
    const res = await call(new Request(`${API_ORIGIN}/openapi.json`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const doc = (await res.json()) as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("aft.page API");
    expect(doc.paths["/v1/deploy"]).toBeTruthy();
    expect(doc.paths["/llms.txt"]).toBeTruthy();
  });

  it("GET /.well-known/mcp.json points at the remote MCP", async () => {
    const res = await call(new Request(`${API_ORIGIN}/.well-known/mcp.json`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://mcp.aft.page/mcp");
  });

  it("root JSON advertises openapi/llms/mcp affordances", async () => {
    const res = await call(new Request(`${API_ORIGIN}/`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.openapi).toBe("https://api.aft.page/openapi.json");
    expect(body.llms).toBe("https://api.aft.page/llms.txt");
    expect(body.mcp).toBe("https://mcp.aft.page/mcp");
  });
});
