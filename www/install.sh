#!/bin/sh
# aft.page CLI installer — https://aft.page/install
# Usage: curl -fsSL https://aft.page/install | sh
set -eu

BASE="${AFT_CLI_BASE:-https://aft.page/cli}"
PREFIX="${AFT_INSTALL_DIR:-$HOME/.aft}"
BIN_DIR="${AFT_BIN_DIR:-$HOME/.local/bin}"
ROOT="$PREFIX/cli"

say() { printf '%s\n' "$*"; }
die() { say "aft install: $*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v node >/dev/null 2>&1 || die "Node.js >= 20 is required (https://nodejs.org)"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js >= 20 required (found $(node -v))"
fi

mkdir -p "$ROOT/bin" "$ROOT/src" "$BIN_DIR"

FILES="bin/aft.js src/api.js src/auth.js src/creds.js src/deploy.js src/index.js src/plugins.js src/state.js"
for f in $FILES; do
  say "fetch $f"
  curl -fsSL "$BASE/$f" -o "$ROOT/$f" || die "failed to download $BASE/$f"
done

chmod +x "$ROOT/bin/aft.js"
ln -sfn "$ROOT/bin/aft.js" "$BIN_DIR/aft"

say ""
say "Installed aft → $BIN_DIR/aft"
say "  aft login"
say "  aft deploy"
say "  aft plugins add"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    say ""
    say "Add to PATH (then re-open the terminal):"
    say "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
