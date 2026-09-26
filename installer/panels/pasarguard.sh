#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# installer/panels/pasarguard.sh -- the PasarGuard panel adapter (1.3.0).
#
# Sourced by installer/panels/index.sh and reached only through the seven
# public rt_panel_* verbs of installer/panels/interface.sh; the transaction
# engine never calls in here by name.
#
# WHAT PASARGUARD ACTIVATION ACTUALLY IS (audited against PasarGuard 5.x
# source and the official installer, docs/design/PASARGUARD-INSTALLER-AUDIT.md):
#
#   * PasarGuard renders its subscription page with Jinja2 from a
#     FileSystemLoader whose search path is [CUSTOM_TEMPLATES_DIRECTORY,
#     app/templates], and picks the page by SUBSCRIPTION_PAGE_TEMPLATE. Both
#     are read from the environment ONCE, at start-up.
#   * The official installer runs it in Docker from /opt/pasarguard with
#     `env_file: .env` and the bind mount /var/lib/pasarguard:/var/lib/pasarguard,
#     so a path under /var/lib/pasarguard is the same path on the host and in
#     the container. A source install runs it as pasarguard.service, reading
#     .env from its working directory.
#
# So activation is two things, and this adapter does exactly those:
#
#   1. PLACE the generated page at <templates>/row-template/index.html, where
#      <templates> is the operator's CUSTOM_TEMPLATES_DIRECTORY or, when there
#      is none, /var/lib/pasarguard/templates. Only that one file is ever
#      written, inside a directory named for Row-Template, and a file there
#      that is not Row-Template's is never overwritten.
#   2. SELECT it by appending a MANAGED BLOCK to .env:
#
#        # >>> row-template (managed by Row-Template; do not edit) nl=0 >>>
#        CUSTOM_TEMPLATES_DIRECTORY = "/var/lib/pasarguard/templates"
#        SUBSCRIPTION_PAGE_TEMPLATE = "row-template/index.html"
#        # <<< row-template <<<
#
#      dotenv (python-dotenv and Docker Compose alike) takes the LAST
#      assignment of a key, so the block wins without a single operator line
#      being edited. Removing the block is therefore the exact inverse of
#      adding it: the file returns to its previous bytes, and any line the
#      operator changed in the meantime is kept. CUSTOM_TEMPLATES_DIRECTORY is
#      written only when the operator has not set one. `nl=1` records that a
#      newline was added to a file that ended without one, so removal restores
#      that too.
#
#   Then the panel is restarted (docker compose up -d, which recreates the
#   container because its environment changed), but only if it was running.
#   Later page updates (a new design, new branding) replace the file alone:
#   Jinja2 re-reads a changed template, so no further restart is needed.
#
# SECRETS. .env holds the panel's database URL, admin credentials and more.
# This adapter reads it only to find the two keys above; it never prints it,
# never copies it outside its own directory (the atomic rewrite stages a copy
# beside it, with the same mode), and never puts any of it in a snapshot.
# ---------------------------------------------------------------------------

# The capability set, LC_ALL=C order, every token backed by code below.
RT_PANEL_PASARGUARD_CAPABILITIES="env_activation file_placement live_verify selection_read selection_write service_control static_verify"

# Locations. Overridable (tests, a non-default APP_NAME), never derived from
# panel output. Read at call time, so a test may set them after sourcing.
: "${RT_PG_APP_DIR:=/opt/pasarguard}"
: "${RT_PG_DATA_DIR:=/var/lib/pasarguard}"
: "${RT_PG_CLI:=/usr/local/bin/pasarguard}"
: "${RT_PG_PROJECT:=pasarguard}"
: "${RT_PG_UNIT:=pasarguard.service}"

RT_PG_SUBDIR="row-template"
RT_PG_PAGE="row-template/index.html"
RT_PG_KEY_PAGE="SUBSCRIPTION_PAGE_TEMPLATE"
RT_PG_KEY_DIR="CUSTOM_TEMPLATES_DIRECTORY"
RT_PG_BLOCK_OPEN="# >>> row-template (managed by Row-Template; do not edit)"
RT_PG_BLOCK_CLOSE="# <<< row-template <<<"

# --- environment ------------------------------------------------------------

rt_panel_pasarguard_compose() { printf '%s' "$RT_PG_APP_DIR/docker-compose.yml"; }

rt_panel_pasarguard_compose_ok() {
  # 0 when the compose file exists and runs PasarGuard's own image.
  local f; f="$(rt_panel_pasarguard_compose)"
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  LC_ALL=C grep -Eq '^[[:space:]]*image:[[:space:]]*["'"'"']?(docker\.io/)?pasarguard/panel([:@"'"'"'[:space:]]|$)' "$f" 2>/dev/null
}

rt_panel_pasarguard_unit_ok() {
  # 0 when a pasarguard systemd unit is registered. No `grep -q` on a pipe:
  # under pipefail, grep -q closing early SIGPIPEs systemctl (see rt_detect_xui).
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl list-unit-files 2>/dev/null | LC_ALL=C grep "^${RT_PG_UNIT//./\\.}" >/dev/null 2>&1
}

