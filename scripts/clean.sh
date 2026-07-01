#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/dist" "$ROOT/releases" "$ROOT/safari-app"
echo "Removed generated dist, release, and Safari wrapper directories."
