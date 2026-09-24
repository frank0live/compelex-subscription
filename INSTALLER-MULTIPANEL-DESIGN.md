# Installer Multi-Panel Architecture Design

**Phase 8B — design only. No installer, release, version or changelog change. Nothing implemented,
nothing committed.**

| | |
|---|---|
| Date | 2026-09-21 |
| Tree | `feat/v1.2-multitemplate`, HEAD `fe5a359`, clean |
| Builds on | `INSTALLER-ACTIVATION-AUDIT.md` (Phase 8A) |
| Scope | the architecture for activating Row-Template across 3X-UI, PasarGuard and Rebecca |
| Status | **proposal** — nothing here is approved for implementation |

> **This document designs. It does not implement, and it must not be implemented from directly.**
> Phase 8A recommended a design phase precisely because the three panels do not share a mechanism;
> this is that design.

---

## 0. The constraint that shapes everything

The three panels are **not three configurations of one mechanism**. They are three mechanisms:

| | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| selection stored in | **database** | **environment** | **database** |
| write mechanism | sqlite3, stop→write→start | edit env, restart | **sudo HTTP API** *or* DB |
| per-admin? | no | yes | yes |
| engine escapes? | **yes** (Go `html/template`) | **no** (Jinja2) | **no** (pongo2) |

**The design therefore has one interface and three genuinely different implementations.** Any
abstraction that reduces this to "copy a file and set a path" is wrong, and will be wrong in a way
that silently serves the wrong page.

---

## 1. Installer core architecture

### Current shape (preserved)

```
install.sh (bootstrap)              fetch → verify checksums → extract → source library
        │
        └── rt_cmd_install ──────┬── environment discovery
                                 ├── staging + verification
                                 ├── backup
                                 ├── atomic activation
                                 ├── panel wiring          ← the part that generalises
                                 └── verification
```

The core stays as it is. **Everything below is an extension of the `panel wiring` step**, not a
replacement of the transaction machinery around it.

### Proposed shape

```
tools/installer/panels/
  index.sh            the panel registry — a closed set, like tools/panels.mjs
  adapter.sh          the interface contract + capability model
  3xui.sh             implementation A
  pasarguard.sh       implementation B
  rebecca.sh          implementation C
```

The installer gains **one new concept**: a panel adapter is a set of functions plus a **capability
declaration**. Nothing else changes.

**Deliberately mirroring the product side.** `tools/panels.mjs` already holds a closed registry of
three panels with a per-panel `emitter`, `status` and `adapter`. The installer should mirror that
shape, so the two halves of the product describe the same three panels the same way.

---

## 2. Panel adapter interface

Five functions. Every adapter implements all five; an adapter that cannot do one says so through
its capability declaration rather than by omitting the function.

```
panel_detect()          -> 0 installed / 1 not present / 2 indeterminate
                            sets: PANEL_BIN, PANEL_UNIT, PANEL_DB, PANEL_CONFIG

panel_capabilities()    -> prints the capability declaration (§3)

panel_install_template()-> place the file(s); set the selection.
                            MUST be idempotent and MUST NOT overwrite without consent.

panel_verify()          -> 0 verified serving / 1 not serving / 2 cannot tell
                            The distinction between 1 and 2 matters: "not serving" is a
                            failure, "cannot tell" is not.

panel_rollback()        -> undo BOTH the selection change and the file placement,
                            in the reverse order of installation.
```

### Why `verify` returns three values, not two

The existing installer already makes this distinction in `rt_render_smoke`, which can return
`skip` when no test URL can be built. Collapsing "cannot tell" into "failed" would turn a
perfectly good installation into a reported failure on a box where no subId is available. **The
three-valued result is a feature, not an inconvenience.**

### Why `rollback` is one function, not two

The two halves — the selection and the file — **must** be undone together. Phase 8A's §6 S1 found
that today's backup covers only Row-Template's files; a rollback that restores files but leaves the
panel pointing at them is not a rollback. Making this a single interface function makes the pairing
hard to get wrong.

---

## 3. Capability declaration model

Each adapter declares what it can do, so the installer can be honest before it acts:

