/**
 * aftWebmcp — guard + registration helper for the W3C WebMCP draft API
 * (document.modelContext). Registers tools on the NATIVE API only; no polyfill.
 * No-ops cleanly where the API does not exist so pages degrade gracefully:
 * callers gate on isSupported(), which is the only opt-in — there is no query
 * flag. The API is exposed solely in origin-isolated documents, so a surface
 * that registers tools must also send Origin-Agent-Cluster: ?1 (see _headers).
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 */
(function () {
  "use strict";

  const TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/;
  const REGISTRY = Object.create(null);

  /** True when the browser actually exposes document.modelContext. */
  function isSupported() {
    if (typeof document === "undefined") return false;
    const mc = document.modelContext;
    return Boolean(
      mc &&
        typeof mc.registerTool === "function" &&
        typeof mc.getTools === "function" &&
        typeof mc.executeTool === "function",
    );
  }

  /**
   * Validate a tool name per the spec: 1–128 chars, ASCII alphanumeric plus
   * underscore, hyphen, and full stop. Returns an error string or null.
   */
  function validateName(name) {
    if (typeof name !== "string" || name.length === 0) {
      return "tool name must be a non-empty string";
    }
    if (!TOOL_NAME_RE.test(name)) {
      return "tool name must be 1-128 chars of [A-Za-z0-9_.-]";
    }
    return null;
  }

  /**
   * Register tools on document.modelContext. Each tool is { name, title,
   * description, inputSchema, execute }. Options: { readOnlyHint,
   * consequentialHint, untrustedContentHint } — applied to every tool unless the
   * tool supplies its own annotations.
   *
   * Resolves to the number of tools successfully registered. Rejections
   * (duplicate name, invalid schema, aborted signal) are caught per-tool and
   * reported via console.warn so one bad tool never breaks the rest.
   */
  async function registerTools(tools, options) {
    if (!isSupported()) {
      if (tools && tools.length) {
        console.warn("[aftWebmcp] document.modelContext unavailable; tools not registered.");
      }
      return 0;
    }
    if (!Array.isArray(tools)) return 0;

    const opts = options || {};
    const annotations = {};
    if (opts.readOnlyHint) annotations.readOnlyHint = true;
    if (opts.untrustedContentHint) annotations.untrustedContentHint = true;
    if (opts.consequentialHint) annotations.consequentialHint = true;

    let registered = 0;
    const mc = document.modelContext;

    for (const tool of tools) {
      if (!tool || typeof tool.execute !== "function") {
        console.warn("[aftWebmcp] skipping tool without execute()", tool && tool.name);
        continue;
      }
      const nameError = validateName(tool.name);
      if (nameError) {
        console.warn(`[aftWebmcp] skipping tool ${tool.name}: ${nameError}`);
        continue;
      }
      if (!tool.description || !tool.description.length) {
        console.warn(`[aftWebmcp] skipping tool ${tool.name}: description is required`);
        continue;
      }
      // Never register the same name twice from a shared registry.
      if (REGISTRY[tool.name]) continue;
      REGISTRY[tool.name] = true;

      const payload = {
        name: tool.name,
        description: tool.description,
        execute: tool.execute,
      };
      if (typeof tool.title === "string" && tool.title.length) payload.title = tool.title;
      if (tool.inputSchema && typeof tool.inputSchema === "object") {
        payload.inputSchema = tool.inputSchema;
      }
      // Spec annotations: tool-level wins, else the batch option.
      const mergedAnnotations = Object.assign({}, annotations, tool.annotations || {});
      if (Object.keys(mergedAnnotations).length) payload.annotations = mergedAnnotations;

      try {
        await mc.registerTool(payload);
        registered += 1;
      } catch (err) {
        delete REGISTRY[tool.name];
        console.warn(`[aftWebmcp] registerTool(${tool.name}) failed:`, err);
      }
    }
    return registered;
  }

  /**
   * Same-origin confirmation gate for consequential tools. Renders a small modal
   * and resolves true only when the human clicks the confirm button. Returns
   * false on cancel / dismiss / Escape. This is the consent boundary before a
   * tool performs a real-world action (publish, rollback).
   */
  function confirm(opts) {
    const o = opts || {};
    const title = o.title || "Confirm action";
    const message = o.message || "Allow this action?";
    const confirmLabel = o.confirmLabel || "Approve";
    const cancelLabel = o.cancelLabel || "Cancel";

    return new Promise((resolve) => {
      if (typeof document === "undefined") {
        resolve(false);
        return;
      }
      const hostId = "aft-webmcp-confirm";
      if (document.getElementById(hostId)) {
        // Only one confirmation at a time; a second request declines.
        resolve(false);
        return;
      }

      const overlay = document.createElement("div");
      overlay.id = hostId;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", hostId + "-title");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:1rem";

      const box = document.createElement("div");
      box.setAttribute(
        "style",
        "width:min(24rem,100%);background:#fff;color:#111;border-radius:10px;padding:1rem 1.1rem;" +
          "font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.35)",
      );

      const h = document.createElement("h2");
      h.id = hostId + "-title";
      h.textContent = title;
      h.style.cssText = "margin:0 0 .35rem;font-size:1rem";

      const p = document.createElement("p");
      p.textContent = message;
      p.style.cssText = "margin:0 0 .85rem;color:#52525b;font-size:.875rem;white-space:pre-wrap";

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:.5rem;justify-content:flex-end";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = cancelLabel;
      cancel.style.cssText =
        "padding:.45rem .8rem;border-radius:6px;border:1px solid #d4d4d8;background:#fff;color:#111;font:inherit;cursor:pointer";

      const go = document.createElement("button");
      go.type = "button";
      go.textContent = confirmLabel;
      go.style.cssText =
        "padding:.45rem .85rem;border-radius:6px;border:0;background:#111;color:#fff;font:inherit;font-weight:650;cursor:pointer";

      function finish(ok) {
        if (!overlay.parentNode) return;
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(ok);
      }
      function onKey(e) {
        if (e.key === "Escape") finish(false);
      }

      cancel.addEventListener("click", () => finish(false));
      go.addEventListener("click", () => finish(true));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(false);
      });
      document.addEventListener("keydown", onKey);

      actions.appendChild(cancel);
      actions.appendChild(go);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      go.focus();
    });
  }

  /**
   * Convenience for demos / snippets: invoke a registered tool by name with a
   * plain input object. Resolves to the stringified result (per spec,
   * executeTool resolves to a DOMString).
   */
  async function invoke(name, input) {
    if (!isSupported()) throw new Error("WebMCP is not available in this browser.");
    const tools = await document.modelContext.getTools();
    const tool = (tools || []).find((t) => t.name === name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    return document.modelContext.executeTool(tool, input == null ? {} : input);
  }

  window.aftWebmcp = {
    isSupported,
    registerTools,
    confirm,
    validateName,
    invoke,
  };
  // Friendly handle for copy-paste snippets: await window.__aftWebMCP.invoke(...)
  window.__aftWebMCP = { invoke };
})();
