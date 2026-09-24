# Installer Activation Audit

**Phase 8A — audit only. No installer, release, version, adapter, migration, template or runtime
change. Nothing committed.**

| | |
|---|---|
| Date | 2026-09-21 |
| Tree | `feat/v1.2-multitemplate`, HEAD `fe5a359`, tree clean |
| Scope | how Row-Template could be automatically activated after install, for 3X-UI / PasarGuard / Rebecca |
| Method | static read of `installer/` and both panel sources |
| Verdict | **The installer is 3X-UI specific. But activation is tractable for all three — and one Phase 7A finding was WRONG. See §5.** |

---

## PART 1 — Current installer audit

### Entry points

| file | size | role |
|---|---|---|
| `installer/install.sh` | 5,805 B | bootstrap — fetch, checksum-verify, extract, source the library, hand the whole transaction to `rt_cmd_install` |
| `installer/lib/row-template.sh` | **113,787 B** | the administration layer, ~120 `rt_*` functions |
| `installer/bin/row-template` | 1,951 B | the CLI wrapper |

`install.sh` is deliberately minimal: *"it never becomes a second implementation"* of the library.
The library **re-verifies the payload**, so a bug in the bootstrap cannot bypass the integrity gate.

### Detection logic

| function | probes |
|---|---|
| `rt_detect_xui` | `/usr/local/x-ui/x-ui`, `/usr/local/bin/x-ui`, then `command -v x-ui`; systemd unit `x-ui.service` |
| `rt_detect_xui_version` | the Go binary's `-v` output |
| `rt_detect_xui_db` | `/etc/x-ui/x-ui.db`, `/usr/local/x-ui/x-ui.db`, `/etc/3x-ui/x-ui.db` |

A notable real-world fix is preserved in the source: no `grep -q` under `set -o pipefail`, because
`grep -q` closes the pipe and `systemctl` dies of SIGPIPE, which `pipefail` then promotes — so the
unit was *missed on every box*.

### Filesystem assumptions

```
RT_ROOT=/etc/3x-ui/sub_templates/row-template   # ours, under /etc/3x-ui
RT_BIN=/usr/local/bin/row-template
RT_LIVE=$RT_ROOT/sub.html                       # what the panel serves (generated)
RT_DIST=$RT_ROOT/dist/template.html             # the pristine artifact
RT_TEMPLATE_STORE=$RT_ROOT/dist/templates       # one artifact per selectable design
RT_BACKUPS=$RT_ROOT/backups
RT_MIN_XUI="3.6.0"
```

`RT_ROOT` is deliberately **not** under the panel's config root, which may be `/etc/x-ui`.

### Supported panel assumptions

**One panel: 3X-UI.** See the verdict below.

### Backup system

`rt_backup_create` writes a timestamped dir `${ts}__${ver}` under `RT_BACKUPS` containing
`template.html`, `template.html.sha256`, `config.env` and `VERSION`.

> **It captures Row-Template's own files only.** It does **not** capture the panel's database, the
> panel's config, or the panel's systemd unit. This matters enormously in §6.

### Rollback system

- `rt_restore_snapshot(cfgbak, distbak, sumbak)` — restores config + artifact + sidecar
- `rt_restore_from_backup` — the install-path entry
- Every write is wrapped: **backup → write → on failure restore + reactivate**, and if the automatic
  restore itself fails it says so and points at `row-template rollback` rather than claiming success
- `rt_safe_rmdir` will `rm -rf` a directory **only after** `rt_is_within "$RT_BACKUPS"` confirms
  containment

### Checksum handling

Outer `SHA256SUMS` (the tarball) and inner `SHA256SUMS` (every payload file). `rt_tar_extract_safe`
extracts; `rt_sums_lookup` resolves; the library re-verifies after extraction.

### Permission handling

- `rt_require_root` — the operation must run as root
- `rt_assert_not_symlink` — *"refuse to write through / delete a path that is itself a symlink — a
  classic vector for redirecting a privileged write into an unrelated system file"*
- `rt_atomic_install` — stage beside the destination, `chmod`, then **rename**; a same-filesystem
  rename is atomic, so a reader sees either the whole old or the whole new file

