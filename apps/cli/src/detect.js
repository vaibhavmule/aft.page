/** Detect → engine kind. Keep in sync with apps/api/src/engine-kind.ts. No deps. */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

/** @typedef {"static"|"vite"|"create-react-app"|"next-static"|"next-ssr"|"worker"|"django"|"container"|"not-a-site"|"unknown"} FrameworkId */

/**
 * @typedef {object} DetectedProject
 * @property {FrameworkId} framework
 * @property {string} label
 * @property {string} outDir
 * @property {string|null} buildScript
 * @property {"static"|"next"|"worker"|"container"|"not_a_site"} runtime
 * @property {boolean} staticDeployable
 * @property {string} [note]
 */

export const FRAMEWORK_CHOICES = [
  {
    id: "static",
    label: "Static HTML",
    outDir: ".",
    buildScript: null,
    runtime: "static",
    staticDeployable: true,
  },
  {
    id: "vite",
    label: "Vite / React / Vue",
    outDir: "dist",
    buildScript: "build",
    runtime: "static",
    staticDeployable: true,
  },
  {
    id: "create-react-app",
    label: "CRA / Rsbuild",
    outDir: "build",
    buildScript: "build",
    runtime: "static",
    staticDeployable: true,
  },
  {
    id: "next-static",
    label: "Next.js (static export)",
    outDir: "out",
    buildScript: "build",
    runtime: "static",
    staticDeployable: true,
  },
  {
    id: "next-ssr",
    label: "Next.js (SSR / upstream)",
    outDir: ".",
    buildScript: null,
    runtime: "next",
    staticDeployable: false,
    note: "OpenNext build, then an aft.page URL.",
  },
  {
    id: "django",
    label: "Django / container",
    outDir: ".",
    buildScript: null,
    runtime: "container",
    staticDeployable: false,
    note: "Container runner not shipped. Detect succeeds; build fails honestly.",
  },
  {
    id: "container",
    label: "Server / container",
    outDir: ".",
    buildScript: null,
    runtime: "container",
    staticDeployable: false,
    note: "Container runner not shipped. Detect succeeds; build fails honestly.",
  },
  {
    id: "not-a-site",
    label: "Not a site",
    outDir: ".",
    buildScript: null,
    runtime: "not_a_site",
    staticDeployable: false,
    note: "Database, cache, or queue — not a website.",
  },
  {
    id: "worker",
    label: "Worker + upstream",
    outDir: ".",
    buildScript: null,
    runtime: "worker",
    staticDeployable: false,
    note: "Needs upstream in aft.json.",
  },
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPkg(cwd) {
  try {
    return JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

async function readText(cwd, name) {
  try {
    return await readFile(join(cwd, name), "utf8");
  } catch {
    return null;
  }
}

function hasDep(pkg, name) {
  return Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
}

function hasScript(pkg, name) {
  return Boolean(pkg?.scripts?.[name]);
}

function choiceById(id) {
  return FRAMEWORK_CHOICES.find((c) => c.id === id);
}

function pipHas(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${esc}([><=!]|\\s|$|\\[)`, "im").test(text);
}

function tomlDep(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s"'\\[])${esc}(\\s*=|[><=!"'\\]])`, "im").test(text);
}

function gemHas(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`gem\\s+['"]${esc}['"]`, "i").test(text);
}

function firstNamed(items, has) {
  for (const [name, label] of items) {
    if (has(name)) return label;
  }
  return null;
}

const NODE_WEB = [
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["koa", "Koa"],
  ["hono", "Hono"],
  ["@nestjs/core", "NestJS"],
];
const NODE_QUEUE = [
  ["bullmq", "BullMQ"],
  ["bull", "Bull"],
];
const NODE_REDIS = [
  ["ioredis", "Redis"],
  ["redis", "Redis"],
];
const NODE_DB = [
  ["@prisma/client", "Prisma"],
  ["pg", "Postgres"],
  ["mongoose", "MongoDB"],
  ["better-sqlite3", "SQLite"],
];
const PIP_WEB = [
  ["django", "Django"],
  ["flask", "Flask"],
  ["fastapi", "FastAPI"],
];
const PIP_QUEUE = [
  ["celery", "Celery"],
  ["rq", "RQ"],
];
const PIP_REDIS = [["redis", "Redis"]];
const PIP_DB = [
  ["psycopg2", "Postgres"],
  ["sqlalchemy", "SQLAlchemy"],
];
const CARGO_WEB = [
  ["axum", "Axum"],
  ["actix-web", "Actix"],
  ["rocket", "Rocket"],
];
const GEM_WEB = [
  ["rails", "Rails"],
  ["sinatra", "Sinatra"],
];
const GEM_QUEUE = [["sidekiq", "Sidekiq"]];
const GO_WEB = [
  ["github.com/gin-gonic/gin", "Gin"],
  ["github.com/labstack/echo", "Echo"],
  ["github.com/gofiber/fiber", "Fiber"],
];
const GO_INFRA = [
  ["github.com/lib/pq", "Postgres"],
  ["github.com/redis/go-redis", "Redis"],
];

/** Same order as api/src/engine-kind.ts detectEngine. */
export function detectFromSignals(s) {
  const pkg = s.pkg;
  const pip = [s.requirementsTxt, s.pyprojectToml].filter(Boolean).join("\n");

  if (s.hasManagePy) return { kind: "container", stack: "Django" };
  const pyWeb = firstNamed(PIP_WEB, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyWeb) return { kind: "container", stack: pyWeb };

  const gemWeb = s.gemfile ? firstNamed(GEM_WEB, (n) => gemHas(s.gemfile, n)) : null;
  if (gemWeb) return { kind: "container", stack: gemWeb };

  const rsWeb = s.cargoToml
    ? firstNamed(CARGO_WEB, (n) => tomlDep(s.cargoToml, n))
    : null;
  if (rsWeb) return { kind: "container", stack: rsWeb };

  const goWeb = s.goMod ? firstNamed(GO_WEB, (n) => s.goMod.includes(n)) : null;
  if (goWeb) return { kind: "container", stack: goWeb };
  if (
    s.goMainText &&
    /net\/http/.test(s.goMainText) &&
    /ListenAndServe|http\.Server/.test(s.goMainText)
  ) {
    return { kind: "container", stack: "Go" };
  }

  if (hasDep(pkg, "next")) {
    if (s.nextConfigText && /output\s*:\s*['"]export['"]/.test(s.nextConfigText)) {
      return { kind: "vite", stack: "Next.js export" };
    }
    return { kind: "next", stack: "Next.js" };
  }

  if (
    hasDep(pkg, "vite") ||
    hasDep(pkg, "@vitejs/plugin-react") ||
    s.hasViteConfig ||
    hasDep(pkg, "react-scripts") ||
    hasDep(pkg, "@rsbuild/core")
  ) {
    return { kind: "vite", stack: "Vite" };
  }

  const nodeWeb = firstNamed(NODE_WEB, (n) => hasDep(pkg, n));
  if (nodeWeb) return { kind: "container", stack: nodeWeb };

  if (hasScript(pkg, "build") && (hasDep(pkg, "react") || hasDep(pkg, "vue"))) {
    return { kind: "vite", stack: hasDep(pkg, "vue") ? "Vue" : "React" };
  }

  const pyQueue = firstNamed(PIP_QUEUE, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyQueue) return { kind: "not_a_site", stack: pyQueue };
  const pyRedis = firstNamed(PIP_REDIS, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyRedis) return { kind: "not_a_site", stack: pyRedis };
  const pyDb = firstNamed(PIP_DB, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyDb) return { kind: "not_a_site", stack: pyDb };

  if (s.gemfile) {
    const gemQ = firstNamed(GEM_QUEUE, (n) => gemHas(s.gemfile, n));
    if (gemQ) return { kind: "not_a_site", stack: gemQ };
  }
  if (s.goMod) {
    const goI = firstNamed(GO_INFRA, (n) => s.goMod.includes(n));
    if (goI) return { kind: "not_a_site", stack: goI };
  }

  const nodeQ = firstNamed(NODE_QUEUE, (n) => hasDep(pkg, n));
  if (nodeQ) return { kind: "not_a_site", stack: nodeQ };
  const nodeR = firstNamed(NODE_REDIS, (n) => hasDep(pkg, n));
  if (nodeR) return { kind: "not_a_site", stack: nodeR };
  const nodeD = firstNamed(NODE_DB, (n) => hasDep(pkg, n));
  if (nodeD) return { kind: "not_a_site", stack: nodeD };

  if (s.hasIndexHtml) return { kind: "static", stack: "static" };
  return { kind: "unknown", stack: "unknown" };
}

function projectFromEngine(got, pkg) {
  if (got.kind === "static") {
    return { ...choiceById("static"), framework: "static" };
  }
  if (got.kind === "next") {
    return {
      ...choiceById("next-ssr"),
      framework: "next-ssr",
      buildScript: hasScript(pkg, "build") ? "build" : null,
    };
  }
  if (got.kind === "vite") {
    if (got.stack === "Next.js export") {
      return {
        ...choiceById("next-static"),
        framework: "next-static",
        buildScript: hasScript(pkg, "build") ? "build" : null,
        note: "Detected output: 'export'.",
      };
    }
    if (got.stack === "React") {
      return {
        ...choiceById("create-react-app"),
        framework: "create-react-app",
        label: "React",
        buildScript: "build",
      };
    }
    const label = hasDep(pkg, "vue")
      ? "Vue (Vite)"
      : hasDep(pkg, "react")
        ? "React (Vite)"
        : "Vite";
    return {
      ...choiceById("vite"),
      framework: "vite",
      label,
      buildScript: hasScript(pkg, "build") ? "build" : null,
    };
  }
  if (got.kind === "container") {
    if (got.stack === "Django") {
      return { ...choiceById("django"), framework: "django" };
    }
    return {
      ...choiceById("container"),
      framework: "container",
      label: got.stack,
      note: `${got.stack} — container runner not shipped. Detect ok; build failed.`,
    };
  }
  if (got.kind === "not_a_site") {
    return {
      ...choiceById("not-a-site"),
      framework: "not-a-site",
      label: got.stack,
      note: `${got.stack} is not a website (database, cache, or queue).`,
    };
  }
  return {
    framework: "unknown",
    label: "Unknown",
    outDir: "dist",
    buildScript: null,
    runtime: "static",
    staticDeployable: false,
    note: "Could not detect a site aft can host.",
  };
}

/** @returns {Promise<DetectedProject>} */
export async function detectProject(cwd) {
  const hasIndex = await exists(join(cwd, "index.html"));
  const pkg = await readPkg(cwd);
  let nextConfigText = null;
  for (const f of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    nextConfigText = await readText(cwd, f);
    if (nextConfigText) break;
  }
  const got = detectFromSignals({
    pkg,
    nextConfigText,
    hasViteConfig:
      (await exists(join(cwd, "vite.config.ts"))) ||
      (await exists(join(cwd, "vite.config.js"))) ||
      (await exists(join(cwd, "vite.config.mjs"))),
    hasManagePy: await exists(join(cwd, "manage.py")),
    requirementsTxt: await readText(cwd, "requirements.txt"),
    pyprojectToml: await readText(cwd, "pyproject.toml"),
    cargoToml: await readText(cwd, "Cargo.toml"),
    gemfile: await readText(cwd, "Gemfile"),
    goMod: await readText(cwd, "go.mod"),
    goMainText: await readText(cwd, "main.go"),
    hasIndexHtml: hasIndex,
  });
  return projectFromEngine(got, pkg);
}

/** Map a menu choice id → DetectedProject shape. */
export function projectFromChoice(id, detected) {
  const base = choiceById(id) || choiceById("static");
  return {
    ...base,
    framework: id,
    buildScript:
      detected?.buildScript && base.buildScript !== null
        ? detected.buildScript
        : base.buildScript,
    outDir: id === detected?.framework ? detected.outDir : base.outDir,
    label: id === detected?.framework ? detected.label : base.label,
    note: base.note || detected?.note,
  };
}
