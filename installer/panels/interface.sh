#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# installer/panels/interface.sh — the FROZEN panel interface (P3).
#
# WHAT THIS IS. One canonical contract through which a future transaction
# engine talks to a panel WITHOUT knowing which panel it is talking to. P3
# defines the contract only. There is no real adapter here, and there is
# deliberately no panel-specific file: installer/panels/3xui.sh and friends do
# not exist, so that no caller can bind to an implementation that P5 has not
# written yet.
#
# WHY ONE LAYER. Every public operation in this file must exist exactly once.
# A second way to detect a panel, or a second way to read capabilities, would
# create two things that can disagree — and a transaction engine that acts on
# the wrong one cannot tell. So the rule P3 enforces is: one name per
# operation, and no competing surface.
#
# WHAT IT DOES NOT DO. This layer mutates nothing. Every public function here
# either reads or refuses. Detection is read-only by contract; the staging and
# placement obligations are DOCUMENTED here and IMPLEMENTED nothing.
#
# SOURCING. This file is sourced by installer/lib/row-template.sh, and depends
# on the P2 primitives defined there (rt_panel_id_ok, rt_backup_relpath_ok,
# RT_PANEL_IDS, RT_PANEL_STAGE). It is never standalone: it defines contract
# and dispatch, and the P2 format is the only state model it names.
#
# The interface is Bash (not POSIX sh) because the surrounding installer is
# Bash, and a second dialect would be a second thing to get wrong.
# ---------------------------------------------------------------------------

# --- return-code contract --------------------------------------------------
# The meaning of every non-zero code is FIXED, and identical for every panel.
# A panel implementation may not redefine them, and may not invent a code: a
# caller that has to consult a panel-specific table to interpret a status has
# no contract at all.
#
#   0 SUCCESS         operation completed AND its required verification passed
#   1 FAILURE         the operation was attempted or required, and failed
#   2 UNAVAILABLE     cannot be performed in this environment; NOT a failure —
#                     e.g. live verification is not possible here
#   3 NOT_APPLICABLE  the requested panel is not present / does not apply
#
# UNAVAILABLE vs FAILURE is the distinction that matters most in practice: a
# transaction engine must NOT roll back a change that succeeded merely because
# it could not be verified live on this host. See rt_panel_verify.
RT_PANEL_OK=0
RT_PANEL_FAIL=1
RT_PANEL_UNAVAILABLE=2
RT_PANEL_NOT_APPLICABLE=3

# --- closed panel enum -----------------------------------------------------
# RT_PANEL_IDS is defined in installer/lib/row-template.sh and is the single
# source of truth. It is NOT redeclared here: two copies of a closed set is a
# closed set with two chances to drift. rt_panel_id_ok (P2) is the only
# validator, and it normalises nothing — an unknown name is refused, never
# repaired into a known one.

# --- capability vocabulary -------------------------------------------------
# A CLOSED set of machine-readable tokens. Every token is one capability, and
# nothing outside this list may ever be emitted. A dynamically invented
# capability token is worse than a missing one: a caller cannot branch on a
# token it has never heard of, and cannot distinguish "no" from "new".
#
# The list is closed for the same reason the panel enum is: the transaction
# engine's behaviour has to be derivable from the schema, not from whatever a
# future adapter felt like claiming.
#
#   selection_read      can read the panel's current template selection
#   selection_write     can set it
#   file_placement      installs a template file into the panel's own tree
#   service_control     can stop/start the panel's service
#   static_verify       can verify the installed shell without the panel
#   live_verify         can verify through the running panel (may be UNAVAILABLE)
#   per_admin_override  selection is per-administrator, not global
#   api_activation      activation goes through the panel's HTTP API
#   db_activation       activation goes through the panel's database
#   env_activation      activation goes through an environment/config file
RT_PANEL_CAPABILITIES="api_activation db_activation env_activation file_placement live_verify per_admin_override selection_read selection_write service_control static_verify"

rt_panel_capability_ok() {
  # 0 only for a token in the closed vocabulary above. Exact match, no prefix
  # match, no normalisation — the same discipline as the panel enum.
  [ -n "${1:-}" ] || return 1
  case " $RT_PANEL_CAPABILITIES " in
    *" $1 "*) return 0 ;;
    *)        return 1 ;;
  esac
}

