/**
 * One marketing footer. Pages keep a <footer class="site-footer">; this
 * replaces it so chrome cannot drift (A structure + B square chrome + fade
 * giant — docs/footer-board-2026-08-09.md).
 */
(function () {
  if (window.__aftFooterMounted) return;
  window.__aftFooterMounted = true;

  var HTML =
    '<footer class="site-footer">' +
    '<div class="footer-inner">' +
    '<div class="footer-meta">' +
    '<a class="footer-status" href="https://status.aft.page">' +
    '<span class="status-dot" aria-hidden="true"></span>' +
    "All systems operational" +
    "</a>" +
    '<p class="footer-copy">© 2026 aft.page</p>' +
    "</div>" +
    '<div class="footer-top">' +
    '<div class="footer-brand-block">' +
    '<a class="footer-mark" href="/" aria-label="aft.page home">' +
    '<span class="footer-wordmark">aft<span class="sq" aria-hidden="true"></span>page</span>' +
    "</a>" +
    '<p class="footer-tagline">' +
    "Your agent made the app. aft makes it real.<br />" +
    "Live links. Invite teammates. Clear ownership." +
    "</p>" +
    "</div>" +
    '<div class="footer-cols">' +
    '<div class="footer-col">' +
    "<h3>Product</h3>" +
    '<a href="/docs">Docs</a>' +
    '<a href="/#pricing">Pricing</a>' +
    '<a href="/changelog">Changelog</a>' +
    '<a href="/drop">Drop</a>' +
    '<a href="/projects">Projects</a>' +
    "</div>" +
    '<div class="footer-col">' +
    "<h3>Agents</h3>" +
    '<a href="/mcp">MCP</a>' +
    '<a href="/plugins">Plugin</a>' +
    '<a href="/with/claude/">Claude Code</a>' +
    '<a href="/with/cursor/">Cursor</a>' +
    '<a href="/with/codex/">Codex</a>' +
    '<a href="/with/chatgpt/">ChatGPT</a>' +
    '<a href="/with/kilo/">Kilo</a>' +
    '<a href="/with/windsurf/">Windsurf</a>' +
    '<a href="/with/api/">API</a>' +
    "</div>" +
    '<div class="footer-col">' +
    "<h3>Company</h3>" +
    '<a href="https://status.aft.page">Status</a>' +
    '<a href="#feedback" data-aft-feedback>Feedback</a>' +
    '<a href="mailto:hello@aft.page">Contact</a>' +
    '<a href="/privacy/">Privacy</a>' +
    '<a href="/terms/">Terms</a>' +
    '<a href="/cookies/">Cookies</a>' +
    "</div>" +
    "</div>" +
    "</div>" +
    '<div class="footer-giant-wrap" aria-hidden="true">' +
    '<p class="footer-giant">aft<span class="sq" aria-hidden="true"></span></p>' +
    "</div>" +
    "</div>" +
    "</footer>";

  function mount() {
    document.querySelectorAll(".footer-giant-wrap").forEach(function (node) {
      if (!node.closest("footer.site-footer")) node.remove();
    });
    var footer = document.querySelector("footer.site-footer");
    if (!footer) return;
    footer.outerHTML = HTML;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
