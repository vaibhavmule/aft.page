import { describe, expect, it } from "vitest";
import {
  buildPlanFromSignals,
  detectEngine,
  engineKindFromSignals,
  mergeUiApiPlan,
  normalizePlanRoot,
  sourceTreeRefuse,
} from "../src/engine-kind";

const cases: Array<{
  name: string;
  signals: Parameters<typeof detectEngine>[0];
  kind: string;
  stack: string;
}> = [
  {
    name: "CSR Vite",
    signals: { pkg: { devDependencies: { vite: "5" } }, hasIndexHtml: true },
    kind: "static_build",
    stack: "Vite",
  },
  {
    name: "SSR Next",
    signals: { pkg: { dependencies: { next: "15" } } },
    kind: "next",
    stack: "Next.js",
  },
  {
    name: "Next static export is static_build",
    signals: {
      pkg: { dependencies: { next: "15" } },
      nextConfigText: "export default { output: 'export' }",
    },
    kind: "static_build",
    stack: "Next.js export",
  },
  {
    name: "Dockerfile beats package.json",
    signals: {
      hasDockerfile: true,
      pkg: { dependencies: { next: "15" } },
      hasIndexHtml: true,
    },
    kind: "container",
    stack: "Docker",
  },
  {
    name: "compose.yaml beats Vite",
    signals: {
      hasCompose: true,
      pkg: { devDependencies: { vite: "5" } },
    },
    kind: "container",
    stack: "Docker",
  },
  {
    name: "package.json Next beats Django manage.py",
    signals: {
      pkg: { dependencies: { next: "15" } },
      hasManagePy: true,
    },
    kind: "next",
    stack: "Next.js",
  },
  {
    name: "uv.lock + Flask is container",
    signals: {
      hasUvLock: true,
      requirementsTxt: "flask>=3.0\n",
    },
    kind: "container",
    stack: "Flask",
  },
  {
    name: "Python Django",
    signals: { hasManagePy: true },
    kind: "container",
    stack: "Django",
  },
  {
    name: "Python Flask",
    signals: { requirementsTxt: "flask>=3.0\n" },
    kind: "container",
    stack: "Flask",
  },
  {
    name: "Python FastAPI",
    signals: { requirementsTxt: "fastapi==0.115.0\n" },
    kind: "container",
    stack: "FastAPI",
  },
  {
    name: "Rust Axum",
    signals: { cargoToml: "[dependencies]\naxum = \"0.7\"\n" },
    kind: "container",
    stack: "Axum",
  },
  {
    name: "Ruby Rails",
    signals: { gemfile: "gem 'rails', '~> 7.1'\n" },
    kind: "container",
    stack: "Rails",
  },
  {
    name: "Go Gin",
    signals: { goMod: "module x\nrequire github.com/gin-gonic/gin v1.9.0\n" },
    kind: "container",
    stack: "Gin",
  },
  {
    name: "Go net/http",
    signals: {
      goMainText: 'package main\nimport "net/http"\nfunc main() { http.ListenAndServe(":8080", nil) }\n',
    },
    kind: "container",
    stack: "Go",
  },
  {
    name: "Node Express",
    signals: { pkg: { dependencies: { express: "4" } }, hasIndexHtml: true },
    kind: "container",
    stack: "Express",
  },
  {
    name: "Phoenix mix.exs",
    signals: { hasMixExs: true },
    kind: "container",
    stack: "Phoenix",
  },
  {
    name: "Next + Prisma is still Next",
    signals: { pkg: { dependencies: { next: "15", "@prisma/client": "5" } } },
    kind: "next",
    stack: "Next.js",
  },
  {
    name: "just Prisma",
    signals: { pkg: { dependencies: { "@prisma/client": "5" } } },
    kind: "not_a_site",
    stack: "Prisma",
  },
  {
    name: "just Redis (node)",
    signals: { pkg: { dependencies: { ioredis: "5" } } },
    kind: "not_a_site",
    stack: "Redis",
  },
  {
    name: "just Celery",
    signals: { requirementsTxt: "celery[redis]==5.4.0\n" },
    kind: "not_a_site",
    stack: "Celery",
  },
  {
    name: "just Postgres (python)",
    signals: { requirementsTxt: "psycopg2-binary==2.9.9\n" },
    kind: "not_a_site",
    stack: "Postgres",
  },
  {
    name: "Django + Celery is Django",
    signals: { hasManagePy: true, requirementsTxt: "Django>=5\ncelery==5\n" },
    kind: "container",
    stack: "Django",
  },
  {
    name: "static html",
    signals: { hasIndexHtml: true },
    kind: "static",
    stack: "static",
  },
];

