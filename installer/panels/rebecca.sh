#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# installer/panels/rebecca.sh -- the Rebecca panel adapter (1.3.0).
#
# Sourced by installer/panels/index.sh and reached only through the seven
# public rt_panel_* verbs of installer/panels/interface.sh.
#
# WHAT REBECCA ACTIVATION ACTUALLY IS (audited against the Rebecca Go source
# and its official installer, docs/design/REBECCA-INSTALLER-AUDIT.md):
#
#   * Rebecca renders its subscription page with pongo2. On EVERY request it
#     reads the page's name and an optional custom directory from the newest
#     row of its `subscription_settings` table:
#
#         subscription_page_template   default 'subscription/index.html'
#         custom_templates_directory   default NULL
#
#     and reads the file <custom_templates_directory>/<subscription_page_template>
#     from disk (falling back to its bundled templates). Nothing is cached, so a
#     change takes effect on the next request: no restart, ever.
#   * The official installer runs it from /opt/rebecca, in Docker with the bind
#     mount /var/lib/rebecca:/var/lib/rebecca, or as rebecca.service (binary
#     mode). Its database is SQLite at /var/lib/rebecca/db.sqlite3 by default
#     (SQLALCHEMY_DATABASE_URL in /opt/rebecca/.env), or MySQL/MariaDB.
#
# So activation is:
#
#   1. PLACE the generated page at <dir>/row-template/index.html, where <dir> is
#      the operator's custom_templates_directory, else /var/lib/rebecca/templates.
#   2. SELECT it: set subscription_page_template = 'row-template/index.html',
#      and custom_templates_directory = <dir> when the operator had none. Only
#      that one row, only those two columns.
#
# Step 2 needs the sqlite3 command and a SQLite database. With MySQL/MariaDB, or
# without sqlite3, the adapter answers UNAVAILABLE and the installer prints the
# two values to enter in Rebecca's dashboard -- the same "manual activation"
# 3X-UI has without sqlite3. The adapter never asks for, reads or prints a
# database password: .env is read for one key, SQLALCHEMY_DATABASE_URL, and only
# a sqlite: URL is ever used.
#
# Per-administrator overrides. Rebecca lets an admin override both columns for
# their own users (admins.subscription_settings). Those users keep the admin's
# page; verify reports how many admins have one.
# ---------------------------------------------------------------------------

RT_PANEL_REBECCA_CAPABILITIES="db_activation file_placement selection_read selection_write static_verify"

: "${RT_RB_APP_DIR:=/opt/rebecca}"
: "${RT_RB_DATA_DIR:=/var/lib/rebecca}"
: "${RT_RB_CLI:=/usr/local/bin/rebecca}"
: "${RT_RB_PROJECT:=rebecca}"
: "${RT_RB_UNIT:=rebecca.service}"

RT_RB_SUBDIR="row-template"
RT_RB_PAGE="row-template/index.html"
RT_RB_DEFAULT_PAGE="subscription/index.html"

# --- environment ------------------------------------------------------------

rt_panel_rebecca_env() { printf '%s' "$RT_RB_APP_DIR/.env"; }

rt_panel_rebecca_compose_ok() {
  local f="$RT_RB_APP_DIR/docker-compose.yml"
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  LC_ALL=C grep -Eq '^[[:space:]]*image:[[:space:]]*["'"'"']?(docker\.io/)?rebeccapanel/rebecca([:@"'"'"'[:space:]]|$)' "$f" 2>/dev/null
}

rt_panel_rebecca_unit_ok() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl list-unit-files 2>/dev/null | LC_ALL=C grep "^${RT_RB_UNIT//./\\.}" >/dev/null 2>&1
}

rt_panel_rebecca_mode() {
  if rt_panel_rebecca_compose_ok; then printf 'docker'; return 0; fi
  if rt_panel_rebecca_unit_ok; then printf 'binary'; return 0; fi
  printf 'none'
}

rt_panel_rebecca_running() {
  case "$(rt_panel_rebecca_mode)" in
    docker)
      command -v docker >/dev/null 2>&1 || return 1
      [ -n "$(docker ps --filter "label=com.docker.compose.project=$RT_RB_PROJECT" --format '{{.Image}}' 2>/dev/null \
        | LC_ALL=C awk '/^(docker\.io\/)?rebeccapanel\/rebecca([:@]|$)/ { print; exit }' || true)" ] ;;
    binary) systemctl is-active --quiet "$RT_RB_UNIT" 2>/dev/null ;;
    *) return 1 ;;
  esac
}

