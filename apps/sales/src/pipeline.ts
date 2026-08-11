/** CRM-lite + outreach/pricing helpers for the aft sales agent. */

export const STAGES = [
  "new",
  "drafted",
  "sent",
  "replied",
  "booked",
  "closed",
  "lost",
] as const;

export type LeadStage = (typeof STAGES)[number];

export type Lead = {
  id: string;
  name: string;
  channel: string;
  signal: string;
  stage: LeadStage;
  lastDraft: string;
  notes: string;
  updatedAt: string;
};

export type UpsertLeadInput = {
  id?: string;
  name: string;
  channel?: string;
  signal?: string;
  stage?: LeadStage;
  lastDraft?: string;
  notes?: string;
};

/** Tagged SQL runner shaped like Agent `this.sql`. */
export type SqlFn = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => T[];

const HOOK =
  "What did your agent build that never made it past localhost?";

const PITCH =
  "AFT is the publishing and permission layer for software created by AI agents — your agent made it; aft makes it live, persistent, and shareable (*.aft.page).";

export function draftOutreach(input: {
  name: string;
  channel?: string;
  signal?: string;
  context?: string;
}): { body: string; hook: string } {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  const signalBit = input.signal?.trim()
    ? ` Saw ${input.signal.trim()}.`
    : "";
  const contextBit = input.context?.trim()
    ? ` ${input.context.trim()}`
    : "";
  const channel = (input.channel || "dm").toLowerCase();
  const closer =
    channel === "linkedin" || channel === "email"
      ? " Open to a 15-min call this week?"
      : " Worth a quick chat?";

  const body = `Hey ${first} — ${HOOK}${signalBit}${contextBit} ${PITCH}${closer}`;
  return { body: body.replace(/\s+/g, " ").trim(), hook: HOOK };
}

export function quotePricing(
  sku: "free" | "team" | "enterprise" | "all" = "all",
): Record<string, unknown> {
  const free = {
    sku: "free",
    price: "$0",
    includes: [
      "Hosted public deploys (*.aft.page)",
      "MCP / agent deploy",
      "Claim + basic share",
    ],
  };
  const team = {
    sku: "team",
    usd: "$99/mo",
    inr: "₹5,000–₹15,000 (default ₹9,999)",
    includes: [
      "Private apps + invite ACL",
      "Durable projects",
      "Updates and rollback",
      "Email support (founder)",
    ],
    say: "Pay $99 when you need private invite sharing.",
  };
  const enterprise = {
    sku: "enterprise",
    usd: "$499/mo",
    pilot_usd: "$2,000 / 30-day",
    pilot_inr: "₹25,000–₹75,000 setup + support",
    pick_one: ["perimeter (IP whitelist)", "connector (live data)"],
    say: "Pay $499 for IP whitelist / perimeter, or connector design partner.",
  };
  if (sku === "free") return free;
  if (sku === "team") return team;
  if (sku === "enterprise") return enterprise;
  return {
    close_rule:
      "Any non-friend paid money or signed LOI counts. Prefer list; accept dated pilot if they deploy this week.",
    quote_inr_for: "India / SEA",
    quote_usd_for: "US / YC",
    free,
    team,
    enterprise,
  };
}

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || `lead-${Date.now()}`;
}

function asStage(v: unknown): LeadStage {
  return STAGES.includes(v as LeadStage) ? (v as LeadStage) : "new";
}

function rowToLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    channel: String(row.channel ?? ""),
    signal: String(row.signal ?? ""),
    stage: asStage(row.stage),
    lastDraft: String(row.last_draft ?? ""),
    notes: String(row.notes ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export type LeadDb = {
  ensure(): void;
  upsert(input: UpsertLeadInput): Lead;
  list(): Lead[];
  logTouch(id: string, stage: LeadStage, notes?: string): Lead | null;
};

export function createMemoryDb(): LeadDb {
  const map = new Map<string, Lead>();
  return {
    ensure() {},
    upsert(input) {
      const id = input.id?.trim() || slugId(input.name);
      const prev = map.get(id);
      const lead: Lead = {
        id,
        name: input.name.trim(),
        channel: (input.channel ?? prev?.channel ?? "other").trim() || "other",
        signal: (input.signal ?? prev?.signal ?? "").trim(),
        stage: input.stage ?? prev?.stage ?? "new",
        lastDraft: input.lastDraft ?? prev?.lastDraft ?? "",
        notes: input.notes ?? prev?.notes ?? "",
        updatedAt: new Date().toISOString(),
      };
      map.set(id, lead);
      return lead;
    },
    list() {
      return [...map.values()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    },
    logTouch(id, stage, notes) {
      const prev = map.get(id);
      if (!prev) return null;
      const next: Lead = {
        ...prev,
        stage,
        notes: notes ?? prev.notes,
        updatedAt: new Date().toISOString(),
      };
      map.set(id, next);
      return next;
    },
  };
}

export function createSqlDb(sql: SqlFn): LeadDb {
  return {
    ensure() {
      sql`
        CREATE TABLE IF NOT EXISTS leads (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'other',
          signal TEXT NOT NULL DEFAULT '',
          stage TEXT NOT NULL DEFAULT 'new',
          last_draft TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        )
      `;
    },
    upsert(input) {
      this.ensure();
      const id = input.id?.trim() || slugId(input.name);
      const existing = sql`SELECT * FROM leads WHERE id = ${id}`;
      const prev = existing[0] ? rowToLead(existing[0] as Record<string, unknown>) : null;
      const lead: Lead = {
        id,
        name: input.name.trim(),
        channel: (input.channel ?? prev?.channel ?? "other").trim() || "other",
        signal: (input.signal ?? prev?.signal ?? "").trim(),
        stage: input.stage ?? prev?.stage ?? "new",
        lastDraft: input.lastDraft ?? prev?.lastDraft ?? "",
        notes: input.notes ?? prev?.notes ?? "",
        updatedAt: new Date().toISOString(),
      };
      sql`
        INSERT INTO leads (id, name, channel, signal, stage, last_draft, notes, updated_at)
        VALUES (${lead.id}, ${lead.name}, ${lead.channel}, ${lead.signal}, ${lead.stage}, ${lead.lastDraft}, ${lead.notes}, ${lead.updatedAt})
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          channel = excluded.channel,
          signal = excluded.signal,
          stage = excluded.stage,
          last_draft = excluded.last_draft,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `;
      return lead;
    },
    list() {
      this.ensure();
      const rows = sql`SELECT * FROM leads ORDER BY updated_at DESC`;
      return rows.map((r) => rowToLead(r as Record<string, unknown>));
    },
    logTouch(id, stage, notes) {
      this.ensure();
      const existing = sql`SELECT * FROM leads WHERE id = ${id}`;
      if (!existing[0]) return null;
      const prev = rowToLead(existing[0] as Record<string, unknown>);
      const next: Lead = {
        ...prev,
        stage,
        notes: notes ?? prev.notes,
        updatedAt: new Date().toISOString(),
      };
      sql`
        UPDATE leads
        SET stage = ${next.stage}, notes = ${next.notes}, updated_at = ${next.updatedAt}
        WHERE id = ${id}
      `;
      return next;
    },
  };
}

export const SYSTEM_PROMPT = `You are aft's founder sales checker. Your job is to FIND and CHECK prospects on socials — not to wait for "draft me 3 DMs".

Product: aft (aft.page) — publishing + permission layer for agent-built Small Software (durable shareable *.aft.page URLs).

Ideal prospect: someone who built with Cursor / Claude / Codex / Lovable / v0 and is stuck on localhost or asking how to share/deploy.

Primary workflow (sales check):
1. run_sales_check — walk the basic social watchlist (X, LinkedIn, Cursor forum, Discord hint)
2. For each source: fetch if possible; if blocked, tell founder the URL and what to look for
3. When founder pastes a profile/post URL or text → check_social_url / score it → upsert_lead
4. list_pipeline — show who we found

You NEVER send messages on socials. Drafting is optional secondary (draft_outreach) after a check finds someone.

Basic socials in v1: X, LinkedIn, Discord communities, Cursor forum.

Keep replies short: checklist results, scores (hot/warm/cold), next open URLs.`;
