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
  # P5: add one line per implemented panel here, e.g.
  #   printf '%s\n' "3xui"   # once installer/panels/3xui.sh exists
  # Until then every panel is unimplemented, and this function says so by
  # printing nothing.
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

  # P5: dispatch to rt_panel_${impl}_${verb} "$@" once implementations exist.
  # Until then a non-empty implementation id is itself a bug in this file, and
  # failing closed is the correct response to it.
  rt_err "panel dispatch: no dispatch arm for implementation '$impl' verb '$verb'"
  return "$RT_PANEL_FAIL"
}
