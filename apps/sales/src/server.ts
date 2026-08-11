import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { z } from "zod";
import { isAuthorized, loginResponse, unauthorizedHtml } from "./auth";
import {
  STAGES,
  SYSTEM_PROMPT,
  createSqlDb,
  draftOutreach,
  quotePricing,
  type LeadStage,
} from "./pipeline";
import {
  SOCIAL_WATCHLIST,
  createCheckDb,
  fetchSocialPage,
  scoreProspectText,
} from "./social";

export class SalesAgent extends AIChatAgent {
  maxPersistedMessages = 80;

  #db() {
    return createSqlDb(this.sql.bind(this) as Parameters<typeof createSqlDb>[0]);
  }

  #checks() {
    return createCheckDb(this.sql.bind(this) as Parameters<typeof createCheckDb>[0]);
  }

  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const db = this.#db();
    const checks = this.#checks();
    db.ensure();
    checks.seed();

    const result = streamText({
      model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
      system: SYSTEM_PROMPT,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
      }),
      tools: {
        run_sales_check: tool({
          description:
            "Run the basic social sales check (X, LinkedIn, forum, Discord). Fetches what it can; lists URLs to open when blocked.",
          inputSchema: z.object({
            platforms: z
              .array(z.enum(["x", "linkedin", "discord", "forum"]))
              .optional()
              .describe("Limit to these platforms; default all"),
          }),
          execute: async ({ platforms }) => {
            checks.seed();
            const want = platforms?.length
              ? new Set(platforms)
              : null;
            const items = SOCIAL_WATCHLIST.filter((i) =>
              want ? want.has(i.platform) : true,
            );
            const results = [];
            for (const item of items) {
              const fetched = await fetchSocialPage(item.url);
              const status = fetched.ok
                ? "checked"
                : "blocked";
              const score = fetched.score?.score ?? 0;
              const note = fetched.ok
                ? `${fetched.score?.verdict || "?"} · ${fetched.title || ""} · hits: ${(fetched.score?.hits || []).join(", ") || "none"}`
                : fetched.note || fetched.error || "blocked";
              checks.mark(item.id, status, score, note.slice(0, 500));
              results.push({
                id: item.id,
                platform: item.platform,
                label: item.label,
                url: item.url,
                why: item.why,
                status,
                score: fetched.score ?? null,
                title: fetched.title,
                excerpt: fetched.excerpt?.slice(0, 240),
                action: fetched.ok
                  ? "Review excerpt; upsert hot handles as leads"
                  : `Open ${item.url} and paste promising profiles/posts`,
              });
            }
            return {
              checked: results.length,
              hot: results.filter((r) => r.score?.verdict === "hot").length,
              blocked: results.filter((r) => r.status === "blocked").length,
              results,
            };
          },
        }),

        list_social_checks: tool({
          description: "List social watchlist status from the last sales checks",
          inputSchema: z.object({}),
          execute: async () => {
            checks.seed();
            return { checks: checks.list() };
          },
        }),

        check_social_url: tool({
          description:
            "Check one social profile/post URL (or pasted text) and optionally save as a lead",
          inputSchema: z.object({
            url: z.string().optional().describe("Profile or post URL"),
            text: z.string().optional().describe("Pasted post/bio text if fetch will fail"),
            name: z.string().optional().describe("Handle or display name"),
            platform: z
              .enum(["x", "linkedin", "discord", "forum", "other"])
              .optional(),
            save_lead: z.boolean().optional().default(true),
          }),
          execute: async ({ url, text, name, platform, save_lead }) => {
            let excerpt = (text || "").trim();
            let fetchMeta: Awaited<ReturnType<typeof fetchSocialPage>> | null =
              null;
            if (url?.trim()) {
              fetchMeta = await fetchSocialPage(url.trim());
              if (fetchMeta.excerpt) {
                excerpt = `${excerpt} ${fetchMeta.excerpt}`.trim();
              }
            }
            if (!excerpt) {
              return {
                error: "need_url_or_text",
                note: "Paste a URL or post text to score.",
              };
            }
            const score = scoreProspectText(excerpt);
            const handle =
              name?.trim() ||
              (url
                ? url.replace(/^https?:\/\//, "").split(/[/?#]/)[1] || "prospect"
                : "prospect");
            const channel =
              platform ||
              (url?.includes("linkedin")
                ? "linkedin"
                : url?.includes("x.com") || url?.includes("twitter")
                  ? "x"
                  : url?.includes("discord")
                    ? "discord"
                    : "other");
            let lead = null;
            if (save_lead !== false && score.verdict !== "cold") {
              lead = db.upsert({
                name: handle,
                channel,
                signal: `${score.verdict} social check · ${score.hits.join(", ")}`,
                stage: "new",
                notes: (url || "").slice(0, 300),
              });
            }
            return {
              name: handle,
              channel,
              url: url || null,
              score,
              saved: Boolean(lead),
              lead,
              excerpt: excerpt.slice(0, 400),
            };
          },
        }),

        list_pipeline: tool({
          description: "List sales leads found from checks",
          inputSchema: z.object({}),
          execute: async () => {
            const leads = db.list();
            return { count: leads.length, leads };
          },
        }),

        upsert_lead: tool({
          description: "Create or update a lead",
          inputSchema: z.object({
            id: z.string().optional(),
            name: z.string(),
            channel: z.string().optional(),
            signal: z.string().optional(),
            stage: z.enum(STAGES).optional(),
            lastDraft: z.string().optional(),
            notes: z.string().optional(),
          }),
          execute: async (input) => db.upsert(input),
        }),

        log_touch: tool({
          description: "Log sent / replied / booked / closed / lost",
          inputSchema: z.object({
            id: z.string(),
            stage: z.enum(STAGES),
            notes: z.string().optional(),
          }),
          execute: async ({ id, stage, notes }) => {
            const lead = db.logTouch(id, stage as LeadStage, notes);
            return lead ?? { error: `lead not found: ${id}` };
          },
        }),

        draft_outreach: tool({
          description:
            "Optional: draft a DM after a check found someone. Does not send.",
          inputSchema: z.object({
            name: z.string(),
            channel: z
              .enum(["x", "linkedin", "discord", "email", "product", "other"])
              .optional(),
            signal: z.string().optional(),
            context: z.string().optional(),
            save_lead: z.boolean().optional(),
          }),
          execute: async ({ name, channel, signal, context, save_lead }) => {
            const draft = draftOutreach({ name, channel, signal, context });
            let lead = null;
            if (save_lead !== false) {
              lead = db.upsert({
                name,
                channel: channel ?? "other",
                signal,
                stage: "drafted",
                lastDraft: draft.body,
              });
            }
            return { ...draft, lead };
          },
        }),

        quote_pricing: tool({
          description: "Free / Team / Enterprise pricing sheet",
          inputSchema: z.object({
            sku: z.enum(["free", "team", "enterprise", "all"]).optional(),
          }),
          execute: async ({ sku }) => quotePricing(sku ?? "all"),
        }),
      },
      stopWhen: stepCountIs(12),
    });

    return result.toUIMessageStreamResponse();
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!env.SALES_SECRET) {
    return new Response("SALES_SECRET not configured", { status: 500 });
  }
  const ct = request.headers.get("content-type") || "";
  let secret = "";
  if (ct.includes("application/json")) {
    const body = (await request.json()) as { secret?: string };
    secret = String(body.secret ?? "");
  } else {
    const form = await request.formData();
    secret = String(form.get("secret") ?? "");
  }
  if (secret !== env.SALES_SECRET) {
    return new Response("Wrong secret", { status: 401 });
  }
  const secure = new URL(request.url).protocol === "https:";
  return loginResponse(env.SALES_SECRET, "/", { secure });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    if (url.pathname === "/api/me") {
      return Response.json({ ok: isAuthorized(request, env.SALES_SECRET) });
    }

    const authed = isAuthorized(request, env.SALES_SECRET);

    if (url.pathname.startsWith("/agents/")) {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      return (
        (await routeAgentRequest(request, env)) ||
        new Response("Not found", { status: 404 })
      );
    }

    if (!authed) return unauthorizedHtml();

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
