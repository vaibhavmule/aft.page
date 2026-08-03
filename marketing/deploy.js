const API = "https://api.aft.page/v1/deploy";

// Mirror the Worker's limits so bad uploads fail here with a clear message.
const MAX_FILES = 50;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

const form = document.getElementById("paste-form");
const input = document.getElementById("html-input");
const submit = document.getElementById("paste-submit");
const statusEl = document.getElementById("paste-status");
const result = document.getElementById("paste-result");
const urlEl = document.getElementById("paste-url");
const drop = document.getElementById("paste-drop");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const dropTitle = document.getElementById("paste-drop-title");

/** Files staged for upload, keyed by the path they'll get on the site. */
let staged = [];

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind || "";
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
  // Avoid reserved / marketing names colliding with apex brand.
  if (["www", "api", "app", "admin", "aft", "aft-page"].includes(slug)) {
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

function stageFiles(list) {
  const picked = Array.from(list).filter((f) => f.size > 0);
  if (picked.length === 0) return;

  let entries = picked.map((file) => ({ path: relativePath(file), file }));

  // A lone page can be named anything — the site still needs an index.
  if (entries.length === 1 && /\.html?$/i.test(entries[0].path)) {
    entries[0].path = "index.html";
  }

  if (entries.length > MAX_FILES) {
    setStatus(`Too many files — ${MAX_FILES} max.`, "error");
    return;
  }
  const oversized = entries.find((e) => e.file.size > MAX_FILE_BYTES);
  if (oversized) {
    setStatus(
      `${oversized.path} is over ${formatBytes(MAX_FILE_BYTES)}.`,
      "error",
    );
    return;
  }
  const total = entries.reduce((n, e) => n + e.file.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    setStatus(`Total upload is over ${formatBytes(MAX_TOTAL_BYTES)}.`, "error");
    return;
  }
  if (!entries.some((e) => /^index\.html?$/i.test(e.path))) {
    setStatus("Include an index.html so the site has a homepage.", "error");
    return;
  }

  staged = entries;
  renderFiles();
  setStatus(
    `${staged.length} file${staged.length === 1 ? "" : "s"} ready.`,
    "ok",
  );
}

fileInput?.addEventListener("change", () => stageFiles(fileInput.files));

// Whole drop zone is clickable (chatcontract-style), not just a button.
drop?.addEventListener("click", (e) => {
  if (e.target === fileInput) return;
  fileInput?.click();
});
drop?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput?.click();
  }
});

for (const type of ["dragenter", "dragover"]) {
  drop?.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add("is-dragging");
    if (dropTitle) dropTitle.textContent = "Drop your files here";
  });
}
for (const type of ["dragleave", "drop"]) {
  drop?.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.remove("is-dragging");
    if (dropTitle) dropTitle.textContent = "Drop files here";
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
    headers: { "X-Aft-Client": "web" },
    body,
  });
}

function deployPaste(html) {
  const slug = slugFromHtml(html);
  const endpoint = slug ? `${API}?slug=${encodeURIComponent(slug)}` : API;
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Aft-Client": "web",
    },
    body: html,
  });
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const html = input.value.trim();

  if (!html && staged.length === 0) {
    setStatus("Paste some HTML or choose a file first.", "error");
    return;
  }

  submit.disabled = true;
  result.hidden = true;
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
    const preview =
      "https://aft.page/preview?url=" +
      encodeURIComponent(liveUrl) +
      (data.editToken ? "&token=" + encodeURIComponent(data.editToken) : "");
    urlEl.href = preview;
    urlEl.textContent = liveUrl.replace(/^https:\/\//, "");
    urlEl.dataset.liveUrl = liveUrl;
    result.hidden = false;
    setStatus("Live.", "ok");
    window.open(preview, "_blank", "noopener,noreferrer");
  } catch (err) {
    setStatus(
      err instanceof Error ? err.message : "Network error — try again.",
      "error",
    );
  } finally {
    submit.disabled = false;
  }
});