describe("detectEngine", () => {
  it.each(cases)("$name", ({ signals, kind, stack }) => {
    const got = detectEngine(signals);
    expect(got).toEqual({ kind, stack });
    expect(engineKindFromSignals(signals)).toBe(kind);
  });
});

describe("buildPlanFromSignals", () => {
  it("fills install/build/outputDirs for Vite static_build", () => {
    const plan = buildPlanFromSignals({
      pkg: { scripts: { build: "vite build" }, devDependencies: { vite: "5" } },
      hasIndexHtml: true,
    });
    expect(plan.runtime).toBe("static_build");
    expect(plan.stack).toBe("Vite");
    expect(plan.install).toMatch(/npm install/);
    expect(plan.build).toBe("npm run build");
    expect(plan.outputDirs).toEqual(["dist", "out", "build"]);
  });

  it("OpenNext build for next runtime", () => {
    const plan = buildPlanFromSignals({ pkg: { dependencies: { next: "15" } } });
    expect(plan.runtime).toBe("next");
    expect(plan.build).toBe("next build");
  });

  it("Docker container plan has start via docker run", () => {
    const plan = buildPlanFromSignals({ hasDockerfile: true });
    expect(plan.runtime).toBe("container");
    expect(plan.stack).toBe("Docker");
    expect(plan.start).toMatch(/docker run/);
  });

  it("uv sync when uv.lock present for Python web", () => {
    const plan = buildPlanFromSignals({
      hasUvLock: true,
      requirementsTxt: "fastapi==0.115.0\n",
    });
    expect(plan.runtime).toBe("container");
    expect(plan.install).toBe("uv sync");
    expect(plan.start).toMatch(/python3 -m uvicorn/);
    expect(plan.port).toBe(8080);
  });

  it("Express plan has npm start and port", () => {
    const plan = buildPlanFromSignals({
      pkg: {
        scripts: { start: "node server.js" },
        dependencies: { express: "4.21.0" },
      },
    });
    expect(plan.runtime).toBe("container");
    expect(plan.stack).toBe("Express");
    expect(plan.start).toBe("npm start");
    expect(plan.port).toBe(8080);
    expect(plan.install).toMatch(/npm install/);
  });

  it("Express with server.js and no start script uses node server.js", () => {
    const plan = buildPlanFromSignals({
      pkg: { dependencies: { express: "4" } },
      hasServerJs: true,
    });
    expect(plan.start).toBe("node server.js");
  });

  it("Django plan uses python3 pip, migrate, and runserver", () => {
    const plan = buildPlanFromSignals({
      hasManagePy: true,
      requirementsTxt: "Django>=5\n",
    });
    expect(plan.runtime).toBe("container");
    expect(plan.install).toBe("python3 -m pip install -r requirements.txt");
    expect(plan.build).toBe("python3 manage.py migrate --noinput");
    expect(plan.start).toBe("python3 manage.py runserver 0.0.0.0:8080");
  });

  it("Phoenix plan uses mix deps.get and phx.server", () => {
    const plan = buildPlanFromSignals({ hasMixExs: true });
    expect(plan.runtime).toBe("container");
    expect(plan.stack).toBe("Phoenix");
    expect(plan.install).toBe("mix local.hex --force && mix local.rebar --force && mix deps.get");
    expect(plan.start).toBe("mix phx.server");
    expect(plan.port).toBe(8080);
  });

  it("Rails plan uses bundle install and rails server", () => {
    const plan = buildPlanFromSignals({
      gemfile: "gem 'rails', '~> 7.1'\ngem 'sqlite3'\n",
    });
    expect(plan.runtime).toBe("container");
    expect(plan.stack).toBe("Rails");
    expect(plan.install).toBe("bundle install");
    expect(plan.start).toBe("bundle exec rails server -b 0.0.0.0 -p 8080");
    expect(plan.port).toBe(8080);
  });

  it("Phoenix without Dockerfile is not a Docker plan", () => {
    const plan = buildPlanFromSignals({ hasMixExs: true });
    expect(plan.stack).toBe("Phoenix");
    expect(plan.build).toBeUndefined();
    expect(plan.start).not.toMatch(/docker/i);
  });

  it("Flask plan has flask run and port", () => {
    const plan = buildPlanFromSignals({
      requirementsTxt: "flask==3.0.0\n",
    });
    expect(plan.runtime).toBe("container");
    expect(plan.stack).toBe("Flask");
    expect(plan.install).toBe("python3 -m pip install -r requirements.txt");
    expect(plan.start).toMatch(/python3 -m flask run/);
    expect(plan.port).toBe(8080);
  });
});

