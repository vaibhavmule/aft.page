/**
 * Wrangler-style CLI login: loopback callback + one-time code exchange.
 */
import type { Env } from "./env";
import {
  parseSessionToken,
  randomToken,
  resolveSessionUser,
  sha256Hex,
} from "./auth";
import { corsHeaders, json, optionsResponse } from "./http";

const CLI_TTL_SEC = 10 * 60;
const CODE_TTL_SEC = 2 * 60;
const STATE_RE = /^[a-zA-Z0-9_-]{8,128}$/;

type CliPending = { port: number; exp: number };
type CliCode = {
  state: string;
  token: string;
  email: string;
  expiresAt: string;
  exp: number;
};

function pendingKey(state: string): string {
  return `auth:cli:pending:${state}`;
}

function codeKey(codeHash: string): string {
  return `auth:cli:code:${codeHash}`;
}

export function isValidCliPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

export function isValidCliState(state: string): boolean {
  return STATE_RE.test(state);
}

export async function handleCliAuthRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const origin = request.headers.get("origin");

  if (url.pathname === "/v1/auth/cli" && request.method === "GET") {
    return cliStart(env, url);
  }
  if (url.pathname === "/v1/auth/cli/complete" && request.method === "GET") {
    return cliComplete(request, env, url);
  }
  if (url.pathname === "/v1/auth/cli/exchange" && request.method === "OPTIONS") {
    return optionsResponse(origin, false);
  }
  if (url.pathname === "/v1/auth/cli/exchange" && request.method === "POST") {
    return cliExchange(request, env, origin);
  }
  return null;
}

async function cliStart(env: Env, url: URL): Promise<Response> {
  const root = env.ROOT_DOMAIN || "aft.page";
  const state = url.searchParams.get("state") || "";
  const port = Number.parseInt(url.searchParams.get("port") || "", 10);

  if (!isValidCliState(state) || !isValidCliPort(port)) {
    return json(
      { error: "invalid_request", hint: "state (8–128) and port (1024–65535) required" },
      400,
    );
  }

  const pending: CliPending = { port, exp: Date.now() + CLI_TTL_SEC * 1000 };
  await env.SITES.put(pendingKey(state), JSON.stringify(pending), {
    expirationTtl: CLI_TTL_SEC,
  });

  const next = new URL(`https://api.${root}/v1/auth/cli/complete`);
  next.searchParams.set("state", state);
  const login = new URL(`https://${root}/login`);
  login.searchParams.set("next", next.toString());
  login.searchParams.set("cli", "1");

  return new Response(null, {
    status: 302,
    headers: { Location: login.toString() },
  });
}

async function cliComplete(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const root = env.ROOT_DOMAIN || "aft.page";
  const state = url.searchParams.get("state") || "";
  if (!isValidCliState(state)) {
    return loginFail(root, "cli_invalid");
  }

  const raw = await env.SITES.get(pendingKey(state));
  if (!raw) return loginFail(root, "cli_expired");
  let pending: CliPending;
  try {
    pending = JSON.parse(raw) as CliPending;
  } catch {
    return loginFail(root, "cli_expired");
  }
  if (!isValidCliPort(pending.port) || pending.exp < Date.now()) {
    await env.SITES.delete(pendingKey(state));
    return loginFail(root, "cli_expired");
  }

  const sessionToken = parseSessionToken(request);
  const user = await resolveSessionUser(env, request);
  if (!sessionToken || !user) {
    const login = new URL(`https://${root}/login`);
    const next = new URL(`https://api.${root}/v1/auth/cli/complete`);
    next.searchParams.set("state", state);
    login.searchParams.set("next", next.toString());
    login.searchParams.set("cli", "1");
    return new Response(null, {
      status: 302,
      headers: { Location: login.toString() },
    });
  }

  const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:session:${sessionToken}`);
  const sess = await env.DB.prepare(
    `SELECT expires_at FROM sessions WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ expires_at: string }>();

  const code = randomToken("aft_cli_");
  const hash = await sha256Hex(`${env.AUTH_SECRET}:cli:${code}`);
  const record: CliCode = {
    state,
    token: sessionToken,
    email: user.email,
    expiresAt: sess?.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    exp: Date.now() + CODE_TTL_SEC * 1000,
  };
  await env.SITES.put(codeKey(hash), JSON.stringify(record), {
    expirationTtl: CODE_TTL_SEC,
  });
  await env.SITES.delete(pendingKey(state));

  const cb = new URL(`http://127.0.0.1:${pending.port}/callback`);
  cb.searchParams.set("code", code);
  cb.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: { Location: cb.toString() },
  });
}

async function cliExchange(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const extra = Object.fromEntries(corsHeaders(origin, false));
  let body: { code?: string; state?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, extra);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "";
  if (!code || !isValidCliState(state)) {
    return json(
      { error: "invalid_request", hint: "code and state required" },
      400,
      extra,
    );
  }

  const hash = await sha256Hex(`${env.AUTH_SECRET}:cli:${code}`);
  const raw = await env.SITES.get(codeKey(hash));
  if (!raw) {
    return json({ error: "invalid_or_expired_code" }, 400, extra);
  }
  await env.SITES.delete(codeKey(hash));

  let record: CliCode;
  try {
    record = JSON.parse(raw) as CliCode;
  } catch {
    return json({ error: "invalid_or_expired_code" }, 400, extra);
  }
  if (record.state !== state || record.exp < Date.now() || !record.token) {
    return json({ error: "invalid_or_expired_code" }, 400, extra);
  }

  return json(
    {
      ok: true,
      token: record.token,
      email: record.email,
      expiresAt: record.expiresAt,
    },
    200,
    extra,
  );
}

function loginFail(root: string, error: string): Response {
  const login = new URL(`https://${root}/login`);
  login.searchParams.set("error", error);
  return new Response(null, {
    status: 302,
    headers: { Location: login.toString() },
  });
}
