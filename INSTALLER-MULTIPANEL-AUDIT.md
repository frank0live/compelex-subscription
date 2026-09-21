# Installer Multi-Panel Audit

**Phase 7A — audit only. No installer, release, tool or source change.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree | branch `feat/v1.2-multitemplate`, HEAD `52f8fc0`, `VERSION` 1.1.0 |
| Scope | what the installer is today, what multi-panel would require, and the safest path |
| Method | source read directly, across all three panel trees |
| Verdict | **The three panels deliver templates by three different mechanisms. "Installer parity" is a much larger job than it looks. Recommend packaging only, or deferring. See §7.** |

---

## 1. The installer today

| file | size | role |
|---|---|---|
| `installer/install.sh` | 5,805 B | the bootstrapper — verifies the payload, then sources the library |
| `installer/lib/row-template.sh` | **113,787 B** | the whole administration layer |
| `installer/bin/row-template` | 1,951 B | the CLI wrapper |
| `tools/make-release.sh` | — | builds the release tarball |
| `tests/installer.test.mjs` | 1,270 lines, **70 tests** | the installer suite (excluded from routine runs — it is slow) |
| `tests/release.test.mjs` | **2 tests** | payload contents + byte-determinism |

**Operations** (`installer/lib/row-template.sh`): environment discovery, config read/write,
template generation, per-template store management, activation, snapshots and rollback, live
verification, service safety (stop → write → start), and update checks.

**Paths:**

```
RT_ROOT=/etc/3x-ui/sub_templates/row-template    # ours, under /etc/3x-ui
RT_BIN=/usr/local/bin/row-template
RT_LIVE=$RT_ROOT/sub.html                        # what the panel serves
RT_DIST=$RT_ROOT/dist/template.html              # the pristine artifact
RT_TEMPLATE_STORE=$RT_ROOT/dist/templates        # one artifact per selectable design
RT_MIN_XUI="3.6.0"
```

---

## 2. The installer is 3X-UI-specific **by design**

Its own header says so:

> *"The panel and Row-Template are deliberately independent. Discovery locates the panel binary,
> its systemd unit and (only if present) its database; it never infers the Row-Template root from
> the panel, or vice versa."* (`row-template.sh:805`)

Every one of the **46** occurrences of "panel" in the library means 3X-UI. Specifically:

- `rt_detect_xui_db()` probes `/etc/x-ui/x-ui.db`, `/usr/local/x-ui/x-ui.db`, `/etc/3x-ui/x-ui.db`
- `RT_MIN_XUI="3.6.0"` gates on the 3X-UI version
- The auto-configuration writes **`subThemeDir`** — a 3X-UI setting — into the 3X-UI database, or
  prints manual instructions when no database can be located (`row-template.sh:861`, `:1183`)
- `RT_ROOT` is deliberately `/etc/3x-ui/...`, *not* the panel's config root

**None of this generalises.** There is no `RT_MIN_PASARGUARD`, no PasarGuard database probe, no
Rebecca equivalent.

---

## 3. What the release ships

`tools/make-release.sh` assembles:

```
row-template-<version>/
  template.html                       # the Row artifact — 3X-UI
  templates/<id>/template.html        # every selectable design — 3X-UI
  templates/<id>/template.html.sha256
  VERSION  install.sh  lib/row-template.sh  bin/row-template
  SHA256SUMS
```

Verified against the built `release/row-template-1.1.0.tar.gz`. **It contains no panel shells.**
`dist/shells/{pasarguard,rebecca}/` are produced by `build:panels` but are not packaged.

The generator also asserts that *nothing outside the registry sneaks in from stale build output* —
a guard that will need extending if the payload grows a second artifact family.

---

## 4. THE FINDING: three panels, three delivery mechanisms

This is the finding that decides the phase. The installer's model is *"drop a file, set an
absolute path"*. **That model fits exactly one of the three panels.**

| panel | how it finds its template | installer would need to |
|---|---|---|
| **3X-UI** | `subThemeDir` — an **absolute path** to a file | drop a file, write one setting — **what it already does** |
| **PasarGuard** | `custom_templates_directory` inserted at index 0 of `template_directories` → `Environment(loader=FileSystemLoader(...))`, plus a **per-admin** `admin.sub_template` name | drop a **directory** of templates, set the directory, and set the name **per admin** |
| **Rebecca** | `settingsRepo.ReadTemplateContent(ctx, templateKey, adminID)` — template **content lives in the DATABASE**, per admin, with a filesystem directory as fallback | **write to the database**, or rely on the directory fallback |

Evidence:

- PasarGuard `app/templates/__init__.py:10-15` — `template_directories = ["app/templates"]`, then
  `insert(0, template_settings.custom_templates_directory)`
