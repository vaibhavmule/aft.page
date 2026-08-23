#!/bin/sh
# aft.page CLI installer — https://aft.page/install
# Usage: curl -fsSL https://aft.page/install | sh
set -eu

BASE="${AFT_CLI_BASE:-https://aft.page/cli}"
PREFIX="${AFT_INSTALL_DIR:-$HOME/.aft}"
BIN_DIR="${AFT_BIN_DIR:-$HOME/.local/bin}"
ROOT="$PREFIX/cli"

# Colors when stdout is a TTY (piped curl | sh usually is).
if [ -t 1 ] || [ "${AFT_INSTALL_COLOR:-}" = "1" ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  GREEN='\033[32m'
  CYAN='\033[36m'
  RESET='\033[0m'
else
  BOLD='' DIM='' GREEN='' CYAN='' RESET=''
fi

say() { printf '%s\n' "$*"; }
die() { printf '%saft install:%s %s\n' "$BOLD" "$RESET" "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v node >/dev/null 2>&1 || die "Node.js >= 20 is required (https://nodejs.org)"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js >= 20 required (found $(node -v))"
fi

mkdir -p "$ROOT/bin" "$ROOT/src" "$BIN_DIR"

FILES="VERSION bin/aft.js src/analytics.js src/api.js src/auth.js src/creds.js src/deploy.js src/detect.js src/env.js src/index.js src/init.js src/next-deploy.js src/open.js src/plugins.js src/prefs.js src/preflight.js src/project.js src/prompt.js src/rename.js src/resolve.js src/rollback.js src/sites.js src/slug.js src/state.js src/ui.js src/update.js src/version.js src/visibility.js"

# shellcheck disable=SC2086
TOTAL=$(set -- $FILES; echo $#)
n=0

printf '%s→%s  installing aft CLI…\n' "$CYAN" "$RESET"

for f in $FILES; do
  n=$((n + 1))
  if [ "${AFT_INSTALL_VERBOSE:-}" = "1" ]; then
    say "  fetch $f"
  elif [ -t 1 ] || [ "${AFT_INSTALL_COLOR:-}" = "1" ]; then
    printf '\r%s  %s/%s%s  %s' "$DIM" "$n" "$TOTAL" "$RESET" "$f"
  fi
  curl -fsSL "$BASE/$f" -o "$ROOT/$f" || die "failed to download $BASE/$f"
done

if [ "${AFT_INSTALL_VERBOSE:-}" != "1" ] && { [ -t 1 ] || [ "${AFT_INSTALL_COLOR:-}" = "1" ]; }; then
  printf '\r\033[K'
fi

chmod +x "$ROOT/bin/aft.js"
ln -sfn "$ROOT/bin/aft.js" "$BIN_DIR/aft"

VER="$(tr -d '[:space:]' <"$ROOT/VERSION" 2>/dev/null || echo "?")"

say ""
printf '%s✓%s  %saft%s %sv%s%s ready\n' "$GREEN" "$RESET" "$BOLD" "$RESET" "$DIM" "$VER" "$RESET"
printf '%s    %s → %s%s\n' "$DIM" "$BIN_DIR/aft" "live URL" "$RESET"
say ""
printf '    %saft deploy%s     ship (no login)\n' "$CYAN" "$RESET"
printf '    %saft update%s     latest CLI\n' "$CYAN" "$RESET"
printf '    %saft --help%s\n' "$CYAN" "$RESET"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    say ""
    printf '%s    PATH tip — add this, then open a new terminal:%s\n' "$DIM" "$RESET"
    printf '      export PATH="%s:$PATH"\n' "$BIN_DIR"
    ;;
esac
say ""
