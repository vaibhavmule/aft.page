/** Thin fetch helpers for api.aft.page. */
import { loadCredentials } from "./creds.js";

export const DEFAULT_API = "https://api.aft.page";

export function apiBase() {
  return (process.env.AFT_API || DEFAULT_API).replace(/\/$/, "");
}

export async function apiFetch(path, opts = {}) {
  const headers = {
    "x-aft-client": "cli",
    ...(opts.headers || {}),
  };
  const token =
    "token" in opts
      ? opts.token
      : (process.env.AFT_TOKEN ?? (await loadCredentials())?.token);
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.json != null) {
    headers["content-type"] = "application/json";
  }
  return fetch(`${apiBase()}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.json != null ? JSON.stringify(opts.json) : opts.body,
  });
}

export async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
