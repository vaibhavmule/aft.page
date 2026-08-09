/* Copy-to-clipboard for setup snippets on /with/* and docs */
(function () {
  function toast(btn, ok) {
    const prev = btn.textContent;
    btn.textContent = ok ? "Copied" : "Failed";
    btn.dataset.state = ok ? "ok" : "err";
    window.setTimeout(function () {
      btn.textContent = prev;
      delete btn.dataset.state;
    }, 1600);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    e.preventDefault();
    const sel = btn.getAttribute("data-copy");
    const el = sel ? document.querySelector(sel) : btn.closest(".copy-block")?.querySelector("pre, code");
    if (!el) return;
    const text = (el.innerText || el.textContent || "").replace(/\n$/, "");
    copyText(text).then(
      function () {
        toast(btn, true);
      },
      function () {
        toast(btn, false);
      }
    );
  });
})();