rt_panel_rebecca_db() {
  # Echo the host path of Rebecca's SQLite database, or fail. Reads ONE key of
  # .env and never prints it: a MySQL URL carries a password.
  local env url path rc=0
  env="$(rt_panel_rebecca_env)"
  [ -f "$env" ] && [ ! -L "$env" ] || return 1
  url="$(rt_dotenv_get "$env" SQLALCHEMY_DATABASE_URL)" || rc=$?
  if [ "$rc" -ne 0 ] || [ -z "$url" ]; then
    rc=0; url="$(rt_dotenv_get "$env" DATABASE_URL)" || rc=$?
    [ "$rc" -eq 0 ] && [ -n "$url" ] || return 1
  fi
  case "$url" in
    sqlite:///*|sqlite+*:///*) path="${url#*:///}" ;;
    *) return 1 ;;                                       # MySQL/MariaDB: not ours to touch
  esac
  path="${path%%\?*}"
  case "$path" in
    /*) : ;;
    *) [ "$(rt_panel_rebecca_mode)" = "binary" ] || return 1   # relative: inside the image, not the host
       path="$RT_RB_APP_DIR/$path" ;;
  esac
  if [ "$(rt_panel_rebecca_mode)" = "docker" ]; then
    rt_is_within "$RT_RB_DATA_DIR" "$path" || return 1
  fi
  rt_is_sqlite_db "$path" || return 1
  printf '%s' "$path"
}

rt_panel_rebecca_db_ready() {
  command -v sqlite3 >/dev/null 2>&1 || return 1
  RT_RB_DB="$(rt_panel_rebecca_db)" || return 1
  [ -n "$RT_RB_DB" ]
}

rt_panel_rebecca_sql() {
  # One statement against Rebecca's database, waiting for a lock rather than
  # failing on it: the panel keeps the database open while it runs. Values in
  # the statement are escaped by rt_panel_rebecca_quote; output is data.
  sqlite3 -cmd '.timeout 5000' "$RT_RB_DB" "$1"
}

rt_panel_rebecca_quote() { printf '%s' "${1//\'/\'\'}"; }

RT_RB_ROW="(SELECT id FROM subscription_settings ORDER BY id DESC LIMIT 1)"

rt_panel_rebecca_page_get() {
  # Echo subscription_page_template of the row Rebecca reads. Fails when there
  # is no row, or the value holds a newline (it could not be restored exactly).
  local n v
  n="$(rt_panel_rebecca_sql "SELECT COUNT(*) FROM subscription_settings;")" || return 1
  case "${n:-}" in ''|*[!0-9]*|0) return 1 ;; esac
  v="$(rt_panel_rebecca_sql "SELECT subscription_page_template FROM subscription_settings WHERE id = $RT_RB_ROW;")" || return 1
  case "$v" in *'
'*) return 1 ;; esac
  printf '%s' "$v"
}

rt_panel_rebecca_dir_get() {
  # Echo custom_templates_directory as STATE:VALUE, STATE = absent (NULL) |
  # empty | present. NULL and '' are different, and a restore needs which.
  local v
  v="$(rt_panel_rebecca_sql "SELECT CASE WHEN custom_templates_directory IS NULL THEN 'N' ELSE 'V' || custom_templates_directory END FROM subscription_settings WHERE id = $RT_RB_ROW;")" || return 1
  case "$v" in *'
'*) return 1 ;; esac
  case "$v" in
    N) printf 'absent:' ;;
    V) printf 'empty:' ;;
    V*) printf 'present:%s' "${v#V}" ;;
    *) return 1 ;;
  esac
}

rt_panel_rebecca_write() {
  # rt_panel_rebecca_write PAGE DIR_STATE [DIR]  -- set both columns of the row
  # Rebecca reads, and nothing else.
  local page dstate="$2" dir="${3:-}" dsql
  page="$(rt_panel_rebecca_quote "$1")"
  case "$dstate" in
    absent)  dsql="NULL" ;;
    empty)   dsql="''" ;;
    present) dsql="'$(rt_panel_rebecca_quote "$dir")'" ;;
    keep)    dsql="custom_templates_directory" ;;
    *) return 1 ;;
  esac
  rt_panel_rebecca_sql "UPDATE subscription_settings SET subscription_page_template = '$page', custom_templates_directory = $dsql WHERE id = $RT_RB_ROW;"
}

rt_panel_rebecca_dir_ok() {
  # An operator directory we are willing to place a file into: absolute, no
  # control characters, no . or .. component.
  case "${1:-}" in /*) : ;; *) return 1 ;; esac
  rt_has_control_chars "$1" && return 1
  case "$1" in */../*|*/..|*/./*|*/.) return 1 ;; esac
  return 0
}

