# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-09-25

Row-Template now installs on **PasarGuard** and **Rebecca** as well as 3X-UI,
and ships two more designs. A minor release: nothing changes for an existing
3X-UI install except what is listed below, and Row stays the default design.
It also carries every fix prepared for 1.2.1, which was not released on its
own.

### Added

- **PasarGuard support.** PasarGuard is supported from this release: detect,
  install, activate, verify, back up, restore and uninstall, on the official
  Docker install and on a source install (`pasarguard.service`). The page is
  placed at `/var/lib/pasarguard/templates/row-template/index.html` (or inside
  your own `CUSTOM_TEMPLATES_DIRECTORY`) and selected by one marked block
  appended to `/opt/pasarguard/.env`; a running panel is restarted once. None
  of your own `.env` lines is edited, and uninstall returns the file to its
  exact previous bytes. `row-template verify` also reports the two panel
  settings that still take precedence over the page: an admin's own
  `sub_template`, and `disable_sub_template`.
- **Rebecca support.** Rebecca is supported from this release, with the same
  seven operations. The page is placed at
  `/var/lib/rebecca/templates/row-template/index.html` (or inside your own
  custom templates directory) and selected in the newest
  `subscription_settings` row, which Rebecca reads on every request — so
  nothing is ever restarted. Activation is automatic with the default SQLite
  database and `sqlite3`; with MySQL/MariaDB the page is still placed and the
  installer prints the two values to enter in the dashboard. `NULL`, empty and
  a set templates directory are each restored exactly.
- **Panel detection and choice.** The installer finds the panel on the server
  and installs for it (`/etc/3x-ui/sub_templates/row-template` for 3X-UI,
  `/etc/row-template` for PasarGuard and Rebecca). A panel counts only when two
  independent signals agree; a half-installed panel is refused, not guessed at.
  On a server with more than one panel it asks, or reads
  `RT_PANEL=3xui|pasarguard|rebecca` in a script.
- **Transactional activation on PasarGuard and Rebecca.** The panel's state is
  snapshotted, changed and verified; if any step fails it is restored exactly,
  and the installer says so — and shows the real cause.
- **Two new designs: Meter and Notebook.** Meter is a calm instrument
  dashboard of rounded cards with a segmented traffic meter; Notebook is a
  page from a dotted notebook, hand-inked. Both were contributed by the
  project's author, ported onto the shared runtime, and held to the same
  contract as the other fifteen — seventeen designs in all, on every panel.
- **Every design, for every panel.** Each release now carries a PasarGuard
  (Jinja2) and a Rebecca (pongo2) page for every design, under `shells/`,
  checksum-verified like the 3X-UI pages.

### Fixed

