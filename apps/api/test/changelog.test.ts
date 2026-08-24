import { describe, expect, it } from "vitest";
import { changelogMarkdown, mdInline } from "../src/changelog";
import { API_ORIGIN, call } from "./helpers";

describe("changelog", () => {
  it("lists seeded entries newest-first over JSON", async () => {
    const res = await call(new Request(`${API_ORIGIN}/v1/changelog`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: { id: string; day: string; category: string; html: string }[];
    };
    const ids = body.entries.map((e) => e.id);
    // Newest-first: day DESC, then sort ASC within a day. run-github
    // (2026-08-24, sort 0) ranks above deploy-repo (same day, sort 1).
    expect(ids[0]).toBe("run-github");
    expect(ids).toContain("deploy-repo");
    expect(ids).toContain("signin-with-aft");
    expect(ids).toContain("deploy-caps");
    expect(ids).toContain("hosted-cli");
    expect(ids).toContain("ai-discovery-files");
    expect(ids).toContain("remote-mcp");
    expect(ids).toContain("seo-landings");
    expect(ids).toContain("brand-identity");
    expect(ids).not.toContain("lattice-js");
    expect(body.entries.find((e) => e.id === "claim-share")?.day).toBe(
      "2026-07-27",
    );
    expect(body.entries.some((e) => e.category === "platform")).toBe(true);
    expect(body.entries.find((e) => e.id === "remote-mcp")?.html).toContain(
      "mcp.aft.page",
    );
  });

  it("serves markdown with the MCP URL", async () => {
    const res = await call(new Request(`${API_ORIGIN}/v1/changelog.md`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/markdown/);
    const text = await res.text();
    expect(text).toContain("https://mcp.aft.page/mcp");
    expect(text).not.toContain("lattice-js");
  });

  it("escapes HTML in markdown bodies", () => {
    expect(mdInline("see <script>x</script> and `code`")).toBe(
      "see &lt;script&gt;x&lt;/script&gt; and <code>code</code>",
    );
  });

  it("groups markdown by day", () => {
    const md = changelogMarkdown([
      {
        id: "a",
        day: "2026-08-08",
        category: "agents",
        title: "One",
        body: "first",
        sort: 0,
      },
      {
        id: "b",
        day: "2026-08-08",
        category: "product",
        title: "Two",
        body: "second",
        sort: 1,
      },
    ]);
    expect(md.match(/^## /gm)?.length).toBe(1);
    expect(md).toContain("### One");
    expect(md).toContain("### Two");
  });

});
