#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# installer/panels/index.sh — the panel registry (P3).
#
# WHY THIS FILE EXISTS SEPARATELY. interface.sh states the CONTRACT: names,
# signatures, return codes, obligations. This file answers one question and only
# one: WHICH IMPLEMENTATION, IF ANY, backs a given panel. Keeping the two apart
# means the contract can be read without reading a dispatch table, and — more
# importantly — that P5 can add an implementation by changing this file alone,
# without touching a single line of the contract.
#
# TODAY THE ANSWER IS ALWAYS "NONE". P5 has not been written, so no panel has an
# implementation. This file does not pretend otherwise: it does not define a
# stub that returns SUCCESS, and it does not fall back to a generic
# implementation. Returning success for work that did not happen is the one
# failure mode a transaction engine cannot detect and cannot recover from.
#
# There are deliberately NO panel-specific files here (3xui.sh, pasarguard.sh,
# rebecca.sh). A file that exists is a file something can bind to; a stub that
# pretends to be an implementation is how a "temporary" shim becomes permanent.
# ---------------------------------------------------------------------------

# --- implementation files ---------------------------------------------------
# The adapter is sourced HERE, by the registry, and not by the orchestration
# library. That is the property this file exists to provide: P5 adds an
# implementation by changing the registry, without touching the contract.
#
# It is sourced by its EXPLICIT name, never by a glob -- the set of files that
# can alter installer behaviour must be fixed and reviewable, and a glob would
# let a stray file join it.
#
# ABSENT IS NOT FATAL, and it is not silent either. A payload without the
# adapter simply has no 3xui implementation, which the registry reports as
# "none" -- the honest answer, and one no caller can mistake for a working
# implementation. Registering a panel whose file is missing would instead reach
# an undefined function at call time, and "command not found" is an exit 127
# that no return-code contract describes.
RT_PANEL_3XUI_LOADED=""
rt_panel_registry_dir="$(dirname "${BASH_SOURCE[0]}")"
if [ -f "$rt_panel_registry_dir/3xui.sh" ]; then
  if . "$rt_panel_registry_dir/3xui.sh"; then
    RT_PANEL_3XUI_LOADED=1
  else
    rt_err "panel registry: the 3xui adapter exists but could not be loaded"
  fi
fi
unset rt_panel_registry_dir

# --- implementation registry -----------------------------------------------
# Maps a panel id to the function that implements it, or to nothing at all.
#
# P5 extends this. The shape is fixed now so the addition is mechanical and
# reviewable: one line per panel, the panel id from the closed enum, and a
# function name. NOTHING here may invent a panel id that is not in
# RT_PANEL_IDS — rt_panel_impl_for refuses anything else before consulting this
# table, so a typo cannot introduce a new panel.
#
# A panel with no implementation is simply ABSENT from this mapping. It is not
# mapped to a function that reports success, and it is not mapped to a shared
# fallback: absence is the representation of "not implemented", and an absent
# key is impossible to mistake for a working one.
rt_panel_impl_for() {
  # echo the implementation prefix for PANEL (e.g. "3xui" -> the functions
  # rt_panel_3xui_*), or nothing when no implementation is present. Always
  # exits 0: "no implementation" is a normal answer, not an error — the caller
  # decides what a missing implementation means for its operation, because that
  # differs per operation (UNAVAILABLE for most, NOT_APPLICABLE for detection).
  local panel="${1:-}"
  rt_panel_id_ok "$panel" || return 0
  # P5A: 3X-UI is implemented. It is reported ONLY when its adapter actually
  # loaded, so a payload missing the file reports "none" rather than sending a
  # caller to a function that is not there.
  #
  # The other two panels are still ABSENT from this mapping on purpose. They are
  # not mapped to a function that reports success, and not mapped to a shared
  # fallback: absence is the representation of "not implemented", and an absent
  # key is impossible to mistake for a working one.
  case "$panel" in
    3xui)
      if [ -n "${RT_PANEL_3XUI_LOADED:-}" ]; then
        printf '%s\n' "3xui"
      fi
      return 0 ;;
  esac
  # P5B/P5C: add one line per implemented panel here.
  return 0
}

