const API = "https://api.aft.page/v1/deploy";

// Mirror the Worker's limits so bad uploads fail here with a clear message.
const MAX_FILES = 500;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "mail",
  "ftp",
  "cdn",
  "static",
  "admin",
  "dashboard",
  "status",
  "ops",
  "docs",
  "login",
  "mcp",
  "drop",
  "cname",
  "aft",
  "aft-page",
  "ai",
  "cron",
  "job",
  "jobs",
  "schedule",
  "schedules",
  "automation",
  "automations",
  "brief",
  "plugin",
  "plugins",
  "claim",
  "auth",
  "preview",
  "blog",
  "help",
  "support",
]);

const waitlistForm = document.getElementById("waitlist-form");
const waitlistEmail = document.getElementById("waitlist-email");
const waitlistCompany = document.getElementById("waitlist-company");
const waitlistSubmit = document.getElementById("waitlist-submit");
const waitlistStatus = document.getElementById("waitlist-status");

function setWaitlistStatus(text, kind) {
  if (!waitlistStatus) return;
  waitlistStatus.textContent = text;
  waitlistStatus.dataset.kind = kind || "";
}

waitlistForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = waitlistEmail.value.trim();
  if (!waitlistEmail.checkValidity()) {
    setWaitlistStatus("Enter a valid email address.", "error");
    waitlistEmail.focus();
    return;
  }

  waitlistSubmit.disabled = true;
  waitlistForm.setAttribute("aria-busy", "true");
  setWaitlistStatus("Joining…", "pending");

  try {
    const response = await fetch("https://api.aft.page/v1/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, company: waitlistCompany.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWaitlistStatus(
        data.message || "We couldn’t add you right now. Please try again.",
        "error",
      );
      return;
    }
    waitlistEmail.value = "";
    setWaitlistStatus(data.message || "You’re on the list.", "ok");
  } catch {
    setWaitlistStatus("Network error. Please try again.", "error");
  } finally {
    waitlistSubmit.disabled = false;
    waitlistForm.removeAttribute("aria-busy");
  }
});

const form = document.getElementById("paste-form");
const input = document.getElementById("html-input");
const submit = document.getElementById("paste-submit");
const statusEl = document.getElementById("paste-status");
const result = document.getElementById("paste-result");
const urlEl = document.getElementById("paste-url");
const drop = document.getElementById("paste-drop");
const fileInput = document.getElementById("file-input");
const folderInput = document.getElementById("folder-input");
const fileList = document.getElementById("file-list");
const dropTitle = document.getElementById("paste-drop-title");
const dropIdle = document.getElementById("drop-idle");
const dropBusy = document.getElementById("drop-busy");
const dropAgain = document.getElementById("drop-again");
const agentCopy = document.getElementById("agent-copy");
const autoDeploy = document.body?.dataset.aftDropAuto === "1";

/** Files staged for upload, keyed by the path they'll get on the site. */
let staged = [];
let publishing = false;

function setStatus(text, kind) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.kind = kind || "";
}

function showDropPanel(which) {
  if (dropIdle) dropIdle.hidden = which !== "idle";
  if (dropBusy) dropBusy.hidden = which !== "busy";
  if (result) result.hidden = which !== "result";
}

function slugFromHtml(html) {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
  const raw = (title || h1 || "").toLowerCase();
  if (!raw) return undefined;
  const slug = raw
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!slug || slug.length < 2) return undefined;
  if (RESERVED_SLUGS.has(slug)) {
    return undefined;
  }
  return slug;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Strip the dropped folder's own name so index.html lands at the site root. */
function relativePath(file) {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join("/") : parts[0] || file.name;
}

function renderFiles() {
  if (!fileList) return;
  fileList.textContent = "";
  fileList.hidden = staged.length === 0;
  for (const entry of staged) {
    const li = document.createElement("li");
    li.textContent = entry.path;
    const size = document.createElement("span");
    size.textContent = formatBytes(entry.file.size);
    li.append(size);
    fileList.append(li);
  }
}

