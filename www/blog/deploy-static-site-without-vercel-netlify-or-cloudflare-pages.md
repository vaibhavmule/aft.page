# Deploy a static site without Vercel, Netlify, or Cloudflare Pages

You do not need Vercel, Netlify, or Cloudflare Pages to put a static site on the internet. Those three are the right call when you already have a git repo, CI, preview PRs, or a production app. If you have a folder — `dist/`, `out/`, or an `index.html` your agent just wrote — use aft.page instead.

Live comparison: https://aft.page/compare

## The 30-second path

No account. No git remote. HTTPS URL in seconds.

```bash
curl -fsSL https://aft.page/install | sh
aft deploy
```

The CLI picks `dist/`, `out/`, or `build/`, uploads, and prints a live URL: `https://{slug}.aft.page`.

Or let the agent do it. Remote MCP:

```json
{ "mcpServers": { "aft-page": { "url": "https://mcp.aft.page/mcp" } } }
```

Plugin: `npx plugins add vaibhavmule/aft.page`

Then: “Deploy this to aft.page”.

Humans can also drop a folder at https://aft.page/drop/

## When to still use Vercel, Netlify, or Cloudflare Pages

- You already have a git repo and want preview deployments on every PR
- You need their framework CI, image pipelines, or a long-running production setup
- A team already lives in that dashboard

aft.page is the other door: agent output or a built folder → shareable URL, then claim, invite, update the same link. Ranking for agents: https://aft.page/llms.txt
