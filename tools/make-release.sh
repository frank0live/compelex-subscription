#!/usr/bin/env bash
# Build an immutable Row-Template release: a versioned tarball, a SHA256SUMS
# file and a manifest. Dependency-free (bash + coreutils + tar). Ships ONLY the
# runtime files — never node_modules, tests, fixtures, research or dev source.
#
# Usage: tools/make-release.sh [output-dir]   (default: ./release)
#
# Output layout (this is also exactly what RT_RELEASE_DIR should point at, and
# what an RT_RELEASE_URL should serve):
#
#   <out>/manifest.txt
#   <out>/SHA256SUMS                    # checksum of the tarball
#   <out>/row-template-<version>.tar.gz
#   <out>/install.sh                    # copy, for the curl|bash entry point
#
# The tarball expands to a single top-level dir row-template-<version>/ holding:
#   template.html  VERSION  install.sh  lib/row-template.sh  bin/row-template
#   SHA256SUMS                          # inner checksums of the payload files

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/release}"

die() { printf 'make-release: %s\n' "$1" >&2; exit 1; }
sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

VERSION="$(tr -d ' \t\r\n' < "$ROOT/VERSION")"
[ -n "$VERSION" ] || die "VERSION file is empty."

# required source files
ART_HTML="$ROOT/template/index.html"
LIB="$ROOT/installer/lib/row-template.sh"
CLI="$ROOT/installer/bin/row-template"
BOOT="$ROOT/installer/install.sh"
for f in "$ART_HTML" "$LIB" "$CLI" "$BOOT" "$ROOT/VERSION"; do
  [ -f "$f" ] || die "missing required file: $f"
done

NAME="row-template-$VERSION"
STAGE="$(mktemp -d)"; trap 'rm -rf -- "$STAGE"' EXIT
PAY="$STAGE/$NAME"
mkdir -p "$PAY/lib" "$PAY/bin"

cp -- "$ART_HTML" "$PAY/template.html"
cp -- "$ROOT/VERSION" "$PAY/VERSION"
cp -- "$BOOT" "$PAY/install.sh"
cp -- "$LIB" "$PAY/lib/row-template.sh"
cp -- "$CLI" "$PAY/bin/row-template"
chmod 755 "$PAY/install.sh" "$PAY/bin/row-template"

# inner SHA256SUMS: checksums of every payload file (paths relative to $NAME/).
( cd "$PAY" && find . -type f ! -name SHA256SUMS -print0 \
    | LC_ALL=C sort -z \
    | while IFS= read -r -d '' p; do sha "${p#./}"; done > SHA256SUMS )

# build the tarball deterministically (sorted, fixed owner/mtime where possible).
mkdir -p "$OUT"
TARBALL="$OUT/$NAME.tar.gz"
tar -C "$STAGE" \
    --owner=0 --group=0 --numeric-owner \
    --sort=name --mtime="@0" \
    -czf "$TARBALL" "$NAME" 2>/dev/null \
  || tar -C "$STAGE" -czf "$TARBALL" "$NAME"   # fallback for tars without those flags

# outer SHA256SUMS: checksum of the tarball (what the bootstrap verifies).
( cd "$OUT" && sha "$NAME.tar.gz" > SHA256SUMS )

# manifest — parsed as data by rt_manifest_get.
{
  printf 'name=row-template\n'
  printf 'version=%s\n' "$VERSION"
  printf 'artifact=%s\n' "$NAME.tar.gz"
  printf 'min_xui=3.6.0\n'
  printf 'created=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT/manifest.txt"

# ship the bootstrap alongside for the curl|bash entry point.
cp -- "$BOOT" "$OUT/install.sh"; chmod 755 "$OUT/install.sh"

printf 'Release built: %s\n' "$OUT"
printf '  %s\n' "$NAME.tar.gz  ($(wc -c < "$TARBALL" | tr -d ' ') bytes)"
printf '  sha256: %s\n' "$(awk '{print $1}' "$OUT/SHA256SUMS")"

