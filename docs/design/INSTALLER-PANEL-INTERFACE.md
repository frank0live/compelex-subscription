# Installer Panel Interface

**P3 — interface freeze. No real panel adapter is implemented. No panel is detected, activated,
verified, restored or uninstalled. Nothing is mutated.**

| | |
|---|---|
| Date | 2026-09-23 |
| Tree | `feat/v1.2-multitemplate`, baseline HEAD `9bea99d` |
| Contract | `installer/panels/interface.sh`, `installer/panels/index.sh` |
| Consumed by | `installer/lib/row-template.sh` (explicit source) |
| Status | **frozen contract** — implemented by P5, driven by P4 |
| Does not change | P2: `backups.v2`, format marker, manifest, `selection.state`, `selection`, `meta`, `files`, strict containment, `rt_backup_create v2`, snapshot validation |

> **Scope boundary, stated first because it is the thing most likely to be misread.** P3 freezes an
> interface. There is no 3X-UI adapter, no PasarGuard adapter and no Rebecca adapter in this
> phase — not even an inert one. Every public operation currently returns `UNAVAILABLE`, and that
> is the correct answer rather than a placeholder: the capability genuinely does not exist yet.

---

## 1. Scope

P3 defines **one canonical installer-side panel interface** for exactly three panels — `3xui`,
`pasarguard`, `rebecca` — so that the future transaction engine (P4) can drive a panel without
knowing which panel implementation (P5) is underneath it.

```
                 Transaction Engine (P4)
                          |
                          v
                 Frozen Panel Interface        <-- P3: this document
                          |
        +-----------------+-----------------+
        |                 |                 |
   3X-UI impl       PasarGuard impl     Rebecca impl     <-- P5: not written
     [P5]              [P5]                [P5]
```

In scope: the contract itself — names, signatures, return codes, capability vocabulary, data
channels, mutation boundaries, orderings, ownership rules.

Out of scope: any implementation, any detection logic, any activation, any transaction engine, any
change to P2.

### Why one interface, and not two

There must be exactly ONE canonical surface. A second way to detect a panel, or a second way to
read capabilities, is a second thing that can disagree — and a transaction engine acting on the
disagreeing one cannot tell that it did. The rule is therefore enforced structurally, not by
convention: each public function is defined exactly once across the three files, and
`tests/installer-panel-interface.test.mjs` asserts that count.

---

## 2. Closed panel enum

```
3xui
pasarguard
rebecca
```

The authoritative definition is `RT_PANEL_IDS` in `installer/lib/row-template.sh`. It is **not
redeclared** in the panel layer: two copies of a closed set is a closed set with two chances to
drift.

Rules:

- An id outside the set **fails closed** — it is refused, never repaired.
- There is **no normalisation**. `3XUI`, `3xui `, ` 3xui`, `3xui2`, `nginx`, `.`, `..`, `../etc`,
  `3xui/../..`, `3xui\t` are all refused. Nothing is case-folded, trimmed or sanitised into a
  valid name.
- The only validator is `rt_panel_id_ok`, shared with P2. Every public operation routes through
  the single guard `rt_panel_arg_ok`, so no verb can forget the check.

An unknown panel id is **FAILURE (1)**, not `NOT_APPLICABLE (3)`: the request was malformed, which
is a different thing from a well-formed request about a panel that is absent.

---

## 3. Public functions

The seven frozen names, with the required logical operation each satisfies:

| Public function | Logical operation |
|---|---|
| `rt_panel_detect` | `panel_detect` |
| `rt_panel_capabilities` | `panel_capabilities` |
| `rt_panel_backup_state` | `panel_backup_state` |
| `rt_panel_install_template` | `panel_install_template` |
| `rt_panel_verify` | `panel_verify` |
| `rt_panel_restore_state` | `panel_restore_state` |
| `rt_panel_uninstall_template` | `panel_uninstall_template` |

These names are the contract. An internal dispatcher (`rt_panel_dispatch`,
`rt_panel_impl_for`) exists behind them, and may be restructured in P5 — the seven above may not
be renamed, removed or supplemented with a competing surface.