describe("mergeUiApiPlan", () => {
  it("pairs one Vite UI with one Express API", () => {
    const plan = mergeUiApiPlan([
      {
        path: "frontend",
        kind: "static_build",
        stack: "Vite",
        plan: {
          runtime: "static_build",
          stack: "Vite",
          install: "npm install --legacy-peer-deps",
          build: "npm run build",
          outputDirs: ["dist"],
          root: "frontend",
        },
      },
      {
        path: "backend",
        kind: "container",
        stack: "Express",
        plan: {
          runtime: "container",
          stack: "Express",
          install: "npm install --legacy-peer-deps",
          start: "node server.js",
          port: 8080,
          root: "backend",
        },
      },
    ]);
    expect(plan).toBeTruthy();
    expect(plan?.runtime).toBe("container");
    expect(plan?.root).toBe("backend");
    expect(plan?.frontendRoot).toBe("frontend");
    expect(plan?.frontendBuild).toBe("npm run build");
    expect(plan?.start).toBe("node server.js");
    expect(plan?.stack).toBe("Vite + Express");
  });

  it("leaves two UIs to the picker", () => {
    const plan = mergeUiApiPlan([
      {
        path: "frontend",
        kind: "static_build",
        stack: "Vite",
        plan: { runtime: "static_build", stack: "Vite", root: "frontend" },
      },
      {
        path: "web",
        kind: "static",
        stack: "static",
        plan: { runtime: "static", stack: "static", root: "web" },
      },
    ]);
    expect(plan).toBeNull();
  });
});

describe("normalizePlanRoot", () => {
  it("treats empty as repo root", () => {
    expect(normalizePlanRoot("")).toBe("");
    expect(normalizePlanRoot(null)).toBe("");
  });

  it("accepts frontend and nested paths", () => {
    expect(normalizePlanRoot("frontend")).toBe("frontend");
    expect(normalizePlanRoot("/client/web/")).toBe("client/web");
  });

  it("rejects traversal", () => {
    expect(normalizePlanRoot("../etc")).toBeNull();
    expect(normalizePlanRoot("frontend/../../x")).toBeNull();
  });
});

describe("sourceTreeRefuse", () => {
  it("refuses next source on drop with static-only copy", () => {
    const r = sourceTreeRefuse(
      {
        paths: ["package.json", "app/page.tsx"],
        pkgRaw: JSON.stringify({ dependencies: { next: "15.0.0" } }),
      },
      "drop",
    );
    expect(r?.error).toBe("needs_next_build");
    expect(r?.reason).toMatch(/Drop is static/);
  });

  it("refuses next source on engine", () => {
    const r = sourceTreeRefuse(
      {
        paths: ["package.json"],
        pkgRaw: JSON.stringify({ dependencies: { next: "15.0.0" } }),
      },
      "engine",
    );
    expect(r?.error).toBe("needs_next_build");
    expect(r?.reason).toMatch(/aft deploy|GitHub repo/i);
  });

  it("refuses Express even when index.html is present", () => {
    const r = sourceTreeRefuse(
      {
        paths: ["package.json", "index.html"],
        pkgRaw: JSON.stringify({ dependencies: { express: "4.0.0" } }),
      },
      "engine",
    );
    expect(r?.error).toBe("needs_container");
    expect(r?.reason).toMatch(/Express/);
  });

  it("refuses Dockerfile as needs_container", () => {
    expect(
      sourceTreeRefuse(
        {
          paths: ["Dockerfile", "package.json"],
          pkgRaw: JSON.stringify({ dependencies: { next: "15" } }),
        },
        "engine",
      )?.error,
    ).toBe("needs_container");
  });

  it("refuses Celery as not a site", () => {
    expect(
      sourceTreeRefuse(
        { paths: ["requirements.txt"], requirementsTxt: "celery==5.4.0\n" },
        "engine",
      )?.error,
    ).toBe("not_a_site");
  });

  it("allows built dist", () => {
    expect(
      sourceTreeRefuse({
        paths: ["package.json", "dist/index.html", "index.html"],
        pkgRaw: JSON.stringify({ devDependencies: { vite: "5.0.0" } }),
      }),
    ).toBeNull();
  });

  it("allows next mapping on engine, refuses on drop", () => {
    const mapping = {
      paths: ["index.html", "aft.json"],
      aftRaw: JSON.stringify({
        runtime: "next",
        upstream: "https://aft-u-x.workers.dev",
      }),
    };
    expect(sourceTreeRefuse(mapping, "engine")).toBeNull();
    expect(sourceTreeRefuse(mapping, "drop")?.error).toBe("not_static");
  });
});