### Failure handling

Strong. Every mutation is inside a backup/restore envelope, the activation step is atomic, and the
one case that cannot be undone automatically is reported honestly.

### VERDICT

## **(B) 3X-UI specific.**

Evidence, from source:

| probe | result |
|---|---|
| panel-adapter / plugin registry in the library | **0 matches** |
| `pasarguard` / `rebecca` / `jinja2` / `pongo2` anywhere in `installer/` | **0 matches** |
| panel-facing functions | all named `rt_detect_xui*`, `rt_subtheme_*` |
| detection paths | x-ui binaries and x-ui DB only |

The library's own comment states the design: *"The panel and Row-Template are deliberately
independent."* That is true of 3X-UI. It is not an abstraction.

---

## PART 2 — 3X-UI activation audit

**How the template is installed.** `rt_set_dist` stages the selected artifact at
`RT_DIST=$RT_ROOT/dist/template.html`; `rt_generate` writes the branded page to `RT_LIVE`.

**How `subThemeDir` works.** `rt_subtheme_set_sqlite` sets `settings.subThemeDir = $RT_ROOT` in the
x-ui database, in this order:

> **stop → write → start → verify**

The stop is not decorative: a running panel would otherwise flush a stale in-memory value back over
the change. The write is SQL-quote-escaped, and uses explicit INSERT-or-UPDATE because
`settings.key` carries a **non-unique** index, so `ON CONFLICT` is unavailable. It then **re-reads**
and compares. Return codes: `0` verified, `2` no sqlite3 or no DB, `1` genuine failure.

**Is activation already automatic?** **Yes, conditionally.** `rt_subtheme_configure` maps the
outcome to `auto` or `manual`: when `sqlite3` and the DB are both present it configures the panel
programmatically and verifies; otherwise it prints manual instructions for the panel UI. The
source says *"We never install sqlite3 to force the first path."*

**Backup and rollback.** Covered by `rt_backup_create` / `rt_restore_from_backup` — for
Row-Template's files. The `subThemeDir` value is **not** part of the backup (§6).

**Verification.** `rt_render_smoke` builds a localhost `/sub/<id>` URL and classifies the response:
`pass` if the body contains `id="sub-data"`, `fallback` if the panel's built-in page came back,
`skip` if no URL could be built, `error` if unreachable. It also checks that a VPN client
user-agent still receives raw subscription content rather than the HTML page.

---

## PART 3 — PasarGuard activation audit

### Template discovery

`app/templates/__init__.py`:

```python
template_directories = ["app/templates"]
if template_settings.custom_templates_directory:
    template_directories.insert(0, template_settings.custom_templates_directory)
env = Environment(loader=FileSystemLoader(template_directories))
env.filters.update(CUSTOM_FILTERS)
```

Two things to note:

1. The custom directory is **prepended**, so user templates win over the built-ins.
2. **`Environment(...)` is constructed with no `autoescape` argument.** This confirms the Phase 5A
   security finding from the other direction: our shell interpolates into HTML attributes and
   therefore **requires** the engine to escape. PasarGuard's Jinja2 does not, by default.

### Where the settings live — **config, not database**

```python
class TemplateSettings(EnvSettings):
    custom_templates_directory: str | None = Field(default=None,  validation_alias="CUSTOM_TEMPLATES_DIRECTORY")
    subscription_page_template: str        = Field(default="subscription/index.html",
                                                  validation_alias="SUBSCRIPTION_PAGE_TEMPLATE")
    home_page_template: str                = Field(default="home/index.html",
                                                  validation_alias="HOME_PAGE_TEMPLATE")
```

`EnvSettings` — **environment variables.** The global path needs **no database write at all.**

### Resolution at render time

`app/operation/subscription.py:444-450`:

```python
is_subscription_page_request = is_browser_request and not sub_settings.disable_sub_template
if is_subscription_page_request:
    template = (
        db_user.admin.sub_template
        if db_user.admin and db_user.admin.sub_template
        else template_settings.subscription_page_template
    )
```

So: **per-admin `sub_template` (DB) wins; otherwise the global env setting.**

`disable_sub_template` is a global setting, default `False`; when `True` a browser request never
gets the HTML page at all.

