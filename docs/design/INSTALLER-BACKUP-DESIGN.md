# Installer Backup Design

**Phase 8C — design only. No installer, release, version or changelog change. Nothing implemented,
nothing committed.**

| | |
|---|---|
| Date | 2026-09-21 |
| Tree | `feat/v1.2-multitemplate`, HEAD `fe5a359` |
| Builds on | `INSTALLER-ACTIVATION-AUDIT.md` (8A) · `INSTALLER-MULTIPANEL-DESIGN.md` (8B) |
| Scope | the backup, restore and rollback model that multi-panel activation requires |
| Status | **proposal** — nothing here is approved for implementation |

> **This document designs. It must not be implemented from directly.**
> It exists because Phase 8A found that the current backup **cannot** make multi-panel activation
> safe, and Phase 8B made the extension a precondition for shipping activation.

---

## Correction — 2026-09-22 (P2 follow-up)

> **Additive record. Nothing below was rewritten; every original finding, figure and snapshot above
> stands as written.** Where this section disagrees with the body, this section is the current truth
> and the body is preserved as the evidence that the disagreement existed. This is the same
> convention `INSTALLER-BACKUP-REVIEW.md` carries for the identical three items.

Applied in commit `fix(installer): complete backup v2 rollback state` (P2 follow-up), which closed
two blockers found by the Post-P2 Acceptance Audit.

### D1 — the placed-file record is **relative**, not "paths relative to a recorded root" left open

| | |
|---|---|
| **Was** (§1 shape) | `files` — *"the files we placed (paths, relative to a recorded root)"* — relative in intent, but 8D §1 then specified **absolute** paths, so the two documents contradicted each other and left the format undecided. |
| **Now** | **One relative path per line, relative to the panel's own managed root.** Decided, implemented, and validated by `rt_backup_relpath_ok` in both the writer and the reader. |

The relative form is the one that matches both target panels: PasarGuard places a Jinja2 file
*under* `custom_templates_directory`, and Rebecca **rejects absolute paths outright** through
`safeJoin` / `normalizeTemplateName`. A stored absolute path would also be exactly what **B11**
requires be re-validated against a recorded root before removal — so storing the absolute form
creates the check it was supposed to avoid, and adds a value that stops meaning anything if the
operator relocates their directory. See C1 in `INSTALLER-BACKUP-REVIEW.md` for the same decision
recorded against the specification that carried it.

**On-disk form.** One path per line, each newline-terminated, `LC_ALL=C` sorted and de-duplicated.
An **empty file is valid** (3X-UI places nothing); an **absent** file is malformed. The reader also
accepts an unterminated final line as a record instead of dropping it — a `while read` loop discards
a final line with no terminator, which would turn a truncated record into a silently shorter one.
See C1 in `INSTALLER-BACKUP-REVIEW.md` for why that direction of failure is the dangerous one.

### D2 — the base directory **was** deletable; the strict-containment claim was false

| | |
|---|---|
| **Was** (§10 B8) | *"the existing `rt_is_within "$RT_BACKUPS"` containment check is preserved, and extended to any new removal path"* — with the strict-containment property asserted in 8D B8 and in the P2 library comment. |
| **Now** | `rt_is_within` refuses `BASE == PATH`; `rt_safe_rmdir` additionally refuses `/`; the two backups roots are **not** deletable; strict descendants remain deletable. |

`rt_is_within` matched `"$BASE"/*` against a slash-suffixed path, which accepts `PATH == BASE`
because the glob branch matches the empty remainder. Measured: `is_within BASE BASE` returned
WITHIN and `rt_safe_rmdir "$RT_BACKUPS"` **removed the root**. Deleting a backups root destroys
every snapshot at once — the one outcome a rollback safety net must never produce. Fixed by the
equality refusal in `rt_is_within` plus an explicit `/` refusal in `rt_safe_rmdir`, with a
behavioural test asserting all five refusals and that descendants still delete.

### D3 — a pre-existing destination file is **refused**, and P2 captures **no** original bytes