### Internal structure

```
rt_panel_<verb>            public contract; validates, then delegates
        |
rt_panel_impl_<verb>       internal implementation seam (P5 replaces these)
        |
rt_panel_dispatch          routes VERB PANEL [ARG...] through the registry
        |
rt_panel_impl_for          PANEL -> implementation prefix, or nothing if unimplemented
```

`rt_panel_impl_for` currently prints nothing for every panel. A panel with no implementation is
**absent from the mapping** — not mapped to a function that reports success, and not mapped to a
shared fallback. Absence is the representation of "not implemented", and an absent key cannot be
mistaken for a working one.

---

## 4. Exact signatures

```bash
rt_panel_detect             PANEL
rt_panel_capabilities       PANEL
rt_panel_backup_state       PANEL
rt_panel_install_template   PANEL SOURCE
rt_panel_verify             PANEL MODE
rt_panel_restore_state      PANEL SNAPSHOT
rt_panel_uninstall_template PANEL
```

Arity is enforced where it is meaningful:

- `install_template` requires `SOURCE`; missing it is FAILURE.
- `restore_state` requires `SNAPSHOT`; missing it is FAILURE.
- `verify` takes **exactly** two arguments. `rt_panel_verify 3xui static live` is FAILURE rather
  than a silent answer for `static`: answering one question while discarding the other gives a
  caller a plausible status for a request it did not make.
- `MODE` is a closed set — `static` or `live`. Case is not folded.

---

## 5. Inputs

| Input | Source | Validation |
|---|---|---|
| `PANEL` | positional | `rt_panel_id_ok` via `rt_panel_arg_ok`; closed enum |
| `SOURCE` | positional | non-empty; **P5 must additionally require an already-validated Row-Template shell** |
| `MODE` | positional | `rt_panel_verify_mode_ok`; closed set `static\|live` |
| `SNAPSHOT` | positional | non-empty; P5 must validate it as a format-2 snapshot before use |

Inputs are positional only. There is **no** free-form `KEY=VALUE` input anywhere in this layer —
that absence is what makes "no secret can be serialised" a structural property rather than a
promise.

---

## 6. Outputs

| Channel | Contents | Discipline |
|---|---|---|
| stdout | small deterministic machine-readable data | one token per line; no prose, no header, no decoration |
| `RT_PANEL_STAGE` | structured backup state | the P2 format, written via `rt_backup_panel_write` only |
| return code | operation status | the four codes in §7 |

`rt_panel_capabilities` is the only verb that produces stdout in normal operation. It emits zero
or more tokens, one per line, in `LC_ALL=C` lexical order, drawn only from §8.

A refusal emits **nothing** on stdout and a diagnostic on stderr. The machine channel stays clean
whether the call succeeds or fails, so a caller never has to parse prose to find out what
happened.

---

## 7. Return codes

Frozen. The meaning is identical for every panel and every operation, and no panel implementation
may redefine a code or invent one.

| Code | Symbol | Meaning |
|---|---|---|
| 0 | `RT_PANEL_OK` | SUCCESS — the operation completed **and its required verification passed** |
| 1 | `RT_PANEL_FAIL` | FAILURE — the operation was attempted or required, and failed |
| 2 | `RT_PANEL_UNAVAILABLE` | UNAVAILABLE — cannot be performed in this environment |
| 3 | `RT_PANEL_NOT_APPLICABLE` | NOT_APPLICABLE — the requested panel is not present / does not apply |

### SUCCESS requires verification

SUCCESS is not "the command ran". An operation that wrote a file but could not verify it has not
succeeded, and reporting success there is precisely the failure a transaction engine cannot detect
and therefore cannot recover from.

### UNAVAILABLE is not FAILURE

This distinction is load-bearing, and it is the single most important thing this contract freezes:

> **A transaction engine MUST NOT roll back solely because live verification is unavailable, when
> the required static verification succeeded.**

