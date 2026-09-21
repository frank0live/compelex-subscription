# Installer Backup Review

**Phase 8D — review only. No installer, source, release, version or changelog change. Nothing
implemented, nothing committed.**

| | |
|---|---|
| Date | 2026-09-21 |
| Tree | `feat/v1.2-multitemplate`, HEAD `fe5a359` |
| Reviews | `INSTALLER-BACKUP-DESIGN.md` (8C) against the **actual** backup and restore code |
| Output | an implementation-ready backup specification |
| Status | **specification** — approved for implementation planning, not implemented |

> **This is a review, not a restatement.** Reading the current code against the 8C design found
> **four discrepancies** the design did not account for, listed in §0. The specification below is
> the design *corrected against the code*.

---

## 0. What the code review found

These are findings about the **existing** code that the 8C design assumed differently. Each one
changes the specification.

### F1 — The snapshot **already has a `meta` file**, and nothing ever reads it

```bash
{ printf 'created=%s\n' "$ts"; printf 'version=%s\n' "$ver"; } > "$dir/meta"
[ -n "$tpl_id" ] && printf 'template=%s\n' "$tpl_id" >> "$dir/meta"
```

A grep for `meta` across the library returns **only these two writes** (plus an unrelated comment).
**No code path reads `meta` back.** The restore path re-derives template identity from the
artifact's checksum instead, and the source says so deliberately:

> *"Deriving identity from the checksum — rather than from recorded metadata"*

**Consequence for the design:** 8C proposed `panels/<panel>/meta`. Putting panel state in a
write-only file would mean **a rollback could not read the state it needs.** The specification below
therefore requires a **reader** to exist before any writer is added (§1, §4).

`rt_manifest_get` already exists and is the right parser — `KEY=VALUE`, last wins, *"parsed as
data"* (no `eval`). It is currently used only for the release manifest.

### F2 — `config.env` is captured but **never restored**

`rt_backup_create` copies `config.env` into the snapshot. `rt_restore_from_backup` does **not**
restore it, deliberately:

> *"Admin branding in config.env is deliberately left as-is so current branding is preserved across
> an update-rollback / rollback"*

8C listed `config.env` as *"existing behaviour, unchanged"*. That is true of **capture** and false of
**restore**. The specification records the asymmetry explicitly, so no future change "fixes" a
deliberate omission (§3).

### F3 — `rt_backup_validate` gates on the template only, so **panel state is unvalidated**

```bash
rt_backup_validate() {
  [ -d "$d" ] || return 1
  [ -f "$d/template.html" ] || return 1
  [ -f "$d/template.html.sha256" ] || return 1
  rt_verify_sha256 "$d/template.html" "$want" >/dev/null 2>&1
}
```

A snapshot with a **corrupt or truncated `selection` file would pass validation**. 8C proposed a
snapshot manifest (§4 there); this review confirms the manifest must be wired into
`rt_backup_validate` itself, not added as a parallel check — otherwise `--auto` would select a
snapshot whose panel state cannot be restored.

### F4 — Invalid snapshots are **invisible to `--auto` and never pruned**

```bash
rt_backups_list() { ... rt_backup_validate "$d" && printf '%s\n' "$d"; ... }   # invalid: omitted
rt_backup_latest() { rt_backups_list | head -n1; }
rt_backups_prune() { ... while IFS= read -r d; do ... done < <(rt_backups_list) }
```

Prune iterates the **valid** list only, and the source notes *"Corrupt/foreign dirs are left
untouched."* So a snapshot that fails validation is both **unselectable** and **unprunable** — it
accumulates forever.

**This is pre-existing behaviour, not a defect introduced by the design.** But it becomes sharper
with panel state: a snapshot can fail validation for a panel-state reason and then be **invisible
and permanent**. The specification requires that a panel-state validation failure be **reported**,
not silently absorbed (§6).

---

## 1. Snapshot schema finalization

### Layout