| | |
|---|---|
| **Was** (§6 invariant 3) | *"**Never delete a directory.** Only the files recorded in `files`."* — correct and still in force, but silent on what happens when a file is already there, and 8C §2's "deliberately NOT captured" list did not name the case. |
| **Now** | **Activation must REFUSE to overwrite a pre-existing operator file.** No `.orig` storage, no shadow copy, no content capture in P2. |

Without a capture, `files` can record *which* file we may remove but cannot restore content we never
took — so deleting a pre-existing operator file would leave a hole no rollback can fill. Refusing
up front removes the case rather than mishandling it. 8B §12 S4 already required exactly this
refusal for PasarGuard; the correction makes it general and explicit for every panel, and this
document's §6 invariants are hereby read as including it:

- every path in `files` names a file **Row-Template created** — never one it found;
- rollback removes **only** those recorded files;
- rollback **never** removes the containing directory (invariant 3, unchanged and still absolute);
- the refusal must **name the path**, because a silent refusal is indistinguishable from a bug.

`files` is written for **every touched panel, even when empty** — 3X-UI places no file and records
an empty list. The empty record is what keeps *"we placed nothing"* distinguishable from *"the
record is missing"*; the latter is a malformed snapshot, not a clean install.

---

## 0. Why this document exists

Phase 8A §6 S1 found the gap, and it is worth restating plainly because everything below follows
from it:

> **`rt_backup_create` captures `template.html`, its sidecar, `config.env` and `VERSION` — and
> nothing about the panel.**

So today, if activation set a panel-side selection and then failed, a rollback would restore our
files and **leave the panel pointing at them**. That is not a rollback; it is half of one, and the
half it leaves out is the half that determines what subscribers actually see.

**The rule this design enforces:**

> **A backup that cannot restore the panel-side selection is not a backup.**
> Activation must not ship until this document is implemented.

---

## 1. Snapshot model

### Shape

The existing snapshot is a **timestamped directory** under `RT_BACKUPS`
(`$RT_ROOT/backups/<ts>__<ver>/`). That shape is kept; the snapshot gains a `panels/` subtree.

```
backups/20260921T081500Z__1.1.0/
  template.html              the pristine artifact            (existing)
  template.html.sha256       its sidecar                      (existing)
  config.env                 operator configuration           (existing)
  VERSION                    the version being replaced       (existing)
  format                     ← NEW  snapshot format version, e.g. "2"
  panels/                    ← NEW  panel-side state, one set per panel touched
    3xui/
      selection              the previous selection value, or an explicit "absent" marker
      files                  the files we placed (paths, relative to a recorded root)
      meta                   mechanism, capabilities, service state before the change
    rebecca/
      ...
```

> **1.3.0 amendment — the optional `aux` record.** A panel directory may also hold
> `aux`: `key=value` lines, the value base64-encoded, keys `[a-z_]{1,32}` and unique,
> sorted (`rt_backup_panel_aux_set` / `rt_backup_panel_aux` / `rt_backup_panel_aux_check`
> in `installer/lib/row-template.sh`). It carries the few facts a restore needs that
> `selection` cannot hold — PasarGuard's `block`, `dir`, `root`, `root_created`;
> Rebecca's `dir_state` (`null` / `empty` / `present`), `dir`, `root`, `root_created`.
> It is **optional**: 3X-UI writes none, a snapshot without one is read exactly as
> before, and a malformed record (a symlink, a bad key, a non-base64 value, a repeated
> key) makes the snapshot invalid rather than being partly read. It never holds a
> secret: each adapter writes named keys only, from values it has already validated
> (see PASARGUARD-INSTALLER-AUDIT.md §6 and REBECCA-INSTALLER-AUDIT.md §6).

### Why `format` is not optional

An older library must not mis-read a newer snapshot. Without a format marker, an old `row-template`
binary would find a `panels/` directory it does not understand and either ignore it — silently
producing the half-rollback this document exists to prevent — or mis-parse it.

**A library that does not understand a snapshot's `format` refuses to restore it**, and says so.
Refusing is the only safe behaviour; guessing is not.

