import type { Env } from "./types";

export const DEFAULT_API = "https://api.aft.page";

export const scrub = (s: string): string =>
  s
    .replace(/opennextjs-cloudflare/gi, "next build")
    .replace(/@opennextjs\/\S+/gi, "next")
    .replace(/\bOpenNext\b/gi, "Next.js")
    .replace(/\bWrangler\b/g, "")
    .replace(/\bwrangler\b/g, "")
    .replace(/\bCloudflare\b/gi, "aft")
    .replace(/\bsandbox\b/gi, "runner")
    .replace(/trycloudflare\.com/gi, "aft.page")
    .replace(/ {2,}/g, " ")
    .trim();

export async function apiFetch(
  env: Env,
  apiBase: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  if (env.AFT_API_SERVICE) {
    return env.AFT_API_SERVICE.fetch(
      new Request(`https://api.aft.page${path}`, init),
    );
  }
  return fetch(`${apiBase}${path}`, init);
}

export async function patchJob(
  env: Env,
  api: string,
  jobId: string,
  token: string,
  phase: string,
  line?: string,
  reason?: string,
) {
  const body: Record<string, string> = { phase };
  if (line) body.line = scrub(line).slice(-2000);
  if (reason) body.reason = scrub(reason).slice(0, 500);
  try {
    const res = await apiFetch(env, api, `/v1/jobs/${jobId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "aft.page-run-container",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`patchJob ${phase} ${res.status}: ${text.slice(0, 200)}`);
    } else {
      await res.body?.cancel().catch(() => null);
    }
  } catch (e) {
    console.error(`patchJob ${phase} failed`, e);
  }
}

export async function failJob(
  env: Env,
  api: string,
  jobId: string,
  token: string,
  reason: string,
) {
  await patchJob(env, api, jobId, token, "failed", undefined, reason);
}

export async function completeJob(
  env: Env,
  api: string,
  jobId: string,
  token: string,
  upstream: string,
) {
  const res = await apiFetch(env, api, `/v1/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "aft.page-run-container",
    },
    body: JSON.stringify({ upstream }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`complete ${res.status}: ${text.slice(0, 200)}`);
  }
  await res.body?.cancel().catch(() => null);
}
