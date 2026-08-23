import {
  githubRepoHref,
  isGithubRepoPage,
  parseGithubRepoUrl,
} from "./github-url.js";

const API = "https://api.aft.page/v1/deploy";
const BTN_ATTR = "data-aft-deploy";
const RUN_ATTR = "data-aft-run";
const ICON_MARK = "data-aft-icon";

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
  if (
    [
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
    ].includes(slug)
  ) {
    return undefined;
  }
  return slug;
}

function looksLikeHtml(text) {
  const t = text.trim();
  if (t.length < 20) return false;
  return (
    /<!DOCTYPE\s+html/i.test(t) ||
    /<html[\s>]/i.test(t) ||
    (/<head[\s>]/i.test(t) && /<body[\s>]/i.test(t)) ||
    (/<h1[\s>]/i.test(t) && /<\/html>/i.test(t))
  );
}

/**
 * Extension UI labels sometimes get scraped into the artifact text
 * (we saw live pages ending in `</html>Deploy`). Strip that junk.
 */
function sanitizeHtml(text) {
  let t = String(text ?? "").trim();
  const close = t.search(/<\/html>\s*/i);
  if (close !== -1) {
    t = t.slice(0, close + "</html>".length);
  }
  t = t.replace(
    /\s*(Deploy(?:\s+to\s+aft\.page)?|Live ✓|Publishing…|Failed|Empty|Not HTML)\s*$/i,
    "",
  );
  return t.trim();
}

function extractPreHtml(pre, fallback = "") {
  const code = pre.querySelector("code");
  // Never use pre.innerText — it can include toolbar chrome.
  const raw = code?.innerText || fallback || "";
  return sanitizeHtml(raw);
}

