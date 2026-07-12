#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$ROOT/safari-app}"
BUNDLE_ID="${BUNDLE_ID:-com.example.Pluck}"
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
  --swift

echo "Safari Xcode project created in: $OUTPUT"

PROJECT=$(find "$OUTPUT" -maxdepth 2 -name '*.xcodeproj' -print -quit 2>/dev/null || true)
if [[ -n "$PROJECT" && "${NO_OPEN:-0}" != "1" ]]; then
  open "$PROJECT"
fi
