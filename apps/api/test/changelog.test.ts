import { describe, expect, it } from "vitest";
import {
  changelogMarkdown,
  changelogMonths,
  changelogRss,
  mdInline,
  type ChangelogRow,
} from "../src/changelog";
import { API_ORIGIN, call } from "./helpers";

const row = (over: Partial<ChangelogRow>): ChangelogRow => ({
  id: "a",
  day: "2026-08-08",
  category: "agents",
  kind: "feat",
  title: "One",
  body: "first",
  sort: 0,
  ...over,
});

describe("changelog", () => {
  it("lists seeded entries newest-first over JSON", async () => {
    const res = await call(new Request(`${API_ORIGIN}/v1/changelog`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: {
        id: string;
        day: string;
        category: string;
        kind: string;
        html: string;
      }[];
      months: { month: string; count: number; feat: number; fix: number; imp: number }[];
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
    // kind chips: every entry has a valid kind, and the two refinements are marked.
    for (const e of body.entries) {
      expect(["feat", "fix", "imp"]).toContain(e.kind);
    }
    expect(body.entries.find((e) => e.id === "brand-identity")?.kind).toBe(
      "imp",
    );
    expect(body.entries.find((e) => e.id === "og-previews")?.kind).toBe("fix");
    expect(body.entries.find((e) => e.id === "run-github")?.kind).toBe("feat");
    // month summary is present and newest-first.
    expect(body.months.length).toBeGreaterThan(0);
    expect(body.months[0].month).toBe("2026-08");
    const total = body.months.reduce((n, m) => n + m.count, 0);
    expect(total).toBe(body.entries.length);
    expect(
      body.months.every(
        (m) => m.feat + m.fix + m.imp === m.count,
      ),
    ).toBe(true);
  });

  it("serves markdown with the MCP URL", async () => {
    const res = await call(new Request(`${API_ORIGIN}/v1/changelog.md`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/markdown/);
    const text = await res.text();
    expect(text).toContain("https://mcp.aft.page/mcp");
    expect(text).not.toContain("lattice-js");
  });

  it("serves RSS with one item per entry", async () => {
    const res = await call(new Request(`${API_ORIGIN}/v1/changelog.rss`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/rss|xml/);
    const text = await res.text();
    expect(text.startsWith("<?xml")).toBe(true);
    expect(text).toContain("<rss version=\"2.0\"");
    expect(text).toContain("<channel>");
    expect(text).toContain("<item>");
    expect(text).toContain("<title>FEAT: Run — paste a GitHub repo");
    expect(text).toContain("https://aft.page/changelog#run-github");
    expect(text).not.toContain("&lt;script&gt;");
  });

  it("escapes HTML in markdown bodies", () => {
    expect(mdInline("see <script>x</script> and `code`")).toBe(
      "see &lt;script&gt;x&lt;/script&gt; and <code>code</code>",
    );
  });

  it("groups markdown by day with kind labels", () => {
    const md = changelogMarkdown([
      row({ id: "a", kind: "feat", title: "One", body: "first" }),
      row({ id: "b", category: "product", kind: "fix", title: "Two", body: "second" }),
    ]);
    expect(md.match(/^## /gm)?.length).toBe(1);
    expect(md).toContain("### FEAT — One");
    expect(md).toContain("### FIX — Two");
  });

  it("aggregates months newest-first with kind counts", () => {
    const months = changelogMonths([
      row({ id: "a", day: "2026-07-26", kind: "feat" }),
      row({ id: "b", day: "2026-08-03", kind: "imp" }),
      row({ id: "c", day: "2026-08-08", kind: "feat" }),
    ]);
    expect(months).toEqual([
      { month: "2026-08", label: "August 2026", count: 2, feat: 1, fix: 0, imp: 1 },
      { month: "2026-07", label: "July 2026", count: 1, feat: 1, fix: 0, imp: 0 },
    ]);
  });

  it("builds valid RSS with escaped plain-text descriptions", () => {
    const rss = changelogRss([
      row({
        id: "a",
        kind: "feat",
        title: "One & Only",
        body: "See [`/mcp`](https://aft.page/mcp) — `code` & <raw>.",
      }),
    ]);
    expect(rss).toContain("<title>FEAT: One &amp; Only</title>");
    expect(rss).toContain("<guid isPermaLink=\"false\">2026-08-08-a</guid>");
    expect(rss).toContain("<description>See /mcp — code &amp; &lt;raw&gt;.</description>");
    expect(rss).not.toContain("&lt;script&gt;");
  });

});