```
$RT_BACKUPS/<ts>__<ver>/
  template.html               the pristine artifact             (existing)
  template.html.sha256        its sidecar                       (existing)
  VERSION                     the version being replaced        (existing)
  config.env                  captured, NOT restored  — see F2  (existing)
  meta                        KEY=VALUE, extended — see below   (existing file, new keys)
  manifest                    NEW  path + sha256 for every captured file
  panels/                     NEW  one directory per panel TOUCHED
    3xui/
      state                   the selection, as the panel reported it
      files                   the files we placed, one absolute path per line
```

### The `meta` extension — extend, do not add a parallel file

8C proposed `panels/<panel>/meta`. **That is superseded.** The snapshot already has a root `meta` in
the established `KEY=VALUE` format, and `rt_manifest_get` already parses it. Panel state goes in
`panels/<panel>/state`, and per-snapshot facts go in the **existing** `meta`:

```
created=20260921T081500Z          existing
version=1.1.0                     existing
template=row                      existing (informational)
format=2                          NEW
panels=3xui,rebecca               NEW  the panels this transaction TOUCHED
```

**`panels=` is the field that makes "no panel state" distinguishable from "no panels touched"** —
the distinction 8C §9 flagged as a real migration case (F1-adjacent).

### `state` file format

```
key=value, one per line, via rt_manifest_get
mechanism=db|env|api
was_running=0|1
custom_templates_directory=<value or the literal ABSENT marker>
subscription_page_template=<value>
subThemeDir=<value>
```

**`ABSENT` is a reserved literal, not an empty value.** A setting that was absent restores by
*removal*; one that was empty restores by *writing empty*. Conflating them leaves a setting behind
that was never there. **A `state` file containing an empty value where `ABSENT` was meant is a
specification violation, not a formatting choice.**

### `files` format

One **absolute path** per line. Never a directory. Never a glob.

**Absolute, not relative.** A relative path needs a recorded base, and a wrong base turns a removal
into a removal of the wrong file. An absolute path is checked against its recorded root at restore
time (§9 B7).

---

## 2. Versioning strategy

| version | what it means | restore behaviour |
|---|---|---|
| **absent** | a 1.1.0 snapshot — no `format` key | **format 1.** Restore Row-Template state only, and **report that no panel state exists** |
| **`format=2`** | this specification | full restore |

### Rules

1. **Absent `format` means format 1, never "unknown".** The shipped 1.1.0 library writes no
   `format` key; treating absent as unknown would make every existing backup unrestorable.
2. **A format the library does not know is refused**, with the number named. Not ignored, not
   partially applied. Ignoring the parts it does not understand is precisely the silent
   half-rollback this work exists to prevent.
3. **A newer library restores format 1 and format 2.** A format-1 restore must **say** it restored
   no panel state — silence there is indistinguishable from "there was none to restore".
4. **An older library (1.1.0) encountering a format-2 snapshot** does not read `format` at all, so
   it restores Row-Template state and **leaves the panel selection untouched** — which is exactly
   the half-rollback. **This is the one case the format marker cannot protect**, because the old
   library has no knowledge of it. It is a documented limitation, mitigated by the migration path
   (§8).

---

## 3. File backup rules

| rule | rationale |
|---|---|
| capture `template.html` + sidecar | existing; the artifact the restore stages |
| capture `VERSION` if present | existing; `rt_restore_from_backup` restores it |
| capture `config.env` if present | existing — **and it is never restored (F2). Preserve that.** |
| record every file we **place** in `files` | so a rollback removes exactly those |
| **never record a directory** | an operator's custom template directory may hold their own work |
| **never capture the panel's own templates** | we never modify them |
| **never capture a live database file** | copying a live SQLite file is not safe, and we need one setting, not the database |
| **never capture anything outside the paths we will touch** | a backup that captures more than the transaction needs is a liability |

### The `config.env` rule is explicit

> **`config.env` is captured and NOT restored, deliberately.** A future change that "fixes" this
> would overwrite the operator's current branding on every rollback. The asymmetry is the feature.

### Abort-on-failure is preserved

`rt_backup_create` fails if `RT_DIST` is missing, and the install path treats that as fatal:
*"could not snapshot the current state; aborting"*. **No backup, no writes.** This is unchanged and
must stay unchanged — a transaction that cannot be backed up must not begin.