/** ChatGPT-native share icon (sprites-core #630ca2) — muted via currentColor. */
function aftIconSvg() {
  const wrap = document.createElement("span");
  wrap.setAttribute(ICON_MARK, "idle");
  wrap.setAttribute("aria-hidden", "true");
  wrap.className = "aft-icon";
  wrap.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="aft-icon-svg">
      <path d="M2.668 12.666V12.5a.665.665 0 0 1 1.33 0v.166c0 .711.001 1.205.033 1.588.03.376.087.587.167.745l.07.127c.177.288.43.522.732.676l.13.056c.144.051.333.089.615.112.384.031.877.031 1.588.031h5.333c.711 0 1.205 0 1.588-.031.376-.03.587-.088.745-.168l.127-.071c.288-.176.522-.43.676-.732l.056-.13c.051-.143.089-.333.112-.615.031-.383.031-.877.031-1.588V12.5a.665.665 0 0 1 1.33 0v.166c0 .69 0 1.246-.036 1.697-.033.4-.098.762-.242 1.098l-.066.143c-.266.52-.67.957-1.165 1.26l-.218.123c-.377.192-.783.27-1.241.308-.45.037-1.008.036-1.697.036H7.333c-.689 0-1.246.001-1.696-.036-.4-.033-.761-.097-1.098-.241l-.142-.067a3.17 3.17 0 0 1-1.262-1.165l-.122-.218c-.192-.377-.271-.783-.309-1.241-.036-.45-.036-1.008-.036-1.697m6.667-.166V4.94L7.137 7.137a.665.665 0 0 1-.94-.94L9.53 2.863l.101-.083a.666.666 0 0 1 .839.083l3.334 3.334a.666.666 0 0 1-.941.94L10.665 4.94v7.56a.666.666 0 0 1-1.33 0"/>
    </svg>
  `.trim();
  return wrap;
}

function setIconState(btn, state, detail) {
  btn.dataset.aftState = state;
  btn.classList.toggle("aft-deploy-btn--err", state === "err");
  btn.classList.toggle("aft-deploy-btn--ok", state === "ok");
  btn.classList.toggle("aft-deploy-btn--busy", state === "busy");
  // Short labels match ChatGPT’s Copy tooltip (“Copy”).
  const label =
    state === "busy"
      ? "Publishing…"
      : state === "ok"
        ? detail || "Live"
        : state === "err"
          ? "Failed"
          : "Share";
  btn.title = label;
  btn.setAttribute("aria-label", state === "ok" && detail ? "Live" : label);
  btn.setAttribute("data-tooltip", state === "ok" ? "Live" : label);
}

async function publishHtml(html) {
  const clean = sanitizeHtml(html);
  const slug = slugFromHtml(clean);
  const url = slug
    ? `${API}?slug=${encodeURIComponent(slug)}`
    : API;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-aft-client": "extension",
    },
    body: clean,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.message || data.error || `Deploy failed (${res.status})`);
  }
  return data;
}

/** Claim page first for guests; live URL if claimUrl is missing. */
function liveOpenUrl(liveUrl, editToken, claimUrl) {
  if (claimUrl) return claimUrl;
  const u = new URL(liveUrl);
  if (editToken) u.searchParams.set("token", editToken);
  return u.toString();
}

function createIconButton(getHtml) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BTN_ATTR, "icon");
  btn.className = "aft-deploy-btn aft-deploy-btn--icon";
  btn.appendChild(aftIconSvg());
  setIconState(btn, "idle");

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const html = sanitizeHtml(getHtml());
    if (!html || !looksLikeHtml(html)) {
      setIconState(btn, "err");
      setTimeout(() => setIconState(btn, "idle"), 1800);
      return;
    }

    btn.disabled = true;
    setIconState(btn, "busy");
    const opened = window.open("about:blank", "_blank");

    try {
      const data = await publishHtml(html);
      setIconState(btn, "ok", data.notice ? `Live. ${data.notice}` : "Live");
      if (opened) opened.location.replace(liveOpenUrl(data.url, data.editToken, data.claimUrl));
      else window.open(liveOpenUrl(data.url, data.editToken, data.claimUrl), "_blank", "noopener,noreferrer");
      setTimeout(() => setIconState(btn, "idle"), 2200);
    } catch (err) {
      console.error("[aft.page]", err);
      opened?.close();
      setIconState(btn, "err");
      setTimeout(() => setIconState(btn, "idle"), 2200);
    } finally {
      btn.disabled = false;
    }
  });

  return btn;
}

function runPageUrl(ref) {
  return `https://aft.page/run/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

function runGithubRepo(ref, btn) {
  const label = btn.textContent;
  btn.textContent = "Opening…";
  btn.disabled = true;
  window.open(runPageUrl(ref), "_blank", "noopener,noreferrer");
  btn.textContent = label;
  btn.disabled = false;
}

function createRunButton(ref, kind) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(RUN_ATTR, kind);
  btn.className =
    kind === "github" ? "aft-run-btn aft-run-btn--github" : "aft-run-chip";
  btn.textContent = "Run on AFT";
  btn.title = "Open this repo as a live URL on aft.page";
  btn.setAttribute("aria-label", "Run on AFT");
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    runGithubRepo(ref, btn);
  });
  return btn;
}

function injectGithubRepoButton() {
  if (!isGithubRepoPage(location.href)) {
    document.querySelector(`[${RUN_ATTR}="github"]`)?.remove();
    return;
  }
  const ref = parseGithubRepoUrl(location.href);
  if (!ref) return;
  const key = `${ref.owner}/${ref.repo}`;
  const existing = document.querySelector(`[${RUN_ATTR}="github"]`);
  if (existing) {
    if (existing.dataset.aftRepo === key) return;
    existing.remove();
  }
  const btn = createRunButton(ref, "github");
  btn.dataset.aftRepo = key;
  const fork = document.querySelector('a[href$="/fork"]');
  if (fork?.parentElement) {
    fork.parentElement.insertBefore(btn, fork);
    return;
  }
  const actions = document.querySelector(
    ".pagehead-actions, #repository-details-container, [data-testid='unrepo-header']",
  );
  if (actions) {
    actions.appendChild(btn);
    return;
  }
  btn.classList.add("aft-run-btn--float-gh");
  document.documentElement.appendChild(btn);
}

