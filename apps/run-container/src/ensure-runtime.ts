/** Self-healing runtime installer: ensure language toolchains before plan.install. */
import type { Sandbox } from "@cloudflare/sandbox";

function cmdOut(r: { stdout?: string; stderr?: string }): string {
  return `${r.stderr || ""}\n${r.stdout || ""}`.trim();
}

export async function ensurePythonPip(sandbox: Sandbox): Promise<string | null> {
  const have = await sandbox.exec("python3 -m pip --version");
  if (have.success) return null;
  const ep = await sandbox.exec("python3 -m ensurepip --upgrade");
  if (ep.success) return null;
  const apt = await sandbox.exec(
    "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-pip python3-venv",
  );
  if (apt.success) return null;
  return `Could not install pip. ${cmdOut(have)}\n${cmdOut(ep)}\n${cmdOut(apt)}`.slice(0, 400);
}

export async function ensureRuby(sandbox: Sandbox): Promise<string | null> {
  const have = await sandbox.exec("ruby -v && bundle -v");
  if (have.success) return null;
  const apt = await sandbox.exec(
    "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ruby ruby-dev bundler build-essential libsqlite3-dev libyaml-dev zlib1g-dev",
  );
  if (apt.success) {
    const again = await sandbox.exec("ruby -v && bundle -v");
    if (again.success) return null;
    return `Ruby install incomplete. ${cmdOut(again)}`.slice(0, 400);
  }
  return `Could not install Ruby. ${cmdOut(have)}\n${cmdOut(apt)}`.slice(0, 400);
}

export async function ensureElixir(sandbox: Sandbox): Promise<string | null> {
  const have = await sandbox.exec("elixir -v && mix -v");
  if (have.success) return null;
  const apt = await sandbox.exec(
    "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq elixir erlang-base",
  );
  if (apt.success) {
    const again = await sandbox.exec("elixir -v && mix -v");
    if (again.success) return null;
    return `Elixir install incomplete. ${cmdOut(again)}`.slice(0, 400);
  }
  return `Could not install Elixir. ${cmdOut(have)}\n${cmdOut(apt)}`.slice(0, 400);
}

export async function ensureNode(sandbox: Sandbox): Promise<string | null> {
  const have = await sandbox.exec("node -v && npm -v");
  if (have.success) return null;
  return `Node/npm missing on runner. ${cmdOut(have)}`.slice(0, 400);
}

/** Map plan stack → toolchain ensure. Returns error string or null. */
export async function ensureRuntime(
  sandbox: Sandbox,
  stack: string | undefined,
  installCmd?: string,
): Promise<{ label: string; error: string | null }> {
  const s = (stack || "").toLowerCase();
  const install = installCmd || "";
  if (s === "rails" || s === "sinatra" || s === "hanami" || s === "grape" || /\bbundle\b/.test(install)) {
    return { label: "ruby", error: await ensureRuby(sandbox) };
  }
  if (s === "phoenix" || /\bmix\b/.test(install)) {
    return { label: "elixir", error: await ensureElixir(sandbox) };
  }
  if (
    s === "django" ||
    s === "flask" ||
    s === "fastapi" ||
    /\bpip\b/.test(install) ||
    /\buv sync\b/.test(install)
  ) {
    return { label: "python", error: await ensurePythonPip(sandbox) };
  }
  if (/\bnpm\b/.test(install) || s === "express" || s === "fastify" || s === "hono" || s === "koa") {
    return { label: "node", error: await ensureNode(sandbox) };
  }
  return { label: "none", error: null };
}
