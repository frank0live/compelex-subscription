#!/usr/bin/env bash
# Row-Template management library.
#
# Sourced by installer/install.sh (bootstrap) and by the installed CLI at
# /usr/local/bin/row-template. It carries every operation the administration
# layer performs: environment discovery, configuration, template generation,
# atomic install, backup/rollback, verification and uninstall.
#
# Design rules honoured throughout:
#   - No runtime dependency on node/go/python/jq/sqlite3. Standard Linux
#     userland only (bash, coreutils, curl, tar, sha256sum, awk, sed, od).
#   - Administrator-supplied text (service name, support URL) is treated as
#     DATA, never as shell. It is stored base64-encoded and injected into the
#     template as JSON string literals. config.env is never sourced/eval'd.
#   - The panel's own subscription source tree is never written to; Row-Template
#     lives under its own external root. 3x-ui source is never patched.
#   - Every production file replacement is staged, validated, then swapped with
#     an atomic rename. A failed step never truncates the working install.
#
# The entry scripts set `set -Eeuo pipefail` and an ERR trap; functions here
# use explicit checks and return codes so they behave under that regime.

# --- constants ---------------------------------------------------------------

RT_NAME="row-template"

# The Row-Template install root. Deliberately under /etc/3x-ui (created and
# owned by us) and NOT under the panel's config root, which may be /etc/x-ui.
# subThemeDir is an absolute path, so the two are independent. Overridable for
# tests via RT_ROOT in the environment.
: "${RT_ROOT:=/etc/3x-ui/sub_templates/row-template}"
: "${RT_BIN:=/usr/local/bin/row-template}"
RT_MIN_XUI="3.6.0"

# Project identity. This is the ONLY terminal-facing branding for the management
# tool itself (distinct from the operator's white-label service branding, which
# lives in config.env). Shown on the installer welcome, the manager header, the
# Installation Info screen and help — never on the served subscription page.
RT_PROJECT_NAME="Row-Template"
RT_DEVELOPER="frank0live"
RT_GITHUB="https://github.com/frank0live/Row-Template"

# Public release channel. GitHub resolves releases/latest/download/<name> to the
# newest published (non-draft, non-prerelease) release's asset, over https, with
# no API token — so anonymous installs and update checks follow the stable
# channel with zero per-user configuration. RT_RELEASE_DIR / RT_RELEASE_URL
# override this (tests, local staging) and take precedence when set.
: "${RT_DEFAULT_RELEASE_URL:=$RT_GITHUB/releases/latest/download}"

# Derived layout.
RT_LIVE="$RT_ROOT/sub.html"                 # what x-ui serves (generated)
RT_DIST="$RT_ROOT/dist/template.html"       # canonical pristine artifact
RT_DIST_SUM="$RT_ROOT/dist/template.html.sha256"
RT_TEMPLATE_STORE="$RT_ROOT/dist/templates" # one verified artifact per selectable design
RT_CONFIG="$RT_ROOT/config.env"             # admin branding config (data)
RT_VERSION_FILE="$RT_ROOT/VERSION"
RT_LIB_DIR="$RT_ROOT/lib"
RT_BACKUPS="$RT_ROOT/backups"
RT_BACKUPS_V2="$RT_ROOT/backups.v2"           # format-2 snapshots (P2 only)
RT_PANEL_STAGE="$RT_ROOT/.panel-stage"        # where an adapter stages panel state (P2)

# Limits.
RT_LOGO_MAX_BYTES=$((256 * 1024))           # raw image cap before base64
RT_NAME_MAX_CHARS=120

# --- output ------------------------------------------------------------------

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RT_C_DIM=$'\033[2m'; RT_C_RED=$'\033[31m'; RT_C_YEL=$'\033[33m'
  RT_C_GRN=$'\033[32m'; RT_C_BLD=$'\033[1m'; RT_C_RST=$'\033[0m'
else
  RT_C_DIM=""; RT_C_RED=""; RT_C_YEL=""; RT_C_GRN=""; RT_C_BLD=""; RT_C_RST=""
fi

rt_section() { printf '\n%s%s%s\n' "$RT_C_BLD" "$1" "$RT_C_RST"; }
rt_info()    { printf '  %s\n' "$1"; }
rt_ok()      { printf '  %sok%s   %s\n' "$RT_C_GRN" "$RT_C_RST" "$1"; }
rt_warn()    { printf '  %swarn%s %s\n' "$RT_C_YEL" "$RT_C_RST" "$1" >&2; }
rt_err()     { printf '  %sFAIL%s %s\n' "$RT_C_RED" "$RT_C_RST" "$1" >&2; }
rt_die()     { rt_err "$1"; exit "${2:-1}"; }

# --- pure helpers (unit-tested) ----------------------------------------------
# These have no filesystem or panel side effects (except reading argv/stdin) so
# tests/installer.test.mjs can drive them directly through bash.

rt_trim() {
  # strip leading and trailing ASCII/Unicode whitespace, print the rest.
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

rt_has_control_chars() {
  # true (0) when the argument contains a C0/C1-range control byte. Used to
  # reject newlines/NUL-ish input before it reaches the template or config.
  # grep -z makes the input one NUL-terminated record so an embedded newline is
  # matched as content rather than silently swallowed as a line separator.
  printf '%s' "$1" | LC_ALL=C grep -qz '[[:cntrl:]]'
}

rt_b64_encode() { base64 | tr -d '\n'; }        # stdin -> single-line base64
rt_b64_decode() { tr -d '\n' | base64 -d; }     # base64 stdin -> raw

rt_normalize_semver() {
  # echo the numeric X.Y.Z core of a version: drop a leading v, drop any
  # -prerelease/+build suffix and any trailing junk, default missing fields.
  local v="${1#v}"; v="${v%%[-+ ]*}"
  v="$(printf '%s' "$v" | LC_ALL=C sed 's/[^0-9.].*$//')"
  local a b c IFS=.
  read -r a b c _ <<<"$v"
  printf '%d.%d.%d' "$((10#${a:-0}))" "$((10#${b:-0}))" "$((10#${c:-0}))"
}

rt_semver_ge() {
  # succeed when version $1 >= version $2 (numeric, field by field).
  local A B a1 a2 a3 b1 b2 b3 IFS=.
  A="$(rt_normalize_semver "$1")"; B="$(rt_normalize_semver "$2")"
  read -r a1 a2 a3 <<<"$A"; read -r b1 b2 b3 <<<"$B"
  if [ "$a1" -ne "$b1" ]; then [ "$a1" -gt "$b1" ]; return; fi
  if [ "$a2" -ne "$b2" ]; then [ "$a2" -gt "$b2" ]; return; fi
  [ "$a3" -ge "$b3" ]
}

rt_json_escape() {
  # emit the argument as the interior of a double-quoted JS/JSON string. Escapes
  # backslash, double-quote and '<' (so a literal </script> can never form in
  # the injected branding block). Control chars must be rejected by the caller.
  # LC_ALL=C keeps sed byte-oriented; UTF-8 trail bytes (>=0x80) never collide
  # with the ASCII bytes \ " < being rewritten.
  printf '%s' "$1" | LC_ALL=C sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'
}

# --- input validation --------------------------------------------------------

rt_validate_service_name() {
  # empty is allowed (white-label, monogram falls back to the plan/locale word).
  # Otherwise: no control characters, and at most RT_NAME_MAX_CHARS characters.
  local n; n="$(rt_trim "$1")"
  [ -n "$n" ] || return 0
  rt_has_control_chars "$n" && return 1
  local len; len="$(printf '%s' "$n" | wc -m)"
  [ "$len" -le "$RT_NAME_MAX_CHARS" ]
}

rt_validate_support_url() {
  # empty is allowed (no support link). Otherwise the scheme must be one the
  # frontend will actually render as a link: https/http/tg/mailto. This mirrors
  # SUPPORT_SCHEMES in src/scripts/url.js so javascript:/data:/file: — which the
  # page would refuse anyway — are rejected at the door too.
  local u lower; u="$(rt_trim "$1")"
  [ -n "$u" ] || return 0
  rt_has_control_chars "$u" && return 1
  lower="$(printf '%s' "$u" | LC_ALL=C tr 'A-Z' 'a-z')"
  case "$lower" in
    https://?*|http://?*|tg://?*|mailto:?*) return 0;;
    *) return 1;;
  esac
}

# --- config.env: parsed as data, never sourced ------------------------------

rt_config_get_raw() {
  # print the raw (base64 or plain) value of KEY from a config file, last line
  # wins. No execution: a line is matched with a fixed-identifier anchor and the
  # value is everything after the first '='.
  local key="$1" file="${2:-$RT_CONFIG}" line
  [ -f "$file" ] || return 0
  line="$(LC_ALL=C grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 || true)"
  [ -n "$line" ] || return 0
  printf '%s' "${line#*=}"
}

rt_config_get_text() {
  # decode a base64-stored value (SERVICE_NAME_B64 / SUPPORT_URL_B64 / …).
  local raw; raw="$(rt_config_get_raw "$1" "${2:-$RT_CONFIG}")"
  [ -n "$raw" ] || return 0
  printf '%s' "$raw" | rt_b64_decode
}

rt_config_write() {
  # args: service_name support_url logo_mime logo_data_b64 [template_id] — all
  # treated as data. Written atomically at mode 640 (never world-readable/-writable).
  # The template id defaults to the stored value (so branding changes never reset
  # the choice) and to 'row' for a config that predates template selection; a
  # stored id this release does not recognise is sanitized to 'row' (with a
  # warning) rather than allowed to block a branding change, while an explicitly
  # passed id that is not in the registry fails closed instead of being written.
  local name="$1" url="$2" mime="$3" logo_b64="$4" template="${5:-}" dir tmp
  if [ -z "$template" ]; then
    template="$(rt_config_get_raw TEMPLATE)"
    if [ -n "$template" ] && ! rt_template_allowed "$template"; then
      rt_warn "config.env stores an unknown template id (${template}); resetting the selection to Row."
      template="row"
    fi
    [ -n "$template" ] || template="row"
  fi
  rt_template_allowed "$template" || { rt_err "unknown template id: $template"; return 1; }
  dir="$(dirname "$RT_CONFIG")"
  tmp="$(mktemp "$dir/.config.XXXXXX")" || return 1
  {
    printf '# Row-Template configuration — generated file. Do NOT source this.\n'
    printf '# Values are base64 data, read with grep+base64 and never executed.\n'
    printf 'RT_CONFIG_VERSION=1\n'
    printf 'TEMPLATE=%s\n' "$template"
    printf 'SERVICE_NAME_B64=%s\n' "$(printf '%s' "$name" | rt_b64_encode)"
    printf 'SUPPORT_URL_B64=%s\n'  "$(printf '%s' "$url"  | rt_b64_encode)"
    printf 'LOGO_MIME=%s\n' "$mime"
    printf 'LOGO_DATA_B64=%s\n' "$logo_b64"
  } > "$tmp" || { rm -f "$tmp"; return 1; }
  chmod 640 "$tmp" || { rm -f "$tmp"; return 1; }
  mv -f "$tmp" "$RT_CONFIG"
}

# --- template selection -------------------------------------------------------
# tools/templates.mjs is the authoritative registry; the two values below are
# its Bash projection and are held in lockstep with it by tests/registry.test.mjs.
# A template id is a closed enum, and it is only ever used to index fixed-path
# directories under RT_TEMPLATE_STORE — never as a free-form filesystem path,
# a command argument, or anything decoded from operator input.

# The selectable ids of this release, in catalogue order. Row is first and is
# the default.
RT_TEMPLATES_AVAILABLE="row editorial canvas prism terminal pulse brutal arcade sketch signature saffron pulsenova prismnova terminalnova arcadenova"

rt_template_allowed() {
  local id
  for id in $RT_TEMPLATES_AVAILABLE; do
    [ "$1" = "$id" ] && return 0
  done
  return 1
}

rt_template_display_name() {
  case "${1:-}" in
    row)       printf 'Row' ;;
    editorial) printf 'Editorial' ;;
    canvas)    printf 'Canvas' ;;
    prism)     printf 'Prism' ;;
    terminal)  printf 'Terminal' ;;
    pulse)     printf 'Pulse' ;;
    brutal)    printf 'Brutal' ;;
    arcade)    printf 'Arcade' ;;
    sketch)    printf 'Sketch' ;;
    signature) printf 'Signature' ;;
    saffron)   printf 'Saffron' ;;
    pulsenova) printf 'Pulse Nova' ;;
    prismnova) printf 'Prism Nova' ;;
    terminalnova) printf 'Terminal Nova' ;;
    arcadenova) printf 'Arcade Nova' ;;
    *)         printf '%s' "$1" ;;
  esac
}

rt_template_effective() {
  # echo the effective template id. A config that predates template selection
  # has no TEMPLATE line, which means Row. A stored value this release does not
  # recognise is reported as a warning and falls back to Row: the operator is
  # told, the page keeps working, and the selection is re-persisted by the next
  # reconcile so config.env and the artifact can never silently disagree.
  local id
  id="$(rt_config_get_raw TEMPLATE)"
  if [ -z "$id" ]; then printf '%s' "row"; return 0; fi
  if rt_template_allowed "$id"; then printf '%s' "$id"; return 0; fi
  rt_warn "config.env stores an unknown template id (${id}); using Row."
  printf '%s' "row"
}

rt_config_set_template() {
  # persist a new template choice while preserving every branding value. Fails
  # closed on an id the release does not recognise.
  local id="$1" name url mime logo_b64
  rt_template_allowed "$id" || { rt_err "unknown template id: $id"; return 1; }
  name="$(rt_config_get_text SERVICE_NAME_B64)"
  url="$(rt_config_get_text SUPPORT_URL_B64)"
  mime="$(rt_config_get_raw LOGO_MIME)"
  logo_b64="$(rt_config_get_raw LOGO_DATA_B64)"
  rt_config_write "$name" "$url" "$mime" "$logo_b64" "$id"
}

rt_template_reconcile() {
  # make config.env's TEMPLATE agree with ID, leaving branding untouched. A
  # missing config.env stays missing when ID is Row (absent already means Row);
  # anything else is persisted, so the stored selection and the live artifact
  # can never disagree. Called wherever the artifact's identity is decided:
  # install, update, rollback and template switching.
  local id="$1" cur
  if [ ! -f "$RT_CONFIG" ]; then
    if [ "$id" = "row" ]; then return 0; fi
    rt_config_set_template "$id"
    return
  fi
  cur="$(rt_config_get_raw TEMPLATE)"
  if [ "$cur" = "$id" ]; then return 0; fi
  rt_config_set_template "$id"
}

rt_reconcile_artifact_to_selection() {
  # make the CANONICAL ARTIFACT agree with the stored selection. Companion to
  # rt_template_reconcile (which aligns config with a KNOWN id): this one runs
  # after a branding write, where rt_config_write may have sanitized an invalid
  # stored id to Row. It resolves the effective template, refuses a store that
  # cannot supply it (missing artifact or checksum mismatch), and re-stages the
  # canonical artifact from the store when it does not already match. It only
  # reads config/store and writes dist + sidecar — no activation, no recursion;
  # the caller owns activation and the snapshot/restore of the transaction.
  local tpl want
  tpl="$(rt_template_effective)" || return 1
  [ -n "$tpl" ] || return 1
  rt_template_store_has "$tpl" \
    || { rt_err "the effective template '$tpl' is missing from the template store"; return 1; }
  want="$(LC_ALL=C awk '{print $1; exit}' "$RT_TEMPLATE_STORE/$tpl/template.html.sha256" 2>/dev/null)"
  rt_verify_sha256 "$RT_TEMPLATE_STORE/$tpl/template.html" "$want" \
    || { rt_err "the effective template '$tpl' failed its store checksum"; return 1; }
  if [ "$(rt_sha256 "$RT_DIST" 2>/dev/null || true)" = "$(rt_sha256 "$RT_TEMPLATE_STORE/$tpl/template.html" 2>/dev/null || true)" ]; then
    return 0
  fi
  rt_info "aligning the canonical artifact with the stored selection ($tpl)"
  rt_set_dist "$RT_TEMPLATE_STORE/$tpl/template.html"
}

rt_restore_snapshot() {
  # restore CONFIG and the canonical artifact (+ sidecar) from the snapshots
  # taken before a branding transaction. Empty/absent arguments are skipped.
  # Used on any post-write failure so config, artifact and live page stay in
  # their known-good pre-transaction state.
  local cfgbak="$1" distbak="$2" sumbak="$3"
  if [ -n "$cfgbak" ] && [ -f "$cfgbak" ]; then
    cp -f -- "$cfgbak" "$RT_CONFIG" || true
    chmod 640 "$RT_CONFIG" 2>/dev/null || true
  fi
  if [ -n "$distbak" ] && [ -f "$distbak" ]; then
    rt_atomic_install "$distbak" "$RT_DIST" 644 || true
    if [ -n "$sumbak" ] && [ -f "$sumbak" ]; then
      rt_atomic_install "$sumbak" "$RT_DIST_SUM" 644 || true
    fi
  fi
}

# --- template store -----------------------------------------------------------
# The store is the install's own copy of the release's template payloads: one
# directory per selectable design, holding the pristine artifact and its
# checksum sidecar. Everything in it arrived through the checksum-verified
# release tarball and is re-verified here before it can ever be activated.

rt_template_store_ids() {
  # echo the ids present in the installed store, one per line, sorted. Only
  # plain lowercase ids are read: the directory names decide the store's
  # contents, so a foreign or hostile name is skipped, never traversed.
  local d id
  [ -d "$RT_TEMPLATE_STORE" ] || return 0
  for d in "$RT_TEMPLATE_STORE"/*/; do
    [ -d "$d" ] || continue
    id="$(basename "$d")"
    case "$id" in
      *[!a-z0-9]*|"") continue ;;
    esac
    printf '%s\n' "$id"
  done | LC_ALL=C sort
}

rt_template_offered() {
  # the ids an operator may choose from right now: the release's selectable
  # set, filtered down to what is actually installed. Catalogue order.
  local id
  for id in $RT_TEMPLATES_AVAILABLE; do
    if rt_template_store_has "$id"; then printf '%s\n' "$id"; fi
  done
  return 0
}

rt_template_store_has() {
  # succeed when ID is a registry id whose artifact and sidecar are installed.
  # The allowlist check comes first, so an arbitrary string can never become a
  # path component here.
  rt_template_allowed "$1" || return 1
  [ -f "$RT_TEMPLATE_STORE/$1/template.html" ] || return 1
  [ -f "$RT_TEMPLATE_STORE/$1/template.html.sha256" ] || return 1
  return 0
}

rt_template_verify_store() {
  # verify every installed artifact against its sidecar. Silent; callers report.
  local id want
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    rt_template_allowed "$id" || continue
    want="$(LC_ALL=C awk '{print $1; exit}' "$RT_TEMPLATE_STORE/$id/template.html.sha256" 2>/dev/null)"
    rt_verify_sha256 "$RT_TEMPLATE_STORE/$id/template.html" "$want" || return 1
  done < <(rt_template_store_ids)
  return 0
}

rt_template_id_for_artifact() {
  # echo the store id whose artifact is byte-identical to FILE, or nothing.
  # Deriving identity from the checksum — rather than from recorded metadata —
  # is what keeps a restored artifact and the stored selection in agreement
  # even when the backup predates the current release's store.
  local file="$1" sum id
  [ -f "$file" ] || return 0
  sum="$(rt_sha256 "$file" 2>/dev/null)" || return 0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    if [ "$(rt_sha256 "$RT_TEMPLATE_STORE/$id/template.html" 2>/dev/null || true)" = "$sum" ]; then
      printf '%s' "$id"
      return 0
    fi
  done < <(rt_template_store_ids)
  return 0
}

rt_stage_template_store() {
  # install every template the release payload ships into the local store,
  # verifying each artifact against its sidecar and structurally before
  # anything is staged. A payload without a templates/ directory (an older
  # release) simply carries no store; that is the caller's signal to fall back
  # to the top-level artifact.
  local payload="$1" dir id want
  [ -d "$payload/templates" ] || return 0
  for dir in "$payload"/templates/*/; do
    [ -d "$dir" ] || continue
    id="$(basename "$dir")"
    case "$id" in
      *[!a-z0-9]*|"") rt_warn "payload template directory is not a plain id: $id (skipped)"; continue ;;
    esac
    [ -f "$dir/template.html" ] || { rt_warn "payload template $id has no template.html (skipped)"; continue; }
    [ -f "$dir/template.html.sha256" ] || { rt_err "payload template $id has no checksum sidecar"; return 1; }
    want="$(LC_ALL=C awk '{print $1; exit}' "$dir/template.html.sha256")"
    rt_verify_sha256 "$dir/template.html" "$want" || { rt_err "payload template $id failed its checksum"; return 1; }
    rt_validate_template "$dir/template.html" || { rt_err "payload template $id failed structural validation"; return 1; }
    mkdir -p "$RT_TEMPLATE_STORE/$id" || return 1
    rt_atomic_install "$dir/template.html" "$RT_TEMPLATE_STORE/$id/template.html" 644 || return 1
    rt_atomic_install "$dir/template.html.sha256" "$RT_TEMPLATE_STORE/$id/template.html.sha256" 644 || return 1
  done
  return 0
}

