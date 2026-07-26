const API = "https://api.aft.page/v1/deploy";

const form = document.getElementById("paste-form");
const input = document.getElementById("html-input");
const submit = document.getElementById("paste-submit");
const statusEl = document.getElementById("paste-status");
const result = document.getElementById("paste-result");
const urlEl = document.getElementById("paste-url");
const copyBtn = document.getElementById("paste-copy");

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

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const html = input.value.trim();
  if (!html) {
    setStatus("Paste some HTML first.", "error");
    return;
  }

  submit.disabled = true;
  result.hidden = true;
  setStatus("Publishing…", "pending");

  const slug = slugFromHtml(html);
  const endpoint = slug ? `${API}?slug=${encodeURIComponent(slug)}` : API;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      const msg =
        data.error === "reserved_slug"
          ? "That name is reserved — try again or change the <title>."
          : data.message || data.error || `Deploy failed (${res.status})`;
      setStatus(msg, "error");
      return;
    }

    urlEl.href = data.url;
    urlEl.textContent = data.url.replace(/^https:\/\//, "");
    result.hidden = false;
    setStatus("Live.", "ok");
  } catch (err) {
    setStatus(
      err instanceof Error ? err.message : "Network error — try again.",
      "error",
    );
  } finally {
    submit.disabled = false;
  }
});

copyBtn?.addEventListener("click", async () => {
  const url = urlEl.href;
  if (!url || url === "#") return;
  try {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy link";
    }, 1600);
  } catch {
    setStatus("Couldn’t copy — select the link instead.", "error");
  }
});