---

## 4. Panel state backup rules

### What is captured, per panel

| panel | keys in `state` | read via |
|---|---|---|
| **3X-UI** | `subThemeDir` (or `ABSENT`) | `SELECT value FROM settings WHERE key='subThemeDir'` |
| **PasarGuard** | `custom_templates_directory`, `subscription_page_template`, plus the env file path | reading the env/config file |
| **Rebecca** | `custom_templates_directory`, `subscription_page_template`, plus any per-admin override touched | the sudo API, or the settings read |

### Rules

1. **Capture through the same mechanism that will restore.** If activation uses Rebecca's API,
   capture via the API. A capture through a different path can disagree with what a restore writes.
2. **`was_running` is mandatory.** 3X-UI's activation stops the service; a rollback must know
   whether to restart it or leave it stopped. Guessing means either a stopped panel or a service the
   operator had deliberately shut down being started.
3. **A panel not touched gets no `panels/<panel>/` directory** — and the `panels=` key in `meta`
   lists only what was touched. Absence is meaningful; do not create empty directories.
4. **A read failure is fatal to the transaction, not a warning.** A snapshot that cannot record the
   current selection cannot restore it. Abort before writing anything.
5. **`ABSENT` is written explicitly** when the setting does not exist (§1).

### F1's requirement, restated as a rule

> **No panel state may be written to a snapshot until a reader exists.** The existing `meta` is
> write-only; adding writers without a reader reproduces that defect with higher stakes.

---

## 5. Restore ordering

```
1  read and verify       format → validate → manifest → panel state
2  restore selections    per panel, through the recorded mechanism
3  remove placed files   only those in `files`
4  restore service state per meta.was_running
5  restore Row-Template  existing rt_restore_from_backup path, unchanged
```

### Why the selection is restored first

If restore is interrupted, the state left behind must be the **safest** one. Restoring the selection
first means an interruption leaves the panel pointing at **whatever it pointed at before** — the
built-in template if there was no custom one, the operator's own template if there was.

### Why service state is restored third

The service must be **up** for Rebecca's API restore and **stopped** for a 3X-UI DB write. Each
adapter knows its own requirement. Restoring service state **last** means it reflects the completed
transaction rather than an intermediate one.

### Why Row-Template is restored last

It is self-contained and least urgent. If everything before it succeeded, it will too.

### `rt_restore_from_backup` is called **unchanged**

Step 5 is the existing function. Its behaviour — re-derive template identity from the artifact
checksum, restore `VERSION`, reconcile the selection, **leave `config.env` alone** — is preserved
exactly. **The panel-state steps wrap it; they do not enter it.**

---

## 6. Partial failure handling

| failure point | state after | action |
|---|---|---|
| discovery | nothing changed | report, abort |
| staging | nothing live changed | abort |
| payload verification | nothing changed | abort — existing gate |
| **backup** | nothing changed | **abort. No backup, no writes** — existing |
| panel-state capture | snapshot incomplete | **abort and discard the snapshot.** A snapshot that cannot restore is not a snapshot |
| files partly placed | some files placed | remove **those** files |
| **files placed, selection not yet set** | **the panel is still correct** | remove the files. **The safest failure point** |
| selection set, not verified | both applied, unverified | rollback |
| **rollback itself** | unknown | **stop and report. Never chain** |

### The row that matters

> **Files placed, selection not yet set — the panel is still correct.**

This is why files are placed **before** the selection. A failure there is recoverable by deleting
files, with no panel-side change to undo. The dangerous window — between setting the selection and
verifying it — is deliberately as short as possible.

### Never chain automatic recovery

If a rollback fails, the installer **stops**. No second rollback, no "cleaner" state, no best-effort
repair. Each further automatic action on an already-inconsistent state risks destroying something
recoverable. Report, and hand back to the operator with `row-template rollback`.

### F4's requirement

A snapshot that fails **panel-state** validation must be **reported**, not silently absorbed. Today
`rt_backups_list` omits invalid snapshots without a word, and prune never removes them. With panel
state, a snapshot could be invisible to `--auto`, permanent on disk, and the operator would have no
indication why their rollback target is missing.

