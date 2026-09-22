#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# installer/lib/transaction.sh -- the generic installer transaction engine (P4).
#
# WHAT THIS IS. One orchestration layer that drives the FROZEN panel interface
# (P3) through a fixed order: lock, identify, read capabilities, capture state,
# snapshot, mutate, verify, commit -- and, when something fails after mutation
# has begun, restore from the safety snapshot EXACTLY ONCE.
#
# WHAT THIS IS NOT. It knows nothing about any particular panel. No panel name,
# no service name, no database statement, no environment key and no API endpoint
# appears in this file. The engine branches on CAPABILITIES, never on identity:
# a panel that declares a capability gets the generic operation that capability
# names, and a panel that does not declare a capability the transaction REQUIRES
# is refused before anything is mutated. That is what makes this file usable for
# a panel that does not exist yet, and what makes it impossible for a
# panel-specific assumption to hide here.
#
# P5 OWNS THE IMPLEMENTATIONS. Real detection, real placement and real restore
# belong to the adapters P5 will add behind the P3 interface. This engine only
# sequences calls into that interface. It does not bypass it, and it does not
# create a second panel abstraction beside it.
#
# RETURN CODES. The P3 contract is preserved verbatim and is never reinterpreted
# per panel: 0 SUCCESS, 1 FAILURE, 2 UNAVAILABLE, 3 NOT_APPLICABLE. The one place
# a code is deliberately NARROWED is static verification, where UNAVAILABLE and
# NOT_APPLICABLE are both treated as failure -- see rt_transaction_static_verify.
#
# SOURCING. Sourced by installer/lib/row-template.sh, after the P3 layer. It
# depends on the P2 primitives there (rt_panel_id_ok, RT_PANEL_IDS,
# RT_PANEL_STAGE, rt_is_within, rt_backup_create, rt_backup_snapshot_check) and
# on the P3 public functions. It defines no panel behaviour of its own.
#
# STDERR IS THE EVENT CHANNEL, STDOUT IS RESERVED. Every observable step emits a
# stable `transaction:<event>` line on stderr. stdout carries nothing, so a
# caller may capture it without having to filter diagnostics out of it, and the
# events remain greppable without a parser.
# ---------------------------------------------------------------------------

# --- transaction state model -----------------------------------------------
# A small CLOSED model. It exists to make the order explicit, to make an invalid
# transition impossible rather than merely unlikely, and to give a test and an
# error report a precise word for where a transaction stopped.
#
# It is NOT a journal. Nothing here is persisted, and a crash loses the state
# entirely. That is deliberate: P4 has no crash recovery, and a state file that
# looks like recovery but is not is worse than no state file at all.
RT_TXN_STATES="INIT LOCKED CAPTURED SNAPSHOT MUTATING VERIFIED COMMITTED ROLLING_BACK ROLLED_BACK FAILED"

# Current state, the mutation-boundary flag, the locked flag, and the safety
# snapshot reference. All module-level, all reset by rt_transaction_reset.
RT_TXN_STATE=""
RT_TXN_MUTATED=0
RT_TXN_LOCKED=0
RT_TXN_SNAPSHOT=""
RT_TXN_PANEL=""
RT_TXN_CAPS=""

# The capabilities a transaction CANNOT proceed without. Both are required for
# the same reason: the engine's contract with its caller is "the template is in
# place AND it was verified", and a panel that can do neither of those cannot
# honour it.
#
#   file_placement  without it there is no operation to perform
#   static_verify   without it the mandatory verification can never pass, so the
#                   transaction would mutate and then be forced to roll back --
#                   a guaranteed round trip that risks data to learn nothing
#
# Every OTHER capability is optional and only selects generic behaviour. In
# particular live_verify is optional: its absence removes a source of evidence,
# it does not invalidate the transaction.
RT_TXN_REQUIRED_CAPABILITIES="file_placement static_verify"

rt_transaction_state_ok() {
  case " $RT_TXN_STATES " in
    *" ${1:-} "*) return 0 ;;
    *)            return 1 ;;
  esac
}