rt_panel_pasarguard_mode() {
  # docker | systemd | none. Docker wins: it is the official layout.
  if rt_panel_pasarguard_compose_ok; then printf 'docker'; return 0; fi
  if rt_panel_pasarguard_unit_ok; then printf 'systemd'; return 0; fi
  printf 'none'
}

rt_panel_pasarguard_env() {
  # echo the .env the panel reads. Docker reads APP_DIR/.env (env_file);
  # a source install reads .env from the unit's WorkingDirectory.
  local wd
  if [ "$(rt_panel_pasarguard_mode)" = "systemd" ]; then
    wd="$(systemctl show -p WorkingDirectory --value "$RT_PG_UNIT" 2>/dev/null || true)"
    if [ -n "$wd" ] && [ -f "$wd/.env" ]; then printf '%s' "$wd/.env"; return 0; fi
  fi
  printf '%s' "$RT_PG_APP_DIR/.env"
}

rt_panel_pasarguard_env_ready() {
  # 0 when the .env exists as a regular file we may edit.
  local e; e="$(rt_panel_pasarguard_env)"
  [ -f "$e" ] && [ ! -L "$e" ]
}

# --- .env reading (as data; nothing is sourced or evaluated) ----------------

rt_panel_pasarguard_env_get() {
  # rt_panel_pasarguard_env_get KEY [outside]
  #
  # Echo the value the panel will read for KEY (rt_dotenv_get: last assignment
  # wins). With "outside", our managed block is ignored -- the operator's own
  # value. Exit 0 with the value (possibly empty) when KEY is assigned, 3 when
  # it is not: "unset" and "set to empty" are different facts, and a restore
  # needs both.
  local key="$1" outside="${2:-}"
  if [ -n "$outside" ]; then
    rt_dotenv_get "$(rt_panel_pasarguard_env)" "$key" "$RT_PG_BLOCK_OPEN" "$RT_PG_BLOCK_CLOSE"
  else
    rt_dotenv_get "$(rt_panel_pasarguard_env)" "$key"
  fi
}

rt_panel_pasarguard_block_state() {
  # absent | present | malformed. Present means exactly one opening and one
  # closing marker, in that order. Anything else is not ours to interpret.
  local env n_open n_close
  env="$(rt_panel_pasarguard_env)"
  [ -f "$env" ] || { printf 'absent'; return 0; }
  n_open="$(LC_ALL=C grep -Fc "$RT_PG_BLOCK_OPEN" "$env" 2>/dev/null || true)"
  n_close="$(LC_ALL=C grep -Fxc "$RT_PG_BLOCK_CLOSE" "$env" 2>/dev/null || true)"
  if [ "${n_open:-0}" = "0" ] && [ "${n_close:-0}" = "0" ]; then printf 'absent'; return 0; fi
  if [ "$n_open" = "1" ] && [ "$n_close" = "1" ]; then
    local lo lc
    # grep -m1 stops at the first match itself: no pipe into head to be cut short
    lo="$(LC_ALL=C grep -Fn -m1 "$RT_PG_BLOCK_OPEN" "$env" | cut -d: -f1)"
    lc="$(LC_ALL=C grep -Fxn -m1 "$RT_PG_BLOCK_CLOSE" "$env" | cut -d: -f1)"
    if [ -n "$lo" ] && [ -n "$lc" ] && [ "$lo" -lt "$lc" ]; then printf 'present'; return 0; fi
  fi
  printf 'malformed'
}

