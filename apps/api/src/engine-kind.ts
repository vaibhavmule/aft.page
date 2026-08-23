/** One detect → kind. CLI, MCP, and GitHub Run share the engine. Web Drop is static-only. */
export type EngineKind =
  | "static"
  | "vite"
  | "next"
  | "container"
  | "not_a_site"
  | "unknown";

export type PkgJson = {
  name?: string;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

export type EngineSignals = {
  pkg?: unknown;
  nextConfigText?: string | null;
  hasViteConfig?: boolean;
  hasManagePy?: boolean;
  requirementsTxt?: string | null;
  pyprojectToml?: string | null;
  cargoToml?: string | null;
  gemfile?: string | null;
  goMod?: string | null;
  goMainText?: string | null;
  hasIndexHtml?: boolean;
};

export type EngineDetect = { kind: EngineKind; stack: string };

type Named = readonly [string, string];

const NODE_WEB: Named[] = [
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["koa", "Koa"],
  ["hono", "Hono"],
  ["@nestjs/core", "NestJS"],
  ["@hapi/hapi", "Hapi"],
  ["restify", "Restify"],
];
const NODE_QUEUE: Named[] = [
  ["bullmq", "BullMQ"],
  ["bull", "Bull"],
  ["bee-queue", "Bee-Queue"],
  ["agenda", "Agenda"],
];
const NODE_REDIS: Named[] = [
  ["ioredis", "Redis"],
  ["redis", "Redis"],
];
const NODE_DB: Named[] = [
  ["@prisma/client", "Prisma"],
  ["prisma", "Prisma"],
  ["pg", "Postgres"],
  ["postgres", "Postgres"],
  ["mysql2", "MySQL"],
  ["mongoose", "MongoDB"],
  ["mongodb", "MongoDB"],
  ["better-sqlite3", "SQLite"],
  ["sqlite3", "SQLite"],
  ["drizzle-orm", "Drizzle"],
];

const PIP_WEB: Named[] = [
  ["django", "Django"],
  ["flask", "Flask"],
  ["fastapi", "FastAPI"],
  ["starlette", "Starlette"],
  ["tornado", "Tornado"],
  ["quart", "Quart"],
  ["sanic", "Sanic"],
];
const PIP_QUEUE: Named[] = [
  ["celery", "Celery"],
  ["rq", "RQ"],
  ["dramatiq", "Dramatiq"],
];
const PIP_REDIS: Named[] = [
  ["redis", "Redis"],
  ["hiredis", "Redis"],
];
const PIP_DB: Named[] = [
  ["psycopg2", "Postgres"],
  ["psycopg", "Postgres"],
  ["psycopg2-binary", "Postgres"],
  ["asyncpg", "Postgres"],
  ["sqlalchemy", "SQLAlchemy"],
];

const CARGO_WEB: Named[] = [
  ["axum", "Axum"],
  ["actix-web", "Actix"],
  ["rocket", "Rocket"],
  ["warp", "Warp"],
  ["tide", "Tide"],
];
const CARGO_INFRA: Named[] = [
  ["sqlx", "SQLx"],
  ["diesel", "Diesel"],
  ["redis", "Redis"],
  ["sea-orm", "SeaORM"],
];

const GEM_WEB: Named[] = [
  ["rails", "Rails"],
  ["sinatra", "Sinatra"],
  ["hanami", "Hanami"],
  ["grape", "Grape"],
];
const GEM_QUEUE: Named[] = [
  ["sidekiq", "Sidekiq"],
  ["resque", "Resque"],
  ["delayed_job", "Delayed Job"],
];
const GEM_INFRA: Named[] = [
  ["pg", "Postgres"],
  ["mysql2", "MySQL"],
  ["redis", "Redis"],
  ["redis-client", "Redis"],
];

const GO_WEB: Named[] = [
  ["github.com/gin-gonic/gin", "Gin"],
  ["github.com/labstack/echo", "Echo"],
  ["github.com/gofiber/fiber", "Fiber"],
  ["github.com/go-chi/chi", "Chi"],
  ["github.com/gorilla/mux", "Gorilla"],
];
const GO_INFRA: Named[] = [
  ["github.com/lib/pq", "Postgres"],
  ["github.com/jackc/pgx", "Postgres"],
  ["github.com/go-sql-driver/mysql", "MySQL"],
  ["github.com/redis/go-redis", "Redis"],
  ["github.com/go-redis/redis", "Redis"],
];

export function pkgHasDep(pkg: PkgJson | null | undefined, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export function packageHasNext(pkg: unknown): boolean {
  if (!pkg || typeof pkg !== "object") return false;
  return pkgHasDep(pkg as PkgJson, "next");
}

export function packageHasVite(pkg: unknown): boolean {
  if (!pkg || typeof pkg !== "object") return false;
  const p = pkg as PkgJson;
  return (
    pkgHasDep(p, "vite") ||
    pkgHasDep(p, "@vitejs/plugin-react") ||
    pkgHasDep(p, "@vitejs/plugin-vue")
  );
}

export function requirementsLookLikeDjango(text: string): boolean {
  return pipHas(text, "django");
}

export function nextConfigIsStaticExport(text: string): boolean {
  return /output\s*:\s*['"]export['"]/.test(text);
}

function pipHas(text: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${esc}([><=!]|\\s|$|\\[)`, "im").test(text);
}

function tomlDep(text: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s"'\\[])${esc}(\\s*=|[><=!"'\\]])`, "im").test(text);
}

function gemHas(text: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`gem\\s+['"]${esc}['"]`, "i").test(text);
}

function firstNamed(items: Named[], has: (name: string) => boolean): string | null {
  for (const [name, label] of items) {
    if (has(name)) return label;
  }
  return null;
}

function pipText(s: EngineSignals): string {
  return [s.requirementsTxt, s.pyprojectToml].filter(Boolean).join("\n");
}

function pkgFirst(pkg: PkgJson | undefined, items: Named[]): string | null {
  if (!pkg) return null;
  return firstNamed(items, (n) => pkgHasDep(pkg, n));
}

/** Classify a repo from the same files CLI, MCP, and GitHub Run look at. */
export function detectEngine(s: EngineSignals): EngineDetect {
  const pkg = s.pkg && typeof s.pkg === "object" ? (s.pkg as PkgJson) : undefined;
  const pip = pipText(s);

  if (s.hasManagePy) return { kind: "container", stack: "Django" };
  const pyWeb = firstNamed(PIP_WEB, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyWeb) return { kind: "container", stack: pyWeb };

  const gemWeb = s.gemfile ? firstNamed(GEM_WEB, (n) => gemHas(s.gemfile!, n)) : null;
  if (gemWeb) return { kind: "container", stack: gemWeb };

  const rsWeb = s.cargoToml
    ? firstNamed(CARGO_WEB, (n) => tomlDep(s.cargoToml!, n))
    : null;
  if (rsWeb) return { kind: "container", stack: rsWeb };

  const goWeb = s.goMod ? firstNamed(GO_WEB, (n) => s.goMod!.includes(n)) : null;
  if (goWeb) return { kind: "container", stack: goWeb };
  if (s.goMainText && /net\/http/.test(s.goMainText) && /ListenAndServe|http\.Server/.test(s.goMainText)) {
    return { kind: "container", stack: "Go" };
  }

  if (packageHasNext(pkg)) {
    if (s.nextConfigText && nextConfigIsStaticExport(s.nextConfigText)) {
      return { kind: "vite", stack: "Next.js export" };
    }
    return { kind: "next", stack: "Next.js" };
  }

  if (
    packageHasVite(pkg) ||
    s.hasViteConfig ||
    (pkg && (pkgHasDep(pkg, "react-scripts") || pkgHasDep(pkg, "@rsbuild/core")))
  ) {
    return { kind: "vite", stack: "Vite" };
  }

  const nodeWeb = pkgFirst(pkg, NODE_WEB);
  if (nodeWeb) return { kind: "container", stack: nodeWeb };

  if (pkg && pkg.scripts?.build && (pkgHasDep(pkg, "react") || pkgHasDep(pkg, "vue"))) {
    return { kind: "vite", stack: pkgHasDep(pkg, "vue") ? "Vue" : "React" };
  }

  const pyQueue = firstNamed(PIP_QUEUE, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyQueue) return { kind: "not_a_site", stack: pyQueue };
  const pyRedis = firstNamed(PIP_REDIS, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyRedis) return { kind: "not_a_site", stack: pyRedis };
  const pyDb = firstNamed(PIP_DB, (n) => pipHas(pip, n) || tomlDep(pip, n));
  if (pyDb) return { kind: "not_a_site", stack: pyDb };

  if (s.gemfile) {
    const gemQ = firstNamed(GEM_QUEUE, (n) => gemHas(s.gemfile!, n));
    if (gemQ) return { kind: "not_a_site", stack: gemQ };
    const gemI = firstNamed(GEM_INFRA, (n) => gemHas(s.gemfile!, n));
    if (gemI) return { kind: "not_a_site", stack: gemI };
  }
  if (s.cargoToml) {
    const rsI = firstNamed(CARGO_INFRA, (n) => tomlDep(s.cargoToml!, n));
    if (rsI) return { kind: "not_a_site", stack: rsI };
  }
  if (s.goMod) {
    const goI = firstNamed(GO_INFRA, (n) => s.goMod!.includes(n));
    if (goI) return { kind: "not_a_site", stack: goI };
  }

  const nodeQ = pkgFirst(pkg, NODE_QUEUE);
  if (nodeQ) return { kind: "not_a_site", stack: nodeQ };
  const nodeR = pkgFirst(pkg, NODE_REDIS);
  if (nodeR) return { kind: "not_a_site", stack: nodeR };
  const nodeD = pkgFirst(pkg, NODE_DB);
  if (nodeD) return { kind: "not_a_site", stack: nodeD };

  if (s.hasIndexHtml) return { kind: "static", stack: "static" };
  return { kind: "unknown", stack: "unknown" };
}

export function engineKindFromSignals(s: EngineSignals): EngineKind {
  return detectEngine(s).kind;
}

function normPath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/");
}

function refuseCopy(
  door: "drop" | "engine",
  kind: EngineKind,
  stack: string,
): { error: string; reason: string } {
  if (kind === "container") {
    return {
      error: "needs_container",
      reason: `${stack} needs a container runner that is not shipped. Detect ok; build failed.`,
    };
  }
  if (kind === "not_a_site") {
    return {
      error: "not_a_site",
      reason: `${stack} is not a website (database, cache, or queue). Nothing to host.`,
    };
  }
  if (kind === "next") {
    return {
      error: "needs_next_build",
      reason:
        door === "drop"
          ? "Drop is static files only. Next.js: aft deploy or paste the public GitHub repo."
          : "Next.js SSR — aft deploy (OpenNext) or paste the public GitHub repo.",
    };
  }
  return {
    error: "needs_build",
    reason:
      door === "drop"
        ? "Drop is static files only. Build, then drop dist/, or paste the public GitHub repo."
        : "CSR/Vite — run npm run build, then deploy dist/, or paste the public GitHub repo.",
  };
}

/** Refuse source trees. Drop copy vs engine copy. Mapping sites (CLI/GHA) pass on the engine door. */
export function sourceTreeRefuse(
  input: {
    paths: string[];
    pkgRaw?: string | null;
    requirementsTxt?: string | null;
    pyprojectToml?: string | null;
    cargoToml?: string | null;
    gemfile?: string | null;
    goMod?: string | null;
    goMainText?: string | null;
    aftRaw?: string | null;
  },
  door: "drop" | "engine" = "drop",
): { error: string; reason: string } | null {
  const paths = input.paths.map(normPath);
  const has = (p: string) => paths.includes(p);

  if (input.aftRaw) {
    try {
      const aft = JSON.parse(input.aftRaw) as { runtime?: string; upstream?: string };
      if (
        (aft.runtime === "next" || aft.runtime === "worker") &&
        typeof aft.upstream === "string" &&
        aft.upstream
      ) {
        if (door === "drop") {
          return {
            error: "not_static",
            reason: "Drop is static files only.",
          };
        }
        return null;
      }
    } catch {
      /* ignore */
    }
  }

  let pkg: unknown;
  if (input.pkgRaw) {
    try {
      pkg = JSON.parse(input.pkgRaw);
    } catch {
      pkg = null;
    }
  }

  const got = detectEngine({
    pkg,
    hasIndexHtml: has("index.html"),
    hasManagePy: has("manage.py"),
    requirementsTxt: input.requirementsTxt,
    pyprojectToml: input.pyprojectToml,
    cargoToml: input.cargoToml,
    gemfile: input.gemfile,
    goMod: input.goMod,
    goMainText: input.goMainText,
    hasViteConfig: paths.some((p) => /^vite\.config\.(js|ts|mjs)$/.test(p.split("/").pop() || "")),
  });

  if (got.kind === "container" || got.kind === "not_a_site") {
    return refuseCopy(door, got.kind, got.stack);
  }
  if (got.kind === "next" && !has(".open-next/worker.js") && !has("out/index.html")) {
    return refuseCopy(door, "next", got.stack);
  }
  if (
    got.kind === "vite" &&
    !has("dist/index.html") &&
    !has("out/index.html") &&
    !has("build/index.html")
  ) {
    return refuseCopy(door, "vite", got.stack);
  }
  return null;
}
