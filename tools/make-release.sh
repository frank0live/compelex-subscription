#!/usr/bin/env bash
# Build an immutable Row-Template release: a versioned tarball, a SHA256SUMS
# file and a manifest. Dependency-free apart from node, which produces the
# template artifacts (bash + coreutils + tar + node). Ships ONLY the runtime
# files — never node_modules, tests, fixtures, research or dev source.
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
#   template.html                       # the Row artifact — the top-level file
#                                       # an OLDER installed library updates
#                                       # against, so it must stay Row
#   templates/<id>/template.html        # every selectable design of this
#   templates/<id>/template.html.sha256 # release, each with its checksum
#   shells/<panel>/<id>/shell.html      # the assembled shell for each buildable
#   shells/<panel>/<id>/shell.html.sha256  # panel, in that panel's own dialect
#   VERSION  install.sh  lib/row-template.sh  bin/row-template
#   lib/transaction.sh  panels/*.sh     # the library's companions: it sources
#                                       # them at load time, so they ship and
#                                       # install with it (RT_INSTALLER_COMPANIONS)
#   SHA256SUMS                          # inner checksums of the payload files
#
# The shells are what the installer places on PasarGuard and Rebecca (1.3.0):
# it copies the selected design's shell into the panel's templates directory,
# after checking it against its .sha256 and refusing one built for another
# panel. Nothing in this script touches a host; it only builds and packages.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/release}"

die() { printf 'make-release: %s\n' "$1" >&2; exit 1; }
# Always the coreutils TEXT form, "<hex>  <name>". sha256sum on Windows (Git
# Bash, Cygwin) writes the binary-mode form "<hex> *<name>" instead, which would
# make a release built there differ byte for byte from one built on Linux. The
# installer reads both forms; the release is normalized so it has only one.
sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi \
    | sed 's/^\([0-9a-fA-F]\{64\}\) \*/\1  /'
}

VERSION="$(tr -d ' \t\r\n' < "$ROOT/VERSION")"
[ -n "$VERSION" ] || die "VERSION file is empty."

# Build every selectable template artifact fresh, so the payload can never ship
# a stale one. The build is deterministic; node is the same requirement the
# test suite already carries.
#
# node is run from $ROOT with a RELATIVE path on purpose. Under Git Bash on
# Windows pwd yields an MSYS path such as /d/project, which the Windows node
# binary cannot resolve — it reads the leading /d as a directory on the current
# drive and dies with MODULE_NOT_FOUND. A relative path is resolved against the
# process working directory, which every platform translates correctly.
BUILD="tools/build.mjs"
PANEL_BUILD="tools/build-panel.mjs"
[ -f "$ROOT/$BUILD" ] || die "missing required file: tools/build.mjs"
[ -f "$ROOT/$PANEL_BUILD" ] || die "missing required file: tools/build-panel.mjs"
command -v node >/dev/null 2>&1 || die "node is required to build the template artifacts."
IDS="$(cd "$ROOT" && node "$BUILD" --list | tr '\n' ' ')" || die "cannot read the template registry."
(cd "$ROOT" && node "$BUILD" --all --quiet) || die "template build failed."

# The panel shells, built the same way and for the same reason: the payload must
# never ship a stale one. `--list` reads the panel set from the registry, so the
# packaging cannot drift from what the product actually supports.
PANELS="$(cd "$ROOT" && node "$PANEL_BUILD" --list | tr '\n' ' ')" || die "cannot read the panel registry."
(cd "$ROOT" && node "$PANEL_BUILD" --quiet) || die "panel shell build failed."

# required source files
ART_HTML="$ROOT/template/index.html"
LIB="$ROOT/installer/lib/row-template.sh"
CLI="$ROOT/installer/bin/row-template"
BOOT="$ROOT/installer/install.sh"
for f in "$ART_HTML" "$LIB" "$CLI" "$BOOT" "$ROOT/VERSION"; do
  [ -f "$f" ] || die "missing required file: $f"
done

