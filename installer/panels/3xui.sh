#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# installer/panels/3xui.sh -- the real 3X-UI panel adapter (P5A).
#
# THE FIRST REAL IMPLEMENTATION behind the frozen P3 interface. It is sourced by
# installer/panels/index.sh and reached only through the seven public
# rt_panel_* entry points; the transaction engine (P4) never calls into it by
# name.
#
# WHAT 3X-UI ACTIVATION ACTUALLY IS. One settings row:
#
#     settings.subThemeDir = RT_ROOT
#
# 3X-UI's subscription page is rendered from a directory, and that directory is
# named by subThemeDir. Row-Template owns its own external root, generates
# sub.html into it, and then points the panel at it. The panel-side act is the
# SELECTION WRITE and nothing else.
#
# WHY THERE IS NO file_placement CAPABILITY. This adapter places NO file into
# the panel's own tree, so it must not claim one. The frozen P2/P3 documents say
# the same thing in their own words ("3X-UI places no file"), and the P2 `files`
# record for this panel is therefore legitimately EMPTY. P4.1 removed the
# mechanism leak that used to require file_placement by name; the apply
# requirement is now satisfied by selection_write, which is exactly the
# mechanism used here.
#
# WHY THERE IS NO live_verify CAPABILITY. Live verification would mean fetching
# the subscription the panel actually serves, which needs a client subscription
# id (a secret) and a reachable port, and is unreliable when no client exists.
# The adapter does not invent one, so rt_panel_3xui_verify live returns
# UNAVAILABLE and the capability is not declared. P4 permits a transaction to
# commit on a mandatory static pass when live verification is unavailable.
#
# SECRETS. Nothing here reads or writes a credential. The only value written is
# RT_ROOT, which is a path. The stage carries no token, no password and no
# API key, and no SQLite output is ever eval'd or sourced.
# ---------------------------------------------------------------------------

# The capability set, in LC_ALL=C order, drawn only from the frozen P3
# vocabulary. Five tokens, and every one of them is backed by code below:
#
#   db_activation     the selection lives in the panel's SQLite database
#   selection_read    subThemeDir can be read
#   selection_write   subThemeDir can be written
#   service_control   the panel service can be stopped and started
#   static_verify     correctness can be established without the panel running
RT_PANEL_3XUI_CAPABILITIES="db_activation selection_read selection_write service_control static_verify"

# The ONE settings key this adapter ever touches. It is a constant, never
# derived from input, and it is spelled exactly as upstream spells it.
# subTemplate / subTemplateDir do not exist upstream and are never used.
RT_PANEL_3XUI_SETTING_KEY="subThemeDir"

# --- environment ------------------------------------------------------------

rt_panel_3xui_resolve_unit() {
  # Resolve RT_XUI_UNIT IN THE CALLING SHELL. READ-ONLY.
  #
  # This must never be called inside a command substitution. `u="$(...)"` runs
  # it in a SUBSHELL, so the assignment to RT_XUI_UNIT is discarded with the
  # subshell -- and rt_service_active reads the GLOBAL, not a local. The result
  # is a service that is running being reported as stopped, which silently
  # records was_running=0 and then stops a panel that was up.
  #
  # An explicitly-set-but-empty RT_XUI_UNIT is TRUSTED ("no unit here") rather
  # than re-resolved, which is what lets a caller pin the no-unit case.
  if [ -z "${RT_XUI_UNIT+x}" ]; then
    rt_detect_xui >/dev/null 2>&1 || true
  fi
  return 0
}

rt_panel_3xui_db_ready() {
  # 0 when both sqlite3 and a panel database are available. READ-ONLY.
  command -v sqlite3 >/dev/null 2>&1 || return 1
  rt_detect_xui_db >/dev/null 2>&1 || return 1
  return 0
}

rt_panel_3xui_sql() {
  # Run ONE statement against the panel database.
  #
  # The statement is built by this file from fixed text plus DATA that has been
  # escaped by rt_panel_3xui_quote. Nothing here is eval'd, nothing is sourced,
  # and no output of sqlite3 is ever executed -- SQLite output is data like any
  # other file's contents.
  sqlite3 "$RT_XUI_DB" "$1"
}

