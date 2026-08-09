/**
 * Compact Agents mega-menu: click / hover / keyboard / Escape.
 * Mounts on [data-nav-mega] inside .topnav-links.
 */
(function () {
  const OPEN_DELAY = 80;
  const CLOSE_DELAY = 160;

  function initMega(root) {
    const trigger = root.querySelector(".nav-mega-trigger");
    const panel = root.querySelector(".nav-mega-panel");
    if (!trigger || !panel) return;

    let openTimer = 0;
    let closeTimer = 0;
    let hoverMode = false;

    function setOpen(open) {
      root.classList.toggle("is-open", open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    }

    function openSoon() {
      window.clearTimeout(closeTimer);
      window.clearTimeout(openTimer);
      openTimer = window.setTimeout(() => setOpen(true), OPEN_DELAY);
    }

    function closeSoon() {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => setOpen(false), CLOSE_DELAY);
    }

    function closeNow() {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      setOpen(false);
    }

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      hoverMode = false;
      setOpen(trigger.getAttribute("aria-expanded") !== "true");
    });

    root.addEventListener("mouseenter", () => {
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        hoverMode = true;
        openSoon();
      }
    });

    root.addEventListener("mouseleave", () => {
      if (hoverMode) closeSoon();
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
        const first = panel.querySelector("a");
        if (first) first.focus();
      }
    });

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNow();
        trigger.focus();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && root.classList.contains("is-open")) {
        closeNow();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (!root.contains(event.target)) closeNow();
    });
  }

  function boot() {
    document.querySelectorAll("[data-nav-mega]").forEach(initMega);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
