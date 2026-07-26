const API = "https://api.aft.page/v1/deploy";
const BTN_ATTR = "data-aft-deploy";

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
  // Prefer a clean document if the scrape appended UI chrome after </html>.
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
  // Never use pre.innerText — it includes our Deploy button label.
  const raw = code?.innerText || fallback || "";
  return sanitizeHtml(raw);
}

/** ChatGPT: code block labeled HTML / language-html */
function findChatGptBlocks(root = document) {
  const out = [];
  for (const pre of root.querySelectorAll("pre")) {
    if (pre.querySelector(`[${BTN_ATTR}]`)) continue;
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
    if (pre.querySelector(`[${BTN_ATTR}]`)) continue;
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

function createButton(getHtml, options = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BTN_ATTR, "1");
  btn.className = options.className || "aft-deploy-btn";
  btn.dataset.aftIdleLabel = options.label || "Deploy";
  // Keep visible label via CSS for the floating button; menu items need real text.
  if (options.menuItem) {
    btn.textContent = btn.dataset.aftIdleLabel;
  } else {
    btn.setAttribute("aria-label", btn.dataset.aftIdleLabel);
    btn.textContent = "";
  }
  btn.title = "Publish to aft.page";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const html = sanitizeHtml(getHtml());
    if (!html) {
      setBtn(btn, "Empty", true);
      return;
    }
    if (!looksLikeHtml(html)) {
      setBtn(btn, "Not HTML", true);
      return;
    }

    btn.disabled = true;
    setBtn(btn, "…");
    // Open synchronously so Chrome does not block the tab after the fetch.
    const opened = window.open("about:blank", "_blank");

    try {
      const data = await publishHtml(html);
      setBtn(btn, options.successLabel || "Live ✓");
      if (opened) opened.location.replace(data.url);
      else window.open(data.url, "_blank", "noopener,noreferrer");
      setTimeout(() => setBtn(btn, btn.dataset.aftIdleLabel, false, options), 2500);
    } catch (err) {
      console.error("[aft.page]", err);
      opened?.close();
      setBtn(btn, "Failed", true, options);
    } finally {
      btn.disabled = false;
    }
  });

  return btn;
}

function setBtn(btn, label, err = false, options = {}) {
  const idle = btn.dataset.aftIdleLabel || "Deploy";
  const isIdle = label === idle;
  if (isIdle && !options.menuItem && !btn.classList.contains("aft-deploy-menu-item")) {
    btn.textContent = "";
    btn.setAttribute("aria-label", idle);
  } else {
    btn.textContent = label;
  }
  btn.classList.toggle("aft-deploy-btn--err", err);
  if (err) {
    setTimeout(() => setBtn(btn, idle, false, options), 2000);
  }
}

function inject(block) {
  const { pre, text, toolbar } = block;
  if (pre.querySelector(`[${BTN_ATTR}]`)) return;

  const btn = createButton(() => extractPreHtml(pre, text), {
    label: "Deploy",
  });

  // Prefer the header row next to Copy; else float on the pre.
  const header =
    toolbar ||
    pre.querySelector("div") ||
    null;

  if (header && header !== pre) {
    header.appendChild(btn);
  } else {
    pre.style.position = pre.style.position || "relative";
    btn.classList.add("aft-deploy-btn--float");
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
  // The open artifact is normally the largest HTML candidate on the page.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || "";
}

function exactTextElement(text) {
  const candidates = document.querySelectorAll(
    "button, [role='menuitem'], [role='option'], [role='menu'] > div",
  );
  return [...candidates].find((el) => el.textContent?.trim() === text) || null;
}

/** Add aft.page to Claude's Copy dropdown beside Download as HTML. */
function injectClaudeArtifactMenu() {
  const download = exactTextElement("Download as HTML");
  const publish = exactTextElement("Publish artifact");
  const anchor = download || publish;
  if (!anchor) return;

  const menu = anchor.parentElement;
  if (!menu || menu.querySelector(`[${BTN_ATTR}='claude-menu']`)) return;

  const btn = createButton(() => sanitizeHtml(getOpenClaudeArtifactHtml()), {
    label: "Deploy to aft.page",
    successLabel: "Live — opening…",
    className: `${anchor.className || ""} aft-deploy-menu-item`,
    menuItem: true,
  });
  btn.setAttribute(BTN_ATTR, "claude-menu");
  btn.setAttribute("role", anchor.getAttribute("role") || "menuitem");
  btn.title = "Publish this HTML to a new *.aft.page URL";

  if (download) download.insertAdjacentElement("afterend", btn);
  else menu.appendChild(btn);
}

function scan() {
  const host = location.hostname;
  if (host.includes("claude.ai")) injectClaudeArtifactMenu();
  const blocks =
    host.includes("claude.ai")
      ? findClaudeBlocks()
      : findChatGptBlocks();
  for (const b of blocks) inject(b);
}

scan();
const obs = new MutationObserver(() => {
  // Debounce a bit — chat streams tokens constantly.
  clearTimeout(scan._t);
  scan._t = setTimeout(scan, 400);
});
obs.observe(document.documentElement, { childList: true, subtree: true });
