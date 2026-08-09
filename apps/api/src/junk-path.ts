/**
 * Obvious scanner probes. Not a WAF — unknown junk still SPA-falls-back.
 * ponytail: token list is the ceiling; scanners invent new paths.
 */
export const JUNK_PATH_TOKENS = [
  ".git",
  "wp-",
  ".env",
  ".php",
  "xmlrpc",
  "phpinfo",
  "cgi-bin",
] as const;

export function isJunkPath(pathname: string): boolean {
  const p = (pathname || "/").split("?")[0]!.toLowerCase();
  return JUNK_PATH_TOKENS.some((t) => p.includes(t));
}

export function junkPathLikeBinds(): string[] {
  return JUNK_PATH_TOKENS.map((t) => `%${t}%`);
}

export function junkPathSqlOr(column = "path"): string {
  return JUNK_PATH_TOKENS.map(() => `lower(${column}) LIKE ?`).join(" OR ");
}
