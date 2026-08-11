#!/bin/sh
# Sync apps/cli → www/cli (Pages install host). Run before pages deploy.
set -eu
root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$root/www/cli/bin" "$root/www/cli/src"
cp "$root/apps/cli/bin/aft.js" "$root/www/cli/bin/"
cp "$root/apps/cli/src/"*.js "$root/www/cli/src/"
echo "synced apps/cli → www/cli ($root)"