rt_transaction_transition_ok() {
  # 0 only for a transition the model permits. Terminal states accept nothing,
  # so a second COMMITTED or a late FAILED after ROLLED_BACK is refused rather
  # than quietly overwriting the outcome a caller already reported.
  local from="${1:-}" to="${2:-}"
  # A transition the model permits from the starting state: a run that fails
  # before it can take the lock has still FAILED, and leaving the state at INIT
  # would report "this never started" for a run that was attempted and refused.
  case "$from" in
    INIT)         case "$to" in LOCKED|FAILED)                return 0 ;; esac ;;
    LOCKED)       case "$to" in CAPTURED|FAILED)              return 0 ;; esac ;;
    CAPTURED)     case "$to" in SNAPSHOT|FAILED)              return 0 ;; esac ;;
    SNAPSHOT)     case "$to" in MUTATING|FAILED)              return 0 ;; esac ;;
    MUTATING)     case "$to" in VERIFIED|ROLLING_BACK|FAILED) return 0 ;; esac ;;
    VERIFIED)     case "$to" in COMMITTED|ROLLING_BACK|FAILED) return 0 ;; esac ;;
    ROLLING_BACK) case "$to" in ROLLED_BACK|FAILED)           return 0 ;; esac ;;
    COMMITTED|ROLLED_BACK|FAILED) return 1 ;;
  esac
  return 1
}

rt_transaction_state_set() {
  # Move to STATE, refusing a transition the model does not permit. A refusal is
  # a bug in this file rather than a condition a caller can cause, so it is
  # reported loudly instead of being absorbed.
  local to="${1:-}"
  if ! rt_transaction_state_ok "$to"; then
    rt_err "transaction: unknown state '$to'"
    return 1
  fi
  if [ -n "$RT_TXN_STATE" ] && ! rt_transaction_transition_ok "$RT_TXN_STATE" "$to"; then
    rt_err "transaction: invalid transition $RT_TXN_STATE -> $to"
    return 1
  fi
  RT_TXN_STATE="$to"
  return 0
}

rt_transaction_state() {
  # Diagnostic accessor for the current state. Internal: the transaction entry
  # point reports through its exit status, and this exists so a test or an error
  # path can name where a run stopped without reaching into the variable.
  printf '%s' "$RT_TXN_STATE"
}

rt_transaction_reset() {
  # Return the model to its starting position. Called at the top of every run so
  # a second transaction in the same process cannot inherit the first one's
  # outcome -- a stale COMMITTED is exactly the value that would make a failed
  # run look successful.
  RT_TXN_STATE="INIT"
  RT_TXN_MUTATED=0
  RT_TXN_LOCKED=0
  RT_TXN_SNAPSHOT=""
  RT_TXN_PANEL=""
  RT_TXN_CAPS=""
  return 0
}

# --- events -----------------------------------------------------------------
rt_transaction_event() {
  # Emit one stable, greppable event on stderr. Deterministic and minimal: the
  # event name and nothing else. No panel state, no paths, no secrets -- an
  # event stream that can carry a value is an event stream that can leak one.
  #
  # RT_TXN_QUIET suppresses the stream for a caller that only wants the status.
  [ -n "${RT_TXN_QUIET:-}" ] && return 0
  printf 'transaction:%s\n' "${1:-}" >&2
  return 0
}

# --- single-flight lock -----------------------------------------------------
# flock, and only flock. Every alternative was rejected for a concrete reason:
#
#   a PID file        cannot tell a live holder from a recycled PID
#   polling/sleeping  turns "busy" into a delay, and a delay into a hang
#   stale-file heuristics
#                     cannot distinguish stale from slow, so the heuristic
#                     eventually deletes a LIVE lock -- the failure mode a lock
#                     exists to prevent
#   a lock-keeper process
#                     is a second thing that can die while holding the lock
#
# flock gives the one property the others cannot: the lock is released by the
# KERNEL when the owning process exits, including on a crash or a kill. That is
# what makes "released on success, on handled failure, and on any exit" true
# without any cleanup path having to run.
#
# FD 9 is reserved by this engine. The lock FILE is never unlinked: unlinking a
# lock file is the classic race in which a second process creates a new inode
# and both hold "the" lock. The file is a rendezvous, not state.
rt_transaction_lock_path() {
  printf '%s' "$RT_ROOT/.locks/transaction.lock"
}