rt_panel_rebecca_root() {
  # The directory the page goes into: the operator's custom directory, else
  # DATA_DIR/templates. In Docker it must be inside the bind-mounted DATA_DIR.
  local d root
  d="$(rt_panel_rebecca_dir_get)" || return 1
  root="${d#*:}"; root="${root%/}"
  [ -n "$root" ] || root="${RT_RB_DATA_DIR%/}/templates"
  rt_panel_rebecca_dir_ok "$root" || { rt_err "panel rebecca: custom_templates_directory is not a usable absolute path"; return 1; }
  if [ "$(rt_panel_rebecca_mode)" = "docker" ] && ! rt_is_within "$RT_RB_DATA_DIR" "$root"; then
    rt_err "panel rebecca: $root is outside $RT_RB_DATA_DIR, the directory the container shares with the host"
    return 1
  fi
  printf '%s' "$root"
}

rt_panel_rebecca_is_ours() {
  local f="$1"
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  LC_ALL=C grep -Fq '/* row:branding */' "$f" 2>/dev/null || return 1
  LC_ALL=C grep -Fq 'Row-Template, Rebecca page context' "$f" 2>/dev/null || return 1
  return 0
}

rt_panel_rebecca_shell_ok() {
  # A Rebecca shell this release can serve: valid, with the context prelude and
  # the explicit autoescape block. Anything older is refused.
  local f="$1"
  rt_validate_template "$f" >/dev/null 2>&1 || return 1
  LC_ALL=C grep -Fq 'Row-Template, Rebecca page context' "$f" 2>/dev/null || return 1
  LC_ALL=C grep -Fq '{%- autoescape on -%}' "$f" 2>/dev/null || return 1
  LC_ALL=C grep -Fq '{%- endautoescape %}' "$f" 2>/dev/null || return 1
  return 0
}

rt_panel_rebecca_admin_overrides() {
  # Echo how many admins override the page for their own users (0 when none or
  # unknown). A warning, never a failure: those users are the admin's choice.
  local n
  n="$(rt_panel_rebecca_sql "SELECT COUNT(*) FROM admins WHERE subscription_settings LIKE '%\"subscription_page_template\":\"_%' OR subscription_settings LIKE '%\"subscription_page_template\": \"_%' OR subscription_settings LIKE '%\"custom_templates_directory\":\"_%' OR subscription_settings LIKE '%\"custom_templates_directory\": \"_%';" 2>/dev/null)" || n=0
  case "${n:-}" in ''|*[!0-9]*) n=0 ;; esac
  printf '%s' "$n"
}

# --- the frozen verbs --------------------------------------------------------------

rt_panel_rebecca_detect() {
  # READ-ONLY. Two independent signals must agree:
  #   A  /opt/rebecca/.env
  #   B  a compose file running rebeccapanel/rebecca, or a rebecca systemd unit
  #   C  the rebecca management CLI
  #   D  the data directory
  local signals=0 env
  env="$(rt_panel_rebecca_env)"
  [ -f "$env" ] && [ ! -L "$env" ] && signals=$((signals + 1))
  if rt_panel_rebecca_compose_ok || rt_panel_rebecca_unit_ok; then signals=$((signals + 1)); fi
  if [ -x "$RT_RB_CLI" ] && [ ! -d "$RT_RB_CLI" ] && LC_ALL=C grep -qi 'rebecca' "$RT_RB_CLI" 2>/dev/null; then
    signals=$((signals + 1))
  fi
  [ -d "$RT_RB_DATA_DIR" ] && [ ! -L "$RT_RB_DATA_DIR" ] && signals=$((signals + 1))
  if [ "$signals" -ge 2 ]; then return "$RT_PANEL_OK"; fi
  if [ "$signals" -eq 1 ]; then return "$RT_PANEL_FAIL"; fi
  return "$RT_PANEL_NOT_APPLICABLE"
}

