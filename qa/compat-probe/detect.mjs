/**
 * Guess static-deployable framework from GitHub contents (no fs).
 * Slim copy of apps/cli/src/detect.js + skip reasons. Do not refactor the CLI.
 *
 * ponytail: no monorepos, no dummy .env, no SSR/upstream. Upgrade: workspace
 * root detect, sveltekit adapter parse, Next output export without reading config.
 */

export const MAX_REPO_KB = 4000;
export const MAX_STARS = 5000;
export const MIN_STARS = 10;

const VITE_CONFIGS = ["vite.config.ts", "vite.config.js", "vite.config.mjs"];
const NEXT_CONFIGS = ["next.config.js", "next.config.mjs", "next.config.ts"];
const ASTRO_CONFIGS = ["astro.config.mjs", "astro.config.ts", "astro.config.js"];

export function probeSlug(n) {
  return `test--fw-${n}`;
}

function hasDep(pkg, name) {
  return Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
}

function hasScript(pkg, name) {
  return Boolean(pkg?.scripts?.[name]);
}

function hasFile(files, name) {
  return files.includes(name);
}

/**
 * @param {{ pkg?: object|null, files?: string[], configTexts?: Record<string, string> }} manifest
 */
export function detectFromManifest({ pkg = null, files = [], configTexts = {} } = {}) {
  const hasIndex = hasFile(files, "index.html");
  const workspaces = Boolean(
    pkg?.workspaces ||
      hasFile(files, "pnpm-workspace.yaml") ||
      hasFile(files, "pnpm-workspace.yml") ||
      hasFile(files, "lerna.json"),
  );
  if (workspaces) {
    return {
      framework: "unknown",
      label: "Monorepo",
      outDir: "dist",
      buildScript: null,
      staticDeployable: false,
      needsBuild: false,
      skip: "monorepo",
    };
  }

  if (!pkg) {
    if (hasIndex) {
      return {
        framework: "static",
        label: "Static HTML",
        outDir: ".",
        buildScript: null,
        staticDeployable: true,
        needsBuild: false,
      };
    }
    return {
      framework: "unknown",
      label: "Unknown",
      outDir: "dist",
      buildScript: null,
      staticDeployable: false,
      needsBuild: false,
      skip: "no_package_and_no_index",
    };
  }

  if (hasDep(pkg, "next")) {
    const nextCfg = NEXT_CONFIGS.map((f) => configTexts[f] || "").join("\n");
    const outputExport = /output\s*:\s*['"]export['"]/.test(nextCfg);
    if (outputExport) {
      return {
        framework: "next-static",
        label: "Next.js (static export)",
        outDir: "out",
        buildScript: hasScript(pkg, "build") ? "build" : null,
        staticDeployable: true,
        needsBuild: true,
      };
    }
    return {
      framework: "next-ssr",
      label: "Next.js (SSR)",
      outDir: ".",
      buildScript: hasScript(pkg, "build") ? "build" : null,
      staticDeployable: false,
      needsBuild: false,
      skip: "next_ssr",
    };
  }

  if (hasDep(pkg, "astro") || ASTRO_CONFIGS.some((f) => hasFile(files, f))) {
    return {
      framework: "astro",
      label: "Astro",
      outDir: "dist",
      buildScript: hasScript(pkg, "build") ? "build" : null,
      staticDeployable: true,
      needsBuild: true,
    };
  }

  if (hasDep(pkg, "@sveltejs/kit")) {
    if (!hasDep(pkg, "@sveltejs/adapter-static")) {
      return {
        framework: "sveltekit",
        label: "SvelteKit (SSR)",
        outDir: "build",
        buildScript: hasScript(pkg, "build") ? "build" : null,
        staticDeployable: false,
        needsBuild: false,
        skip: "sveltekit_ssr",
      };
    }
    return {
      framework: "sveltekit",
      label: "SvelteKit (static)",
      outDir: "build",
      buildScript: hasScript(pkg, "build") ? "build" : null,
      staticDeployable: true,
      needsBuild: true,
    };
  }

  if (
    hasDep(pkg, "vite") ||
    VITE_CONFIGS.some((f) => hasFile(files, f)) ||
    hasDep(pkg, "svelte")
  ) {
    const label = hasDep(pkg, "vue")
      ? "Vue (Vite)"
      : hasDep(pkg, "react")
        ? "React (Vite)"
        : hasDep(pkg, "svelte")
          ? "Svelte (Vite)"
          : "Vite";
    return {
      framework: "vite",
      label,
      outDir: "dist",
      buildScript: hasScript(pkg, "build") ? "build" : null,
      staticDeployable: true,
      needsBuild: true,
    };
  }

  if (hasDep(pkg, "react-scripts") || hasDep(pkg, "@rsbuild/core")) {
    return {
      framework: "create-react-app",
      label: hasDep(pkg, "@rsbuild/core") ? "React (Rsbuild)" : "Create React App",
      outDir: "build",
      buildScript: hasScript(pkg, "build") ? "build" : null,
      staticDeployable: true,
      needsBuild: true,
    };
  }

  if ((hasDep(pkg, "react") || hasDep(pkg, "vue")) && hasScript(pkg, "build")) {
    return {
      framework: hasDep(pkg, "vue") ? "vite" : "create-react-app",
      label: hasDep(pkg, "vue") ? "Vue" : "React",
      outDir: "dist",
      buildScript: "build",
      staticDeployable: true,
      needsBuild: true,
    };
  }

  if (hasScript(pkg, "build")) {
    return {
      framework: "unknown",
      label: "Node app (has build script)",
      outDir: "dist",
      buildScript: "build",
      staticDeployable: true,
      needsBuild: true,
    };
  }

  if (hasIndex) {
    return {
      framework: "static",
      label: "Static HTML",
      outDir: ".",
      buildScript: null,
      staticDeployable: true,
      needsBuild: false,
    };
  }

  return {
    framework: "unknown",
    label: "Unknown",
    outDir: "dist",
    buildScript: null,
    staticDeployable: false,
    needsBuild: false,
    skip: "not_static",
  };
}

/**
 * @param {{ size?: number, stargazers_count?: number }} repo
 * @param {ReturnType<typeof detectFromManifest>|null} detected
 */
export function skipReason(repo, detected) {
  const size = Number(repo?.size) || 0;
  const stars = Number(repo?.stargazers_count) || 0;
  if (size > MAX_REPO_KB) return "too_large";
  if (stars > MAX_STARS) return "mega_repo";
  if (stars > 0 && stars < MIN_STARS) return "too_obscure";
  if (!detected) return "no_package_and_no_index";
  if (detected.skip) return detected.skip;
  if (!detected.staticDeployable) {
    return detected.framework === "next-ssr" ? "next_ssr" : "not_static";
  }
  if (detected.needsBuild && !detected.buildScript) return "no_build_script";
  return null;
}

export const SEARCH_BUCKETS = [
  { id: "next", q: "topic:nextjs stars:20..2000 size:<4000" },
  { id: "vite", q: "topic:vite stars:20..2000 size:<4000" },
  { id: "astro", q: "topic:astro stars:20..2000 size:<4000" },
  { id: "vue", q: "topic:vue vite stars:20..2000 size:<4000" },
  { id: "svelte", q: "topic:svelte stars:20..2000 size:<4000" },
];
