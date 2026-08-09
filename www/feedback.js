/**
 * Site-wide feedback capture: floating chrome + modal, plus a footer link.
 * Posts to https://api.aft.page/v1/feedback (see apps/api/src/feedback.ts).
 * Self-contained — injects its own styles so it works on any page.
 *
 * On /preview, brand badge + Feedback share one dock (growth G5 + feedback).
 * Elsewhere: Feedback-only white CTA (docs/BRAND.md).
 */
(function () {
  if (window.__aftFeedbackMounted) return;
  window.__aftFeedbackMounted = true;

  var API = "https://api.aft.page";
  var onPreview =
    location.pathname === "/preview" ||
    location.pathname.indexOf("/preview/") === 0;

  var css =
    '.aft-fb-dock{position:fixed;right:20px;bottom:20px;z-index:2147483000;' +
    'display:inline-flex;align-items:center;gap:0;' +
    'font:600 13px/1 var(--font-sans,"Geist Variable","Geist","Segoe UI",system-ui,sans-serif);' +
    'border-radius:999px;box-shadow:0 8px 28px rgba(0,0,0,.4);' +
    'overflow:hidden;border:1px solid #27272a;background:#0a0a0a}' +
    '.aft-fb-brand{display:inline-flex;align-items:center;gap:0;padding:10px 14px 10px 16px;' +
    'color:#fafafa;text-decoration:none;letter-spacing:-0.02em;white-space:nowrap;' +
    'border-right:1px solid #27272a;transition:background .12s ease}' +
    '.aft-fb-brand:hover{background:#141414}' +
    '.aft-fb-brand:focus-visible{outline:2px solid #22c55e;outline-offset:2px}' +
    '.aft-fb-brand .aft-fb-dot{color:#a1a1aa;font-weight:500}' +
    '.aft-fb-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;' +
    'font:inherit;color:#fafafa;background:transparent;border:0;cursor:pointer;' +
    'transition:background .12s ease,color .12s ease}' +
    '.aft-fb-btn:hover{background:#141414;color:#fff}' +
    '.aft-fb-btn:focus-visible{outline:2px solid #22c55e;outline-offset:2px}' +
    /* Website / non-preview: white CTA pill (brand primary) */
    '.aft-fb-btn.aft-fb-solo{position:fixed;right:20px;bottom:20px;z-index:2147483000;' +
    'width:auto;max-width:max-content;padding:10px 16px;' +
    'font:600 14px/1 var(--font-sans,"Geist Variable","Geist","Segoe UI",system-ui,sans-serif);' +
    'color:var(--cta-ink,#000);background:var(--cta,#fff);border:1px solid var(--cta,#fff);' +
    'border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.35);' +
    'transition:transform .12s ease,background .12s ease}' +
    '.aft-fb-btn.aft-fb-solo:hover{background:var(--cta-hover,#e4e4e7);transform:translateY(-1px)}' +
    '.aft-fb-overlay{position:fixed;inset:0;z-index:2147483001;display:none;' +
    'align-items:center;justify-content:center;padding:20px;' +
    'background:rgba(0,0,0,.6);backdrop-filter:blur(2px)}' +
    '.aft-fb-overlay.open{display:flex}' +
    '.aft-fb-panel{width:100%;max-width:440px;background:var(--panel,#0a0a0a);' +
    'color:var(--ink,#fafafa);border:1px solid var(--line-bright,#3f3f46);border-radius:14px;' +
    'padding:20px;font:14px/1.5 var(--font-sans,"Geist Variable","Geist","Segoe UI",system-ui,sans-serif);' +
    'box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '.aft-fb-panel h2{margin:0 0 4px;font-size:17px;font-weight:650}' +
    '.aft-fb-panel p.aft-fb-sub{margin:0 0 14px;color:var(--quiet,#a1a1aa);font-size:13px}' +
    '.aft-fb-panel label{display:block;margin:0 0 6px;font-size:12px;color:var(--quiet,#a1a1aa)}' +
    '.aft-fb-panel textarea,.aft-fb-panel input[type=email]{width:100%;box-sizing:border-box;' +
    'background:var(--bg-inset,#050505);color:var(--ink,#fafafa);border:1px solid var(--line,#27272a);' +
    'border-radius:9px;padding:10px 12px;font:inherit;resize:vertical}' +
    '.aft-fb-panel textarea{min-height:110px;margin-bottom:12px}' +
    '.aft-fb-panel input[type=email]{margin-bottom:14px}' +
    '.aft-fb-panel textarea:focus,.aft-fb-panel input:focus{outline:none;border-color:var(--line-bright,#3f3f46)}' +
    '.aft-fb-trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '.aft-fb-actions{display:flex;gap:10px;justify-content:flex-end;align-items:center}' +
    '.aft-fb-actions .aft-fb-status{margin-right:auto;font-size:12.5px;min-height:1em}' +
    '.aft-fb-status.ok{color:var(--good,#22c55e)}.aft-fb-status.error{color:var(--danger,#ff6b6b)}' +
    '.aft-fb-cancel{background:transparent;color:var(--quiet,#a1a1aa);border:1px solid var(--line,#27272a);' +
    'border-radius:9px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer}' +
    '.aft-fb-cancel:hover{color:var(--ink,#fafafa);border-color:var(--line-bright,#3f3f46)}' +
    '.aft-fb-send{background:var(--cta,#fff);color:var(--cta-ink,#000);border:1px solid var(--cta,#fff);' +
    'border-radius:9px;padding:9px 16px;font:inherit;font-weight:650;cursor:pointer}' +
    '.aft-fb-send:hover{background:var(--cta-hover,#e4e4e7)}' +
    '.aft-fb-send[disabled]{opacity:.6;cursor:default}' +
    '@media (max-width:520px){.aft-fb-dock,.aft-fb-btn.aft-fb-solo{right:14px;' +
    'bottom:calc(14px + env(safe-area-inset-bottom))}' +
    '.aft-fb-btn.aft-fb-solo{width:44px;height:44px;padding:0;justify-content:center;gap:0;font-size:0}' +
    '.aft-fb-brand{padding:9px 12px 9px 14px}.aft-fb-btn{padding:9px 14px}}';

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var icon =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12Z" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "aft-fb-btn" + (onPreview ? "" : " aft-fb-solo");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-label", "Send feedback");
  btn.innerHTML = icon + "Feedback";

  var mountTarget = btn;
  if (onPreview) {
    var dock = document.createElement("div");
    dock.className = "aft-fb-dock";
    dock.setAttribute("data-aft-chrome", "preview");

    var brand = document.createElement("a");
    brand.className = "aft-fb-brand";
    brand.href = "https://aft.page";
    brand.target = "_blank";
    brand.rel = "noopener noreferrer";
    brand.title = "aft.page";
    brand.setAttribute("aria-label", "aft.page home");
    brand.innerHTML = 'aft<span class="aft-fb-dot">.</span>page';

    dock.appendChild(brand);
    dock.appendChild(btn);
    mountTarget = dock;
  }

  var overlay = document.createElement("div");
  overlay.className = "aft-fb-overlay";
  overlay.innerHTML =
    '<div class="aft-fb-panel" role="dialog" aria-modal="true" aria-labelledby="aft-fb-title">' +
    '<h2 id="aft-fb-title">Send feedback</h2>' +
    '<p class="aft-fb-sub">Found a bug or have an idea? Tell us — we read every note.</p>' +
    '<form novalidate>' +
    '<label for="aft-fb-message">Your feedback</label>' +
    '<textarea id="aft-fb-message" name="message" required ' +
    'placeholder="What worked, what broke, what you wish it did…"></textarea>' +
    '<label for="aft-fb-email">Email (optional, if you want a reply)</label>' +
    '<input id="aft-fb-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" />' +
    '<div class="aft-fb-trap" aria-hidden="true">' +
    '<label for="aft-fb-company">Company</label>' +
    '<input id="aft-fb-company" name="company" type="text" tabindex="-1" autocomplete="off" />' +
    "</div>" +
    '<div class="aft-fb-actions">' +
    '<span class="aft-fb-status" role="status" aria-live="polite"></span>' +
    '<button type="button" class="aft-fb-cancel">Cancel</button>' +
    '<button type="submit" class="aft-fb-send">Send</button>' +
    "</div>" +
    "</form>" +
    "</div>";

  function mount() {
    document.body.appendChild(mountTarget);
    document.body.appendChild(overlay);
    document.addEventListener("click", function (e) {
      var link = e.target.closest("[data-aft-feedback]");
      if (!link) return;
      e.preventDefault();
      open();
    });
    injectFooterLink();
  }

  var form = overlay.querySelector("form");
  var panel = overlay.querySelector(".aft-fb-panel");
  var message = overlay.querySelector("#aft-fb-message");
  var email = overlay.querySelector("#aft-fb-email");
  var company = overlay.querySelector("#aft-fb-company");
  var status = overlay.querySelector(".aft-fb-status");
  var sendBtn = overlay.querySelector(".aft-fb-send");
  var cancelBtn = overlay.querySelector(".aft-fb-cancel");
  var lastFocus = null;

  function setStatus(text, kind) {
    status.textContent = text || "";
    status.className = "aft-fb-status" + (kind ? " " + kind : "");
  }

  function open() {
    lastFocus = document.activeElement;
    overlay.classList.add("open");
    setStatus("", "");
    setTimeout(function () {
      message.focus();
    }, 0);
    document.addEventListener("keydown", onKey);
  }

  function close() {
    overlay.classList.remove("open");
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  btn.addEventListener("click", open);
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("mousedown", function (e) {
    if (!panel.contains(e.target)) close();
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var text = message.value.trim();
    if (text.length < 2) {
      setStatus("Please add a little more detail.", "error");
      message.focus();
      return;
    }
    sendBtn.disabled = true;
    setStatus("Sending…", "");
    try {
      var res = await fetch(API + "/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          email: email.value.trim(),
          page: location.pathname + location.search,
          company: company.value,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        setStatus(data.message || "Couldn’t send right now. Please try again.", "error");
        return;
      }
      setStatus(data.message || "Thanks — your feedback is in.", "ok");
      message.value = "";
      email.value = "";
      setTimeout(close, 1400);
    } catch (err) {
      setStatus("Network error. Please try again.", "error");
    } finally {
      sendBtn.disabled = false;
    }
  });

  function injectFooterLink() {
    if (document.querySelector("[data-aft-feedback]")) return;
    var cols = document.querySelectorAll(".footer-col");
    for (var i = 0; i < cols.length; i++) {
      var h = cols[i].querySelector("h3");
      if (!h || h.textContent.trim().toLowerCase() !== "company") continue;
      var link = document.createElement("a");
      link.href = "#feedback";
      link.textContent = "Feedback";
      link.setAttribute("data-aft-feedback", "");
      var contact = cols[i].querySelector('a[href^="mailto:"]');
      if (contact) {
        cols[i].insertBefore(link, contact);
      } else {
        cols[i].appendChild(link);
      }
      return;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
