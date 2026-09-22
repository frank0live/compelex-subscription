# Installer Transaction Design

**P4 — transaction engine skeleton. The engine orchestrates the frozen P3 panel interface. It
implements no panel behaviour: no real detection, no real activation, no real restore, no
panel-specific file placement, and no panel-specific database, API or environment mutation.**

| | |
|---|---|
| Date | 2026-09-23 |
| Tree | `feat/v1.2-multitemplate`, baseline HEAD `b627e28` |
| Module | `installer/lib/transaction.sh` |
| Loaded by | `installer/lib/row-template.sh` (explicit source, after the panel layer) |
| Entry point | `rt_transaction_run PANEL SOURCE` |
| Depends on | the frozen P3 interface (`rt_panel_*`) and the frozen P2 format (`RT_PANEL_STAGE`, `rt_backup_create v2`, `rt_backup_snapshot_check`, `rt_is_within`) |
| Status | **implemented skeleton** — sequenced, locked, and tested; every panel operation behind it still reports `UNAVAILABLE` |
| Does not change | P2 snapshots, P3 interface semantics, the user-facing `rollback` command, `VERSION`, or any release artefact |

> **Scope boundary, stated first.** P4 owns ORDER. It decides what happens, in what sequence, under
> what lock, and what is done when a step fails after the point of no return. It does not decide
> what any panel operation MEANS. Every panel-specific act is a call into the P3 contract, and
> every one of those calls currently returns `UNAVAILABLE` because P5 has not been written.

---

## 1. Scope

The engine exists to make one guarantee checkable:

> A template is either fully placed and verified, or the panel is left as it was found.

Everything in this document is a consequence of that sentence. The order is fixed because a
different order can leave a panel pointing at a file that is not there; the lock exists because two
transactions interleaving a capture and a restore produce a state neither of them recorded; the
safety snapshot exists because "put it back" is only possible if "what it was" was written down
first.

**In scope for P4**

- single-flight transaction locking
- a closed transaction state model with enforced transitions
- the ordered phase sequence: lock, identify, capabilities, capture, snapshot, mutate, verify, commit
- the mutation boundary and the decision it forces
- rollback sequencing, attempted exactly once
- deterministic failure handling and reporting
- a stable, minimal event stream

**Out of scope for P4**

- real panel detection, activation, placement, restore or uninstall (P5)
- crash recovery and durable transaction journalling (not scheduled)
- wiring format-2 snapshots into the user-facing `rollback` command (deliberately not done)
- any panel-specific path, service name, database statement, environment key or API endpoint

---

## 2. Transaction phases

The engine encodes this order explicitly. Each arrow is a call into the frozen P3 contract or into
a P2 primitive; nothing else happens between them.

```
BEGIN                     rt_transaction_event begin
  |
  +-- acquire lock        rt_transaction_lock_acquire          (flock, non-blocking)
  |
  +-- validate request    rt_panel_id_ok        (closed enum, no normalisation)
  |                       SOURCE present
  |
  +-- detect              rt_panel_detect                      READ-ONLY
  |
  +-- capabilities        rt_panel_capabilities                every token validated
  |                       required capabilities present
  |
  +-- capture             rt_transaction_stage_reset           clear stale state
  |                       rt_panel_backup_state               fills RT_PANEL_STAGE
  |
  +-- snapshot            rt_backup_create v2 PANEL            format-2 safety snapshot
  |                       rt_transaction_snapshot_validate     must validate
  |
  +-- MUTATE              rt_panel_install_template            <-- boundary crossed here
  |
  +-- verify static       rt_panel_verify PANEL static         mandatory
  |
  +-- verify live         rt_panel_verify PANEL live           optional, tri-state
  |
  +-- COMMIT
  |
  +-- release lock
```

and, for any failure at or after the boundary:

```
FAIL
  |
  +-- validate snapshot   rt_transaction_snapshot_validate     before anything is touched
  |
  +-- restore             rt_panel_restore_state               the P3 frozen order applies
  |
  +-- verify static       rt_panel_verify PANEL static         mandatory
  |
  +-- verify live         optional; UNAVAILABLE is not a failure here
  |
  +-- report              rollback succeeded, or rollback-failed
  |
  +-- release lock
  |
  +-- STOP                no second recovery attempt
```

**Failure BEFORE the boundary** is an abort, not a rollback: the panel has not been touched, so
there is nothing to undo, and running a restore against an unmutated panel would write state that
was never displaced.