function injectGithubLinkChips(root = document) {
  const existing = root.querySelectorAll(`[${RUN_ATTR}="chip"]`).length;
  if (existing >= 8) return;
  let added = existing;
  for (const a of root.querySelectorAll('a[href*="github.com/"]')) {
    if (added >= 8) break;
    if (a.closest("nav, header, [role='navigation']")) continue;
    if (a.nextElementSibling?.getAttribute?.(RUN_ATTR) === "chip") continue;
    const ref = parseGithubRepoUrl(a.href);
    if (!ref) continue;
    a.insertAdjacentElement("afterend", createRunButton(ref, "chip"));
    added += 1;
  }
}

function createMenuItem(getHtml) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BTN_ATTR, "claude-menu");
  btn.className = "aft-deploy-menu-item";
  btn.textContent = "Deploy to aft.page";
  btn.title = "Publish this HTML to a live URL";
  btn.setAttribute("role", "menuitem");

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const html = sanitizeHtml(getHtml());
    if (!html || !looksLikeHtml(html)) {
      btn.textContent = "Not HTML";
      setTimeout(() => {
        btn.textContent = "Deploy to aft.page";
      }, 1800);
      return;
    }
    btn.disabled = true;
    btn.textContent = "Publishing…";
    const opened = window.open("about:blank", "_blank");
    try {
      const data = await publishHtml(html);
      btn.textContent = data.notice ? "Live — claim within 30d" : "Live — opening…";
      if (data.notice) btn.title = data.notice;
      if (opened) opened.location.replace(liveOpenUrl(data.url, data.editToken, data.claimUrl));
      else window.open(liveOpenUrl(data.url, data.editToken, data.claimUrl), "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[aft.page]", err);
      opened?.close();
      btn.textContent = "Failed";
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = "Deploy to aft.page";
        btn.title = "Publish this HTML to a live URL";
      }, 2200);
    }
  });

  return btn;
}

/** ChatGPT: code block labeled HTML / language-html */
function findChatGptBlocks(root = document) {
  const out = [];
  for (const pre of root.querySelectorAll("pre")) {
    if (pre.querySelector(`[${BTN_ATTR}="icon"]`)) continue;
    const lang =
      pre.querySelector("[class*='language-']")?.className ||
      pre.querySelector("span")?.textContent ||
      "";
    const code = pre.querySelector("code");
    const text = extractPreHtml(pre, code?.innerText || "");
    const isHtml =
      /html/i.test(lang) ||
      looksLikeHtml(text) ||
      (pre.closest("[class*='code']") && looksLikeHtml(text));
    if (!isHtml || !looksLikeHtml(text)) continue;

    const toolbar =
      pre.querySelector("div.flex.items-center") ||
      pre.querySelector("[class*='sticky']") ||
      pre.firstElementChild;
    out.push({ pre, text, toolbar });
  }
  return out;
}

/** Claude: artifact / code panels */
function findClaudeBlocks(root = document) {
  const out = [];
  for (const pre of root.querySelectorAll("pre")) {
    if (pre.querySelector(`[${BTN_ATTR}="icon"]`)) continue;
    const text = extractPreHtml(pre);
    if (!looksLikeHtml(text)) continue;
    const toolbar =
      pre.parentElement?.querySelector("button")?.parentElement ||
      pre.previousElementSibling ||
      pre.firstElementChild;
    out.push({ pre, text, toolbar });
  }
  return out;
}

function injectIntoToolbar(toolbar, getHtml) {
  if (!toolbar || toolbar.querySelector(`[${BTN_ATTR}="icon"]`)) return;
  const btn = createIconButton(getHtml);
  // Place just before the trailing expand/close cluster when possible.
  toolbar.appendChild(btn);
}

