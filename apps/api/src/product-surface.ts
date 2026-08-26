/** Strip vendor guts from anything a visitor/agent might read (Run logs, reasons). */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/opennextjs-cloudflare/gi, "next build"],
  [/@opennextjs\/[^\s"'`]+/gi, "next"],
  [/\bOpenNext\b/gi, "Next.js"],
  [/\bopen-next\b/gi, "next"],
  [/wrangler deploy/gi, "deploy"],
  [/\bWrangler\b/g, ""],
  [/\bwrangler\b/g, ""],
  [/\bCloudflare Workers\b/gi, "aft"],
  [/\bCloudflare Pages\b/gi, "aft"],
  [/\bCloudflare for SaaS\b/gi, "custom domains"],
  [/\bCloudflare\b/gi, "aft"],
  [/\bworkers\.dev\b/gi, "aft.page"],
  [/\bDurable Objects?\b/gi, "runtime"],
  [/GitHub Actions/gi, "build runner"],
  [/\bGHA\b/g, "build runner"],
  [/ {2,}/g, " "],
];

export function scrubProductSurface(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const [re, to] of REPLACEMENTS) {
    out = out.replace(re, to);
  }
  return out.trim();
}