rt_panel_rebecca_capabilities() {
  local t
  for t in $RT_PANEL_REBECCA_CAPABILITIES; do printf '%s\n' "$t"; done
  return "$RT_PANEL_OK"
}

rt_panel_rebecca_backup_state() {
  #   selection  subscription_page_template (present, or empty)
  #   meta       mechanism=db, was_running (recorded; Rebecca is never restarted)
  #   files      the page, when this change will create it
  #   aux        dir_state/dir: custom_templates_directory exactly (NULL, '' or
  #              a value), root, root_created
  local panel="$1" page state was_running=0 d root files=()
  rt_panel_rebecca_db_ready || return "$RT_PANEL_UNAVAILABLE"
  page="$(rt_panel_rebecca_page_get)" || { rt_err "panel rebecca: cannot read subscription_settings"; return "$RT_PANEL_FAIL"; }
  if [ -z "$page" ]; then state="empty"; else state="present"; fi
  d="$(rt_panel_rebecca_dir_get)" || { rt_err "panel rebecca: cannot read custom_templates_directory"; return "$RT_PANEL_FAIL"; }
  root="$(rt_panel_rebecca_root)" || return "$RT_PANEL_FAIL"
  rt_panel_rebecca_running && was_running=1
  [ -e "$root/$RT_RB_PAGE" ] || [ -L "$root/$RT_RB_PAGE" ] || files+=("$RT_RB_PAGE")
  rt_backup_panel_write "$RT_PANEL_STAGE" "$panel" "$state" "$page" db "$was_running" ${files[@]+"${files[@]}"} \
    || return "$RT_PANEL_FAIL"
  rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" dir_state "${d%%:*}" || return "$RT_PANEL_FAIL"
  rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" dir "${d#*:}" || return "$RT_PANEL_FAIL"
  rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" root "$root" || return "$RT_PANEL_FAIL"
  if [ ! -d "$root" ]; then
    rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" root_created 1 || return "$RT_PANEL_FAIL"
  fi
  return "$RT_PANEL_OK"
}

rt_panel_rebecca_place() {
  local src="$1" root="$2" dir dest tmp
  dir="$root/$RT_RB_SUBDIR"; dest="$root/$RT_RB_PAGE"
  [ -L "$root" ] && { rt_err "panel rebecca: the templates directory is a symlink: $root"; return 1; }
  [ -L "$dir" ] && { rt_err "panel rebecca: $dir is a symlink"; return 1; }
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    rt_panel_rebecca_is_ours "$dest" \
      || { rt_err "panel rebecca: $dest exists and is not Row-Template's; it was left untouched"; return 1; }
  fi
  mkdir -p "$dir" || return 1
  chmod 755 "$dir" 2>/dev/null || true
  tmp="$(mktemp "$dir/.index.XXXXXX")" || return 1
  cp -- "$src" "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$dest" || { rm -f "$tmp"; return 1; }
  return 0
}

rt_panel_rebecca_install_template() {
  # Place SOURCE and select it. Idempotent: when already selected, only the
  # page is replaced.
  local panel="$1" src="$2" root d page
  [ -n "$src" ] || { rt_err "panel rebecca: SOURCE is required"; return "$RT_PANEL_FAIL"; }
  [ -L "$src" ] && { rt_err "panel rebecca: refusing a symlinked SOURCE"; return "$RT_PANEL_FAIL"; }
  [ -f "$src" ] || { rt_err "panel rebecca: SOURCE is not a regular file: $src"; return "$RT_PANEL_FAIL"; }
  rt_is_within "$RT_ROOT" "$src" || { rt_err "panel rebecca: SOURCE is outside $RT_ROOT"; return "$RT_PANEL_FAIL"; }
  rt_panel_rebecca_shell_ok "$src" || { rt_err "panel rebecca: SOURCE is not a Rebecca page this release can serve"; return "$RT_PANEL_FAIL"; }
  rt_panel_rebecca_db_ready || return "$RT_PANEL_UNAVAILABLE"
  root="$(rt_panel_rebecca_root)" || return "$RT_PANEL_FAIL"
  rt_panel_rebecca_place "$src" "$root" || return "$RT_PANEL_FAIL"
  page="$(rt_panel_rebecca_page_get)" || return "$RT_PANEL_FAIL"
  d="$(rt_panel_rebecca_dir_get)" || return "$RT_PANEL_FAIL"
  if [ "$page" = "$RT_RB_PAGE" ] && [ "${d#*:}" != "" ]; then
    return "$RT_PANEL_OK"
  fi
  if [ -n "${d#*:}" ]; then
    rt_panel_rebecca_write "$RT_RB_PAGE" keep || return "$RT_PANEL_FAIL"
  else
    rt_panel_rebecca_write "$RT_RB_PAGE" present "$root" || return "$RT_PANEL_FAIL"
  fi
  return "$RT_PANEL_OK"
}

rt_panel_rebecca_selected() {
  local root page d
  page="$(rt_panel_rebecca_page_get 2>/dev/null)" || return 1
  [ "$page" = "$RT_RB_PAGE" ] || return 1
  d="$(rt_panel_rebecca_dir_get 2>/dev/null)" || return 1
  root="$(rt_panel_rebecca_root 2>/dev/null)" || return 1
  [ "$(printf '%s' "${d#*:}" | sed 's:/*$::')" = "$root" ]
}

rt_panel_rebecca_verify() {
  local panel="$1" mode="$2" root dest want n
  case "$mode" in
    live)   return "$RT_PANEL_UNAVAILABLE" ;;
    static) : ;;
    *) rt_err "panel rebecca: unknown verification mode '$mode'"; return "$RT_PANEL_FAIL" ;;
  esac
  [ -f "$RT_DIST" ] || { rt_err "panel rebecca: the artifact is missing: $RT_DIST"; return "$RT_PANEL_FAIL"; }
  rt_panel_rebecca_shell_ok "$RT_DIST" || { rt_err "panel rebecca: the artifact is not a valid Rebecca page"; return "$RT_PANEL_FAIL"; }
  if [ -f "$RT_DIST_SUM" ]; then
    want="$(LC_ALL=C awk '{print $1; exit}' "$RT_DIST_SUM" 2>/dev/null || true)"
    rt_verify_sha256 "$RT_DIST" "$want" >/dev/null 2>&1 \
      || { rt_err "panel rebecca: the artifact does not match its recorded checksum"; return "$RT_PANEL_FAIL"; }
  fi
  rt_validate_template "$RT_LIVE" >/dev/null 2>&1 \
    || { rt_err "panel rebecca: the generated page is missing or invalid: $RT_LIVE"; return "$RT_PANEL_FAIL"; }
  rt_panel_rebecca_db_ready || { rt_err "panel rebecca: cannot read the panel selection (sqlite3 and a SQLite database are needed)"; return "$RT_PANEL_FAIL"; }
  root="$(rt_panel_rebecca_root)" || return "$RT_PANEL_FAIL"
  dest="$root/$RT_RB_PAGE"
  rt_panel_rebecca_is_ours "$dest" || { rt_err "panel rebecca: the page is not in place: $dest"; return "$RT_PANEL_FAIL"; }
  [ "$(rt_sha256 "$dest" 2>/dev/null || true)" = "$(rt_sha256 "$RT_LIVE" 2>/dev/null || true)" ] \
    || { rt_err "panel rebecca: the placed page differs from the generated one"; return "$RT_PANEL_FAIL"; }
  rt_panel_rebecca_selected || { rt_err "panel rebecca: the panel does not select the Row-Template page"; return "$RT_PANEL_FAIL"; }
  n="$(rt_panel_rebecca_admin_overrides)"
  [ "$n" = "0" ] || rt_warn "panel rebecca: $n admin(s) override the subscription page for their own users; those users keep the admin's page."
  return "$RT_PANEL_OK"
}

