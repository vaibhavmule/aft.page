/**
 * Per-site encrypted secrets vault (AES-GCM via AUTH_SECRET).
 */
import type { Env } from "./env";
import { ensureDb } from "./db";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(env: Env): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.AUTH_SECRET),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("aft.page/site-secrets/v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(env: Env, plaintext: string): Promise<string> {
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...packed));
}

export async function decryptSecret(env: Env, packedB64: string): Promise<string> {
  const key = await deriveKey(env);
  const packed = Uint8Array.from(atob(packedB64), (c) => c.charCodeAt(0));
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return dec.decode(plain);
}

export async function putSiteSecret(
  env: Env,
  slug: string,
  name: string,
  value: string,
): Promise<void> {
  await ensureDb(env);
  const ciphertext = await encryptSecret(env, value);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO site_secret_values (slug, name, ciphertext, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(slug, name) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       updated_at = excluded.updated_at`,
  )
    .bind(slug, name, ciphertext, now)
    .run();
}

export async function deleteSiteSecret(
  env: Env,
  slug: string,
  name: string,
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `DELETE FROM site_secret_values WHERE slug = ? AND name = ?`,
  )
    .bind(slug, name)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function listSiteSecretNames(
  env: Env,
  slug: string,
): Promise<string[]> {
  await ensureDb(env);
  const rows = await env.DB.prepare(
    `SELECT name FROM site_secret_values WHERE slug = ? ORDER BY name`,
  )
    .bind(slug)
    .all<{ name: string }>();
  return (rows.results || []).map((r) => r.name);
}

export async function getSiteSecretsMap(
  env: Env,
  slug: string,
  names?: string[],
): Promise<Record<string, string>> {
  await ensureDb(env);
  const rows = await env.DB.prepare(
    `SELECT name, ciphertext FROM site_secret_values WHERE slug = ?`,
  )
    .bind(slug)
    .all<{ name: string; ciphertext: string }>();
  const out: Record<string, string> = {};
  const allow = names ? new Set(names) : null;
  for (const row of rows.results || []) {
    if (allow && !allow.has(row.name)) continue;
    out[row.name] = await decryptSecret(env, row.ciphertext);
  }
  return out;
}