`FAILURE` means "checked and broken" — a rollback trigger. `UNAVAILABLE` means "could not check" —
not a rollback trigger. Collapsing them turns a missing capability on one host into data loss.

### NOT_APPLICABLE is a claim about the panel

It means the panel is absent or the operation does not apply to it. **P3 never returns it**, because
returning it would assert something about the panel, and P3 performs no detection. While
unimplemented, the honest status is UNAVAILABLE — a claim about the *implementation*, which P3 can
actually substantiate.

---

## 8. Capability vocabulary

A closed, machine-readable set. Ten tokens:

```
api_activation
db_activation
env_activation
file_placement
live_verify
per_admin_override
selection_read
selection_write
service_control
static_verify
```

| Token | Meaning |
|---|---|
| `selection_read` | can read the panel's current template selection |
| `selection_write` | can set the panel's current template selection |
| `file_placement` | installs a template file into the panel's own tree |
| `service_control` | can stop/start the panel's service |
| `static_verify` | can verify the installed shell without the running panel |
| `live_verify` | can verify through the running panel; may be UNAVAILABLE |
| `per_admin_override` | selection is per-administrator rather than global |
| `api_activation` | activation goes through the panel's HTTP API |
| `db_activation` | activation goes through the panel's database |
| `env_activation` | activation goes through an environment/config file |

Rules:

- **Closed.** A token outside the list is never emitted. An invented token is worse than a missing
  one: a caller cannot branch on a token it has never heard of, and cannot distinguish "no" from
  "new".
- **Deterministic.** Same panel, same build → byte-identical output, in the same order.
- **Machine-readable.** One token per line, `LC_ALL=C` sorted, no prose.
- **No speculative additions.** A capability may be added only when existing project architecture
  already proves it is needed.

---

## 9. `RT_PANEL_STAGE` contract

`RT_PANEL_STAGE` (defined in `installer/lib/row-template.sh` as `$RT_ROOT/.panel-stage`) is the
**only** structured channel for panel backup state. The panel layer references it; it does not
redeclare it, and it introduces no second staging root.

`rt_panel_backup_state` fills the stage. It does **not** build a snapshot — that is
`rt_backup_create v2`, called by P4. This layer must not duplicate P2.

### What must be staged

Written by `rt_backup_panel_write`, which is the only door into a snapshot:

```
panels/<panel>/selection.state     absent | empty | present
panels/<panel>/selection           the raw value, ONLY when state=present
panels/<panel>/meta                mechanism=db|env|api
                                   was_running=0|1
panels/<panel>/files               zero or more RELATIVE paths, one per line
```

`files` is **always written**, even when empty. 3X-UI places no file, so its record is legitimately
zero bytes. An absent file is indistinguishable from an incomplete snapshot and is refused by the
reader; the empty record is the only representation that keeps "we placed nothing" knowable.

`files` must name every file Row-Template itself placed inside the panel's managed root, and
nothing else. It is what makes "remove our files, never the directory" possible at restore time.

### Forbidden

- secrets, credentials, API tokens
- `eval`, or sourcing panel-generated data
- arbitrary `KEY=VALUE` blobs
- panel-specific snapshot schema

**The P2 format is frozen.** P3 adds no field to it.

---

## 10. Mutation boundaries

`installer/panels/interface.sh` and `installer/panels/index.sh` contain **no mutating command** —
no `rm`, `mv`, `cp`, `install`, `mkdir`, `chmod`, `chown`, `touch`, `truncate`, `tee`, `dd`, no
symlink creation, and no output redirection to a file. This is asserted structurally and
behaviourally by the test suite, which also sweeps every verb and confirms the tree is unchanged.

`rt_panel_detect` is **READ-ONLY by contract**, and this is a hard boundary: it must never create,
modify, move or remove a file; never write to a database; never start or stop a service; never
touch the network. Detection runs before any decision has been made, so a side effect there is a
side effect taken on no decision.

---

## 11. Verification tri-state

Verification is **not a boolean**, and the contract refuses to model it as one.