rt_transaction_lock_acquire() {
  # Acquire the single-flight writer lock, or fail immediately and clearly.
  #
  # FAIL CLOSED when flock is unavailable. Running unlocked is not a degraded
  # mode: two concurrent transactions can interleave a capture and a rollback
  # against the same panel, and the resulting state is one neither of them
  # recorded. Refusing is the only safe answer.
  local dir file
  [ -n "${RT_ROOT:-}" ] || { rt_err "transaction: RT_ROOT is unset; refusing to lock"; return 1; }

  if ! command -v flock >/dev/null 2>&1; then
    rt_err "transaction: flock is not available; refusing to run without single-flight protection"
    return 1
  fi

  dir="$RT_ROOT/.locks"
  file="$dir/transaction.lock"

  # A symlinked install root or lock directory would let the lock live somewhere
  # other than the tree it is supposed to protect.
  [ -L "$RT_ROOT" ] && { rt_err "transaction: refusing a symlinked install root: $RT_ROOT"; return 1; }
  mkdir -p "$dir" || { rt_err "transaction: could not create the lock directory: $dir"; return 1; }
  chmod 700 "$dir" 2>/dev/null || true
  [ -L "$dir" ]  && { rt_err "transaction: refusing a symlinked lock directory: $dir"; return 1; }
  [ -L "$file" ] && { rt_err "transaction: refusing a symlinked lock file: $file"; return 1; }

  # If FD 9 is ALREADY open, this process either holds the lock or is a shell
  # that inherited the descriptor. Either way, reusing it would silently drop
  # the original holder's lock, so it is refused rather than clobbered.
  if { : >&9 ; } 2>/dev/null; then
    rt_err "transaction: fd 9 is already open; refusing to reuse the lock descriptor"
    return 1
  fi

  exec 9>"$file" || { rt_err "transaction: could not open the lock file: $file"; return 1; }
  chmod 600 "$file" 2>/dev/null || true

  # NON-BLOCKING. A second concurrent transaction must fail at once rather than
  # queue behind the first: a queued transaction would eventually run against a
  # panel state its caller decided on minutes earlier.
  if ! flock -n 9; then
    exec 9>&- 2>/dev/null || true
    rt_err "transaction: another transaction holds the lock ($file)"
    return 1
  fi

  RT_TXN_LOCKED=1
  return 0
}

rt_transaction_lock_release() {
  # Release explicitly. Not strictly required -- the kernel would release on
  # exit -- but a transaction that finishes and keeps holding the lock would
  # refuse every later transaction from a long-lived shell, and that is a bug
  # that only shows up in production.
  [ "${RT_TXN_LOCKED:-0}" = "1" ] || return 0
  flock -u 9 2>/dev/null || true
  exec 9>&- 2>/dev/null || true
  RT_TXN_LOCKED=0
  return 0
}

# --- stage hygiene ----------------------------------------------------------
rt_transaction_stage_reset() {
  # Clear the Row-Template-owned staging tree so a new transaction cannot read a
  # PREVIOUS transaction's captured state. Stale state is the dangerous
  # direction: a capture that silently failed would otherwise leave the old
  # record in place and the snapshot would faithfully record the wrong thing.
  #
  # WHY NOT rt_safe_rmdir. That helper is the recursive-delete choke point, but
  # it deliberately permits only descendants of the two BACKUP namespaces. The
  # staging tree is not one of them, so reusing it here would either fail or
  # require widening the choke point -- and widening it is how a safety net
  # stops being one. This helper carries the same strictness for its own root:
  #
  #   - the path must be exactly RT_PANEL_STAGE, and its basename must be the
  #     one this engine expects, so a tampered variable cannot redirect the
  #     delete at an unrelated directory
  #   - it must resolve STRICTLY INSIDE RT_ROOT (rt_is_within refuses equality,
  #     so RT_ROOT itself is rejected)
  #   - "/" and a symlink are refused outright
  local d="${RT_PANEL_STAGE:-}"
  [ -n "$d" ] || { rt_err "transaction: RT_PANEL_STAGE is unset; refusing to clear it"; return 1; }
  [ "$d" = "/" ] && { rt_err "transaction: refusing to clear /"; return 1; }
  [ -L "$d" ] && { rt_err "transaction: refusing to clear a symlinked stage: $d"; return 1; }
  [ "${d##*/}" = ".panel-stage" ] || {
    rt_err "transaction: unexpected stage path (expected a .panel-stage directory): $d"; return 1; }
  rt_is_within "$RT_ROOT" "$d" || {
    rt_err "transaction: refusing to clear a stage outside the install root: $d"; return 1; }
  [ -e "$d" ] || return 0
  rm -rf -- "$d" || { rt_err "transaction: could not clear the stage: $d"; return 1; }
  return 0
}