# --- verification modes ----------------------------------------------------
# A verification is NOT a boolean. `false` conflates "checked and broken" with
# "could not be checked", and those two demand opposite responses: the first is
# a rollback trigger, the second is not.
RT_PANEL_VERIFY_MODES="static live"

rt_panel_verify_mode_ok() {
  case "${1:-}" in
    static|live) return 0 ;;
    *)           return 1 ;;
  esac
}

# --- internals: contract-only stubs ----------------------------------------
# Each public operation dispatches to ONE internal implementation function,
# named rt_panel_impl_<verb>. P5 fills those in. Until then they report
# UNAVAILABLE, which is the honest answer: the panel may well be present, but
# the CAPABILITY this operation needs does not exist in this build.
#
# UNAVAILABLE and not NOT_APPLICABLE is deliberate. NOT_APPLICABLE means
# "this panel is not here / this operation does not apply to it" — a claim
# about the PANEL, which P3 cannot make, because P3 does no detection. What
# P3 knows for certain is that the IMPLEMENTATION is absent. Saying
# NOT_APPLICABLE would be pretending to have looked.

rt_panel_impl_detect()            { return "$RT_PANEL_UNAVAILABLE"; }
rt_panel_impl_capabilities()      { return "$RT_PANEL_UNAVAILABLE"; }
rt_panel_impl_backup_state()      { return "$RT_PANEL_UNAVAILABLE"; }
rt_panel_impl_install_template()  { return "$RT_PANEL_UNAVAILABLE"; }
rt_panel_impl_verify()            { return "$RT_PANEL_UNAVAILABLE"; }
rt_panel_impl_restore_state()     { return "$RT_PANEL_UNAVAILABLE"; }
rt_panel_impl_uninstall_template() { return "$RT_PANEL_UNAVAILABLE"; }

# --- guards ----------------------------------------------------------------
# One place where "is this a panel we may act on" is decided, so no public
# function can forget it. Fails closed and says nothing on stdout: a refusal is
# a diagnostic, and the machine-readable channel must stay clean.
rt_panel_arg_ok() {
  local verb="$1" panel="${2:-}"
  if ! rt_panel_id_ok "$panel"; then
    rt_err "panel $verb: unknown panel id '${panel}' (known: $RT_PANEL_IDS)"
    return 1
  fi
  return 0
}

# ===========================================================================
# PUBLIC CONTRACT — these seven names are the frozen surface.
# ===========================================================================

rt_panel_detect() {
  # rt_panel_detect PANEL
  #
  # READ-ONLY, and that is a hard boundary: this function must never create,
  # modify, move or remove a file; never write to a database; never start or
  # stop a service; never touch the network. Detection runs before a transaction
  # has decided anything, so a side effect here is a side effect taken on a
  # decision that has not been made.
  #
  # Exit: 0 SUCCESS  the panel is present
  #       3 NOT_APPLICABLE  the panel is not present
  #       1 FAILURE  detection itself could not be completed
  #       2 UNAVAILABLE  no implementation in this build
  #
  # P5 OBLIGATION — EVIDENCE, NOT HINTS. Identity must be established from
  # POSITIVE, CORROBORATED evidence, and a single weak signal is never enough:
  #   - a directory name alone proves nothing: anyone can create /etc/3x-ui
  #   - a binary name alone proves nothing: a leftover binary outlives its panel
  #   - a weak heuristic alone proves nothing
  # Two independent signals must agree before this returns SUCCESS. Where they
  # disagree, or where only one is available, the answer is FAILURE rather than
  # a guess — wrongly identifying a panel means the transaction engine will
  # stage, place files into, and then RESTORE STALE STATE ON a panel that was
  # never there.
  rt_panel_arg_ok detect "${1:-}" || return "$RT_PANEL_FAIL"
  rt_panel_impl_detect "${1:-}"
}

