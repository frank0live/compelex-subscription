#!/usr/bin/env bash
# Rebuild src/fonts/vazirmatn-arabic-subset.woff2 from a pinned upstream release.
#
# The committed binary is reproducible: same upstream archive plus same flags
# produces the same bytes, so nobody has to trust a font blob in the repository.
#
# Requires: python3 with fonttools and brotli, curl, tar, sha512sum.
#   python3 -m pip install fonttools brotli

set -euo pipefail

VERSION="33.0.3"                     # upstream tag v33.003
ARCHIVE="https://registry.npmjs.org/vazirmatn/-/vazirmatn-${VERSION}.tgz"
ARCHIVE_SHA512="fbjNc0CMjazZpIegWzz9OHGzI1APFboT+x7ZecXlUCtDe/nkyx7gtCTZnWS/+eeXG7fbfXymCPKJI8EsnM3iqw=="
SOURCE_FONT="package/misc/Non-Latin/fonts/variable/Vazirmatn-NL[wght].ttf"

# Arabic block, Persian digits, ZWNJ/ZWJ and bidi marks, presentation forms,
# bidi isolates, and the punctuation the interface actually emits.
UNICODES="U+0600-06FF,U+200C-200F,U+2066-2069,U+FB50-FDFF,U+FE70-FEFF,U+00A0,U+00AB,U+00BB,U+2013,U+2014,U+2026"

# Cursive joining (init/medi/fina/rlig/calt), Persian locale forms, tabular
# digits for the live-updating values, and mark positioning.
FEATURES="calt,ccmp,fina,init,liga,locl,medi,rlig,ss01,tnum,kern,mark,mkmk"

# Body 400, headings 600, display 700. Pinning the axis to the used range drops
# about 12 KB of weight space that nothing on the page reaches.
WGHT="400:700"

PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for candidate in python3 python; do
    if "$candidate" -c 'import fontTools, brotli' >/dev/null 2>&1; then
      PY="$candidate"
      break
    fi
  done
fi
if [ -z "$PY" ]; then
  echo "No python with fonttools and brotli found." >&2
  echo "Install them, or set PYTHON=/path/to/python." >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/src/fonts/vazirmatn-arabic-subset.woff2"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Git Bash on Windows hands POSIX paths to a native python that cannot resolve
# them, so every path crossing that boundary goes through cygpath when present.
native() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

echo "Downloading vazirmatn ${VERSION}"
curl -sSL -o "$work/vazirmatn.tgz" "$ARCHIVE"

actual="$(openssl dgst -sha512 -binary "$work/vazirmatn.tgz" | openssl base64 -A)"
if [ "$actual" != "$ARCHIVE_SHA512" ]; then
  echo "Archive digest mismatch." >&2
  echo "  expected sha512-$ARCHIVE_SHA512" >&2
  echo "  actual   sha512-$actual" >&2
  exit 1
fi

tar -xzf "$work/vazirmatn.tgz" -C "$work" --no-wildcards "$SOURCE_FONT"

echo "Pinning wght to ${WGHT}"
"$PY" -m fontTools.varLib.instancer \
  "$(native "$work/$SOURCE_FONT")" "wght=$WGHT" \
  -o "$(native "$work/pinned.ttf")" >/dev/null

echo "Subsetting"
"$PY" -m fontTools.subset "$(native "$work/pinned.ttf")" \
  --unicodes="$UNICODES" \
  --layout-features="$FEATURES" \
  --flavor=woff2 \
  --no-hinting \
  --desubroutinize \
  --drop-tables+=DSIG \
  --name-IDs='' \
  --output-file="$(native "$out")"

size="$(wc -c <"$out")"
printf 'Wrote %s\n  %s bytes woff2, %s bytes as base64\n' \
  "${out#"$root"/}" "$size" "$(( (size + 2) / 3 * 4 ))"
"$PY" - "$(native "$out")" <<'PY'
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
print(f"  {len(f.getGlyphOrder())} glyphs, {len(f['cmap'].getBestCmap())} cmap entries")
PY
