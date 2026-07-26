const API = "https://api.aft.page/v1/deploy";
const BTN_ATTR = "data-aft-deploy";
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
  if (["www", "api", "app", "admin", "aft", "aft-page"].includes(slug)) {
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

/** Quiet "a." glyph — same weight as ChatGPT’s Copy / Play icons. */
function aftIconSvg() {
  const wrap = document.createElement("span");
  wrap.setAttribute(ICON_MARK, "idle");
  wrap.setAttribute("aria-hidden", "true");
  wrap.className = "aft-icon";
  wrap.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.6 13.5L7.85 4.8h1.55l3.25 8.7H11.1l-.7-1.95H6.85L6.15 13.5H4.6zm2.85-3.35h2.7L8.7 6.7h-.1l-1.15 3.45z" fill="currentColor"/>
      <circle cx="13.35" cy="12.85" r="1.2" fill="currentColor"/>
    </svg>
  `.trim();
  return wrap;
}

function setIconState(btn, state) {
  btn.dataset.aftState = state;
  btn.classList.toggle("aft-deploy-btn--err", state === "err");
  btn.classList.toggle("aft-deploy-btn--ok", state === "ok");
  btn.classList.toggle("aft-deploy-btn--busy", state === "busy");
  const label =
    state === "busy"
      ? "Publishing…"
      : state === "ok"
        ? "Live on aft.page"
        : state === "err"
          ? "Deploy failed — try again"
          : "Deploy to aft.page";
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

async function publishHtml(html) {
  const clean = sanitizeHtml(html);
  const slug = slugFromHtml(clean);
  const url = slug
    ? `${API}?slug=${encodeURIComponent(slug)}`
    : API;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/html; charset=utf-8" },
    body: clean,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.message || data.error || `Deploy failed (${res.status})`);
  }
  return data;
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
      setIconState(btn, "ok");
      if (opened) opened.location.replace(data.url);
      else window.open(data.url, "_blank", "noopener,noreferrer");
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

function createMenuItem(getHtml) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BTN_ATTR, "claude-menu");
  btn.className = "aft-deploy-menu-item";
  btn.textContent = "Deploy to aft.page";
  btn.title = "Publish this HTML to a new *.aft.page URL";
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
      btn.textContent = "Live — opening…";
      if (opened) opened.location.replace(data.url);
      else window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[aft.page]", err);
      opened?.close();
      btn.textContent = "Failed";
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = "Deploy to aft.page";
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
    const t = (b.textContent || "").replace(/\s+/g, " ").trim();
    return t === "Copy" || t.startsWith("Copy");
  });
}

/**
 * Put the aft icon beside Claude/ChatGPT Copy controls in the artifact header.
 * Fullscreen remounts this header — scan() must re-run after that.
 */
function injectBesideCopyButtons() {
  for (const copy of findCopyButtons()) {
    // Sit in the same icon row as Copy (ChatGPT: </> · ▶ · copy).
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
    if (!nearbyHtml && !location.hostname.includes("chatgpt.com") && !location.hostname.includes("openai.com")) {
      continue;
    }

    const btn = createIconButton(() =>
      sanitizeHtml(
        getOpenClaudeArtifactHtml() ||
          nearbyHtml ||
          extractPreHtml(copy.closest("pre") || panel || document.body) ||
          "",
      ),
    );
    // Native order: … Copy → aft icon (same cluster, not far-right orphan).
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
  injectBesideCopyButtons();
  if (host.includes("claude.ai")) injectClaudeArtifactMenu();
  const blocks = host.includes("claude.ai")
    ? findClaudeBlocks()
    : findChatGptBlocks();
  for (const b of blocks) inject(b);
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
document.addEventListener("fullscreenchange", () => scheduleScan(100));
document.addEventListener("webkitfullscreenchange", () => scheduleScan(100));
window.addEventListener("resize", () => scheduleScan(400));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleScan(100);
});
// Belt-and-suspenders: Claude sometimes mutates without useful observer events.
setInterval(() => {
  if (!document.querySelector(`[${BTN_ATTR}="icon"]`)) scan();
}, 2000);
