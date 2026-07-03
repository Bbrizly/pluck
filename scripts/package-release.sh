#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"

node "$ROOT/scripts/build-browsers.mjs"
rm -rf "$ROOT/releases"
mkdir -p "$ROOT/releases"

for target in safari chromium firefox; do
  archive="$ROOT/releases/pluck-${target}-${VERSION}.zip"
  (
    cd "$ROOT/dist/$target"
    zip -q -r "$archive" . -x '*.DS_Store'
  )
  echo "Created $archive"
done