function inject(block) {
  const { pre, text, toolbar } = block;
  if (pre.querySelector(`[${BTN_ATTR}="icon"]`)) return;

  const getHtml = () => extractPreHtml(pre, text);
  const header = toolbar || pre.querySelector("div") || null;

  if (header && header !== pre) {
    injectIntoToolbar(header, getHtml);
  } else {
    const btn = createIconButton(getHtml);
    btn.classList.add("aft-deploy-btn--float");
    pre.style.position = pre.style.position || "relative";
    pre.appendChild(btn);
  }
}

/**
 * Claude's artifact editor is CodeMirror today, but keep fallbacks for
 * Monaco and regular code blocks because its DOM changes frequently.
 */
function getOpenClaudeArtifactHtml() {
  const selectors = [
    ".cm-content",
    ".view-lines",
    "[data-language='html']",
    "[class*='language-html']",
    "pre code",
    "pre",
  ];
  const candidates = [];
  const seen = new Set();
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const text = (el.innerText || el.textContent || "").trim();
      if (looksLikeHtml(text)) candidates.push(text);
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || "";
}

function exactTextElement(text) {
  const candidates = document.querySelectorAll(
    "button, [role='menuitem'], [role='option'], [role='menu'] > div",
  );
  return [...candidates].find((el) => el.textContent?.trim() === text) || null;
}

function findCopyButtons() {
  return [...document.querySelectorAll("button")].filter((b) => {
    const label = (b.getAttribute("aria-label") || "").trim().toLowerCase();
    if (label === "copy" || label.startsWith("copy ")) return true;
    const t = (b.textContent || "").replace(/\s+/g, " ").trim();
    return t === "Copy" || t.startsWith("Copy");
  });
}

/** Walk up from a ChatGPT toolbar row to find the associated <pre>/code HTML. */
function findHtmlNearToolbar(row) {
  let shell = row.parentElement;
  let pre = null;
  for (let i = 0; i < 10 && shell; i++) {
    pre = shell.matches?.("pre")
      ? shell
      : shell.querySelector(":scope > pre, :scope pre");
    if (pre) break;
    shell = shell.parentElement;
  }
  if (pre) {
    const text = extractPreHtml(pre);
    if (looksLikeHtml(text)) return { pre, text, anchor: pre };
  }

  // Artifact/canvas preview: HTML may live in a sibling code panel or iframe srcdoc.
  shell = row.parentElement;
  for (let i = 0; i < 10 && shell; i++) {
    const code = shell.querySelector("pre code, code.language-html, [class*='language-html']");
    if (code) {
      const text = sanitizeHtml(code.innerText || code.textContent || "");
      if (looksLikeHtml(text)) {
        return { pre: code.closest("pre") || code, text, anchor: code };
      }
    }
    const iframe = shell.querySelector("iframe[srcdoc]");
    if (iframe?.srcdoc && looksLikeHtml(iframe.srcdoc)) {
      return {
        pre: null,
        text: sanitizeHtml(iframe.srcdoc),
        anchor: iframe,
      };
    }
    shell = shell.parentElement;
  }
  return null;
}

function chatGptToolbarRow(el) {
  return (
    el.closest(".justify-self-end") ||
    el.closest(".flex.flex-row.items-center") ||
    el.closest(".flex.items-center") ||
    el.parentElement
  );
}

function isChatGptPreviewToggle(btn) {
  if (
    btn.hasAttribute("data-code-block-preview-toggle-code") ||
    btn.hasAttribute("data-code-block-preview-toggle-preview")
  ) {
    return true;
  }
  const label = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
  return (
    label === "code" ||
    label === "preview" ||
    label === "code block view" ||
    label === "preview the code" ||
    label.startsWith("switch to code") ||
    label.startsWith("switch to preview")
  );
}

