#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$ROOT/safari-app}"
BUNDLE_ID="${BUNDLE_ID:-com.bbrizly.pluck}"
APP_NAME="${APP_NAME:-Pluck Pins}"

if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  TOOL="safari-web-extension-packager"
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  TOOL="safari-web-extension-converter"
else
  echo "Safari Web Extension packaging tool not found. Install or update Xcode first." >&2
  exit 1
fi

xcrun "$TOOL" "$ROOT/extension" \
  --project-location "$OUTPUT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --swift

echo "Safari Xcode project created in: $OUTPUT"

PROJECT=$(find "$OUTPUT" -maxdepth 2 -name '*.xcodeproj' -print -quit 2>/dev/null || true)
if [[ -n "$PROJECT" && "$APP_NAME" == "Pluck Pins" ]]; then
  TARGET_BUNDLE_ID="$BUNDLE_ID" /usr/bin/perl -0pi -e 's/PRODUCT_BUNDLE_IDENTIFIER = "?com\.bbrizly\.Pluck-Pins"?;/PRODUCT_BUNDLE_IDENTIFIER = $ENV{TARGET_BUNDLE_ID};/g' "$PROJECT/project.pbxproj"
  RESOURCE_ROOT="$ROOT/extension" \
  RESOURCE_ROOT_NO_SLASH="${ROOT#/}/extension" \
  TARGET_RESOURCE_PATH="../../../extension" \
    /usr/bin/perl -0pi -e 'my $target = $ENV{TARGET_RESOURCE_PATH}; my $abs = quotemeta($ENV{RESOURCE_ROOT}); my $no_slash = quotemeta($ENV{RESOURCE_ROOT_NO_SLASH}); s#(?:\.\./)+$no_slash#$target#g; s#$abs#$target#g' "$PROJECT/project.pbxproj"
fi

if [[ -n "$PROJECT" && "${NO_OPEN:-0}" != "1" ]]; then
  open "$PROJECT"
fi