---

## 3. Lock model

**Primitive: `flock`, on a dedicated file descriptor, in non-blocking mode.**

```
$RT_ROOT/.locks/transaction.lock      mode 0700 directory, 0600 file
descriptor 9                          reserved by this engine
```

Every alternative was rejected for a specific reason, and the reasons are the design:

| rejected | why |
|---|---|
| a PID file | cannot distinguish a live holder from a recycled PID, so it either refuses a free lock or grants a held one |
| polling or a sleep/retry loop | converts "busy" into a delay and a delay into a hang; a transaction that waits is a transaction whose caller's decision has gone stale |
| stale lock-file heuristics | cannot tell stale from slow, so the heuristic eventually removes a LIVE lock — the exact failure a lock exists to prevent |
| a background lock-keeper process | a second process that can die while holding the lock |

`flock` provides the one property the others cannot: **the kernel releases the lock when the owning
process exits**, including on a crash or a kill. That makes "released on success, on handled
failure, and on any exit" true without depending on any cleanup path running.

Rules the implementation enforces:

- **One writer at a time.** `flock -n` fails immediately; a second concurrent transaction is
  refused at once rather than queued.
- **Fail closed without `flock`.** If `flock` is not available the engine refuses to run at all.
  Running unlocked is not a degraded mode: two transactions can interleave a capture and a
  rollback against the same panel, and the result is a state neither of them recorded.
- **The lock file is never unlinked.** Unlinking is the classic race in which a second process
  creates a new inode and both hold "the" lock. The file is a rendezvous, not state.
- **No global `/tmp` name.** The lock lives inside the install root it protects, so two unrelated
  installs do not contend and neither can lock the other out.
- **The lock is taken before the request is validated.** This is deliberate: "one writer at a time"
  then holds unconditionally, rather than only for requests that happen to be well formed.
- **Descriptor reuse is refused.** If fd 9 is already open the engine refuses rather than
  clobbering it, because the holder would otherwise silently lose its lock.
- **A symlinked root, lock directory or lock file is refused.**

---

## 4. Return-code handling

The P3 codes are preserved verbatim and are never reinterpreted per panel:

| code | meaning |
|---|---|
| `0` | SUCCESS |
| `1` | FAILURE |
| `2` | UNAVAILABLE — cannot be performed in this environment; **not** a failure |
| `3` | NOT_APPLICABLE — the panel is not present / the operation does not apply |

`RT_PANEL_OK`, `RT_PANEL_FAIL`, `RT_PANEL_UNAVAILABLE` and `RT_PANEL_NOT_APPLICABLE` belong to the
frozen contract. The engine reads them and never redeclares them.

Where the engine makes a decision, it is stated rather than implied:

| step | SUCCESS | FAILURE | UNAVAILABLE | NOT_APPLICABLE |
|---|---|---|---|---|
| detect | continue | abort | abort | abort |
| capabilities | continue | abort | abort | abort |
| backup_state | continue | abort | abort | abort |
| install_template | continue | rollback | rollback | rollback |
| verify static | continue | rollback | **rollback** | **rollback** |
| verify live | continue | rollback | **commit** | commit, reported |

The two rows in bold are the ones that matter:

- **Detection `UNAVAILABLE` aborts.** The panel may well be present, but the engine cannot establish
  that it is. Proceeding would mean capturing state from, writing into, and potentially restoring
  onto a panel it has not identified.
- **Static `UNAVAILABLE` and `NOT_APPLICABLE` both roll back.** Static verification is mandatory,
  and a mandatory check that is permitted to be skipped is not mandatory. "Could not verify" is not
  "verified".
- **Live `UNAVAILABLE` commits.** See section 7.

---

## 5. Mutation boundary

The boundary is the instant the engine begins changing the panel. It is represented by one flag,
`RT_TXN_MUTATED`, and one state, `MUTATING`.

**The flag is raised BEFORE the placement call, not after.** A placement call that fails may still
have changed something — a partially written file, a half-applied directory. Treating a failed
attempt as "no mutation happened" is precisely how a half-written panel is left behind with no
rollback to undo it.

The boundary forces exactly two behaviours:

| side of the boundary | a failure means |
|---|---|
| before | abort. Nothing was changed, so nothing is undone. |
| at or after | roll back, **exactly once** |

The rollback is never recursive. The engine does not re-enter `rt_transaction_run`, does not chain a
rollback-of-rollback, and does not retry a failed restore. A recovery loop is how a single fault
becomes a corrupted install.