# --- safety snapshot --------------------------------------------------------
rt_transaction_snapshot_validate() {
  # A safety snapshot is usable only if it is a valid format-2 snapshot INSIDE
  # the format-2 namespace. Containment is checked here as well as at creation
  # because this same function guards the ROLLBACK path, and a rollback that
  # restored from a path outside the namespace would be reading something that
  # no writer in this project produced.
  local snap="${1:-}"
  [ -n "$snap" ] || return 1
  [ -d "$snap" ] || return 1
  rt_assert_not_symlink "$snap" || return 1
  rt_is_within "$RT_BACKUPS_V2" "$snap" || return 1
  rt_backup_snapshot_check "$snap" >/dev/null 2>&1 || return 1
  return 0
}

# --- capability lookup ------------------------------------------------------
rt_transaction_capability_present() {
  # 0 when TOKEN appears in the newline-separated CAPS. Exact match only: a
  # capability is a token from a closed vocabulary, not a prefix, and "live"
  # must not be satisfied by "live_verify".
  local caps="${1:-}" tok="${2:-}" c
  [ -n "$tok" ] || return 1
  while IFS= read -r c; do
    if [ "$c" = "$tok" ]; then
      return 0
    fi
  done <<< "$caps"
  return 1
}

# --- verification -----------------------------------------------------------
rt_transaction_static_verify() {
  # rt_transaction_static_verify PANEL -- returns the panel's static status.
  #
  # STATIC VERIFICATION IS MANDATORY, so this is the ONE place a P3 status is
  # deliberately narrowed. The caller treats any non-zero as failure:
  #
  #   0 SUCCESS         continue
  #   1 FAILURE         the change is broken
  #   2 UNAVAILABLE     cannot verify => cannot accept. "Could not check" is not
  #                     "checked and fine", and a mandatory check that is
  #                     allowed to be skipped is not mandatory.
  #   3 NOT_APPLICABLE  a transaction targeting this panel requires this check;
  #                     "does not apply" therefore means the transaction's own
  #                     precondition is unmet
  #
  # The status is returned UNCHANGED so the caller can report which of the four
  # happened; only the caller's decision to proceed narrows.
  local panel="${1:-}" rc=0
  rt_transaction_event verify-static
  rt_panel_verify "$panel" static || rc=$?
  return "$rc"
}

rt_transaction_live_verify() {
  # rt_transaction_live_verify PANEL -- OPTIONAL evidence, tri-state preserved.
  #
  #   PASS          the panel itself confirms the change
  #   FAIL          the panel reports a broken change -> a failure
  #   UNAVAILABLE   cannot be checked here (no API reachable, no implementation)
  #                 -> NOT a failure, and NOT a rollback trigger on its own
  #
  # The tri-state survives this wrapper untouched. Flattening it to a boolean is
  # the specific mistake that rolls back a good change because a host could not
  # reach a panel's API -- turning a missing capability into data loss.
  local panel="${1:-}" rc=0
  rt_transaction_event verify-live
  rt_panel_verify "$panel" live || rc=$?
  return "$rc"
}

# --- rollback ---------------------------------------------------------------
rt_transaction_rollback_report_failure() {
  # Report the original failure and the rollback failure SEPARATELY. Collapsing
  # them into one message loses the fact that two different things went wrong,
  # and the second one means the install is in a state neither the operator nor
  # a later run can assume anything about.
  local original="${1:-}" why="${2:-}"
  rt_transaction_event rollback-failed
  rt_err "transaction: the original failure was status $original"
  rt_err "transaction: rollback also failed ($why); the panel was left as the failed attempt left it"
  rt_err "transaction: no further recovery is attempted automatically"
  return 0
}