/**
 * ChatGPT code header: [Code|Preview] toggle + Copy in one flex row.
 * Insert aft share as a sibling after Copy so it sits in that same group.
 */
function findChatGptCodeToolbars() {
  const out = [];
  const seen = new Set();
  for (const copy of document.querySelectorAll('button[aria-label="Copy"]')) {
    const row = chatGptToolbarRow(copy);
    if (!row || seen.has(row)) continue;
    const hasToggle =
      row.querySelector('[aria-label="Code block view"]') ||
      row.querySelector("[data-code-block-preview-toggle-code]") ||
      [...row.querySelectorAll("button")].some(isChatGptPreviewToggle);
    if (!hasToggle && copy.parentElement !== row) continue;
    seen.add(row);

    const near = findHtmlNearToolbar(row);
    if (!near || !looksLikeHtml(near.text)) continue;
    out.push({ row, copy, pre: near.pre, text: near.text, insertAfter: copy });
  }
  return out;
}

/**
 * ChatGPT artifact / canvas headers: filename + Code + Preview (+ Fullscreen),
 * often without a Copy button. Share must still inject into that icon group.
 */
function findChatGptArtifactToolbars() {
  const out = [];
  const seen = new Set();
  const toggleButtons = [
    ...document.querySelectorAll(
      'button[aria-label="Code"], button[aria-label="Preview"], button[aria-label="Code block view"], [data-code-block-preview-toggle-code], [data-code-block-preview-toggle-preview]',
    ),
    ...[...document.querySelectorAll("button")].filter(isChatGptPreviewToggle),
  ];

  for (const toggle of toggleButtons) {
    const row = chatGptToolbarRow(toggle);
    if (!row || seen.has(row)) continue;
    if (row.querySelector(`[${BTN_ATTR}="icon"]`)) {
      seen.add(row);
      continue;
    }

    const buttons = [...row.querySelectorAll("button")];
    if (!buttons.some(isChatGptPreviewToggle)) continue;

    seen.add(row);
    const near = findHtmlNearToolbar(row);
    if (!near || !looksLikeHtml(near.text)) continue;

    const copy = buttons.find((b) => {
      const label = (b.getAttribute("aria-label") || "").trim().toLowerCase();
      return label === "copy" || label.startsWith("copy ");
    });
    const previewBtn = buttons.find((b) => {
      const label = (b.getAttribute("aria-label") || "").trim().toLowerCase();
      return (
        label === "preview" ||
        b.hasAttribute("data-code-block-preview-toggle-preview")
      );
    });
    // Prefer after Copy, else after Preview, else last toggle — before Fullscreen.
    const insertAfter =
      copy ||
      previewBtn ||
      buttons.find(isChatGptPreviewToggle) ||
      buttons[buttons.length - 1] ||
      null;

    out.push({
      row,
      copy: copy || null,
      pre: near.pre,
      text: near.text,
      insertAfter,
    });
  }
  return out;
}

function createChatGptNativeButton(getHtml) {
  const btn = createIconButton(getHtml);
  // Match ChatGPT Copy: size-9 circle, same hover tokens.
  btn.className =
    "aft-deploy-btn aft-deploy-btn--icon aft-deploy-btn--chatgpt flex gap-1 items-center select-none py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 size-9 rounded-full px-2";
  return btn;
}

function injectChatGptToolbar({ row, pre, text, insertAfter }) {
  if (!row || row.querySelector(`[${BTN_ATTR}="icon"]`)) return;
  const getHtml = () => {
    if (pre) {
      const fromPre = extractPreHtml(pre, text);
      if (looksLikeHtml(fromPre)) return fromPre;
    }
    const near = findHtmlNearToolbar(row);
    if (near?.text && looksLikeHtml(near.text)) return near.text;
    return sanitizeHtml(text || "");
  };
  if (!looksLikeHtml(getHtml())) return;
  const btn = createChatGptNativeButton(getHtml);
  if (insertAfter?.isConnected) {
    insertAfter.insertAdjacentElement("afterend", btn);
  } else {
    row.appendChild(btn);
  }
}