rt_switch_template() {
  # switch the active template as one transaction. Ordered so that nothing on
  # disk changes until the candidate has passed every check, and so that any
  # failure after the first write rolls back to the snapshotted state. The
  # invariant maintained throughout: the persisted selection and the canonical
  # artifact always name the same template.
  local id="$1" src want backup
  rt_template_allowed "$id" || { rt_err "unknown template id: $id (available: $RT_TEMPLATES_AVAILABLE)"; return 1; }
  if ! rt_template_store_has "$id"; then
    rt_err "template '$id' is not installed; re-run the installer to refresh the template store"
    return 1
  fi
  src="$RT_TEMPLATE_STORE/$id/template.html"
  want="$(LC_ALL=C awk '{print $1; exit}' "$RT_TEMPLATE_STORE/$id/template.html.sha256")"
  rt_verify_sha256 "$src" "$want" || { rt_err "template $id failed its checksum; refusing to switch"; return 1; }

  # candidate: generate and validate from the trusted artifact with the current
  # branding, writing only to a throwaway file. Failure here changes nothing.
  local staged
  staged="$(mktemp "$(dirname "$RT_LIVE")/.live.XXXXXX")" || return 1
  if ! rt_generate "$src" "$staged"; then
    rm -f "$staged"
    rt_err "the $id template failed to generate with the current branding"
    return 1
  fi
  rm -f "$staged"

  backup="$(rt_backup_create)" || { rt_err "could not snapshot the current state; aborting"; return 1; }

  if ! rt_set_dist "$src"; then
    rt_restore_from_backup "$backup" >/dev/null 2>&1 || true
    rt_err "could not stage the selected template; the previous state was restored"
    return 1
  fi
  if ! rt_template_reconcile "$id"; then
    rt_restore_from_backup "$backup" >/dev/null 2>&1 && rt_activate >/dev/null 2>&1 \
      || rt_err "automatic restore failed; run 'row-template rollback'"
    rt_err "could not persist the template selection; the previous state was restored"
    return 1
  fi
  if ! rt_activate; then
    rt_restore_from_backup "$backup" >/dev/null 2>&1 && rt_activate >/dev/null 2>&1 \
      || rt_err "automatic restore failed; run 'row-template rollback'"
    rt_err "activation of the new template failed; the previous state was restored"
    return 1
  fi
  if ! rt_validate_template "$RT_LIVE" >/dev/null 2>&1; then
    rt_restore_from_backup "$backup" >/dev/null 2>&1 && rt_activate >/dev/null 2>&1 \
      || rt_err "automatic restore failed; run 'row-template rollback'"
    rt_err "the switched template failed post-activation validation; the previous state was restored"
    return 1
  fi

  rt_backups_prune 2
  return 0
}

# --- logo validation (content signature, not extension) ----------------------

rt_file_size() {
  local f="$1" s
  s="$(stat -c%s "$f" 2>/dev/null)" || s="$(wc -c <"$f" 2>/dev/null)" || return 1
  printf '%s' "$s"
}

rt_logo_detect_mime() {
  # echo an allowed image mime derived from the file's magic bytes, or nothing.
  # PNG / JPEG / WebP only. SVG, GIF, HTML, scripts and anything else are
  # rejected by producing no output — detection never trusts the extension.
  local f="$1" hdr
  [ -f "$f" ] || return 0
  hdr="$(LC_ALL=C od -An -tx1 -N16 "$f" 2>/dev/null | tr -d ' \n')" || return 0
  case "$hdr" in
    89504e470d0a1a0a*)          printf 'image/png'  ;;   # \x89PNG\r\n\x1a\n
    ffd8ff*)                    printf 'image/jpeg' ;;   # JPEG SOI + marker
    52494646????????57454250*)  printf 'image/webp' ;;   # RIFF????WEBP
    *) : ;;
  esac
}

rt_logo_validate() {
  # succeed only if FILE is a supported image within the size cap; on success
  # echo the detected mime. Rejects symlinks, empty, oversized and non-images.
  local f="$1" size mime
  [ -e "$f" ] || { rt_err "logo file not found: $f"; return 1; }
  [ -L "$f" ] && { rt_err "logo path is a symlink; refusing to read it"; return 1; }
  [ -f "$f" ] || { rt_err "logo path is not a regular file"; return 1; }
  size="$(rt_file_size "$f")" || { rt_err "cannot size logo file"; return 1; }
  [ "$size" -gt 0 ] || { rt_err "logo file is empty"; return 1; }
  if [ "$size" -gt "$RT_LOGO_MAX_BYTES" ]; then
    rt_err "logo too large: ${size} bytes (max ${RT_LOGO_MAX_BYTES})"; return 1
  fi
  mime="$(rt_logo_detect_mime "$f")"
  [ -n "$mime" ] || { rt_err "unsupported image: only PNG, JPEG or WebP by content"; return 1; }
  printf '%s' "$mime"
}

# --- template generation -----------------------------------------------------
# The installer never edits repository source. It splices operator branding into
# a copy of the pristine artifact; the monogram itself is computed at runtime by
# src/scripts/brand.js, so there is no Bash monogram implementation to disagree
# with the browser. Only serviceName / supportUrl / logo are injected here.

rt_build_branding_block() {
  # write the replacement branding block to stdout. Values arrive already
  # chosen; each is emitted as a JSON-escaped double-quoted JS string literal.
  local name="$1" url="$2" logo="$3"
  printf '/* row:branding */\n'
  printf 'var BRANDING = {\n'
  printf '  serviceName: "%s",\n' "$(rt_json_escape "$name")"
  printf '  supportUrl: "%s",\n'  "$(rt_json_escape "$url")"
  printf '  logo: "%s"\n'         "$(rt_json_escape "$logo")"
  printf '};\n'
  printf '/* row:branding end */\n'
}

rt_generate() {
  # DIST -> OUT: splice a fresh branding block built from config.env into a copy
  # of the pristine artifact. Never touches the live file; OUT is a caller-owned
  # staging path. Validates the result before returning success.
  local dist="$1" out="$2" name url mime logo_b64 logo blockf nopen nclose
  [ -f "$dist" ] || { rt_err "canonical artifact missing: $dist"; return 1; }

  nopen="$(LC_ALL=C grep -Fc '/* row:branding */' "$dist" || true)"
  nclose="$(LC_ALL=C grep -Fc '/* row:branding end */' "$dist" || true)"
  if [ "$nopen" != "1" ] || [ "$nclose" != "1" ]; then
    rt_err "artifact branding markers not found exactly once (open=$nopen close=$nclose)"
    return 1
  fi

  name="$(rt_config_get_text SERVICE_NAME_B64)"
  url="$(rt_config_get_text SUPPORT_URL_B64)"
  # re-assert the input contract at generation time: config.env is validated when
  # written, but a hand-edited or restored file could carry a raw newline/tab that
  # rt_json_escape does not neutralise and would inject a line break into the JS
  # string. Fail closed rather than swap a syntactically broken template live.
  if rt_has_control_chars "$name" || rt_has_control_chars "$url"; then
    rt_err "branding contains control characters; refusing to generate."
    return 1
  fi
  mime="$(rt_config_get_raw LOGO_MIME)"
  logo_b64="$(rt_config_get_raw LOGO_DATA_B64)"
  logo=""
  if [ -n "$logo_b64" ] && [ -n "$mime" ]; then
    logo="data:${mime};base64,${logo_b64}"
  fi

  blockf="$(mktemp)" || return 1
  rt_build_branding_block "$name" "$url" "$logo" > "$blockf" \
    || { rm -f "$blockf"; return 1; }

  # index() matches the markers as plain text. The close marker never contains
  # the open marker as a substring, and `done` fires the splice exactly once.
  LC_ALL=C awk -v bf="$blockf" '
    BEGIN { blk=""; while ((getline l < bf) > 0) blk = blk l "\n"; close(bf) }
    !done && index($0, "/* row:branding */") { printf "%s", blk; skip=1; done=1; next }
    skip && index($0, "/* row:branding end */") { skip=0; next }
    skip { next }
    { print }
  ' "$dist" > "$out" || { rm -f "$blockf"; return 1; }
  rm -f "$blockf"

  rt_validate_template "$out"
}

rt_validate_template() {
  # dependency-free structural gate — the server-side analogue of tools/verify.mjs.
  # A generated file that fails any check must never be swapped into place.
  local f="$1" size nopen nclose
  [ -f "$f" ] || { rt_err "generated template missing"; return 1; }
  size="$(rt_file_size "$f")" || { rt_err "cannot size generated template"; return 1; }
  [ "$size" -ge $((40 * 1024)) ] \
    || { rt_err "generated template implausibly small (${size} bytes)"; return 1; }
  LC_ALL=C head -c 512 "$f" | LC_ALL=C grep -qi '<!doctype html>' \
    || { rt_err "generated template does not begin with <!doctype html>"; return 1; }
  LC_ALL=C tail -c 64 "$f" | LC_ALL=C grep -q '</html>' \
    || { rt_err "generated template does not end with </html>"; return 1; }
  nopen="$(LC_ALL=C grep -Fc '/* row:branding */' "$f" || true)"
  nclose="$(LC_ALL=C grep -Fc '/* row:branding end */' "$f" || true)"
  { [ "$nopen" = "1" ] && [ "$nclose" = "1" ]; } \
    || { rt_err "branding markers not intact in generated template"; return 1; }
  LC_ALL=C grep -q 'id="sub-data"' "$f" \
    || { rt_err "generated template missing the #sub-data island"; return 1; }
  LC_ALL=C grep -q 'var BRANDING' "$f" \
    || { rt_err "generated template missing the BRANDING block"; return 1; }
  if LC_ALL=C grep -qE '/\*__[A-Z_]+__\*/|__FONT_BASE64__' "$f"; then
    rt_err "generated template still contains unsubstituted build placeholders"; return 1
  fi
  return 0
}

# --- integrity: sha256, SHA256SUMS, manifest ---------------------------------

rt_sha256() {
  # echo the lowercase hex sha256 of FILE via whichever tool is present.
  local f="$1" out
  if command -v sha256sum >/dev/null 2>&1; then
    out="$(sha256sum -- "$f")" || return 1
  elif command -v shasum >/dev/null 2>&1; then
    out="$(shasum -a 256 -- "$f")" || return 1
  else
    rt_err "no sha256 tool (sha256sum or shasum) found"; return 1
  fi
  printf '%s' "${out%% *}"
}

rt_verify_sha256() {
  # succeed only when FILE's sha256 equals EXPECTED. There is deliberately no
  # skip/override path: a missing or mismatched checksum aborts the caller.
  local f="$1" expected="$2" actual
  expected="$(printf '%s' "$expected" | LC_ALL=C tr 'A-F' 'a-f' | LC_ALL=C tr -cd 'a-f0-9')"
  [ "${#expected}" -eq 64 ] || { rt_err "expected checksum is not 64 hex characters"; return 1; }
  [ -f "$f" ] || { rt_err "cannot checksum missing file: $f"; return 1; }
  actual="$(rt_sha256 "$f")" || return 1
  actual="$(printf '%s' "$actual" | LC_ALL=C tr 'A-F' 'a-f')"
  if [ "$actual" != "$expected" ]; then
    rt_err "checksum mismatch (expected ${expected:0:12}… got ${actual:0:12}…)"; return 1
  fi
  return 0
}

rt_sums_lookup() {
  # echo the sha256 recorded for basename NAME in a SHA256SUMS file (coreutils
  # "hex  name" or "hex *name" form), last match wins, or nothing.
  local name="$1" sums="$2"
  [ -f "$sums" ] || return 0
  LC_ALL=C awk -v n="$name" '
    { f=$2; sub(/^\*/,"",f); if (f==n) hex=$1 }
    END { if (hex!="") print hex }
  ' "$sums" 2>/dev/null || true
}

rt_manifest_get() {
  # echo VALUE for KEY in a KEY=VALUE manifest, last wins, parsed as data.
  local key="$1" file="$2" line
  [ -f "$file" ] || return 0
  line="$(LC_ALL=C grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 || true)"
  [ -n "$line" ] || return 0
  printf '%s' "${line#*=}"
}

# --- safe paths, symlink guards, atomic swap ---------------------------------

rt_realpath_m() {
  # normalize a path without requiring it to exist (realpath -m / readlink -m /
  # lexical fallback). Used only for containment checks, never to widen access.
  local p="$1"
  if command -v realpath >/dev/null 2>&1; then
    realpath -m -- "$p" 2>/dev/null && return 0
  fi
  if command -v readlink >/dev/null 2>&1; then
    readlink -m -- "$p" 2>/dev/null && return 0
  fi
  printf '%s' "$p"
}

rt_is_within() {
  # succeed when PATH resolves STRICTLY INSIDE BASE (both normalized). Guards
  # every recursive delete so nothing outside Row-Template's own tree is ever
  # removed.
  #
  # STRICT means the base itself is NOT within itself. The previous version
  # appended a slash to PATH and matched "$BASE"/*, which accepts PATH == BASE
  # (the trailing-glob branch matches the empty string) — so rt_safe_rmdir
  # would delete the backups root itself. That was a real defect: the claim
  # "rt_is_within demands strict containment" appeared in three places (this
  # library's rt_safe_rmdir comment, the P2 commit message, and
  # INSTALLER-BACKUP-REVIEW.md B8) while the code did not implement it. The
  # equality refusal below is the whole fix; the suffix test is unchanged, so
  # a sibling directory that merely shares the prefix ("$BASE-other") is still
  # correctly refused.
  local rb rp
  rb="$(rt_realpath_m "$1")" || return 1
  rp="$(rt_realpath_m "$2")" || return 1
  [ -n "$rb" ] && [ -n "$rp" ] || return 1
  [ "$rb" = "$rp" ] && return 1
  case "$rp/" in "$rb"/*) return 0;; *) return 1;; esac
}

rt_assert_not_symlink() {
  # refuse to write through / delete a path that is itself a symlink — a classic
  # vector for redirecting a privileged write into an unrelated system file.
  if [ -L "$1" ]; then rt_err "refusing to operate on a symlink: $1"; return 1; fi
  return 0
}

rt_atomic_install() {
  # stage SRC beside DEST, set MODE, then rename over DEST. A same-filesystem
  # rename is atomic, so readers see either the whole old or whole new file.
  local src="$1" dest="$2" mode="${3:-644}" dir tmp
  dir="$(dirname "$dest")"
  rt_assert_not_symlink "$dest" || return 1
  [ -d "$dir" ] || mkdir -p "$dir" || return 1
  tmp="$(mktemp "$dir/.stage.XXXXXX")" || return 1
  cp -- "$src" "$tmp"     || { rm -f "$tmp"; return 1; }
  chmod "$mode" "$tmp"    || { rm -f "$tmp"; return 1; }
  mv -f "$tmp" "$dest"    || { rm -f "$tmp"; return 1; }
  return 0
}

# --- backups -----------------------------------------------------------------
# A backup snapshots the pristine artifact + VERSION + config so a rollback can
# reconstruct any prior install. Backup dir names are UTC timestamps, so a plain
# lexical sort is chronological.

rt_safe_rmdir() {
  # rm -rf a directory ONLY after positively confirming it is a STRICT
  # descendant of a permitted backups root, and that it is not a symlink. This
  # is the single choke point for recursive deletes.
  #
  # Refused, and each for a reason:
  #   ""                an unset variable must never mean "delete something"
  #   "/"               every path is inside it, so containment proves nothing
  #   $RT_ROOT          the whole install tree
  #   $RT_BACKUPS       the format-1 root itself — see the strictness note on
  #   $RT_BACKUPS_V2    rt_is_within: containment is now strict, so the base is
  #                     refused by the containment test, not by a special case
  #
  # Deleting a backups ROOT would destroy every snapshot at once, which is the
  # one thing a rollback safety net must never do. Only descendants are
  # removable; the roots are recreated by rt_layout_ensure when absent.
  local d="$1"
  [ -n "$d" ] || return 1
  [ "$d" = "/" ] && { rt_err "refusing to recursively delete /"; return 1; }
  rt_assert_not_symlink "$d" || return 1
  # Containment is required against EITHER namespace: the format-1 backups root
  # or the format-2 one. This is a second explicitly permitted root, not a
  # relaxation — a path inside neither is still refused, and the base itself is
  # refused because rt_is_within now demands STRICT containment.
  if ! rt_is_within "$RT_BACKUPS" "$d" && ! rt_is_within "$RT_BACKUPS_V2" "$d"; then
    rt_err "refusing to recursively delete path outside backups: $d"; return 1
  fi
  rm -rf -- "$d"
}

rt_backup_create() {
  # snapshot the current install into a new timestamped dir; echo its path.
  #
  # TWO MODES, and the default is the one every production caller uses:
  #
  #   rt_backup_create                 format 1, under $RT_BACKUPS. UNCHANGED.
  #   rt_backup_create v2 [PANEL…]     format 2, under $RT_BACKUPS_V2. (P2)
  #
  # The mode is explicit and has NO default. Switching the no-argument form to
  # v2 would move every new snapshot out of the directory that rt_backup_latest,
  # rt_backups_prune and rt_cmd_rollback read — a rollback behaviour change, and
  # P2 is required to leave rollback exactly as it is. Format-2 snapshots are
  # also deliberately invisible to a 1.1.0 library, which discovers only
  # $RT_BACKUPS/*/ and would otherwise half-restore one.
  if [ "${1:-}" = "v2" ]; then
    shift
    rt_backup_create_v2 "$@"
    return $?
  fi
  local ts dir ver
  [ -f "$RT_DIST" ] || { rt_err "nothing to back up: $RT_DIST missing"; return 1; }
  ver="$(cat "$RT_VERSION_FILE" 2>/dev/null || echo unknown)"
  ver="$(printf '%s' "$ver" | LC_ALL=C tr -cd 'A-Za-z0-9._-')"
  [ -n "$ver" ] || ver="unknown"
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  dir="$RT_BACKUPS/${ts}__${ver}"
  mkdir -p "$dir" || return 1
  cp -- "$RT_DIST" "$dir/template.html" || { rt_safe_rmdir "$dir"; return 1; }
  rt_sha256 "$dir/template.html" > "$dir/template.html.sha256" \
    || { rt_safe_rmdir "$dir"; return 1; }
  [ -f "$RT_CONFIG" ]       && cp -- "$RT_CONFIG" "$dir/config.env"
  [ -f "$RT_VERSION_FILE" ] && cp -- "$RT_VERSION_FILE" "$dir/VERSION"
  { printf 'created=%s\n' "$ts"; printf 'version=%s\n' "$ver"; } > "$dir/meta"
  # informational only: the restore path re-derives the template identity from
  # the artifact's own checksum, so a wrong or stale record here can mislead a
  # human but never the restore logic.
  local tpl_id
  tpl_id="$(rt_template_id_for_artifact "$RT_DIST")"
  [ -n "$tpl_id" ] && printf 'template=%s\n' "$tpl_id" >> "$dir/meta"
  chmod 700 "$dir" 2>/dev/null || true
  [ -f "$dir/config.env" ] && chmod 640 "$dir/config.env" 2>/dev/null || true
  printf '%s' "$dir"
}