rt_panel_rebecca_remove_page() {
  local root="$1" root_created="${2:-0}" dest
  dest="$root/$RT_RB_PAGE"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    rt_panel_rebecca_is_ours "$dest" || { rt_warn "panel rebecca: $dest is not Row-Template's; left in place"; return 0; }
    rm -f -- "$dest" || return 1
  fi
  rmdir -- "$root/$RT_RB_SUBDIR" 2>/dev/null || true
  if [ "$root_created" = "1" ]; then rmdir -- "$root" 2>/dev/null || true; fi
  return 0
}

rt_panel_rebecca_restore_record() {
  # rt_panel_rebecca_restore_record SNAPSHOT PANEL -- put both columns back
  # exactly as the record has them. Validates everything before writing, then
  # reads both columns BACK and compares them with the record.
  #
  # The read-back is what makes this function's SUCCESS mean what interface.sh
  # says SUCCESS means -- "operation completed AND its required verification
  # passed" -- and the transaction engine's rollback now relies on exactly that
  # rather than re-running a forward check of its own. A correct rollback
  # deliberately stops the panel selecting Row-Template, so a forward check
  # would fail by design; the comparison with the record is the real evidence.
  local snap="$1" panel="$2" st page dstate dir nowpage nowdir
  st="$(rt_backup_panel_state "$snap" "$panel")" || return 1
  case "$st" in
    present) page="$(rt_backup_panel_selection "$snap" "$panel")" || return 1 ;;
    empty)   page="" ;;
    *) rt_err "panel rebecca: subscription_page_template cannot have been absent (state '$st')"; return 1 ;;
  esac
  dstate="$(rt_backup_panel_aux "$snap" "$panel" dir_state)" || return 1
  dir="$(rt_backup_panel_aux "$snap" "$panel" dir)" || return 1
  case "$dstate" in absent|empty|present) : ;; *) rt_err "panel rebecca: malformed dir_state record"; return 1 ;; esac
  rt_panel_rebecca_write "$page" "$dstate" "$dir" || return 1

  nowpage="$(rt_panel_rebecca_page_get)" \
    || { rt_err "panel rebecca: cannot read subscription_page_template back after restoring"; return 1; }
  [ "$nowpage" = "$page" ] || {
    rt_err "panel rebecca: after restoring, subscription_page_template is '$nowpage', expected '$page'"
    return 1; }
  nowdir="$(rt_panel_rebecca_dir_get)" \
    || { rt_err "panel rebecca: cannot read custom_templates_directory back after restoring"; return 1; }
  [ "$nowdir" = "$dstate:$dir" ] || {
    rt_err "panel rebecca: after restoring, custom_templates_directory is not the recorded value"
    return 1; }
  return 0
}