/**
 * Put the aft icon beside Claude/ChatGPT Copy controls in the artifact header.
 * Fullscreen remounts this header — scan() must re-run after that.
 */
function injectBesideCopyButtons() {
  const host = location.hostname;
  const onChatGpt =
    host.includes("chatgpt.com") || host.includes("openai.com");

  if (onChatGpt) {
    const seen = new Set();
    for (const hit of [
      ...findChatGptCodeToolbars(),
      ...findChatGptArtifactToolbars(),
    ]) {
      if (seen.has(hit.row)) continue;
      seen.add(hit.row);
      injectChatGptToolbar(hit);
    }
    return;
  }

  for (const copy of findCopyButtons()) {
    const row =
      copy.parentElement ||
      copy.closest('[class*="gap"]') ||
      copy.closest('[class*="flex"]');
    if (!row) continue;
    if (row.querySelector(`[${BTN_ATTR}="icon"]`)) continue;

    const panel =
      copy.closest("[class*='artifact']") ||
      copy.closest("pre") ||
      copy.closest("[class*='overflow']") ||
      copy.closest("header") ||
      row.closest("div");
    const nearbyHtml =
      getOpenClaudeArtifactHtml() ||
      [...(panel?.querySelectorAll("pre, code, .cm-content") || [])]
        .map((el) => el.innerText || "")
        .find(looksLikeHtml);
    if (!nearbyHtml) continue;

    const btn = createIconButton(() =>
      sanitizeHtml(
        getOpenClaudeArtifactHtml() ||
          nearbyHtml ||
          extractPreHtml(copy.closest("pre") || panel || document.body) ||
          "",
      ),
    );
    copy.insertAdjacentElement("afterend", btn);
  }
}

/** Add aft.page to Claude's Copy dropdown beside Download as HTML. */
function injectClaudeArtifactMenu() {
  const download = exactTextElement("Download as HTML");
  const publish = exactTextElement("Publish artifact");
  const anchor = download || publish;
  if (!anchor) return;

  const menu = anchor.parentElement;
  if (!menu || menu.querySelector(`[${BTN_ATTR}="claude-menu"]`)) return;

  const item = createMenuItem(() => sanitizeHtml(getOpenClaudeArtifactHtml()));
  if (download) download.insertAdjacentElement("afterend", item);
  else menu.appendChild(item);
}

function scan() {
  const host = location.hostname;
  if (host === "github.com" || host === "www.github.com") {
    injectGithubRepoButton();
    return;
  }
  injectBesideCopyButtons();
  injectGithubLinkChips();
  if (host.includes("claude.ai")) injectClaudeArtifactMenu();
  // ChatGPT: inject via Code/Preview(/Copy) toolbar paths only (above).
  // Extra pre-scanning duplicates buttons outside that cluster.
  if (host.includes("chatgpt.com") || host.includes("openai.com")) return;
  for (const b of findClaudeBlocks()) inject(b);
}

function scheduleScan(delay = 250) {
  clearTimeout(scheduleScan._t);
  scheduleScan._t = setTimeout(scan, delay);
}

scan();
const obs = new MutationObserver(() => scheduleScan(300));
obs.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "style", "hidden", "aria-expanded"],
});

// Fullscreen / minimize remounts Claude's artifact chrome — force a rescan.
document.addEventListener("turbo:load", () => scheduleScan(50));
document.addEventListener("pjax:end", () => scheduleScan(50));
document.addEventListener("fullscreenchange", () => scheduleScan(100));
document.addEventListener("webkitfullscreenchange", () => scheduleScan(100));
window.addEventListener("resize", () => scheduleScan(400));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleScan(100);
});
// Belt-and-suspenders: new replies / remounts can miss MutationObserver.
// Always rescan — injectors no-op when a toolbar already has Share.
setInterval(() => scan(), 2000);
