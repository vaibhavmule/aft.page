import type { Env, Plan } from "./types";
import { parseAgentTurn, type AgentTurn } from "./tools";
import { TRY_SQLITE_URL } from "./try-sqlite";

export const RUN_MODELS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/zai-org/glm-5.3-flash",
] as const;

export const MAX_REPAIR_TURNS = 3;

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const p = part as Record<string, unknown>;
        if (typeof p.text === "string") return p.text;
        if (typeof p.content === "string") return p.content;
        return "";
      })
      .join("");
  }
  return "";
}

function textFromAiResult(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  const direct = contentToText(o.response) || contentToText(o.text) || contentToText(o.output);
  if (direct) return direct;
  if (o.response && typeof o.response === "object") {
    const nested = textFromAiResult(o.response);
    if (nested) return nested;
  }
  const choices = o.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const c0 = choices[0] as { message?: { content?: unknown; reasoning?: unknown }; text?: unknown };
    const fromMsg = contentToText(c0.message?.content) || contentToText(c0.text);
    if (fromMsg) return fromMsg;
    const reasoned = contentToText(c0.message?.reasoning);
    if (reasoned) return reasoned;
  }
  return "";
}

const SYSTEM = `You prepare a public GitHub app to run on a try URL https://{slug}.aft.page.
No Postgres on try URLs. sqlite ${TRY_SQLITE_URL} (also SQLALCHEMY_DATABASE_URI) only when the app already has an ORM engine switch (Django DATABASES, SQLAlchemy URI, Rails with gem sqlite3). Not D1 (Worker binding = Code). Do not replace pg/mysql2/prisma or rewrite SQL. Those apps fail: this API needs Postgres; claim, add DATABASE_URL, re-run. Docs: https://aft.page/docs/env/#try-db
Django: ALLOWED_HOSTS must include * or the slug host; CSRF_TRUSTED_ORIGINS for https://{slug}.aft.page and https://*.aft.page. Bind 0.0.0.0.
If settings.py has empty ALLOWED_HOSTS, append:
ALLOWED_HOSTS = ['*']
CSRF_TRUSTED_ORIGINS = ['https://{slug}.aft.page','https://*.aft.page']
Phoenix: bind 0.0.0.0 (PORT is already set). Set env SECRET_KEY_BASE and PHX_HOST={slug}.aft.page when missing. Endpoint check_origin / url host must allow https://{slug}.aft.page — one append to config/dev.exs or config/runtime.exs is enough (like Django settings.py). Ecto + Postgres with no URI/adapter switch → {"fail":"this API needs Postgres; claim, add DATABASE_URL, re-run"}. Do not invent a Dockerfile. Do not rewrite lib/.
Rails: bind 0.0.0.0 (PORT set). One append to config/environments/development.rb or config/application.rb for config.hosts << "{slug}.aft.page" / clear hosts when blocked. gem sqlite3 already → env DATABASE_URL is enough; gem pg only → {"fail":"this API needs Postgres; claim, add DATABASE_URL, re-run"}. Do not rewrite Gemfile or add gems.
Reply JSON only, no markdown, no reasoning:
{"note":"short product line","env":{"KEY":"value"},"writes":[{"op":"write"|"append","path":"relative/file","text":"..."}]}
Or {"fail":"honest reason"}.
Do not rewrite the app. Small patches only (at most one config file add/change). Empty writes+env is ok if nothing to change.`;

export async function thinkTurn(
  env: Env,
  input: {
    slug: string;
    plan: Plan;
    tree: string;
    error?: string;
  },
): Promise<AgentTurn | null> {
  const ai = env.AI;
  if (!ai || typeof ai.run !== "function") return null;
  const gw = { id: (env.AFT_AI_GATEWAY || "default").trim() || "default" };
  const user = [
    `slug=${input.slug}`,
    `stack=${input.plan.stack || ""}`,
    `install=${input.plan.install || ""}`,
    `build=${input.plan.build || ""}`,
    `start=${input.plan.start || ""}`,
    input.error ? `error:\n${input.error.slice(0, 1500)}` : "first pass after clone",
    `tree:\n${input.tree.slice(0, 6000)}`,
  ].join("\n");
  for (const model of RUN_MODELS) {
    try {
      const raw = await ai.run(
        model,
        {
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
          max_tokens: 4096,
          reasoning_effort: "low",
        },
        { gateway: gw },
      );
      const text = textFromAiResult(raw).trim();
      if (!text) {
        console.error(JSON.stringify({ level: "warn", event: "run_agent_ai", model, message: "empty" }));
        continue;
      }
      const turn = parseAgentTurn(text);
      if (turn) return turn;
      console.error(JSON.stringify({ level: "warn", event: "run_agent_ai", model, message: "unparsed" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "warn", event: "run_agent_ai", model, message }));
    }
  }
  return null;
}