rt_panel_3xui_quote() {
  # SQL single-quote escaping: every ' becomes ''. This is the ONLY escaping the
  # adapter performs, and it is applied to values that are inserted between
  # single quotes. A value that looks like SQL therefore stays a value.
  printf '%s' "${1//\'/\'\'}"
}

rt_panel_3xui_service_running() {
  # 0 when the panel service is running. False when there is no unit: with no
  # unit there is nothing this adapter may control.
  rt_panel_3xui_resolve_unit
  [ -n "${RT_XUI_UNIT:-}" ] || return 1
  rt_service_active
}

rt_panel_3xui_service_ensure() {
  # Ensure the service is running ("running") or stopped ("stopped").
  #
  # NO UNIT MEANS NO ACTION, and that is deliberate: inventing a unit, or
  # running a service command against one this host does not have, would be a
  # mutation nobody asked for. The legacy path behaves the same way -- it writes
  # the setting without service control when no unit is known.
  local want="$1"
  rt_panel_3xui_resolve_unit
  [ -n "${RT_XUI_UNIT:-}" ] || return 0
  case "$want" in
    running)
      rt_service_active && return 0
      rt_service_start || return 1 ;;
    stopped)
      rt_service_active || return 0
      rt_service_stop || return 1 ;;
    *) return 1 ;;
  esac
  return 0
}

# --- selection read/write ---------------------------------------------------

rt_panel_3xui_selection_state() {
  # Echo the selection state for the fixed key: absent | empty | present.
  #
  # The three are genuinely different, and collapsing them is the defect this
  # function exists to prevent:
  #   absent   the row did not exist -> restore REMOVES it
  #   empty    the row existed with an empty value -> restore writes empty
  #   present  the row held a value -> restore writes that exact value
  # A NULL value and an empty string are both `empty`: the frozen P2 format has
  # no third representation, and "the row existed but held nothing" is the
  # honest reading of both.
  local n v
  n="$(rt_panel_3xui_sql "SELECT COUNT(*) FROM settings WHERE key='subThemeDir';")" || return 1
  case "${n:-}" in
    ''|*[!0-9]*) return 1 ;;
  esac
  if [ "$n" -eq 0 ]; then
    printf 'absent'
    return 0
  fi
  v="$(rt_panel_3xui_sql "SELECT value FROM settings WHERE key='subThemeDir' LIMIT 1;")" || return 1
  if [ -z "$v" ]; then
    printf 'empty'
  else
    printf 'present'
  fi
  return 0
}

rt_panel_3xui_selection_value() {
  # Echo the raw stored value. Only meaningful when the state is `present`.
  rt_panel_3xui_sql "SELECT value FROM settings WHERE key='subThemeDir' LIMIT 1;"
}

rt_panel_3xui_selection_write() {
  # Set subThemeDir to VALUE, creating the row if it is not there. The key has a
  # non-unique index upstream, so the count decides between UPDATE and INSERT
  # rather than an ON CONFLICT clause that would need a unique constraint.
  local value="$1" esc n
  esc="$(rt_panel_3xui_quote "$value")"
  n="$(rt_panel_3xui_sql "SELECT COUNT(*) FROM settings WHERE key='subThemeDir';")" || return 1
  case "${n:-}" in
    ''|*[!0-9]*) return 1 ;;
  esac
  if [ "$n" -gt 0 ]; then
    rt_panel_3xui_sql "UPDATE settings SET value='$esc' WHERE key='subThemeDir';" || return 1
  else
    rt_panel_3xui_sql "INSERT INTO settings (key,value) VALUES ('subThemeDir','$esc');" || return 1
  fi
  return 0
}

rt_panel_3xui_selection_remove() {
  # Remove every subThemeDir row, and nothing else.
  rt_panel_3xui_sql "DELETE FROM settings WHERE key='subThemeDir';"
}

# --- the frozen verbs -------------------------------------------------------