---

## 7. Compatibility with existing 1.1.0 backups

A 1.1.0 snapshot contains `template.html`, `.sha256`, `VERSION`, `config.env` and a write-only
`meta`. It has **no `format`**, **no `manifest`**, and **no `panels/`**.

| aspect | 1.1.0 snapshot under the new library |
|---|---|
| `rt_backup_validate` | **passes** — it gates on the template and sidecar, both present |
| `rt_backups_list` / `--auto` | **selectable** — unchanged |
| `rt_restore_from_backup` | **works unchanged** — the panel steps are no-ops |
| panel state | **none.** The restore must **report** that no panel state was restored |
| `format` | absent → treated as **format 1** (§2) |

### The one thing that must not happen

> **A format-1 restore must not silently appear to be a complete restore.**

Restoring Row-Template state and saying nothing about panel state is indistinguishable, to the
operator, from a restore that had no panel state to restore. **The report must name it**: this
snapshot predates panel-state capture; the panel selection was not restored.

This is the F1 lesson applied to compatibility: *absence of data* and *absence of a mechanism to
record data* are different, and only a reader that looks can tell them apart.

---

## 8. Migration path

### Phase 0 — the reader, before any writer (mandatory first step)

**Implement `rt_manifest_get`-based reading of the snapshot `meta` and of `panels/*/state`, and
report what it finds — before anything writes panel state.** Until this exists, writing panel state
reproduces F1 at higher stakes.

### Phase 1 — the format marker

Emit `format=2` and `panels=` in `meta`. No panel state yet. A 1.1.0 snapshot (absent `format`) is
format 1; a new one is format 2. **This alone is testable and reversible.**

### Phase 2 — the manifest

Add `manifest` and wire it into `rt_backup_validate` (F3). Still no panel state. This closes the
"corrupt snapshot passes validation" gap for the files that already exist.

### Phase 3 — panel state, one panel at a time

Capture and restore panel state **for 3X-UI first** — it is the panel with existing activation, so
the state round-trip can be tested against a known-good mechanism. PasarGuard and Rebecca follow.

### Phase 4 — activation

Only after 1–3. **Activation must not ship before the backup can restore what it changes.**

### Migration rules

| rule | reason |
|---|---|
| each phase is independently releasable | a failed phase does not strand the others |
| each phase leaves 1.1.0 snapshots restorable | compatibility is a running invariant, not a final check |
| no phase changes `config.env` restore behaviour | F2 is deliberate |
| a format the library does not know is **refused** | §2 |

---

## 9. Security model

| # | risk | mitigation |
|---|---|---|
| **B1** | **the half-rollback** — files restored, selection not | two-part snapshot; restore order (§5); the format marker (§2) |
| **B2** | deleting an operator's files | record **files**, never directories; remove only what is in `files` |
| **B3** | a corrupt snapshot applied | the manifest verified **before** anything is restored (§1, §3) |
| **B4** | a newer snapshot mis-read by an older library | documented limitation — the 1.1.0 library cannot read `format` (§2). Mitigated by the migration path, not solvable by the marker |
| **B5** | a secret written into a snapshot | **secrets are never captured.** A panel API token is held in memory for the transaction only. `config.env` is captured because it is an existing file; the design adds no new secret material |
| **B6** | snapshot permissions | `chmod 700` on the directory and `640` on `config.env` — **already implemented**; the `panels/` subtree inherits the directory mode |
| **B7** | symlink redirection | `rt_assert_not_symlink` on every write; `rt_is_within` before any recursive delete |
| **B8** | `rm -rf` outside the tree | `rt_safe_rmdir` is **the single choke point** — all new removals route through it, and `rt_is_within` requires strict containment (the base itself is refused) |
| **B9** | unbounded growth | `rt_backups_prune` exists — but **F4**: it only prunes valid snapshots. Panel-state validation failures must be **reported**, not left to accumulate silently |
| **B10** | rollback leaves a service stopped | `was_running` (§4) and the restore order (§5) |
| **B11** | a `files` entry pointing outside the tree | validate each entry against its recorded root with `rt_is_within` **before** removing anything |