---

## 6. Safety snapshot requirement

**No transaction proceeds without a validated safety snapshot.**

```
RT_PANEL_STAGE  --rt_panel_backup_state-->  staged state
staged state    --rt_backup_create v2 PANEL-->  format-2 snapshot under $RT_BACKUPS_V2
snapshot        --rt_transaction_snapshot_validate-->  must succeed
                                                    |
                                          only now may placement begin
```

Three failures abort with the panel untouched, and all three are tested:

1. `rt_panel_backup_state` fails — there is nothing to record, so there is nothing to restore from.
2. `rt_backup_create v2` fails — no snapshot exists.
3. `rt_transaction_snapshot_validate` fails — a snapshot exists but is not one this project
   produced, or is incomplete.

Validation is not a formality. It re-checks that the snapshot is a valid format-2 snapshot **inside
the format-2 namespace**, because the same function guards the rollback path: a rollback that
restored from a path outside the namespace would be reading something no writer in this project
produced.

**Format 2 stays invisible to the user-facing `rollback` command.** The engine keeps its own
reference to the snapshot it created, in memory, for the duration of the transaction. Wiring
format-2 snapshots into `rt_cmd_rollback` is a separate change with its own review, and it is not
made here.

---

## 7. Verification policy

Verification is not a boolean. `false` conflates "checked and broken" with "could not check", and
those two demand opposite responses. The engine keeps three outcomes distinct:

```
PASS          the check ran and succeeded
FAIL          the check ran and the change is broken
UNAVAILABLE   the check could not be run here
```

**Static verification is mandatory.** Any non-zero status fails the transaction and, past the
boundary, rolls it back. This is the one place the engine deliberately narrows a P3 code.

**Live verification is optional evidence.**

- `PASS` — recorded, and the transaction continues.
- `FAIL` — the panel itself reports a broken change, so the transaction rolls back.
- `UNAVAILABLE` — recorded and reported, and **not** a rollback trigger. The transaction may commit
  provided the mandatory static verification passed.
- `NOT_APPLICABLE` — recorded and reported, and **not** silently reinterpreted as a success.

> A transaction engine MUST NOT roll back solely because live verification was unavailable.
> Rolling back a change that succeeded, because the host could not reach the panel's API, converts
> a missing capability into data loss.

The engine also refuses to *start* when a panel does not declare `static_verify`. Without it the
mandatory check can never pass, so the transaction would mutate and then be forced to roll back — a
guaranteed round trip that risks data in order to learn nothing.

---

## 8. Rollback ordering

The order is part of the contract, because a different order destroys data that no later step can
repair.

1. **Validate the safety snapshot.** Before anything is touched. A malformed snapshot is refused,
   never partially applied — a half-applied restore is worse than none.
2. **`rt_panel_restore_state PANEL SNAPSHOT`.** The panel layer owns *what* to restore and *through
   which mechanism*; the recorded `mechanism` is the one that must be used, because a different
   write path may not even address the same setting.
3. **Static verification — mandatory.** This is what makes "the restore worked" a checked claim
   rather than an assertion.
4. **Live verification — optional.** `UNAVAILABLE` and `NOT_APPLICABLE` are acceptable here, and
   neither is reported as a pass.

**The engine does not touch `selection`, `files` or the service itself.** Those live behind
`rt_panel_restore_state`. Duplicating them here would create a second restore implementation that
can disagree with the first, and only one of them can be right.

**Never:**

- guess missing state — an absent record means absent, not "infer one"
- delete the containing operator directory
- delete a file Row-Template did not record
- restore from a malformed snapshot
- automatically chain a second recovery

---

## 9. Rollback-failure policy

**If rollback fails: report both failures separately, and stop.**

```
transaction:rollback-failed
  the original failure was status N
  rollback also failed (<reason>); the panel was left as the failed attempt left it
  no further recovery is attempted automatically
```

The two failures are kept distinct because collapsing them loses the fact that two different things
went wrong, and the second one means the install is in a state neither the operator nor a later run
may assume anything about.

The transaction's exit status is `FAILURE` whether or not the rollback succeeded — the transaction
failed either way. **Whether the rollback succeeded is carried by the events**, not by the status:

| event | meaning |
|---|---|
| `transaction:rollback` | a rollback was attempted |
| `transaction:rollback-failed` | it did not complete |

