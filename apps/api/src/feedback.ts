import { isValidEmail, normalizeEmail } from "./auth";
import { addFeedback } from "./db";
import type { Env } from "./env";
import { clientIp, corsHeaders, json } from "./http";
import { trackFeedback } from "./metrics";
import { rateLimit } from "./rate-limit";

const MAX_BODY_BYTES = 8_192;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_PAGE_CHARS = 512;
const SUCCESS_MESSAGE = "Thanks — your feedback is in. We read every note.";

type FeedbackBody = {
  message?: unknown;
  email?: unknown;
  page?: unknown;
  company?: unknown;
};

async function privateRateKey(env: Env, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`feedback:${value}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function readLimitedText(request: Request): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function handleFeedback(
  request: Request,
  env: Env,
): Promise<Response> {
  const extra = {
    ...Object.fromEntries(corsHeaders(request.headers.get("origin"), false)),
    "cache-control": "no-store",
  };
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    trackFeedback(env, "unsupported_media_type", 415);
    return json({ error: "unsupported_media_type" }, 415, extra);
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    trackFeedback(env, "payload_too_large", 413);
    return json({ error: "payload_too_large" }, 413, extra);
  }

  const raw = await readLimitedText(request);
  if (raw === null) {
    trackFeedback(env, "payload_too_large", 413);
    return json({ error: "payload_too_large" }, 413, extra);
  }

  let body: FeedbackBody;
  try {
    body = JSON.parse(raw) as FeedbackBody;
  } catch {
    trackFeedback(env, "invalid_json", 400);
    return json({ error: "invalid_json" }, 400, extra);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    trackFeedback(env, "invalid_json", 400);
    return json({ error: "invalid_json" }, 400, extra);
  }

  const ipKey = await privateRateKey(env, clientIp(request));
  if (!(await rateLimit(env, `feedback:ip:${ipKey}`, 10, 3600))) {
    trackFeedback(env, "rate_limited", 429);
    return json({ error: "rate_limited", message: "Please try again later." }, 429, {
      ...extra,
      "retry-after": "3600",
    });
  }

  // Bots tend to fill every field. Respond successfully without retaining data.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    trackFeedback(env, "honeypot", 200);
    return json({ ok: true, message: SUCCESS_MESSAGE }, 200, extra);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 2) {
    trackFeedback(env, "empty_message", 400);
    return json(
      { error: "empty_message", message: "Please add a little more detail." },
      400,
      extra,
    );
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    trackFeedback(env, "message_too_long", 400);
    return json(
      { error: "message_too_long", message: "Feedback is too long." },
      400,
      extra,
    );
  }

  // Email and page are optional context. Drop them if malformed rather than
  // rejecting the whole note — the message is what matters.
  let email: string | null = null;
  if (typeof body.email === "string" && body.email.trim() !== "") {
    const normalized = normalizeEmail(body.email);
    if (isValidEmail(normalized)) email = normalized;
  }

  let page: string | null = null;
  if (typeof body.page === "string" && body.page.trim() !== "") {
    page = body.page.trim().slice(0, MAX_PAGE_CHARS);
  }

  try {
    await addFeedback(env, { message, email, page });
    trackFeedback(env, "new", 200);
  } catch {
    trackFeedback(env, "temporarily_unavailable", 503);
    return json(
      { error: "temporarily_unavailable", message: "Please try again later." },
      503,
      extra,
    );
  }
  return json({ ok: true, message: SUCCESS_MESSAGE }, 200, extra);
}
