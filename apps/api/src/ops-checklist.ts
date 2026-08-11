/**
 * Founder 30-day startup checklist for ops.aft.page/todos.
 * Mix of YC ops hygiene (launch, talk to users) + formation/presence
 * (domain, email, socials) — check-in list, not a second CRM.
 */
import type { Env } from "./env";

export type ChecklistItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  src?: string;
};

/** Seed order = display order within each group. */
export const STARTUP_30D: ChecklistItem[] = [
  // Presence
  {
    id: "domain-primary",
    group: "Presence",
    label: "Primary domain registered + HTTPS live",
    hint: "aft.page (and any spoken alias → 301)",
    src: "Composed Origin",
  },
  {
    id: "domain-defensive",
    group: "Presence",
    label: "Defensive domains noted (buy later if needed)",
    hint: ".com / .ai only when traction justifies",
    src: "DOMAINS.md",
  },
  {
    id: "status-page",
    group: "Presence",
    label: "Public status URL",
    hint: "status.aft.page",
  },
  {
    id: "llms-txt",
    group: "Presence",
    label: "llms.txt + AI-readable product page",
    hint: "Agents are users too",
  },

  // Email
  {
    id: "email-workspace",
    group: "Email",
    label: "Company email on domain (Google Workspace or similar)",
    hint: "hello@ / founders@ — not only Gmail",
    src: "Composed Origin",
  },
  {
    id: "email-auth",
    group: "Email",
    label: "SPF + DKIM (+ DMARC when ready)",
    hint: "So outreach and magic links land",
  },
  {
    id: "email-monitored",
    group: "Email",
    label: "Support inbox actually monitored",
    hint: "hello@aft.page / OPS_EMAILS",
  },

  // Socials
  {
    id: "social-x",
    group: "Socials",
    label: "X / Twitter handle claimed",
    hint: "Brand + founder account",
    src: "YC presence",
  },
  {
    id: "social-linkedin",
    group: "Socials",
    label: "LinkedIn company page (or founder profile) live",
    src: "YC presence",
  },
  {
    id: "social-github",
    group: "Socials",
    label: "GitHub org / public repos for plugin + CLI",
    hint: "npx plugins add … needs a public source",
  },
  {
    id: "social-handles-scan",
    group: "Socials",
    label: "Scan name availability on Discord / HN / Product Hunt",
    hint: "Claim when free; don’t boil the ocean",
  },

  // Entity / legal
  {
    id: "entity-formed",
    group: "Entity",
    label: "Company entity formed (or decision documented)",
    hint: "US: Delaware C-Corp path if raising; else local entity",
    src: "YC / Clerky",
  },
  {
    id: "ip-assignment",
    group: "Entity",
    label: "Founder IP assignment signed",
    hint: "Before more code / before raise",
    src: "YC legal",
  },
  {
    id: "bank-account",
    group: "Entity",
    label: "Business bank account (no personal mix)",
    src: "Formation checklist",
  },
  {
    id: "password-manager",
    group: "Entity",
    label: "Shared password manager for company logins",
    hint: "1Password / Bitwarden",
    src: "Composed Origin",
  },
  {
    id: "privacy-terms",
    group: "Entity",
    label: "Privacy + Terms linked from site",
    hint: "Good enough; not perfect",
  },

  // YC product motion (30 days)
  {
    id: "launch-now",
    group: "30-day motion",
    label: "Product launched — strangers can get a URL without you",
    hint: "YC: launch now",
    src: "YC essential advice",
  },
  {
    id: "talk-users",
    group: "30-day motion",
    label: "Talk to users weekly (write code · talk to users)",
    hint: "Calls / DMs — human-speed bottleneck",
    src: "YC · plan.md",
  },
  {
    id: "ten-who-love",
    group: "30-day motion",
    label: "Find ~10 customers who love it (or clear disprove)",
    src: "YC pocket guide",
  },
  {
    id: "do-not-scale",
    group: "30-day motion",
    label: "Do things that don’t scale (manual onboard, founder DMs)",
    src: "PG",
  },
  {
    id: "repeat-deployers",
    group: "30-day motion",
    label: "≥5 repeat deployers + evidence pack notes",
    src: "plan.md",
  },
  {
    id: "share-loop",
    group: "30-day motion",
    label: "≥1 app shared with another person (invite accepted)",
    src: "plan.md",
  },
  {
    id: "paid-or-loi",
    group: "30-day motion",
    label: "≥1 paid or signed pilot / LOI (non-friend)",
    src: "plan.md · PRICING.md",
  },
  {
    id: "plugin-distro",
    group: "30-day motion",
    label: "Agent plugin installable (public source + marketplace path)",
    src: "plan.md",
  },
  {
    id: "yc-app",
    group: "30-day motion",
    label: "YC application + 1-min video filed (or dated skip)",
    src: "YC-APPLICATION.md",
  },
  {
    id: "credits",
    group: "30-day motion",
    label: "Startup credits applied (Google / Cloudflare / …)",
    src: "FUNDRAISE.md",
  },
];