rt_backup_validate() {
  # a backup is usable only if its template is present and still matches the
  # checksum recorded alongside it.
  local d="$1" want
  [ -d "$d" ] || return 1
  [ -f "$d/template.html" ] || return 1
  [ -f "$d/template.html.sha256" ] || return 1
  want="$(LC_ALL=C awk '{print $1; exit}' "$d/template.html.sha256" 2>/dev/null)"
  rt_verify_sha256 "$d/template.html" "$want" >/dev/null 2>&1
}

rt_backups_list() {
  # print valid backup dir paths, newest first.
  [ -d "$RT_BACKUPS" ] || return 0
  local d
  for d in "$RT_BACKUPS"/*/; do
    [ -d "$d" ] || continue
    d="${d%/}"
    rt_backup_validate "$d" && printf '%s\n' "$d"
  done | LC_ALL=C sort -r
}

rt_backup_latest() { rt_backups_list | head -n1; }

rt_backups_prune() {
  # keep the KEEP newest valid backups (KEEP>=2 enforced by callers); delete the
  # rest through the safe choke point. Corrupt/foreign dirs are left untouched.
  local keep="${1:-2}" n=0 d
  [ "$keep" -ge 1 ] 2>/dev/null || keep=2
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    n=$((n + 1))
    [ "$n" -le "$keep" ] && continue
    rt_safe_rmdir "$d" || rt_warn "could not prune backup: $d"
  done < <(rt_backups_list)
}

# --- snapshot format model (Phase 8E reader, P2 writer) -----------------------
# THE DEFECT, RECORDED SO IT IS NOT REPEATED: `meta` is written by
# rt_backup_create and read by nothing. A grep of this library returns only the
# two writes. Anything a future format stores must be readable FIRST — a value
# written into a file no code reads is a value no rollback can use.
#
# FORMAT MODEL
#   1  the shipped 1.1.0 snapshot. No `format` marker, no `manifest`, no
#      `panels/`. ABSENT MEANS FORMAT 1 — treating "absent" as "unknown" would
#      make every existing backup unreadable.
#   2  panel state, a manifest, and a canonical `format` marker file. Written
#      only under $RT_BACKUPS_V2, and only by rt_backup_create_v2.
#
# A TOUCHED PANEL DIRECTORY (format 2) HOLDS EXACTLY THESE, and a directory
# missing any of them is an incomplete snapshot rather than a panel with nothing
# to record:
#   selection.state   absent | empty | present  — the ACTION a restore takes
#   selection         the raw previous value, only when state=present
#   meta              mechanism=db|env|api and was_running=0|1
#   files             the relative paths we placed, one per line, always written
#                     (empty when we placed nothing). Both target panels resolve
#                     templates relative to their own directory, so the paths are
#                     RELATIVE — an absolute path could not be checked against a
#                     recorded root before removal (B11) and would invite a
#                     removal outside the panel's tree.
# The `files` list is what makes rollback remove OUR file without ever removing
# the operator's directory, which may hold templates that are not ours.
#
# NAMESPACES
#   $RT_BACKUPS      format-1 snapshots. The shipped 1.1.0 library discovers
#                    this and nothing else, so a format-2 snapshot must never
#                    land here: the old library would find a valid template.html
#                    + sidecar, restore them, and leave the panel selection
#                    pointing at the directory it just replaced. That is the
#                    half-rollback, and a separate namespace prevents it
#                    structurally rather than by convention.
#   $RT_BACKUPS_V2   format-2 snapshots. Only a library that understands format
#                    2 reads it.
#
# P2 IS INERT WITH RESPECT TO ROLLBACK. rt_backup_latest, rt_backups_prune and
# rt_cmd_rollback are untouched and still read $RT_BACKUPS only. The v2
# discovery helpers below exist for tests and for the phase that wires rollback
# to v2; no production path calls them.

# The highest snapshot format this library can READ. Raised to 2 in P2 — after
# the format-2 reader existed and its tests passed, never before.
RT_BACKUP_FORMAT_READABLE=2

# The panel ids this library will record state for. A CLOSED SET: an id outside
# it is refused rather than sanitised, because a panel directory we do not
# understand is exactly the case where a rollback would act on the wrong thing.
RT_PANEL_IDS="3xui pasarguard rebecca"

rt_panel_id_ok() {
  # 0 only for an id in the closed set above. Rejects uppercase, spaces, empty,
  # traversal and unknown ids in one comparison — there is no partial match and
  # no normalisation, so nothing is silently rewritten into something valid.
  [ -n "${1:-}" ] || return 1
  case " $RT_PANEL_IDS " in
    *" $1 "*) return 0 ;;
    *)        return 1 ;;
  esac
}

rt_backup_relpath_ok() {
  # The CLOSED grammar a snapshot manifest entry may use. The writer and the
  # reader BOTH call this, so a path the writer emits can never be one the
  # reader refuses — the two cannot drift apart.
  #
  #   allowed: A-Z a-z 0-9 . _ - /
  #   refused: absolute, trailing slash, "." or "..", an empty component,
  #            a "." or ".." component, >= 256 bytes, and anything outside the
  #            allowed set — which covers every control character and space
  local p="${1:-}"
  [ -n "$p" ] || return 1
  [ "${#p}" -lt 256 ] || return 1
  case "$p" in
    /*)                              return 1 ;;   # absolute
    */)                              return 1 ;;   # trailing slash => directory
    .|..)                            return 1 ;;
    *//*)                            return 1 ;;   # empty component
    ./|./*)                          return 1 ;;   # leading "." component
    */./*|*/.|*/..|*/../*|../*|..)   return 1 ;;   # "." / ".." component
  esac
  case "$p" in
    *[!A-Za-z0-9._/-]*)              return 1 ;;   # space, control chars, anything else
  esac
  return 0
}

rt_backup_format() {
  # echo the snapshot's format number (1 or 2). Return 1 — printing nothing —
  # when the value is malformed, names a format this library cannot read, or
  # when two records of the same fact disagree.
  #
  # SOURCES, in order of authority:
  #   1. <snapshot>/format    the canonical marker (format 2+). Content "2\n".
  #   2. meta's `format` key  a legacy record, read for compatibility only.
  #   3. neither              format 1 — the shipped 1.1.0 snapshot.
  #
  # Refusing is deliberate: ignoring the parts of an unknown format we do not
  # understand is exactly the silent half-rollback the marker exists to prevent.
  local dir="$1" canon legacy raw nbytes
  [ -d "$dir" ] || return 1

  canon=""
  if [ -f "$dir/format" ]; then
    [ -L "$dir/format" ] && return 1                 # a symlinked marker is refused
    canon="$(cat -- "$dir/format" 2>/dev/null || true)"
    # The marker is exactly one line of digits. $(…) strips trailing newlines,
    # so re-adding the one newline must reproduce the file's byte count: that
    # rejects a second line, a stray CR, and a trailing blank line alike.
    nbytes="$(wc -c < "$dir/format" 2>/dev/null | LC_ALL=C tr -cd '0-9')"
    [ -n "$nbytes" ] || return 1
    [ "$nbytes" -eq $(( ${#canon} + 1 )) ] 2>/dev/null || return 1
  fi
  legacy="$(rt_manifest_get format "$dir/meta")"

  if [ -n "$canon" ] && [ -n "$legacy" ] && [ "$canon" != "$legacy" ]; then
    rt_err "snapshot records two different formats (format file '$canon', meta '$legacy')"
    return 1
  fi

  raw="${canon:-$legacy}"
  [ -n "$raw" ] || { printf '1'; return 0; }          # absent => format 1
  case "$raw" in
    *[!0-9]*) return 1 ;;                             # malformed: "two", " 1", "1 "
  esac
  [ "$raw" -ge 1 ] 2>/dev/null || return 1
  [ "$raw" -le "$RT_BACKUP_FORMAT_READABLE" ] 2>/dev/null || return 1
  printf '%s' "$raw"
}

rt_backup_meta() {
  # echo KEY's value from the snapshot's meta. Empty when absent — which for
  # `format` is meaningful (format 1) and for any other key is simply "unset".
  rt_manifest_get "$1" "$2/meta"
}

rt_backup_panels() {
  # echo the comma-separated panels this snapshot RECORDS STATE FOR.
  #
  # THE FILESYSTEM IS THE AUTHORITY, never a `panels=` key in meta. A key can
  # claim a panel whose state is not on disk, and a rollback would then try to
  # restore from nothing; a directory can only exist if something wrote it.
  #
  # Empty for a format-1 snapshot — but "empty" and "format 1" are different
  # facts, and only rt_backup_format distinguishes them.
  #
  # An unknown or malformed panel directory makes the snapshot INVALID rather
  # than being skipped: silently ignoring a panel directory we do not understand
  # is the half-restore this model exists to prevent.
  local dir="$1" d name out=""
  [ -d "$dir" ] || return 1
  [ -d "$dir/panels" ] || return 0
  for d in "$dir/panels"/*; do
    [ -e "$d" ] || [ -L "$d" ] || continue
    [ -L "$d" ] && return 1                            # symlinked panel dir
    [ -d "$d" ] || return 1                            # a file in panels/
    name="${d##*/}"
    rt_panel_id_ok "$name" || return 1                 # unknown / malformed id
    if [ -n "$out" ]; then out="$out,$name"; else out="$name"; fi
  done
  printf '%s' "$out"
}

rt_backup_panel_state() {
  # echo the SELECTION STATE recorded for PANEL: absent, empty or present.
  # Empty output when the transaction did not touch the panel.
  #
  # The state file holds a bare word, read as DATA. It is never sourced and
  # never evaluated — a snapshot is untrusted input like any other file.
  #
  # The three states are not decoration:
  #   absent   the setting did not exist   -> restore by REMOVING it
  #   empty    the setting existed, empty  -> restore by WRITING an empty value
  #   present  the setting had a value     -> restore that value
  # `absent` and `empty` both have no `selection` file, and that is correct:
  # what differs is the ACTION a restore takes, which is what this file records.
  # There are deliberately NO sentinel values inside `selection` itself —
  # writing the word ABSENT there would conflate "the setting was empty" with
  # "the setting's value is the literal string ABSENT".
  local dir="$1" panel="${2:-}" st
  [ -n "$panel" ] || return 1
  rt_panel_id_ok "$panel" || return 1
  [ -d "$dir/panels/$panel" ] || return 0              # not touched
  [ -L "$dir/panels/$panel/selection.state" ] && return 1
  [ -f "$dir/panels/$panel/selection.state" ] || return 1
  st="$(cat -- "$dir/panels/$panel/selection.state" 2>/dev/null || true)"
  case "$st" in
    absent|empty|present) : ;;
    *) return 1 ;;
  esac
  if [ "$st" = "present" ]; then
    [ -L "$dir/panels/$panel/selection" ] && return 1
    [ -f "$dir/panels/$panel/selection" ] || return 1
  else
    if [ -e "$dir/panels/$panel/selection" ] || [ -L "$dir/panels/$panel/selection" ]; then
      return 1                                         # absent/empty => no selection file
    fi
  fi
  printf '%s' "$st"
}

rt_backup_panel_selection() {
  # echo the raw selection VALUE for PANEL, or nothing when the state is not
  # `present`. Emitted verbatim as data; it is never evaluated.
  local dir="$1" panel="${2:-}" st
  [ -n "$panel" ] || return 1
  st="$(rt_backup_panel_state "$dir" "$panel")" || return 1
  [ "$st" = "present" ] || return 0
  cat -- "$dir/panels/$panel/selection"
}

rt_backup_panel_files() {
  # echo the PLACED-FILE LIST recorded for PANEL: the relative paths Row-Template
  # created inside that panel's managed root, one per line, in the order stored.
  # Empty output when the panel was not touched, or was touched but placed
  # nothing (3X-UI).
  #
  # WHY THIS EXISTS. PasarGuard and Rebecca both place a file into a directory
  # the operator also owns. Rollback must remove OUR file and must never remove
  # the DIRECTORY — an operator's custom template directory holds their own
  # work. Without a record of which files we placed, rollback has no way to
  # distinguish them, and the only options left are "delete the directory"
  # (destroys operator content) or "delete nothing" (leaves our file behind and
  # the panel pointing at it). Neither is a rollback. See
  # INSTALLER-BACKUP-REVIEW.md §1 and INSTALLER-MULTIPANEL-DESIGN.md §9 rule 1.
  #
  # PATHS ARE RELATIVE, to the panel's own managed root, and are validated by
  # rt_backup_relpath_ok — the SAME closed grammar the writer uses, so a path
  # the writer emits can never be one the reader refuses. An absolute path is
  # NOT stored: it cannot be checked against a recorded root at restore time,
  # and both target panels resolve templates relative to their directory anyway.
  #
  # Read as DATA. The file is never sourced and never evaluated; a snapshot is
  # untrusted input like any other file.
  #
  # Exit: 0 with the list (possibly empty) when valid; 1 when malformed. A
  # touched panel directory WITHOUT a `files` file is malformed — the writer
  # always emits one, so its absence means the snapshot is incomplete, not that
  # no files were placed. That distinction is the whole reason an empty file is
  # written rather than omitted.
  local dir="$1" panel="${2:-}" f line seen
  [ -n "$panel" ] || return 1
  rt_panel_id_ok "$panel" || return 1
  [ -d "$dir/panels/$panel" ] || return 0              # not touched
  f="$dir/panels/$panel/files"
  [ -L "$f" ] && return 1                              # a symlinked list is refused
  [ -f "$f" ] || return 1                              # touched => files must exist
  #
  # AN EMPTY LIST IS VALID, and it is the NORMAL case: 3X-UI places no file, so
  # a 3X-UI panel's record is legitimately zero bytes. The early return states
  # that explicitly rather than leaving it to the loop falling through, so the
  # next reader does not have to reason about what a `while` over an empty
  # stream does. An ABSENT file is still refused below: the writer always emits
  # one, so its absence means the record is incomplete, not that nothing was
  # placed.
  [ -s "$f" ] || return 0
  seen=""
  #
  # The `|| [ -n "$line" ]` terminator is DEFENCE IN DEPTH. `read` returns false
  # when it hits EOF without a newline, so a `while` loop silently DROPS an
  # unterminated final line — and a truncated record then reads as a SHORTER
  # record rather than as a damaged one. That is the dangerous direction: a
  # rollback would leave our last placed file behind while reporting that it had
  # removed everything it placed. The writer always terminates every line it
  # emits, so this guards a damaged or foreign snapshot rather than a case the
  # writer produces. A blank line still fails the `[ -n "$line" ]` test above
  # and is refused as before.
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || return 1                         # no blank lines
    rt_backup_relpath_ok "$line" || return 1           # closed grammar
    case ",$seen," in
      *",$line,"*) return 1 ;;                         # no duplicates
    esac
    seen="${seen:+$seen,}$line"
    printf '%s\n' "$line"
  done < "$f"
  return 0
}

rt_backup_panel_meta_check() {
  # 0 when a touched panel's meta is present and within the closed value sets.
  # `mechanism` names the path a restore must use — a restore through a
  # different path can fail in ways the original never would. `was_running` is
  # what tells a rollback whether to restart the service or leave it stopped;
  # without it a rollback can only guess, and guessing means either a stopped
  # panel or starting a service the operator had deliberately shut down.
  local dir="$1" panel="${2:-}" m w
  [ -n "$panel" ] || return 1
  [ -L "$dir/panels/$panel/meta" ] && return 1
  [ -f "$dir/panels/$panel/meta" ] || return 1
  m="$(rt_manifest_get mechanism "$dir/panels/$panel/meta")"
  w="$(rt_manifest_get was_running "$dir/panels/$panel/meta")"
  case "$m" in db|env|api) : ;; *) return 1 ;; esac
  case "$w" in 0|1) : ;; *) return 1 ;; esac
  return 0
}

rt_backup_manifest_check() {
  # 0 when the snapshot's manifest is present and every file it lists still
  # matches. A snapshot with NO manifest is format 1 and is accepted — the
  # shipped library writes none, so requiring one would refuse every existing
  # backup. 1 when a manifest is present but fails, which is a real corruption.
  #
  # The grammar here is rt_backup_relpath_ok, the SAME function the writer uses.
  local dir="$1" line want rel f
  [ -d "$dir" ] || return 1
  [ -L "$dir/manifest" ] && return 1
  [ -f "$dir/manifest" ] || return 0                 # format 1: no manifest
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    want="${line%%  *}"                              # before the FIRST two spaces
    rel="${line#*  }"                                # after it
    [ -n "$want" ] && [ -n "$rel" ] && [ "$rel" != "$line" ] || return 1
    case "$want" in
      *[!0-9a-f]*) return 1 ;;                       # lowercase hex only
    esac
    [ "${#want}" -eq 64 ] || return 1
    [ "$rel" = "manifest" ] && return 1              # never hashes itself
    rt_backup_relpath_ok "$rel" || return 1
    f="$dir/$rel"
    [ -L "$f" ] && return 1                          # symlinks are refused
    [ -f "$f" ] || return 1                          # files only, and present
    rt_verify_sha256 "$f" "$want" >/dev/null 2>&1 || return 1
  done < "$dir/manifest"
  return 0
}

rt_backup_snapshot_check() {
  # the composite a future rollback will call: the existing artifact validation,
  # then the format, then the manifest, then the panel state. Kept separate from
  # rt_backup_validate so that function's behaviour is untouched.
  #
  # Panel state is validated here and not in rt_backup_validate, because
  # rt_backup_validate is what the LIVE rollback path calls and P2 must not
  # change what rollback accepts.
  #
  # A TOUCHED PANEL MUST BE STRUCTURALLY COMPLETE: selection.state, the
  # selection rules that follow from it, meta, and files. A panel directory
  # missing any of them is an incomplete snapshot, not a panel with nothing to
  # restore — a rollback that read a truncated record would act on it. The
  # `files` check is what makes "we placed nothing" (an empty file, valid)
  # distinguishable from "the record is missing" (invalid).
  local dir="$1" panels p
  rt_backup_validate "$dir" || return 1
  rt_backup_format "$dir" >/dev/null || return 1
  rt_backup_manifest_check "$dir" || return 1
  panels="$(rt_backup_panels "$dir")" || return 1
  [ -n "$panels" ] || return 0
  local IFS=','
  for p in $panels; do
    rt_backup_panel_state "$dir" "$p" >/dev/null || return 1
    rt_backup_panel_meta_check "$dir" "$p" || return 1
    rt_backup_panel_files "$dir" "$p" >/dev/null || return 1
  done
  return 0
}

# --- format-2 snapshot writer (P2) -------------------------------------------
# INFRASTRUCTURE ONLY. This writes format-2 snapshots; it does not activate a
# panel, restore a panel, or change what rollback reads. rt_cmd_rollback,
# rt_backup_latest and rt_backups_prune are untouched and still see $RT_BACKUPS
# only — see the namespace note above for why that is not an oversight.

rt_backups_list_v1() {
  # the format-1 namespace, explicitly named. Identical to rt_backups_list,
  # which is left untouched because rollback reads it; this alias exists so the
  # v1/v2 split is visible at every call site rather than implied.
  rt_backups_list
}

rt_backups_list_v2() {
  # print valid format-2 snapshot dirs, newest first. Reads $RT_BACKUPS_V2 ONLY.
  [ -d "$RT_BACKUPS_V2" ] || return 0
  local d
  for d in "$RT_BACKUPS_V2"/*/; do
    [ -d "$d" ] || continue
    d="${d%/}"
    case "${d##*/}" in .tmp.*) continue ;; esac      # never a half-built snapshot
    rt_backup_snapshot_check "$d" >/dev/null 2>&1 && printf '%s\n' "$d"
  done | LC_ALL=C sort -r
}

rt_backups_list_all() {
  # both namespaces, newest first. NOT called by any production path in P2.
  { rt_backups_list_v1; rt_backups_list_v2; } | LC_ALL=C sort -r
}