### One snapshot per transaction, not per panel

A single install may touch more than one panel (Phase 8B §4: a box can run two panels). **One
snapshot covers the whole transaction**, so a rollback is all-or-nothing across panels. Per-panel
snapshots would allow a partial rollback that leaves two panels disagreeing.

---

## 2. File backup

### What is captured

| item | why |
|---|---|
| `template.html` + sidecar | the artifact being replaced — **existing behaviour, unchanged** |
| `config.env` | the operator's branding and settings — **existing behaviour, unchanged** |
| `VERSION` | the version being replaced — **existing behaviour, unchanged** |
| **the paths we placed** | so a rollback removes exactly those files and nothing else |

### The rule that matters most

> **Record the files we placed. Never record the directory we placed them in.**

An operator's `custom_templates_directory` may already contain their own templates (Phase 8A §6 S4).
A rollback that removes the directory destroys work that was never ours. The snapshot records
**individual file paths**, and rollback removes **only those files**.

### What is deliberately NOT captured

- **The panel's own template files.** We are not backing up PasarGuard's `subscription/index.html`
  or Rebecca's built-in templates. We never modify them.
- **The whole panel database.** Capturing a live SQLite file is not a safe operation, and we do not
  need it — we need one setting, not the database.
- **Anything outside the paths we will touch.** A backup that captures more than the transaction
  needs is a liability, not a safety net.

---

## 3. Panel state backup

This is the new part. Each adapter captures the selection **as the panel itself would report it**,
using the same mechanism it will later use to restore it.

### What each panel records

| panel | `selection` holds | captured by |
|---|---|---|
| **3X-UI** | the previous `settings.subThemeDir` value, or an explicit `absent` | `SELECT value FROM settings WHERE key='subThemeDir'` |
| **PasarGuard** | the previous `CUSTOM_TEMPLATES_DIRECTORY` and `SUBSCRIPTION_PAGE_TEMPLATE`, plus the env file path | reading the env/config file |
| **Rebecca** | the previous `custom_templates_directory` and `subscription_page_template`, plus any per-admin override touched | the API, or the settings read |

### The `absent` marker is not an empty string

A setting that **was not present** and a setting that was present but **empty** are different states,
and they restore differently:

- **absent** → restore means *remove the setting*
- **empty** → restore means *write an empty value*

Conflating them would leave a setting behind that was never there. The snapshot stores an explicit
marker, not an empty string.

### `meta` records service state

| field | why |
|---|---|
| `mechanism` | `db` / `env` / `api` — so rollback uses the **same** path that activation used |
| `capabilities` | the declaration at the time of the transaction |
| `was_running` | whether the service was running **before** we touched it |

**`was_running` is essential.** 3X-UI's activation stops the service. If the transaction fails after
the stop, a rollback must know whether to leave it stopped or restart it. Without this field it can
only guess, and guessing means either a stopped panel or a service the operator had deliberately
shut down being started.

---

## 4. Checksum strategy

Three layers, each answering a different question:

| layer | covers | answers |
|---|---|---|
| **payload checksums** | the release tarball and every file in it | *is this the release we think it is?* — **existing, unchanged** |
| **artifact sidecar** | `template.html` | *is the artifact intact?* — **existing, unchanged** |
| **snapshot manifest** | every file in the snapshot | *is this backup internally consistent?* — **NEW** |

### The snapshot manifest

The snapshot gains a manifest listing every captured file with its hash, and the `format` value.

**Restore verifies the manifest before restoring anything.** A snapshot that fails its own
integrity check must not be applied — restoring from a corrupt snapshot can produce a state worse
than the failure it was meant to recover from.

**The manifest covers the panel-state files too**, not just `template.html`. Those small files are
the ones whose corruption would be least visible and most damaging: a truncated `selection` file
could restore a plausible-looking but wrong value.

**Hashing is not used to detect operator edits.** `config.env` is expected to change between
snapshots; that is not corruption.

---

## 5. Restore order

**Restore is the exact reverse of install, and the order is not arbitrary.**

