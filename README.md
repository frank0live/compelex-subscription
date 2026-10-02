<p align="center">
  <img src="https://img.shields.io/badge/panel-3X--UI%20(MHSanaei)-blue" alt="Panel: 3X-UI (MHSanaei)">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/frank0live/row-template"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux-lightgrey">
  <img alt="Languages" src="https://img.shields.io/badge/languages-EN%20%7C%20FA%20%7C%20AR%20%7C%20RU%20%7C%20ZH-lightgrey">
</p>

# Row-Template — 3X-UI Edition

A polished, self-contained subscription page for the [3X-UI](https://github.com/MHSanaei/3x-ui) panel (MHSanaei) — seventeen designs, each a single HTML file, fully white-label, with no third-party requests from the page your subscribers open.

Maintained by **frank0live**. Based on the original [frank0live/Row-Template](https://github.com/frank0live/Row-Template); this edition supports **3X-UI only**.

## What it is

3X-UI can serve a custom page to subscribers instead of its built-in one. Row-Template is that page: a subscriber opens their subscription link and sees their plan, their usage, their expiry date, and one-tap ways to add the subscription to the app they use.

It ships as one self-contained HTML file per design, with every style, script, font, and the QR code generator inlined. A single command detects your panel, installs the page next to it, points the panel at it, and gives you a `row-template` manager for branding, updates, and rollback.

## Why Row-Template?

- **Private by design.** The page your subscribers open makes no third-party requests. QR codes are generated on the page, and your branding is injected as text — never executed, never sent anywhere.
- **Genuinely white-label.** Your service name, your support link, your logo. Nothing on the served page identifies Row-Template.
- **Seventeen designs, one file each.** Pick the look that fits your service. Every design shares the same features, languages, and safety checks.
- **Made for your subscribers.** Live usage and expiry, one-tap import into popular apps, and a searchable list of individual configurations for adding a single server by hand.
- **Safe to operate.** Checksum-verified releases, transactional activation that restores the panel exactly if any step fails, and one-command rollback. On 3X-UI it changes exactly one setting (`subThemeDir`) and never patches your panel.

## Designs

Row-Template ships seventeen designs. **Row** is the default:

`row` · `editorial` · `canvas` · `prism` · `terminal` · `pulse` · `brutal` · `arcade` · `sketch` · `signature` · `saffron` · `pulsenova` · `prismnova` · `terminalnova` · `arcadenova` · `meter` · `notebook`

Choose a design during a fresh interactive install, set `RT_TEMPLATE` for a scripted one, or change it later from the manager (**Reconfigure branding → Template**). Updates keep your choice.

## Features

**For your subscribers**

- **Live status.** Plan state, traffic used and remaining, and expiry, refreshed from your panel while the page is visible.
- **One-tap import** into popular apps, grouped by platform: v2rayNG, Happ and sing-box on Android; Streisand, V2Box and Shadowrocket on iOS; Clash Verge Rev, Mihomo Party and v2rayN on Windows; Clash Verge Rev, Streisand and V2Box on macOS.
- **Copy and QR.** Copy the subscription link or scan it as a QR code generated on the page.
- **Configuration Explorer.** Every server on its own row, with a country flag or monogram and a protocol label (VLESS, VMess, Trojan, Shadowsocks, Hysteria/Hysteria2, WireGuard, AmneziaWG, Telegram MTProto), plus per-configuration QR and copy, and search for long lists. Flags are drawn by an embedded Twemoji font, so every country's flag shows on every platform — Windows included.
- **Five languages** — English, Persian, Arabic, Russian, and Chinese — with right-to-left layout, and a System / Light / Dark theme choice.

**For you**

- **White-label branding.** Service name, support link, and logo, all optional, stored as data and injected as text.
- **A manager for everything.** An interactive menu and direct commands for branding, updates, verification, rollback, and uninstall.
- **Stable-channel updates.** `row-template update` installs the latest stable release, verified, whenever you run it — which also makes it a quick repair.

**Privacy and safety**

- **No third-party requests** from the served page: no CDNs, no external QR or geolocation lookups, no telemetry. Live status comes from your own panel.
- **Mandatory SHA-256** verification of every release download, with no option to skip it.
- **Atomic activation.** A new page is generated and validated before it replaces the live one, so a failed step never leaves a broken page live.
- **Fail-closed panel detection.** A panel counts as installed only when independent signals agree; a half-installed panel, or a panel database that is not a valid SQLite database, is refused rather than guessed at.

## Supported panel

| Panel | Status | Notes |
| ----- | ------ | ----- |
| [3X-UI](https://github.com/MHSanaei/3x-ui) (MHSanaei) | ✅ Supported | Requires version **>= 3.6.0** |

This edition intentionally supports **only 3X-UI**. The adapters, shells, and installer paths for other panels were removed; the installer refuses any panel id other than `3xui`.

**Limitations:**

- **Clash templates** are not produced; only the subscription page is.
- **Flags come from a code or an emoji, never from a name.** An ISO 3166-1 alpha-2 code in the node name (`TR | Istanbul`, `RU-01`, `GB-LON-1`, `DE`) draws that country's flag, as does a flag emoji. Country *names* and *city names* are **not** inferred and keep the monogram.
- **One panel per server.** An installation serves the panel it was installed for; to serve a different one, run `row-template uninstall` first.

## Architecture

```
Build:   src/ (runtime, styles, locales, 17 designs)
           ├─ tools/build.mjs ─► one self-contained HTML per design
           └─ tools/make-release.sh ─► tarball + SHA256SUMS ─► GitHub Releases

Host:    install.sh / row-template
           ├─ verify checksum, detect 3X-UI, back up, activate (subThemeDir), verify
           └─ the panel renders the page with the subscriber's data
              (live status: ?format=info)

Browser: subscriber opens the page ─► live figures come only from your own panel
```

- **One file per design.** `tools/build.mjs` inlines the shared runtime, the translations, the fonts, and the QR generator into a design's layout, and refuses a layout that is missing any hook the runtime needs. `tools/verify.mjs` then rejects an artifact that loads anything remote or carries a forbidden construct.
- **The panel does the rendering.** The page is a Go template: 3X-UI fills in the subscriber's data when it serves it.
- **The installer never patches your panel.** On 3X-UI it points `subThemeDir` at its own directory. Each change is snapshotted first and restored exactly if anything fails.

| Path | What lives there |
| ---- | ---------------- |
| `src/` | The page's runtime, styles, and translations; each design in `src/templates/<id>/` |
| `template/index.html` | The built Row page, committed |
| `tools/` | Build, verification, release, and the Go fixture renderer |
| `installer/` | `install.sh`, the `row-template` command, its management library, and the 3X-UI adapter in `installer/panels/` |
| `tests/` | The test suites |

## Installation

> **Recommended OS: Ubuntu 24.04 LTS (x86_64).** Other modern Linux distributions may work but have not had the same validation coverage.

**Requirements:** a server running 3X-UI **>= 3.6.0**; root access to it; and `curl`, `tar`, and `sha256sum` (present on virtually all Linux systems). Automatic activation also needs `sqlite3`.

Run as **root** on the server that hosts your panel:

```bash
bash <(curl -fsSL https://github.com/frank0live/row-template/releases/latest/download/install.sh)
```

The installer:

1. Downloads the latest stable release from GitHub.
2. Verifies its SHA-256 checksum (mandatory — no bypass).
3. Detects 3X-UI, extracts the release safely and installs to `/etc/3x-ui/sub_templates/row-template`.
4. On a fresh install, offers the design chooser (Enter keeps Row).
5. Prompts for your branding (service name, support link, logo — all optional).
6. Generates and validates the page, then activates it in the panel where possible.

To choose a design without the chooser, for example in a script:

```bash
RT_TEMPLATE=editorial bash <(curl -fsSL https://github.com/frank0live/row-template/releases/latest/download/install.sh)
```

If you prefer not to pipe from the network, download the four release assets (`install.sh`, `manifest.txt`, `SHA256SUMS`, and `row-template-<version>.tar.gz`) from the [Releases page](https://github.com/frank0live/row-template/releases/latest) into one folder, verify the checksum yourself as described in [PROVENANCE.md](PROVENANCE.md), and point the installer at that folder:

```bash
RT_RELEASE_DIR=/root/row-template-release bash /root/row-template-release/install.sh
```

### Activation

An interactive install shows what activation will change and asks first.

**3X-UI.** Row-Template installs to a directory that the panel serves as its subscription page:

```
/etc/3x-ui/sub_templates/row-template
```

- **Automatic:** when `sqlite3` is available, Row-Template sets it for you. It briefly stops the panel service, writes the setting, starts the service again, and checks the value.
- **Manual:** otherwise, open **Panel Settings → Subscription → Profile → Sub Theme Directory** and enter exactly:

  ```
  /etc/3x-ui/sub_templates/row-template
  ```

## Usage

Run the manager with no arguments in a terminal to open the interactive menu:

```bash
row-template
```

Or use a command directly:

| Command | What it does |
| ------- | ------------ |
| `row-template config` | Change the service name, support link, or logo, then regenerate the page |
| `row-template update` | Download, verify, and activate the latest stable release (checksum enforced) |
| `row-template rollback` | Restore a previous version (`--auto` or `--to <backup>`) |
| `row-template verify` | Check the install, the panel wiring, and the live page (as root, it also puts back missing or misplaced designs) |
| `row-template version` | Show the installed version and the panel it serves (also the minimum-supported and detected versions) |
| `row-template uninstall` | Remove Row-Template and return the panel to the page it had before |
| `row-template help` | Show usage |

Commands that change the system (`config`, `update`, `rollback`, `uninstall`) must run as root.

- **Branding** is stored as data, never executed, and injected into the page as text. Leave a field for an unbranded page. The support link accepts only schemes a browser should open, such as `https://…`, `tg://…`, or `mailto:…`.
- **Updates** come from the public stable channel. `row-template update` always applies the latest stable release; the manager's **Update** compares versions first and asks before changing anything. If the release source is unreachable, nothing is changed and your installation is never treated as damaged.
- **Rollback** restores a previous version from a validated backup. The current version is snapshotted first, so a failed rollback can be recovered, and your branding is preserved. Only the two newest backups are kept — each update, design switch, and rollback makes one.
- **Uninstall** removes Row-Template's files and returns the panel to the page it had before: on 3X-UI it clears `subThemeDir` only if it points at Row-Template. Your users, inbounds, clients, and certificates are not touched.

## Development

The pages are built from readable sources in `src/`. You need Node.js 22 or newer; to run the tests, also Go 1.22 or newer.

```bash
npm run build          # regenerate template/index.html from src/
npm run verify         # check the built page against the safety gates
npm test               # render the fixture pages, then run every test suite
npm run fixtures:all   # render every design's fixture pages on their own
npm run lint:sh        # ShellCheck every shell script
npm run preview        # preview the fixture pages at http://127.0.0.1:8787
```

The build is deterministic — the same sources always produce a byte-identical `template/index.html`.

## Testing

- **`npm test`** renders every design's fixture pages with the Go renderer, then runs the suites: the page's scripts, the build, every design's artifact, the release payload, and the installer — which runs the shipped shell library and the 3X-UI adapter in real `bash` against a throwaway host laid out like an official 3X-UI install.
- **`npm run verify`** checks a built page against its safety gates, including: a whole document, every build marker substituted, everything inlined, no remote references, no forbidden constructs, intact translations, and no invisible characters in the sources.
- **`npm run lint:sh`** fails on any ShellCheck error; `npm run lint:sh -- -S warning` shows the full report.

## Contributing

Bug reports, translations, and documentation fixes are very welcome. Open an issue at <https://github.com/frank0live/row-template/issues>.

**Bug reports:** include your Row-Template version (`row-template version`), your 3X-UI version, operating system and version, CPU architecture, the output of `row-template verify`, and clear steps to reproduce.

> **Do not include secrets.** Never paste subscription URLs, `subId` values, client UUIDs, panel usernames or passwords, cookies, tokens, the panel `webBasePath`, the contents of `.env`, database URLs, TLS keys, or real server addresses. Redact logs before sharing them.

## License

Released under the [MIT License](LICENSE). The bundled QR code generator (`src/vendor/uqr`) is included under its own MIT license, and the embedded Vazirmatn font subset under the SIL Open Font License (`src/fonts/OFL.txt`). The embedded flag font is Twemoji artwork under CC-BY 4.0 (`src/fonts/TWEMOJI-LICENSE.txt`). See [PROVENANCE.md](PROVENANCE.md) for the origin of this codebase.

## Credits

Original project by **frank0live** — <https://github.com/frank0live/Row-Template> (MIT).

This edition is maintained by **frank0live** — <https://github.com/frank0live/row-template>