| MODE | Possible results |
|---|---|
| `static` | SUCCESS, FAILURE — **required**; static verification is mandatory and cannot be skipped |
| `live` | SUCCESS, FAILURE, **UNAVAILABLE** |

A boolean would conflate "checked and broken" with "could not check", and those two demand opposite
responses. The tri-state exists so P4 can tell them apart.

`UNAVAILABLE` is a legitimate result for `live` and is **not** a rollback trigger. `static`
verification failure **is**.

---

## 12. Restore ordering

The order is part of the contract, because a different order destroys data that no later step can
repair.

1. Validate the format-2 snapshot
2. Restore selection/state through the **same mechanism recorded in `meta`** (`db`, `env` or `api`)
3. Remove **only** the Row-Template-created files recorded in `files`
4. Restore the previous service running/stopped state (`was_running`)
5. Perform static verification — required
6. Live verification may be attempted if available

Step 1 comes first because a malformed snapshot must never be partially applied — a half-applied
restore is worse than none. Step 2 must use the recorded mechanism because a different mechanism
is a different write path and may not even address the same setting.

### Never

- **Never guess missing state.** An absent record means absent, not "infer one".
- **Never delete the containing operator directory.** The operator's own templates live there.
- **Never delete a file not recorded by Row-Template.**
- **Never restore from a malformed snapshot.**
- **Never automatically chain a second recovery if rollback itself fails.** A failed rollback stops
  and reports. A recovery loop that tries again is how a single fault becomes a corrupted install.

---

## 13. File ownership rules

The dividing line is **who created the file**.

| File | Owner | On rollback |
|---|---|---|
| Files listed in `files` | Row-Template | removed |
| Everything else in the panel's template root | the operator | never touched |
| The containing directory | the operator (shared) | **never** removed |
| Row-Template's own install tree (`RT_ROOT`) | Row-Template | subject to P2 containment rules |

Rules:

- `install_template` must **REFUSE if the destination already exists**. P2 captures no original
  bytes, so an overwrite is unrecoverable — this is a refusal, never a silent replace.
- `install_template` records every placed file through `files`; an unrecorded placement is a file
  that rollback will leave behind.
- `uninstall_template` removes only Row-Template-owned **recorded** files, and **fails closed on
  ambiguous ownership**. Leaving a file behind is recoverable; deleting an operator's file is not.
- Recursive deletion goes through P2's `rt_safe_rmdir`, which refuses `/`, `""`, `RT_ROOT`,
  `RT_BACKUPS`, `RT_BACKUPS_V2` and anything not **strictly inside** a backups root. The backups
  root itself is never a valid target.

---

## 14. Security rules

- **No `eval`.** Ever.
- **No sourcing of panel-generated data.** The only two files ever sourced by this layer are
  `interface.sh` and `index.sh`, named explicitly by `rt_panels_load`. Neither panel layer sources
  anything at load time.
- **No arbitrary shell fragments** and **no dynamically constructed executable commands** — no
  `bash -c`, no `xargs`, no rebuilt argument vectors.
- **No arbitrary `KEY=VALUE` blobs** from panels.
- **No unvalidated filesystem paths.** Every path a panel implementation records must satisfy
  `rt_backup_relpath_ok`, the same closed grammar the reader uses, so a path the writer emits can
  never be one the reader refuses.
- **No secrets** in any staging record, by construction: `rt_backup_panel_write` takes positional
  arguments and writes exactly four files from them, so there is no mechanism by which a credential
  could reach a snapshot.
- A snapshot is **untrusted input**. It is read as data and is never sourced or evaluated.

---

## 15. P4 obligations

P4 implements the transaction engine. It must be expressible entirely through this interface:

```
BEGIN
  -> acquire single-flight lock
  -> resolve/detect target panel        rt_panel_detect
  -> read capabilities                  rt_panel_capabilities
  -> capture panel state                rt_panel_backup_state
  -> create format-2 safety snapshot    rt_backup_create v2      (P2, not this layer)
  -> install panel file(s)              rt_panel_install_template
  -> apply selection                    (through the panel's recorded mechanism)
  -> static verify                      rt_panel_verify PANEL static
  -> optional live verify               rt_panel_verify PANEL live
  -> COMMIT

Failure path:
ROLLBACK
  -> validate safety snapshot
  -> restore panel selection            rt_panel_restore_state
  -> remove recorded Row-Template files (per the restore ordering, §12)
  -> restore previous service state
  -> static verify
  -> STOP
```