/**
 * Marketplace + plugin distribution pipeline (ops.aft.page/distribute).
 * Not a product store — founder tracker: ready → listed → proof.
 */
export const DISTRIBUTE: ChecklistItem[] = [
  // Ready
  {
    id: "dist-plugin-package",
    group: "Ready",
    label: "Agent Plugin package green (`node apps/plugin/check.mjs`)",
    hint: "npx plugins add vaibhavmule/aft.page",
    src: "apps/plugin",
  },
  {
    id: "dist-plugin-public",
    group: "Ready",
    label: "Plugin tree public on GitHub (discoverable source)",
    hint: "Push blocked strangers otherwise",
    src: "todo · G7",
  },
  {
    id: "dist-cli-install",
    group: "Ready",
    label: "Hosted CLI live: curl | sh → aft deploy",
    hint: "https://aft.page/install",
  },
  {
    id: "dist-mcp-url",
    group: "Ready",
    label: "Remote MCP live at mcp.aft.page/mcp",
  },
  {
    id: "dist-aft-plugins-add",
    group: "Ready",
    label: "`aft plugins add` wraps the Agent Plugin install",
  },

  // Listings
  {
    id: "dist-cursor-marketplace",
    group: "Listings",
    label: "Cursor marketplace — submitted / live",
    hint: "vercel.com/plugin · agent-plugins.org",
    src: "G7",
  },
  {
    id: "dist-cursor-directory",
    group: "Listings",
    label: "cursor.directory listing live",
    src: "G7",
  },
  {
    id: "dist-claude-marketplace",
    group: "Listings",
    label: "Claude Code marketplace listing",
    hint: ".claude-plugin + catalog submit",
    src: "G9",
  },
  {
    id: "dist-openai-catalog",
    group: "Listings",
    label: "ChatGPT / Codex catalog entry (separate from npx plugins)",
    hint: "Do not assume agent-plugins.org covers OpenAI",
    src: "G8 · COMPETITION.md",
  },
  {
    id: "dist-vscode-copilot",
    group: "Listings",
    label: "VS Code / Copilot path documented or listed",
    src: "G8",
  },
  {
    id: "dist-kilo-windsurf",
    group: "Listings",
    label: "Kilo / Windsurf MCP catalog or /with pages accurate",
  },

  // Proof
  {
    id: "dist-demo-30s",
    group: "Proof",
    label: "30s demo clip: plugin or CLI → live URL",
    src: "p0.txt · G7",
  },
  {
    id: "dist-strangers-5",
    group: "Proof",
    label: "≥5 stranger deploys without founder help",
    src: "plan.md",
  },
  {
    id: "dist-with-pages",
    group: "Proof",
    label: "/with/* pages show Plugin + CLI (not MCP-only)",
    src: "G10",
  },
  {
    id: "dist-hero-cli",
    group: "Proof",
    label: "Homepage hero defaults to CLI tab",
  },

  // Outreach
  {
    id: "dist-show-post",
    group: "Outreach",
    label: "Public post: install | sh → aft deploy (X / HN / …)",
    hint: "Terminal people share this",
  },
  {
    id: "dist-builder-dms",
    group: "Outreach",
    label: "Weekly builder DMs running (Cursor / Claude / Codex)",
    src: "G13",
  },
  {
    id: "dist-feedback-loop",
    group: "Outreach",
    label: "Feedback → fix → tell-them loop this week",
    src: "G14",
  },
];

const ALL_CHECKLIST = [...STARTUP_30D, ...DISTRIBUTE];

export function checklistListForId(
  id: string,
): "todos" | "distribute" | null {
  if (STARTUP_30D.some((i) => i.id === id)) return "todos";
  if (DISTRIBUTE.some((i) => i.id === id)) return "distribute";
  return null;
}

export async function loadChecklistDone(
  env: Env,
): Promise<Map<string, { done: boolean; note: string }>> {
  const map = new Map<string, { done: boolean; note: string }>();
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, done, note FROM ops_checklist`,
    ).all<{ id: string; done: number; note: string }>();
    for (const row of results || []) {
      map.set(row.id, { done: row.done === 1, note: row.note || "" });
    }
  } catch {
    /* table may not exist until migration */
  }
  return map;
}

export async function toggleChecklistItem(
  env: Env,
  id: string,
  done: boolean,
  note?: string,
): Promise<boolean> {
  if (!ALL_CHECKLIST.some((i) => i.id === id)) return false;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ops_checklist (id, done, note, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       done = excluded.done,
       note = CASE WHEN excluded.note != '' THEN excluded.note ELSE ops_checklist.note END,
       updated_at = excluded.updated_at`,
  )
    .bind(id, done ? 1 : 0, note ?? "", now)
    .run();
  return true;
}

export function checklistProgress(
  done: Map<string, { done: boolean; note: string }>,
  list: readonly ChecklistItem[] = STARTUP_30D,
): { total: number; done: number } {
  const total = list.length;
  let n = 0;
  for (const item of list) {
    if (done.get(item.id)?.done) n += 1;
  }
  return { total, done: n };
}