rt_panel_3xui_detect() {
  # READ-ONLY. Identity from POSITIVE, CORROBORATED evidence.
  #
  # The frozen P3 contract pins the rule, and it is implemented exactly as
  # written: "Two independent signals must agree before this returns SUCCESS.
  # Where they disagree, or where only one is available, the answer is FAILURE
  # rather than a guess."
  #
  # Three independent signals, none sufficient alone:
  #   A  the panel binary is present and executable
  #   B  the panel's systemd unit is registered
  #   C  a panel database exists AND begins with the SQLite file magic
  #
  # C is deliberately stronger than "a file with the right name exists": the
  # magic is positive evidence that this is a SQLite database, so a leftover or
  # empty file cannot corroborate anything.
  #
  #   2+ signals  SUCCESS
  #   1 signal    FAILURE  -- not enough to be sure, and a wrong identification
  #                           would stage against, write to, and then restore
  #                           stale state onto a panel that was never there
  #   0 signals   NOT_APPLICABLE -- the panel is not on this host
  local signals=0 db
  rt_detect_xui >/dev/null 2>&1 || true
  [ -n "${RT_XUI_BIN:-}" ]  && signals=$((signals + 1))
  [ -n "${RT_XUI_UNIT:-}" ] && signals=$((signals + 1))
  if rt_detect_xui_db >/dev/null 2>&1; then
    db="${RT_XUI_DB:-}"
    rt_is_sqlite_db "$db" && signals=$((signals + 1))
  fi
  if [ "$signals" -ge 2 ]; then
    return "$RT_PANEL_OK"
  elif [ "$signals" -eq 1 ]; then
    return "$RT_PANEL_FAIL"
  fi
  return "$RT_PANEL_NOT_APPLICABLE"
}

rt_panel_3xui_capabilities() {
  # One token per line, LC_ALL=C order, no prose. The set is what the code
  # below actually does -- see the constant's comment for the mapping.
  local t
  for t in $RT_PANEL_3XUI_CAPABILITIES; do
    printf '%s\n' "$t"
  done
  return "$RT_PANEL_OK"
}

rt_panel_3xui_backup_state() {
  # Capture the current selection into RT_PANEL_STAGE through the P2 writer.
  #
  # `files` is EMPTY and that is the correct record: this adapter places no file
  # inside the panel's tree. RT_ROOT, sub.html and template.html are
  # Row-Template's OWN install state, not panel-side placements, and recording
  # them here would make a later rollback try to delete files it never placed.
  local panel="$1" state value="" was_running=0

  rt_panel_3xui_db_ready || return "$RT_PANEL_UNAVAILABLE"

  if rt_panel_3xui_service_running; then
    was_running=1
  fi

  state="$(rt_panel_3xui_selection_state)" || return "$RT_PANEL_FAIL"
  if [ "$state" = "present" ]; then
    value="$(rt_panel_3xui_selection_value)" || return "$RT_PANEL_FAIL"
    # A value carrying a newline cannot be represented by the frozen format:
    # `selection` holds the raw value with no terminator, so an embedded newline
    # would read back as a DIFFERENT value. FAIL CLOSED rather than normalise or
    # truncate it -- a silently altered record is a wrong restore.
    case "$value" in
      *'
'*) rt_err "panel 3xui: the stored selection contains a newline and cannot be recorded exactly"
          return "$RT_PANEL_FAIL" ;;
    esac
  fi

  # No trailing place-file arguments: `files` is written and empty.
  #
  # The first argument is the STAGE ROOT, not the panel's directory: the P2
  # writer appends "/$panel" itself, so passing "$RT_PANEL_STAGE/$panel" would
  # nest the record one level too deep and a snapshot would find nothing where
  # it looks.
  rt_backup_panel_write "$RT_PANEL_STAGE" "$panel" "$state" "$value" db "$was_running" \
    || return "$RT_PANEL_FAIL"
  return "$RT_PANEL_OK"
}