rt_transaction_rollback() {
  # rt_transaction_rollback PANEL SNAPSHOT ORIGINAL_STATUS
  #
  # Attempt exactly ONE rollback and report its outcome. Returns FAILURE in both
  # cases, because the TRANSACTION failed either way; whether the rollback
  # succeeded is what the events and the two reports distinguish.
  #
  # EXACTLY ONCE, and there is no path in this file that calls it twice. The
  # engine does not re-enter rt_transaction_run, does not chain a
  # rollback-of-rollback, and does not retry a failed restore: a recovery loop
  # is how a single fault becomes a corrupted install.
  #
  # The ORDER below is the frozen P3 restore order, and it is the order because
  # each step protects the next:
  #   1. validate the snapshot   -- before anything is touched; a malformed
  #                                 snapshot must be refused, not half applied
  #   2. rt_panel_restore_state  -- the panel layer owns WHAT to restore and
  #                                 through which mechanism
  #   3. static verification     -- mandatory, and it is what makes "the restore
  #                                 worked" a checked claim
  #   4. live verification       -- optional evidence, never a failure here
  #
  # This function deliberately does NOT touch selection, files or the service
  # itself. Those details live behind rt_panel_restore_state; duplicating them
  # here would create a second restore implementation that can disagree with the
  # first, and only one of them can be right.
  local panel="${1:-}" snap="${2:-}" original="${3:-}" rc=0

  rt_transaction_state_set ROLLING_BACK >/dev/null 2>&1 || true
  rt_transaction_event rollback

  if ! rt_transaction_snapshot_validate "$snap"; then
    rt_transaction_rollback_report_failure "$original" "the safety snapshot did not validate"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi

  rc=0
  rt_panel_restore_state "$panel" "$snap" || rc=$?
  if [ "$rc" -ne "$RT_PANEL_OK" ]; then
    rt_transaction_rollback_report_failure "$original" "restore_state returned status $rc"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi

  rc=0
  rt_transaction_static_verify "$panel" || rc=$?
  if [ "$rc" -ne "$RT_PANEL_OK" ]; then
    rt_transaction_rollback_report_failure "$original" "post-restore static verification returned status $rc"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi

  # Live verification after a rollback is evidence, not a gate: UNAVAILABLE and
  # NOT_APPLICABLE are both acceptable here, and neither is reported as a pass.
  if rt_transaction_capability_present "${RT_TXN_CAPS:-}" live_verify; then
    rc=0
    rt_transaction_live_verify "$panel" || rc=$?
    case "$rc" in
      "$RT_PANEL_OK") : ;;
      "$RT_PANEL_UNAVAILABLE"|"$RT_PANEL_NOT_APPLICABLE")
        rt_warn "transaction: live verification after rollback was not available (status $rc)" ;;
      *) rt_warn "transaction: live verification after rollback did not pass (status $rc)" ;;
    esac
  fi

  rt_transaction_state_set ROLLED_BACK >/dev/null 2>&1 || true
  return "$RT_PANEL_FAIL"
}

