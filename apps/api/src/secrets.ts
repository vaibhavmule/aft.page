/**
 * Per-site encrypted secrets vault (AES-GCM via AUTH_SECRET).
 */
import type { Env } from "./env";
import { ensureDb } from "./db";

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Vault format version.
 *
 * Stored ciphertext is `"<version>:<base64(iv || ciphertext)>"`. Values written
 * before versioning have no prefix and are read as v1, so nothing needs
 * rewriting. The prefix is what makes rotation possible at all: add a v2
 * derivation, write new secrets as v2, and keep reading v1 until the old rows
 * are re-encrypted. Without it, changing AUTH_SECRET silently destroys every
 * stored tenant secret.
 */
export const VAULT_VERSION = "v1";

/** Per-version KDF salt. Add an entry rather than editing one in place. */
const VAULT_SALT: Record<string, string> = {
  v1: "aft.page/site-secrets/v1",
};

/** Split `"v1:<b64>"`; an unprefixed legacy value reads as v1. */
export function parseVaultValue(stored: string): {
  version: string;
  b64: string;
} {
  const at = stored.indexOf(":");
  if (at > 0) {
    const version = stored.slice(0, at);
    if (VAULT_SALT[version]) return { version, b64: stored.slice(at + 1) };
  }
  return { version: "v1", b64: stored };
}

async function deriveKey(env: Env, version: string): Promise<CryptoKey> {
  const salt = VAULT_SALT[version];
  if (!salt) throw new Error(`unknown vault version: ${version}`);
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
      salt: enc.encode(salt),
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
  const key = await deriveKey(env, VAULT_VERSION);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return `${VAULT_VERSION}:${btoa(String.fromCharCode(...packed))}`;
}

export async function decryptSecret(env: Env, stored: string): Promise<string> {
  const { version, b64 } = parseVaultValue(stored);
  const key = await deriveKey(env, version);
  const packed = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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
