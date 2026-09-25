# Installer Panel Adapter — Rebecca

**Status:** implemented in 1.3.0 (`installer/panels/rebecca.sh`).
**Companion documents:** [REBECCA-ADAPTER-AUDIT.md](REBECCA-ADAPTER-AUDIT.md) and
[REBECCA-ADAPTER-DECISIONS.md](REBECCA-ADAPTER-DECISIONS.md) (what the page renders
from), [INSTALLER-PANEL-INTERFACE.md](INSTALLER-PANEL-INTERFACE.md),
[INSTALLER-TRANSACTION-DESIGN.md](INSTALLER-TRANSACTION-DESIGN.md),
[PANEL-ON-HOLD-DECISION.md](PANEL-ON-HOLD-DECISION.md).

Every claim below was read from the Rebecca Go source (`rebeccapanel/Rebecca`, master)
and its official installer scripts (`scripts/rebecca/rebecca.sh`,
`scripts/rebecca/rebecca-binary.sh`). Rebecca is AGPL-3.0: nothing from it is copied
into this repository; the test hosts are independent implementations.

---

## 1. What selects the subscription page

| fact | source |
|---|---|
| The page is rendered with **pongo2 v6** (`pongo2.FromString`) after `normalizeLegacySubscriptionTemplate` rewrites legacy Jinja-isms. | `internal/app/user/subscription.go`, `renderSubscriptionPageTemplate` |
| The page is looked up **on every request** by `ReadTemplateContent(ctx, "subscription_page_template", adminID)` — nothing is cached. | `internal/app/user/subscription.go`; `internal/app/settings/repository.go`, `ReadTemplateContent` |
| The selection is the **newest** row of `subscription_settings` (`ORDER BY id DESC LIMIT 1`): `subscription_page_template` (default `subscription/index.html`) and `custom_templates_directory` (default `NULL`). | `internal/app/settings/repository.go`; `internal/app/migrations/000014_subscription_settings.go` |
| A custom page is `<custom_templates_directory>/<subscription_page_template>`, joined with `safeJoin` (no escape from the directory); when the directory is empty or the file is absent, the bundled templates are used. | `internal/app/settings/normalize.go`, `resolveCustomTemplatePath`, `resolveAppTemplatePath` |
| An admin may override both columns for their own users (`admins.subscription_settings`, JSON); the admin's page is tried first. | `repository.go`, `ReadTemplateContent` / `templateSelection`; `internal/app/settings/types.go` |
| A browser request is detected by `Accept` containing `text/html` or `application/xhtml+xml`. | `internal/app/user/subscription.go` |

**Consequences for the installer.** Activation is a two-column update of one row. It
takes effect on the next request — **Rebecca is never restarted**. Per-admin
overrides are the operator's and are reported, never changed.

## 2. How the official installer lays Rebecca out

| fact | source |
|---|---|
| Application directory `/opt/rebecca`, data directory `/var/lib/rebecca`, compose file `/opt/rebecca/docker-compose.yml`. | `scripts/rebecca/rebecca.sh` (`INSTALL_DIR`, `APP_DIR`, `DATA_DIR`, `COMPOSE_FILE`) |
| Docker: `image: rebeccapanel/rebecca:latest`, `env_file: .env`, bind mount `/var/lib/rebecca:/var/lib/rebecca`. | `docker-compose.yml` |
| Binary mode runs as `rebecca.service`. | `scripts/rebecca/rebecca-binary.sh` |
| SQLite is `SQLALCHEMY_DATABASE_URL = "sqlite:////var/lib/rebecca/db.sqlite3"`; MySQL/MariaDB URLs carry the password inline. | `rebecca.sh`, `rebecca-binary.sh` |

## 3. Detection

Read-only, **two independent signals of four**: `/opt/rebecca/.env`; a compose file
running `rebeccapanel/rebecca` or a `rebecca.service` unit; an executable
`/usr/local/bin/rebecca` that names Rebecca; the data directory. Two or more → `OK`,
one → `FAIL` (partly installed; refused), none → `NOT_APPLICABLE`. On a host that also
runs PasarGuard or 3X-UI the installer asks which panel to serve (or honours
`RT_PANEL=`); it never picks one silently.

## 4. Capability set

```
db_activation file_placement selection_read selection_write static_verify
```

No `service_control` (Rebecca is never restarted — §1) and no `live_verify` (the
database *is* the live state; static verify reads it).

## 5. The change it makes

**Place.** `<dir>/row-template/index.html`, where `<dir>` is the operator's
`custom_templates_directory` when set, else `/var/lib/rebecca/templates`. Atomic write,
mode 644, symlinks refused, a foreign file at that path never overwritten. For Docker
the directory must be inside the bind-mounted data directory, or activation is refused
before anything changes.

