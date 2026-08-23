/**
 * Thin top progress bar (NProgress-style).
 * window.AftProgress.start() / .done() / .wrap(promise)
 * Auto-starts on same-origin link clicks.
 */
(function (global) {
  if (global.AftProgress) return;

  const REDUCE =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  let depth = 0;
  let value = 0;
  let trickleTimer = null;
  let hideTimer = null;
  let el = null;
  let peg = null;

  function ensure() {
    if (el) return el;
    if (!document.getElementById("aft-progress-style")) {
      const style = document.createElement("style");
      style.id = "aft-progress-style";
      style.textContent = `
        #aft-progress {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          z-index: 99999;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        #aft-progress.is-active { opacity: 1; }
        #aft-progress.is-done {
          opacity: 0;
          transition: opacity 0.35s ease 0.12s;
        }
        #aft-progress-peg {
          height: 100%;
          width: 0%;
          background: var(--ink, #fafafa);
          box-shadow: 0 0 8px color-mix(in srgb, var(--ink, #fafafa) 45%, transparent);
          transform-origin: left;
          transition: width 0.2s ease;
        }
        @media (prefers-reduced-motion: reduce) {
          #aft-progress-peg {
            transition: none;
            width: 100% !important;
            opacity: 0.85;
            animation: aft-progress-pulse 1.1s ease-in-out infinite;
          }
          @keyframes aft-progress-pulse {
            0%, 100% { opacity: 0.35; }
            50% { opacity: 0.9; }
          }
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    el = document.createElement("div");
    el.id = "aft-progress";
    el.setAttribute("role", "progressbar");
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", "100");
    el.setAttribute("aria-hidden", "true");
    peg = document.createElement("div");
    peg.id = "aft-progress-peg";
    el.appendChild(peg);
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function setWidth(n) {
    value = Math.max(0, Math.min(n, 100));
    ensure();
    peg.style.width = `${value}%`;
    el.setAttribute("aria-valuenow", String(Math.round(value)));
  }

  function clearTrickle() {
    if (trickleTimer) {
      clearTimeout(trickleTimer);
      trickleTimer = null;
    }
  }

  function scheduleTrickle() {
    clearTrickle();
    if (REDUCE || depth <= 0) return;
    trickleTimer = setTimeout(() => {
      if (depth <= 0) return;
      const next = value + (value < 40 ? 8 : value < 70 ? 3 : value < 90 ? 1.2 : 0.3);
      setWidth(Math.min(next, 92));
      scheduleTrickle();
    }, 280 + Math.random() * 220);
  }

  function start() {
    ensure();
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    depth += 1;
    if (depth === 1) {
      el.classList.remove("is-done");
      el.classList.add("is-active");
      el.setAttribute("aria-hidden", "false");
      if (REDUCE) {
        setWidth(100);
      } else {
        setWidth(0);
        requestAnimationFrame(() => setWidth(12));
        scheduleTrickle();
      }
    }
  }

  function done() {
    if (depth <= 0) return;
    depth -= 1;
    if (depth > 0) return;
    clearTrickle();
    ensure();
    if (!REDUCE) setWidth(100);
    el.classList.add("is-done");
    el.setAttribute("aria-hidden", "true");
    hideTimer = setTimeout(() => {
      el.classList.remove("is-active", "is-done");
      setWidth(0);
      hideTimer = null;
    }, 420);
  }

  function wrap(promise) {
    start();
    return Promise.resolve(promise).finally(done);
  }

  function shouldTrackLink(a, e) {
    if (!a || e.defaultPrevented) return false;
    if (e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (a.hasAttribute("download")) return false;
    if (a.dataset.noProgress != null) return false;
    const target = (a.getAttribute("target") || "").toLowerCase();
    if (target && target !== "_self") return false;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
    let url;
    try {
      url = new URL(a.href, location.href);
    } catch (_) {
      return false;
    }
    if (url.origin !== location.origin) return false;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) return false;
    }
    return true;
  }

  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (shouldTrackLink(a, e)) start();
    },
    true,
  );

  window.addEventListener("pageshow", () => {
    depth = 0;
    clearTrickle();
    if (el) {
      el.classList.remove("is-active", "is-done");
      setWidth(0);
      el.setAttribute("aria-hidden", "true");
    }
  });
  window.addEventListener("pagehide", () => {
    depth = 0;
    clearTrickle();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && depth > 0) {
      depth = 1;
      done();
    }
  });

  global.AftProgress = { start, done, wrap };
})(typeof window !== "undefined" ? window : globalThis);
