/** Detect → engine kind + build plan. Keep in sync with apps/api/src/engine-kind.ts. No deps. */
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
 * @property {BuildPlan} [plan]
 */

/**
 * @typedef {object} BuildPlan
 * @property {"static"|"static_build"|"next"|"container"|"not_a_site"|"unknown"} runtime
 * @property {string} stack
 * @property {string} [install]
 * @property {string} [build]
 * @property {string[]} [outputDirs]
 * @property {string} [start]
 * @property {number} [port]
 * @property {string} [reason]
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
    label: "Next.js",
    outDir: ".",
    buildScript: null,
    runtime: "next",
    staticDeployable: false,
  },
  {
    id: "django",
    label: "Django / container",
    outDir: ".",
    buildScript: null,
    runtime: "container",
    staticDeployable: false,
    note: "Paste the public GitHub repo on aft.page/run.",
  },
  {
    id: "container",
    label: "Server / container",
    outDir: ".",
    buildScript: null,
    runtime: "container",
    staticDeployable: false,
    note: "Paste the public GitHub repo on aft.page/run.",
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
    label: "Custom server",
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

function staticBuildStack(pkg, s) {
  if (hasDep(pkg, "next") && s.nextConfigText && /output\s*:\s*['"]export['"]/.test(s.nextConfigText)) {
    return "Next.js export";
  }
  if (hasDep(pkg, "@angular/core")) return "Angular";
  if (hasDep(pkg, "vue")) return "Vue";
  if (hasDep(pkg, "vite") || s.hasViteConfig) return "Vite";
  if (hasDep(pkg, "react-scripts")) return "Create React App";
  if (hasDep(pkg, "@rsbuild/core")) return "Rsbuild";
  if (hasDep(pkg, "react")) return "React";
  return "static_build";
}

function staticOutputDirs(stack) {
  if (stack === "Create React App") return ["build", "dist", "out"];
  if (stack === "Next.js export") return ["out", "dist", "build"];
  return ["dist", "out", "build"];
}

/** Same order as api/src/engine-kind.ts detectEngine. */
export function detectFromSignals(s) {
  if (s.hasDockerfile || s.hasCompose) {
    return { kind: "container", stack: "Docker" };
  }

  const pkg = s.pkg;
  const pip = [s.requirementsTxt, s.pyprojectToml].filter(Boolean).join("\n");
  const hasPython =
    Boolean(s.hasManagePy) ||
    Boolean(s.requirementsTxt) ||
    Boolean(s.pyprojectToml) ||
    Boolean(s.hasUvLock) ||
    Boolean(s.pyprojectToml && /\[tool\.uv\]/.test(s.pyprojectToml));

  if (hasDep(pkg, "next")) {
    if (s.nextConfigText && /output\s*:\s*['"]export['"]/.test(s.nextConfigText)) {
      return { kind: "static_build", stack: "Next.js export" };
    }
    return { kind: "next", stack: "Next.js" };
  }

  if (
    hasDep(pkg, "vite") ||
    hasDep(pkg, "@vitejs/plugin-react") ||
    s.hasViteConfig ||
    hasDep(pkg, "react-scripts") ||
    hasDep(pkg, "@rsbuild/core") ||
    (hasDep(pkg, "@angular/core") && hasScript(pkg, "build"))
  ) {
    return { kind: "static_build", stack: staticBuildStack(pkg, s) };
  }

  const nodeWeb = firstNamed(NODE_WEB, (n) => hasDep(pkg, n));
  if (nodeWeb) return { kind: "container", stack: nodeWeb };

  if (hasScript(pkg, "build") && (hasDep(pkg, "react") || hasDep(pkg, "vue"))) {
    return { kind: "static_build", stack: hasDep(pkg, "vue") ? "Vue" : "React" };
  }

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

  if (hasPython) {
    const pyQueue = firstNamed(PIP_QUEUE, (n) => pipHas(pip, n) || tomlDep(pip, n));
    if (pyQueue) return { kind: "not_a_site", stack: pyQueue };
    const pyRedis = firstNamed(PIP_REDIS, (n) => pipHas(pip, n) || tomlDep(pip, n));
    if (pyRedis) return { kind: "not_a_site", stack: pyRedis };
    const pyDb = firstNamed(PIP_DB, (n) => pipHas(pip, n) || tomlDep(pip, n));
    if (pyDb) return { kind: "not_a_site", stack: pyDb };
  }

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

/** @param {Parameters<typeof detectFromSignals>[0]} s */
export function buildPlanFromSignals(s) {
  const got = detectFromSignals(s);
  const pkg = s.pkg;

  if (got.kind === "static") return { runtime: "static", stack: got.stack };
  if (got.kind === "static_build") {
    return {
      runtime: "static_build",
      stack: got.stack,
      install: "npm install --legacy-peer-deps",
      build: "npm run build",
      outputDirs: staticOutputDirs(got.stack),
    };
  }
  if (got.kind === "next") {
    return {
      runtime: "next",
      stack: got.stack,
      install: "npm install --legacy-peer-deps",
      build: "next build",
    };
  }
  if (got.kind === "container") {
    const port = 8080;
    const pkg = s.pkg;
    let start;
    if (got.stack === "Docker") {
      start = "docker run --rm -p 8080:8080 aft-run";
    } else if (pkg?.scripts?.start) {
      start = "npm start";
    } else if (got.stack === "Django" || s.hasManagePy) {
      start = "python manage.py runserver 0.0.0.0:8080";
    } else if (got.stack === "Flask") {
      start = "flask run --host 0.0.0.0 --port 8080";
    } else if (got.stack === "FastAPI") {
      start = "uvicorn main:app --host 0.0.0.0 --port 8080";
    } else if (pkg?.scripts?.dev) {
      start = "npm run dev -- --host 0.0.0.0 --port 8080";
    }
    const install =
      got.stack === "Docker"
        ? undefined
        : pkg && (pkg.dependencies || pkg.devDependencies || pkg.scripts)
          ? "npm install --legacy-peer-deps"
          : s.hasUvLock
            ? "uv sync"
            : s.requirementsTxt
              ? "pip install -r requirements.txt"
              : s.pyprojectToml
                ? "pip install ."
                : undefined;
    return {
      runtime: "container",
      stack: got.stack,
      install,
      start,
      port,
      ...(got.stack === "Docker"
        ? {
            build: "docker build -t aft-run .",
            reason: "Dockerfile detected — use aft.page/run for Node/Python first; Docker images next.",
          }
        : {
            reason: `${got.stack} — paste the public GitHub repo on aft.page/run (local CLI upload is static/Next only).`,
          }),
    };
  }
  if (got.kind === "not_a_site") {
    return {
      runtime: "not_a_site",
      stack: got.stack,
      reason: `${got.stack} is not a website (database, cache, or queue). Nothing to host.`,
    };
  }
  return { runtime: "unknown", stack: got.stack, reason: "Could not detect a shippable site." };
}

function projectFromEngine(got, pkg, plan) {
  if (got.kind === "static") {
    return { ...choiceById("static"), framework: "static", plan };
  }
  if (got.kind === "next") {
    return {
      ...choiceById("next-ssr"),
      framework: "next-ssr",
      buildScript: hasScript(pkg, "build") ? "build" : null,
      plan,
    };
  }
  if (got.kind === "static_build" || got.kind === "vite") {
    if (got.stack === "Next.js export") {
      return {
        ...choiceById("next-static"),
        framework: "next-static",
        buildScript: hasScript(pkg, "build") ? "build" : null,
        note: "Detected output: 'export'.",
        plan,
      };
    }
    if (got.stack === "Create React App" || got.stack === "React") {
      return {
        ...choiceById("create-react-app"),
        framework: "create-react-app",
        label: got.stack === "React" ? "React" : "CRA / Rsbuild",
        buildScript: "build",
        outDir: plan?.outputDirs?.[0] || "build",
        plan,
      };
    }
    const label = hasDep(pkg, "vue")
      ? "Vue (Vite)"
      : hasDep(pkg, "react")
        ? "React (Vite)"
        : got.stack || "Vite";
    return {
      ...choiceById("vite"),
      framework: "vite",
      label,
      buildScript: hasScript(pkg, "build") ? "build" : null,
      outDir: plan?.outputDirs?.[0] || "dist",
      plan,
    };
  }
  if (got.kind === "container") {
    if (got.stack === "Django") {
      return { ...choiceById("django"), framework: "django", plan };
    }
    return {
      ...choiceById("container"),
      framework: "container",
      label: got.stack,
      note: plan?.reason || `${got.stack} — paste the public GitHub repo on aft.page/run.`,
      plan,
    };
  }
  if (got.kind === "not_a_site") {
    return {
      ...choiceById("not-a-site"),
      framework: "not-a-site",
      label: got.stack,
      note: plan?.reason || `${got.stack} is not a website (database, cache, or queue).`,
      plan,
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
    plan,
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
  const signals = {
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
    hasDockerfile: await exists(join(cwd, "Dockerfile")),
    hasCompose:
      (await exists(join(cwd, "docker-compose.yml"))) ||
      (await exists(join(cwd, "docker-compose.yaml"))) ||
      (await exists(join(cwd, "compose.yml"))) ||
      (await exists(join(cwd, "compose.yaml"))),
    hasUvLock: await exists(join(cwd, "uv.lock")),
  };
  const got = detectFromSignals(signals);
  const plan = buildPlanFromSignals(signals);
  return projectFromEngine(got, pkg, plan);
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
    plan: detected?.plan,
  };
}