rt_panel_3xui_install_template() {
  # Apply the Row-Template selection: settings.subThemeDir = RT_ROOT.
  #
  # This is NOT file placement. SOURCE is the already-validated Row-Template
  # shell the transaction is applying, and it is checked for coherence with the
  # Row-Template-owned root rather than copied anywhere.
  #
  # The write reuses rt_subtheme_set_sqlite, the proven mechanism. That helper
  # was audited before reuse rather than assumed correct: it records whether the
  # service was active, stops it ONLY if it was, writes, and restarts ONLY if it
  # was -- so it does not start a service that was originally stopped. The stop
  # is load-bearing because a running panel can flush a stale in-memory value
  # back over the change.
  local panel="$1" src="$2" rc=0

  # SOURCE must be a real regular file. A symlink is refused outright: a
  # symlinked "template" is a way to make this adapter point the panel at
  # something that is not Row-Template's artifact.
  [ -n "$src" ] || { rt_err "panel 3xui: SOURCE is required"; return "$RT_PANEL_FAIL"; }
  [ -L "$src" ] && { rt_err "panel 3xui: refusing a symlinked SOURCE: $src"; return "$RT_PANEL_FAIL"; }
  [ -f "$src" ] || { rt_err "panel 3xui: SOURCE is not a regular file: $src"; return "$RT_PANEL_FAIL"; }

  # Coherence: the panel's selection must name the directory Row-Template serves
  # from, so a SOURCE outside that root would make the request and the mechanism
  # disagree. Refused rather than silently resolved in either direction.
  rt_is_within "$RT_ROOT" "$src" || {
    rt_err "panel 3xui: SOURCE is outside the Row-Template root ($RT_ROOT): $src"
    return "$RT_PANEL_FAIL"
  }

  rt_panel_3xui_db_ready || return "$RT_PANEL_UNAVAILABLE"

  rt_subtheme_set_sqlite || rc=$?
  case "$rc" in
    "$RT_PANEL_OK") : ;;
    "$RT_PANEL_UNAVAILABLE") return "$RT_PANEL_UNAVAILABLE" ;;
    *) return "$RT_PANEL_FAIL" ;;
  esac
  return "$RT_PANEL_OK"
}

rt_panel_3xui_verify() {
  # static | live.
  #
  # STATIC returns 0 or 1 ONLY. The frozen P3 contract documents no UNAVAILABLE
  # for static -- it is mandatory and cannot be skipped -- so "the check could
  # not be run" is a FAILURE, not a third state. Returning UNAVAILABLE here
  # would invent a code the contract does not allow and invite a caller to
  # treat an unrun mandatory check as anything other than a failure.
  #
  # LIVE returns UNAVAILABLE: see the file header.
  local panel="$1" mode="$2" cur want
  case "$mode" in
    live)
      return "$RT_PANEL_UNAVAILABLE" ;;
    static) : ;;
    *) rt_err "panel 3xui: unknown verification mode '$mode'"; return "$RT_PANEL_FAIL" ;;
  esac

  # 1. the artifact exists and is structurally a Row-Template template.
  [ -f "$RT_DIST" ] || { rt_err "panel 3xui: the artifact is missing: $RT_DIST"; return "$RT_PANEL_FAIL"; }
  rt_validate_template "$RT_DIST" \
    || { rt_err "panel 3xui: the artifact failed structural validation"; return "$RT_PANEL_FAIL"; }

  # 2. and it still matches the checksum recorded at install time, when one was
  #    recorded. Existence alone is never proof: a truncated or replaced file
  #    exists too.
  if [ -f "$RT_DIST_SUM" ]; then
    want="$(LC_ALL=C awk '{print $1; exit}' "$RT_DIST_SUM" 2>/dev/null || true)"
    [ -n "$want" ] || { rt_err "panel 3xui: the recorded checksum is unreadable"; return "$RT_PANEL_FAIL"; }
    rt_verify_sha256 "$RT_DIST" "$want" >/dev/null 2>&1 \
      || { rt_err "panel 3xui: the artifact does not match its recorded checksum"; return "$RT_PANEL_FAIL"; }
  fi

  # 3. the panel's selection is readable, and 4. it names this exact root.
  rt_panel_3xui_db_ready \
    || { rt_err "panel 3xui: cannot read the panel selection"; return "$RT_PANEL_FAIL"; }
  cur="$(rt_panel_3xui_selection_value)" \
    || { rt_err "panel 3xui: cannot read the panel selection"; return "$RT_PANEL_FAIL"; }
  [ "$cur" = "$RT_ROOT" ] \
    || { rt_err "panel 3xui: subThemeDir is '$cur', expected '$RT_ROOT'"; return "$RT_PANEL_FAIL"; }

  return "$RT_PANEL_OK"
}