rt_backup_resolve() {
  # Resolve SELECTOR to a snapshot directory, refusing anything that is not a
  # valid format-2 snapshot inside $RT_BACKUPS_V2. A path is accepted only after
  # containment is proven, so a caller cannot be talked into addressing a
  # snapshot outside the namespace — which is what keeps a v2 path from being
  # reachable through a v1-shaped code path.
  local sel="${1:-}" d
  [ -n "$sel" ] || return 1
  case "$sel" in
    /*) d="$sel" ;;
    *)  d="$RT_BACKUPS_V2/$sel" ;;
  esac
  [ -d "$d" ] || return 1
  rt_assert_not_symlink "$d" || return 1
  rt_is_within "$RT_BACKUPS_V2" "$d" || return 1
  rt_backup_snapshot_check "$d" >/dev/null 2>&1 || return 1
  printf '%s' "$d"
}

rt_backup_panel_write() {
  # Write one panel's snapshot data into a staging directory. This is the ONLY
  # way panel state can enter a snapshot, so the closed value sets are enforced
  # here and nothing can bypass them.
  #
  #   rt_backup_panel_write <stagedir> <panel> <state> [value] [mechanism] [was_running] [place-file...]
  #
  #   state        absent | empty | present
  #   value        required iff state=present; ignored otherwise
  #   mechanism    db | env | api            (required)
  #   was_running  0 | 1                     (required)
  #   place-file   zero or more relative paths we placed inside the panel's
  #                managed root; each validated by rt_backup_relpath_ok
  #
  # PLACED FILES. The trailing arguments are the files Row-Template created
  # inside the panel's own directory — a Jinja2 shell under PasarGuard's
  # custom_templates_directory, a pongo2 shell inside Rebecca's. A rollback
  # removes exactly these and never the containing directory, because the
  # operator's own templates live there. 3X-UI places no file and passes none.
  #
  # PATHS ARE RELATIVE and are refused unless they satisfy the closed grammar
  # shared with the reader. An absolute path is rejected outright rather than
  # stored: it cannot be verified against a recorded root before removal (B11),
  # and storing one would invite a removal outside the panel's own tree.
  #
  # NO SENTINEL VALUES. `absent` and `empty` both leave the `selection` file
  # absent; what differs is the state word, which is the instruction a restore
  # follows.
  #
  # SECRETS ARE NEVER WRITTEN HERE. The function accepts no free-form key/value
  # input at all — it writes exactly the files below, from exactly these
  # arguments. There is no path by which an activation token could reach a
  # snapshot, which is the property B5 requires and the reason this takes
  # positional arguments rather than a caller-supplied meta file. The trailing
  # place-file arguments are paths, not contents: nothing a caller passes here
  # can carry file bytes, so the property survives this addition.
  local snap="${1:-}" panel="${2:-}" state="${3:-}" value="${4:-}"
  local mech="${5:-}" running="${6:-}" d p sorted
  [ -n "$snap" ] || { rt_err "panel write: no staging directory given"; return 1; }
  rt_panel_id_ok "$panel" || { rt_err "panel write: unknown panel id: $panel"; return 1; }
  case "$state" in
    absent|empty|present) : ;;
    *) rt_err "panel write: state must be absent|empty|present, got '$state'"; return 1 ;;
  esac
  case "$mech" in
    db|env|api) : ;;
    *) rt_err "panel write: mechanism must be db|env|api, got '$mech'"; return 1 ;;
  esac
  case "$running" in
    0|1) : ;;
    *) rt_err "panel write: was_running must be 0 or 1, got '$running'"; return 1 ;;
  esac
  if [ "$state" = "present" ] && [ -z "$value" ]; then
    rt_err "panel write: state=present requires a value"; return 1
  fi
  shift 6
  for p in "$@"; do
    [ -n "$p" ] || { rt_err "panel write: empty placed-file path"; return 1; }
    rt_backup_relpath_ok "$p" || {
      rt_err "panel write: placed file is not a legal relative path: $p"; return 1; }
  done

  d="$snap/$panel"
  mkdir -p "$d" || return 1
  rm -f -- "$d/selection"
  printf '%s\n' "$state" > "$d/selection.state" || return 1
  if [ "$state" = "present" ]; then
    # written with NO trailing newline: the file holds the raw value, so a
    # restore writes back exactly what the panel reported
    printf '%s' "$value" > "$d/selection" || return 1
  fi
  printf 'mechanism=%s\n' "$mech"      > "$d/meta"  || return 1
  printf 'was_running=%s\n' "$running" >> "$d/meta" || return 1
  # THE `files` FILE IS ALWAYS WRITTEN, even when empty. An absent file would
  # be indistinguishable from an incomplete snapshot, and the reader refuses
  # that — so "we placed nothing" must be recorded, not implied. Sorted
  # LC_ALL=C and de-duplicated, so the same placement always yields the same
  # bytes and two snapshots of the same state compare equal.
  if [ "$#" -eq 0 ]; then
    : > "$d/files" || return 1
  else
    sorted="$(for p in "$@"; do printf '%s\n' "$p"; done | LC_ALL=C sort | LC_ALL=C uniq)"
    # the terminator is part of the FORMAT, not of "$sorted": $( ) strips
    # the final newline, so a format of '%s' would write the last entry with
    # no terminator at all
    printf '%s\n' "$sorted" > "$d/files" || return 1
  fi
  return 0
}

rt_backup_manifest_write() {
  # Write SNAPDIR/manifest: one "<sha256>  <relative-path>" line per captured
  # file, LC_ALL=C sorted, never including the manifest itself.
  #
  # Deterministic: the same snapshot content always produces byte-identical
  # output, so two snapshots of the same state compare equal.
  #
  # Called LAST, after every other file exists, so it cannot omit a file that
  # was written afterwards.
  local dir="$1" rel f
  [ -d "$dir" ] || return 1
  [ -L "$dir" ] && return 1

  # A symlink anywhere in the snapshot is refused outright. `find -type f` does
  # NOT report symlinks, so without this check a symlink would be silently
  # omitted from the manifest instead of rejected.
  if [ -n "$(cd "$dir" && find . -type l -print -quit 2>/dev/null)" ]; then
    rt_err "refusing to manifest a snapshot containing a symlink"
    return 1
  fi

  : > "$dir/manifest" || return 1
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    rel="${rel#./}"
    [ "$rel" = "manifest" ] && continue              # never hashes itself
    rt_backup_relpath_ok "$rel" || {
      rt_err "path cannot be represented in a manifest: $rel"; return 1; }
    f="$dir/$rel"
    [ -f "$f" ] || continue
    printf '%s  %s\n' "$(rt_sha256 "$f")" "$rel" >> "$dir/manifest" || return 1
  done < <(cd "$dir" && find . -type f -print 2>/dev/null | LC_ALL=C sort)
  return 0
}

rt_backup_create_v2() {
  # Create a format-2 snapshot under $RT_BACKUPS_V2 and echo its final path.
  #
  # ATOMIC. Everything is built inside $RT_BACKUPS_V2/.tmp.XXXXXX and renamed
  # into place only once it fully validates. The temporary name begins with a dot
  # and is skipped by rt_backups_list_v2, so a snapshot is never visible in a
  # half-built state: a reader sees the whole snapshot or nothing at all.
  #
  # PANEL STATE IS WRITTEN ONLY FOR THE PANELS NAMED, and only from what an
  # adapter staged through rt_backup_panel_write. P2 has no adapters and
  # auto-detects nothing: a writer that guessed which panels were touched would
  # record state it cannot vouch for, and a rollback would act on the guess.
  #
  # Usage: rt_backup_create_v2 [PANEL…]
  local tmp final ts ver tpl_id panel src d f
  [ -f "$RT_DIST" ] || { rt_err "nothing to back up: $RT_DIST missing"; return 1; }

  # 1. the namespace, safely
  [ -L "$RT_BACKUPS_V2" ] && { rt_err "refusing to write through a symlink: $RT_BACKUPS_V2"; return 1; }
  mkdir -p "$RT_BACKUPS_V2" || return 1
  chmod 700 "$RT_BACKUPS_V2" 2>/dev/null || true

  # 2/3. the temporary snapshot, mode 700 from the moment it exists
  tmp="$(mktemp -d "$RT_BACKUPS_V2/.tmp.XXXXXX")" \
    || { rt_err "could not create a temporary snapshot"; return 1; }
  chmod 700 "$tmp" 2>/dev/null || true

  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  ver="$(cat "$RT_VERSION_FILE" 2>/dev/null || echo unknown)"
  ver="$(printf '%s' "$ver" | LC_ALL=C tr -cd 'A-Za-z0-9._-')"
  [ -n "$ver" ] || ver="unknown"

  # 4. the Row-Template state — exactly what the format-1 writer captures
  cp -- "$RT_DIST" "$tmp/template.html" || { rt_safe_rmdir "$tmp"; return 1; }
  rt_sha256 "$tmp/template.html" > "$tmp/template.html.sha256" \
    || { rt_safe_rmdir "$tmp"; return 1; }
  [ -f "$RT_CONFIG" ]       && cp -- "$RT_CONFIG" "$tmp/config.env"
  [ -f "$RT_VERSION_FILE" ] && cp -- "$RT_VERSION_FILE" "$tmp/VERSION"
  { printf 'created=%s\n' "$ts"; printf 'version=%s\n' "$ver"; } > "$tmp/meta" \
    || { rt_safe_rmdir "$tmp"; return 1; }
  tpl_id="$(rt_template_id_for_artifact "$RT_DIST")"
  [ -n "$tpl_id" ] && printf 'template=%s\n' "$tpl_id" >> "$tmp/meta"
  # NOTE: no `format=` key is written into meta, and no `panels=` key either.
  # The format lives in its own canonical file; the panel list is the
  # filesystem, because a key can claim a panel whose state is not on disk.

  # 5. panel state, only for the panels named, only from the staged copy
  for panel in "$@"; do
    [ -n "$panel" ] || continue
    rt_panel_id_ok "$panel" || { rt_err "unknown panel id: $panel"; rt_safe_rmdir "$tmp"; return 1; }
    src="$RT_PANEL_STAGE/$panel"
    [ -d "$src" ] || { rt_err "no staged state for panel: $panel"; rt_safe_rmdir "$tmp"; return 1; }
    d="$tmp/panels/$panel"
    mkdir -p "$d" || { rt_safe_rmdir "$tmp"; return 1; }
    for f in selection.state selection meta files; do
      [ -e "$src/$f" ] || [ -L "$src/$f" ] || {
        # `files` is REQUIRED for a touched panel; the other three are
        # conditional on the state word. A staged panel without a files list
        # is an incomplete record, and copying it "as absent" would produce a
        # snapshot whose only symptom is a reader refusal at restore time.
        [ "$f" = "files" ] && { rt_err "panel $panel: staged state has no files list"; rt_safe_rmdir "$tmp"; return 1; }
        continue
      }
      [ -L "$src/$f" ] && { rt_err "refusing to stage a symlink: $panel/$f"; rt_safe_rmdir "$tmp"; return 1; }
      cp -- "$src/$f" "$d/$f" || { rt_safe_rmdir "$tmp"; return 1; }
    done
  done

  # 6. the canonical format marker: this file, and nothing else
  printf '2\n' > "$tmp/format" || { rt_safe_rmdir "$tmp"; return 1; }

  # 7. the manifest, generated last so it cannot omit a later file
  rt_backup_manifest_write "$tmp" || { rt_safe_rmdir "$tmp"; return 1; }

  # 8. the snapshot must FULLY validate before it is exposed
  if ! rt_backup_snapshot_check "$tmp" >/dev/null 2>&1; then
    rt_err "the new snapshot failed validation and was discarded"
    rt_safe_rmdir "$tmp"; return 1
  fi

  # 9. permissions, then the atomic rename
  chmod 700 "$tmp" 2>/dev/null || true
  [ -f "$tmp/config.env" ] && chmod 640 "$tmp/config.env" 2>/dev/null || true
  final="$RT_BACKUPS_V2/${ts}__${ver}"
  [ -e "$final" ] && { rt_err "snapshot already exists: $final"; rt_safe_rmdir "$tmp"; return 1; }
  mv -- "$tmp" "$final" || { rt_safe_rmdir "$tmp"; return 1; }

  # 10.
  printf '%s' "$final"
}

# --- 3x-ui discovery ---------------------------------------------------------
# The panel and Row-Template are deliberately independent. Discovery locates the
# panel binary, its systemd unit and (only if present) its database; it never
# infers the Row-Template root from the panel, or vice versa.

rt_require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    rt_die "this operation must run as root (e.g. sudo $RT_NAME ...)"
  fi
}

rt_detect_xui() {
  # sets RT_XUI_BIN (the Go binary, preferred over the menu wrapper) and
  # RT_XUI_UNIT (systemd unit name). Succeeds if either is found.
  RT_XUI_BIN=""; RT_XUI_UNIT=""
  local c
  for c in /usr/local/x-ui/x-ui /usr/local/bin/x-ui; do
    if [ -x "$c" ]; then RT_XUI_BIN="$c"; break; fi
  done
  if [ -z "$RT_XUI_BIN" ] && command -v x-ui >/dev/null 2>&1; then
    RT_XUI_BIN="$(command -v x-ui)"
  fi
  # NB: no `grep -q` here. Under `set -o pipefail`, grep -q closes the pipe on the
  # first match and systemctl dies of SIGPIPE (rc 141), which pipefail then makes
  # the pipeline's status — so the condition read false and the unit was "missed"
  # on every box. Letting grep drain all input keeps systemctl's writer happy.
  if command -v systemctl >/dev/null 2>&1 \
     && systemctl list-unit-files 2>/dev/null | LC_ALL=C grep '^x-ui\.service' >/dev/null 2>&1; then
    RT_XUI_UNIT="x-ui.service"
  fi
  [ -n "$RT_XUI_BIN" ] || [ -n "$RT_XUI_UNIT" ]
}

rt_detect_xui_version() {
  # echo the panel's X.Y.Z as reported by the Go binary's -v output. Empty (and
  # non-zero) if it cannot be determined — callers treat that as fail-closed.
  RT_XUI_VERSION=""
  local bin="${RT_XUI_BIN:-}" out ver
  [ -n "$bin" ] || return 1
  out="$("$bin" -v 2>/dev/null || true)"
  ver="$(printf '%s' "$out" | LC_ALL=C grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1 || true)"
  [ -n "$ver" ] || return 1
  RT_XUI_VERSION="$ver"
  printf '%s' "$ver"
}

rt_check_min_version() {
  # fail closed: no detectable version, or below minimum, means do not proceed.
  local v="${RT_XUI_VERSION:-}"
  [ -n "$v" ] || rt_die "cannot determine the 3x-ui version; refusing to proceed"
  if ! rt_semver_ge "$v" "$RT_MIN_XUI"; then
    rt_die "3x-ui $v is below the required minimum $RT_MIN_XUI; not installing"
  fi
}

rt_detect_xui_db() {
  # sets RT_XUI_DB if a panel database can be located. Absence is not fatal — it
  # only means subThemeDir must be set manually rather than programmatically.
  RT_XUI_DB=""
  local candidates=() c
  [ -n "${XUI_DB_FOLDER:-}" ] && candidates+=("$XUI_DB_FOLDER/x-ui.db")
  candidates+=(/etc/x-ui/x-ui.db /usr/local/x-ui/x-ui.db /etc/3x-ui/x-ui.db)
  for c in "${candidates[@]}"; do
    if [ -f "$c" ]; then RT_XUI_DB="$c"; return 0; fi
  done
  return 1
}

# --- service safety ----------------------------------------------------------

rt_service_active() {
  [ -n "${RT_XUI_UNIT:-}" ] || return 1
  systemctl is-active --quiet "$RT_XUI_UNIT"
}
rt_service_start() {
  [ -n "${RT_XUI_UNIT:-}" ] || return 1
  systemctl start "$RT_XUI_UNIT"
}
rt_service_stop() {
  [ -n "${RT_XUI_UNIT:-}" ] || return 1
  systemctl stop "$RT_XUI_UNIT"
}

# --- subThemeDir: point the panel at Row-Template ----------------------------
# Upstream exposes no CLI or config-file mechanism for subThemeDir (confirmed
# against 3x-ui primary source: the `x-ui setting` subcommand covers port/user/
# pass/webBasePath/cert/tgbot/listen/2FA only). So the choices are: mutate the
# settings row directly when sqlite3 is available, or guide the admin to set it
# in the panel UI. We never install sqlite3 to force the first path.

rt_subtheme_get_sqlite() {
  # echo the stored subThemeDir value (may be empty). Non-zero if unreadable.
  command -v sqlite3 >/dev/null 2>&1 || return 2
  [ -n "${RT_XUI_DB:-}" ] || return 2
  sqlite3 "$RT_XUI_DB" "SELECT value FROM settings WHERE key='subThemeDir' LIMIT 1;" 2>/dev/null
}

rt_subtheme_set_sqlite() {
  # set subThemeDir to RT_ROOT following stop -> write -> start -> verify, so a
  # running panel can't flush a stale in-memory value back over the change.
  # Returns 0 on verified persist, 2 if sqlite3/DB unavailable, 1 on failure.
  local want="$RT_ROOT" was_active=0 esc n cur
  command -v sqlite3 >/dev/null 2>&1 || return 2
  [ -n "${RT_XUI_DB:-}" ] || return 2
  rt_service_active && was_active=1 || true
  if [ "$was_active" -eq 1 ]; then rt_service_stop || return 1; fi
  esc="${want//\'/\'\'}"                 # SQL single-quote escaping (data-safe)
  # settings.key has a non-unique index, so INSERT-or-UPDATE explicitly rather
  # than relying on ON CONFLICT (which needs a unique constraint).
  n="$(sqlite3 "$RT_XUI_DB" "SELECT COUNT(*) FROM settings WHERE key='subThemeDir';" 2>/dev/null || echo 0)"
  if [ "${n:-0}" -gt 0 ]; then
    sqlite3 "$RT_XUI_DB" "UPDATE settings SET value='$esc' WHERE key='subThemeDir';" 2>/dev/null \
      || { [ "$was_active" -eq 1 ] && rt_service_start || true; return 1; }
  else
    sqlite3 "$RT_XUI_DB" "INSERT INTO settings (key,value) VALUES ('subThemeDir','$esc');" 2>/dev/null \
      || { [ "$was_active" -eq 1 ] && rt_service_start || true; return 1; }
  fi
  if [ "$was_active" -eq 1 ]; then rt_service_start || return 1; fi
  cur="$(rt_subtheme_get_sqlite || true)"
  [ "$cur" = "$want" ]
}

rt_subtheme_configure() {
  # echo the outcome: "auto" (set + verified in DB) or "manual" (no safe
  # programmatic path — the caller prints panel instructions). A genuine failure
  # (e.g. the service would not restart) is propagated as a non-zero return.
  local rc=0
  rt_subtheme_set_sqlite || rc=$?
  case "$rc" in
    0) printf 'auto' ;;
    2) printf 'manual' ;;
    *) return 1 ;;
  esac
}

# --- functional render smoke -------------------------------------------------
# Filesystem presence is not proof. Where a test URL can be built, confirm what
# the panel actually serves. Any subId used here is a secret: it is read into a
# local variable and never printed, logged or returned.

rt_smoke_derive_url() {
  # echo a localhost /sub/<id> URL, or nothing. Reads the sub port/path and one
  # client subId via sqlite3; requires the DB and sqlite3 to be present.
  command -v sqlite3 >/dev/null 2>&1 || return 1
  [ -n "${RT_XUI_DB:-}" ] || return 1
  local port path sid
  port="$(sqlite3 "$RT_XUI_DB" "SELECT value FROM settings WHERE key='subPort' LIMIT 1;" 2>/dev/null || true)"
  path="$(sqlite3 "$RT_XUI_DB" "SELECT value FROM settings WHERE key='subPath' LIMIT 1;" 2>/dev/null || true)"
  [ -n "$port" ] || port=2096
  [ -n "$path" ] || path="/sub/"
  sid="$(sqlite3 "$RT_XUI_DB" "SELECT settings FROM inbounds LIMIT 200;" 2>/dev/null \
        | LC_ALL=C grep -oE '"subId"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 \
        | LC_ALL=C sed -E 's/.*"([^"]+)"$/\1/' || true)"
  [ -n "$sid" ] || return 1
  case "$path" in /*) : ;; *) path="/$path" ;; esac
  case "$path" in */) : ;; *) path="$path/" ;; esac
  printf 'http://127.0.0.1:%s%s%s' "$port" "$path" "$sid"
}

