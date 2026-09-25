# Installer Panel Adapter — PasarGuard

**Status:** implemented in 1.3.0 (`installer/panels/pasarguard.sh`).
**Companion documents:** [PASARGUARD-ADAPTER-AUDIT.md](PASARGUARD-ADAPTER-AUDIT.md)
(what the page renders from), [INSTALLER-PANEL-INTERFACE.md](INSTALLER-PANEL-INTERFACE.md)
(the seven verbs), [INSTALLER-TRANSACTION-DESIGN.md](INSTALLER-TRANSACTION-DESIGN.md)
(capture → snapshot → mutate → verify → rollback), [PANEL-ON-HOLD-DECISION.md](PANEL-ON-HOLD-DECISION.md).

This document records what PasarGuard actually does, file by file, and how the
installer adapter follows it. Every claim below was read from the PasarGuard
source (`pasarguard/panel`, main branch) and the official installer
(`PasarGuard/scripts`, `pasarguard.sh`), not inferred from Marzban, from which
PasarGuard descends. PasarGuard is AGPL-3.0: nothing from it is copied into this
repository — the test hosts are independent implementations of the few facts
below.

---

## 1. What selects the subscription page

| fact | source |
|---|---|
| The page is rendered with **Jinja2**, `Environment(loader=FileSystemLoader(template_directories))` — non-sandboxed, **autoescape off**. | `app/templates/__init__.py` |
| The loader's search path is `[CUSTOM_TEMPLATES_DIRECTORY, "app/templates"]` — the custom directory first, only when set. | `app/templates/__init__.py` |
| `CUSTOM_TEMPLATES_DIRECTORY` (default none) and `SUBSCRIPTION_PAGE_TEMPLATE` (default `subscription/index.html`) are pydantic settings, read from the environment and `.env` **once, at start-up**. | `config.py`, `TemplateSettings`; `EnvSettings.model_config = SettingsConfigDict(env_file=".env")` |
| A browser request (`Accept` contains `text/html`) is answered with the page, **unless** the database setting `subscription.disable_sub_template` is on. | `app/operation/subscription.py`, `is_subscription_page_request` |
| The page name is the requesting user's **admin's** `sub_template` when that admin has one, else `SUBSCRIPTION_PAGE_TEMPLATE`. | `app/operation/subscription.py`; `admins.sub_template`, `app/db/models.py` |

**Consequences for the installer.**

1. Activation is an environment change, so it needs a restart of the panel — once.
   After that, Jinja2's loader re-reads a changed file (its auto-reload checks the
   mtime), so a new design or new branding only replaces the file.
2. `.env` is the only switch. The installer changes nothing in the database.
3. Two database settings can outrank the selection. They are the operator's
   choices, so they are **reported, never changed** (§8).

## 2. How the official installer lays PasarGuard out

| fact | source |
|---|---|
| Application directory `/opt/pasarguard`, data directory `/var/lib/pasarguard`, CLI `/usr/local/bin/pasarguard`. | `PasarGuard/scripts` `pasarguard.sh` (`APP_DIR`, `DATA_DIR`) |
| Docker Compose, `image: pasarguard/panel:latest`, `env_file: .env`, `network_mode: host`, bind mount `/var/lib/pasarguard:/var/lib/pasarguard`. | `docker-compose.yml` in the panel repository and the installer's generated compose file |
| SQLite is written as an **absolute** URL, `sqlite+aiosqlite:////var/lib/pasarguard/db.sqlite3`; PostgreSQL, TimescaleDB, MySQL and MariaDB are written as server URLs **with the password inline**. | `pasarguard.sh`, `sqlite_absolute_database_url`, the `SQLALCHEMY_DATABASE_URL=` writes |
| The shipped `.env.example` carries both page keys commented out, pointing at `/var/lib/pasarguard/templates/`. | `.env.example` |
| A source install runs as `pasarguard.service`, with `.env` in its `WorkingDirectory`. | `install_service.sh` |

Because the data directory is bind-mounted **at the same path**, a file under
`/var/lib/pasarguard` has one path that is valid on the host and in the container.
That is the only place the adapter will put a page for a Docker install.

## 3. Detection

`rt_panel_pasarguard_detect` is read-only and needs **two independent signals of
four**:

| | signal |
|---|---|
| A | `/opt/pasarguard/.env`, a regular file |
| B | a compose file whose `image:` is `pasarguard/panel` (optionally `docker.io/`), or a registered `pasarguard.service` unit |
| C | an executable `/usr/local/bin/pasarguard` that names PasarGuard |
| D | the data directory `/var/lib/pasarguard` |

Two or more → `OK`. Exactly one → `FAIL` ("looks partly installed"; the installer
refuses rather than guesses). None → `NOT_APPLICABLE`. A leftover `.env` alone, a
stray directory alone, or a compose file running some other image is never taken for
a panel. The unit check does not use `grep -q` on a pipe (the pipefail + SIGPIPE
trap documented in `rt_detect_xui`).

## 4. Capability set

```
env_activation file_placement live_verify selection_read selection_write service_control static_verify
```

Every token is backed by code in the adapter: the selection is read from and
written to `.env`; the page is placed as a file; the service is restarted (only if it
was running); verify has a static and — in Docker — a live mode.

## 5. The change it makes