# --- the transaction body ---------------------------------------------------
rt_transaction_body() {
  # Runs entirely under the lock. Every return path leaves the state model at a
  # terminal or ROLLED_BACK/FAILED value; the lock is released by the caller.
  local panel="${1:-}" src="${2:-}" caps="" snap="" rc=0 tok="" need=""

  # 1. THE REQUEST. A closed enum, validated by the P2 validator so the panel
  #    vocabulary has exactly one definition. Nothing is normalised: an unknown
  #    id is refused, never repaired into a known one.
  if ! rt_panel_id_ok "$panel"; then
    rt_err "transaction: unknown panel id '${panel}' (known: $RT_PANEL_IDS)"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  if [ -z "$src" ]; then
    rt_err "transaction: SOURCE is required"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  RT_TXN_PANEL="$panel"

  # 2. DETECTION. Read-only, and mandatory. A transaction that cannot establish
  #    the panel is present must not go on to capture state from, write into,
  #    and potentially restore onto a panel it has not identified. Every
  #    non-success status is reported for what it is and then treated as a
  #    refusal to proceed:
  #      3 NOT_APPLICABLE  the panel is not present
  #      2 UNAVAILABLE     identity cannot be established in this build
  #      1 FAILURE         detection itself failed
  rc=0
  rt_panel_detect "$panel" || rc=$?
  case "$rc" in
    "$RT_PANEL_OK") : ;;
    "$RT_PANEL_NOT_APPLICABLE")
      rt_err "transaction: panel '$panel' is not present on this host (status $rc)"
      rt_transaction_state_set FAILED >/dev/null 2>&1 || true
      return "$RT_PANEL_FAIL" ;;
    "$RT_PANEL_UNAVAILABLE")
      rt_err "transaction: panel '$panel' cannot be identified in this build (status $rc)"
      rt_transaction_state_set FAILED >/dev/null 2>&1 || true
      return "$RT_PANEL_FAIL" ;;
    *)
      rt_err "transaction: detection failed for panel '$panel' (status $rc)"
      rt_transaction_state_set FAILED >/dev/null 2>&1 || true
      return "$RT_PANEL_FAIL" ;;
  esac

  # 3. CAPABILITIES. Read before anything is mutated, because they decide what
  #    this transaction may do at all. Every emitted token must belong to the
  #    closed vocabulary: a token the engine has never heard of cannot be
  #    branched on, and silently ignoring it would let a panel claim a capability
  #    the engine then fails to honour.
  rc=0
  caps="$(rt_panel_capabilities "$panel")" || rc=$?
  if [ "$rc" -ne "$RT_PANEL_OK" ]; then
    rt_err "transaction: capabilities are unavailable for panel '$panel' (status $rc)"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  while IFS= read -r tok; do
    [ -n "$tok" ] || continue
    if ! rt_panel_capability_ok "$tok"; then
      rt_err "transaction: panel '$panel' reported an unknown capability '$tok'"
      rt_transaction_state_set FAILED >/dev/null 2>&1 || true
      return "$RT_PANEL_FAIL"
    fi
  done <<< "$caps"
  RT_TXN_CAPS="$caps"

  #    Refuse BEFORE mutating when a required capability is absent. This is the
  #    difference between a transaction that fails cheaply and one that mutates
  #    and is then forced to roll back.
  for need in $RT_TXN_REQUIRED_CAPABILITIES; do
    if ! rt_transaction_capability_present "$caps" "$need"; then
      rt_err "transaction: panel '$panel' does not declare the required capability '$need'"
      rt_transaction_state_set FAILED >/dev/null 2>&1 || true
      return "$RT_PANEL_FAIL"
    fi
  done

  # 4. STAGE HYGIENE, then CAPTURE. Clearing first means the snapshot records
  #    what THIS transaction observed; a stale record from an earlier run would
  #    be recorded just as faithfully and would restore the wrong state.
  rt_transaction_event capture
  if ! rt_transaction_stage_reset; then
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  rc=0
  rt_panel_backup_state "$panel" || rc=$?
  if [ "$rc" -ne "$RT_PANEL_OK" ]; then
    rt_err "transaction: could not capture the state of panel '$panel' (status $rc)"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  if ! rt_transaction_state_set CAPTURED; then
    return "$RT_PANEL_FAIL"
  fi

  # 5. THE SAFETY SNAPSHOT. Created AND validated before mutation. Both failures
  #    abort with the panel untouched, because the one thing a transaction must
  #    never do is change a panel it cannot put back.
  rt_transaction_event snapshot
  rc=0
  snap="$(rt_backup_create v2 "$panel")" || rc=$?
  if [ "$rc" -ne 0 ] || [ -z "$snap" ]; then
    rt_err "transaction: the safety snapshot could not be created; nothing was changed"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  if ! rt_transaction_snapshot_validate "$snap"; then
    rt_err "transaction: the safety snapshot did not validate; nothing was changed"
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  RT_TXN_SNAPSHOT="$snap"
  if ! rt_transaction_state_set SNAPSHOT; then
    return "$RT_PANEL_FAIL"
  fi

  # 6. THE MUTATION BOUNDARY. The flag is raised BEFORE the call, not after:
  #    a call that fails may still have changed something, and treating a failed
  #    attempt as "no mutation" is exactly how a half-written panel is left
  #    without a rollback. From here on, every failure rolls back.
  rt_transaction_event mutate
  RT_TXN_MUTATED=1
  if ! rt_transaction_state_set MUTATING; then
    return "$RT_PANEL_FAIL"
  fi
  rc=0
  rt_panel_install_template "$panel" "$src" || rc=$?
  if [ "$rc" -ne "$RT_PANEL_OK" ]; then
    rt_err "transaction: template placement failed for panel '$panel' (status $rc)"
    # CALLED DIRECTLY, never through a command substitution. A substitution runs
    # in a SUBSHELL, so the rollback would update its copy of the state model and
    # the copy would be discarded when it exited: the caller would then see the
    # pre-rollback state, and `return "$(...)"` would return the empty string
    # rather than a status. The rollback's own status deliberately does not
    # change the transaction's -- the transaction failed either way, and whether
    # the rollback succeeded is reported separately by its events.
    rt_transaction_rollback "$panel" "$snap" "$rc" || true
    return "$RT_PANEL_FAIL"
  fi

  # 7. STATIC VERIFICATION, then OPTIONAL LIVE VERIFICATION.
  rc=0
  rt_transaction_static_verify "$panel" || rc=$?
  if [ "$rc" -ne "$RT_PANEL_OK" ]; then
    rt_err "transaction: static verification did not pass for panel '$panel' (status $rc)"
    # Direct call, for the subshell reason stated at the placement failure above.
    rt_transaction_rollback "$panel" "$snap" "$rc" || true
    return "$RT_PANEL_FAIL"
  fi
  if ! rt_transaction_state_set VERIFIED; then
    return "$RT_PANEL_FAIL"
  fi

  if rt_transaction_capability_present "$caps" live_verify; then
    rc=0
    rt_transaction_live_verify "$panel" || rc=$?
    case "$rc" in
      "$RT_PANEL_OK") : ;;
      "$RT_PANEL_UNAVAILABLE")
        rt_warn "transaction: live verification was unavailable for panel '$panel'; this is not a rollback trigger" ;;
      "$RT_PANEL_NOT_APPLICABLE")
        rt_warn "transaction: live verification does not apply to panel '$panel'" ;;
      *)
        rt_err "transaction: live verification failed for panel '$panel' (status $rc)"
        # Direct call, for the subshell reason stated at the placement failure.
        rt_transaction_rollback "$panel" "$snap" "$rc" || true
        return "$RT_PANEL_FAIL" ;;
    esac
  fi

  # 8. COMMIT.
  if ! rt_transaction_state_set COMMITTED; then
    return "$RT_PANEL_FAIL"
  fi
  rt_transaction_event commit
  return "$RT_PANEL_OK"
}

# --- the public entry point -------------------------------------------------
rt_transaction_run() {
  # rt_transaction_run PANEL SOURCE
  #
  # THE one canonical transaction entry point. It returns the P3 status of the
  # transaction as a whole: 0 SUCCESS when the template is placed and verified,
  # 1 FAILURE otherwise (including a failure that was rolled back).
  #
  # stdout is empty; the step-by-step record is the `transaction:` event stream
  # on stderr.
  #
  # The lock is taken FIRST, before the request is even validated, so that
  # "one writer at a time" holds unconditionally rather than only for requests
  # that happen to be well formed. Every exit below releases it exactly once.
  local panel="${1:-}" src="${2:-}" rc=0

  rt_transaction_reset
  rt_transaction_event begin

  if ! rt_transaction_lock_acquire; then
    rt_transaction_state_set FAILED >/dev/null 2>&1 || true
    return "$RT_PANEL_FAIL"
  fi
  if ! rt_transaction_state_set LOCKED; then
    rt_transaction_lock_release
    return "$RT_PANEL_FAIL"
  fi
  rt_transaction_event locked

  rc=0
  rt_transaction_body "$panel" "$src" || rc=$?

  rt_transaction_lock_release
  return "$rc"
}
