#!/usr/bin/env bash
# Row-Template bootstrap installer.
#
# Public one-command UX:
#
#   bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
#
# With no environment set it downloads from the public GitHub stable channel
# (releases/latest/download resolves to the newest published, non-prerelease
# release, over https, with no API token). The source can be overridden for
# local testing or air-gapped staging:
#
#   RT_RELEASE_DIR=/path/to/release   bash install.sh      # staged local dir
#   RT_RELEASE_URL=https://host/path  bash install.sh      # alternate HTTP repo
#
# The bootstrap deliberately contains only the *minimum* self-contained logic
# needed to solve the chicken-and-egg problem: it fetches and checksum-verifies
# the release tarball, safely extracts it, then sources the extracted management
# library and hands the ENTIRE install transaction to rt_cmd_install. All the
# substantive work (structural validation, staging, backup, atomic activation,
# panel wiring, verification) lives in the library — this script never becomes a
# second implementation of it. The library also re-verifies the payload, so a
# bug here cannot bypass the integrity gate.

set -Eeuo pipefail

b_err() { printf '  install: %s\n' "$1" >&2; }
b_die() { b_err "$1"; exit "${2:-1}"; }

trap 'b_err "unexpected error (line $LINENO); nothing was committed."' ERR

[ "$(id -u)" -eq 0 ] || b_die "the installer must run as root (e.g. sudo bash install.sh)."

for t in tar sha256sum; do
  command -v "$t" >/dev/null 2>&1 || { command -v shasum >/dev/null 2>&1 && [ "$t" = sha256sum ] && continue; b_die "required tool not found: $t"; }
done

# --- choose the release source ----------------------------------------------
if [ -n "${RT_RELEASE_DIR:-}" ]; then
  B_KIND=dir; B_BASE="$RT_RELEASE_DIR"
elif [ -n "${RT_RELEASE_URL:-}" ]; then
  command -v curl >/dev/null 2>&1 || b_die "curl is required for RT_RELEASE_URL."
  B_KIND=url; B_BASE="${RT_RELEASE_URL%/}"
  # require https so an active network attacker cannot rewrite the release bytes
  # (the co-located checksum only proves transit integrity, not provenance).
  case "$B_BASE" in
    https://?*) : ;;
    http://?*) [ -n "${RT_ALLOW_INSECURE_URL:-}" ] || b_die "RT_RELEASE_URL must use https:// (set RT_ALLOW_INSECURE_URL=1 to override for local testing)." ;;
    *) b_die "RT_RELEASE_URL must be an http(s) URL." ;;
  esac
else
  # Default: the public GitHub stable channel. releases/latest/download/<name>
  # resolves to the newest published (non-draft, non-prerelease) release asset,
  # over https, with no API token — so the one-command install just works.
  command -v curl >/dev/null 2>&1 || b_die "curl is required to download the release."
  B_KIND=url; B_BASE="https://github.com/frank0live/Row-Template/releases/latest/download"
fi

WORK="$(mktemp -d)" || b_die "cannot create a work directory."
trap 'rm -rf -- "$WORK"' EXIT

b_fetch() {  # NAME DEST
  case "$B_KIND" in
    dir) [ -f "$B_BASE/$1" ] || return 1; cp -- "$B_BASE/$1" "$2" ;;
    url)
      case "$B_BASE" in
        https://*) curl --proto '=https' --tlsv1.2 -fsSL -m 120 -o "$2" "$B_BASE/$1" ;;
        *)         curl -fsSL -m 120 -o "$2" "$B_BASE/$1" ;;
      esac ;;
  esac
}

b_sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum -- "$1" | awk '{print $1}'; else shasum -a 256 -- "$1" | awk '{print $1}'; fi; }

# --- fetch manifest + checksums, resolve the artifact name ------------------
b_fetch manifest.txt "$WORK/manifest.txt" || b_die "cannot fetch manifest.txt from the release source."
b_fetch SHA256SUMS   "$WORK/SHA256SUMS"   || b_die "cannot fetch SHA256SUMS from the release source."

ART="$(grep -E '^artifact=' "$WORK/manifest.txt" | tail -n1 | sed 's/^artifact=//')"
[ -n "$ART" ] || b_die "manifest.txt has no artifact= entry."
case "$ART" in */*|*..*) b_die "manifest artifact name is unsafe: $ART" ;; esac

b_fetch "$ART" "$WORK/$ART" || b_die "cannot fetch the release artifact: $ART"

# --- mandatory checksum verification (no override exists) --------------------
WANT="$(awk -v n="$ART" '{f=$2; sub(/^\*/,"",f); if (f==n) h=$1} END{if(h!="")print h}' "$WORK/SHA256SUMS")"
[ -n "$WANT" ] || b_die "no checksum for $ART in SHA256SUMS; refusing to proceed."
WANT="$(printf '%s' "$WANT" | tr 'A-F' 'a-f' | tr -cd 'a-f0-9')"
[ "${#WANT}" -eq 64 ] || b_die "checksum for $ART is not 64 hex characters."
GOT="$(b_sha256 "$WORK/$ART" | tr 'A-F' 'a-f')"
[ "$GOT" = "$WANT" ] || b_die "release checksum verification failed; aborting (no --skip exists)."

# --- screen archive paths and member types, then extract --------------------
while IFS= read -r entry; do
  case "$entry" in /*|../*|*/../*|*/..|..) b_die "unsafe path in archive: $entry" ;; esac
done < <(tar -tzf "$WORK/$ART")
# refuse symlink/hardlink/special members: a link member could redirect a later
# write outside the payload dir when tar follows it.
while IFS= read -r mtype; do
  case "$mtype" in -|d|"") : ;; *) b_die "unsafe member type in archive: '$mtype'" ;; esac
done < <(tar -tvzf "$WORK/$ART" | awk '{print substr($1,1,1)}')

PAYLOAD="$WORK/payload"; mkdir -p "$PAYLOAD"
tar -xzf "$WORK/$ART" -C "$PAYLOAD" --no-same-owner --no-same-permissions || b_die "could not extract the release artifact."

# single top-level dir? descend into it.
top="$(find "$PAYLOAD" -mindepth 1 -maxdepth 1)"
if [ "$(printf '%s\n' "$top" | grep -c .)" -eq 1 ] && [ -d "$top" ]; then PAYLOAD="$top"; fi

[ -r "$PAYLOAD/lib/row-template.sh" ] || b_die "extracted payload has no lib/row-template.sh."

# --- hand off to the trusted, verified management library -------------------
# shellcheck source=/dev/null
. "$PAYLOAD/lib/row-template.sh"
trap 'rt_cleanup 2>/dev/null || true; rm -rf -- "$WORK"' EXIT

rt_cmd_install "$PAYLOAD"

