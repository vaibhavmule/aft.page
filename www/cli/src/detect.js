/** Detect static / Vite / Next / CRA from package.json + configs. No deps. */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

/** @typedef {"static"|"vite"|"create-react-app"|"next-static"|"next-ssr"|"worker"|"unknown"} FrameworkId */

/**
 * @typedef {object} DetectedProject
 * @property {FrameworkId} framework
 * @property {string} label
 * @property {string} outDir
 * @property {string|null} buildScript
 * @property {"static"|"next"|"worker"} runtime
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
    note: "Needs upstream Worker URL in aft.json (see docs).",
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

function hasDep(pkg, name) {
  return Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
}

function hasScript(pkg, name) {
  return Boolean(pkg?.scripts?.[name]);
}

function choiceById(id) {
  return FRAMEWORK_CHOICES.find((c) => c.id === id);
}

/** @returns {Promise<DetectedProject>} */
export async function detectProject(cwd) {
  const hasIndex = await exists(join(cwd, "index.html"));
  const pkg = await readPkg(cwd);

  if (hasIndex && !pkg) {
    return { ...choiceById("static"), framework: "static" };
  }

  if (!pkg) {
    if (hasIndex) return { ...choiceById("static"), framework: "static" };
    return {
      framework: "unknown",
      label: "Unknown",
      outDir: "dist",
      buildScript: null,
      runtime: "static",
      staticDeployable: false,
      note: "No package.json or index.html found.",
    };
  }

  if (hasDep(pkg, "next")) {
    let outputExport = false;
    for (const f of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
      if (!(await exists(join(cwd, f)))) continue;
      const text = await readFile(join(cwd, f), "utf8");
      if (/output\s*:\s*['"]export['"]/.test(text)) {
        outputExport = true;
        break;
      }
    }
    if (outputExport) {
      return {
        ...choiceById("next-static"),
        framework: "next-static",
        buildScript: hasScript(pkg, "build") ? "build" : null,
        note: "Detected output: 'export'.",
      };
    }
    return {
      ...choiceById("next-ssr"),
      framework: "next-ssr",
      buildScript: hasScript(pkg, "build") ? "build" : null,
    };
  }

  if (
    hasDep(pkg, "vite") ||
    (await exists(join(cwd, "vite.config.ts"))) ||
    (await exists(join(cwd, "vite.config.js"))) ||
    (await exists(join(cwd, "vite.config.mjs")))
  ) {
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

  if (hasDep(pkg, "react-scripts") || hasDep(pkg, "@rsbuild/core")) {
    return {
      ...choiceById("create-react-app"),
      framework: "create-react-app",
      label: hasDep(pkg, "@rsbuild/core") ? "React (Rsbuild)" : "Create React App",
      buildScript: hasScript(pkg, "build") ? "build" : null,
    };
  }

  if (hasDep(pkg, "react") && hasScript(pkg, "build")) {
    const outDir = (await exists(join(cwd, "build")))
      ? "build"
      : (await exists(join(cwd, "dist")))
        ? "dist"
        : "build";
    return {
      ...choiceById("create-react-app"),
      framework: "create-react-app",
      label: "React",
      outDir,
      buildScript: "build",
    };
  }

  if (hasDep(pkg, "vue") && hasScript(pkg, "build")) {
    return {
      ...choiceById("vite"),
      framework: "vite",
      label: "Vue",
      buildScript: "build",
    };
  }

  if (hasScript(pkg, "build")) {
    const outDir = (await exists(join(cwd, "dist")))
      ? "dist"
      : (await exists(join(cwd, "build")))
        ? "build"
        : "dist";
    return {
      framework: "unknown",
      label: "Node app (has build script)",
      outDir,
      buildScript: "build",
      runtime: "static",
      staticDeployable: true,
      note: "Will use build output folder when present.",
    };
  }

  if (hasIndex) {
    return { ...choiceById("static"), framework: "static" };
  }

  return {
    framework: "unknown",
    label: "Unknown",
    outDir: "dist",
    buildScript: null,
    runtime: "static",
    staticDeployable: false,
    note: "Could not detect a static frontend.",
  };
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
