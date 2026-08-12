/** Minimal TTY prompts — readline only, no deps. */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ui } from "./ui.js";

export function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function withRl(fn) {
  const rl = readline.createInterface({ input, output });
  try {
    return await fn(rl);
  } finally {
    rl.close();
  }
}

/** Y/n confirm. Default yes when empty. Non-interactive → defaultYes. */
export async function confirm(question, { defaultYes = true } = {}) {
  if (!isInteractive()) return defaultYes;
  const hint = defaultYes ? "Y/n" : "y/N";
  return withRl(async (rl) => {
    const ans = (await rl.question(`${question} [${hint}] `)).trim().toLowerCase();
    if (!ans) return defaultYes;
    return ans === "y" || ans === "yes";
  });
}

/**
 * Numbered select. Returns selected item.
 * @template T
 * @param {string} title
 * @param {T[]} items
 * @param {{ label: (item: T) => string, defaultIndex?: number }} opts
 */
export async function select(title, items, { label, defaultIndex = 0 } = {}) {
  if (!items.length) throw new Error("select: empty items");
  if (!isInteractive()) return items[defaultIndex] ?? items[0];

  return withRl(async (rl) => {
    console.error(ui.bold(title));
    items.forEach((item, i) => {
      const mark = i === defaultIndex ? ui.cyan(">") : " ";
      console.error(`  ${mark} ${i + 1}. ${label(item)}`);
    });
    const raw = (
      await rl.question(
        `Choose [1-${items.length}] (Enter=${defaultIndex + 1}): `,
      )
    ).trim();
    if (!raw) return items[defaultIndex] ?? items[0];
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > items.length) {
      throw new Error(`invalid choice: ${raw}`);
    }
    return items[n - 1];
  });
}