# The library's companions, read from the library's own declaration so the
# packaging cannot drift from what the installer loads and installs.
COMPANIONS="$(sed -n 's/^RT_INSTALLER_COMPANIONS="\(.*\)"$/\1/p' "$LIB")"
[ -n "$COMPANIONS" ] || die "the management library declares no RT_INSTALLER_COMPANIONS."
for rel in $COMPANIONS; do
  [ -f "$ROOT/installer/$rel" ] || die "missing companion: installer/$rel"
done

NAME="row-template-$VERSION"
STAGE="$(mktemp -d)"; trap 'rm -rf -- "$STAGE"' EXIT
PAY="$STAGE/$NAME"
mkdir -p "$PAY/lib" "$PAY/bin" "$PAY/panels" "$PAY/templates"

cp -- "$ART_HTML" "$PAY/template.html"
cp -- "$ROOT/VERSION" "$PAY/VERSION"
cp -- "$BOOT" "$PAY/install.sh"
cp -- "$LIB" "$PAY/lib/row-template.sh"
for rel in $COMPANIONS; do cp -- "$ROOT/installer/$rel" "$PAY/$rel"; done
cp -- "$CLI" "$PAY/bin/row-template"
chmod 755 "$PAY/install.sh" "$PAY/bin/row-template"

# per-template store: one artifact + sidecar checksum per selectable id. Row's
# artifact lives at the committed top-level path; every other design is built
# under dist/templates/<id>/.
for id in $IDS; do
  case "$id" in
    row) src="$ART_HTML" ;;
    *[!a-z0-9]*|"") die "registry produced a non-plain template id: $id" ;;
    *)  src="$ROOT/dist/templates/$id/template.html" ;;
  esac
  [ -f "$src" ] || die "missing artifact for template: $id"
  mkdir -p "$PAY/templates/$id"
  cp -- "$src" "$PAY/templates/$id/template.html"
  ( cd "$PAY" && sha "templates/$id/template.html" > "templates/$id/template.html.sha256" )
done

# nothing outside the registry may sneak in from stale build output
for dir in "$ROOT/dist/templates"/*/; do
  [ -d "$dir" ] || continue
  id="$(basename "$dir")"
  case " $IDS " in *" $id "*) : ;; *) die "stale build output for a non-selectable template: $id" ;; esac
done

# per-panel shell store: every buildable panel, every selectable template, each
# with its checksum. The loop order is the registry's, which is stable, and the
# archive is sorted anyway — so the payload is byte-reproducible.
mkdir -p "$PAY/shells"
for panel in $PANELS; do
  case "$panel" in
    *[!a-z0-9]*|"") die "registry produced a non-plain panel id: $panel" ;;
  esac
  for id in $IDS; do
    src="$ROOT/dist/shells/$panel/$id/shell.html"
    [ -f "$src" ] || die "missing shell for panel $panel, template $id"
    mkdir -p "$PAY/shells/$panel/$id"
    cp -- "$src" "$PAY/shells/$panel/$id/shell.html"
    ( cd "$PAY" && sha "shells/$panel/$id/shell.html" > "shells/$panel/$id/shell.html.sha256" )
  done
done

# the same guard for the shell tree: an unexpected panel or template under
# dist/shells would otherwise be shipped without anyone choosing it.
for pdir in "$ROOT/dist/shells"/*/; do
  [ -d "$pdir" ] || continue
  panel="$(basename "$pdir")"
  case " $PANELS " in *" $panel "*) : ;; *) die "stale shell output for a non-buildable panel: $panel" ;; esac
  for tdir in "$pdir"*/; do
    [ -d "$tdir" ] || continue
    id="$(basename "$tdir")"
    case " $IDS " in *" $id "*) : ;; *) die "stale shell output for a non-selectable template: $panel/$id" ;; esac
  done
done

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
printf '  templates: %s\n' "$(printf '%s ' $IDS)"
printf '  panels:    %s\n' "$(printf '%s ' $PANELS)"
printf '  shells:    %s\n' "$(find "$PAY/shells" -name 'shell.html' | wc -l | tr -d ' ')"
printf '  sha256: %s\n' "$(awk '{print $1}' "$OUT/SHA256SUMS")"