### What does the installer need to do?

| capability | required? |
|---|---|
| copy the template file into a directory | **yes** — a Jinja2 file under `custom_templates_directory` |
| create that directory | **yes**, if absent |
| modify **config/env** (`CUSTOM_TEMPLATES_DIRECTORY`) | **yes** |
| modify **config/env** (`SUBSCRIPTION_PAGE_TEMPLATE`) | **yes** — set it to our template's relative name |
| update the **database** | **not for the global path** |
| modify **every admin** | **no** — only if per-admin overrides are wanted |
| modify **one admin** | optional |
| require user selection | **no** — the global default is sufficient |

**Capability summary: file copy + env-var edit + service restart (+ optionally a per-admin DB
write).** Note the template is referenced as a **path with a directory component**
(`subscription/index.html`), so our single-file shell must be placed at a name that matches, or the
setting must name it correctly.

---

## PART 4 — Rebecca activation audit

### The template key system

`internal/app/settings/repository.go` defines a **closed set**:

```go
var templateKeys = map[string]bool{
    "clash_subscription_template": true,  "clash_settings_template": true,
    "subscription_page_template":  true,  "home_page_template":      true,
    "v2ray_subscription_template": true,  "v2ray_settings_template": true,
    "happ_subscription_template":  true,  "incy_subscription_template": true,
    ...
}
```

An unknown key is refused (`ErrUnsupportedTemplateKey`), not defaulted.

### Where templates are stored — **THE CORRECTION**

> **Phase 7A reported that Rebecca stores template CONTENT in the database. That was WRONG.**
>
> Rebecca stores a **path and a name** in the database and reads the **content from the
> filesystem.**

Evidence:

```go
func resolveCustomTemplatePath(templateName string, customDirectory *string, adminID *int64) (string, error) {
    baseDir := ""
    if customDirectory != nil { baseDir = strings.TrimSpace(*customDirectory) }
    if baseDir == "" { return "", fmt.Errorf("%w: %s", ErrTemplateNotFound, templateName) }
    path, err := safeJoin(baseDir, templateName)
    ...
    if info, statErr := os.Stat(path); statErr == nil && !info.IsDir() { return path, nil }
    return "", fmt.Errorf("%w: %s", ErrTemplateNotFound, templateName)
}
```

and `readTemplateSelection` does `os.ReadFile(path)`.

**There is no content column anywhere.** A grep of the migrations for a template content column
returns nothing. The schema holds `custom_templates_directory VARCHAR(512) NULL` and
`<key>_template VARCHAR(255)` — **names and a directory**.

### Database schema involved

| table | column(s) | holds |
|---|---|---|
| `subscription_settings` | `custom_templates_directory VARCHAR(512) NULL` | the base directory |
| `subscription_settings` | `subscription_page_template VARCHAR(255)` default `subscription/index.html` | the template name |
| `admins` | `subscription_settings` — a **JSON blob** | per-admin overrides |

The global row is read as `SELECT ... FROM subscription_settings ORDER BY id DESC LIMIT 1` — a
single logical settings row.

### Admin ownership model

```go
if adminID != nil {
    overrides, err := r.adminSubscriptionSettingsMapTx(ctx, tx, *adminID)
    if value, ok := stringFromMap(overrides, templateKey); ok && strings.TrimSpace(value) != "" {
        templateName = strings.TrimSpace(value)
    }
    if value, ok := stringFromMap(overrides, "custom_templates_directory"); ok && ... {
        custom = &trimmed
    }
}
```

and

```go
tx.QueryRowContext(ctx, `SELECT subscription_settings FROM admins WHERE id = ? LIMIT 1`, adminID)
```

So the per-admin override is a **JSON map on the `admins` row**, not dedicated columns.
`adminExistsTx` validates the admin exists, returning `ErrAdminNotFound` otherwise — **an installer
must not write an override for an admin id that does not exist.**

### How `ReadTemplateContent` works