function validateAndStage(entries) {
  if (entries.length > MAX_FILES) {
    if (autoDeploy) showDropPanel("busy");
    setStatus(`Too many files — ${MAX_FILES} max.`, "error");
    return false;
  }
  const oversized = entries.find((e) => e.file.size > MAX_FILE_BYTES);
  if (oversized) {
    if (autoDeploy) showDropPanel("busy");
    setStatus(
      `${oversized.path} is over ${formatBytes(MAX_FILE_BYTES)}.`,
      "error",
    );
    return false;
  }
  const total = entries.reduce((n, e) => n + e.file.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    if (autoDeploy) showDropPanel("busy");
    setStatus(`Total upload is over ${formatBytes(MAX_TOTAL_BYTES)}.`, "error");
    return false;
  }
  if (!entries.some((e) => /^index\.html?$/i.test(e.path))) {
    if (autoDeploy) showDropPanel("busy");
    setStatus("Include an index.html so the site has a homepage.", "error");
    return false;
  }
  staged = entries;
  renderFiles();
  setStatus(
    `${staged.length} file${staged.length === 1 ? "" : "s"} ready.`,
    "ok",
  );
  return true;
}

/** Strip a single top-level folder from zip paths (CF Drop–style). */
function normalizeZipPaths(paths) {
  const parts = paths.map((p) => p.split("/").filter(Boolean));
  if (parts.length === 0) return paths;
  const top = parts[0][0];
  if (
    top &&
    parts.every((p) => p[0] === top) &&
    parts.some((p) => p.length > 1)
  ) {
    return parts.map((p) => p.slice(1).join("/"));
  }
  return paths;
}

let unzipFn = null;
async function loadUnzip() {
  if (unzipFn) return unzipFn;
  const mod = await import("https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js");
  unzipFn = mod.unzip;
  return unzipFn;
}

async function entriesFromZip(file) {
  const unzip = await loadUnzip();
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise((resolve, reject) => {
    unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });
  const rawPaths = Object.keys(files).filter(
    (p) => !p.endsWith("/") && !p.split("/").pop().startsWith("."),
  );
  const norm = normalizeZipPaths(rawPaths);
  const entries = [];
  for (let i = 0; i < rawPaths.length; i++) {
    const path = norm[i];
    if (!path) continue;
    const bytes = files[rawPaths[i]];
    const blob = new Blob([bytes]);
    const name = path.split("/").pop() || path;
    entries.push({
      path,
      file: new File([blob], name, { type: "application/octet-stream" }),
    });
  }
  return entries;
}

async function stageFiles(list) {
  const picked = Array.from(list).filter((f) => f.size > 0);
  if (picked.length === 0) return;

  if (autoDeploy) showDropPanel("busy");

  const zips = picked.filter((f) => /\.zip$/i.test(f.name));
  if (zips.length > 1) {
    setStatus("Drop one zip at a time.", "error");
    return;
  }
  if (zips.length === 1 && picked.length > 1) {
    setStatus("Drop either a zip or a folder — not both.", "error");
    return;
  }

  let entries;
  if (zips.length === 1) {
    setStatus("Unpacking zip…", "pending");
    try {
      entries = await entriesFromZip(zips[0]);
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "Could not read zip.",
        "error",
      );
      return;
    }
  } else {
    entries = picked.map((file) => ({ path: relativePath(file), file }));
  }

  // A lone page can be named anything — the site still needs an index.
  if (entries.length === 1 && /\.html?$/i.test(entries[0].path)) {
    entries[0].path = "index.html";
  }

  if (!validateAndStage(entries)) return;
  if (autoDeploy) await publish();
}

fileInput?.addEventListener("change", () => {
  stageFiles(fileInput.files);
  fileInput.value = "";
});
folderInput?.addEventListener("change", () => {
  stageFiles(folderInput.files);
  folderInput.value = "";
});

drop?.addEventListener("click", (e) => {
  const browse = e.target.closest?.("[data-browse]");
  if (!browse) return;
  e.preventDefault();
  e.stopPropagation();
  if (browse.dataset.browse === "folder") folderInput?.click();
  else if (browse.dataset.browse === "zip" || browse.dataset.browse === "files") {
    fileInput?.click();
  }
});

