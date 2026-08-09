/**
 * Public changelog from D1. Add rows with wrangler d1 execute — no write API yet.
 */
import type { Env } from "./env";
import { json } from "./http";

export type ChangelogRow = {
  id: string;
  day: string;
  category: string;
  title: string;
  body: string;
  sort: number;
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
    `SELECT id, day, category, title, body, sort
     FROM changelog_entries
     ORDER BY day DESC, sort ASC`,
  ).all<ChangelogRow>();
  return results ?? [];
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
    lines.push(`### ${row.title}`, row.body, "");
  }
  return lines.join("\n");
}

export async function handleChangelog(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const md = url.pathname === "/v1/changelog.md";
  const jsonPath = url.pathname === "/v1/changelog";
  if ((!md && !jsonPath) || request.method !== "GET") return null;

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

  return json(
    {
      entries: rows.map((row) => ({
        id: row.id,
        day: row.day,
        category: row.category,
        title: row.title,
        body: row.body,
        html: mdInline(row.body),
      })),
    },
    200,
    extra,
  );
}
