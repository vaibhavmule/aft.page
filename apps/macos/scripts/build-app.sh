#!/bin/sh
set -eu

app_root="$(cd "$(dirname "$0")/.." && pwd)"
build_root="$app_root/build"
app_path="$build_root/aft Drop.app"
contents="$app_path/Contents"
binary="$contents/MacOS/AftDrop"

mkdir -p "$build_root" "$contents/MacOS" "$contents/Resources"

if [ "${AFT_UNIVERSAL:-0}" = "1" ]; then
  swift build --package-path "$app_root" -c release \
    --triple arm64-apple-macosx14.0 \
    --scratch-path "$app_root/.build-arm64"
  swift build --package-path "$app_root" -c release \
    --triple x86_64-apple-macosx14.0 \
    --scratch-path "$app_root/.build-x86_64"
  lipo -create \
    "$app_root/.build-arm64/arm64-apple-macosx/release/AftDrop" \
    "$app_root/.build-x86_64/x86_64-apple-macosx/release/AftDrop" \
    -output "$binary"
else
  swift build --package-path "$app_root" -c release
  bin_path="$(swift build --package-path "$app_root" -c release --show-bin-path)"
  ditto "$bin_path/AftDrop" "$binary"
fi

ditto "$app_root/Resources/Info.plist" "$contents/Info.plist"
version="${AFT_VERSION:-0.1.0}"
build_number="${AFT_BUILD_NUMBER:-1}"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $version" "$contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build_number" "$contents/Info.plist"

icon_work="$(mktemp -d)"
trap 'rm -rf "$icon_work"' EXIT
iconset="$icon_work/AftDrop.iconset"
mkdir -p "$iconset"
if ! sips -s format png "$app_root/Resources/AppIcon.svg" --out "$icon_work/base.png" >/dev/null 2>&1; then
  ditto "$app_root/../../www/apple-touch-icon.png" "$icon_work/base.png"
fi
for spec in "16 icon_16x16" "32 icon_16x16@2x" "32 icon_32x32" "64 icon_32x32@2x" "128 icon_128x128" "256 icon_128x128@2x" "256 icon_256x256" "512 icon_256x256@2x" "512 icon_512x512" "1024 icon_512x512@2x"; do
  size="${spec%% *}"
  name="${spec#* }"
  sips -z "$size" "$size" "$icon_work/base.png" --out "$iconset/$name.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$contents/Resources/AftDrop.icns"

if [ -n "${AFT_CODESIGN_IDENTITY:-}" ]; then
  codesign --force --options runtime --timestamp --sign "$AFT_CODESIGN_IDENTITY" "$app_path"
else
  codesign --force --options runtime --sign - "$app_path"
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
printf '%s\n' "$app_path"