rt_panel_pasarguard_block_value() {
  # Echo KEY's value inside our block, empty when the block does not set it.
  local key="$1" env
  env="$(rt_panel_pasarguard_env)"
  RT_K="$key" RT_BO="$RT_PG_BLOCK_OPEN" RT_BC="$RT_PG_BLOCK_CLOSE" LC_ALL=C awk '
    BEGIN { want = ENVIRON["RT_K"]; bo = ENVIRON["RT_BO"]; bc = ENVIRON["RT_BC"]; inb = 0 }
    { line = $0; sub(/\r$/, "", line) }
    index(line, bo) == 1 { inb = 1; next }
    line == bc { inb = 0; next }
    inb {
      eq = index(line, "="); if (eq == 0) next
      k = substr(line, 1, eq - 1); sub(/[ \t]+$/, "", k)
      if (k != want) next
      v = substr(line, eq + 1); sub(/^[ \t]+/, "", v); gsub(/"/, "", v)
      printf "%s", v
    }
  ' "$env" 2>/dev/null || true
}

# --- .env writing (atomic, mode-preserving, block only) ---------------------

rt_panel_pasarguard_path_ok() {
  # A path we are willing to write into .env: absolute, and only characters
  # that need no quoting or escaping in any dotenv dialect.
  case "${1:-}" in
    /*) : ;;
    *) return 1 ;;
  esac
  case "$1" in
    *[!A-Za-z0-9._/-]*|*//*|*/../*|*/..|*/./*) return 1 ;;
  esac
  return 0
}

rt_panel_pasarguard_env_rewrite() {
  # rt_panel_pasarguard_env_rewrite MODE [DIR]
  #   MODE=remove           drop our block (restoring a missing final newline)
  #   MODE=write DIR|""     replace our block with one selecting our page; DIR
  #                         is written as CUSTOM_TEMPLATES_DIRECTORY when given
  # Staged beside the file with the file's own mode, then renamed over it, so
  # the panel never reads a half-written .env.
  local mode="$1" dir="${2:-}" env tmp nl=0 perm
  env="$(rt_panel_pasarguard_env)"
  [ -f "$env" ] && [ ! -L "$env" ] || { rt_err "panel pasarguard: .env is missing or a symlink: $env"; return 1; }
  case "$(rt_panel_pasarguard_block_state)" in
    malformed) rt_err "panel pasarguard: the Row-Template block in $env is damaged; fix or remove it by hand"; return 1 ;;
  esac
  perm="$(stat -c '%a' "$env" 2>/dev/null || echo 600)"
  tmp="$(mktemp "$(dirname "$env")/.env.row-template.XXXXXX")" || return 1
  chmod 600 "$tmp" 2>/dev/null || true

  # 1. the file without our block, every other byte as it was -- including a
  #    last line that has no newline (awk would otherwise add one). A block
  #    written with nl=1 had itself added the newline before it; removing the
  #    block removes that newline again -- but only while the block is still
  #    the end of the file. A line the operator added after it owns it now.
  local nonl=0
  if [ -s "$env" ] && [ "$(tail -c 1 "$env" | od -An -c | tr -d ' ')" != '\n' ]; then nonl=1; fi
  RT_BO="$RT_PG_BLOCK_OPEN" RT_BC="$RT_PG_BLOCK_CLOSE" RT_NONL="$nonl" LC_ALL=C awk '
    BEGIN { bo = ENVIRON["RT_BO"]; bc = ENVIRON["RT_BC"]; nonl = (ENVIRON["RT_NONL"] == "1")
            inb = 0; n = 0; strip = 0; closed = 0; lastkept = 0 }
    { line = $0; raw = $0; sub(/\r$/, "", line) }
    index(line, bo) == 1 { inb = 1; lastkept = 0; if (index(line, " nl=1 ") > 0) strip = 1; next }
    line == bc { inb = 0; closed = 1; lastkept = 0; next }
    inb { lastkept = 0; next }
    closed { strip = 0 }
    { buf[++n] = raw; lastkept = 1 }
    END {
      for (i = 1; i <= n; i++) {
        if (i == n && (strip || (nonl && lastkept))) printf "%s", buf[i]; else printf "%s\n", buf[i]
      }
    }
  ' "$env" > "$tmp" || { rm -f "$tmp"; return 1; }

  # 2. our block, appended.
  if [ "$mode" = "write" ]; then
    if [ -s "$tmp" ] && [ "$(tail -c 1 "$tmp" | od -An -c | tr -d ' ')" != '\n' ]; then
      printf '\n' >> "$tmp"; nl=1
    fi
    {
      printf '%s nl=%s >>>\n' "$RT_PG_BLOCK_OPEN" "$nl"
      [ -n "$dir" ] && printf '%s = "%s"\n' "$RT_PG_KEY_DIR" "$dir"
      printf '%s = "%s"\n' "$RT_PG_KEY_PAGE" "$RT_PG_PAGE"
      printf '%s\n' "$RT_PG_BLOCK_CLOSE"
    } >> "$tmp" || { rm -f "$tmp"; return 1; }
  fi

  chmod "$perm" "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$env" || { rm -f "$tmp"; return 1; }
  return 0
}

# --- where the page goes ------------------------------------------------------

rt_panel_pasarguard_operator_dir() {
  # The operator's own CUSTOM_TEMPLATES_DIRECTORY (outside our block), trailing
  # slash removed; empty when unset or empty.
  local v rc=0
  v="$(rt_panel_pasarguard_env_get "$RT_PG_KEY_DIR" outside)" || rc=$?
  [ "$rc" -eq 0 ] || return 0
  v="${v%/}"
  printf '%s' "$v"
}

rt_panel_pasarguard_root() {
  # Echo the templates root the page goes into: the operator's directory, else
  # DATA_DIR/templates. In Docker the path must lie inside the bind-mounted
  # DATA_DIR, the only place the host and the container see the same file;
  # anything else is refused rather than guessed.
  local root
  root="$(rt_panel_pasarguard_operator_dir)"
  [ -n "$root" ] || root="${RT_PG_DATA_DIR%/}/templates"
  rt_panel_pasarguard_path_ok "$root" || {
    rt_err "panel pasarguard: CUSTOM_TEMPLATES_DIRECTORY is not a plain absolute path: $root"; return 1; }
  if [ "$(rt_panel_pasarguard_mode)" = "docker" ] && ! rt_is_within "$RT_PG_DATA_DIR" "$root"; then
    rt_err "panel pasarguard: $root is outside $RT_PG_DATA_DIR, the directory the container shares with the host"
    return 1
  fi
  printf '%s' "$root"
}

rt_panel_pasarguard_is_ours() {
  # 0 when FILE is a page Row-Template generated for PasarGuard: our structural
  # markers AND our prelude. Ownership is proven, never assumed.
  local f="$1"
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  LC_ALL=C grep -Fq '/* row:branding */' "$f" 2>/dev/null || return 1
  LC_ALL=C grep -Fq 'Row-Template -> PasarGuard page context' "$f" 2>/dev/null || return 1
  return 0
}

rt_panel_pasarguard_shell_ok() {
  # 0 when FILE is a PasarGuard shell this release can serve safely: valid, with
  # the context prelude and the autoescape block. A shell from a release before
  # 1.3.0 has neither -- it would render empty and unescaped -- and is refused.
  local f="$1"
  rt_validate_template "$f" >/dev/null 2>&1 || return 1
  LC_ALL=C grep -Fq 'Row-Template -> PasarGuard page context' "$f" 2>/dev/null || return 1
  LC_ALL=C grep -Fq '{%- autoescape true -%}' "$f" 2>/dev/null || return 1
  LC_ALL=C grep -Fq '{%- endautoescape %}' "$f" 2>/dev/null || return 1
  return 0
}

# --- the service ----------------------------------------------------------------

rt_panel_pasarguard_container() {
  # Echo the running panel container's name, or nothing. Found by its compose
  # project label and its image, never by a name we assume.
  command -v docker >/dev/null 2>&1 || return 0
  docker ps --filter "label=com.docker.compose.project=$RT_PG_PROJECT" --format '{{.Names}} {{.Image}}' 2>/dev/null \
    | LC_ALL=C awk '$2 ~ /^(docker\.io\/)?pasarguard\/panel([:@]|$)/ { print $1; exit }' || true
}

rt_panel_pasarguard_running() {
  case "$(rt_panel_pasarguard_mode)" in
    docker)  [ -n "$(rt_panel_pasarguard_container)" ] ;;
    systemd) systemctl is-active --quiet "$RT_PG_UNIT" 2>/dev/null ;;
    *)       return 1 ;;
  esac
}