rt_panel_capabilities() {
  # rt_panel_capabilities PANEL
  #
  # stdout: zero or more capability tokens, ONE PER LINE, in LC_ALL=C lexical
  # order, drawn only from RT_PANEL_CAPABILITIES. Nothing else may be printed —
  # no prose, no decoration, no header. The channel is machine-readable or it is
  # useless; a "Capabilities:" banner means every caller needs a parser.
  #
  # Deterministic: the same panel and the same build always produce the same
  # bytes, in the same order, so two runs can be compared directly.
  #
  # Exit: 0 SUCCESS  0+N tokens follow
  #       1 FAILURE
  #       3 NOT_APPLICABLE  the panel is not present
  #       2 UNAVAILABLE  no implementation in this build
  rt_panel_arg_ok capabilities "${1:-}" || return "$RT_PANEL_FAIL"
  rt_panel_impl_capabilities "${1:-}"
}

rt_panel_backup_state() {
  # rt_panel_backup_state PANEL
  #
  # Capture the panel's current state into RT_PANEL_STAGE, in the format P2
  # already froze. This function's job is to FILL THE STAGE; it does not create
  # a snapshot. Creating the snapshot is rt_backup_create v2, called by the
  # transaction engine, and this layer must not duplicate it.
  #
  # P5 OBLIGATION — stage exactly what P2 requires, by calling
  # rt_backup_panel_write (the ONLY door into a snapshot) with:
  #
  #   selection.state  absent | empty | present
  #   selection        the raw value, written ONLY when state=present
  #   meta             mechanism=db|env|api, was_running=0|1
  #   files            zero or more RELATIVE paths, one per line
  #
  # The `files` record must name every file Row-Template itself placed inside
  # the panel's managed root, and nothing else. It is what makes "remove our
  # files, never the directory" possible at restore time: an operator's custom
  # template directory holds their own work, so a rollback that deleted the
  # directory would destroy content it never captured and cannot restore.
  #
  # FORBIDDEN, without exception: secrets, credentials, API tokens, panel
  # output evaluated as code, and any free-form KEY=VALUE blob. The P2 writer
  # takes positional arguments precisely so that no such blob can exist.
  #
  # Exit: 0 SUCCESS  the stage now holds a complete, valid record
  #       1 FAILURE
  #       3 NOT_APPLICABLE  the panel is not present
  #       2 UNAVAILABLE  no implementation in this build
  rt_panel_arg_ok backup_state "${1:-}" || return "$RT_PANEL_FAIL"
  rt_panel_impl_backup_state "${1:-}"
}

rt_panel_install_template() {
  # rt_panel_install_template PANEL SOURCE
  #
  # Place the template shell at SOURCE into PANEL's managed template root.
  #
  # P5 OBLIGATIONS:
  #   - SOURCE must ALREADY be a validated Row-Template shell. Validation is the
  #     caller's job and happens before this is reached; this function does not
  #     trust a path it was handed.
  #   - place ONLY Row-Template-owned files. Nothing else is ours to write.
  #   - REFUSE if the destination already exists. An operator file is not ours
  #     to overwrite, and P2 captures no original bytes, so an overwrite is
  #     unrecoverable. This is a refusal, never a silent replace.
  #   - never overwrite operator-owned content.
  #   - never recursively delete a panel-owned directory.
  #   - remain INSIDE the panel-managed template root at all times; SOURCE is
  #     not a licence to write anywhere.
  #   - use safe atomic placement where the panel allows it.
  #   - record every placed file through the P2 `files` contract, so the
  #     placement is auditable by a later rollback. An unrecorded placement is
  #     a file that rollback will leave behind.
  #
  # Exit: 0 SUCCESS  placed, and recorded in `files`
  #       1 FAILURE     including "destination exists" — a required operation
  #                     that must not proceed
  #       3 NOT_APPLICABLE  the panel is not present
  #       2 UNAVAILABLE  no implementation in this build
  rt_panel_arg_ok install_template "${1:-}" || return "$RT_PANEL_FAIL"
  [ -n "${2:-}" ] || { rt_err "panel install_template: SOURCE is required"; return "$RT_PANEL_FAIL"; }
  rt_panel_impl_install_template "${1:-}" "${2:-}"
}

