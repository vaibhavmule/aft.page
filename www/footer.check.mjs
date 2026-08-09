/** ponytail: one footer — stern below columns, never above the link grid */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(dir, "footer.js"), "utf8");

if (js.indexOf("footer-cols") > js.indexOf("footer-giant-wrap")) {
  throw new Error("footer.js: stern must sit below the link grid");
}
for (const needle of [
  'href="/docs"',
  'href="/changelog"',
  "data-aft-feedback",
  "footer.site-footer",
  'footer-wordmark">aft<span class="sq"',
]) {
  if (!js.includes(needle)) throw new Error(`footer.js missing ${needle}`);
}

function walk(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

let n = 0;
for (const file of walk(dir)) {
  const html = readFileSync(file, "utf8");
  if (!html.includes('class="site-footer"')) continue;
  n += 1;
  const rel = relative(dir, file);
  const footerAt = html.indexOf('<footer class="site-footer">');
  const giantAt = html.indexOf("footer-giant-wrap");
  if (giantAt < 0 || giantAt < footerAt) {
    throw new Error(`${rel}: giant wrap must be inside site-footer`);
  }
  if ((html.match(/footer-giant-wrap/g) || []).length !== 1) {
    throw new Error(`${rel}: expected one giant wrap`);
  }
  if (!html.includes("footer.js")) {
    throw new Error(`${rel}: missing footer.js`);
  }
  if (!html.includes('href="/docs">Docs</a>')) {
    throw new Error(`${rel}: missing Docs in footer`);
  }
}

if (n < 20) throw new Error(`expected many site-footers, got ${n}`);
console.log(`footer.check: ok (${n} pages)`);