rt_panel_pasarguard_apply() {
  # Make a changed .env take effect: recreate the container (compose sees the
  # environment changed) or restart the unit. Only when the panel is running:
  # a stopped panel picks the change up when its operator starts it.
  rt_panel_pasarguard_running || return 0
  case "$(rt_panel_pasarguard_mode)" in
    docker)
      command -v docker >/dev/null 2>&1 || return 1
      rt_info "Restarting PasarGuard to apply the subscription page setting..." >&2
      docker compose -f "$(rt_panel_pasarguard_compose)" -p "$RT_PG_PROJECT" up -d >/dev/null 2>&1 || return 1 ;;
    systemd)
      rt_info "Restarting PasarGuard to apply the subscription page setting..." >&2
      systemctl restart "$RT_PG_UNIT" >/dev/null 2>&1 || return 1 ;;
  esac
  return 0
}

# --- what the database can still override (read-only) ------------------------
# Two panel settings live in PasarGuard's database, not in .env, and both win
# over the selected page: an admin's own `sub_template` (their users get that
# page instead) and the subscription setting `disable_sub_template` (browsers
# get the raw subscription, no page at all). Row-Template never changes either
# -- they are the operator's choices -- but verify says when one applies, so a
# page that "does not show" is explained. Read-only, SQLite only; the database
# URL is read for its path and never printed (a server URL carries a password).