rt_panel_verify() {
  # rt_panel_verify PANEL MODE        MODE = static | live
  #
  # THE TRI-STATE IS THE POINT. Verification is not a boolean, because "checked
  # and broken" and "could not check" require opposite responses:
  #
  #   static: 0 SUCCESS | 1 FAILURE        required; static verification is
  #                                        mandatory and cannot be skipped
  #   live:   0 SUCCESS | 1 FAILURE | 2 UNAVAILABLE
  #
  # UNAVAILABLE IS NOT FAILURE. A transaction engine MUST NOT roll back solely
  # because live verification was unavailable, provided the required static
  # verification succeeded. Rolling back a good change because the host could
  # not reach the panel's API turns a missing capability into data loss.
  #
  # Exit: 0 SUCCESS | 1 FAILURE | 2 UNAVAILABLE (live) |
  #       3 NOT_APPLICABLE  the panel is not present
  rt_panel_arg_ok verify "${1:-}" || return "$RT_PANEL_FAIL"
  # EXACTLY TWO arguments. A trailing extra is refused rather than ignored:
  # `verify 3xui static live` looks like a request to do both, and answering
  # for `static` while discarding `live` would give a caller a plausible
  # status for a question it did not ask. The signature is frozen, so it is
  # enforced as written.
  [ "$#" -eq 2 ] || {
    rt_err "panel verify: takes exactly PANEL MODE, got $# arguments"
    return "$RT_PANEL_FAIL"
  }
  rt_panel_verify_mode_ok "${2:-}" || {
    rt_err "panel verify: MODE must be static|live, got '${2:-}'"
    return "$RT_PANEL_FAIL"
  }
  rt_panel_impl_verify "${1:-}" "${2:-}"
}

rt_panel_restore_state() {
  # rt_panel_restore_state PANEL SNAPSHOT
  #
  # Restore panel state from a format-2 SNAPSHOT. THE ORDER IS PART OF THE
  # CONTRACT, because a different order destroys data in a way no later step
  # can repair:
  #
  #   1. validate the format-2 snapshot
  #      — before anything is touched. A malformed snapshot is refused, never
  #        partially applied, because a half-applied restore is worse than none.
  #   2. restore selection/state through the SAME mechanism recorded in `meta`
  #      — db, env or api, exactly as recorded. A different mechanism is a
  #        different write path and may not even address the same setting.
  #   3. remove ONLY the Row-Template-created files recorded in `files`
  #      — never the containing directory, and never a file we did not record.
  #   4. restore the previous service running/stopped state (was_running)
  #   5. perform static verification — required
  #   6. live verification MAY be attempted, and its UNAVAILABLE is not a failure
  #
  # NEVER:
  #   - guess missing state. An absent record means absent, not "infer one".
  #   - delete the containing operator directory.
  #   - delete a file not recorded by Row-Template.
  #   - restore from a malformed snapshot.
  #   - automatically chain a SECOND recovery if rollback itself fails. A
  #     failed rollback stops and reports; a recovery loop that tries again is
  #     how a single fault becomes a corrupted install.
  #
  # Exit: 0 SUCCESS | 1 FAILURE | 3 NOT_APPLICABLE | 2 UNAVAILABLE
  rt_panel_arg_ok restore_state "${1:-}" || return "$RT_PANEL_FAIL"
  [ -n "${2:-}" ] || { rt_err "panel restore_state: SNAPSHOT is required"; return "$RT_PANEL_FAIL"; }
  rt_panel_impl_restore_state "${1:-}" "${2:-}"
}

rt_panel_uninstall_template() {
  # rt_panel_uninstall_template PANEL
  #
  # P5 OBLIGATIONS:
  #   - remove ONLY Row-Template-owned, recorded files
  #   - restore the panel's selection appropriately
  #   - preserve unrelated operator files
  #   - NEVER delete a panel-owned directory
  #   - FAIL CLOSED on ambiguous ownership. If it cannot be established that a
  #     file is ours, it is left alone. Leaving a file behind is recoverable;
  #     deleting an operator's file is not.
  #
  # Exit: 0 SUCCESS | 1 FAILURE | 3 NOT_APPLICABLE | 2 UNAVAILABLE
  rt_panel_arg_ok uninstall_template "${1:-}" || return "$RT_PANEL_FAIL"
  rt_panel_impl_uninstall_template "${1:-}"
}
