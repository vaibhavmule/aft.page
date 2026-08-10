/** Same tokens as apps/api/src/junk-path.ts — scanner probes, not a WAF. */
export const JUNK_PATH_TOKENS = [
  ".git",
  "wp-",
  ".env",
  ".php",
  "xmlrpc",
  "phpinfo",
  "cgi-bin",
];

export function isJunkPath(pathname) {
  const p = (pathname || "/").split("?")[0].toLowerCase();
  return JUNK_PATH_TOKENS.some((t) => p.includes(t));
}