### B5 and B8 are the two that must not be got wrong

**B5** — a snapshot is a long-lived artefact on disk. A token in it would outlive the transaction
that needed it.

**B8** — `rt_safe_rmdir` is the *only* place `rm -rf` happens, and it enforces both the symlink
check and strict containment. Any new removal path that does not route through it is a defect by
construction.

---

## 10. Test matrix before implementation

Each row must pass **before** the phase it gates.

### Phase 1 — format marker

| # | test | expected |
|---|---|---|
| 1.1 | create a snapshot with the new library | `meta` contains `format=2` and `panels=` |
| 1.2 | restore a **1.1.0** snapshot (no `format`) | restores Row-Template state; **reports no panel state** |
| 1.3 | restore a snapshot with `format=99` | **refused**, the number named, nothing changed |
| 1.4 | `rt_backups_list` with a mix of format 1 and 2 | both listed; order unchanged (lexical) |

### Phase 2 — manifest

| # | test | expected |
|---|---|---|
| 2.1 | truncate a captured file, then validate | **fails validation** (today it would pass — F3) |
| 2.2 | corrupt `manifest` itself | snapshot refused; nothing restored |
| 2.3 | a valid snapshot | validates; `--auto` selects it |
| 2.4 | an invalid snapshot with panel state | **reported**, not silently omitted (F4) |

### Phase 3 — panel state

| # | test | expected |
|---|---|---|
| 3.1 | 3X-UI: capture `subThemeDir`, change it, restore | previous value restored |
| 3.2 | 3X-UI: capture with `subThemeDir` **absent** | `ABSENT` recorded; restore **removes** the setting |
| 3.3 | 3X-UI: capture with `subThemeDir` **empty** | empty recorded; restore writes empty — **not** the same as 3.2 |
| 3.4 | `was_running=1`, rollback | service running afterwards |
| 3.5 | `was_running=0`, rollback | service **not** started |
| 3.6 | a panel **not** touched | no `panels/<panel>/`; restore does not touch it |
| 3.7 | `files` contains a path outside its root | **refused** before removal (B11) |
| 3.8 | a file in `files` is a symlink | `rt_assert_not_symlink` refuses |
| 3.9 | panel-state read fails during capture | **transaction aborts**; no snapshot kept |
| 3.10 | restore interrupted after the selection, before files | panel points at its **previous** value (§5) |
| 3.11 | two panels in one transaction | both restored, or neither — never one |
| 3.12 | per-admin override (PasarGuard / Rebecca) | only the explicit admin id is touched |

### Cross-cutting

| # | test | expected |
|---|---|---|
| X.1 | no snapshot state is written without a reader | **F1 regression guard** — a writer test that fails if no read path exists |
| X.2 | `config.env` is still **not** restored | **F2 regression guard** |
| X.3 | all removals route through `rt_safe_rmdir` | **B8 guard** — grep-level assertion |
| X.4 | a 1.1.0 snapshot restores identically before and after each phase | compatibility invariant |
| X.5 | the full 1.1.0 backup/rollback path is unchanged | existing tests still pass |

### The two guards worth writing first

**X.1** and **X.2** encode the two findings that would otherwise be rediscovered the hard way: a
write-only `meta` (F1), and a `config.env` restore that must stay absent (F2). Both are cheap
assertions and both protect deliberate decisions from being "fixed".

---

## What this review does NOT do

- It does not implement, stage or prepare anything.
- It does not modify `installer/`, `release/`, `VERSION`, `CHANGELOG.md` or `package.json`.
- It does not write code or tests.
- It does not authorise implementation. It produces the specification implementation would follow.

---

## Verification

| check | result |
|---|---|
| `git diff --check` | **clean** |
| `git status --short` | documentation only — see the phase report |
| `installer/` · `release/` · `VERSION` · `CHANGELOG.md` · `package.json` | **0 changes** |
| committed | **no** |

---

PHASE 8D COMPLETE — BACKUP REVIEW ONLY