```
PANEL_CAP_ACTIVATION=auto|manual|none     can the selection be set programmatically?
PANEL_CAP_ACTIVATION_HOW=db|env|api       by which mechanism?
PANEL_CAP_PER_ADMIN=yes|no                does it support per-admin selection?
PANEL_CAP_RESTART_REQUIRED=yes|no         must the service be restarted?
PANEL_CAP_VERIFY=live|static|none         live HTTP check, file check, or nothing
PANEL_CAP_REQUIRES=sqlite3|curl|token     external prerequisites
```

This is the generalisation of the existing `rt_subtheme_configure`, which already returns `auto` or
`manual`. **That pattern is proven and should be extended, not replaced.**

**Consequence:** the installer can print, before touching anything, exactly what it will do and what
it cannot. A panel with `ACTIVATION=manual` is not a failure — it is a known limitation reported up
front.

---

## 4. Detection strategy

Detection is **per-adapter and independent**. The existing `rt_detect_xui` already establishes the
pattern: probe binaries, then the systemd unit, then the database, and treat absence as
non-fatal.

| panel | binary | unit | config/DB |
|---|---|---|---|
| 3X-UI | `/usr/local/x-ui/x-ui`, `/usr/local/bin/x-ui` | `x-ui.service` | `/etc/x-ui/x-ui.db`, `/usr/local/x-ui/x-ui.db`, `/etc/3x-ui/x-ui.db` |
| PasarGuard | the panel's entrypoint | the panel's unit | the panel's `.env` / config dir |
| Rebecca | `rebecca_gateway` | the gateway's unit | the gateway's DB and config dir |

**Rules:**

1. **Detection never infers one panel from another.** The existing library already says the panel
   and Row-Template are independent; extend that to panels being independent of each other.
2. **Multiple panels may be present.** The design must support activating more than one — a box can
   run two panels. Detection returns a **set**, not a single panel.
3. **Absence is not an error.** No panel found means the installer stops at "files placed,
   activation skipped", exactly as today.
4. **Never guess a database path.** Probe the documented locations and stop. A wrong DB path is the
   worst failure in this design.

---

## 5. Installation lifecycle

```
1  discover              → which panels are present
2  declare               → print each panel's capabilities (auto / manual / none)
3  confirm               → the operator sees what will change, per panel
4  stage                 → files into a staging area; nothing live yet
5  verify payload        → checksums (existing machinery, unchanged)
6  backup                → Row-Template state AND panel-side selection (§8)
7  place files           → atomic rename, per panel
8  activate              → per-adapter: db | env | api  (§6)
9  verify                → per-adapter: live | static | none  (§7)
10 on any failure        → rollback (§9), then report honestly
```

**Step 3 is new and load-bearing.** Today the installer configures 3X-UI without asking, because
there is only one panel and one mechanism. With three mechanisms and a real risk of overwriting an
operator's custom template, the operator must see the plan first.

**Step 10's "report honestly" is not decoration.** The existing code already distinguishes "restored
automatically" from "automatic restore failed; run `row-template rollback`". That honesty must
survive the extension.

---

## 6. Activation lifecycle

**Activation is per-adapter. There is no shared activation path.**

| | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| mechanism | **database** | **environment** | **API** (preferred) or DB |
| sequence | stop → write → start → verify | edit env → restart | API call → (restart if needed) |
| atomicity | DB transaction-ish; the stop is what makes it safe | file write + reload | the API is atomic |
| failure mode | panel left stopped if the write dies | panel serves nothing if the env is malformed | API returns an error; nothing changed |

**Invariant across all three:** *the selection is written only after the files are in place and
verified.* If files fail, nothing is written. If the write fails, the files are removed.

### The 3X-UI stop is not optional

`rt_subtheme_set_sqlite` stops the service, writes, starts, and re-reads. The stop exists because a
running panel **flushes a stale in-memory value back over the change**. Any adapter that writes a
selection into a running panel's database must use the same discipline. This is the single most
important behaviour to preserve.

---

## 7. Verification lifecycle

Three levels, declared per adapter:

| level | what it proves | used by |
|---|---|---|
| **live** | the panel actually serves our page — HTTP fetch, look for a known marker | 3X-UI (exists: `id="sub-data"`) |
| **static** | the file is in place, the selection reads back as written | PasarGuard, Rebecca |
| **none** | nothing can be checked | never chosen; declared only if a panel offers no path |

