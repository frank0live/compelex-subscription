#!/usr/bin/env bash
# Rebuild src/fonts/twemoji-country-flags.woff2 from a pinned upstream release.
#
# The page draws a country's flag from the two regional-indicator letters in a
# node's name. Windows has no font with those glyphs, so Chromium-based browsers
# there print the two letters instead of a flag. This face carries the Twemoji
# flags and is applied to the flag badge only, through unicode-range, so every
# platform draws the same flag and nothing else on the page changes.
#
# The committed binary is reproducible: the same upstream archive and the same
# steps produce the same bytes, so nobody has to trust a font blob in the
# repository.
#
# Requires: python3 with fonttools and brotli, curl, tar, openssl.
#   python3 -m pip install fonttools brotli

set -euo pipefail

VERSION="0.1.10"                     # npm country-flag-emoji-polyfill
ARCHIVE="https://registry.npmjs.org/country-flag-emoji-polyfill/-/country-flag-emoji-polyfill-${VERSION}.tgz"
ARCHIVE_SHA512="5O50p2mq/d8+4AfHz3monRQaBA4TIQ0XcKqJUhCYR6SMsLqlO4m8f87og6R1D68Z1sNXGkjLkcEccuzC6T9i5g=="
SOURCE_FONT="package/dist/TwemojiCountryFlags.woff2"

# The regional indicator symbols, and nothing else: the three subdivision
# flags (England, Scotland, Wales) are tag sequences the page never draws.
UNICODES="U+1F1E6-1F1FF"

# 512 units per em is far finer than a badge 16 to 34 px tall can show. At 64
# a unit is a third of a pixel on a 20 px badge, so the flags are drawn the same
# and the file is a third smaller. 32 visibly shifts some stripe proportions.
UPEM=64

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
out="$root/src/fonts/twemoji-country-flags.woff2"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Git Bash on Windows hands POSIX paths to a native python that cannot resolve
# them, so every path crossing that boundary goes through cygpath when present.
native() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

echo "Downloading country-flag-emoji-polyfill ${VERSION}"
curl -sSL -o "$work/polyfill.tgz" "$ARCHIVE"

actual="$(openssl dgst -sha512 -binary "$work/polyfill.tgz" | openssl base64 -A)"
if [ "$actual" != "$ARCHIVE_SHA512" ]; then
  echo "Archive digest mismatch." >&2
  echo "  expected sha512-$ARCHIVE_SHA512" >&2
  echo "  actual   sha512-$actual" >&2
  exit 1
fi

tar -xzf "$work/polyfill.tgz" -C "$work" --no-wildcards "$SOURCE_FONT"

echo "Subsetting to the regional indicators and scaling to ${UPEM} units per em"
"$PY" - "$(native "$work/$SOURCE_FONT")" "$(native "$out")" "$UNICODES" "$UPEM" <<'PY'
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.scaleUpem import scale_upem

src, out, unicodes, upem = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])

# recalcTimestamp=False keeps head.modified from the source, which is what
# makes two runs of this script produce the same bytes.
font = TTFont(src, recalcTimestamp=False)

options = subset.Options()
options.layout_features = ['*']      # the flags are GSUB ligatures of two letters
options.hinting = False
options.notdef_outline = False
options.name_IDs = []
options.drop_tables += ['FFTM', 'DSIG']
options.flavor = 'woff2'
sub = subset.Subsetter(options)
sub.populate(unicodes=subset.parse_unicodes(unicodes))
sub.subset(font)

scale_upem(font, upem)
font.flavor = 'woff2'
font.save(out)
PY

size="$(wc -c <"$out")"
printf 'Wrote %s\n  %s bytes woff2, %s bytes as base64\n' \
  "${out#"$root"/}" "$size" "$(( (size + 2) / 3 * 4 ))"
"$PY" - "$(native "$out")" <<'PY'
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
flags = sum(len(v) for l in f['GSUB'].table.LookupList.Lookup for st in l.SubTable for v in st.ligatures.values())
print(f"  {len(f.getGlyphOrder())} glyphs, {flags} flags, {f['head'].unitsPerEm} units per em")
PY
