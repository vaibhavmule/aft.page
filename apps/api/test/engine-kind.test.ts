import { describe, expect, it } from "vitest";
import {
  detectEngine,
  engineKindFromSignals,
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
    kind: "vite",
    stack: "Vite",
  },
  {
    name: "SSR Next",
    signals: { pkg: { dependencies: { next: "15" } } },
    kind: "next",
    stack: "Next.js",
  },
  {
    name: "Next static export is CSR-shaped",
    signals: {
      pkg: { dependencies: { next: "15" } },
      nextConfigText: "export default { output: 'export' }",
    },
    kind: "vite",
    stack: "Next.js export",
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

  it("refuses next source on engine with OpenNext copy", () => {
    const r = sourceTreeRefuse(
      {
        paths: ["package.json"],
        pkgRaw: JSON.stringify({ dependencies: { next: "15.0.0" } }),
      },
      "engine",
    );
    expect(r?.error).toBe("needs_next_build");
    expect(r?.reason).toMatch(/OpenNext/);
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