rt_panel_rebecca_restore_state() {
  local panel="$1" snap="$2" mech files f root created
  rt_backup_panel_state "$snap" "$panel" >/dev/null || { rt_err "panel rebecca: malformed selection.state"; return "$RT_PANEL_FAIL"; }
  rt_backup_panel_meta_check "$snap" "$panel" || { rt_err "panel rebecca: malformed panel meta"; return "$RT_PANEL_FAIL"; }
  mech="$(rt_manifest_get mechanism "$snap/panels/$panel/meta")"
  [ "$mech" = "db" ] || { rt_err "panel rebecca: mechanism is '$mech', expected 'db'"; return "$RT_PANEL_FAIL"; }
  files="$(rt_backup_panel_files "$snap" "$panel")" || { rt_err "panel rebecca: malformed files record"; return "$RT_PANEL_FAIL"; }
  for f in $files; do
    [ "$f" = "$RT_RB_PAGE" ] || { rt_err "panel rebecca: refusing to restore: the record lists a file this adapter never places: $f"; return "$RT_PANEL_FAIL"; }
  done
  root="$(rt_backup_panel_aux "$snap" "$panel" root)" || return "$RT_PANEL_FAIL"
  created="$(rt_backup_panel_aux "$snap" "$panel" root_created)" || return "$RT_PANEL_FAIL"
  rt_panel_rebecca_dir_ok "$root" || { rt_err "panel rebecca: malformed root record"; return "$RT_PANEL_FAIL"; }
  rt_panel_rebecca_db_ready || return "$RT_PANEL_UNAVAILABLE"
  rt_panel_rebecca_restore_record "$snap" "$panel" || return "$RT_PANEL_FAIL"
  if [ -n "$files" ]; then
    rt_panel_rebecca_remove_page "$root" "${created:-0}" || return "$RT_PANEL_FAIL"
  fi
  # was_running is recorded but never acted on: this adapter never stops or
  # starts Rebecca, so the service is exactly as the record found it.
  return "$RT_PANEL_OK"
}