rt_render_smoke() {
  # classify what a browser request receives: pass (Row-Template served),
  # fallback (built-in default served — our template not active), skip (no test
  # URL could be built), error (endpoint unreachable). Returns 0 always; the
  # caller maps the class to PASS/WARN/FAIL.
  local url body
  url="${RT_SMOKE_URL:-}"
  [ -n "$url" ] || url="$(rt_smoke_derive_url || true)"
  [ -n "$url" ] || { printf 'skip'; return 0; }
  command -v curl >/dev/null 2>&1 || { printf 'skip'; return 0; }
  body="$(curl -fsS -m 10 -A 'Mozilla/5.0' -H 'Accept: text/html' "$url" 2>/dev/null || true)"
  if [ -z "$body" ]; then
    url="https://${url#http://}"
    body="$(curl -fsS -m 10 -k -A 'Mozilla/5.0' -H 'Accept: text/html' "$url" 2>/dev/null || true)"
  fi
  [ -n "$body" ] || { printf 'error'; return 0; }
  # Pure-bash substring test on purpose. `printf %s "$big" | grep -q PAT` under
  # `set -o pipefail` misreports a match as failure: grep -q exits on the first
  # hit, printf then dies with SIGPIPE (141) while writing the long tail, and
  # pipefail promotes 141 to the pipeline status. The served Row-Template page
  # is ~160 KB with an early `id="sub-data"` match, so the pipe form classifies
  # a correctly-served page as 'fallback'. `[[ == *..* ]]` has no pipe.
  if [[ "$body" == *'id="sub-data"'* ]]; then printf 'pass'; else printf 'fallback'; fi
}

rt_render_smoke_vpn() {
  # a VPN-client UA must still get raw subscription content, not the HTML page.
  # pass (got non-HTML), fallback (got HTML — negotiation broken), skip/error.
  local url body
  url="${RT_SMOKE_URL:-}"
  [ -n "$url" ] || url="$(rt_smoke_derive_url || true)"
  [ -n "$url" ] || { printf 'skip'; return 0; }
  command -v curl >/dev/null 2>&1 || { printf 'skip'; return 0; }
  body="$(curl -fsS -m 10 -A 'v2rayNG/1.8.0' "$url" 2>/dev/null || true)"
  if [ -z "$body" ]; then
    url="https://${url#http://}"
    body="$(curl -fsS -m 10 -k -A 'v2rayNG/1.8.0' "$url" 2>/dev/null || true)"
  fi
  [ -n "$body" ] || { printf 'error'; return 0; }
  # Pure-bash test (see rt_render_smoke): a pipe here would hide a broken
  # negotiation that wrongly returned the large HTML page (SIGPIPE -> 'pass').
  if [[ "$body" == *'id="sub-data"'* ]]; then printf 'fallback'; else printf 'pass'; fi
}

# --- install tree + activation ----------------------------------------------

rt_layout_ensure() {
  # create the Row-Template tree with conservative permissions. Idempotent.
  mkdir -p "$RT_ROOT" "$(dirname "$RT_DIST")" "$RT_TEMPLATE_STORE" "$RT_LIB_DIR" "$RT_BACKUPS" || return 1
  chmod 755 "$RT_ROOT" 2>/dev/null || true
  chmod 700 "$RT_BACKUPS" 2>/dev/null || true
}

rt_set_dist() {
  # install SRC as the pristine canonical artifact and record its checksum.
  # SRC must already be a structurally valid Row-Template artifact.
  local src="$1"
  rt_validate_template "$src" || { rt_err "refusing to install an invalid artifact"; return 1; }
  rt_atomic_install "$src" "$RT_DIST" 644 || return 1
  rt_sha256 "$RT_DIST" > "$RT_DIST_SUM" || return 1
  chmod 644 "$RT_DIST_SUM" 2>/dev/null || true
}

rt_activate() {
  # regenerate sub.html from the current artifact + config, validate it, then
  # swap it into the live path atomically. The live file is never truncated: on
  # any failure the previous sub.html stays exactly as it was.
  local staged dir
  dir="$(dirname "$RT_LIVE")"
  staged="$(mktemp "$dir/.live.XXXXXX")" || return 1
  if ! rt_generate "$RT_DIST" "$staged"; then rm -f "$staged"; return 1; fi
  rt_atomic_install "$staged" "$RT_LIVE" 644 || { rm -f "$staged"; return 1; }
  rm -f "$staged"
}

rt_monogram_preview() {
  # best-effort ASCII preview mirroring src/scripts/brand.js for simple Latin
  # names (Katze-VPN -> K-V, Premium 100 GB -> P-G, 123 net -> N). For names
  # with any non-ASCII character it returns non-zero: the caller then shows the
  # name and notes the browser computes the monogram. This is deliberate — Bash
  # ships no second Unicode monogram implementation to disagree with brand.js.
  local name="$1"
  case "$name" in *[!$'\x20'-$'\x7e']*) return 1;; esac
  local norm toks=() t out="" first count=0
  norm="$(printf '%s' "$name" | LC_ALL=C tr '_|/+-' '     ')"
  read -ra toks <<<"$norm"
  for t in "${toks[@]}"; do
    case "$t" in *[A-Za-z]*) : ;; *) continue;; esac
    first="${t:0:1}"
    out+="$(printf '%s' "$first" | LC_ALL=C tr 'a-z' 'A-Z')"
    count=$((count + 1))
    [ "$count" -ge 2 ] && break
    out+="-"
  done
  out="${out%-}"
  [ -n "$out" ] || return 1
  printf '%s' "$out"
}

# --- interactive configuration ----------------------------------------------
# Prompts to stderr so a helper's stdout stays clean. Non-interactive callers
# (automation, CI) provide values through the environment:
# RT_SERVICE_NAME, RT_SUPPORT_URL, RT_LOGO_PATH, RT_LOGO_REMOVE=1.

rt_prompt_text() {
  local label="$1" def="$2" reply
  if [ -n "$def" ]; then printf '  %s [%s]: ' "$label" "$def" >&2
  else printf '  %s: ' "$label" >&2; fi
  IFS= read -r reply || reply=""
  [ -n "$reply" ] || reply="$def"
  [ "$reply" = "-" ] && reply=""      # explicit clear sentinel
  printf '%s' "$reply"
}

rt_config_interactive() {
  # gather branding (existing config supplies the defaults) and write config.env.
  local cur_name cur_url cur_mime cur_logo_b64 name url mime logo_b64 ni=0 mg lp
  cur_name="$(rt_config_get_text SERVICE_NAME_B64 2>/dev/null || true)"
  cur_url="$(rt_config_get_text SUPPORT_URL_B64 2>/dev/null || true)"
  cur_mime="$(rt_config_get_raw LOGO_MIME 2>/dev/null || true)"
  cur_logo_b64="$(rt_config_get_raw LOGO_DATA_B64 2>/dev/null || true)"
  name="$cur_name"; url="$cur_url"; mime="$cur_mime"; logo_b64="$cur_logo_b64"
  { [ -t 0 ] && [ -z "${RT_ASSUME_NONINTERACTIVE:-}" ]; } || ni=1

  # --- service name ---
  if [ -n "${RT_SERVICE_NAME+x}" ]; then name="$RT_SERVICE_NAME"
  elif [ "$ni" -eq 0 ]; then name="$(rt_prompt_text "Service name (Enter to keep, - to clear)" "$cur_name")"; fi
  name="$(rt_trim "$name")"
  rt_validate_service_name "$name" || { rt_err "service name rejected (control chars or too long)"; return 1; }
  if [ "$ni" -eq 0 ] && [ -n "$name" ]; then
    if mg="$(rt_monogram_preview "$name")"; then rt_info "Monogram preview: $mg"
    else rt_info "Monogram: computed in the browser for \"$name\"."; fi
  fi

  # --- support URL ---
  if [ -n "${RT_SUPPORT_URL+x}" ]; then url="$RT_SUPPORT_URL"
  elif [ "$ni" -eq 0 ]; then
    while true; do
      url="$(rt_prompt_text "Support URL, optional (Enter to keep, - to clear)" "$cur_url")"
      rt_validate_support_url "$url" && break
      rt_warn "Use https://, http://, tg:// or mailto: — or clear it with -"
    done
  fi
  url="$(rt_trim "$url")"
  rt_validate_support_url "$url" || { rt_err "support URL rejected"; return 1; }

  # --- logo ---
  if [ -n "${RT_LOGO_REMOVE:-}" ]; then mime=""; logo_b64=""
  elif [ -n "${RT_LOGO_PATH:-}" ]; then
    mime="$(rt_logo_validate "$RT_LOGO_PATH")" || return 1
    [ -L "$RT_LOGO_PATH" ] && { rt_err "logo path became a symlink after validation; aborting."; return 1; }
    logo_b64="$(base64 < "$RT_LOGO_PATH" | tr -d '\n')"
  elif [ "$ni" -eq 0 ]; then
    local have="none"; [ -n "$cur_logo_b64" ] && have="present ($cur_mime)"
    printf '  Logo file [%s] (Enter to keep, - to remove, or a path): ' "$have" >&2
    IFS= read -r lp || lp=""
    if [ -z "$lp" ]; then :                    # keep current
    elif [ "$lp" = "-" ]; then mime=""; logo_b64=""
    else
      mime="$(rt_logo_validate "$lp")" || return 1
      [ -L "$lp" ] && { rt_err "logo path became a symlink after validation; aborting."; return 1; }
      logo_b64="$(base64 < "$lp" | tr -d '\n')"
    fi
  fi

  rt_config_write "$name" "$url" "$mime" "$logo_b64"
}

# --- temp cleanup (entry scripts trap EXIT -> rt_cleanup) --------------------

RT_TMP_TO_CLEAN=()
rt_mktemp_dir() {
  local d; d="$(mktemp -d)" || return 1
  # NOTE: callers invoke this as `x="$(rt_mktemp_dir)"`, i.e. inside a command
  # substitution, so this append lands in a subshell and is lost to the parent.
  # It is kept for the (currently none) non-substituted caller; every command-
  # substitution caller MUST also register the path in its own shell so the
  # EXIT-trap rt_cleanup can see it (see rt_cmd_update).
  RT_TMP_TO_CLEAN+=("$d"); printf '%s' "$d"
}
rt_cleanup() {
  local d
  for d in "${RT_TMP_TO_CLEAN[@]:-}"; do
    [ -n "$d" ] && [ -d "$d" ] && rm -rf -- "$d"
  done
  # Always succeed: this runs from the entry scripts' EXIT trap, and a non-zero
  # return here (e.g. the loop's last test failing on an empty array) would
  # otherwise become the process exit status and make `help`/`version`/a passing
  # `verify` look like a failure.
  return 0
}

# --- reporting ---------------------------------------------------------------

rt_render_report() {
  # informational: print what the panel actually serves. Never fails the caller;
  # strict PASS/FAIL semantics live in rt_cmd_verify.
  local r rv
  r="$(rt_render_smoke)"
  case "$r" in
    pass)     rt_ok   "Live check: a browser request renders Row-Template." ;;
    fallback) rt_warn "Live check: the panel served its built-in page. If you just set the theme dir, restart the panel; otherwise run 'row-template verify'." ;;
    skip)     rt_info "Live check skipped (no test URL available without sqlite3)." ;;
    error)    rt_warn "Live check could not reach the subscription endpoint." ;;
  esac
  rv="$(rt_render_smoke_vpn)"
  case "$rv" in
    pass)     rt_ok   "Live check: a VPN client still receives normal subscription content." ;;
    fallback) rt_warn "Live check: a VPN client received HTML instead of subscription content." ;;
    *) : ;;
  esac
  return 0
}

rt_print_activation_note() {
  # $1 = auto | manual
  rt_section "Row-Template installed successfully."
  rt_info "Template directory: $RT_ROOT"
  rt_info "Served file:        $RT_LIVE"
  if [ "$1" = "auto" ]; then
    rt_ok "Panel configured automatically: subThemeDir = $RT_ROOT"
  else
    rt_section "One manual step remains"
    rt_info "In the panel: Settings -> Subscription -> Sub Theme Directory"
    rt_info "Set it to exactly this absolute path, then save:"
    printf '\n      %s\n\n' "$RT_ROOT"
  fi
}

rt_cmd_version() {
  local rtv xuiv
  rtv="$(cat "$RT_VERSION_FILE" 2>/dev/null || true)"; [ -n "$rtv" ] || rtv="unknown"
  rt_detect_xui >/dev/null 2>&1 || true
  xuiv="$(rt_detect_xui_version 2>/dev/null || true)"; [ -n "$xuiv" ] || xuiv="unknown"
  printf 'Row-Template %s\n' "$rtv"
  printf 'Supported 3x-ui minimum: %s\n' "$RT_MIN_XUI"
  printf 'Detected 3x-ui: %s\n' "$xuiv"
}

# --- release acquisition (download -> verify -> extract) ---------------------
# The trusted, already-installed code performs acquisition. A downloaded shell
# payload is NEVER executed as the update mechanism: only a checksum-verified
# tar of data files is trusted, and its paths are screened before extraction.

rt_fetch_one() {
  # copy/download NAME from BASE into DEST, per source KIND (dir|url). For https
  # sources curl is pinned to the TLS protocol so a redirect cannot downgrade the
  # transport to http (--proto '=https'); http is only reached via the explicit
  # RT_ALLOW_INSECURE_URL escape hatch validated in rt_fetch_release.
  local kind="$1" base="$2" name="$3" dest="$4"
  case "$kind" in
    dir) [ -f "$base/$name" ] || return 1; cp -- "$base/$name" "$dest" ;;
    url)
      case "$base" in
        https://*) curl --proto '=https' --tlsv1.2 -fsSL -m 120 -o "$dest" "$base/$name" ;;
        *)         curl -fsSL -m 120 -o "$dest" "$base/$name" ;;
      esac ;;
    *)   return 1 ;;
  esac
}

rt_tar_extract_safe() {
  # screen every archive entry for absolute paths and parent traversal, then
  # extract. --no-same-owner/--no-same-permissions so neither ownership nor mode
  # can be dictated by the archive. A name filter alone is not enough: a symlink
  # or hardlink member (name "d") followed by a regular member "d/x" would let
  # tar write outside DEST via the link, so any member that is not a regular
  # file or directory is refused up front.
  local tarball="$1" dest="$2" entry mtype
  while IFS= read -r entry; do
    case "$entry" in
      /*|../*|*/../*|*/..|..) rt_err "unsafe path in archive: $entry"; return 1 ;;
    esac
  done < <(tar -tzf "$tarball" 2>/dev/null)
  while IFS= read -r mtype; do
    case "$mtype" in
      -|d|"") : ;;   # regular file, directory, or an occasional blank line
      *) rt_err "unsafe member type in archive: '$mtype' (symlink/hardlink/special refused)"; return 1 ;;
    esac
  done < <(tar -tvzf "$tarball" 2>/dev/null | LC_ALL=C awk '{print substr($1,1,1)}')
  tar -xzf "$tarball" -C "$dest" --no-same-owner --no-same-permissions
}

rt_single_top() {
  # if DIR contains exactly one child and it is a directory, echo it.
  local d="$1" n first
  n="$(find "$d" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)"
  if [ "$n" -eq 1 ]; then
    first="$(find "$d" -mindepth 1 -maxdepth 1 2>/dev/null)"
    [ -d "$first" ] && { printf '%s' "$first"; return 0; }
  fi
  return 1
}

rt_release_source() {
  # Resolve the active release source into the globals RT_SRC_KIND (dir|url) and
  # RT_SRC_BASE, applying the transport policy. RT_RELEASE_DIR / RT_RELEASE_URL
  # override the baked-in public GitHub stable channel; when neither is set the
  # default channel is used, so a normal user needs no configuration at all.
  if [ -n "${RT_RELEASE_DIR:-}" ]; then
    RT_SRC_KIND=dir; RT_SRC_BASE="$RT_RELEASE_DIR"; return 0
  fi
  local base
  if [ -n "${RT_RELEASE_URL:-}" ]; then base="${RT_RELEASE_URL%/}"
  else base="${RT_DEFAULT_RELEASE_URL%/}"; fi
  # authenticity note: the checksum is fetched from the same origin as the
  # tarball, so it proves transit integrity, not provenance. https is required so
  # an active network attacker cannot rewrite the bytes in flight; a real
  # signature (see INSTALLER-DESIGN §16/§18) is the documented provenance control.
  # http is reachable only via the explicit RT_ALLOW_INSECURE_URL hatch (local
  # testing) and never applies to the default channel, which is https.
  case "$base" in
    https://?*) : ;;
    http://?*)
      if [ -n "${RT_ALLOW_INSECURE_URL:-}" ]; then
        rt_warn "the release URL uses http:// (insecure); proceeding because RT_ALLOW_INSECURE_URL is set."
      else
        rt_err "the release URL must use https:// (set RT_ALLOW_INSECURE_URL=1 to override for local testing)."
        return 1
      fi ;;
    *) rt_err "the release URL must be an http(s) URL: $base"; return 1 ;;
  esac
  RT_SRC_KIND=url; RT_SRC_BASE="$base"
}

