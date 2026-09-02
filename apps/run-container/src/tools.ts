/** Dumb sandbox tools. Agent decides URI/hosts; we only allowlist paths. */

export type AgentWrite = {
  op: "write" | "append";
  path: string;
  text: string;
};

export type AgentTurn = {
  fail?: string;
  note?: string;
  env?: Record<string, string>;
  writes?: AgentWrite[];
};

const MAX_WRITES = 8;
const MAX_TEXT = 32_768;

export function safeRelPath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.length > 200 || p.includes("..") || p.startsWith(".")) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(p)) return null;
  return p;
}

export function sanitizeAgentEnv(
  raw: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof value !== "string" || value.length > 8192) continue;
    out[key] = value;
  }
  return out;
}

export function parseAgentTurn(text: string): AgentTurn | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const turn: AgentTurn = {};
  if (typeof o.fail === "string" && o.fail.trim()) {
    turn.fail = o.fail.trim().slice(0, 400);
    return turn;
  }
  if (typeof o.note === "string") turn.note = o.note.trim().slice(0, 200);
  if (o.env && typeof o.env === "object" && !Array.isArray(o.env)) {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.env as Record<string, unknown>)) {
      if (typeof v === "string") env[k] = v;
    }
    turn.env = sanitizeAgentEnv(env);
  }
  if (Array.isArray(o.writes)) {
    const writes: AgentWrite[] = [];
    for (const item of o.writes.slice(0, MAX_WRITES)) {
      if (!item || typeof item !== "object") continue;
      const w = item as Record<string, unknown>;
      const path = safeRelPath(typeof w.path === "string" ? w.path : "");
      const op = w.op === "append" ? "append" : w.op === "write" ? "write" : null;
      const t = typeof w.text === "string" ? w.text : "";
      if (!path || !op || t.length > MAX_TEXT) continue;
      writes.push({ op, path, text: t });
    }
    if (writes.length) turn.writes = writes;
  }
  if (!turn.note && !turn.env && !turn.writes) return null;
  return turn;
}

export function writePy(appRoot: string, write: AgentWrite): string | null {
  const rel = safeRelPath(write.path);
  if (!rel) return null;
  return `from pathlib import Path
root = Path(${JSON.stringify(appRoot)}).resolve()
rel = ${JSON.stringify(rel)}
op = ${JSON.stringify(write.op)}
text = ${JSON.stringify(write.text)}
p = (root / rel).resolve()
if p != root and not str(p).startswith(str(root) + "/"):
    raise SystemExit("path escape")
p.parent.mkdir(parents=True, exist_ok=True)
if op == "append" and p.is_file():
    p.write_text(p.read_text(encoding="utf-8") + text, encoding="utf-8")
else:
    p.write_text(text, encoding="utf-8")
`;
}