**Live is preferred wherever it is possible**, because filesystem presence is not proof — the
existing source says exactly that: *"Filesystem presence is not proof."*

**The VPN-client check must be preserved.** `rt_render_smoke_vpn` confirms a VPN client user-agent
still receives raw subscription content rather than the HTML page. This catches a real class of
breakage — negotiation broken by the wrong template — that the browser check alone would miss.

---

## 8. Backup architecture

### The gap this design must close

Phase 8A §6 S1: `rt_backup_create` captures `template.html`, its sidecar, `config.env` and
`VERSION`. It captures **nothing** about the panel. So today's rollback restores our files and
leaves the panel pointing at them.

### Proposed: a two-part backup

```
backups/<ts>__<ver>/
  template.html                 (existing)
  template.html.sha256          (existing)
  config.env                    (existing)
  VERSION                       (existing)
  panels/                       ← NEW
    <panel>.selection           the panel-side selection value(s), pre-change
    <panel>.files               which files we placed, so we know which to remove
    <panel>.meta                mechanism, capabilities, whether the panel was running
```

### What each panel must record

| panel | must capture |
|---|---|
| 3X-UI | the previous `settings.subThemeDir` value (or "absent") |
| PasarGuard | the previous `CUSTOM_TEMPLATES_DIRECTORY` and `SUBSCRIPTION_PAGE_TEMPLATE`, plus the env file path |
| Rebecca | the previous `subscription_settings` row's `custom_templates_directory` and `subscription_page_template`, or the previous per-admin override |

**`<panel>.meta` records whether the panel was running before we touched it.** Without it, rollback
cannot know whether to leave the service stopped or restart it.

**Backup format versioning.** A newer library must not mis-read an older backup dir. The design adds
a format marker; a library that does not understand a format **refuses to restore** rather than
guessing.

---

## 9. Rollback architecture

**Rollback reverses the installation in reverse order, and it is all-or-nothing per panel.**

```
1  deactivate selection   → restore the captured value via the SAME mechanism that set it
2  remove placed files    → only the files we recorded placing; never a directory
3  restore service state  → running if it was running, stopped if it was stopped
4  restore Row-Template   → the existing snapshot machinery, unchanged
```

**Rules:**

1. **Never delete a directory.** Remove only the specific files recorded in `<panel>.files`. An
   operator's custom template directory may contain their own work.
2. **Never restore a selection for a panel that was not changed.** A partial backup must produce a
   partial rollback, not a wrong one.
3. **Restore through the same mechanism.** If activation used the API, rollback uses the API. A
   rollback that uses a different path can fail differently.
4. **Report the outcome.** The existing distinction — automatic restore succeeded vs. "automatic
   restore failed; run `row-template rollback`" — is preserved and extended per panel.

---

## 10. Upgrade strategy

| concern | approach |
|---|---|
| the panel changed its defaults | **re-read before writing.** Never assume a default; the migrations for both new panels touch these exact columns |
| the panel added a template key | unknown keys are refused by Rebecca; the adapter must not invent one |
| Row-Template is upgraded while active | the selection is re-asserted only if it currently points at us; otherwise it is left alone |
| the backup format changed | format marker; refuse rather than guess (§8) |
| a panel upgrade removes our file | `verify` catches it at the next run; the installer re-places it only on an explicit request |

**Rule: an upgrade never silently changes a panel's selection.** If the current value is not ours,
the installer reports it and stops.

---

## 11. Uninstall strategy

**Uninstall must clear the panel-side selection.** Today it does not need to, because there is one
panel and one setting; with three panels an uninstall that leaves a selection pointing at a deleted
directory produces:

- **3X-UI** — serves nothing, or the built-in page
- **PasarGuard** — a missing template; the loader may fail to find it
- **Rebecca** — **silently falls back to the built-in template**, because an unresolvable custom
  path returns `ErrTemplateNotFound` and is treated as "no custom template"

The Rebecca case is the dangerous one: a silent fallback looks like "uninstall worked" while the
operator's subscribers see the built-in page.