P4 obligations that follow from this contract:

- **Roll back on FAILURE, not on UNAVAILABLE.** Static verification failure is a rollback trigger;
  live verification being unavailable is not.
- **Validate the snapshot before applying it**, and restore through the recorded mechanism.
- **Stop after a failed rollback.** Do not chain a second recovery.
- **Treat SUCCESS as requiring verification**, not as "the step ran".

**P3 implements none of this flow.** No lock, no transaction, no commit, no rollback exists in P3.

---

## 16. P5 implementation obligations

P5 supplies real adapters. For each panel it implements:

1. **Detection must be evidence-based.** Identity must come from positive, corroborated evidence.
   A directory name alone proves nothing (anyone can create `/etc/3x-ui`). A binary name alone
   proves nothing (a leftover binary outlives its panel). A weak heuristic alone proves nothing.
   **Two independent signals must agree.** Where they disagree, or only one is available, the
   answer is FAILURE rather than a guess — wrongly identifying a panel means P4 will stage, place
   files into, and then restore stale state on a panel that was never there.

2. **Capabilities** must be drawn only from §8 and emitted deterministically.

3. **`backup_state`** must stage exactly §9, through `rt_backup_panel_write`, and must never record
   a file it did not place.

4. **`install_template`** must refuse an existing destination, place only Row-Template-owned files,
   stay inside the panel-managed template root, never recursively delete a panel-owned directory,
   use safe atomic placement where the panel allows it, and record every placed file.

5. **`verify`** must implement the tri-state, and must return UNAVAILABLE — not FAILURE — when live
   verification cannot be performed in this environment.

6. **`restore_state`** must follow §12 exactly, including the two prohibitions that matter most:
   never delete the containing directory, never delete an unrecorded file.

7. **`uninstall_template`** must remove only recorded files and fail closed on ambiguity.

8. **Add an implementation by editing `rt_panel_impl_for` only.** The contract in `interface.sh`
   must not need to change to admit a new panel.

9. **Do not create a competing surface.** One function per operation.

---

## 17. Explicit non-goals

P3 does **not**:

- implement any real panel adapter — **no `3xui.sh`, `pasarguard.sh` or `rebecca.sh` exists**
- detect any panel
- activate, deactivate or restart anything
- write, move or delete any file
- build, validate or restore a snapshot
- implement any part of the transaction flow (lock, commit, rollback)
- change P2 in any way
- add a second interface, a second staging root, or a second panel enum
- add a capability token speculatively

`installer/lib/row-template.sh` remains the single installer orchestration library. It gains only
one thing in P3: an explicit loader for this layer. There is no broad installer refactor.

---

## Appendix — where each rule is enforced

| Rule | Enforced by |
|---|---|
| Closed panel enum | `rt_panel_id_ok` (P2), reached via `rt_panel_arg_ok` |
| Return-code meanings | `RT_PANEL_{OK,FAIL,UNAVAILABLE,NOT_APPLICABLE}` |
| Capability vocabulary | `RT_PANEL_CAPABILITIES`, `rt_panel_capability_ok` |
| Verify modes | `RT_PANEL_VERIFY_MODES`, `rt_panel_verify_mode_ok` |
| One surface per operation | exactly one top-level definition of each public name |
| No mutation | no mutating command in either panel file |
| No `eval` / no sourcing | no `eval`; `.`/`source` only in `rt_panels_load` |
| Staging format | `rt_backup_panel_write` (P2) |
| Path grammar | `rt_backup_relpath_ok` (P2), used by writer and reader |
| Containment | `rt_is_within` / `rt_safe_rmdir` (P2) |

All of the above are asserted by `tests/installer-panel-interface.test.mjs`.