rt_panel_pasarguard_db() {
  # Echo the host path of PasarGuard's SQLite database, or fail.
  local env url path rc=0
  env="$(rt_panel_pasarguard_env)"
  [ -f "$env" ] && [ ! -L "$env" ] || return 1
  url="$(rt_dotenv_get "$env" SQLALCHEMY_DATABASE_URL)" || rc=$?
  [ "$rc" -eq 0 ] && [ -n "$url" ] || return 1
  case "$url" in
    sqlite:///*|sqlite+*:///*) path="${url#*:///}" ;;
    *) return 1 ;;                                       # PostgreSQL/MySQL: not read
  esac
  path="${path%%\?*}"
  case "$path" in
    /*) : ;;
    *) [ "$(rt_panel_pasarguard_mode)" = "systemd" ] || return 1   # relative: inside the image
       path="$(dirname -- "$env")/$path" ;;
  esac
  if [ "$(rt_panel_pasarguard_mode)" = "docker" ]; then
    rt_is_within "$RT_PG_DATA_DIR" "$path" || return 1
  fi
  rt_is_sqlite_db "$path" || return 1
  printf '%s' "$path"
}

rt_panel_pasarguard_db_notes() {
  # Warn (never fail) about the two overrides above. Silent when they cannot be
  # read: this is advice, and verify's pass/fail does not depend on it.
  local db n off
  command -v sqlite3 >/dev/null 2>&1 || return 0
  db="$(rt_panel_pasarguard_db)" || return 0
  n="$(sqlite3 -readonly -cmd '.timeout 5000' "$db" \
    "SELECT COUNT(*) FROM admins WHERE sub_template IS NOT NULL AND sub_template <> '';" 2>/dev/null)" || n=0
  case "${n:-}" in ''|*[!0-9]*) n=0 ;; esac
  [ "$n" = "0" ] \
    || rt_warn "panel pasarguard: $n admin(s) set their own subscription page (sub_template); their users keep that page."
  off="$(sqlite3 -readonly -cmd '.timeout 5000' "$db" \
    "SELECT json_extract(subscription, '\$.disable_sub_template') FROM settings ORDER BY id LIMIT 1;" 2>/dev/null)" || off=""
  case "$off" in
    1|true|True)
      rt_warn "panel pasarguard: the panel's 'disable subscription template' setting is on, so browsers get the raw subscription instead of any page." ;;
  esac
  return 0
}

# --- the frozen verbs --------------------------------------------------------------

rt_panel_pasarguard_detect() {
  # READ-ONLY. Two independent signals must agree (interface.sh):
  #   A  the .env the official installer writes
  #   B  a compose file running pasarguard/panel, or a pasarguard systemd unit
  #   C  the pasarguard management CLI
  #   D  the data directory
  local signals=0 env
  env="$RT_PG_APP_DIR/.env"
  [ -f "$env" ] && [ ! -L "$env" ] && signals=$((signals + 1))
  if rt_panel_pasarguard_compose_ok || rt_panel_pasarguard_unit_ok; then signals=$((signals + 1)); fi
  if [ -x "$RT_PG_CLI" ] && [ ! -d "$RT_PG_CLI" ] \
     && LC_ALL=C grep -q 'pasarguard' "$RT_PG_CLI" 2>/dev/null; then
    signals=$((signals + 1))
  fi
  [ -d "$RT_PG_DATA_DIR" ] && [ ! -L "$RT_PG_DATA_DIR" ] && signals=$((signals + 1))
  if [ "$signals" -ge 2 ]; then return "$RT_PANEL_OK"; fi
  if [ "$signals" -eq 1 ]; then return "$RT_PANEL_FAIL"; fi
  return "$RT_PANEL_NOT_APPLICABLE"
}

rt_panel_pasarguard_capabilities() {
  local t
  for t in $RT_PANEL_PASARGUARD_CAPABILITIES; do printf '%s\n' "$t"; done
  return "$RT_PANEL_OK"
}

rt_panel_pasarguard_backup_state() {
  # Stage the pre-change state through the P2 writer:
  #   selection  the effective SUBSCRIPTION_PAGE_TEMPLATE (absent|empty|present)
  #   meta       mechanism=env, was_running
  #   files      the page, when THIS change will create it (a page that is
  #              already there and ours is replaced in place, not recorded)
  #   aux        block=<absent|present>, dir=<our block's directory>, and
  #              root_created=1 when the templates root does not exist yet
  local panel="$1" state value="" rc=0 was_running=0 root page block files=()
  rt_panel_pasarguard_env_ready || return "$RT_PANEL_UNAVAILABLE"
  root="$(rt_panel_pasarguard_root)" || return "$RT_PANEL_FAIL"
  block="$(rt_panel_pasarguard_block_state)"
  [ "$block" = "malformed" ] && { rt_err "panel pasarguard: the Row-Template block in .env is damaged"; return "$RT_PANEL_FAIL"; }
  rt_panel_pasarguard_running && was_running=1

  value="$(rt_panel_pasarguard_env_get "$RT_PG_KEY_PAGE")" || rc=$?
  if [ "$rc" -eq 3 ]; then state="absent"; value=""
  elif [ "$rc" -ne 0 ]; then return "$RT_PANEL_FAIL"
  elif [ -z "$value" ]; then state="empty"
  else state="present"; fi

  page="$root/$RT_PG_PAGE"
  [ -e "$page" ] || [ -L "$page" ] || files+=("$RT_PG_PAGE")

  rt_backup_panel_write "$RT_PANEL_STAGE" "$panel" "$state" "$value" env "$was_running" ${files[@]+"${files[@]}"} \
    || return "$RT_PANEL_FAIL"
  rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" block "$block" || return "$RT_PANEL_FAIL"
  rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" dir "$(rt_panel_pasarguard_block_value "$RT_PG_KEY_DIR")" \
    || return "$RT_PANEL_FAIL"
  rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" root "$root" || return "$RT_PANEL_FAIL"
  if [ ! -d "$root" ]; then
    rt_backup_panel_aux_set "$RT_PANEL_STAGE" "$panel" root_created 1 || return "$RT_PANEL_FAIL"
  fi
  return "$RT_PANEL_OK"
}

rt_panel_pasarguard_place() {
  # Copy SRC to <root>/row-template/index.html atomically. Refuses a symlinked
  # directory, and a page there that is not Row-Template's.
  local src="$1" root="$2" dir dest tmp
  dir="$root/$RT_PG_SUBDIR"; dest="$root/$RT_PG_PAGE"
  [ -L "$root" ] && { rt_err "panel pasarguard: the templates directory is a symlink: $root"; return 1; }
  [ -L "$dir" ] && { rt_err "panel pasarguard: $dir is a symlink"; return 1; }
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    rt_panel_pasarguard_is_ours "$dest" \
      || { rt_err "panel pasarguard: $dest exists and is not Row-Template's; it was left untouched"; return 1; }
  fi
  mkdir -p "$dir" || return 1
  chmod 755 "$dir" 2>/dev/null || true
  tmp="$(mktemp "$dir/.index.XXXXXX")" || return 1
  cp -- "$src" "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$dest" || { rm -f "$tmp"; return 1; }
  return 0
}

rt_panel_pasarguard_install_template() {
  # Place SOURCE (the generated page) and select it. Idempotent: on a panel
  # where Row-Template is already selected only the page is replaced, and the
  # panel is not restarted.
  local panel="$1" src="$2" root dir_value="" before after
  [ -n "$src" ] || { rt_err "panel pasarguard: SOURCE is required"; return "$RT_PANEL_FAIL"; }
  [ -L "$src" ] && { rt_err "panel pasarguard: refusing a symlinked SOURCE"; return "$RT_PANEL_FAIL"; }
  [ -f "$src" ] || { rt_err "panel pasarguard: SOURCE is not a regular file: $src"; return "$RT_PANEL_FAIL"; }
  rt_is_within "$RT_ROOT" "$src" || { rt_err "panel pasarguard: SOURCE is outside $RT_ROOT"; return "$RT_PANEL_FAIL"; }
  rt_panel_pasarguard_shell_ok "$src" || {
    rt_err "panel pasarguard: SOURCE is not a PasarGuard page this release can serve"; return "$RT_PANEL_FAIL"; }
  rt_panel_pasarguard_env_ready || return "$RT_PANEL_UNAVAILABLE"
  root="$(rt_panel_pasarguard_root)" || return "$RT_PANEL_FAIL"

  rt_panel_pasarguard_place "$src" "$root" || return "$RT_PANEL_FAIL"

  [ -n "$(rt_panel_pasarguard_operator_dir)" ] || dir_value="$root"
  before="$(rt_panel_pasarguard_block_state):$(rt_panel_pasarguard_block_value "$RT_PG_KEY_DIR")"
  after="present:$dir_value"
  if [ "$before" != "$after" ] || [ "$(rt_panel_pasarguard_env_get "$RT_PG_KEY_PAGE" || true)" != "$RT_PG_PAGE" ]; then
    rt_panel_pasarguard_env_rewrite write "$dir_value" || return "$RT_PANEL_FAIL"
    rt_panel_pasarguard_apply || { rt_err "panel pasarguard: the panel could not be restarted"; return "$RT_PANEL_FAIL"; }
  fi
  return "$RT_PANEL_OK"
}

rt_panel_pasarguard_selected() {
  # 0 when .env (as the panel will read it) selects our page from our root.
  local root page dir
  [ "$(rt_panel_pasarguard_block_state)" = "present" ] || return 1
  page="$(rt_panel_pasarguard_env_get "$RT_PG_KEY_PAGE" 2>/dev/null)" || return 1
  [ "$page" = "$RT_PG_PAGE" ] || return 1
  root="$(rt_panel_pasarguard_root 2>/dev/null)" || return 1
  dir="$(rt_panel_pasarguard_env_get "$RT_PG_KEY_DIR" 2>/dev/null || true)"
  [ "${dir%/}" = "$root" ] || return 1
  return 0
}

rt_panel_pasarguard_verify() {
  # static: the canonical shell, the generated page, the placed copy and the
  #         selection all agree. live: the RUNNING container reads our
  #         selection and can see the page (Docker only).
  local panel="$1" mode="$2" root dest want name page
  case "$mode" in
    static|live) : ;;
    *) rt_err "panel pasarguard: unknown verification mode '$mode'"; return "$RT_PANEL_FAIL" ;;
  esac
  if [ "$mode" = "live" ]; then
    [ "$(rt_panel_pasarguard_mode)" = "docker" ] || return "$RT_PANEL_UNAVAILABLE"
    name="$(rt_panel_pasarguard_container)"
    [ -n "$name" ] || return "$RT_PANEL_UNAVAILABLE"
    root="$(rt_panel_pasarguard_root 2>/dev/null)" || return "$RT_PANEL_FAIL"
    page="$(docker exec "$name" printenv "$RT_PG_KEY_PAGE" 2>/dev/null || true)"
    [ "$page" = "$RT_PG_PAGE" ] || { rt_err "panel pasarguard: the running panel does not use the Row-Template page yet (restart it)"; return "$RT_PANEL_FAIL"; }
    docker exec "$name" test -f "$root/$RT_PG_PAGE" >/dev/null 2>&1 \
      || { rt_err "panel pasarguard: the running panel cannot see $root/$RT_PG_PAGE"; return "$RT_PANEL_FAIL"; }
    return "$RT_PANEL_OK"
  fi

  [ -f "$RT_DIST" ] || { rt_err "panel pasarguard: the artifact is missing: $RT_DIST"; return "$RT_PANEL_FAIL"; }
  rt_panel_pasarguard_shell_ok "$RT_DIST" \
    || { rt_err "panel pasarguard: the artifact is not a valid PasarGuard page"; return "$RT_PANEL_FAIL"; }
  if [ -f "$RT_DIST_SUM" ]; then
    want="$(LC_ALL=C awk '{print $1; exit}' "$RT_DIST_SUM" 2>/dev/null || true)"
    rt_verify_sha256 "$RT_DIST" "$want" >/dev/null 2>&1 \
      || { rt_err "panel pasarguard: the artifact does not match its recorded checksum"; return "$RT_PANEL_FAIL"; }
  fi
  rt_validate_template "$RT_LIVE" >/dev/null 2>&1 \
    || { rt_err "panel pasarguard: the generated page is missing or invalid: $RT_LIVE"; return "$RT_PANEL_FAIL"; }
  root="$(rt_panel_pasarguard_root)" || return "$RT_PANEL_FAIL"
  dest="$root/$RT_PG_PAGE"
  rt_panel_pasarguard_is_ours "$dest" \
    || { rt_err "panel pasarguard: the page is not in place: $dest"; return "$RT_PANEL_FAIL"; }
  [ "$(rt_sha256 "$dest" 2>/dev/null || true)" = "$(rt_sha256 "$RT_LIVE" 2>/dev/null || true)" ] \
    || { rt_err "panel pasarguard: the placed page differs from the generated one"; return "$RT_PANEL_FAIL"; }
  rt_panel_pasarguard_selected \
    || { rt_err "panel pasarguard: .env does not select the Row-Template page"; return "$RT_PANEL_FAIL"; }
  rt_panel_pasarguard_db_notes
  return "$RT_PANEL_OK"
}

rt_panel_pasarguard_remove_page() {
  # Remove our page from ROOT, then our directory and the root itself only when
  # each is left empty (the root only when ROOT_CREATED says we made it).
  local root="$1" root_created="${2:-0}" dest
  dest="$root/$RT_PG_PAGE"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    rt_panel_pasarguard_is_ours "$dest" || { rt_warn "panel pasarguard: $dest is not Row-Template's; left in place"; return 0; }
    rm -f -- "$dest" || return 1
  fi
  rmdir -- "$root/$RT_PG_SUBDIR" 2>/dev/null || true
  if [ "$root_created" = "1" ]; then rmdir -- "$root" 2>/dev/null || true; fi
  return 0
}

rt_panel_pasarguard_restore_state() {
  # Validate the record, put .env's block back the way it was, remove the page
  # this change created, restore the running/stopped state.
  local panel="$1" snap="$2" st mech was_running files f block dir root created
  local rc now_block now_page want_page
  st="$(rt_backup_panel_state "$snap" "$panel")" || { rt_err "panel pasarguard: malformed selection.state"; return "$RT_PANEL_FAIL"; }
  case "$st" in absent|empty|present) : ;; *) return "$RT_PANEL_FAIL" ;; esac
  rt_backup_panel_meta_check "$snap" "$panel" || { rt_err "panel pasarguard: malformed panel meta"; return "$RT_PANEL_FAIL"; }
  mech="$(rt_manifest_get mechanism "$snap/panels/$panel/meta")"
  [ "$mech" = "env" ] || { rt_err "panel pasarguard: mechanism is '$mech', expected 'env'"; return "$RT_PANEL_FAIL"; }
  was_running="$(rt_manifest_get was_running "$snap/panels/$panel/meta")"
  files="$(rt_backup_panel_files "$snap" "$panel")" || { rt_err "panel pasarguard: malformed files record"; return "$RT_PANEL_FAIL"; }
  for f in $files; do
    [ "$f" = "$RT_PG_PAGE" ] || { rt_err "panel pasarguard: refusing to restore: the record lists a file this adapter never places: $f"; return "$RT_PANEL_FAIL"; }
  done
  block="$(rt_backup_panel_aux "$snap" "$panel" block)" || return "$RT_PANEL_FAIL"
  case "$block" in absent|present) : ;; *) rt_err "panel pasarguard: malformed block record"; return "$RT_PANEL_FAIL" ;; esac
  dir="$(rt_backup_panel_aux "$snap" "$panel" dir)" || return "$RT_PANEL_FAIL"
  root="$(rt_backup_panel_aux "$snap" "$panel" root)" || return "$RT_PANEL_FAIL"
  created="$(rt_backup_panel_aux "$snap" "$panel" root_created)" || return "$RT_PANEL_FAIL"
  rt_panel_pasarguard_path_ok "$root" || { rt_err "panel pasarguard: malformed root record"; return "$RT_PANEL_FAIL"; }
  [ -z "$dir" ] || rt_panel_pasarguard_path_ok "$dir" || { rt_err "panel pasarguard: malformed dir record"; return "$RT_PANEL_FAIL"; }

  rt_panel_pasarguard_env_ready || return "$RT_PANEL_UNAVAILABLE"
  if [ "$block" = "absent" ]; then
    rt_panel_pasarguard_env_rewrite remove || return "$RT_PANEL_FAIL"
  else
    rt_panel_pasarguard_env_rewrite write "$dir" || return "$RT_PANEL_FAIL"
  fi

  # --- the restore is not done until it is CHECKED ---------------------------
  # interface.sh fixes the meaning of this function's SUCCESS: "operation
  # completed AND its required verification passed". The transaction engine's
  # rollback relies on exactly that and deliberately does NOT re-run a forward
  # check of its own -- after a correct rollback this panel no longer selects
  # Row-Template, so a forward check would fail by design and report a good
  # rollback as a broken one. This comparison with the record is therefore the
  # whole evidence that the rollback landed.
  #
  # The block's shape is checked first, then the effective value the panel will
  # read for the page key. "unset" and "set to empty" are different facts (the
  # P2 record distinguishes absent from empty), so the exit status is compared
  # too, not only the text.
  now_block="$(rt_panel_pasarguard_block_state)"
  [ "$now_block" = "$block" ] || {
    rt_err "panel pasarguard: after restoring, the Row-Template block is '$now_block', expected '$block'"
    return "$RT_PANEL_FAIL"; }
  if [ "$block" = "present" ]; then
    [ "$(rt_panel_pasarguard_block_value "$RT_PG_KEY_DIR")" = "$dir" ] || {
      rt_err "panel pasarguard: after restoring, the block's directory is not the recorded value"
      return "$RT_PANEL_FAIL"; }
  fi
  want_page=""
  if [ "$st" = "present" ]; then want_page="$(rt_backup_panel_selection "$snap" "$panel")"; fi
  rc=0
  now_page="$(rt_panel_pasarguard_env_get "$RT_PG_KEY_PAGE")" || rc=$?
  case "$st" in
    absent)
      [ "$rc" -eq 3 ] || {
        rt_err "panel pasarguard: after restoring, $RT_PG_KEY_PAGE is set, but the record says it was unset"
        return "$RT_PANEL_FAIL"; } ;;
    *)
      [ "$rc" -eq 0 ] && [ "$now_page" = "$want_page" ] || {
        rt_err "panel pasarguard: after restoring, $RT_PG_KEY_PAGE is not the recorded value"
        return "$RT_PANEL_FAIL"; } ;;
  esac

  if [ -n "$files" ]; then
    rt_panel_pasarguard_remove_page "$root" "${created:-0}" || return "$RT_PANEL_FAIL"
  fi
  if [ "$was_running" = "1" ]; then
    rt_panel_pasarguard_apply || return "$RT_PANEL_FAIL"
  fi
  return "$RT_PANEL_OK"
}

rt_panel_pasarguard_uninstall_template() {
  # Remove our block and our page; restart the panel if it is running so it
  # goes back to the page it had. NOT_APPLICABLE when neither is present.
  local root block dest removed=0 created=0
  rt_panel_pasarguard_env_ready || return "$RT_PANEL_UNAVAILABLE"
  block="$(rt_panel_pasarguard_block_state)"
  [ "$block" = "malformed" ] && { rt_err "panel pasarguard: the Row-Template block in .env is damaged; fix or remove it by hand"; return "$RT_PANEL_FAIL"; }
  root="$(rt_panel_pasarguard_root 2>/dev/null)" || root=""
  # the root our block pointed at is the one the page lives in
  if [ "$block" = "present" ]; then
    local d; d="$(rt_panel_pasarguard_block_value "$RT_PG_KEY_DIR")"
    if [ -n "$d" ] && rt_panel_pasarguard_path_ok "$d"; then root="$d"; created=1; fi
  fi
  if [ "$block" = "present" ]; then
    rt_panel_pasarguard_env_rewrite remove || return "$RT_PANEL_FAIL"
    removed=1
  fi
  if [ -n "$root" ]; then
    dest="$root/$RT_PG_PAGE"
    if rt_panel_pasarguard_is_ours "$dest"; then
      rt_panel_pasarguard_remove_page "$root" "$created" || return "$RT_PANEL_FAIL"
      removed=1
    fi
  fi
  [ "$removed" -eq 1 ] || return "$RT_PANEL_NOT_APPLICABLE"
  rt_panel_pasarguard_apply || { rt_err "panel pasarguard: the panel could not be restarted"; return "$RT_PANEL_FAIL"; }
  return "$RT_PANEL_OK"
}

# --- outside the transaction: refresh and status ----------------------------
# Not part of the seven transactional verbs. `refresh` replaces the page after
# the operator changes branding or design -- the selection is not touched, so
# an operator who deselected Row-Template stays deselected. `status` is for the
# dashboard. Both are reached through rt_panel_refresh_page / rt_panel_status
# in installer/panels/index.sh.

rt_panel_pasarguard_refresh() {
  # rt_panel_pasarguard_refresh SOURCE [place]
  # 0 page replaced | 3 no page of ours is placed (and `place` not given) |
  # 2 .env unavailable | 1 failure
  local src="$1" place="${2:-}" root
  rt_panel_pasarguard_env_ready || return "$RT_PANEL_UNAVAILABLE"
  rt_panel_pasarguard_shell_ok "$src" || return "$RT_PANEL_FAIL"
  # Before activation there is nothing to refresh -- and no reason to resolve
  # (let alone reject) a templates directory Row-Template has not used yet.
  if [ -z "$place" ] && [ "$(rt_panel_pasarguard_block_state)" != "present" ]; then
    return "$RT_PANEL_NOT_APPLICABLE"
  fi
  root="$(rt_panel_pasarguard_root)" || return "$RT_PANEL_FAIL"
  if [ -z "$place" ] && ! rt_panel_pasarguard_is_ours "$root/$RT_PG_PAGE"; then
    return "$RT_PANEL_NOT_APPLICABLE"
  fi
  rt_panel_pasarguard_place "$src" "$root" || return "$RT_PANEL_FAIL"
  return "$RT_PANEL_OK"
}

rt_panel_pasarguard_status() {
  # active | inactive | unknown
  local root
  rt_panel_pasarguard_env_ready || { printf 'unknown'; return 0; }
  root="$(rt_panel_pasarguard_root 2>/dev/null)" || { printf 'unknown'; return 0; }
  if rt_panel_pasarguard_is_ours "$root/$RT_PG_PAGE" && rt_panel_pasarguard_selected; then
    printf 'active'
  else
    printf 'inactive'
  fi
}
