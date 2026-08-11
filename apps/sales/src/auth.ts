/** Founder shared-secret gate for the sales agent. */

const COOKIE = "aft_sales_token";

export function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function isAuthorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const cookies = parseCookie(request.headers.get("Cookie"));
  if (cookies[COOKIE] === secret) return true;
  const auth = request.headers.get("Authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("token") === secret) return true;
  return false;
}

export function loginResponse(
  secret: string,
  redirectTo = "/",
  opts: { secure?: boolean } = {},
): Response {
  const headers = new Headers({ Location: redirectTo });
  const secure = opts.secure ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(secret)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=2592000`,
  );
  return new Response(null, { status: 302, headers });
}

export function unauthorizedHtml(): Response {
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>aft sales — login</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 24rem; margin: 4rem auto; padding: 0 1rem; }
  input, button { font: inherit; padding: 0.5rem 0.75rem; width: 100%; box-sizing: border-box; }
  button { margin-top: 0.75rem; cursor: pointer; }
  label { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; }
</style>
<body>
  <h1>aft sales</h1>
  <p>Founder only. Enter the shared secret.</p>
  <form method="post" action="/login">
    <label for="secret">Secret</label>
    <input id="secret" name="secret" type="password" autocomplete="current-password" required />
    <button type="submit">Enter</button>
  </form>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export { COOKIE };
