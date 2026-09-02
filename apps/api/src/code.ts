/** POST /v1/code/generate — prompt or template → HTML. Client deploys. */
import type { Env } from "./env";
import { hasAiBinding, runGatewayChat } from "./ai-gateway";
import { resolveSessionUser } from "./auth";
import { corsHeaders, json, optionsResponse, isLoopbackRequest } from "./http";
import { rateLimit } from "./rate-limit";

export const CODE_TEMPLATES = ["todo", "contact", "tracker"] as const;
export type CodeTemplateId = (typeof CODE_TEMPLATES)[number];

const SYSTEM = `You generate a single complete HTML document for aft.page.
Rules:
- One file: <!DOCTYPE html> … </html>
- Inline CSS only. Black background #000, white text, hairline #27272a borders.
- If the app needs data, use localStorage. Do not invent Cloudflare D1 bindings.
- No markdown, no fences, no explanation. HTML only.`;

export function isCodeTemplateId(id: string): id is CodeTemplateId {
  return (CODE_TEMPLATES as readonly string[]).includes(id);
}

export function htmlFromModelText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || trimmed).trim();
  if (/<!doctype html|<html[\s>]/i.test(raw)) return raw;
  if (raw.length < 40) return null;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>App</title><style>body{margin:0;background:#000;color:#fafafa;font-family:system-ui,sans-serif;padding:1.5rem}</style></head><body>${raw}</body></html>`;
}

export function templateHtml(id: CodeTemplateId): string {
  const title =
    id === "todo" ? "Todo" : id === "contact" ? "Contact" : "Tracker";
  const body =
    id === "todo"
      ? `<h1>Todo</h1><form id=f><input id=t placeholder="Add a task" /><button type=submit>Add</button></form><ul id=l></ul>
<script>
const k="aft-todo";
const l=document.getElementById("l");
const load=()=>JSON.parse(localStorage.getItem(k)||"[]");
const save=a=>localStorage.setItem(k,JSON.stringify(a));
function render(){l.innerHTML="";load().forEach((t,i)=>{const li=document.createElement("li");li.textContent=t;li.tabIndex=0;li.setAttribute("aria-label","remove "+t);const go=()=>{const a=load();a.splice(i,1);save(a);render()};li.onclick=go;li.onkeydown=e=>{if(e.key==="Enter"||e.key===" ")go()};l.append(li)})}
document.getElementById("f").onsubmit=e=>{e.preventDefault();const v=document.getElementById("t").value.trim();if(!v)return;save(load().concat(v));document.getElementById("t").value="";render()};
render();
</script>`
      : id === "contact"
        ? `<h1>Contact</h1><form id=f><label>Name <input name=name required /></label><label>Email <input name=email type=email required /></label><label>Message <textarea name=msg required></textarea></label><button type=submit>Send</button></form><p id=ok hidden>Saved locally.</p>
<script>
document.getElementById("f").onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);const rows=JSON.parse(localStorage.getItem("aft-contact")||"[]");rows.push(Object.fromEntries(fd));localStorage.setItem("aft-contact",JSON.stringify(rows));document.getElementById("ok").hidden=false};
</script>`
        : `<h1>Tracker</h1><form id=f><input id=t placeholder="What happened" /><button type=submit>Log</button></form><ul id=l></ul>
<script>
const k="aft-tracker";
const l=document.getElementById("l");
const load=()=>JSON.parse(localStorage.getItem(k)||"[]");
const save=a=>localStorage.setItem(k,JSON.stringify(a));
function render(){l.innerHTML="";load().forEach(r=>{const li=document.createElement("li");li.textContent=r;l.append(li)})}
document.getElementById("f").onsubmit=e=>{e.preventDefault();const v=document.getElementById("t").value.trim();if(!v)return;save([new Date().toISOString().slice(0,16)+" "+v].concat(load()));document.getElementById("t").value="";render()};
render();
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body{margin:0;background:#000;color:#fafafa;font-family:system-ui,sans-serif;padding:1.5rem;max-width:32rem}
  h1{letter-spacing:-.03em}
  input,textarea,button{font:inherit}
  input,textarea{width:100%;box-sizing:border-box;background:#0a0a0a;color:#fafafa;border:1px solid #27272a;border-radius:.4rem;padding:.55rem .7rem;margin:.35rem 0}
  button{background:#fff;color:#000;border:0;border-radius:.4rem;padding:.55rem 1rem;font-weight:600;cursor:pointer}
  label{display:block;margin:.65rem 0;color:#a1a1aa;font-size:.88rem}
  ul{list-style:none;padding:0}
  li{border-top:1px solid #27272a;padding:.55rem 0;cursor:pointer}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function handleCodeGenerate(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return optionsResponse(origin, true);
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const creds = Object.fromEntries(corsHeaders(origin, true));

  let body: { prompt?: unknown; template?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, creds);
  }

  const template =
    typeof body.template === "string" ? body.template.trim().toLowerCase() : "";
  const user = await resolveSessionUser(env, request);
  const loopback = isLoopbackRequest(request);
  const rlKey = user
    ? `code:${user.id}`
    : `code:anon:${request.headers.get("cf-connecting-ip") || "local"}`;
  if (!(await rateLimit(env, rlKey, 20, 3600))) {
    return json({ error: "rate_limited" }, 429, creds);
  }

  if (template) {
    if (!isCodeTemplateId(template)) {
      return json({ error: "unknown_template" }, 400, creds);
    }
    return json(
      {
        html: templateHtml(template),
        source: "template",
        template,
      },
      200,
      creds,
    );
  }

  if (!user && !loopback) return json({ error: "unauthorized" }, 401, creds);

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) return json({ error: "empty_prompt" }, 400, creds);
  if (prompt.length > 4000) return json({ error: "prompt_too_long" }, 413, creds);

  if (!hasAiBinding(env)) {
    return json(
      { error: "ai_unavailable", hint: "AI Gateway binding not on this Worker yet." },
      503,
      creds,
    );
  }

  const result = await runGatewayChat(env, [
    { role: "system", content: SYSTEM },
    { role: "user", content: prompt },
  ]);
  if (!result) {
    return json({ error: "generate_failed" }, 502, creds);
  }
  const html = htmlFromModelText(result.text);
  if (!html) return json({ error: "generate_failed" }, 502, creds);

  return json({ html, source: "model", model: result.model }, 200, creds);
}