```
install order:                    restore order:
  1  place files                    1  restore the panel selection
  2  set the selection              2  remove the files we placed
  3  restart the service            3  restore the service state
  4  (verify)                       4  restore Row-Template state
```

### Why the selection is restored FIRST

If restore is interrupted, the state left behind must be the **safest** one. Restoring the selection
first means an interruption leaves the panel pointing at **whatever it pointed at before** — which
is the built-in template if there was no custom one, and the operator's own template if there was.

Restoring files first would mean an interruption leaves new files on disk with the old selection —
harmless. But restoring the selection first is strictly better because it also covers the case where
the files are restored and then the *selection* restore fails: with the reversed order, that
combination is impossible.

### Why the service state is restored THIRD, not first

The service must be running when the selection is restored if the panel needs a restart to pick it
up, and must not be running if the restore requires exclusive access. Each adapter knows its own
requirement (3X-UI needs stop→write→start; Rebecca's API needs the service **up**). Restoring
service state last means it reflects the completed transaction, not an intermediate one.

### Row-Template state is restored LAST

It is the least urgent and the most self-contained. If everything before it succeeded, it will too.

---

## 6. Rollback behaviour

### Invariants

1. **All-or-nothing per panel, and the snapshot is per transaction** — a rollback restores every
   panel the transaction touched, or reports that it could not.
2. **Restore through the mechanism that wrote.** If activation used Rebecca's API, rollback uses the
   API. A rollback through a different path can fail in ways the original never would.
3. **Never delete a directory.** Only the files recorded in `files`.
4. **Never restore a panel the transaction did not touch.** A snapshot with a `panels/3xui/` set and
   no `panels/rebecca/` set means Rebecca was not modified — and must not be "restored" to anything.
5. **Report the outcome truthfully.** The existing distinction — *automatic restore succeeded* vs
   *"automatic restore failed; run `row-template rollback`"* — is preserved and extended per panel.

### The honesty requirement

The current code already refuses to claim success it did not achieve. Multi-panel rollback makes
that harder, because a partial restore can leave a state that *looks* right.

**A rollback that restored files but not the selection must say exactly that**, naming the panel and
the setting. Silence there is the failure mode this whole document exists to prevent.

---

## 7. Partial failure handling

The question is not "did it fail" but **"what is on disk now"**.

| failure point | state after | action |
|---|---|---|
| during discovery | nothing changed | report, abort |
| during staging | nothing live changed | abort, remove staging |
| during payload verification | nothing changed | abort — existing integrity gate |
| **during backup** | nothing changed | **abort. No backup, no writes.** Existing behaviour |
| after placing some files, before all | some files placed | remove **those** files; nothing else changed |
| after files, before selection | files placed, selection untouched | remove the files — **the panel is still correct** |
| after selection, before verify | both applied, unverified | rollback, because verification did not pass |
| **during rollback itself** | unknown | **stop and report.** Never chain further automatic recovery |

### The most important row

> **After files, before selection — the panel is still correct.**

This is why the install order places files first. A failure at that point is **recoverable by
deleting files**, with no panel-side change to undo. The dangerous window is the one between
setting the selection and verifying it, and it is deliberately as short as possible.

### Never chain automatic recovery

If a rollback fails, the installer **stops**. It does not attempt a second rollback, a "cleaner"
state, or a best-effort repair. Each further automatic action on an already-inconsistent state
increases the chance of destroying something recoverable. Report, and hand back to the operator with
`row-template rollback`.

---

## 8. Uninstall cleanup

**Uninstall must clear the panel-side selection.** Today it does not need to; with three panels it
does, and one case is genuinely dangerous.

| panel | a selection left pointing at a deleted directory |
|---|---|
| **3X-UI** | serves nothing, or the built-in page — visible |
| **PasarGuard** | a missing template; the loader may fail to resolve it |
| **Rebecca** | **silently falls back to the built-in template** — `ErrTemplateNotFound` is treated as "no custom template" |

**The Rebecca case is the reason this section exists.** A dangling selection there produces
`ErrTemplateNotFound`, which Rebecca handles by falling back — so the operator sees a working
subscription page and concludes uninstall succeeded, while every subscriber receives the built-in
page instead of the one they had. **Silent fallback is worse than a visible error.**

### Order

```
1  deactivate the selection   (restore the pre-Row-Template value, or remove it)
2  remove the files we placed
3  remove Row-Template state
```

**Never remove files first.** Removing the directory before clearing the selection creates exactly
the dangling state above, even if only for a moment — and if the process dies in that window, it
stays.

---

## 9. Upgrade compatibility

| concern | approach |
|---|---|
| **snapshot format changed** | the `format` marker. An older library **refuses** to restore a newer snapshot rather than ignoring the parts it does not know |
| **a new panel is added** | older snapshots simply have no `panels/<new>/` set; that panel is correctly treated as untouched |
| **a panel is removed from support** | its `panels/<old>/` set is ignored on restore, and the report says so — not silently skipped |
| **the panel changed its own schema** | re-read before writing (Phase 8B §10). A snapshot records a **value**, not a schema assumption, so it restores correctly regardless |
| **Row-Template upgraded while active** | the snapshot machinery is version-independent; the `format` marker is the only coupling |
| **a snapshot predates `panels/`** | **format 1** — it has no panel state. Restoring it restores Row-Template only, and **reports that it cannot restore panel state.** It must not silently appear to be a complete restore |

That last row is a real migration case: snapshots taken by the shipped 1.1.0 library have no panel
state. The design must handle them explicitly rather than treating "no `panels/` directory" as "no
panels were touched" — those are different, and only the format marker distinguishes them.

---

## 10. Security considerations

| # | risk | mitigation |
|---|---|---|
| **B1** | **the half-rollback** — files restored, selection not | the two-part snapshot (§1) and the restore order (§5). This is the risk the document exists to close |
| **B2** | deleting an operator's files | record **files**, never directories; remove only what is in `files` (§2) |
| **B3** | a corrupt snapshot applied | the snapshot manifest is verified **before** anything is restored (§4) |
| **B4** | a newer snapshot mis-read by an older library | the `format` marker; refuse rather than guess (§1) |
| **B5** | a secret written into a snapshot | **secrets are never captured.** A panel API token used for activation is held in memory for the transaction and is **not** written to the snapshot. A `config.env` that already contains a secret is captured because it is an existing file — but the design does not add new secret material |
| **B6** | snapshot permissions | the snapshot directory carries the same restrictive mode as the existing install root. A snapshot of panel state is as sensitive as the panel config |
| **B7** | symlink redirection into a privileged path | `rt_assert_not_symlink` on every write target, as the existing code already does |
| **B8** | `rm -rf` on an unexpected path | the existing `rt_is_within "$RT_BACKUPS"` containment check is preserved, and extended to any new removal path |
| **B9** | unbounded snapshot growth | the existing `rt_backups_prune` is preserved; the `panels/` subtree is small |
| **B10** | rollback leaving a service stopped | `meta.was_running` (§3) and the restore order (§5) |

### B5 deserves a note

The activation design (Phase 8B) has Rebecca's adapter using a **sudo-scoped API token**. That token
must not be persisted. It is read for the transaction, used, and dropped. **A snapshot is a
long-lived artefact on disk**; a token in it would outlive the transaction that needed it.

---

## What this design does NOT do

- It does not implement, stage or prepare anything.
- It does not modify `installer/`, `release/`, `VERSION`, `CHANGELOG.md` or `package.json`.
- It does not write code, tests or migrations.
- It does not decide the implementation order — only that **this must precede activation**.

---

## Verification

| check | result |
|---|---|
| `git diff --check` | **clean** |
| `git status --short` | documentation files only — see the phase report |
| `installer/` · `release/` · `VERSION` · `CHANGELOG.md` · `package.json` | **0 changes** |
| committed | **no** |

---

PHASE 8C COMPLETE — CORRECTION + BACKUP DESIGN ONLY