# --- dispatch --------------------------------------------------------------
# The single place where an operation is routed. Every public function in
# interface.sh ends here, so the "is it implemented?" decision is made once and
# cannot diverge between operations.
#
# P5 fills in the per-verb dispatch. The UNAVAILABLE result below is the honest
# status for this build: the OPERATION is not implemented. It is not
# NOT_APPLICABLE, because establishing that a panel does not apply would require
# detection — logic that P3 deliberately does not have. Claiming
# NOT_APPLICABLE without having looked would be a fabricated observation.
rt_panel_dispatch() {
  # rt_panel_dispatch VERB PANEL [ARG...]
  local verb="${1:-}" panel="${2:-}"
  shift 2 2>/dev/null || true
  rt_panel_id_ok "$panel" || return "$RT_PANEL_FAIL"

  local impl
  impl="$(rt_panel_impl_for "$panel")"

  if [ -z "$impl" ]; then
    # No implementation for this panel in this build. Every operation reports
    # UNAVAILABLE, and NOTHING is mutated: there is no code below this point
    # that could mutate anything, which is what makes the read-only guarantee
    # of the whole layer checkable by inspection rather than by trust.
    return "$RT_PANEL_UNAVAILABLE"
  fi

  # ONE ARM PER IMPLEMENTED OPERATION, written out rather than built from
  # "$impl:$verb". A dynamically constructed command name is a call no reviewer
  # can enumerate, and this layer's whole value is that its reachable behaviour
  # is fixed text. A verb with no arm fails closed below.
  #
  # THE PANEL IS FORWARDED FIRST. The implementation seam is called with the
  # same argument list the PUBLIC function received -- PANEL, then the rest --
  # so an adapter verb's $1 is the panel exactly as it is in rt_panel_<verb>.
  # Dropping it here would leave every adapter verb one argument short, which
  # under `set -u` is an immediate unbound-variable abort rather than a wrong
  # answer, but is a defect either way.
  case "$impl:$verb" in
    3xui:detect)             rt_panel_3xui_detect "$panel" "$@" ;;
    3xui:capabilities)       rt_panel_3xui_capabilities "$panel" "$@" ;;
    3xui:backup_state)       rt_panel_3xui_backup_state "$panel" "$@" ;;
    3xui:install_template)   rt_panel_3xui_install_template "$panel" "$@" ;;
    3xui:verify)             rt_panel_3xui_verify "$panel" "$@" ;;
    3xui:restore_state)      rt_panel_3xui_restore_state "$panel" "$@" ;;
    3xui:uninstall_template) rt_panel_3xui_uninstall_template "$panel" "$@" ;;
    *)
      rt_err "panel dispatch: no dispatch arm for implementation '$impl' verb '$verb'"
      return "$RT_PANEL_FAIL" ;;
  esac
}

# --- the implementation seam ------------------------------------------------
# interface.sh declares each public operation as a call to ONE internal
# rt_panel_impl_<verb>, and defines those there as UNAVAILABLE stubs: the
# contract layer must not have to know that an implementation exists, and a
# build with no adapters must still answer honestly.
#
# This file fills the seam in. Each router is a one-line pass-through to the
# registry, so "is this panel implemented?" is decided in exactly ONE place
# (rt_panel_impl_for) and cannot diverge between operations. The seven public
# names, their signatures and their return codes are untouched -- this is the
# restructuring P3 explicitly reserved for P5, not a change to the contract.
rt_panel_impl_detect()             { rt_panel_dispatch detect "$@"; }
rt_panel_impl_capabilities()       { rt_panel_dispatch capabilities "$@"; }
rt_panel_impl_backup_state()       { rt_panel_dispatch backup_state "$@"; }
rt_panel_impl_install_template()   { rt_panel_dispatch install_template "$@"; }
rt_panel_impl_verify()             { rt_panel_dispatch verify "$@"; }
rt_panel_impl_restore_state()      { rt_panel_dispatch restore_state "$@"; }
rt_panel_impl_uninstall_template() { rt_panel_dispatch uninstall_template "$@"; }