**Order:** deactivate selection → remove files → remove Row-Template state. Never remove files
first.

---

## 12. Security model

| # | risk | mitigation |
|---|---|---|
| S1 | **partial rollback** (Phase 8A's biggest gap) | the two-part backup (§8) and the single `panel_rollback` (§2) |
| S2 | duplicate settings rows (3X-UI `settings.key` is **non-unique**) | explicit INSERT-or-UPDATE + re-read, as the existing code does |
| S3 | wrong admin assignment | per-admin writes are **opt-in**, require an explicit admin id, and validate the admin exists |
| S4 | **overwriting an operator's custom template** | detect an existing custom template and **refuse**; never overwrite without explicit consent |
| S5 | panel left stopped after a failed write | record pre-state in `<panel>.meta`; restore service state in rollback |
| S6 | path traversal | Rebecca already rejects absolute paths and `..`; **the installer must place files inside the directory and reference them relatively** |
| S7 | malformed env edit (PasarGuard) | write atomically via the existing `rt_atomic_install`; keep a copy; validate the result parses |
| S8 | the engine does not escape | 3X-UI's Go `html/template` **does**; PasarGuard's Jinja2 and Rebecca's pongo2 **do not** — a deployment requirement, recorded, not solved here |
| S9 | symlink redirection | reuse `rt_assert_not_symlink` on every new write target |
| S10 | uninstall leaves a dangling selection | §11 |

**S4 deserves emphasis.** An operator who already runs a custom subscription template will have
files in `custom_templates_directory`. Writing ours there destroys their work, and the loss is
silent. **Refusing is the correct default.**

---

## 13. Permission handling

| operation | requirement |
|---|---|
| all of it | root — the existing `rt_require_root` applies unchanged |
| 3X-UI DB write | read/write on the DB **and `sqlite3` present** |
| PasarGuard env edit | write on the panel's config directory |
| Rebecca API | a **sudo-scoped token** — the routes are `requireSudo` |
| every new write target | `rt_assert_not_symlink` first |

**Prerequisites are declared, not assumed.** A panel whose prerequisite is missing reports
`manual`, exactly as `rt_subtheme_set_sqlite` returns `2` today when `sqlite3` or the DB is absent.
The existing source states the principle: *"We never install sqlite3 to force the first path."*
**Extend that: never install a dependency to force an automatic path.**

---

## 14. Failure handling

**Invariant: a failure leaves the system in the state it was in before the step began.**

| stage | on failure |
|---|---|
| discovery | report; nothing changed |
| staging | abort; nothing changed |
| payload verification | abort — the existing integrity gate, unchanged |
| backup | **abort.** No backup, no writes. The existing code already does this: *"could not snapshot the current state; aborting"* |
| file placement | remove placed files; nothing else changed |
| activation | restore the selection, remove files, restore service state |
| verification | **do not auto-rollback a `cannot tell`** — only a definite `not serving` triggers rollback |
| rollback itself | report explicitly; never claim success |

**The last row is a design decision.** A live verification that cannot reach the panel is not
evidence of failure. Auto-rolling-back on it would make the installer destructive on a box with a
firewall.

---

## 15. Manual fallback strategy

**`manual` is a first-class outcome, not an error.**

Every adapter can decline to activate automatically and instead print precise instructions. This
already exists for 3X-UI (the `manual` branch prints the Settings → Subscription → Sub Theme
Directory path) and should be the model for the other two.

A manual outcome must state:

1. **what was done** — files placed, and where
2. **what was not done** — the selection, and why
3. **exactly how to finish** — the setting name, the value to enter, and where in the panel UI
4. **how to check** — what to look for

**The installer must never leave the operator guessing whether it worked.** A silent
`ErrTemplateNotFound` fallback (Rebecca) is precisely the failure this section exists to prevent.

---

## Panel-specific sections

### 3X-UI

**Current behaviour — preserved exactly.** The existing path is not replaced; it becomes one
adapter among three, with its logic unchanged.

| aspect | preserved behaviour |
|---|---|
| **sqlite activation** | `settings.subThemeDir` set via **stop → write → start → verify**; SQL-quote escaped; explicit INSERT-or-UPDATE because `settings.key` is non-unique; re-read and compared |
| **return codes** | `0` verified / `2` manual (no `sqlite3` or no DB) / `1` failure — unchanged |
| **detection** | binary → unit → DB probes, including the preserved no-`grep -q`-under-pipefail fix |
| **verification** | live HTTP smoke for `id="sub-data"`, plus the VPN user-agent check |
| **minimum version** | `RT_MIN_XUI=3.6.0` — unchanged |

**New in this design:** capture the previous `subThemeDir` in the backup (§8) so a rollback can
restore it. That is the only behavioural addition, and it closes S1.

---

### PasarGuard

**Template directory.** `custom_templates_directory` is **prepended** to `template_directories`, so
our template wins over the built-in `subscription/index.html`. The adapter must:

- resolve the directory from `CUSTOM_TEMPLATES_DIRECTORY`, or a documented default
- place our shell as a **Jinja2** file at the name the setting will reference
- **refuse if a file already exists there** (§12 S4)

**Environment variables.** The selection is `SUBSCRIPTION_PAGE_TEMPLATE` — an **env setting, not a
database write**. The adapter must:

- edit the panel's env/config **atomically** (`rt_atomic_install`)
- keep the previous values for rollback
- validate that the result is well-formed before restarting

**Admin selection.** `admin.sub_template` is a **per-admin database override** that takes priority
over the global setting. It is **optional** and **opt-in**: the global env setting is sufficient for
a normal install. Per-admin writes require an explicit admin id.

**Verification.** `static` — the file exists, and the env setting reads back as written. A live
check is possible in principle but requires a subscription token, so `static` is the declared level.

**Known deployment requirement:** `Environment(...)` is built with **no autoescape**. Our shell
interpolates into HTML attributes and therefore requires the engine to escape. This is recorded, not
solved here.

---

### Rebecca

**Filesystem template model.** The database holds a **selection** — a directory and a name — and the
content is read from disk by `resolveCustomTemplatePath` → `safeJoin` → `os.Stat` → `os.ReadFile`.
**There is no content column.** The adapter must:

- place our shell inside the custom directory
- reference it by a **relative** name — Rebecca rejects absolute paths and traversal
- remember that an empty or unresolvable directory yields `ErrTemplateNotFound`, which
  **silently falls back** to the built-in template

**Supported API / settings activation.** Rebecca exposes a **sudo-gated HTTP API**:

```
PUT /api/settings/subscriptions
PUT /api/settings/subscriptions/admins/*
```

**Prefer the API over a direct database write.** It is the panel's own supported interface, it is
atomic from our side, and it avoids us knowing Rebecca's schema. The direct-DB path exists as a
fallback for a box where the API is unreachable, but it should not be the default.

The adapter must set:

- `custom_templates_directory` → where we placed the file
- `subscription_page_template` → the relative name

**Per-admin.** `admins.subscription_settings` is a **JSON map** on the admin row. Per-admin
overrides are **opt-in**, require an explicit admin id, and must validate the admin exists.

**Verification.** `static` — the file exists and the settings read back as written. The silent
fallback makes this important: **a `static` check that passes is the only thing distinguishing
"activated" from "silently fell back".**

**Note for a future phase:** `INSTALLER-MULTIPANEL-AUDIT.md` (committed) states that Rebecca stores
template content in the database. **That is wrong** and should be corrected by a dated addition, per
this project's convention for audit documents.

---

## What this design does NOT do

- It does not implement, stage, or prepare anything.
- It does not modify `installer/`, `release/`, `VERSION`, `CHANGELOG.md` or `package.json`.
- It does not create adapters, migrations, or tests.
- It does not decide the **implementation order**. That is a separate decision, and Phase 8A's
  prerequisite stands: **the backup extension (§8) must land before any activation ships.**

---

## Verification

| check | result |
|---|---|
| `git status --short` | **only `?? INSTALLER-MULTIPANEL-DESIGN.md`** |
| `git diff --check` | **clean** |
| `installer/` · `release/` · `VERSION` · `CHANGELOG.md` · `package.json` | **all 0** |
| committed | **no** |

---

PHASE 8B COMPLETE — INSTALLER DESIGN ONLY — NO IMPLEMENTATION