**Place.** The generated page goes to `<templates>/row-template/index.html`, where
`<templates>` is the operator's own `CUSTOM_TEMPLATES_DIRECTORY` when there is one,
else `/var/lib/pasarguard/templates`. For Docker, an operator directory outside the
bind-mounted data directory is **refused before anything changes** — the container
could not see a page placed there. The write is atomic (temp file + `mv`), mode 644,
into a directory named for Row-Template. A symlinked directory, and a file at that
path that is not Row-Template's (marker check), are refused.

**Select.** A managed block is appended to `.env`:

```
# >>> row-template (managed by Row-Template; do not edit) nl=0 >>>
CUSTOM_TEMPLATES_DIRECTORY = "/var/lib/pasarguard/templates"
SUBSCRIPTION_PAGE_TEMPLATE = "row-template/index.html"
# <<< row-template <<<
```

python-dotenv and Docker Compose both take the **last** assignment of a key, so the
block wins without a single operator line being edited. `CUSTOM_TEMPLATES_DIRECTORY`
is written only when the operator has none. `nl=1` records that a newline was added to
a file that ended without one. The rewrite is atomic and keeps the file's mode.

**Apply.** If — and only if — the panel was running: `docker compose -f
/opt/pasarguard/docker-compose.yml -p pasarguard up -d` (Compose recreates the
container because its environment changed), or `systemctl restart pasarguard` for a
source install. A stopped panel is not started; its next start reads the block.

**Idempotent.** On a panel that already selects the page, only the file is replaced
and nothing restarts.

## 6. Backup — and what never enters it

The P2 snapshot records, through `rt_backup_panel_write`:

| field | value |
|---|---|
| `selection.state` | `absent`, `empty` or `present` — the effective `SUBSCRIPTION_PAGE_TEMPLATE` |
| `selection` | its value, when present |
| `meta` | `mechanism=env`, `was_running=0|1` |
| `files` | `row-template/index.html`, only when this change creates it |
| `aux` | `block=absent|present`, `dir=<the block's directory>`, `root=<templates>`, `root_created=1` when the adapter will create the templates directory |

**Secrets.** `.env` holds `SUDO_PASSWORD`, `JWT_SECRET`, the database URL and more.
It is read only through `rt_dotenv_get` — as data, never sourced or evaluated — and
only for the keys above. It is never printed, never copied outside its own directory
(the atomic rewrite stages a sibling with the same mode), and no part of it except
the two page keys is ever written to a snapshot. `tests/installer-panel-pasarguard.test.mjs`
("secrets in .env never reach output, logs or snapshots") walks every snapshot file
for planted secrets.

## 7. Restore and uninstall

**Restore** (transaction rollback, or `row-template rollback`) validates the record,
then puts `.env` back: when the record says the block was absent, the block is
removed — and because it was *appended*, removing it returns the file to its exact
previous bytes (including a missing final newline, from `nl=`). A line the operator
added after the block is kept. A page this change created is removed, then its
directory and — only if `root_created=1` — the templates root, each only when empty.
The panel's running/stopped state is restored. A record naming any file other than
`row-template/index.html` is refused.

**Uninstall** removes the block and the page the same way, leaves every other line of
`.env` and every other template file alone, and restarts a running panel once so it
serves its own page again. A backup made on another panel (`panel=` in the backup
metadata) is never restored onto PasarGuard.

## 8. Verification

**Static** (mandatory, `0` or `1`): the artifact is a PasarGuard page from this
release (context marker and `{%- autoescape true -%}`), matches its checksum; the
generated page is valid; the placed copy is Row-Template's and byte-identical to it;
`.env` selects `row-template/index.html` from the right directory.

It then reads — **read-only** (`sqlite3 -readonly`), and only for a SQLite database —
the two settings of §1 that outrank the selection, and **warns** (never fails):

- `N admin(s) set their own subscription page (sub_template); their users keep that page.`
- `the panel's 'disable subscription template' setting is on, so browsers get the raw subscription instead of any page.`

A server database is not read at all; its URL is never printed.

**Live** (Docker only; `UNAVAILABLE` otherwise): the running container's environment
has `SUBSCRIPTION_PAGE_TEMPLATE=row-template/index.html` and the container can see the
page at the same path. A panel that was not restarted fails this with "restart it".

## 9. Rendering safety

The page is rendered by a **non-sandboxed Jinja2 with autoescape off**. The shell
therefore wraps every interpolation in an explicit `{%- autoescape true -%}` block,
and operator branding is written into the page with `{` and `}` escaped
(`rt_json_escape` → `{`/`}`), so no branding value can open a Jinja2
expression. Both are enforced by the shell tests against the real Jinja2 engine
(`tests/panels-pasarguard-shell.test.mjs`) with hostile usernames, notes and branding.

## 10. What the adapter does not do

- It does not edit the database, the compose file, or any operator line of `.env`.
- It does not support subscription "clash" or other non-page templates.
- It does not change per-admin `sub_template` or `disable_sub_template` (§8 reports them).
- It does not start a stopped panel.

## 11. Tests

`tests/installer-panel-pasarguard.test.mjs` drives the adapter through the real
transaction engine on a synthetic host (compose file, `.env`, data directory, a
Docker double that records restarts and the container's environment): detection,
capabilities, dotenv semantics, activation + byte-exact uninstall, operator
directory, refused directory, foreign page, rollback after a late failure, stopped
panel, idempotency, final newline, operator lines after the block, damaged block,
malformed restore record, verify on tamper, database overrides, secrets, artifact
dialect, cross-panel backup, and the full install → rebrand → switch → rollback →
uninstall lifecycle through `row-template` itself.