```
ReadTemplateContent(ctx, templateKey, adminID)
  → validate templateKey against the closed set
  → ensureSubscriptionRecord
  → templateSelection(ctx, templateKey, adminID)      // DB: name + directory
  → readTemplateSelection(...)                         // disk: os.ReadFile
      customOnly=true  → resolveCustomTemplatePath(name, customDir, adminID)
      customOnly=false → resolveAppTemplatePath(name)
  → returns TemplateContent{..., Content: contentText}
```

Note `contentText := strings.ReplaceAll(string(content), "\r\n", "\n")` — Rebecca **normalises CRLF
to LF** on read. Our shells are already LF-only, so this is a no-op for us, but it is worth knowing.

### Is there a write path?

**Yes — two.**

| path | form |
|---|---|
| `UpdateSubscriptionSettings(ctx, raw)` | repository method |
| `UpdateAdminSubscriptionSettings(ctx, adminID, raw)` | repository method |
| `PUT /api/settings/subscriptions` | **HTTP API**, `requireSudo` |
| `PUT /api/settings/subscriptions/admins/*` | **HTTP API**, `requireSudo` |

**So a direct database write is not required.** Rebecca exposes a sudo-gated HTTP API for exactly
this operation. That is a far safer integration point than touching the DB.

The CLI (`rebecca_cli subscription`) offers only `get-link` / `get-config` — **read paths**. It has
no template-setting command, so the CLI is not an activation route.

### Required operations

| operation | needed |
|---|---|
| copy the template file to a directory | **yes** |
| `subscription_settings.custom_templates_directory` = that directory | **yes** |
| `subscription_settings.subscription_page_template` = relative name | **yes** |
| per-admin override | optional |
| direct DB write | **not required** — the HTTP API covers it |

### Risks

- `safeJoin` and `normalizeTemplateName` **reject absolute paths and traversal**
  (`"template path escapes the templates directory"`). The installer must place the file *inside* the
  directory and reference it by **relative** name, or Rebecca will refuse it.
- An empty `custom_templates_directory` yields `ErrTemplateNotFound`, which **silently falls back**
  to the app template — so a misconfiguration looks like "my template did nothing" rather than an
  error.
- The settings row is selected `ORDER BY id DESC LIMIT 1`; if the table ever holds more than one row,
  the newest wins.

---

## PART 5 — Common installer model

### Can one abstraction cover all three?

**A Panel Adapter interface: yes. A single "copy file and set a path" implementation: no.**

The three panels differ in *mechanism*, not merely in paths:

| | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| content location | file | file | file |
| selection stored in | **DB** (`settings.subThemeDir`) | **env/config** | **DB** (`subscription_settings`) |
| write mechanism | sqlite3, stop→write→start | edit env file | HTTP API (sudo) *or* DB |
| per-admin? | no | **yes** (`admin.sub_template`) | **yes** (JSON on `admins`) |
| restart needed | **yes** (explicitly) | **yes** | likely |
| verification | HTTP smoke, `id="sub-data"` | render check | render check |
| engine | Go html/template (**autoescapes**) | Jinja2 (**does not**) | pongo2 |

### Recommended shape (conceptual only)

One interface, three implementations:

```
detect()            -> is this panel installed? binary, unit, DB/config location
installTemplate()   -> place the file; set the selection by that panel's mechanism
verify()            -> confirm the panel actually serves it
rollback()          -> undo the selection change AND the file
```

with a per-panel capability declaration so the installer can say honestly what it can and cannot do
automatically — exactly as `rt_subtheme_configure` already does with `auto` / `manual`.

**Do not** model this as "copy a file and write a path". That model fits 3X-UI and half of Rebecca,
and actively misleads for PasarGuard, whose selection is an environment variable.

---

## PART 6 — Security audit

### S1 — **The existing backup does not cover the panel's state. This is the biggest gap.**

`rt_backup_create` captures `template.html`, its sidecar, `config.env` and `VERSION`. It does **not**
capture `subThemeDir`, `custom_templates_directory`, `subscription_page_template`, or any per-admin
override. So today's rollback would restore Row-Template's files while **leaving the panel pointing
at them** — or, worse, leaving a selection change in place after the files were reverted.

**Any activation work must extend the backup to cover the panel-side selection, or rollback is not
rollback.**

### S2 — Wrong database modification

