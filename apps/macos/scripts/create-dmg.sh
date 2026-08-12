#!/bin/sh
set -eu

app_root="$(cd "$(dirname "$0")/.." && pwd)"
app_path="$app_root/build/aft Drop.app"
version="${AFT_VERSION:-0.1.0}"
dmg="$app_root/build/aft-drop-$version.dmg"

test -d "$app_path"
rm -f "$dmg"
hdiutil create -volname "aft Drop" -srcfolder "$app_path" -ov -format UDZO "$dmg"

if [ -n "${AFT_CODESIGN_IDENTITY:-}" ]; then
  codesign --force --timestamp --sign "$AFT_CODESIGN_IDENTITY" "$dmg"
fi

if [ -n "${APPLE_API_KEY_PATH:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER_ID:-}" ]; then
  xcrun notarytool submit "$dmg" --wait \
    --key "$APPLE_API_KEY_PATH" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER_ID"
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
fi

shasum -a 256 "$dmg" > "$dmg.sha256"
printf '%s\n' "$dmg"
