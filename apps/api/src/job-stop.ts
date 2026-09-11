/** Client cancel secret for POST /v1/jobs/{id}/stop. Not stored; not on GET/SSE. */
import type { Env } from "./env";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function jobStopToken(env: Env, jobId: string): Promise<string> {
  const hex = await sha256Hex(`${env.AUTH_SECRET}:job-stop:${jobId}`);
  return `run_stop_${hex}`;
}

export async function verifyJobStopToken(
  env: Env,
  jobId: string,
  token: string,
): Promise<boolean> {
  if (!token.startsWith("run_stop_")) return false;
  const expect = await jobStopToken(env, jobId);
  return timingSafeEqual(token, expect);
}
