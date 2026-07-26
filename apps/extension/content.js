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
    const text = code?.innerText || pre.innerText || "";
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
    const text = pre.querySelector("code")?.innerText || pre.innerText || "";
    if (!looksLikeHtml(text)) continue;
    const toolbar =
      pre.parentElement?.querySelector("button")?.parentElement ||
      pre.previousElementSibling ||
      pre.firstElementChild;
    out.push({ pre, text, toolbar });
  }
  return out;
}

function createButton(getHtml) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BTN_ATTR, "1");
  btn.className = "aft-deploy-btn";
  btn.textContent = "Deploy";
  btn.title = "Publish to aft.page";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const html = getHtml().trim();
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

    const slug = slugFromHtml(html);
    const url = slug
      ? `${API}?slug=${encodeURIComponent(slug)}`
      : API;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "text/html; charset=utf-8" },
        body: html,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setBtn(btn, "Failed", true);
        console.error("[aft.page]", data);
        return;
      }
      setBtn(btn, "Live ✓");
      window.open(data.url, "_blank", "noopener,noreferrer");
      setTimeout(() => setBtn(btn, "Deploy"), 2500);
    } catch (err) {
      console.error("[aft.page]", err);
      setBtn(btn, "Failed", true);
    } finally {
      btn.disabled = false;
    }
  });

  return btn;
}

function setBtn(btn, label, err = false) {
  btn.textContent = label;
  btn.classList.toggle("aft-deploy-btn--err", err);
  if (err) setTimeout(() => setBtn(btn, "Deploy"), 2000);
}

function inject(block) {
  const { pre, text, toolbar } = block;
  if (pre.querySelector(`[${BTN_ATTR}]`)) return;

  const btn = createButton(() => {
    const code = pre.querySelector("code");
    return code?.innerText || pre.innerText || text;
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

function scan() {
  const host = location.hostname;
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