rt_panel_rebecca_uninstall_template() {
  # Put the selection back the way it was before Row-Template (from the
  # activation record when there is one), then remove our page. When the panel
  # no longer selects our page, the selection is the operator's and is left
  # alone; our page is still removed.
  local page d root snap created=0 removed=0
  rt_panel_rebecca_db_ready || return "$RT_PANEL_UNAVAILABLE"
  page="$(rt_panel_rebecca_page_get)" || return "$RT_PANEL_FAIL"
  d="$(rt_panel_rebecca_dir_get)" || return "$RT_PANEL_FAIL"
  root="$(rt_panel_rebecca_root 2>/dev/null)" || root=""
  if [ "$page" = "$RT_RB_PAGE" ]; then
    snap=""
    if [ -f "${RT_PANEL_ACTIVATION:-/nonexistent}" ]; then
      snap="$(rt_backup_resolve "$(head -n1 "$RT_PANEL_ACTIVATION")" 2>/dev/null || true)"
    fi
    if [ -n "$snap" ] && [ -d "$snap/panels/rebecca" ] && rt_panel_rebecca_restore_record "$snap" rebecca; then
      created="$(rt_backup_panel_aux "$snap" rebecca root_created 2>/dev/null || echo 0)"
    else
      # No usable record: return to Rebecca's own default page, and clear the
      # directory only when it is the one Row-Template itself sets.
      if [ "${d#*:}" = "${RT_RB_DATA_DIR%/}/templates" ]; then
        rt_panel_rebecca_write "$RT_RB_DEFAULT_PAGE" absent || return "$RT_PANEL_FAIL"
        created=1
      else
        rt_panel_rebecca_write "$RT_RB_DEFAULT_PAGE" keep || return "$RT_PANEL_FAIL"
      fi
    fi
    removed=1
  fi
  if [ -n "$root" ] && rt_panel_rebecca_is_ours "$root/$RT_RB_PAGE"; then
    rt_panel_rebecca_remove_page "$root" "$created" || return "$RT_PANEL_FAIL"
    removed=1
  fi
  [ "$removed" -eq 1 ] || return "$RT_PANEL_NOT_APPLICABLE"
  return "$RT_PANEL_OK"
}

# --- outside the transaction: refresh and status ----------------------------
# See installer/panels/pasarguard.sh. Without database access (MySQL/MariaDB,
# or no sqlite3) the page still goes to the default directory, so the
# operator's manual selection in the dashboard has a file to point at.

rt_panel_rebecca_page_root() {
  # The directory the page lives in: from the database when it can be read,
  # else the default the manual instructions name.
  if rt_panel_rebecca_db_ready; then rt_panel_rebecca_root; return; fi
  printf '%s' "${RT_RB_DATA_DIR%/}/templates"
}

rt_panel_rebecca_refresh() {
  # rt_panel_rebecca_refresh SOURCE [place]
  local src="$1" place="${2:-}" root
  rt_panel_rebecca_shell_ok "$src" || return "$RT_PANEL_FAIL"
  if ! root="$(rt_panel_rebecca_page_root 2>/dev/null)"; then
    # A directory Row-Template cannot use holds no page of ours -- unless the
    # panel selects our page from it, which is a real failure to report.
    if [ -z "$place" ] && [ "$(rt_panel_rebecca_page_get 2>/dev/null || true)" != "$RT_RB_PAGE" ]; then
      return "$RT_PANEL_NOT_APPLICABLE"
    fi
    rt_panel_rebecca_page_root >/dev/null
    return "$RT_PANEL_FAIL"
  fi
  if [ -z "$place" ] && ! rt_panel_rebecca_is_ours "$root/$RT_RB_PAGE"; then
    return "$RT_PANEL_NOT_APPLICABLE"
  fi
  rt_panel_rebecca_place "$src" "$root" || return "$RT_PANEL_FAIL"
  return "$RT_PANEL_OK"
}

rt_panel_rebecca_status() {
  # active | inactive | manual (the selection cannot be read or written here)
  local root
  rt_panel_rebecca_db_ready || { printf 'manual'; return 0; }
  root="$(rt_panel_rebecca_root 2>/dev/null)" || { printf 'inactive'; return 0; }
  if rt_panel_rebecca_is_ours "$root/$RT_RB_PAGE" && rt_panel_rebecca_selected; then
    printf 'active'
  else
    printf 'inactive'
  fi
}
