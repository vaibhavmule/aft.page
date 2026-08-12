/** Terminal styling — no deps, quiet when not a TTY. */
const outTty = process.stdout.isTTY;
const errTty = process.stderr.isTTY;

function wrap(enabled, code, s) {
  return enabled ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const ui = {
  bold: (s) => wrap(outTty, "1", s),
  dim: (s) => wrap(outTty, "2", s),
  green: (s) => wrap(outTty, "32", s),
  cyan: (s) => wrap(outTty, "36", s),
  yellow: (s) => wrap(outTty, "33", s),
  red: (s) => wrap(outTty, "31", s),
  ebold: (s) => wrap(errTty, "1", s),
  edim: (s) => wrap(errTty, "2", s),
  egreen: (s) => wrap(errTty, "32", s),
  eyellow: (s) => wrap(errTty, "33", s),
  ered: (s) => wrap(errTty, "31", s),
};

export function say(msg) {
  console.error(msg);
}

export function ok(msg) {
  console.error(`${ui.egreen("✓")} ${msg}`);
}

export function fail(msg) {
  console.error(`${ui.ered("✗")} ${msg}`);
}

export function note(msg) {
  console.error(ui.edim(msg));
}