A rollback whose restore fails is not retried, and the state model ends at `FAILED` rather than
`ROLLED_BACK`. That distinction is load-bearing: `ROLLED_BACK` means the panel was returned to its
recorded state, and claiming it when the restore failed would tell a caller the opposite of the
truth.

---

## 10. Stage hygiene

`RT_PANEL_STAGE` is cleared before every capture, so a snapshot records what *this* transaction
observed. Stale state is the dangerous direction: a capture that silently failed would otherwise
leave the previous record in place, and the snapshot would faithfully record the wrong thing.

**`rt_safe_rmdir` is deliberately not used.** It is the recursive-delete choke point, but it permits
only descendants of the two *backup* namespaces. The staging tree is not one of them, so reusing it
would either fail or require widening the choke point — and widening a safety net is how a safety
net stops being one.

`rt_transaction_stage_reset` carries the same strictness for its own root:

- the path must be exactly `RT_PANEL_STAGE`, and its basename must be the one the engine expects
  (`.panel-stage`), so a tampered variable cannot redirect the delete at an unrelated directory
- it must resolve **strictly inside** `RT_ROOT` — `rt_is_within` refuses equality, so `RT_ROOT`
  itself is rejected
- `/` is refused outright
- a symlink is refused outright

An unset or unexpected value is refused rather than defaulted, because an unset variable must never
mean "delete something".

---

## 11. Panel-interface dependency

The engine drives the frozen P3 surface and nothing else:

```
rt_panel_detect          rt_panel_backup_state    rt_panel_verify
rt_panel_capabilities    rt_panel_install_template
                         rt_panel_restore_state
```

`rt_panel_uninstall_template` is part of the P3 contract but is **not** part of the P4 flow: an
uninstall is not one of the phases a transaction performs.

The engine:

- defines **no** `rt_panel_*` function of its own — a second definition would be a second panel
  abstraction
- never reaches past the contract into `rt_panel_impl_*`
- never redeclares a P3 return code
- contains **no panel name**, so it cannot branch on identity

**It branches on CAPABILITIES instead.** That is the substitution that makes the engine generic:

```
if the panel declares a capability:      perform the generic operation it names
NOT:
if the panel is called X:                perform X-specific behaviour
```

Capabilities are read before anything is mutated, and every emitted token is checked against the
closed P3 vocabulary. A token the engine has never heard of cannot be branched on, and silently
ignoring it would let a panel claim a capability the engine then fails to honour.

Two capabilities are **required**, because the engine's promise to its caller is "the template is in
place *and* it was verified":

| capability | why it is required |
|---|---|
| `file_placement` | without it there is no operation to perform |
| `static_verify` | without it the mandatory verification can never pass |

Every other capability is optional and only selects generic behaviour. `live_verify` in particular:
its absence removes a source of evidence, it does not invalidate the transaction.

---

## 12. Test-double strategy

The transaction tests need deterministic panel behaviour. **No fake panel is added to shipping
code.** The doubles are shell functions defined in the test harness *after* the library is sourced,
so they override the P3 public entry points for the duration of a run:

| double | selects |
|---|---|
| `rt_panel_detect` | success / failure / not-applicable / unavailable |
| `rt_panel_capabilities` | any capability set, including empty, unknown-token and unavailable |
| `rt_panel_backup_state` | capture success / failure |
| `rt_panel_install_template` | placement success / failure |
| `rt_panel_verify` | per-mode success / failure / unavailable / not-applicable, with a **call counter** so the engine's forward check is distinguishable from the rollback's |
| `rt_panel_restore_state` | restore success / failure |
| `rt_backup_create` | snapshot success / failure, echoing a pre-built snapshot |

Each double appends its name to a log, so the **order** of the engine's calls is asserted, not just
the outcome. Nothing touches a real filesystem, service or database.

**Why `flock` is doubled, and how the real behaviour is still covered.** This development host has
no `flock` binary at all, so without a double the engine's fail-closed guard fires and no locking
path can be exercised. The suite therefore puts a minimal `flock` shim on `PATH` for those tests:
it implements mutual exclusion the portable way available here (an atomic `mkdir` on a name derived
from the locked file, which it reads from `/proc/self/fd/N`), so two processes genuinely contend.

The shim is an *external-binary* double, not a substitute for the engine's logic: the engine still
calls `flock -n 9` and `flock -u 9` through a real descriptor and still checks `command -v flock`
first. The fail-closed behaviour is tested **independently of what this host has**, by shadowing
`command` so `command -v flock` reports absence — which works on a host that ships `flock` too.

