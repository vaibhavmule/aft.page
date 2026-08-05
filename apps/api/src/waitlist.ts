import { isValidEmail, normalizeEmail } from "./auth";
import { addWaitlistSignup } from "./db";
import type { Env } from "./env";
import { clientIp, corsHeaders, json } from "./http";
import { trackWaitlist } from "./metrics";
import { rateLimit } from "./rate-limit";

const MAX_BODY_BYTES = 2_048;
const SUCCESS_MESSAGE = "You’re on the list. We’ll only email with meaningful aft.page updates.";

type WaitlistBody = {
  email?: unknown;
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
    new TextEncoder().encode(`waitlist:${value}`),
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

function isValidWaitlistEmail(email: string): boolean {
  if (!isValidEmail(email)) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain || local.length > 64 || local.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  if (domain.length > 253 || domain.includes("..")) return false;
  return domain.split(".").every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

export async function handleWaitlistSignup(
  request: Request,
  env: Env,
): Promise<Response> {
  const extra = {
    ...Object.fromEntries(corsHeaders(request.headers.get("origin"), false)),
    "cache-control": "no-store",
  };
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    trackWaitlist(env, "unsupported_media_type", 415);
    return json({ error: "unsupported_media_type" }, 415, extra);
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    trackWaitlist(env, "payload_too_large", 413);
    return json({ error: "payload_too_large" }, 413, extra);
  }

  const raw = await readLimitedText(request);
  if (raw === null) {
    trackWaitlist(env, "payload_too_large", 413);
    return json({ error: "payload_too_large" }, 413, extra);
  }

  let body: WaitlistBody;
  try {
    body = JSON.parse(raw) as WaitlistBody;
  } catch {
    trackWaitlist(env, "invalid_json", 400);
    return json({ error: "invalid_json" }, 400, extra);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    trackWaitlist(env, "invalid_json", 400);
    return json({ error: "invalid_json" }, 400, extra);
  }

  const ipKey = await privateRateKey(env, clientIp(request));
  if (!(await rateLimit(env, `waitlist:ip:${ipKey}`, 10, 3600))) {
    trackWaitlist(env, "rate_limited", 429);
    return json({ error: "rate_limited", message: "Please try again later." }, 429, {
      ...extra,
      "retry-after": "3600",
    });
  }

  // Bots tend to fill every field. Respond successfully without retaining data.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    trackWaitlist(env, "honeypot", 200);
    return json({ ok: true, message: SUCCESS_MESSAGE }, 200, extra);
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidWaitlistEmail(email)) {
    trackWaitlist(env, "invalid_email", 400);
    return json(
      { error: "invalid_email", message: "Enter a valid email address." },
      400,
      extra,
    );
  }

  const emailKey = await privateRateKey(env, email);
  if (!(await rateLimit(env, `waitlist:email:${emailKey}`, 5, 3600))) {
    trackWaitlist(env, "rate_limited", 429);
    return json({ error: "rate_limited", message: "Please try again later." }, 429, {
      ...extra,
      "retry-after": "3600",
    });
  }

  try {
    const inserted = await addWaitlistSignup(env, email);
    trackWaitlist(env, inserted ? "new" : "duplicate", 200);
  } catch {
    trackWaitlist(env, "temporarily_unavailable", 503);
    return json(
      { error: "temporarily_unavailable", message: "Please try again later." },
      503,
      extra,
    );
  }
  return json({ ok: true, message: SUCCESS_MESSAGE }, 200, extra);
}
