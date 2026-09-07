/**
 * Public changelog from D1. Add rows with wrangler d1 execute — no write API yet.
 */
import type { Env } from "./env";
import { json } from "./http";

export type ChangelogKind = "feat" | "fix" | "imp";

export type ChangelogRow = {
  id: string;
  day: string;
  category: string;
  title: string;
  body: string;
  sort: number;
  kind: ChangelogKind;
};

const KINDS: readonly ChangelogKind[] = ["feat", "fix", "imp"];

export function isKind(v: unknown): v is ChangelogKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

const KIND_LABEL: Record<ChangelogKind, string> = {
  feat: "FEAT",
  fix: "FIX",
  imp: "IMP",
};

export function mdInline(src: string): string {
  const esc = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^\s)]+)\)/g,
      '<a href="$2">$1</a>',
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function formatDayLong(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y!, m! - 1, d)));
}

export async function listChangelog(env: Env): Promise<ChangelogRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, day, category, kind, title, body, sort
     FROM changelog_entries
     ORDER BY day DESC, sort ASC`,
  ).all<ChangelogRow>();
  return (results ?? []).map((row) => ({
    ...row,
    kind: isKind(row.kind) ? row.kind : "feat",
  }));
}

export function changelogMarkdown(rows: ChangelogRow[]): string {
  const lines = [
    "# aft.page changelog",
    "",
    "> What shipped, grouped by day. HTML twin: https://aft.page/changelog",
    "",
  ];
  let last = "";
  for (const row of rows) {
    if (row.day !== last) {
      lines.push(`## ${formatDayLong(row.day)} ${row.day.slice(0, 4)}`, "");
      last = row.day;
    }
    const label = isKind(row.kind) ? KIND_LABEL[row.kind] : "FEAT";
    lines.push(`### ${label} — ${row.title}`, row.body, "");
  }
  return lines.join("\n");
}

export type ChangelogMonth = {
  /** ISO year-month, e.g. "2026-08". */
  month: string;
  label: string;
  count: number;
  feat: number;
  fix: number;
  imp: number;
};

export function changelogMonths(rows: ChangelogRow[]): ChangelogMonth[] {
  const byMonth = new Map<string, ChangelogMonth>();
  for (const row of rows) {
    const month = row.day.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const [y, m] = month.split("-").map(Number);
    const label = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y!, m! - 1, 1)));
    let agg = byMonth.get(month);
    if (!agg) {
      agg = { month, label, count: 0, feat: 0, fix: 0, imp: 0 };
      byMonth.set(month, agg);
    }
    agg.count++;
    agg[isKind(row.kind) ? row.kind : "feat"]++;
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** Escape for XML text and CDATA. */
function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function changelogRss(rows: ChangelogRow[]): string {
  const items = rows
    .map((row) => {
      const label = isKind(row.kind) ? KIND_LABEL[row.kind] : "FEAT";
      const date = new Date(row.day + "T00:00:00Z").toUTCString();
      const guid = `${row.day}-${row.id}`;
      return [
        "    <item>",
        `      <title>${xmlEsc(`${label}: ${row.title}`)}</title>`,
        `      <link>https://aft.page/changelog#${xmlEsc(row.id)}</link>`,
        `      <guid isPermaLink="false">${xmlEsc(guid)}</guid>`,
        `      <pubDate>${xmlEsc(date)}</pubDate>`,
        `      <description>${xmlEsc(mdToText(row.body))}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>aft.page changelog</title>",
    "    <link>https://aft.page/changelog</link>",
    "    <description>What shipped on aft.page — deploys, agents, sharing, and the platform underneath.</description>",
    "    <atom:link href=\"https://aft.page/changelog.rss\" rel=\"self\" type=\"application/rss+xml\" />",
    "    <language>en</language>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** Strip inline markdown to plain text for RSS <description>. */
function mdToText(src: string): string {
  return src
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}

export async function handleChangelog(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const md = url.pathname === "/v1/changelog.md";
  const rss = url.pathname === "/v1/changelog.rss";
  const jsonPath = url.pathname === "/v1/changelog";
  if ((!md && !rss && !jsonPath) || request.method !== "GET") return null;

  const rows = await listChangelog(env);
  const extra = { "cache-control": "public, max-age=60" };

  if (md) {
    return new Response(changelogMarkdown(rows), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "access-control-allow-origin": "*",
        ...extra,
      },
    });
  }

  if (rss) {
    return new Response(changelogRss(rows), {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "access-control-allow-origin": "*",
        ...extra,
      },
    });
  }

  return json(
    {
      entries: rows.map((row) => ({
        id: row.id,
        day: row.day,
        category: row.category,
        kind: row.kind,
        title: row.title,
        body: row.body,
        html: mdInline(row.body),
      })),
      months: changelogMonths(rows),
    },
    200,
    extra,
  );
}