rt_fetch_release() {
  # obtain + verify + extract a release into WORK; echo the payload dir path.
  # The source defaults to the public GitHub stable channel and is overridable
  # via RT_RELEASE_DIR / RT_RELEASE_URL (see rt_release_source).
  local work="$1" kind base manifest sums art tarball want pdir top
  rt_release_source || return 1
  kind="$RT_SRC_KIND"; base="$RT_SRC_BASE"
  mkdir -p "$work" || return 1
  manifest="$work/manifest.txt"; sums="$work/SHA256SUMS"
  rt_fetch_one "$kind" "$base" "manifest.txt" "$manifest" || { rt_err "cannot fetch manifest.txt"; return 1; }
  rt_fetch_one "$kind" "$base" "SHA256SUMS"  "$sums"     || { rt_err "cannot fetch SHA256SUMS"; return 1; }
  art="$(rt_manifest_get artifact "$manifest")"
  [ -n "$art" ] || { rt_err "manifest has no artifact= entry"; return 1; }
  case "$art" in */*|*..*) rt_err "manifest artifact name is unsafe: $art"; return 1 ;; esac
  tarball="$work/$art"
  rt_fetch_one "$kind" "$base" "$art" "$tarball" || { rt_err "cannot fetch $art"; return 1; }
  want="$(rt_sums_lookup "$art" "$sums")"
  [ -n "$want" ] || { rt_err "no checksum for $art in SHA256SUMS; aborting (no override exists)"; return 1; }
  rt_verify_sha256 "$tarball" "$want" || { rt_err "release checksum verification failed; aborting"; return 1; }
  pdir="$work/payload"; mkdir -p "$pdir"
  rt_tar_extract_safe "$tarball" "$pdir" || return 1
  top="$(rt_single_top "$pdir" || true)"; [ -n "$top" ] && pdir="$top"
  printf '%s' "$pdir"
}

rt_remote_version() {
  # Echo the version= advertised by the active release source's manifest, without
  # downloading the (large) artifact. Anonymous and stable-only via the public
  # GitHub channel. Returns non-zero on any network/parse error so callers can
  # tell "unable to check" apart from "already up to date".
  local work m v
  rt_release_source || return 1
  work="$(rt_mktemp_dir)" || return 1
  RT_TMP_TO_CLEAN+=("$work")   # register in THIS shell (rt_mktemp_dir's own append is lost to the $( ) subshell)
  m="$work/manifest.txt"
  rt_fetch_one "$RT_SRC_KIND" "$RT_SRC_BASE" "manifest.txt" "$m" || return 1
  v="$(rt_manifest_get version "$m")"
  [ -n "$v" ] || return 1
  printf '%s' "$v"
}

rt_restore_from_backup() {
  # install the artifact recorded in backup DIR as the canonical artifact and
  # restore its VERSION. Admin branding in config.env is deliberately left
  # as-is so current branding is preserved across an update-rollback / rollback;
  # the TEMPLATE selection, however, is re-derived from the artifact itself
  # (checksum match against the template store) and persisted, so the restored
  # artifact and the stored selection always agree — including when the backup
  # predates the current release's store.
  local dir="$1" tpl_id
  rt_backup_validate "$dir" || { rt_err "backup failed validation: $dir"; return 1; }
  tpl_id="$(rt_template_id_for_artifact "$dir/template.html")"
  if [ -z "$tpl_id" ]; then
    rt_err "backup artifact matches no installed template; the template store may be damaged"
    return 1
  fi
  rt_set_dist "$dir/template.html" || return 1
  if [ -f "$dir/VERSION" ]; then
    rt_atomic_install "$dir/VERSION" "$RT_VERSION_FILE" 644 \
      || rt_warn "could not restore VERSION from the backup."
  fi
  rt_template_reconcile "$tpl_id" || { rt_err "could not persist the restored template selection"; return 1; }
  return 0
}

rt_subtheme_clear_sqlite() {
  # reset subThemeDir to "" (stop -> write -> start -> verify). The panel then
  # falls back to its built-in subscription page. 0 = cleared+verified, 2 =
  # sqlite3/DB unavailable, 1 = failure.
  local was_active=0 cur
  command -v sqlite3 >/dev/null 2>&1 || return 2
  [ -n "${RT_XUI_DB:-}" ] || return 2
  rt_service_active && was_active=1 || true
  if [ "$was_active" -eq 1 ]; then rt_service_stop || return 1; fi
  sqlite3 "$RT_XUI_DB" "UPDATE settings SET value='' WHERE key='subThemeDir';" 2>/dev/null \
    || { [ "$was_active" -eq 1 ] && rt_service_start || true; return 1; }
  if [ "$was_active" -eq 1 ]; then rt_service_start || return 1; fi
  cur="$(rt_subtheme_get_sqlite || true)"
  [ -z "$cur" ]
}

# --- high-level flow: install ------------------------------------------------
# Called by installer/install.sh with a verified, extracted payload directory.
# Runs the whole transaction: preflight -> stage -> validate -> backup ->
# activate -> configure panel -> verify. A failure never leaves a half-changed
# panel: the live template is only ever swapped atomically after validation.

rt_cmd_install() {
  local payload="$1" w picked_explicit="" picked source
  rt_require_root
  [ -n "$payload" ] && [ -d "$payload" ] || rt_die "internal: install payload directory missing."
  [ -f "$payload/template.html" ] || rt_die "install payload has no template.html."

  # payload integrity (defence in depth on top of the release tarball checksum)
  if [ -f "$payload/SHA256SUMS" ]; then
    w="$(rt_sums_lookup template.html "$payload/SHA256SUMS")"
    if [ -n "$w" ]; then rt_verify_sha256 "$payload/template.html" "$w" || rt_die "payload artifact checksum mismatch."; fi
  fi
  rt_validate_template "$payload/template.html" || rt_die "install artifact failed structural validation."

  # environment discovery + hard version gate (fail closed)
  rt_detect_xui || rt_die "no 3x-ui installation was detected on this host."
  rt_detect_xui_version >/dev/null 2>&1 || true
  rt_check_min_version
  rt_detect_xui_db || true

  rt_assert_not_symlink "$RT_ROOT" || rt_die "install root is a symlink; refusing to proceed."

  # idempotency + friendly routing. A NON-INTERACTIVE run keeps the original
  # contract exactly (repair in place, RT_ASSUME_YES gate). An INTERACTIVE run
  # adds a welcome (fresh) or a re-run menu (existing) on top of it.
  local existing=0 interactive=0
  rt_ui_is_interactive && interactive=1
  if [ -f "$RT_VERSION_FILE" ] || [ -f "$RT_DIST" ]; then existing=1; fi
  if [ "$interactive" -eq 1 ]; then
    if [ "$existing" -eq 1 ]; then
      local action; action="$(rt_existing_install_menu)"
      case "$action" in
        manager)     rt_manager_main; return 0 ;;
        reconfigure) rt_run_action rt_cmd_config; return 0 ;;
        update)      rt_manager_update; return 0 ;;
        exit)        rt_info "No changes made."; return 0 ;;
        repair)      rt_info "Repairing in place (configuration preserved)." ;;
      esac
    else
      rt_install_welcome "${RT_XUI_VERSION:-}" || { rt_info "Installation cancelled."; return 0; }
    fi
  elif [ "$existing" -eq 1 ]; then
    if [ ! -t 0 ] && [ -z "${RT_ASSUME_YES:-}" ]; then
      rt_die "an existing install was found at $RT_ROOT; re-run interactively or set RT_ASSUME_YES=1 to repair."
    fi
    rt_info "Existing install detected at $RT_ROOT; repairing in place (configuration preserved)."
  fi

  rt_layout_ensure || rt_die "could not create the install tree."
  if [ "$existing" -eq 1 ] && [ -f "$RT_DIST" ]; then
    rt_backup_create >/dev/null || rt_warn "could not create a pre-install backup."
  fi

  # stage the canonical artifact + supporting files (all atomic, symlink-guarded)
  rt_set_dist "$payload/template.html" || rt_die "could not install the canonical artifact."
  rt_atomic_install "$payload/VERSION" "$RT_VERSION_FILE" 644 || rt_die "could not install VERSION."
  if [ -f "$payload/lib/row-template.sh" ]; then
    rt_atomic_install "$payload/lib/row-template.sh" "$RT_LIB_DIR/row-template.sh" 644 \
      || rt_warn "could not install the management library; the CLI may be unavailable."
  fi
  if [ -f "$payload/bin/row-template" ]; then
    rt_atomic_install "$payload/bin/row-template" "$RT_BIN" 755 \
      || rt_warn "could not install the row-template CLI to $RT_BIN."
  fi

  # template store: every design this release ships, verified before staging.
  rt_stage_template_store "$payload" \
    || rt_die "the release template store failed verification; nothing was activated."

  # the fresh-install design chooser (interactive only; defaults to Row).
  if [ "$interactive" -eq 1 ] && [ "$existing" -eq 0 ]; then
    picked_explicit="$(rt_install_pick_template)"
  fi

  # branding: a first install prompts; a repair keeps the existing config as-is.
  if [ ! -f "$RT_CONFIG" ]; then
    while true; do
      rt_config_interactive || rt_die "configuration was not completed; the panel was not changed."
      if [ "$interactive" -eq 1 ]; then
        rt_install_summary_confirm "$picked_explicit" && break
        rt_info "Let's adjust the settings."
      else
        break
      fi
    done
  else
    rt_info "Existing branding configuration kept ($RT_CONFIG)."
  fi

  # resolve the template selection: the operator's explicit pick (interactive
  # chooser or RT_TEMPLATE) wins and is validated strictly — invalid explicit
  # input fails the install rather than being silently turned into Row; then
  # comes the stored selection, then Row. The canonical artifact is re-staged
  # from the store when the selection is not the top-level (Row) artifact, so
  # the live template and the stored selection can never disagree.
  if [ -n "$picked_explicit" ]; then
    picked="$picked_explicit"
  elif [ -n "${RT_TEMPLATE+x}" ]; then
    rt_template_allowed "$RT_TEMPLATE" \
      || rt_die "RT_TEMPLATE='$RT_TEMPLATE' is not a template this release offers (available: $RT_TEMPLATES_AVAILABLE)."
    picked="$RT_TEMPLATE"
  else
    picked="$(rt_template_effective)"
    if ! rt_template_store_has "$picked"; then
      rt_warn "selected template '$picked' is not in this release's template store; using Row."
      picked="row"
    fi
  fi
  rt_template_store_has "$picked" \
    || rt_die "template '$picked' is not in this release's template store."
  if [ "$(rt_sha256 "$RT_DIST" 2>/dev/null || true)" != "$(rt_sha256 "$RT_TEMPLATE_STORE/$picked/template.html" 2>/dev/null || true)" ]; then
    rt_set_dist "$RT_TEMPLATE_STORE/$picked/template.html" || rt_die "could not stage the selected template."
  fi
  rt_template_reconcile "$picked" || rt_die "could not persist the template selection."

  # generate + validate + atomically swap the live template.
  rt_activate || rt_die "the template failed to generate/validate; the panel was not changed."

  # point the panel at Row-Template. NON-INTERACTIVE: auto-configure exactly as
  # before. INTERACTIVE: show the current subThemeDir and ASK before changing it.
  local sub_outcome
  if [ "$interactive" -eq 1 ]; then
    rt_ui_section "Activate Row-Template as the subscription theme"
    local sub_rc=0 sub_cur
    sub_cur="$(rt_subtheme_get_sqlite 2>/dev/null)" || sub_rc=$?
    if [ "$sub_rc" -ne 0 ]; then
      rt_ui_info "Automatic activation is unavailable here (sqlite3 is not installed)."
      rt_ui_info "Row-Template itself is installed successfully."
      sub_outcome="manual"
    else
      rt_ui_kv "Current theme dir" "${sub_cur:-Not configured}"
      rt_ui_kv "Row-Template dir"  "$RT_ROOT"
      if rt_ui_confirm "Make Row-Template the active 3X-UI subscription theme now?" yes; then
        if sub_outcome="$(rt_subtheme_configure)"; then :; else
          rt_service_active || rt_service_start || true
          sub_outcome="manual"
          rt_ui_warn "Could not set subThemeDir automatically; use the manual step below."
        fi
      else
        sub_outcome="skipped"
      fi
    fi
  else
    if sub_outcome="$(rt_subtheme_configure)"; then :; else
      rt_service_active || rt_service_start || true
      sub_outcome="manual"
      rt_warn "Could not set subThemeDir automatically; use the manual step below."
    fi
  fi

  rt_backups_prune 2
  if [ "$interactive" -eq 1 ]; then
    rt_install_success_screen "$sub_outcome"
  else
    rt_print_activation_note "$sub_outcome"
  fi
  rt_render_report
}

# --- high-level flow: config -------------------------------------------------
# Reconfigure branding. The new template is generated and validated BEFORE the
# live file is swapped, and the canonical artifact is reconciled to the
# effective selection first (a branding write may have sanitized an invalid
# stored selection to Row). On any failure the previous config, artifact and
# live template are all restored, so a working install is never left in a
# state where config and artifact disagree.

rt_cmd_config() {
  rt_require_root
  [ -f "$RT_DIST" ] || rt_die "Row-Template is not installed (run the installer first)."
  rt_detect_xui || true
  local saved="" distbak="" sumbak=""
  if [ -f "$RT_CONFIG" ]; then
    saved="$(mktemp)" || rt_die "cannot create a temp file."
    cp -- "$RT_CONFIG" "$saved"
  fi
  distbak="$(mktemp)" && cp -- "$RT_DIST" "$distbak"
  [ -f "$RT_DIST_SUM" ] && sumbak="$(mktemp)" && cp -- "$RT_DIST_SUM" "$sumbak"
  rt_section "Reconfigure Row-Template"
  if ! rt_config_interactive; then
    rt_restore_snapshot "$saved" "$distbak" "$sumbak"
    rm -f "$saved" "$distbak" "$sumbak"
    rt_die "configuration was not changed."
  fi
  if ! rt_reconcile_artifact_to_selection; then
    rt_restore_snapshot "$saved" "$distbak" "$sumbak"
    rm -f "$saved" "$distbak" "$sumbak"
    rt_die "the template selection could not be reconciled; the previous state is still in place."
  fi
  if ! rt_activate; then
    rt_err "the new branding failed validation; restoring the previous configuration."
    rt_restore_snapshot "$saved" "$distbak" "$sumbak"
    rm -f "$saved" "$distbak" "$sumbak"
    rt_die "reconfiguration aborted; the previous template is still in place."
  fi
  rm -f "$saved" "$distbak" "$sumbak"
  rt_ok "Configuration updated and the live template was regenerated."
  rt_render_report
}

# --- high-level flow: verify -------------------------------------------------
# Read-only health report. Emits ok/warn/FAIL lines and returns non-zero only
# when a hard check fails. Never changes anything and never prints secrets.

rt_cmd_verify() {
  local fails=0 warns=0 perm cur rc r rv sel_id store_n
  rt_section "Row-Template verification"

  if [ -d "$RT_ROOT" ] && [ ! -L "$RT_ROOT" ]; then rt_ok "Install root present: $RT_ROOT"
  else rt_err "install root missing or is a symlink: $RT_ROOT"; fails=$((fails + 1)); fi

  if [ -f "$RT_DIST" ] && [ -r "$RT_DIST" ]; then
    if [ -f "$RT_DIST_SUM" ] \
       && rt_verify_sha256 "$RT_DIST" "$(LC_ALL=C awk '{print $1; exit}' "$RT_DIST_SUM")" >/dev/null 2>&1; then
      rt_ok "Canonical artifact integrity verified."
    else rt_err "canonical artifact missing checksum or does not match it."; fails=$((fails + 1)); fi
  else rt_err "canonical artifact missing or unreadable: $RT_DIST"; fails=$((fails + 1)); fi

  # The template store is the release's own copy of every selectable design.
  # Every artifact in it must match its sidecar, the stored selection must be
  # present, and the canonical artifact must be the selection's own bytes —
  # a config.env that names one design while another is live is the one state
  # this system must never report as healthy.
  sel_id="$(rt_template_effective)"
  store_n=0; [ -d "$RT_TEMPLATE_STORE" ] && store_n="$(rt_template_store_ids | grep -c . || true)"
  if [ "$store_n" -gt 0 ]; then
    if rt_template_verify_store; then
      rt_ok "Template store verified ($store_n design(s))."
    else
      rt_err "a template in the store does not match its checksum."; fails=$((fails + 1))
    fi
    if rt_template_store_has "$sel_id"; then
      rt_ok "Template: $(rt_template_display_name "$sel_id")"
      if [ "$(rt_sha256 "$RT_DIST" 2>/dev/null || true)" = "$(rt_sha256 "$RT_TEMPLATE_STORE/$sel_id/template.html" 2>/dev/null || true)" ]; then
        rt_ok "Canonical artifact matches the selected template."
      else
        rt_err "canonical artifact does not match the selected template ($sel_id)."; fails=$((fails + 1))
      fi
    else
      rt_err "selected template '$sel_id' is missing from the template store."; fails=$((fails + 1))
    fi
  else
    rt_err "template store missing or empty; re-run the installer."; fails=$((fails + 1))
  fi

  if [ -f "$RT_LIVE" ] && [ -r "$RT_LIVE" ]; then
    if rt_validate_template "$RT_LIVE" >/dev/null 2>&1; then rt_ok "Live template is structurally valid and readable."
    else rt_err "live template failed structural validation."; fails=$((fails + 1)); fi
  else rt_err "live template missing or unreadable: $RT_LIVE"; fails=$((fails + 1)); fi

  if [ -s "$RT_VERSION_FILE" ]; then rt_ok "VERSION present: $(rt_trim "$(cat "$RT_VERSION_FILE")")"
  else rt_err "VERSION file missing or empty."; fails=$((fails + 1)); fi

  if [ -f "$RT_CONFIG" ]; then
    [ -r "$RT_CONFIG" ] && rt_ok "Config present and readable." \
      || { rt_warn "config present but not readable."; warns=$((warns + 1)); }
    perm="$(stat -c '%a' "$RT_CONFIG" 2>/dev/null || true)"
    if [ -n "$perm" ] && printf '%s' "$perm" | LC_ALL=C grep -qE '[2367]$'; then
      rt_warn "config.env is other-writable (mode $perm); tighten to 640."; warns=$((warns + 1))
    fi
  else rt_info "No config.env (white-label defaults)."; fi

  [ -f "$RT_LIB_DIR/row-template.sh" ] && rt_ok "Management library present." \
    || { rt_warn "management library not found under the install root."; warns=$((warns + 1)); }
  [ -x "$RT_BIN" ] && rt_ok "CLI present: $RT_BIN" \
    || { rt_warn "CLI not found or not executable at $RT_BIN."; warns=$((warns + 1)); }

  if rt_detect_xui; then
    if rt_detect_xui_version >/dev/null 2>&1; then
      if rt_semver_ge "$RT_XUI_VERSION" "$RT_MIN_XUI"; then rt_ok "3x-ui $RT_XUI_VERSION meets the minimum $RT_MIN_XUI."
      else rt_err "3x-ui $RT_XUI_VERSION is below the minimum $RT_MIN_XUI."; fails=$((fails + 1)); fi
    else rt_warn "could not determine the 3x-ui version."; warns=$((warns + 1)); fi
  else rt_warn "3x-ui installation was not detected."; warns=$((warns + 1)); fi

  rt_detect_xui_db || true
  rc=0; cur="$(rt_subtheme_get_sqlite)" || rc=$?
  if [ "$rc" -eq 0 ]; then
    if [ "$cur" = "$RT_ROOT" ]; then rt_ok "Panel subThemeDir points at Row-Template."
    elif [ -z "$cur" ]; then rt_warn "panel subThemeDir is empty; set it to $RT_ROOT."; warns=$((warns + 1))
    else rt_warn "panel subThemeDir does not point at Row-Template."; warns=$((warns + 1)); fi
  else rt_info "subThemeDir not checked (sqlite3/DB unavailable)."; fi

  # Capture first rather than piping into `grep -q .`: under pipefail a match
  # would SIGPIPE `find` (rc 141) and the leftover-staging warning would be lost.
  local stray_stage
  stray_stage="$(find "$RT_ROOT" -maxdepth 2 \( -name '.stage.*' -o -name '.live.*' \) 2>/dev/null || true)"
  if [ -n "$stray_stage" ]; then
    rt_warn "leftover staging files found under the install root (possible interrupted update)."; warns=$((warns + 1))
  fi

  r="$(rt_render_smoke)"
  case "$r" in
    pass)     rt_ok   "Live render check: a browser receives Row-Template." ;;
    fallback) rt_warn "live render check: the panel served its built-in page."; warns=$((warns + 1)) ;;
    error)    rt_warn "live render check: the subscription endpoint was unreachable."; warns=$((warns + 1)) ;;
    skip)     rt_info "Live render check skipped (no test URL available)." ;;
  esac
  rv="$(rt_render_smoke_vpn)"
  case "$rv" in
    pass)     rt_ok   "VPN-client check: normal subscription content is served." ;;
    fallback) rt_warn "VPN-client check: HTML was returned instead of subscription content."; warns=$((warns + 1)) ;;
    *) : ;;
  esac

  rt_section "Result"
  # exit (not return) on failure: this is a terminal command, and exiting keeps
  # the dispatcher's ERR trap from mislabelling an intended non-zero verdict as
  # an "unexpected error".
  if [ "$fails" -gt 0 ]; then rt_err "verification FAILED ($fails hard issue(s), $warns warning(s))."; exit 1
  elif [ "$warns" -gt 0 ]; then rt_warn "verification passed with $warns warning(s)."; return 0
  else rt_ok "verification passed with no warnings."; return 0; fi
}

# --- high-level flow: uninstall ----------------------------------------------
# Conservative by construction: the install root is positively identified as
# Row-Template's own before any recursive delete, and only files Row-Template
# created are removed. 3x-ui, its database, inbounds, clients and certificates
# are never touched.

rt_uninstall_files() {
  rt_assert_not_symlink "$RT_ROOT" || return 1
  # positively identify this as Row-Template's own root before deleting it.
  if [ ! -f "$RT_VERSION_FILE" ] || { [ ! -f "$RT_DIST" ] && [ ! -f "$RT_LIB_DIR/row-template.sh" ]; }; then
    rt_err "refusing to delete $RT_ROOT: it does not look like a Row-Template install root."; return 1
  fi
  case "$RT_ROOT" in
    ""|/|/etc|/usr|/usr/local|/var|/root|/home|/bin|/sbin|/lib|/opt|/etc/3x-ui|/etc/x-ui|/usr/local/x-ui)
      rt_err "refusing to delete a system path: $RT_ROOT"; return 1 ;;
  esac
  rm -rf -- "$RT_ROOT" || return 1
  # remove the CLI only if it is unmistakably our launcher, never a namesake.
  if [ -f "$RT_BIN" ] && [ ! -L "$RT_BIN" ] \
     && LC_ALL=C grep -q 'row-template CLI launcher' "$RT_BIN" 2>/dev/null; then
    rm -f -- "$RT_BIN"
  fi
  return 0
}

rt_cmd_uninstall() {
  rt_require_root
  [ -f "$RT_VERSION_FILE" ] || rt_die "Row-Template does not appear to be installed at $RT_ROOT."
  if [ -z "${RT_ASSUME_YES:-}" ]; then
    if [ -t 0 ]; then
      printf '  Remove Row-Template from %s and revert the panel to its built-in page? [y/N]: ' "$RT_ROOT" >&2
      local a; IFS= read -r a || a=""
      case "$a" in y|Y|yes|YES) : ;; *) rt_info "Uninstall cancelled."; return 0 ;; esac
    else
      rt_die "refusing to uninstall non-interactively without RT_ASSUME_YES=1."
    fi
  fi
  rt_detect_xui || true
  rt_detect_xui_db || true

  # revert the panel to a safe state: clear subThemeDir only if it points at us.
  local cur rc=0; cur="$(rt_subtheme_get_sqlite)" || rc=$?
  if [ "$rc" -eq 0 ] && [ "$cur" = "$RT_ROOT" ]; then
    if rt_subtheme_clear_sqlite; then rt_ok "Cleared subThemeDir; the panel reverts to its built-in page."
    else
      rt_service_active || rt_service_start || true
      rt_warn "could not clear subThemeDir automatically. In the panel, clear Settings -> Subscription -> Sub Theme Directory."
    fi
  elif [ "$rc" -eq 0 ] && [ -n "$cur" ]; then
    rt_info "subThemeDir points elsewhere; leaving it unchanged."
  elif [ "$rc" -ne 0 ]; then
    rt_warn "could not read subThemeDir (sqlite3/DB unavailable). If it points at $RT_ROOT, clear it in the panel."
  fi

  if rt_uninstall_files; then
    rt_ok "Removed Row-Template files from $RT_ROOT."
    rt_info "3x-ui, its database, inbounds, clients and certificates were left untouched."
  else
    rt_die "uninstall could not complete safely; see the message above. No forced deletion was performed."
  fi
}

# --- high-level flow: update -------------------------------------------------
# Download -> verify checksum -> validate -> back up current -> stage -> swap.
# The live template is only replaced by an atomic rename after the new one is
# generated and validated; if activation fails, the backup is restored so the
# previously-running version stays live.

rt_cmd_update() {
  rt_require_root
  [ -f "$RT_DIST" ] || rt_die "Row-Template is not installed; run the installer first."
  rt_detect_xui || true; rt_detect_xui_version >/dev/null 2>&1 || true
  local work payload newver curver w backup picked source
  work="$(rt_mktemp_dir)" || rt_die "cannot create a work directory."
  RT_TMP_TO_CLEAN+=("$work")   # register in THIS shell; rt_mktemp_dir's own append is lost to the $( ) subshell
  payload="$(rt_fetch_release "$work")" || rt_die "could not obtain a verified release."
  [ -f "$payload/template.html" ] || rt_die "the release payload has no template.html."
  if [ -f "$payload/SHA256SUMS" ]; then
    w="$(rt_sums_lookup template.html "$payload/SHA256SUMS")"
    if [ -n "$w" ]; then rt_verify_sha256 "$payload/template.html" "$w" || rt_die "payload artifact checksum mismatch."; fi
  fi
  rt_validate_template "$payload/template.html" || rt_die "the release artifact failed structural validation."

  # stage the release's template store, then keep the operator's selection when
  # this release still ships it. The top-level template.html stays the Row
  # artifact so an OLDER installed library updating against this payload
  # degrades safely to Row; only the freshly staged library understands the
  # store, so the selection is resolved from it, never from the top-level file.
  rt_stage_template_store "$payload" || rt_die "the release template store failed verification."
  picked="$(rt_template_effective)"
  if rt_template_store_has "$picked"; then
    source="$RT_TEMPLATE_STORE/$picked/template.html"
  else
    [ "$picked" = "row" ] || rt_warn "template '$picked' is not in this release; falling back to Row."
    picked="row"
    if rt_template_store_has "row"; then
      source="$RT_TEMPLATE_STORE/row/template.html"
    else
      source="$payload/template.html"
    fi
  fi
  rt_validate_template "$source" || rt_die "the selected template failed structural validation."

  newver="$(rt_trim "$(cat "$payload/VERSION" 2>/dev/null || true)")"
  curver="$(rt_trim "$(cat "$RT_VERSION_FILE" 2>/dev/null || true)")"
  rt_info "Updating Row-Template ${curver:-unknown} -> ${newver:-unknown}"

  backup="$(rt_backup_create)" || rt_die "could not back up the current install; aborting."

  # stage the new artifact as canonical (live file untouched so far).
  rt_set_dist "$source" || rt_die "failed to stage the new artifact; the running template is unchanged."
  rt_atomic_install "$payload/VERSION" "$RT_VERSION_FILE" 644 || rt_warn "could not update the VERSION file."
  if [ -f "$payload/lib/row-template.sh" ]; then
    rt_atomic_install "$payload/lib/row-template.sh" "$RT_LIB_DIR/row-template.sh" 644 \
      || rt_warn "could not update the management library."
  fi
  if [ -f "$payload/bin/row-template" ]; then
    rt_atomic_install "$payload/bin/row-template" "$RT_BIN" 755 \
      || rt_warn "could not update the row-template CLI."
  fi

  # persist the (possibly fallen-back) selection before activation, so the
  # stored selection and the staged artifact agree no matter how activation goes.
  rt_template_reconcile "$picked" || rt_die "could not persist the template selection."

  if rt_activate; then
    rt_backups_prune 2
    rt_ok "Update complete: now running ${newver:-the new version}."
    rt_render_report
  else
    rt_err "activation of the new version failed; rolling back."
    if rt_restore_from_backup "$backup" && rt_activate; then
      rt_warn "rolled back to ${curver:-the previous version}; no changes are live."
    else
      rt_die "activation failed AND automatic rollback failed; run 'row-template rollback' to recover."
    fi
    exit 1   # terminal command: exit so the dispatcher ERR trap stays quiet.
  fi
}

# --- high-level flow: rollback -----------------------------------------------
# Restore a previous version from a validated backup. The current version is
# snapshotted first and is never destroyed until the rollback activates; if
# activation fails, the current version is restored. Admin config is preserved.

rt_cmd_rollback() {
  rt_require_root
  [ -f "$RT_DIST" ] || rt_die "Row-Template is not installed."
  rt_detect_xui || true
  local mode="${1:-}" target="" safety
  case "$mode" in
    --to) target="${2:-}"; [ -n "$target" ] || rt_die "--to requires a backup directory." ;;
    --auto|"") target="$(rt_backup_latest || true)" ;;
    *) rt_die "usage: row-template rollback [--auto | --to <backup-dir>]" ;;
  esac
  [ -n "$target" ] || rt_die "no valid backup is available to roll back to."
  [ -d "$target" ] || target="$RT_BACKUPS/$target"
  rt_is_within "$RT_BACKUPS" "$target" || rt_die "refusing to roll back from a path outside the backups tree."
  rt_backup_validate "$target" || rt_die "the selected backup failed validation: $target"

  # snapshot the CURRENT install first so the running version is never lost.
  safety="$(rt_backup_create)" || { safety=""; rt_warn "could not snapshot the current version before rollback."; }

  rt_info "Rolling back to $(basename "$target")"
  # stage the backup's artifact as canonical; the live file is not touched yet.
  rt_restore_from_backup "$target" || rt_die "could not stage the backup; the running template is unchanged."

  # regenerate the live file from the restored artifact + current admin config.
  if rt_activate; then
    rt_ok "Rollback complete."
    rt_render_report
  else
    rt_err "rollback activation failed; attempting to restore the current version."
    if [ -n "$safety" ] && rt_restore_from_backup "$safety" && rt_activate; then
      rt_warn "restored the previously-running version; nothing changed."
    else
      rt_die "rollback failed and the current version could not be restored automatically."
    fi
    exit 1   # terminal command: exit so the dispatcher ERR trap stays quiet.
  fi
}

# --- help --------------------------------------------------------------------

rt_print_help() {
  cat <<'EOF'
Row-Template — custom subscription page manager for 3x-ui
by frank0live — https://github.com/frank0live/Row-Template

Usage:
  row-template                Open the interactive manager (when run in a terminal)
  row-template <command> [options]

Commands:
  config      Change the service name, support URL or logo, then regenerate
  update      Download, verify and activate a newer release (checksum enforced)
  rollback    Restore a previous version  [--auto | --to <backup-dir>]
  verify      Check the install, panel wiring and live render (read-only)
  version     Show installed, minimum-supported and detected 3x-ui versions
  uninstall   Remove Row-Template and revert the panel to its built-in page
  menu        Open the interactive manager explicitly
  help        Show this help

Run with no arguments in an interactive terminal to open the manager; in a
non-interactive context (scripts, CI, curl | bash) it prints this help instead.

Commands that change the system (config/update/rollback/uninstall) must run as root.
EOF
}
# =============================================================================
# Interactive terminal UI layer.
#
# A thin PRESENTATION layer over the tested rt_* lifecycle functions. It adds no
# new install/update/rollback/config/uninstall logic — every action routes to an
# existing rt_cmd_* implementation or an existing primitive. Colour is reused
# from the RT_C_* variables (already gated on `[ -t 1 ]` and NO_COLOR). Prompts
# go to stderr so a caller's stdout stays clean; menus never require dialog/fzf.
# =============================================================================

rt_ui_is_interactive() {
  # true only when both ends are a terminal and automation has not opted out.
  [ -t 0 ] && [ -t 1 ] && [ -z "${RT_ASSUME_NONINTERACTIVE:-}" ]
}

rt_ui_rule() {
  printf '  %s------------------------------------------------------------%s\n' \
    "$RT_C_DIM" "$RT_C_RST"
}

rt_ui_header() {
  # "Row-Template / by frank0live" — the tool's own identity, colour-optional.
  printf '\n  %s%s%s %s/ by %s%s\n' \
    "$RT_C_BLD" "$RT_PROJECT_NAME" "$RT_C_RST" "$RT_C_DIM" "$RT_DEVELOPER" "$RT_C_RST"
  rt_ui_rule
}

# Named wrappers so callers read as UI intent; they reuse the tested emitters.
rt_ui_section() { rt_section "$1"; }
rt_ui_info()    { rt_info "$1"; }
rt_ui_success() { rt_ok "$1"; }
rt_ui_warn()    { rt_warn "$1"; }
rt_ui_error()   { rt_err "$1"; }

rt_ui_kv() {
  # aligned "Label   value" line for dashboards/info screens.
  printf '  %s%-16s%s%s\n' "$RT_C_DIM" "$1" "$RT_C_RST" "$2"
}

rt_ui_pause() {
  # wait for Enter, but never block a non-interactive/automated caller.
  rt_ui_is_interactive || return 0
  printf '\n  %sPress Enter to return to the menu…%s ' "$RT_C_DIM" "$RT_C_RST" >&2
  IFS= read -r _ || true
}
rt_ui_confirm() {
  # PROMPT DEFAULT(yes|no). Empty input takes the default; EOF (non-interactive)
  # also takes the default so a piped/automated caller never hangs. 0 = yes.
  local prompt="$1" def="${2:-no}" a hint
  case "$def" in yes|y|Y|YES|Yes) hint="[Y/n]"; def="yes" ;; *) hint="[y/N]"; def="no" ;; esac
  printf '  %s %s: ' "$prompt" "$hint" >&2
  IFS= read -r a || a=""
  a="$(rt_trim "$a")"
  [ -n "$a" ] || a="$def"
  case "$a" in y|Y|yes|YES|Yes) return 0 ;; *) return 1 ;; esac
}

rt_ui_menu_select() {
  # echo a validated integer in [0,MAX]. Re-prompts on junk with a friendly
  # message; on EOF returns "0" (Exit/Back) so a non-TTY caller cannot spin.
  local max="$1" a
  while true; do
    printf '  %sSelect%s [0-%s]: ' "$RT_C_BLD" "$RT_C_RST" "$max" >&2
    IFS= read -r a || { printf '0'; return 0; }
    a="$(rt_trim "$a")"
    case "$a" in
      ''|*[!0-9]*) rt_warn "Invalid option. Choose a number 0-$max." ; continue ;;
    esac
    if [ "$a" -ge 0 ] && [ "$a" -le "$max" ] 2>/dev/null; then printf '%s' "$a"; return 0; fi
    rt_warn "Invalid option. Choose a number 0-$max."
  done
}

# --- evidence-based status ---------------------------------------------------

rt_status_theme() {
  # echo one token describing the install/activation state, decided from
  # EVIDENCE (files + panel subThemeDir), never from mere file presence:
  #   notinstalled | damaged | active | inactive | unknown
  # "unknown" means installed but activation is not verifiable here (no sqlite3).
  [ -f "$RT_VERSION_FILE" ] || { printf 'notinstalled'; return 0; }
  if [ ! -f "$RT_DIST" ] || ! rt_validate_template "$RT_LIVE" >/dev/null 2>&1; then
    printf 'damaged'; return 0
  fi
  local rc=0 cur
  cur="$(rt_subtheme_get_sqlite 2>/dev/null)" || rc=$?
  if [ "$rc" -ne 0 ]; then printf 'unknown'; return 0; fi
  if [ "$cur" = "$RT_ROOT" ]; then printf 'active'; else printf 'inactive'; fi
}

rt_status_label() {
  case "$1" in
    active)       printf 'Installed / Active' ;;
    inactive)     printf 'Installed / Not active' ;;
    unknown)      printf 'Installed / Activation unverified' ;;
    damaged)      printf 'Installation damaged' ;;
    notinstalled) printf 'Not installed' ;;
    *)            printf 'Unknown' ;;
  esac
}
rt_status_service_label() {
  # human label for the panel service, from discovery already run by the caller.
  if [ -n "${RT_XUI_UNIT:-}" ]; then
    if rt_service_active 2>/dev/null; then printf 'x-ui (running)'; else printf 'x-ui (stopped)'; fi
  else
    printf 'not detected'
  fi
}

rt_status_theme_label() {
  case "$1" in
    active)   printf 'Row-Template (active)' ;;
    inactive) printf 'Row-Template (installed, not the active theme)' ;;
    unknown)  printf 'Row-Template (installed; activation not verifiable without sqlite3)' ;;
    damaged)  printf 'Row-Template (files incomplete — run Verify/Repair)' ;;
    *)        printf 'Row-Template (not installed)' ;;
  esac
}

# --- manager: dashboard + main loop ------------------------------------------
# Every action delegates to a tested rt_cmd_* function. rt_run_action isolates a
# terminal command (which may `exit`) in a subshell so a single failed operation
# returns to the menu instead of killing the manager, and cleans its own temp.

rt_run_action() { ( trap 'rt_cleanup' EXIT; "$@" ) || true; }

rt_manager_dashboard() {
  local st rtv xuiv
  rtv="$(rt_trim "$(cat "$RT_VERSION_FILE" 2>/dev/null || true)")"; [ -n "$rtv" ] || rtv="unknown"
  xuiv="${RT_XUI_VERSION:-}"; [ -n "$xuiv" ] || xuiv="unknown"
  st="$(rt_status_theme)"
  rt_ui_header
  rt_ui_kv "Version"   "$rtv"
  rt_ui_kv "3X-UI"     "$xuiv"
  rt_ui_kv "Status"    "$(rt_status_label "$st")"
  rt_ui_kv "Template"  "$(rt_template_display_name "$(rt_template_effective)")"
  rt_ui_kv "Theme"     "$(rt_status_theme_label "$st")"
  rt_ui_kv "Service"   "$(rt_status_service_label)"
  printf '\n'
  printf '  %s1%s  Update\n'                    "$RT_C_BLD" "$RT_C_RST"
  printf '  %s2%s  Reconfigure branding\n'      "$RT_C_BLD" "$RT_C_RST"
  printf '  %s3%s  Verify installation\n'       "$RT_C_BLD" "$RT_C_RST"
  printf '  %s4%s  Rollback\n'                  "$RT_C_BLD" "$RT_C_RST"
  printf '  %s5%s  Activate / Re-apply theme\n' "$RT_C_BLD" "$RT_C_RST"
  printf '  %s6%s  Installation info\n'         "$RT_C_BLD" "$RT_C_RST"
  printf '  %s7%s  Uninstall\n'                 "$RT_C_BLD" "$RT_C_RST"
  printf '  %s0%s  Exit\n'                      "$RT_C_BLD" "$RT_C_RST"
}
rt_manager_update() {
  # Check the public stable channel for a newer version, then offer to apply it.
  # A network / source failure is reported as "unable to check" — the running
  # install is never described as damaged just because GitHub was unreachable.
  rt_ui_section "Update"
  local cur avail
  cur="$(rt_trim "$(cat "$RT_VERSION_FILE" 2>/dev/null || true)")"
  rt_ui_kv "Installed" "${cur:-unknown}"
  if avail="$(rt_remote_version 2>/dev/null)" && [ -n "$avail" ]; then
    rt_ui_kv "Available" "$avail"
    if [ -n "$cur" ] && rt_semver_ge "$cur" "$avail"; then
      rt_ui_success "Row-Template is up to date."
      rt_ui_confirm "Re-install $avail anyway?" no || return 0
    else
      rt_ui_info "A newer version is available."
      rt_ui_confirm "Update ${cur:-current} -> $avail now?" yes || { rt_ui_info "Left unchanged."; return 0; }
    fi
    rt_run_action rt_cmd_update
  else
    rt_ui_warn "Unable to check for updates right now (network or release source unavailable)."
    rt_ui_info "Your installation is unaffected. Published releases appear at:"
    rt_ui_kv "GitHub" "$RT_GITHUB"
  fi
}

rt_manager_activate() {
  # Detect the current subThemeDir, show it, and offer to point it at us. No
  # write happens unless the operator confirms; the panel state is preserved.
  rt_ui_section "Activate / Re-apply theme"
  rt_detect_xui >/dev/null 2>&1 || true
  rt_detect_xui_db >/dev/null 2>&1 || true
  local rc=0 cur
  cur="$(rt_subtheme_get_sqlite 2>/dev/null)" || rc=$?
  if [ "$rc" -ne 0 ]; then
    rt_ui_warn "Automatic activation is unavailable here (sqlite3 is not installed)."
    rt_ui_info "Row-Template is installed. Activate it from the panel:"
    rt_ui_info "  Panel Settings -> Subscription -> Profile -> Sub Theme Directory"
    rt_ui_kv "Enter exactly" "$RT_ROOT"
    return 0
  fi
  if [ "$cur" = "$RT_ROOT" ]; then
    rt_ui_success "Row-Template is already the active subscription theme."
    rt_ui_confirm "Re-apply and verify anyway?" no || return 0
  elif [ -n "$cur" ]; then
    rt_ui_kv "Current theme dir" "$cur"
    rt_ui_kv "Row-Template dir"  "$RT_ROOT"
    rt_ui_confirm "Point the panel at Row-Template now?" yes || { rt_ui_info "Left unchanged."; return 0; }
  else
    rt_ui_info "The panel has no subscription theme configured."
    rt_ui_kv "Row-Template dir" "$RT_ROOT"
    rt_ui_confirm "Make Row-Template the active theme now?" yes || { rt_ui_info "Left unchanged."; return 0; }
  fi
  local outcome
  if outcome="$(rt_subtheme_configure)" && [ "$outcome" = "auto" ]; then
    rt_ui_success "Row-Template is active."
    rt_render_report
  else
    rt_service_active 2>/dev/null || rt_service_start 2>/dev/null || true
    rt_ui_warn "Could not set the theme automatically; the panel service state was preserved."
    rt_ui_info "Set it from the panel: Settings -> Subscription -> Sub Theme Directory"
    rt_ui_kv "Enter exactly" "$RT_ROOT"
  fi
}
rt_manager_info() {
  # Non-sensitive install facts only. Never prints subscription URLs, subId,
  # UUIDs, panel credentials, DB secrets, tokens or the operator's support URL.
  rt_ui_section "Installation info"
  rt_detect_xui >/dev/null 2>&1 || true
  rt_detect_xui_version >/dev/null 2>&1 || true
  rt_detect_xui_db >/dev/null 2>&1 || true
  local rtv xuiv st logo url
  rtv="$(rt_trim "$(cat "$RT_VERSION_FILE" 2>/dev/null || true)")"; [ -n "$rtv" ] || rtv="unknown"
  xuiv="${RT_XUI_VERSION:-}"; [ -n "$xuiv" ] || xuiv="unknown"
  st="$(rt_status_theme)"
  [ -n "$(rt_config_get_raw LOGO_DATA_B64 2>/dev/null)" ] && logo="yes" || logo="no"
  [ -n "$(rt_config_get_text SUPPORT_URL_B64 2>/dev/null)" ] && url="configured" || url="not configured"
  rt_ui_kv "Version"      "$rtv"
  rt_ui_kv "Developer"    "$RT_DEVELOPER"
  rt_ui_kv "GitHub"       "$RT_GITHUB"
  rt_ui_kv "3X-UI"        "$xuiv"
  rt_ui_kv "Install dir"  "$RT_ROOT"
  rt_ui_kv "Template"     "$(rt_template_display_name "$(rt_template_effective)")"
  rt_ui_kv "Theme status" "$(rt_status_label "$st")"
  rt_ui_kv "Service"      "$(rt_status_service_label)"
  rt_ui_kv "Custom logo"  "$logo"
  rt_ui_kv "Support URL"  "$url"
}

# --- manager: reconfigure branding (per-field editors) -----------------------
# All editors reuse the tested validators, rt_config_write and rt_activate via
# rt_apply_branding; none of them re-implement config parsing or generation.

rt_apply_branding() {
  # NAME URL MIME LOGO_B64 -> write config + regenerate the live template, with
  # snapshot/restore safety: on any failed step the previous config, canonical
  # artifact and live page are all restored. A branding write can also
  # SANITIZE the stored selection (an invalid stored id falls back to Row), so
  # the canonical artifact is reconciled to the effective template before
  # activation — config and artifact must never be left disagreeing.
  local name="$1" url="$2" mime="$3" logo="$4" saved="" distbak="" sumbak=""
  [ -f "$RT_DIST" ] || { rt_err "Row-Template is not installed."; return 1; }
  if [ -f "$RT_CONFIG" ]; then saved="$(mktemp)" && cp -- "$RT_CONFIG" "$saved"; fi
  distbak="$(mktemp)" && cp -- "$RT_DIST" "$distbak"
  [ -f "$RT_DIST_SUM" ] && sumbak="$(mktemp)" && cp -- "$RT_DIST_SUM" "$sumbak"
  if ! rt_config_write "$name" "$url" "$mime" "$logo"; then
    rt_restore_snapshot "$saved" "$distbak" "$sumbak"
    rm -f "$saved" "$distbak" "$sumbak"
    rt_err "could not write the configuration."; return 1
  fi
  if ! rt_reconcile_artifact_to_selection; then
    rt_restore_snapshot "$saved" "$distbak" "$sumbak"
    rm -f "$saved" "$distbak" "$sumbak"
    rt_err "could not reconcile the template selection; the previous state was restored."
    return 1
  fi
  if ! rt_activate; then
    rt_err "the new branding failed validation; restoring the previous configuration."
    rt_restore_snapshot "$saved" "$distbak" "$sumbak"
    rm -f "$saved" "$distbak" "$sumbak"
    return 1
  fi
  rm -f "$saved" "$distbak" "$sumbak"
  return 0
}
rt_reconfig_service_name() {
  local cur new mg
  cur="$(rt_config_get_text SERVICE_NAME_B64 2>/dev/null || true)"
  rt_ui_kv "Current name" "${cur:-<none> (white-label)}"
  printf '  New service name (Enter to keep current, - to clear): ' >&2
  IFS= read -r new || new=""
  if [ -z "$new" ]; then rt_ui_info "Kept the current service name."; return 0; fi
  [ "$new" = "-" ] && new=""
  new="$(rt_trim "$new")"
  if ! rt_validate_service_name "$new"; then rt_ui_error "Rejected: control characters or too long."; return 0; fi
  if [ -n "$new" ]; then
    if mg="$(rt_monogram_preview "$new")"; then rt_ui_info "Monogram preview: $mg"
    else rt_ui_info "Monogram: computed in the browser for \"$new\"."; fi
  fi
  if rt_apply_branding "$new" "$(rt_config_get_text SUPPORT_URL_B64 2>/dev/null || true)" \
      "$(rt_config_get_raw LOGO_MIME 2>/dev/null || true)" "$(rt_config_get_raw LOGO_DATA_B64 2>/dev/null || true)"; then
    rt_ui_success "Service name updated."
  fi
}

rt_reconfig_support_url() {
  local cur choice new
  cur="$(rt_config_get_text SUPPORT_URL_B64 2>/dev/null || true)"
  rt_ui_kv "Support URL" "${cur:-not configured}"
  printf '  %s1%s Keep current   %s2%s Change URL   %s3%s Remove   %s0%s Back\n' \
    "$RT_C_BLD" "$RT_C_RST" "$RT_C_BLD" "$RT_C_RST" "$RT_C_BLD" "$RT_C_RST" "$RT_C_BLD" "$RT_C_RST"
  choice="$(rt_ui_menu_select 3)"
  case "$choice" in
    1|0) rt_ui_info "Support URL unchanged."; return 0 ;;
    3) new="" ;;
    2)
      while true; do
        printf '  New support URL (https/http/tg/mailto): ' >&2
        IFS= read -r new || new=""
        new="$(rt_trim "$new")"
        rt_validate_support_url "$new" && break
        rt_ui_warn "Use https://, http://, tg:// or mailto:."
      done ;;
  esac
  if rt_apply_branding "$(rt_config_get_text SERVICE_NAME_B64 2>/dev/null || true)" "$new" \
      "$(rt_config_get_raw LOGO_MIME 2>/dev/null || true)" "$(rt_config_get_raw LOGO_DATA_B64 2>/dev/null || true)"; then
    [ -n "$new" ] && rt_ui_success "Support URL updated." || rt_ui_success "Support URL removed."
  fi
}
rt_reconfig_logo() {
  local choice mime b64 lp kb
  mime="$(rt_config_get_raw LOGO_MIME 2>/dev/null || true)"
  b64="$(rt_config_get_raw LOGO_DATA_B64 2>/dev/null || true)"
  printf '  %s1%s Use/Replace   %s2%s Remove   %s3%s Show status   %s0%s Back\n' \
    "$RT_C_BLD" "$RT_C_RST" "$RT_C_BLD" "$RT_C_RST" "$RT_C_BLD" "$RT_C_RST" "$RT_C_BLD" "$RT_C_RST"
  choice="$(rt_ui_menu_select 3)"
  case "$choice" in
    0) return 0 ;;
    3)
      if [ -n "$b64" ]; then
        kb=$(( (${#b64} * 3 / 4) / 1024 ))
        rt_ui_info "Custom ${mime:-image} logo / Size: ${kb} KB"
      else
        rt_ui_info "Generated monogram (no custom logo set)."
      fi
      return 0 ;;
    2)
      if rt_apply_branding "$(rt_config_get_text SERVICE_NAME_B64 2>/dev/null || true)" \
          "$(rt_config_get_text SUPPORT_URL_B64 2>/dev/null || true)" "" ""; then
        rt_ui_success "Logo removed; the monogram will be used."
      fi
      return 0 ;;
    1)
      printf '  Path to a PNG, JPEG or WebP image (<= 256 KiB): ' >&2
      IFS= read -r lp || lp=""
      lp="$(rt_trim "$lp")"
      [ -n "$lp" ] || { rt_ui_info "No path entered; logo unchanged."; return 0; }
      local newmime
      if ! newmime="$(rt_logo_validate "$lp")"; then return 0; fi
      [ -L "$lp" ] && { rt_ui_error "Path became a symlink; aborting."; return 0; }
      local newb64; newb64="$(base64 < "$lp" | tr -d '\n')"
      if rt_apply_branding "$(rt_config_get_text SERVICE_NAME_B64 2>/dev/null || true)" \
          "$(rt_config_get_text SUPPORT_URL_B64 2>/dev/null || true)" "$newmime" "$newb64"; then
        rt_ui_success "Logo updated ($newmime)."
      fi
      return 0 ;;
  esac
}

rt_reconfig_template() {
  # the manager's template editor. Only designs the installed release actually
  # ships are offered; nothing is applied until it is confirmed, and the switch
  # itself is the full snapshot/validate/activate/restore transaction.
  local list=() id prev cur choice n=0 i
  cur="$(rt_template_effective)"
  printf '  %sCurrent template:%s %s\n' "$RT_C_DIM" "$RT_C_RST" "$(rt_template_display_name "$cur")"
  while IFS= read -r id; do
    list+=("$id")
  done < <(rt_template_offered)
  n="${#list[@]}"
  if [ "$n" -eq 0 ]; then
    rt_ui_warn "No templates are installed. Re-run the installer to restore the template store."
    return 0
  fi

  i=0
  for id in "${list[@]}"; do
    i=$((i + 1))
    printf '  %s%d%s  %s\n' "$RT_C_BLD" "$i" "$RT_C_RST" "$(rt_template_display_name "$id")"
  done
  printf '  %s0%s  Back\n' "$RT_C_BLD" "$RT_C_RST"
  choice="$(rt_ui_menu_select "$n")"
  case "$choice" in
    0) return 0 ;;
  esac
  id="${list[$((choice - 1))]}"
  if [ "$id" = "$cur" ]; then
    rt_ui_info "Already the active template."
    return 0
  fi
  rt_ui_confirm "Switch the template to $(rt_template_display_name "$id")?" no \
    || { rt_ui_info "Template unchanged."; return 0; }
  if rt_switch_template "$id"; then
    rt_ui_success "Template changed successfully"
    rt_ui_kv "Previous" "$(rt_template_display_name "$cur")"
    rt_ui_kv "Current"  "$(rt_template_display_name "$(rt_template_effective)")"
    rt_ui_kv "Verification" "Passed"
  fi
}

rt_reconfig_reset() {
  rt_ui_warn "This clears custom branding (service name, support URL, logo) and"
  rt_ui_info "returns Row-Template to its default look. It does NOT remove Row-Template."
  rt_ui_confirm "Reset branding to defaults?" no || { rt_ui_info "Reset cancelled."; return 0; }
  if rt_apply_branding "" "" "" ""; then rt_ui_success "Branding reset to defaults."; fi
}
rt_manager_reconfigure() {
  local choice
  while true; do
    rt_ui_section "Reconfigure"
    printf '  %s1%s  Service name\n'          "$RT_C_BLD" "$RT_C_RST"
    printf '  %s2%s  Support URL\n'           "$RT_C_BLD" "$RT_C_RST"
    printf '  %s3%s  Logo\n'                  "$RT_C_BLD" "$RT_C_RST"
    printf '  %s4%s  Template\n'              "$RT_C_BLD" "$RT_C_RST"
    printf '  %s5%s  Reset branding\n'        "$RT_C_BLD" "$RT_C_RST"
    printf '  %s6%s  Reconfigure everything\n' "$RT_C_BLD" "$RT_C_RST"
    printf '  %s0%s  Back\n'                  "$RT_C_BLD" "$RT_C_RST"
    choice="$(rt_ui_menu_select 6)"
    case "$choice" in
      1) rt_reconfig_service_name ;;
      2) rt_reconfig_support_url ;;
      3) rt_reconfig_logo ;;
      4) rt_reconfig_template ;;
      5) rt_reconfig_reset ;;
      6) rt_run_action rt_cmd_config ;;
      0) return 0 ;;
    esac
    rt_ui_pause
  done
}

# --- manager: entry point ----------------------------------------------------

rt_manager_main() {
  # The interactive dashboard. Requires root (every changing action does) and
  # reads real state each iteration. In a non-interactive context the menu
  # selector returns 0 (Exit) on EOF, so this never blocks automation.
  rt_require_root
  [ -f "$RT_VERSION_FILE" ] || rt_die "Row-Template is not installed at $RT_ROOT; run the installer first."
  rt_detect_xui >/dev/null 2>&1 || true
  rt_detect_xui_version >/dev/null 2>&1 || true
  rt_detect_xui_db >/dev/null 2>&1 || true
  local choice
  while true; do
    rt_manager_dashboard
    choice="$(rt_ui_menu_select 7)"
    case "$choice" in
      1) rt_manager_update ;;
      2) rt_manager_reconfigure ;;
      3) rt_run_action rt_cmd_verify ;;
      4) rt_run_action rt_cmd_rollback ;;
      5) rt_manager_activate ;;
      6) rt_manager_info ;;
      7) rt_run_action rt_cmd_uninstall
         [ -f "$RT_VERSION_FILE" ] || { rt_ui_info "Row-Template has been removed. Goodbye."; return 0; } ;;
      0) rt_ui_info "Goodbye."; return 0 ;;
    esac
    rt_ui_pause
  done
}
# --- first-install / re-run presentation (used by rt_cmd_install) ------------
# All of these are interactive-only. rt_cmd_install still runs unchanged in a
# non-interactive context (automation/CI/curl | bash), so nothing here can block
# or alter a scripted install.

rt_install_welcome() {
  # $1 = detected 3x-ui version (may be empty). Returns 0 to proceed, 1 to abort.
  rt_ui_header
  rt_ui_info "Welcome to the Row-Template installer."
  rt_ui_kv "Detected 3X-UI" "${1:-unknown}"
  rt_ui_info "Your panel data is safe: inbounds, clients, users and the panel"
  rt_ui_info "database are NOT modified. Only a subscription theme is added."
  rt_ui_kv "GitHub" "$RT_GITHUB"
  printf '\n'
  rt_ui_confirm "Continue installation?" yes
}

rt_install_pick_template() {
  # the fresh-install design chooser. Offers only what the release store ships,
  # in catalogue order, and echoes the chosen id on stdout. Enter and EOF both
  # take the default (Row), so a piped caller can never hang here.
  local list=() id i=0 choice
  while IFS= read -r id; do
    list+=("$id")
  done < <(rt_template_offered)
  if [ "${#list[@]}" -eq 0 ]; then printf 'row'; return 0; fi

  { rt_ui_section "Choose your Row-Template design"; } >&2
  for id in "${list[@]}"; do
    i=$((i + 1))
    printf '  %s%d%s  %s\n' "$RT_C_BLD" "$i" "$RT_C_RST" "$(rt_template_display_name "$id")" >&2
  done
  while true; do
    printf '  %sSelect%s [1-%s, Enter=Row]: ' "$RT_C_BLD" "$RT_C_RST" "${#list[@]}" >&2
    IFS= read -r choice || { printf 'row'; return 0; }
    choice="$(rt_trim "$choice")"
    if [ -z "$choice" ]; then printf 'row'; return 0; fi
    case "$choice" in
      *[!0-9]*) rt_warn "Choose 1-${#list[@]}, or press Enter for Row."; continue ;;
    esac
    if [ "$choice" -ge 1 ] && [ "$choice" -le "${#list[@]}" ] 2>/dev/null; then
      printf '%s' "${list[$((choice - 1))]}"
      return 0
    fi
    rt_warn "Choose 1-${#list[@]}, or press Enter for Row."
  done
}

rt_install_summary_confirm() {
  # show the chosen branding + install target, then confirm. 0 = proceed.
  # $1 = the template picked by the chooser (empty on a non-interactive run,
  # where the stored selection or Row applies).
  local name url logo picked="${1:-}"
  name="$(rt_config_get_text SERVICE_NAME_B64 2>/dev/null || true)"
  url="$(rt_config_get_text SUPPORT_URL_B64 2>/dev/null || true)"
  [ -n "$(rt_config_get_raw LOGO_DATA_B64 2>/dev/null)" ] && logo="custom image" || logo="generated monogram"
  rt_ui_section "Configuration summary"
  rt_ui_kv "Service name" "${name:-<none> (white-label)}"
  rt_ui_kv "Support URL"  "$([ -n "$url" ] && echo configured || echo none)"
  rt_ui_kv "Logo"         "$logo"
  rt_ui_kv "Template"     "$(rt_template_display_name "${picked:-$(rt_template_effective)}")"
  rt_ui_kv "Install dir"  "$RT_ROOT"
  printf '\n'
  rt_ui_confirm "Install with these settings?" yes
}

rt_existing_install_menu() {
  # interactive re-run chooser. Echoes exactly one token on stdout:
  #   manager | reconfigure | update | repair | exit
  local rtv choice
  rtv="$(rt_trim "$(cat "$RT_VERSION_FILE" 2>/dev/null || true)")"; [ -n "$rtv" ] || rtv="unknown"
  rt_ui_header >&2
  rt_ui_info "Row-Template $rtv is already installed at $RT_ROOT." >&2
  {
    printf '  %s1%s  Open the manager\n'   "$RT_C_BLD" "$RT_C_RST"
    printf '  %s2%s  Reconfigure branding\n' "$RT_C_BLD" "$RT_C_RST"
    printf '  %s3%s  Update\n'             "$RT_C_BLD" "$RT_C_RST"
    printf '  %s4%s  Repair / Verify\n'    "$RT_C_BLD" "$RT_C_RST"
    printf '  %s0%s  Exit\n'               "$RT_C_BLD" "$RT_C_RST"
  } >&2
  choice="$(rt_ui_menu_select 4)"
  case "$choice" in
    1) printf 'manager' ;; 2) printf 'reconfigure' ;; 3) printf 'update' ;;
    4) printf 'repair' ;; *) printf 'exit' ;;
  esac
}
rt_install_success_screen() {
  # $1 = auto | manual | skipped. Never claims "Active" unless activation was
  # verified (auto). Shown on an interactive first install.
  local outcome="$1" name rtv theme tpl
  name="$(rt_config_get_text SERVICE_NAME_B64 2>/dev/null || true)"; [ -n "$name" ] || name="(white-label)"
  rtv="$(rt_trim "$(cat "$RT_VERSION_FILE" 2>/dev/null || true)")"; [ -n "$rtv" ] || rtv="unknown"
  tpl="$(rt_template_display_name "$(rt_template_effective)")"
  case "$outcome" in
    auto) theme="Active" ;;
    *)    theme="Manual activation required" ;;
  esac
  printf '\n'
  rt_ui_rule
  printf '  %s%s installed%s\n' "$RT_C_GRN" "$RT_PROJECT_NAME" "$RT_C_RST"
  rt_ui_kv "Service"  "$name"
  rt_ui_kv "Version"  "$rtv"
  rt_ui_kv "Template" "$tpl"
  rt_ui_kv "Install dir" "$RT_ROOT"
  rt_ui_kv "Theme"    "$theme"
  rt_ui_kv "Manage"   "run: row-template"
  rt_ui_kv "GitHub"   "$RT_GITHUB"
  rt_ui_kv "Developer" "$RT_DEVELOPER"
  rt_ui_rule
  if [ "$theme" != "Active" ]; then
    rt_ui_info "To activate: Panel Settings -> Subscription -> Sub Theme Directory"
    rt_ui_kv "Enter exactly" "$RT_ROOT"
  fi
}
# --- panel interface (P3) -----------------------------------------------------
# The frozen installer-side panel contract. It is sourced EXPLICITLY, not
# globbed: the set of files that can alter installer behaviour must be fixed
# and reviewable, and a directory glob would let a stray file join it. Both
# files are inert at load time  --  they define functions and constants only, and
# every public entry point reports UNAVAILABLE until P5 implements a panel.
#
# The order matters in one direction only: interface.sh defines the contract
# and the internal stubs; index.sh defines the registry and dispatch that
# interface.sh resolves against at CALL time. Neither reads the other at load
# time, so the order is a readability choice, not a load-bearing one.
#
# This layer must not be sourced by a build that has no panels/ directory
# (an older payload). That is a FAILURE rather than a silent skip: a caller
# must never reach a panel operation and find the function simply absent,
# because "command not found" is an exit 127 that no return-code contract
# describes. Detectable failure beats an undefined symbol.
rt_panels_load() {
  # Source the frozen panel interface layer exactly once. Idempotent, so a
  # re-source of this library cannot double-define anything.
  [ -n "${RT_PANELS_LOADED:-}" ] && return 0
  local dir
  dir="$(dirname "${BASH_SOURCE[0]}")/../panels"
  [ -d "$dir" ] || { rt_err "panel interface missing: $dir"; return 1; }
  . "$dir/interface.sh" || { rt_err "could not load panel interface"; return 1; }
  . "$dir/index.sh"     || { rt_err "could not load panel registry";   return 1; }
  RT_PANELS_LOADED=1
  return 0
}

# Loaded eagerly, because every caller of a panel operation should be able to
# assume the contract is present rather than remembering to load it. A failure
# here is loud and fatal at source time -- the same posture as a missing
# row-template.sh in the payload -- rather than deferred to first use.
RT_PANELS_LOADED=""
if ! rt_panels_load; then
  # Sourced: abort the source so the caller sees a failure. Executed
  # directly: exit, since there is no caller to return to. Both paths end
  # the run rather than leaving a half-loaded interface behind.
  return 1 2>/dev/null || exit 1
fi


