/** Basic social watchlist + prospect scoring for sales checks. */

export const SOCIAL_PLATFORMS = ["x", "linkedin", "discord", "forum"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialWatchItem = {
  id: string;
  platform: SocialPlatform;
  label: string;
  /** Public search / community URL to open or fetch. */
  url: string;
  why: string;
};

/** Seed list — agent runs these as a sales check. No paid APIs. */
export const SOCIAL_WATCHLIST: SocialWatchItem[] = [
  {
    id: "x-cursor-localhost",
    platform: "x",
    label: "X · Cursor + localhost",
    url: "https://x.com/search?q=cursor%20localhost&src=typed_query&f=live",
    why: "Builders stuck with agent apps on localhost",
  },
  {
    id: "x-claude-deploy",
    platform: "x",
    label: "X · Claude Code / deploy",
    url: "https://x.com/search?q=%22claude%20code%22%20(deploy%20OR%20localhost%20OR%20hosting)&src=typed_query&f=live",
    why: "Claude builders looking for a place to put the app",
  },
  {
    id: "x-codex-app",
    platform: "x",
    label: "X · Codex / ChatGPT app",
    url: "https://x.com/search?q=(codex%20OR%20chatgpt)%20(app%20OR%20localhost)%20-openai.com&src=typed_query&f=live",
    why: "Codex/ChatGPT-made apps that need a URL",
  },
  {
    id: "li-cursor-builders",
    platform: "linkedin",
    label: "LinkedIn · Cursor builders",
    url: "https://www.linkedin.com/search/results/content/?keywords=cursor%20AI%20app%20localhost",
    why: "Professional builders posting demos",
  },
  {
    id: "li-agent-software",
    platform: "linkedin",
    label: "LinkedIn · agent-built software",
    url: "https://www.linkedin.com/search/results/content/?keywords=%22built%20with%20AI%22%20app%20deploy",
    why: "Posts about shipping agent-made tools",
  },
  {
    id: "forum-cursor",
    platform: "forum",
    label: "Cursor forum",
    url: "https://forum.cursor.com/",
    why: "People asking how to share / host agent projects",
  },
  {
    id: "discord-hint",
    platform: "discord",
    label: "Discord · Cursor / Claude communities",
    url: "https://discord.com/invite/cursor",
    why: "Community DMs — skim for localhost / share pain",
  },
];

const BUY_SIGNALS = [
  "localhost",
  "can't share",
  "cant share",
  "only local",
  "how do i deploy",
  "how to deploy",
  "host this",
  "share the link",
  "shareable",
  "no url",
  "stuck on local",
  "vibe code",
  "vibe coding",
  "cursor",
  "claude code",
  "codex",
  "lovable",
  "v0",
  "mcp",
  "agent built",
  "built with ai",
];

export type ProspectScore = {
  score: number; // 0–100
  hits: string[];
  verdict: "hot" | "warm" | "cold";
};

export function scoreProspectText(text: string): ProspectScore {
  const lower = text.toLowerCase();
  const hits = BUY_SIGNALS.filter((s) => lower.includes(s));
  const score = Math.min(100, hits.length * 12);
  const verdict = score >= 36 ? "hot" : score >= 12 ? "warm" : "cold";
  return { score, hits, verdict };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

export type SocialFetchResult = {
  ok: boolean;
  status?: number;
  title?: string;
  excerpt?: string;
  score?: ProspectScore;
  error?: string;
  note?: string;
};

/** Best-effort public fetch. X/LI often block bots — then we return open-and-paste guidance. */
export async function fetchSocialPage(url: string): Promise<SocialFetchResult> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; aft-sales-check/0.1; +https://aft.page)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    const status = res.status;
    if (!res.ok) {
      return {
        ok: false,
        status,
        error: `HTTP ${status}`,
        note: "Site blocked the fetch. Open the URL, copy promising profiles/posts, then run check_social_url.",
      };
    }
    const html = await res.text();
    const title =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ||
      undefined;
    const excerpt = stripHtml(html);
    if (excerpt.length < 40) {
      return {
        ok: false,
        status,
        title,
        error: "empty_or_js_shell",
        note: "Page needs a browser. Open the URL and paste text/handles here.",
      };
    }
    const score = scoreProspectText(`${title || ""} ${excerpt}`);
    return { ok: true, status, title, excerpt: excerpt.slice(0, 800), score };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      note: "Fetch failed. Open the URL manually and paste prospects.",
    };
  }
}

export type CheckRow = {
  id: string;
  platform: string;
  label: string;
  url: string;
  status: string; // pending | checked | blocked
  lastScore: number;
  lastNote: string;
  updatedAt: string;
};

export type CheckDb = {
  ensure(): void;
  seed(): void;
  list(): CheckRow[];
  mark(
    id: string,
    status: string,
    lastScore: number,
    lastNote: string,
  ): CheckRow | null;
};

export function createCheckDb(
  sql: <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => T[],
): CheckDb {
  return {
    ensure() {
      sql`
        CREATE TABLE IF NOT EXISTS social_checks (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          label TEXT NOT NULL,
          url TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          last_score INTEGER NOT NULL DEFAULT 0,
          last_note TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        )
      `;
    },
    seed() {
      this.ensure();
      const now = new Date().toISOString();
      for (const item of SOCIAL_WATCHLIST) {
        sql`
          INSERT INTO social_checks (id, platform, label, url, status, last_score, last_note, updated_at)
          VALUES (${item.id}, ${item.platform}, ${item.label}, ${item.url}, 'pending', 0, ${item.why}, ${now})
          ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            url = excluded.url,
            platform = excluded.platform
        `;
      }
    },
    list() {
      this.ensure();
      const rows = sql`SELECT * FROM social_checks ORDER BY platform, id`;
      return rows.map((r) => {
        const o = r as Record<string, unknown>;
        return {
          id: String(o.id ?? ""),
          platform: String(o.platform ?? ""),
          label: String(o.label ?? ""),
          url: String(o.url ?? ""),
          status: String(o.status ?? "pending"),
          lastScore: Number(o.last_score ?? 0),
          lastNote: String(o.last_note ?? ""),
          updatedAt: String(o.updated_at ?? ""),
        };
      });
    },
    mark(id, status, lastScore, lastNote) {
      this.ensure();
      const existing = sql`SELECT * FROM social_checks WHERE id = ${id}`;
      if (!existing[0]) return null;
      const updatedAt = new Date().toISOString();
      sql`
        UPDATE social_checks
        SET status = ${status}, last_score = ${lastScore}, last_note = ${lastNote}, updated_at = ${updatedAt}
        WHERE id = ${id}
      `;
      const row = existing[0] as Record<string, unknown>;
      return {
        id,
        platform: String(row.platform ?? ""),
        label: String(row.label ?? ""),
        url: String(row.url ?? ""),
        status,
        lastScore,
        lastNote,
        updatedAt,
      };
    },
  };
}
