#!/bin/sh
set -eu

app_root="$(cd "$(dirname "$0")/.." && pwd)"
source_app="$app_root/build/aft Drop.app"
target_app="/Applications/aft Drop.app"

test -d "$source_app"
ditto "$source_app" "$target_app"
launch_services="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
"$launch_services" -f "$target_app"
printf 'Installed %s\nRestart Codex if aft Drop is not immediately visible in Open in.\n' "$target_app"
