/**
 * Accessible, small-screen navigation drawer for the homepage.
 */
(function () {
  function init() {
    const drawer = document.querySelector("[data-mobile-nav]");
    const openButton = document.querySelector("[data-mobile-nav-open]");
    const closeButton = drawer && drawer.querySelector("[data-mobile-nav-close]");

    if (!drawer || !openButton || !closeButton) return;

    let lastFocus = null;

    function focusableItems() {
      return [...drawer.querySelectorAll("a[href], button:not([disabled]), summary")]
        .filter((element) => element.getClientRects().length > 0);
    }

    function open() {
      lastFocus = document.activeElement;
      drawer.hidden = false;
      document.body.classList.add("mobile-nav-open");
      openButton.setAttribute("aria-expanded", "true");
      closeButton.focus();
    }

    function close(options) {
      const restoreFocus = !options || options.restoreFocus !== false;
      drawer.hidden = true;
      document.body.classList.remove("mobile-nav-open");
      openButton.setAttribute("aria-expanded", "false");

      if (restoreFocus && lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", () => close());

    drawer.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (link) close();
    });

    drawer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusableItems();
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    const desktopQuery = window.matchMedia("(min-width: 761px)");
    const closeAtDesktop = (event) => {
      if (event.matches && !drawer.hidden) close({ restoreFocus: false });
    };

    if (desktopQuery.addEventListener) {
      desktopQuery.addEventListener("change", closeAtDesktop);
    } else {
      desktopQuery.addListener(closeAtDesktop);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