**Fixture shape, and one deliberate economy.** The bulk fixture is a format-2 snapshot *without* a
manifest. That is valid rather than a shortcut: `rt_backup_format` takes the format from the
canonical `format` file, and `rt_backup_manifest_check` accepts an absent manifest by contract. The
manifest is P2's own concern and is already covered by the P2 reader suite, which this suite must
not duplicate. One dedicated test uses a **full** snapshot, manifest included, so the realistic
shape is covered as well.

---

## 13. P5 obligations

P5 supplies the implementations behind the frozen interface. The engine already relies on these
properties, and P5 must not break them:

1. **`rt_panel_detect` stays read-only** and identifies a panel from corroborated evidence, not from
   a directory name, a binary name or a weak heuristic alone.
2. **`rt_panel_capabilities` stays honest.** A capability that is declared must work; one that does
   not work must not be declared. The engine refuses to start on a missing required capability, so
   an over-claimed capability produces a failure rather than a silent partial install.
3. **`rt_panel_backup_state` fills `RT_PANEL_STAGE` through `rt_backup_panel_write`** and writes no
   secret, credential or token. The engine passes no free-form data into the stage.
4. **`rt_panel_install_template` refuses an existing destination** and records every placed file
   through the P2 `files` contract. An unrecorded placement is a file rollback will leave behind.
5. **`rt_panel_restore_state` honours the frozen six-step order** and never deletes the containing
   operator directory.
6. **A panel implementation must not require the engine to know its name.** If a behaviour can only
   be expressed by branching on the panel id inside `transaction.sh`, the capability vocabulary is
   the wrong shape and the fix belongs in P3, not here.
7. **Adding a panel must not require editing the engine.** Adding a capability must not either.

---

## 14. Explicit non-goals

- **No real panel behaviour.** There is no 3X-UI, PasarGuard or Rebecca adapter. No file is placed,
  no service is started, no database or API is touched.
- **No panel-specific anything in the engine.** No panel name, no service name, no SQL, no
  environment key, no API endpoint, no path outside the Row-Template-owned tree.
- **No crash recovery and no durable journal.** The state model is in memory and is lost on a crash.
  A state file that looks like recovery but is not would be worse than none.
- **No change to P2.** Format-2 snapshots, the `format` marker, the manifest, `selection.state`,
  `selection`, `meta`, `files`, strict containment and `rt_backup_create v2` are untouched.
- **No change to P3.** The interface, its return codes, its vocabulary and its semantics are
  untouched. The engine consumes the contract as written.
- **No wiring of format-2 snapshots into the user-facing `rollback` command.** `rt_cmd_rollback`,
  `rt_backup_latest` and `rt_backups_prune` still read `$RT_BACKUPS` only.
- **No activation of any panel**, and no change to `VERSION`, tags, releases or remotes.
- **No new dependency.** Bash and the standard Linux userland, plus `flock`.

---

## Appendix — where each rule is enforced

| rule | enforced by |
|---|---|
| one writer at a time | `rt_transaction_lock_acquire` (`flock -n`) |
| fail closed without flock | `command -v flock` guard in `rt_transaction_lock_acquire` |
| lock released on every path | `rt_transaction_run` (single release after the body) |
| closed panel enum | `rt_panel_id_ok` (P2), called before any panel operation |
| no panel-specific branch | `codeOf(transaction.sh)` contains no panel name (tested) |
| ordered transitions only | `rt_transaction_transition_ok` |
| terminal states are final | transition table; `COMMITTED`/`ROLLED_BACK`/`FAILED` accept nothing |
| nothing before the boundary mutates | order of phases; `RT_TXN_MUTATED` raised before placement |
| safety snapshot required | `rt_transaction_snapshot_validate` before placement |
| snapshot validated before restore | first step of `rt_transaction_rollback` |
| static verification mandatory | `rt_transaction_static_verify`; caller treats any non-zero as failure |
| live UNAVAILABLE is not a rollback trigger | `case` arm in `rt_transaction_body` |
| rollback attempted once | three call sites, none in a command substitution, none recursive |
| rollback failure reported separately | `rt_transaction_rollback_report_failure` |
| stage cleared safely | `rt_transaction_stage_reset` (strict containment, pinned basename) |
| stdout reserved | events go to stderr; `rt_transaction_run` writes nothing to stdout |
| no secrets | the engine's code contains no secret-shaped vocabulary (tested) |