3X-UI's `settings.key` has a non-unique index, so a naive `INSERT` can create a **duplicate** row and
the panel may read either. The existing code handles this deliberately; any new panel code must do
the same.

### S3 — Wrong admin assignment

PasarGuard and Rebecca are both **per-admin capable**. Writing an override for a non-existent admin
id fails (`ErrAdminNotFound`) or silently does nothing, and writing for the *wrong* admin changes
what a different set of subscribers sees. Admin-scoped writes must be opt-in and explicit.

### S4 — Overwriting a custom template

An operator may already have a `custom_templates_directory` with their own `subscription/index.html`.
Writing our shell there **destroys their work**. The installer must detect an existing custom
template and refuse or require confirmation — never overwrite silently.

### S5 — Rollback failure

Today the installer is honest when automatic restore fails. A panel-side change makes that harder:
if the panel is stopped for a DB write and the process dies, the panel may be left **stopped**. The
existing stop→write→start→verify ordering and its `was_active` handling are the right pattern and
must be reused.

### S6 — Permission issues

Rebecca's API is **`requireSudo`**. 3X-UI's DB write needs filesystem access to the DB *and*
`sqlite3` present. PasarGuard's env edit needs write access to the panel's config directory. All
three are root operations, and all three can fail for reasons the installer cannot fix — which is
why a `manual` outcome must remain a first-class result, not an error.

### S7 — Upgrade conflicts

PasarGuard and Rebecca both ship migrations that touch these very columns
(`e8c6a4f1d2b7_add_client_templates_table`, `000014_subscription_settings`). A panel upgrade can
change defaults or add keys. The installer must **re-read** the current value rather than assume a
default, and must not treat a changed value as corruption.

### S8 — Existing Row-Template installation

`rt_existing_install_menu` already handles a re-install. Activation must participate in that path:
a re-install must not create a *second* selection, and uninstall must **clear** the panel-side
selection, or an uninstalled panel is left pointing at a deleted directory — which for Rebecca
degrades silently to the built-in template, and for 3X-UI serves nothing.

---

## PART 7 — Version / release impact

**Report only. Nothing changed.**

| change | would require |
|---|---|
| any installer code change | `VERSION` bump — the library ships in the tarball and is checksum-verified |
| new panel support | `CHANGELOG.md` entry + release notes |
| a new release | new tarball; the payload already carries the 45 shells (C8) |
| extending the backup format | **migration notes** — an older library must not mis-read a newer backup dir |
| a panel-side selection write | migration notes: what happens on uninstall, and what the rollback now covers |
| `RT_MIN_XUI`-style minimums for the new panels | release notes — each panel needs its own floor |
| any change to `make-release.sh` payload | release notes; the tarball is already 4.7 MB |

`VERSION` is **1.1.0** and was not touched. `CHANGELOG.md` was not touched.

---

## Recommended direction

1. **Correct the record first.** Phase 7A's "Rebecca stores content in the DB" is wrong. Rebecca
   stores a path and a name; content is on disk; and there is a sudo-gated HTTP API. This materially
   lowers the risk of Rebecca activation and should be reflected before any design work builds on it.
2. **Extend the backup to cover the panel-side selection** (§6 S1) **before** any activation ships.
   Without it, rollback is a half-rollback.
3. **Adopt a Panel Adapter interface** with a per-panel capability declaration, and keep `manual` as
   an honest outcome.
4. **Prefer the panel's own supported interface** over direct DB writes — for Rebecca the HTTP API,
   for PasarGuard the documented env settings. Only 3X-UI genuinely requires a DB write.
5. **Do not start implementation from this document.** It establishes capability and risk, not
   design. A design phase should follow, as every other workstream in this project has.

---

## Verification

| check | result |
|---|---|
| `git status --short` | **only `?? INSTALLER-ACTIVATION-AUDIT.md`** |
| `installer/` | **0 changes** |
| `release/` | **0 changes** |
| `VERSION` | **unchanged** — 1.1.0 |
| `CHANGELOG.md` | **unchanged** |
| `git diff --check` | **clean** |
| committed | **no** |

---

PHASE 8A COMPLETE — INSTALLER AUDIT ONLY — NO IMPLEMENTATION