**Select.** One `UPDATE` of the newest `subscription_settings` row:
`subscription_page_template = 'row-template/index.html'`, and
`custom_templates_directory = <dir>` **only when the operator had none**. No other
column, no other row. Values are quoted by doubling `'`; the `sqlite3` CLI is run with
`-cmd '.timeout 5000'` so a panel holding the database waits rather than fails.

**Database access.** Only SQLite, and only through the `sqlite3` command. The URL is
the one key read from `.env` (`SQLALCHEMY_DATABASE_URL`, then `DATABASE_URL`), never
printed. In Docker the path must be absolute and inside the data directory (a relative
path is inside the image, not on the host); in binary mode a relative path is resolved
against `/opt/rebecca`. The file must carry the SQLite header.

**MySQL/MariaDB, or no `sqlite3`:** the adapter answers `UNAVAILABLE` and the installer
prints the two values to enter in Rebecca's dashboard (Settings → Subscription → Templates) —
the page itself is still placed. The same "manual activation" 3X-UI has without
`sqlite3`. No database password is ever asked for, read or printed.

## 6. Backup

| field | value |
|---|---|
| `selection.state` / `selection` | `subscription_page_template` (`present`, or `empty`) |
| `meta` | `mechanism=db`, `was_running` (recorded; never acted on) |
| `files` | `row-template/index.html`, only when this change creates it |
| `aux` | `dir_state=null|empty|present`, `dir=<value>`, `root`, `root_created=1` when created |

`NULL`, `''` and a value are three different states of `custom_templates_directory`,
and a restore needs all three: the `aux` record keeps them apart. A value containing a
newline is refused at capture (it could not be restored exactly).

## 7. Restore and uninstall

**Restore** writes both columns back exactly (`NULL` stays `NULL`), removes a page this
change created, then its directory and — only with `root_created=1` — the root, each
only when empty. A record naming any other file is refused.

**Uninstall.** When the panel still selects Row-Template's page, the selection is put
back from the activation record (`panel-activation`) when there is one; without one it
returns to Rebecca's own default (`subscription/index.html`), clearing the directory
only when it is the one Row-Template itself sets. When the operator has since chosen
another page, the selection is theirs and is left alone; only our page is removed. A
backup made on another panel is never restored onto Rebecca.

## 8. Verification

**Static**: the artifact is a Rebecca page from this release (context marker, explicit
autoescape), matches its checksum; the generated page is valid; the placed copy is ours
and byte-identical; the newest row selects `row-template/index.html` from the right
directory. It **warns** (never fails) when admins override the page:
`N admin(s) override the subscription page for their own users; those users keep the admin's page.`

**Live**: `UNAVAILABLE` by design — the next request reads exactly what static verify
read.

## 9. Rendering safety

pongo2 autoescapes by default, and the shell also states `{%- autoescape on -%}`
explicitly around every interpolation. Branding enters the page with `{` and `}`
escaped, so it can never open a pongo2 tag. `online_at` is zoneless UTC in Rebecca and
is converted with integer days-from-civil arithmetic inside the template — no
locale-dependent parsing. The shell tests render against the real pongo2 v6.1.0
(`tools/engines/pongo2/`) with hostile usernames, notes, links and branding, and with
malformed data (missing fields, `null`s, zero and negative limits, huge values).
`on_hold` users are handled as documented in PANEL-ON-HOLD-DECISION.md.

## 10. Limitations

- MySQL/MariaDB: manual selection in the dashboard (the page is placed automatically).
- Per-admin overrides keep their own page (reported by verify).
- No live verification (none is possible beyond what static verify reads).

## 11. Tests

`tests/installer-panel-rebecca.test.mjs` runs the adapter through the real transaction
engine against a real SQLite database with Rebecca's own column definitions (via a
`sqlite3` test double that uses Python's `sqlite3`): detection; capabilities; only a
`sqlite:` database inside the shared data directory is used (a MySQL URL is never
touched); activation changes two columns of the newest row and nothing else, with no
restart; rollback and uninstall restore `NULL`, empty and a value exactly; an operator
directory is used and kept; a quote in panel data cannot break the SQL; uninstall
without an activation record; an operator who moved away keeps their choice; the
admin-override warning; a foreign page never overwritten; a restore record naming a
file the adapter never places refused; verify failing a tampered page and a moved
selection; secrets never in output or anywhere under the install root; a 3X-UI
artifact, a PasarGuard page and a pre-1.3.0 shell refused; a backup from another panel
refused; manual activation without `sqlite3`; and the full install → verify → rebrand
→ switch design → roll back → uninstall lifecycle through `row-template` itself.