- PasarGuard `app/models/admin.py:131,164` — `sub_template: str | None` **on the admin model**
- Rebecca `internal/app/settings/repository.go:687` — `ReadTemplateContent(ctx, templateKey, adminID)`
- Rebecca's own test name confirms the shape:
  `TestReadTemplateContentIgnoresPersistentDirectoryWhenDBDirectoryIsEmpty`

**Consequences:**

1. **A single "install the template" operation cannot serve all three.** The installer's
   activation, snapshot, rollback and verification machinery is built around one file path.
2. **Rebecca is the hard case.** Delivering a template means a **database write** — a new class of
   side effect the installer has never performed. Its existing DB interaction is *read-only*
   discovery, and it deliberately never writes to the panel's database except `subThemeDir`.
3. **PasarGuard is per-admin.** 3X-UI's `subThemeDir` is installation-wide; PasarGuard's
   `sub_template` is per-admin. "Installed" is not a single boolean any more.

---

## 5. What is genuinely missing (and what is not)

| # | gap | size |
|---|---|---|
| G1 | the release does not ship `dist/shells/` | **small** — a packaging change plus checksums |
| G2 | no PasarGuard/Rebecca discovery (binary, unit, config, database) | medium |
| G3 | no per-panel activation/snapshot/rollback | **large** — the existing machinery is single-path |
| G4 | no Rebecca database-write path | **large** — and a new risk class |
| G5 | no per-admin selection model (PasarGuard, Rebecca) | medium |
| G6 | the installer suite (70 tests) assumes 3X-UI throughout | large to extend |

**G1 is small and mechanical. G2–G6 are a workstream, not a phase.**

---

## 6. Options

| | Option | Scope | Risk | Verdict |
|---|---|---|---|---|
| **A** | **Package the shells only** | `make-release.sh` + `tests/release.test.mjs` | low — additive to the payload | **Recommended** |
| B | Package + panel discovery (read-only) | + `row-template.sh` discovery, `tests/installer.test.mjs` | medium | next step |
| C | Package + discovery + activation | + per-panel activation, snapshot, rollback | **high** | needs a design doc first |
| D | Full parity incl. Rebecca DB writes | + a new write path into a third-party database | **highest** | not advisable without upstream guidance |
| E | Defer entirely | none | none | viable — see below |

**Why A is safe.** The shells already exist and are already tested (`tests/panels-*-shell.test.mjs`,
52 tests). Shipping them is a packaging change with no behaviour change to the installer, no new
side effects, and no new failure modes. It also makes the release honest: today the product *can*
build PasarGuard and Rebecca shells, and the release pretends it cannot.

**Why C and D need a design doc first.** They introduce a second and third activation model, a
per-admin concept, and — for Rebecca — the first write into a panel's database. Those are product
and safety decisions, not packaging ones.

**Why E is viable.** The installer is not blocking anything: the shells are build outputs, and an
operator can place them by hand. Nothing is broken today.

---

## 7. Recommendation

### Take **A** — package the shells — and stop there.

1. It is the only option that is purely additive, and it closes a real inconsistency: the product
   builds three panels' shells and ships one.
2. It does not touch `installer/lib/row-template.sh`, so the 70-test installer suite is untouched.
3. It leaves the harder questions (discovery, activation, Rebecca's database) to a phase that
   starts with a design doc, which is how this project has handled every other unfamiliar area.

### If A is taken, the shape of it

- `tools/make-release.sh` ships `dist/shells/<panel>/<template>/shell.html` under a new
  `shells/` tree, with a checksum per file, mirroring the existing `templates/` treatment.
- The existing "nothing outside the registry may sneak in" guard must be extended to cover the
  new tree, or it will fail the build.
- `tests/release.test.mjs` gains assertions for the new tree; its byte-determinism test must still
  pass, which means the packaging order must be stable.
- **No installer behaviour change.** `install.sh` and `lib/row-template.sh` are untouched.

### What this audit does NOT decide

- Whether the installer should ever configure PasarGuard or Rebecca automatically.
- Where the shells should live on a target host.
- Whether Rebecca's database should be written to — that needs the upstream project's guidance,
  not a decision we can make from outside.

---

## 8. Verification

| check | result |
|---|---|
| `git diff --check` | **clean** |
| Only allowed new file | **`INSTALLER-MULTIPANEL-AUDIT.md`** |
| `installer/` · `release/` · `src/` · `template/` · `docs/` · `VERSION` · `CHANGELOG.md` | **0 changes** |
| Artifacts | **15 compared, 0 differing** |
| Committed | **no** |

---

INSTALLER MULTI-PANEL AUDIT COMPLETE — THREE DELIVERY MECHANISMS, NOT ONE — RECOMMEND PACKAGING ONLY — AWAITING APPROVAL
