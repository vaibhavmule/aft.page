import assert from "node:assert/strict";
import { parseAgentTurn, safeRelPath, sanitizeAgentEnv, writePy } from "./tools.ts";

assert.equal(safeRelPath("../etc/passwd"), null);
assert.equal(safeRelPath("/settings.py"), "settings.py");
assert.equal(safeRelPath("settings.py"), "settings.py");
assert.equal(safeRelPath("proj/settings.py"), "proj/settings.py");
assert.equal(safeRelPath("webapp/settings.py"), "webapp/settings.py");

assert.deepEqual(sanitizeAgentEnv({ DATABASE_URL: "sqlite:////tmp/aft-try.db", "bad-key": "x" }), {
  DATABASE_URL: "sqlite:////tmp/aft-try.db",
});

const turn = parseAgentTurn(`{"note":"Using sqlite for try","env":{"DATABASE_URL":"sqlite:////tmp/aft-try.db"},"writes":[{"op":"append","path":"settings.py","text":"\\nALLOWED_HOSTS = ['*']\\n"}]}`);
assert.ok(turn);
assert.equal(turn.note, "Using sqlite for try");
assert.equal(turn.env?.DATABASE_URL, "sqlite:////tmp/aft-try.db");
assert.equal(turn.writes?.[0]?.path, "settings.py");
assert.equal(turn.writes?.[0]?.op, "append");

assert.equal(parseAgentTurn(`{"fail":"needs a real database URL"}`)?.fail, "needs a real database URL");
assert.equal(parseAgentTurn(`{"writes":[{"op":"write","path":"../x","text":"no"}]}`), null);
assert.ok(writePy("/workspace/app", { op: "append", path: "settings.py", text: "x" })?.includes("settings.py"));
assert.equal(writePy("/workspace/app", { op: "write", path: "../x", text: "x" }), null);

const fenced = parseAgentTurn("```json\n{\"note\":\"Set ALLOWED_HOSTS\"}\n```");
assert.equal(fenced?.note, "Set ALLOWED_HOSTS");

console.log("ok");