for (const type of ["dragenter", "dragover"]) {
  drop?.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add("is-dragging");
  });
}
for (const type of ["dragleave", "drop"]) {
  drop?.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.remove("is-dragging");
  });
}
drop?.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) stageFiles(e.dataTransfer.files);
});

async function deployFiles() {
  const body = new FormData();
  let indexHtml = "";

  staged.forEach((entry, i) => {
    const field = `file${i}`;
    body.append(field, entry.file, entry.file.name);
    body.append(`${field}_path`, entry.path);
  });

  const index = staged.find((e) => /^index\.html?$/i.test(e.path));
  if (index) indexHtml = await index.file.text();

  const slug = slugFromHtml(indexHtml);
  const endpoint = slug ? `${API}?slug=${encodeURIComponent(slug)}` : API;
  return fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "X-Aft-Client": "web" },
    body,
  });
}

function deployPaste(html) {
  const slug = slugFromHtml(html);
  const endpoint = slug ? `${API}?slug=${encodeURIComponent(slug)}` : API;
  return fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Aft-Client": "web",
    },
    body: html,
  });
}

async function publish() {
  if (publishing) return;
  const html = input?.value.trim() || "";

  if (!html && staged.length === 0) {
    setStatus(
      input
        ? "Paste some HTML or choose a file first."
        : "Drop a folder or zip first.",
      "error",
    );
    return;
  }

  publishing = true;
  if (submit) submit.disabled = true;
  if (autoDeploy) showDropPanel("busy");
  else if (result) result.hidden = true;
  setStatus("Publishing…", "pending");

  try {
    const res = staged.length > 0 ? await deployFiles() : await deployPaste(html);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      const msg =
        data.error === "reserved_slug"
          ? "That name is reserved — try again or change the <title>."
          : data.message || data.error || `Deploy failed (${res.status})`;
      setStatus(msg, "error");
      return;
    }

    const liveUrl = data.url;
    if (data.slug && data.editToken) {
      try {
        const map = JSON.parse(localStorage.getItem("aft.editTokens") || "{}");
        map[data.slug] = data.editToken;
        localStorage.setItem("aft.editTokens", JSON.stringify(map));
      } catch (_) {}
    }
    let openUrl = liveUrl;
    if (data.owned) {
      /* signed-in Drop already owns the site */
    } else if (data.claimUrl) {
      openUrl = data.claimUrl;
    } else if (data.editToken) {
      try {
        const u = new URL(liveUrl);
        u.searchParams.set("token", data.editToken);
        openUrl = u.toString();
      } catch (_) {}
    }
    if (urlEl) {
      urlEl.href = liveUrl;
      urlEl.textContent = liveUrl.replace(/^https:\/\//, "");
      urlEl.dataset.liveUrl = liveUrl;
    }
    const claimHint = document.querySelector(
      ".drop-claim-hint[data-aft-auth='guest'], .drop-claim-hint:not([data-aft-auth])",
    );
    if (data.notice && claimHint && !data.owned) {
      claimHint.textContent = data.notice;
    }
    if (autoDeploy) showDropPanel("result");
    else if (result) result.hidden = false;
    setStatus(data.notice && !data.owned ? `Live. ${data.notice}` : "Live.", "ok");
    window.open(openUrl, "_blank", "noopener,noreferrer");
  } catch (err) {
    setStatus(
      err instanceof Error ? err.message : "Network error — try again.",
      "error",
    );
  } finally {
    publishing = false;
    if (submit) submit.disabled = false;
  }
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await publish();
});

dropAgain?.addEventListener("click", () => {
  staged = [];
  renderFiles();
  setStatus("", "");
  if (fileInput) fileInput.value = "";
  if (folderInput) folderInput.value = "";
  showDropPanel("idle");
});

agentCopy?.addEventListener("click", async () => {
  const path = agentCopy.dataset.llms || "/drop/llms.txt";
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load ${path}`);
    const text = (await res.text()).trim();
    await navigator.clipboard.writeText(text);
    agentCopy.classList.add("is-copied");
    agentCopy.title = "Copied llms.txt";
    setTimeout(() => {
      agentCopy.classList.remove("is-copied");
      agentCopy.title = "Copy https://aft.page/drop/llms.txt";
    }, 1500);
  } catch (_) {
    try {
      await navigator.clipboard.writeText(`https://aft.page${path}`);
      agentCopy.title = "Copied URL";
    } catch (__) {}
  }
});

