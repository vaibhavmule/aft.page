#!/usr/bin/env bash
# Orchestrate Next.js → Cloudflare via @opennextjs/cloudflare (no custom adapter).
# Usage: ./scripts/opennext-orchestrate.sh /path/to/next-app [worker-name]
set -euo pipefail

APP_DIR="${1:-}"
NAME="${2:-aft-next-demo}"
COMPAT_DATE="${COMPAT_DATE:-$(date -u +%Y-%m-%d)}"

if [[ -z "$APP_DIR" || ! -d "$APP_DIR" ]]; then
  echo "Usage: $0 /path/to/next-app [worker-name]" >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f package.json ]]; then
  echo "No package.json in $APP_DIR" >&2
  exit 1
fi

echo "==> Installing deps"
npm install --legacy-peer-deps

echo "==> Ensuring @opennextjs/cloudflare + wrangler"
npm install --save-dev @opennextjs/cloudflare wrangler --legacy-peer-deps

echo "==> OpenNext Cloudflare build (delegates to official adapter)"
npx opennextjs-cloudflare build

echo "==> Deploy with wrangler (authenticated account OR --temporary)"
if [[ "${AFT_TEMPORARY:-}" == "1" ]]; then
  npx wrangler deploy --temporary --name "$NAME" --compatibility-date "$COMPAT_DATE"
else
  npx wrangler deploy --name "$NAME"
fi

cat <<EOF

Next steps for aft.page lifecycle:
1. Note the workers.dev (or custom) URL from wrangler output.
2. Deploy a tiny aft site with aft.json:
   { "runtime": "next", "upstream": "<workers-url>" }
   plus a placeholder index.html (proxied away when upstream is set).
3. Claim / share / secrets via aft.page control plane.

Known CF constraint: Node.js middleware remains unsupported on the Cloudflare adapter.
EOF
