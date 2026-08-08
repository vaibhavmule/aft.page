/**
 * "Summarize this page" launcher: floating button + popover of AI tools.
 * Each opens a new chat with a browse-and-summarize prompt prefilled.
 * ChatGPT / Perplexity / Grok prefill via ?q=; Claude / Gemini also get the
 * prompt copied to the clipboard as a paste fallback (their param is flaky).
 * Self-contained — injects its own styles so it works on any page.
 */
(function () {
  if (window.__aftSummarizeMounted) return;
  window.__aftSummarizeMounted = true;

  function buildPrompt() {
    var url = location.href;
    return (
      "Summarize what aft.page offers based on this page: " +
      url +
      ". Cover what the product is, who it's for, pricing if mentioned, and " +
      "what makes it different from alternatives. Use plain language."
    );
  }

  // Official marks: Simple Icons (OpenAI/Claude/Gemini/Perplexity) + SVGL (Grok).
  var ICON = {
    chatgpt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>',
    claude: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>',
    gemini: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"/></svg>',
    perplexity: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z"/></svg>',
    grok: '<svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M395.479 633.828L735.91 381.105C752.599 368.715 776.454 373.548 784.406 392.792C826.26 494.285 807.561 616.253 724.288 699.996C641.016 783.739 525.151 802.104 419.247 760.277L303.556 814.143C469.49 928.202 670.987 899.995 796.901 773.282C896.776 672.843 927.708 535.937 898.785 412.476L899.047 412.739C857.105 231.37 909.358 158.874 1016.4 10.6326C1018.93 7.11771 1021.47 3.60279 1024 0L883.144 141.651V141.212L395.392 633.916"/><path d="M325.226 695.251C206.128 580.84 226.662 403.776 328.285 301.668C403.431 226.097 526.549 195.254 634.026 240.596L749.454 186.994C728.657 171.88 702.007 155.623 671.424 144.2C533.19 86.9942 367.693 115.465 255.323 228.382C147.234 337.081 113.244 504.215 171.613 646.833C215.216 753.423 143.739 828.818 71.7385 904.916C46.2237 931.893 20.6216 958.87 0 987.429L325.139 695.339"/></svg>',
  };


  var ARROW =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16 16 8M9 8h7v7"/></svg>';

  // Gemini routes through Google AI Mode (udm=50) — reliable ?q= prefill.
  // copy=true → clipboard fallback (Claude's param can drop on login redirect).
  var TOOLS = [
    { id: "chatgpt", name: "ChatGPT", base: "https://chatgpt.com/?q=", copy: false },
    { id: "claude", name: "Claude", base: "https://claude.ai/new?q=", copy: true },
    { id: "gemini", name: "Gemini", base: "https://www.google.com/search?udm=50&q=", copy: false },
    { id: "perplexity", name: "Perplexity", base: "https://www.perplexity.ai/search?q=", copy: false },
    { id: "grok", name: "Grok", base: "https://grok.com/?q=", copy: false },
  ];

  var css =
    '.aft-sum-btn{position:fixed;left:20px;bottom:20px;z-index:2147483000;' +
    'display:inline-flex;align-items:center;gap:8px;padding:10px 16px;' +
    'font:600 14px/1 var(--font-sans,"Geist","Segoe UI",system-ui,sans-serif);' +
    "color:var(--ink,#fafafa);background:var(--panel,#0a0a0a);" +
    "border:1px solid var(--line-bright,#3f3f46);border-radius:999px;cursor:pointer;" +
    "box-shadow:0 6px 24px rgba(0,0,0,.35);transition:transform .12s ease,border-color .12s ease}" +
    ".aft-sum-btn:hover{transform:translateY(-1px);border-color:var(--ink,#fafafa)}" +
    ".aft-sum-btn:focus-visible{outline:2px solid var(--good,#22c55e);outline-offset:2px}" +
    ".aft-sum-pop{position:fixed;left:20px;bottom:70px;z-index:2147483001;display:none;" +
    "width:300px;max-width:calc(100vw - 40px);background:var(--panel,#0a0a0a);color:var(--ink,#fafafa);" +
    "border:1px solid var(--line-bright,#3f3f46);border-radius:14px;padding:16px;" +
    'font:14px/1.5 var(--font-sans,"Geist","Segoe UI",system-ui,sans-serif);' +
    "box-shadow:0 20px 60px rgba(0,0,0,.5)}" +
    ".aft-sum-pop.open{display:block}" +
    ".aft-sum-pop h2{margin:0 0 3px;font-size:15px;font-weight:650}" +
    ".aft-sum-pop p.aft-sum-sub{margin:0 0 12px;color:var(--quiet,#a1a1aa);font-size:12.5px}" +
    ".aft-sum-row{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;" +
    "padding:9px 10px;margin:2px 0;background:transparent;color:var(--ink,#fafafa);" +
    "border:1px solid transparent;border-radius:9px;cursor:pointer;font:inherit;text-align:left}" +
    ".aft-sum-row:hover{background:var(--bg-inset,#050505);border-color:var(--line,#27272a)}" +
    ".aft-sum-row .aft-sum-mk{display:inline-flex;color:var(--ink,#fafafa)}" +
    ".aft-sum-row .aft-sum-nm{flex:1;font-weight:550}" +
    ".aft-sum-row .aft-sum-go{color:var(--faint,#52525b)}" +
    ".aft-sum-row:hover .aft-sum-go{color:var(--quiet,#a1a1aa)}" +
    ".aft-sum-hint{margin:8px 2px 0;min-height:1em;font-size:12px;color:var(--good,#22c55e)}" +
    "@media (max-width:520px){.aft-sum-btn{left:14px;bottom:14px}.aft-sum-pop{left:14px;bottom:64px}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "aft-sum-btn";
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z"/></svg>' +
    "Summarize";

  var pop = document.createElement("div");
  pop.className = "aft-sum-pop";
  pop.setAttribute("role", "menu");
  var rows =
    '<h2>Summarize this page</h2>' +
    '<p class="aft-sum-sub">Pick an AI. Opens a new chat with the prompt prefilled.</p>';
  for (var i = 0; i < TOOLS.length; i++) {
    var t = TOOLS[i];
    rows +=
      '<button type="button" class="aft-sum-row" role="menuitem" data-id="' +
      t.id +
      '">' +
      '<span class="aft-sum-mk">' +
      ICON[t.id] +
      "</span>" +
      '<span class="aft-sum-nm">' +
      t.name +
      "</span>" +
      '<span class="aft-sum-go">' +
      ARROW +
      "</span>" +
      "</button>";
  }
  rows += '<p class="aft-sum-hint" role="status" aria-live="polite"></p>';
  pop.innerHTML = rows;

  var hint = pop.querySelector(".aft-sum-hint");

  function openPop() {
    pop.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    hint.textContent = "";
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
  }
  function closePop() {
    pop.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", onOutside);
  }
  function onKey(e) {
    if (e.key === "Escape") closePop();
  }
  function onOutside(e) {
    if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePop();
  }

  btn.addEventListener("click", function () {
    if (pop.classList.contains("open")) closePop();
    else openPop();
  });

  pop.addEventListener("click", function (e) {
    var row = e.target.closest ? e.target.closest(".aft-sum-row") : null;
    if (!row) return;
    var id = row.getAttribute("data-id");
    var tool = null;
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) tool = TOOLS[i];
    if (!tool) return;

    var prompt = buildPrompt();
    // Clipboard write must stay synchronous inside the click gesture (Safari).
    if (tool.copy && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).catch(function () {});
      hint.textContent = "Prompt copied — paste it if it doesn’t autofill.";
    }
    window.open(tool.base + encodeURIComponent(prompt), "_blank", "noopener,noreferrer");
    if (!tool.copy) closePop();
  });

  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(pop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