/* —— Hero tabbed snippets (CLI · Drop · MCP · cURL) —— */
const heroDemo = document.querySelector("[data-hero-demo]");
const demoCopyBtn = heroDemo?.querySelector("[data-demo-copy]");
const demoTabs = heroDemo
  ? Array.from(heroDemo.querySelectorAll("[data-demo-tab]"))
  : [];
const demoPanels = heroDemo
  ? Array.from(heroDemo.querySelectorAll("[data-demo-panel]"))
  : [];

const DEMO_CODE_IDS = {
  mcp: "demo-mcp-code",
  curl: "demo-curl-code",
  cli: "demo-cli-code",
};

const DEMO_HASH = {
  mcp: "hero-mcp",
  curl: "hero-curl",
  drop: "hero-drop",
  cli: "hero-cli",
};

function demoTabFromHash(hash = location.hash) {
  const h = hash.replace(/^#/, "").toLowerCase();
  if (h === "hero-drop" || h === "drop") return "drop";
  if (h === "hero-curl" || h === "curl") return "curl";
  if (h === "hero-cli" || h === "cli") return "cli";
  if (h === "hero-mcp" || h === "mcp") return "mcp";
  if (h === "hero-demo") return "cli";
  return null;
}

function activeDemoTab() {
  return demoTabs.find((t) => t.getAttribute("aria-selected") === "true");
}

function selectDemoTab(name, syncHash) {
  if (!demoTabs.some((t) => t.dataset.demoTab === name)) return;
  for (const tab of demoTabs) {
    const on = tab.dataset.demoTab === name;
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.tabIndex = on ? 0 : -1;
  }
  for (const panel of demoPanels) {
    panel.hidden = panel.dataset.demoPanel !== name;
  }
  if (demoCopyBtn) demoCopyBtn.hidden = name === "drop";
  if (syncHash) {
    const next = DEMO_HASH[name];
    if (next && location.hash.replace(/^#/, "") !== next) {
      history.replaceState(null, "", "#" + next);
    }
  }
}

function scrollHeroDemo() {
  document.getElementById("hero-drop")?.scrollIntoView();
}

async function copyDemoSnippet() {
  const tab = activeDemoTab()?.dataset.demoTab;
  const id = DEMO_CODE_IDS[tab];
  if (!id) return;
  const code = document.getElementById(id);
  const text = (code?.innerText || code?.textContent || "").replace(/\n$/, "");
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (demoCopyBtn) demoCopyBtn.dataset.copied = "1";
    setTimeout(() => {
      if (demoCopyBtn) delete demoCopyBtn.dataset.copied;
    }, 1400);
  } catch (_) {}
}

if (heroDemo) {
  const fromHash = demoTabFromHash();
  selectDemoTab(fromHash || "cli");
  if (fromHash && location.hash !== "#hero-drop") scrollHeroDemo();

  window.addEventListener("hashchange", () => {
    const name = demoTabFromHash();
    if (!name) return;
    selectDemoTab(name);
    if (location.hash !== "#hero-drop") scrollHeroDemo();
  });

  heroDemo.addEventListener("click", (e) => {
    const tab = e.target.closest?.("[data-demo-tab]");
    if (tab) {
      e.preventDefault();
      selectDemoTab(tab.dataset.demoTab, true);
      return;
    }
    if (e.target.closest?.("[data-demo-copy]")) {
      e.preventDefault();
      copyDemoSnippet();
    }
  });

  heroDemo.addEventListener("keydown", (e) => {
    const tab = e.target.closest?.("[data-demo-tab]");
    if (!tab || !demoTabs.length) return;
    const i = demoTabs.indexOf(tab);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % demoTabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (i - 1 + demoTabs.length) % demoTabs.length;
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = demoTabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    selectDemoTab(demoTabs[next].dataset.demoTab, true);
    demoTabs[next].focus();
  });
}