rt_panel_3xui_restore_state() {
  # Restore from a validated format-2 snapshot.
  #
  # The engine validates the snapshot before calling, but this function does not
  # rely on that: it re-reads and re-checks the panel record itself and fails
  # closed on anything malformed. A restore that acted on a record it had not
  # understood would be the half-restore the format exists to prevent.
  #
  # This function never calls the transaction engine, and never triggers a
  # second recovery. P4 owns rollback sequencing and its exactly-once rule.
  local panel="$1" snap="$2" st mech was_running files rc=0

  # --- the record must be structurally complete and within its closed sets ---
  st="$(rt_backup_panel_state "$snap" "$panel")" || {
    rt_err "panel 3xui: the snapshot's selection.state is malformed"; return "$RT_PANEL_FAIL"; }
  case "$st" in
    absent|empty|present) : ;;
    *) rt_err "panel 3xui: selection.state must be absent|empty|present, got '$st'"
       return "$RT_PANEL_FAIL" ;;
  esac

  rt_backup_panel_meta_check "$snap" "$panel" || {
    rt_err "panel 3xui: the snapshot's panel meta is malformed"; return "$RT_PANEL_FAIL"; }
  mech="$(rt_manifest_get mechanism "$snap/panels/$panel/meta")"
  [ "$mech" = "db" ] || {
    rt_err "panel 3xui: mechanism is '$mech', expected 'db'"
    return "$RT_PANEL_FAIL"; }
  was_running="$(rt_manifest_get was_running "$snap/panels/$panel/meta")"
  case "$was_running" in
    0|1) : ;;
    *) rt_err "panel 3xui: was_running must be 0|1, got '$was_running'"; return "$RT_PANEL_FAIL" ;;
  esac

  # `files` must be EMPTY. A non-empty list means this snapshot claims the panel
  # had files placed into its own tree, which this adapter never does -- so the
  # record describes a state this adapter cannot produce, and acting on it would
  # mean deleting files on the strength of a claim it knows to be impossible.
  files="$(rt_backup_panel_files "$snap" "$panel")" || {
    rt_err "panel 3xui: the snapshot's files record is malformed"; return "$RT_PANEL_FAIL"; }
  [ -z "$files" ] || {
    rt_err "panel 3xui: refusing to restore: this panel places no file, but the snapshot lists one"
    return "$RT_PANEL_FAIL"; }

  if [ "$st" = "present" ]; then
    rt_backup_panel_selection "$snap" "$panel" >/dev/null 2>&1 || {
      rt_err "panel 3xui: state=present but the selection value is unreadable"
      return "$RT_PANEL_FAIL"; }
  fi

  # --- apply -----------------------------------------------------------------
  rt_panel_3xui_db_ready || return "$RT_PANEL_UNAVAILABLE"

  case "$st" in
    absent)
      # Only the subThemeDir rows are removed; every other settings row is left
      # exactly as it is.
      rt_panel_3xui_selection_remove || return "$RT_PANEL_FAIL" ;;
    empty)
      rt_panel_3xui_selection_write "" || return "$RT_PANEL_FAIL" ;;
    present)
      rt_panel_3xui_selection_write "$(rt_backup_panel_selection "$snap" "$panel")" \
        || return "$RT_PANEL_FAIL" ;;
  esac

  # --- service state ---------------------------------------------------------
  if [ "$was_running" = "1" ]; then
    rt_panel_3xui_service_ensure running || return "$RT_PANEL_FAIL"
  else
    rt_panel_3xui_service_ensure stopped || return "$RT_PANEL_FAIL"
  fi

  return "$RT_PANEL_OK"
}

rt_panel_3xui_uninstall_template() {
  # PANEL-SIDE ONLY. This removes the panel's selection when -- and only when --
  # it currently names Row-Template's root. Deleting the Row-Template
  # installation itself is the user-facing uninstall's job, not this adapter's,
  # and nothing here recurses into RT_ROOT.
  #
  # Ownership is decided by the recorded value, not by assumption. If the panel
  # points somewhere else, the selection is not ours and is left alone: a
  # NOT_APPLICABLE answer, not a deletion.
  local cur

  rt_panel_3xui_db_ready || return "$RT_PANEL_UNAVAILABLE"
  cur="$(rt_panel_3xui_selection_value)" || return "$RT_PANEL_UNAVAILABLE"

  [ "$cur" = "$RT_ROOT" ] || return "$RT_PANEL_NOT_APPLICABLE"

  rt_panel_3xui_selection_remove || return "$RT_PANEL_FAIL"
  return "$RT_PANEL_OK"
}
