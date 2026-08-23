/**
 * Inference through Cloudflare AI Gateway (same pattern as Cloudflare OS:
 * Worker `AI` binding + gateway id). Spend/logs live on the gateway, not in aft.
 *
 * Ref: refs/cloudflare-os/packages/workshop-backend/src/ai-gateway.ts
 */
import type { Env } from "./env";

export const AFT_GATEWAY_ID = "default";

/** Prefer Grok; fall back to Workers AI so generate works without Unified Billing. */
export const CODE_MODELS = [
  "xai/grok-4",
  "@cf/meta/llama-3.1-8b-instruct",
] as const;

export function gatewayId(env: Env): string {
  return (env as { AFT_AI_GATEWAY?: string }).AFT_AI_GATEWAY?.trim() || AFT_GATEWAY_ID;
}

export function hasAiBinding(env: Env): boolean {
  return typeof env.AI?.run === "function";
}

export function textFromAiResult(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  if (typeof o.response === "string") return o.response;
  if (typeof o.text === "string") return o.text;
  const choices = o.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as { message?: { content?: unknown } }).message;
    if (typeof msg?.content === "string") return msg.content;
  }
  return "";
}

export async function runGatewayChat(
  env: Env,
  messages: { role: string; content: string }[],
  opts?: { maxTokens?: number },
): Promise<{ text: string; model: string } | null> {
  const ai = env.AI;
  if (!ai || typeof ai.run !== "function") return null;
  const gw = { id: gatewayId(env) };
  const max_tokens = opts?.maxTokens ?? 2048;
  for (const model of CODE_MODELS) {
    try {
      const raw = await ai.run(
        model,
        { messages, max_tokens },
        { gateway: gw },
      );
      const text = textFromAiResult(raw).trim();
      if (text) return { text, model };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "warn", event: "ai_gateway", model, message }));
    }
  }
  return null;
}
