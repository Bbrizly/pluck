#!/usr/bin/env bash
# Take a Mac App Store screenshot at exactly 1280x800.
#
#   bash scripts/shot.sh hover 10
#   bash scripts/shot.sh popup 6
#
# The delay matters: the Copy button only exists while the pointer is over a
# pin, and reaching for a keyboard shortcut kills the hover. So the script
# counts down, you park the pointer, and it captures without you touching
# anything.
set -euo pipefail

NAME="${1:-shot}"
DELAY="${2:-10}"
OUT_DIR="store-assets/screenshots/macos"
RAW="$(mktemp -t pluckshot).png"

mkdir -p "$OUT_DIR"

echo "Capturing in ${DELAY}s. Park the pointer over a pin and hold still."
screencapture -T "$DELAY" -x "$RAW"

python3 - "$RAW" "$OUT_DIR/$NAME.png" <<'PY'
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
w, h = im.size
target = 1280 / 800

# Crop to 16:10 from the centre, then scale. Cropping beats padding here,
# the store shows these edge to edge and letterbox bars look like a mistake.
if w / h > target:
    nw = int(h * target)
    im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
else:
    nh = int(w / target)
    im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))

im.resize((1280, 800), Image.LANCZOS).save(dst)
print("wrote", dst)
PY

rm -f "$RAW"
