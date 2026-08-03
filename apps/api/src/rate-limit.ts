import type { Env } from "./env";

export async function rateLimit(
  env: Env,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const k = `rl:${key}`;
  const raw = await env.SITES.get(k);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  if (Number.isNaN(count) || count >= max) return false;
  await env.SITES.put(k, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}