- **Rolling back to a backup taken under 1.1.0 works.** 1.2.x refused it with
  "backup artifact matches no installed template". A backup that names its
  design is restored as that design; one whose page is none of this release's
  designs (1.1.0's) is restored as this release's Row, so `verify`, design
  switching and updates keep working afterwards.
- **A successful rollback is reported as a success.** The transaction engine
  checked, after restoring the panel, that the panel was still pointing at
  Row-Template's directory — which is exactly the state a correct rollback has
  just undone. Every rollback therefore ended in "the rollback failed" even
  when the panel had been restored perfectly. The engine no longer asks that
  question: the restore verifies itself. Each panel adapter now re-reads the
  panel's own setting after restoring and confirms it matches the value it
  recorded before changing anything, and a restore that does not land is
  reported as a failed rollback with the real cause. A regression test pins
  this: the engine must never re-run the forward check after a restore.
- **The manual PasarGuard instructions are complete.** When activation cannot
  be done automatically, the installer printed only `SUBSCRIPTION_PAGE_TEMPLATE`
  and told you to edit `.env` — but the page had not been copied anywhere the
  panel could read. It now prints both the copy and the two `.env` values
  (`CUSTOM_TEMPLATES_DIRECTORY` and `SUBSCRIPTION_PAGE_TEMPLATE`), and says to
  keep your own templates directory if you already have one.
- **A rollback right after a change undoes that change.** Backup names have
  one-second resolution, and two backups made in the same second — a design
  switch followed at once by `row-template rollback --auto`, which snapshots
  the current state first — shared one directory. The newer snapshot
  overwrote the older one, so the rollback re-applied the state it was meant
  to undo. A backup now waits for the next second rather than reuse a name.
- **The live check after `config`, `update` and `rollback` runs on 3X-UI.**
  It always said "skipped (no test URL available without sqlite3)", even with
  `sqlite3` installed, because those commands had not located the panel
  database. And the check made right after activation no longer warns "could
  not reach the subscription endpoint" while 3X-UI is still restarting.
- All fixes prepared for 1.2.1 (below): one `row-template update` is enough to
  move from 1.1.0, misplaced designs are moved back, branding works on an
  install the 1.1.0 updater left incomplete, and `verify` names missing and
  damaged designs.

### Security

- **Every value is escaped on every panel.** PasarGuard renders pages with a
  non-sandboxed Jinja2 whose autoescaping is off. Every PasarGuard and Rebecca
  page therefore wraps its body in an explicit autoescape block, and is tested
  with the panels' real engines against hostile usernames, notes, links and
  malformed data.
- **Branding can never open a template tag.** `{` and `}` in your service name,
  support link or logo are written as `{` and `}`, so no branding
  value can start a Jinja2 or pongo2 expression.
- **Panel secrets stay where they are.** PasarGuard's `.env` and Rebecca's
  database URL are read only for the keys the installer needs, never printed,
  and never copied into a backup. A MySQL/MariaDB password is never asked for
  or read.
- **Backups record their panel** and are never restored onto another one.

### Changed

- `row-template version` shows the panel it serves; on 3X-UI it still shows the
  minimum-supported and detected versions.
- `row-template uninstall` returns each panel to the page it had before
  Row-Template, and leaves a page you chose afterwards alone.
- The `on_hold` state on PasarGuard and Rebecca is shown as active: with its
  "starts on first connection" duration on PasarGuard, and with an unknown
  expiry on Rebecca, which does not give the page that duration
  (`docs/design/PANEL-ON-HOLD-DECISION.md`).

### Known limitations

- On PasarGuard and Rebecca the page shows the values as of when it was opened;
  live refresh (`?format=info`) is 3X-UI only, because both panels serve live
  status on a path suffix.
- PasarGuard's page title (`subTitle`) and Clash templates are not produced.
- Rebecca on MySQL/MariaDB needs its one setting entered in the dashboard.

### Documentation

- The compatibility page, installation, configuration and troubleshooting
  cover all three panels, in English, Persian and Arabic; the READMEs in all
  five languages describe PasarGuard and Rebecca as supported.
- `docs/design/PASARGUARD-INSTALLER-AUDIT.md` and
  `docs/design/REBECCA-INSTALLER-AUDIT.md` record, from each panel's source,
  what activation is and how the installer follows it.

### Development

- The test suite renders the PasarGuard and Rebecca pages with the real
  engines, and needs Python 3 with Jinja2 as well as Go; a missing engine is a
  failure, never a skip.
- `tools/make-release.sh` writes checksums in the text form on every platform.

### Upgrading

- From **1.2.0** or **1.1.0** on 3X-UI: run `row-template update`. From 1.1.0,
  the next `row-template`, `row-template config` or `row-template verify`
  completes the install. Your design, branding and panel wiring are kept.
- On **PasarGuard** or **Rebecca**: run the installer. Earlier releases did not
  install on these panels.

## [1.2.1] - Unreleased (shipped in 1.3.0)

Fixes the update from 1.1.0, which could leave the manager with no designs to
choose from. 3X-UI (>= 3.6.0) stays the only supported panel.

### Fixed

- **One `row-template update` is enough to move from 1.1.0.** 1.1.0's own
  updater installs the new version but copies only four files, so in 1.2.0 the
  designs were missing until a second update, and **Reconfigure branding →
  Template** said "No templates are installed". Now the first time you open
  `row-template`, or run `row-template config` or `row-template verify` as
  root, after the update, it downloads the rest of the same release — every
  design and the remaining installer files, checksum-verified — before doing
  anything else. It downloads the version you have installed, never a newer
  one, and changes nothing else: the live page, branding, selected design and
  backups stay as they are. If the release cannot be reached, it says so and
  tries again the next time the manager opens.
- **Designs found outside their folder are moved back.** The designs belong in
  `dist/templates/`. A copy at the install root's `templates/` — where a copied
  or extracted release leaves it — is now moved into place automatically by
  `install`, `update` and `verify`. Each design is checked against its own
  checksum first; one that fails is reported and left where it is, and files
  Row-Template does not recognise are never removed.
- **Changing branding works on an install the 1.1.0 updater left incomplete.**
  `row-template config` and the manager's branding editors refused with "the
  template selection could not be reconciled" until a second update; they now
  complete the install first.
- **`row-template verify` names missing and damaged designs.** A design that
  fails its checksum is reported by name as a failure; missing designs are a
  warning that names them. It previously reported a failing store without
  saying which design, and did not report missing ones at all.

### Changed

- `row-template verify` is no longer strictly read-only. Run as root, it first
  repairs the template store — moving misplaced designs back into place and
  downloading any the installed version is missing, from that same release —
  and then checks it. It makes no other change, and none at all when run
  without root.

### Documentation

- The compatibility page lists, per panel, what the installer can do today:
  detection, install, activation, verification, and backup and rollback. For
  PasarGuard and Rebecca the answer is none of them — only the page shells are
  built and packaged — so both stay **research targets, not supported panels**.
  A test checks every README and compatibility page against the installer.

### Known issues

- Rolling back from 1.2.x to a backup taken under 1.1.0 fails with "backup
  artifact matches no installed template": 1.1.0's page is not one of the
  current release's designs. The rollback stops before changing anything, so
  the running page stays as it was. Rolling back to a backup taken under 1.2.x
  is not affected.

### Upgrading

- From **1.1.0**: run `row-template update`. The next `row-template`,
  `row-template config` or `row-template verify` completes the install.
- From **1.2.0**: run `row-template update`. This also completes a 1.2.0
  install that the 1.1.0 updater left without its designs.

## [1.2.0] - 2026-09-24

Turns Row-Template from one page into a collection of designs. A minor release:
Row stays the default design, and 3X-UI (>= 3.6.0) stays the only supported
panel.

### Added

- **Fifteen designs.** Row plus Editorial, Canvas, Prism, Terminal, Pulse,
  Brutal, Arcade, Sketch, Signature, Saffron, Pulse Nova, Prism Nova, Terminal
  Nova, and Arcade Nova. Every design is built from the same runtime and
  translations, so status, Connect, QR codes, the Configuration Explorer, and
  the five languages behave the same in each.
- **Choosing a design.** A fresh interactive install shows a design chooser
  (Enter keeps Row). `RT_TEMPLATE=<id>` picks one for a scripted install, and
  the manager's **Reconfigure branding → Template** changes it later. Updates
  keep the selected design.
- **Checksummed designs.** Each design ships in the release with its own
  SHA-256 checksum. `row-template verify` checks every installed design against
  its checksum and confirms the live page is the selected design.
- **Painted country flags.** The flags of Germany, France, the Netherlands,
  Japan, Sweden, and the United States are drawn with CSS, so they appear on
  Windows in Chromium-based browsers, which otherwise show the two letters
  (`DE`) instead of a flag. Other countries keep the platform's flag emoji.
- **Documentation site** in English, Persian, and Arabic: installation,
  configuration, a template gallery with real previews, branding, security,
  compatibility, a developer reference, and troubleshooting.
- **Panel shells for research.** The release carries each design's page shell
  for every panel in the registry under `shells/`: 3X-UI, PasarGuard (Jinja2)
  and Rebecca (pongo2). The installer does not place these files. PasarGuard
  and Rebecca are research targets, not supported panels, and there are no
  installation instructions for them.

### Changed

- **Panel database detection fails closed.** Row-Template previously used the
  first `x-ui.db` it found. It now uses the first database file that exists —
  the one `XUI_DB_FOLDER` names, then the default locations in order — and
  only if it is a real SQLite database. If that file is not, it is refused with
  a warning instead of silently moving on to another, possibly stale, database;
  activation then falls back to the manual instructions.
- **Live refresh accepts only its own data.** The status refresh now checks
  that a response carries the page's own fields before using it. An
  unexpected response stops the refresh and leaves the server-rendered figures
  in place, instead of repainting the page with wrong values.
- The country-code table is stored as a bitmap, saving about 800 bytes in
  every page.

### Internal

- Groundwork for installing on more than one panel: a normalized data
  contract, build-time adapters for 3X-UI, PasarGuard and Rebecca, a frozen
  panel interface, a transaction engine, a 3X-UI panel adapter, and a
  format-2 backup snapshot. No `row-template` command calls any of it yet;
  backups and rollback still use the 1.1.0 format.
- The release ships the management library's companion files
  (`lib/transaction.sh` and `panels/`), and install and update put them next
  to the library. A payload whose library is present without them is refused
  before anything changes.

### Development

- `npm test` first renders every design's fixture pages (`npm run
  fixtures:all`), so a fresh clone can run the suite; it needs Go 1.22 or
  newer.
- `npm run lint:sh` runs ShellCheck over every shell script.
- The test harness runs on Linux and on Windows with Git Bash.
- `tools/make-release.sh` is executable, as its usage line documents.
- Design records moved from the repository root to
  [`docs/design/`](docs/design/README.md), with an index.

### Compatibility

- Requires 3X-UI (MHSanaei) **>= 3.6.0**.
- **Updating from 1.1.0 takes two runs of `row-template update`.** The first
  is carried out by 1.1.0's own updater: it installs the new version — the
  page updates and your branding is kept — but copies only the library and
  the command, so only Row is available. The second, carried out by 1.2.0,
  installs every design and the remaining installer files. `row-template
  verify` reports whether the second run is still needed. (Fixed in 1.2.1,
  which needs one run.)

## [1.1.0] - 2026-08-30

Evolves the subscriber page into a connection and configuration hub. A minor,
backward-compatible release: the v1.0.0 experience (status, Copy subscription,
QR, and per-app Connect actions) is unchanged and extended.

### Added

- **Configuration Explorer.** A new "Configurations" section that lists each
  usable server on its own row — a country flag or monogram badge, the
  configuration name, and a protocol label — with per-configuration **View**
  (local QR code and copy) and **Copy** actions. When the list is long it gains
  a search box; exact-duplicate links are collapsed and malformed links are
  isolated rather than shown.
- **Protocol awareness** for VLESS, VMess, Trojan, Shadowsocks,
  Hysteria/Hysteria2, WireGuard, AmneziaWG, and Telegram MTProto, presented as
  proper-noun labels.
- **Restrained country badges** derived only from a valid ISO country code in a
  configuration's own label; a monogram is shown when there is no valid flag —
  the badge is never empty, and the country is never inferred from a host or IP.

### Improved

- Individual configurations are secret-aware: links stay masked until you open
  **View**, are never written to the console, and QR codes render locally with
  no external QR, geolocation, or telemetry requests.
- Configuration names and labels are always inserted as text, never as markup,
  keeping the page safe against hostile link fragments; links are isolated for
  correct left-to-right display within right-to-left interfaces.
- Broader automated coverage: client-side URI parsing and classification, flag
  mapping, and explorer rendering, filtering, and XSS safety, plus expanded Go
  rendering fixtures (30 cases, including real WireGuard, AmneziaWG, MTProto,
  and Hysteria links, flags, bidirectional text, and large lists).
- The build size gate now warns at 185 KiB and fails only at 200 KiB
  (previously a hard failure at 185 KiB), matching the artifact's real budget
  while keeping a firm upper bound.

### Security

- The served page still makes no third-party requests. The Configuration
  Explorer adds no network calls, no external QR or geolocation lookups, and no
  telemetry, and it never logs subscriber links or identifiers.

### Compatibility

- Requires 3X-UI (MHSanaei) **>= 3.6.0**; validated against stock 3.7.0.
- Updating from v1.0.0 preserves your branding and configuration and keeps a
  restorable backup for rollback.

## [1.0.0] - 2026-08-30

First stable release.

### Added

- Self-contained custom subscription page for 3X-UI panels — a single HTML
  artifact with all CSS, JavaScript, fonts, and the QR generator inlined. No
  third-party CDNs and no external network requests from the served page.
- White-label branding: configurable service name, support link, and logo, all
  stored as data and injected safely (never executed).
- Five interface languages: English, فارسی, العربية, Русский, and 简体中文,
  with right-to-left support.
- One-command installer with a mandatory SHA-256 integrity check on every
  download (no skip path), safe archive extraction, and atomic activation.
- `row-template` manager with an interactive menu and direct commands:
  `config`, `update`, `rollback`, `verify`, `version`, `uninstall`, and `help`.
- Update checking against the public stable release channel, with graceful
  handling when the network or release source is unavailable.
- Backup and rollback: the previously installed version is snapshotted before an
  update and can be restored without losing branding configuration.

### Compatibility

- Requires 3X-UI (MHSanaei) **>= 3.6.0**; validated against stock 3.7.0.
- Recommended operating system: Ubuntu 24.04 LTS (x86_64).

[1.3.0]: https://github.com/frank0live/Row-Template/releases/tag/v1.3.0
[1.2.1]: https://github.com/frank0live/Row-Template/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/frank0live/Row-Template/releases/tag/v1.2.0
[1.1.0]: https://github.com/frank0live/Row-Template/releases/tag/v1.1.0
[1.0.0]: https://github.com/frank0live/Row-Template/releases/tag/v1.0.0
