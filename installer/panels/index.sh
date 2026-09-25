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
# ALL THREE PANELS ARE IMPLEMENTED (3X-UI since P5A; PasarGuard and Rebecca
# since 1.3.0), each by one adapter file beside this one. The registry still
# never defines a stub that returns SUCCESS and never falls back to a generic
# implementation: a panel whose adapter file is absent or does not load is
# reported as having no implementation, which every verb answers UNAVAILABLE.
# Returning success for work that did not happen is the one failure mode a
# transaction engine cannot detect and cannot recover from.
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
RT_PANEL_PASARGUARD_LOADED=""
RT_PANEL_REBECCA_LOADED=""
rt_panel_registry_dir="$(dirname "${BASH_SOURCE[0]}")"
if [ -f "$rt_panel_registry_dir/3xui.sh" ]; then
  if . "$rt_panel_registry_dir/3xui.sh"; then
    RT_PANEL_3XUI_LOADED=1
  else
    rt_err "panel registry: the 3xui adapter exists but could not be loaded"
  fi
fi
if [ -f "$rt_panel_registry_dir/pasarguard.sh" ]; then
  if . "$rt_panel_registry_dir/pasarguard.sh"; then
    RT_PANEL_PASARGUARD_LOADED=1
  else
    rt_err "panel registry: the pasarguard adapter exists but could not be loaded"
  fi
fi
if [ -f "$rt_panel_registry_dir/rebecca.sh" ]; then
  if . "$rt_panel_registry_dir/rebecca.sh"; then
    RT_PANEL_REBECCA_LOADED=1
  else
    rt_err "panel registry: the rebecca adapter exists but could not be loaded"
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
  # Each panel is reported ONLY when its adapter actually loaded, so a payload
  # missing a file reports "none" rather than sending a caller to a function
  # that is not there. 3X-UI since P5A; PasarGuard and Rebecca since 1.3.0.
  case "$panel" in
    3xui)       if [ -n "${RT_PANEL_3XUI_LOADED:-}" ]; then printf '%s\n' "3xui"; fi ;;
    pasarguard) if [ -n "${RT_PANEL_PASARGUARD_LOADED:-}" ]; then printf '%s\n' "pasarguard"; fi ;;
    rebecca)    if [ -n "${RT_PANEL_REBECCA_LOADED:-}" ]; then printf '%s\n' "rebecca"; fi ;;
  esac
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
    pasarguard:detect)             rt_panel_pasarguard_detect "$panel" "$@" ;;
    pasarguard:capabilities)       rt_panel_pasarguard_capabilities "$panel" "$@" ;;
    pasarguard:backup_state)       rt_panel_pasarguard_backup_state "$panel" "$@" ;;
    pasarguard:install_template)   rt_panel_pasarguard_install_template "$panel" "$@" ;;
    pasarguard:verify)             rt_panel_pasarguard_verify "$panel" "$@" ;;
    pasarguard:restore_state)      rt_panel_pasarguard_restore_state "$panel" "$@" ;;
    pasarguard:uninstall_template) rt_panel_pasarguard_uninstall_template "$panel" "$@" ;;
    rebecca:detect)                rt_panel_rebecca_detect "$panel" "$@" ;;
    rebecca:capabilities)          rt_panel_rebecca_capabilities "$panel" "$@" ;;
    rebecca:backup_state)          rt_panel_rebecca_backup_state "$panel" "$@" ;;
    rebecca:install_template)      rt_panel_rebecca_install_template "$panel" "$@" ;;
    rebecca:verify)                rt_panel_rebecca_verify "$panel" "$@" ;;
    rebecca:restore_state)         rt_panel_rebecca_restore_state "$panel" "$@" ;;
    rebecca:uninstall_template)    rt_panel_rebecca_uninstall_template "$panel" "$@" ;;
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

# --- outside the transaction (1.3.0) -----------------------------------------
# Two helpers the MANAGEMENT commands use and the transaction engine never
# does. They are not a second way to perform any of the seven verbs above:
#
#   rt_panel_refresh_page PANEL SOURCE [place]
#       replace the page an adapter has placed (after a branding or design
#       change) WITHOUT touching the panel's selection; `place` places it even
#       when none is there yet (manual activation). 0 replaced, 3 nothing of
#       ours is placed, 2 unavailable here, 1 failure.
#   rt_panel_status PANEL
#       echo active | inactive | manual | unknown, for the dashboard.
#
# 3X-UI places nothing: its page is served from the install root directly, so
# refresh is NOT_APPLICABLE and its status stays with rt_status_theme.
rt_panel_refresh_page() {
  local panel="${1:-}" impl
  rt_panel_id_ok "$panel" || return "$RT_PANEL_FAIL"
  shift
  impl="$(rt_panel_impl_for "$panel")"
  case "$impl" in
    pasarguard) rt_panel_pasarguard_refresh "$@" ;;
    rebecca)    rt_panel_rebecca_refresh "$@" ;;
    3xui)       return "$RT_PANEL_NOT_APPLICABLE" ;;
    *)          return "$RT_PANEL_UNAVAILABLE" ;;
  esac
}

rt_panel_status() {
  local panel="${1:-}" impl
  rt_panel_id_ok "$panel" || return "$RT_PANEL_FAIL"
  impl="$(rt_panel_impl_for "$panel")"
  case "$impl" in
    pasarguard) rt_panel_pasarguard_status ;;
    rebecca)    rt_panel_rebecca_status ;;
    *)          printf 'unknown' ;;
  esac
}
