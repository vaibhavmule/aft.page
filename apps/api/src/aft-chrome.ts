/**
 * Host chrome on the live slug: claim / manage / growth badge.
 * Same injection hook as the old badge — not a second URL.
 *
 * ponytail: inline script is blocked by a strict CSP; most static deploys
 * have none. Worker/Next upstream is not HTML-rewritten (same as badge).
 */

export function injectAftChrome(
  html: string,
  opts: { slug: string; rootDomain: string; showBadge?: boolean },
): string {
  if (!/<body[\s>]/i.test(html) && !/<\/body>/i.test(html)) return html;
  if (/id=["']aft-chrome["']/i.test(html)) return html;

  const root = (opts.rootDomain || "aft.page")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  const showBadge = opts.showBadge !== false;
  const snippet = `<script id="aft-chrome">(function(){
var slug=${JSON.stringify(opts.slug)};
var root=${JSON.stringify(root)};
var api="https://api."+root;
var showBadge=${showBadge ? "true" : "false"};
var KEY="aft.editTokens";
function qs(){return new URLSearchParams(location.search)}
function token(){try{var m=JSON.parse(localStorage.getItem(KEY)||"{}");return m[slug]||""}catch(e){return ""}}
function saveTok(t){if(!t)return;try{var m=JSON.parse(localStorage.getItem(KEY)||"{}");m[slug]=t;localStorage.setItem(KEY,JSON.stringify(m))}catch(e){}}
function strip(keys){var q=qs(),n=0;keys.forEach(function(k){if(q.has(k)){q.delete(k);n++}});if(!n)return;var s=q.toString();history.replaceState(null,"",location.pathname+(s?"?"+s:"")+location.hash)}
var q=qs();if(q.get("token"))saveTok(q.get("token"));var justClaimed=q.get("claimed")==="1";strip(["token","claimed"]);
var host=document.createElement("div");
host.setAttribute("data-aft-chrome","1");
host.style.cssText="position:fixed;bottom:14px;right:14px;z-index:2147483000;font:600 12px/1.3 ui-sans-serif,system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:8px";
function pill(label,href,primary){var el=href?document.createElement("a"):document.createElement("button");if(href){el.href=href;el.target="_blank";el.rel="noopener noreferrer"}else el.type="button";el.textContent=label;el.style.cssText="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;text-decoration:none;cursor:pointer;border:1px solid rgba(255,255,255,.14);box-shadow:0 4px 16px rgba(0,0,0,.35);background:"+(primary?"#fff":"rgba(0,0,0,.82)")+";color:"+(primary?"#111":"#fafafa");return el}
function toast(msg){var t=document.createElement("div");t.textContent=msg;t.style.cssText="padding:6px 10px;border-radius:8px;background:#111;color:#fff;font-size:12px;max-width:16rem";host.appendChild(t);setTimeout(function(){t.remove()},2400)}
function showVisitor(){var el=document.createElement("a");el.href="https://"+root+"/?ref=badge";el.target="_blank";el.rel="noopener noreferrer";el.setAttribute("aria-label","aft.page");el.style.cssText="display:inline-flex;align-items:center;gap:7px;padding:6px 10px 6px 8px;border-radius:999px;text-decoration:none;cursor:pointer;border:1px solid rgba(255,255,255,.14);box-shadow:0 4px 16px rgba(0,0,0,.35);background:rgba(0,0,0,.82);color:#fafafa";el.innerHTML='<i style="width:7px;height:7px;border-radius:50%;background:#22c55e;flex:0 0 auto" aria-hidden="true"></i><span>aft<span style="color:#a1a1aa">.</span>page</span>';host.appendChild(el)}
function showOwner(manage){host.appendChild(pill("Manage",manage||("https://"+root+"/project/?slug="+encodeURIComponent(slug)),true));if(justClaimed)toast("Claimed — it's yours")}
function openClaim(email){
  var tok=token();
  if(email&&tok){claimSession();return}
  var overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:1rem";
  overlay.innerHTML='<div role="dialog" aria-modal="true" aria-labelledby="aft-claim-t" style="width:min(22rem,100%);background:#111;color:#fafafa;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:1rem 1.1rem;font:14px/1.45 ui-sans-serif,system-ui,sans-serif"><h2 id="aft-claim-t" style="margin:0 0 .35rem;font-size:1rem">Claim this site</h2><p style="margin:0 0 .75rem;color:#a1a1aa;font-size:.85rem">We\\'ll email a link to own <strong></strong>.</p><label style="display:block;font-size:.75rem;margin:0 0 .25rem;color:#a1a1aa">Email</label><input id="aft-claim-email" type="email" autocomplete="email" style="width:100%;box-sizing:border-box;margin:0 0 .65rem;padding:.55rem .65rem;border-radius:6px;border:1px solid #333;background:#0a0a0a;color:#fff;font:inherit"/><div id="aft-claim-tokwrap"><label style="display:block;font-size:.75rem;margin:0 0 .25rem;color:#a1a1aa">Edit token</label><input id="aft-claim-token" autocomplete="off" placeholder="aft_edit_…" style="width:100%;box-sizing:border-box;margin:0 0 .65rem;padding:.55rem .65rem;border-radius:6px;border:1px solid #333;background:#0a0a0a;color:#fff;font:inherit"/></div><div style="display:flex;gap:.5rem;justify-content:flex-end"><button type="button" id="aft-claim-x" style="padding:.45rem .75rem;border-radius:6px;border:0;background:transparent;color:#a1a1aa;font:inherit;cursor:pointer">Cancel</button><button type="button" id="aft-claim-go" style="padding:.45rem .85rem;border-radius:6px;border:0;background:#fff;color:#111;font:inherit;font-weight:650;cursor:pointer">Send link</button></div></div>';
  overlay.querySelector("strong").textContent=slug+"."+root;
  var em=overlay.querySelector("#aft-claim-email");
  var tk=overlay.querySelector("#aft-claim-token");
  em.value=email||"";
  if(tok){overlay.querySelector("#aft-claim-tokwrap").hidden=true;tk.value=tok}
  function close(){overlay.remove()}
  overlay.addEventListener("click",function(e){if(e.target===overlay)close()});
  overlay.querySelector("#aft-claim-x").addEventListener("click",close);
  overlay.querySelector("#aft-claim-go").addEventListener("click",async function(){
    var emailVal=em.value.trim();
    var tokVal=tk.value.trim()||token();
    if(!emailVal||!tokVal){toast("Email and edit token required");return}
    saveTok(tokVal);
    var btn=overlay.querySelector("#aft-claim-go");btn.disabled=true;btn.textContent="Sending…";
    try{
      var res=await fetch(api+"/v1/claim/start",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({slug:slug,email:emailVal,editToken:tokVal})});
      var data=await res.json().catch(function(){return {}});
      if(!res.ok){toast(data.error==="already_claimed"?"Already claimed":data.error==="email_failed"?"Email not configured":"Couldn't send email");btn.disabled=false;btn.textContent="Send link";return}
      close();toast("Check your email");
    }catch(e){toast("Network error");btn.disabled=false;btn.textContent="Send link"}
  });
  document.body.appendChild(overlay);em.focus();
}
async function claimSession(){
  try{
    var res=await fetch(api+"/v1/claim/session",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({slug:slug,editToken:token()||undefined})});
    var data=await res.json().catch(function(){return {}});
    if(res.ok){toast(data.already?"Already yours":"Claimed — it's yours");location.reload();return}
    if(data.error==="edit_token_required"){toast("Need the edit token to claim");openClaim(null);return}
    toast(data.error==="already_claimed"?"Already claimed":"Couldn't claim");
  }catch(e){toast("Network error")}
}
function showClaim(email){
  var b=pill(email?"Claim as "+(email.length>22?email.slice(0,20)+"…":email):"Claim this site",null,true);
  b.addEventListener("click",function(){if(email&&token())claimSession();else openClaim(email)});
  host.appendChild(b);
}
function mount(){
  document.body.appendChild(host);
  fetch(api+"/v1/sites/"+encodeURIComponent(slug),{credentials:"include"}).then(function(r){return r.ok?r.json():null}).then(function(info){
    if(!info){if(showBadge)showVisitor();return}
    if(info.owner){showOwner(info.manage);return}
    if(!info.owned){showClaim(info.email);return}
    if(showBadge)showVisitor();
  }).catch(function(){if(showBadge)showVisitor()});
}
if(document.body)mount();else document.addEventListener("DOMContentLoaded",mount);
})();</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}</body>`);
  }
  return `${html}${snippet}`;
}
