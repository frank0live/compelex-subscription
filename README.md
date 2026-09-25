<!-- Keep the developer identity, repository URL, commands, paths, version
     numbers, and wallet addresses in this file byte-for-byte identical to the
     translated READMEs. -->

<p align="center">
  <img src="docs/assets/row-template-banner.png" alt="Row-Template" width="900">
</p>

<p align="center">
  A polished, self-contained subscription page for <a href="https://github.com/MHSanaei/3x-ui">3X-UI</a> panels — fifteen designs, each a single HTML file, fully white-label, with no third-party requests from the page your subscribers open.
</p>

<p align="center">
  <strong>English</strong> | <a href="README.fa.md">فارسی</a> | <a href="README.ar.md">العربية</a> | <a href="README.ru.md">Русский</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/frank0live/Row-Template"></a>
  <a href="https://github.com/frank0live/Row-Template/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/frank0live/Row-Template?sort=semver"></a>
  <img alt="Panel" src="https://img.shields.io/badge/panel-3X--UI%20%E2%89%A5%203.6.0-informational">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux-lightgrey">
  <a href="https://iitzseridev.github.io/Row-Template/"><img alt="Documentation" src="https://img.shields.io/badge/docs-GitHub%20Pages-blue"></a>
</p>

<p align="center">
  <a href="#installation">Install</a> ·
  <a href="#designs">Designs</a> ·
  <a href="https://iitzseridev.github.io/Row-Template/">Documentation</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/frank0live/Row-Template/releases">Releases</a>
</p>

---

## What it is

3X-UI can serve a custom page to subscribers instead of its built-in one. Row-Template is that page: a subscriber opens their subscription link and sees their plan, their usage, their expiry date, and one-tap ways to add the subscription to the app they use.

It ships as one self-contained HTML file per design, with every style, script, font, and the QR code generator inlined. A single command installs it next to your panel, points the panel at it, and gives you a `row-template` manager for branding, updates, and rollback.

## Why Row-Template?

- **Private by design.** The page your subscribers open makes no third-party requests. QR codes are generated on the page, and your branding is injected as text — never executed, never sent anywhere.
- **Genuinely white-label.** Your service name, your support link, your logo. Nothing on the served page identifies Row-Template.
- **Fifteen designs, one file each.** Pick the look that fits your service. Every design shares the same features, languages, and safety checks.
- **Made for your subscribers.** Live usage and expiry, one-tap import into popular apps, and a searchable list of individual configurations for adding a single server by hand.
- **Safe to operate.** Checksum-verified releases, atomic activation, and one-command rollback. It never patches 3X-UI: the only panel setting it changes is the subscription page directory (`subThemeDir`).

## Designs

Row-Template 1.2.0 ships fifteen designs. Row is the default.

<table>
  <tr>
    <td align="center"><img src="docs/public/previews/row-mobile.webp" width="150" alt="Row"><br><sub>Row</sub></td>
    <td align="center"><img src="docs/public/previews/editorial-mobile.webp" width="150" alt="Editorial"><br><sub>Editorial</sub></td>
    <td align="center"><img src="docs/public/previews/canvas-mobile.webp" width="150" alt="Canvas"><br><sub>Canvas</sub></td>
    <td align="center"><img src="docs/public/previews/prism-mobile.webp" width="150" alt="Prism"><br><sub>Prism</sub></td>
    <td align="center"><img src="docs/public/previews/terminal-mobile.webp" width="150" alt="Terminal"><br><sub>Terminal</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/public/previews/pulse-mobile.webp" width="150" alt="Pulse"><br><sub>Pulse</sub></td>
    <td align="center"><img src="docs/public/previews/brutal-mobile.webp" width="150" alt="Brutal"><br><sub>Brutal</sub></td>
    <td align="center"><img src="docs/public/previews/arcade-mobile.webp" width="150" alt="Arcade"><br><sub>Arcade</sub></td>
    <td align="center"><img src="docs/public/previews/sketch-mobile.webp" width="150" alt="Sketch"><br><sub>Sketch</sub></td>
    <td align="center"><img src="docs/public/previews/signature-mobile.webp" width="150" alt="Signature"><br><sub>Signature</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/public/previews/saffron-mobile.webp" width="150" alt="Saffron"><br><sub>Saffron</sub></td>
    <td align="center"><img src="docs/public/previews/pulsenova-mobile.webp" width="150" alt="Pulse Nova"><br><sub>Pulse Nova</sub></td>
    <td align="center"><img src="docs/public/previews/prismnova-mobile.webp" width="150" alt="Prism Nova"><br><sub>Prism Nova</sub></td>
    <td align="center"><img src="docs/public/previews/terminalnova-mobile.webp" width="150" alt="Terminal Nova"><br><sub>Terminal Nova</sub></td>
    <td align="center"><img src="docs/public/previews/arcadenova-mobile.webp" width="150" alt="Arcade Nova"><br><sub>Arcade Nova</sub></td>
  </tr>
</table>

<sub>Previews are rendered from the project's own placeholder data. Desktop and mobile previews of every design are in the <a href="https://iitzseridev.github.io/Row-Template/templates/">template gallery</a>.</sub>

Choose a design during a fresh interactive install, set `RT_TEMPLATE` for a scripted one, or change it later from the manager (**Reconfigure branding → Template**). Updates keep your choice.

## Features

**For your subscribers**

- **Live status.** Plan state, traffic used and remaining, and expiry, refreshed from your panel while the page is visible.
- **One-tap import** into popular apps, grouped by platform: v2rayNG, Happ and sing-box on Android; Streisand, V2Box and Shadowrocket on iOS; Clash Verge Rev, Mihomo Party and v2rayN on Windows; Clash Verge Rev, Streisand and V2Box on macOS.
- **Copy and QR.** Copy the subscription link or scan it as a QR code generated on the page.
- **Configuration Explorer.** Every server on its own row, with a country flag or monogram and a protocol label (VLESS, VMess, Trojan, Shadowsocks, Hysteria/Hysteria2, WireGuard, AmneziaWG, Telegram MTProto), plus per-configuration QR and copy, and search for long lists.
- **Five languages** — English, Persian, Arabic, Russian, and Chinese — with right-to-left layout, and a System / Light / Dark theme choice.

**For you**

- **White-label branding.** Service name, support link, and logo, all optional, stored as data and injected as text.
- **A manager for everything.** An interactive menu and direct commands for branding, updates, verification, rollback, and uninstall.
- **Stable-channel updates.** `row-template update` installs the latest stable release, verified, whenever you run it — which also makes it a quick repair.

**Privacy and safety**

- **No third-party requests** from the served page: no CDNs, no external QR or geolocation lookups, no telemetry. Live status comes from your own panel.
- **Mandatory SHA-256** verification of every release download, with no option to skip it.
- **Atomic activation.** A new page is generated and validated before it replaces the live one, so a failed step never leaves a broken page live.
- **Fail-closed panel detection.** If the panel database Row-Template finds is not a valid SQLite database, it refuses to use it rather than guessing another one.

## Supported panels

| Panel | Status | Notes |
| ----- | ------ | ----- |
| [3X-UI](https://github.com/MHSanaei/3x-ui) (MHSanaei) | ✅ Supported | Requires version **>= 3.6.0** |
| [PasarGuard](https://github.com/PasarGuard/panel) | 🔬 Research | Not supported; no installation path |
| [Rebecca](https://github.com/rebeccapanel/Rebecca) | 🔬 Research | Not supported; no installation path |

3X-UI is the only supported panel. PasarGuard and Rebecca use different template engines (Jinja2 and pongo2); each design's page shell is built for them and packaged in the release for study, but the installer does not place it and there are no installation instructions for them. See [Compatibility](https://iitzseridev.github.io/Row-Template/compatibility/) for the research findings.

## Architecture

```mermaid
flowchart TB
  subgraph build ["Build and release"]
    direction LR
    SRC["src/<br/>runtime, styles, locales,<br/>15 design layouts"] --> BUILD["tools/build.mjs"]
    BUILD --> ART["One self-contained<br/>HTML file per design"]
    ART --> REL["tools/make-release.sh<br/>tarball + SHA256SUMS"]
  end
  subgraph host ["Your 3X-UI server"]
    direction LR
    INST["install.sh / row-template<br/>verify checksum, stage, validate,<br/>back up, activate"] --> DIR["/etc/3x-ui/<br/>sub_templates/row-template"]
    DIR -- "subThemeDir" --> XUI["3X-UI renders the page<br/>with the subscriber's data"]
  end
  build -- "GitHub Releases" --> host
  host -- "serves the page" --> BROWSER["Subscriber's browser"]
  BROWSER -. "live status: ?format=info" .-> host
```

- **One file per design.** `tools/build.mjs` inlines the shared runtime, the translations, the fonts, and the QR generator into a design's layout, and refuses a layout that is missing any hook the runtime needs. `tools/verify.mjs` then rejects an artifact that loads anything remote or carries a forbidden construct.
- **The panel does the rendering.** The page is a template: 3X-UI fills in the subscriber's data when it serves it, and the page then refreshes its status from the same panel.
- **The installer never edits 3X-UI.** It writes its own directory and changes one panel setting, `subThemeDir`, to point at it.

| Path | What lives there |
| ---- | ---------------- |
| `src/` | The page's runtime, styles, and translations; each design in `src/templates/<id>/` |
| `template/index.html` | The built Row page, committed |
| `tools/` | Build, verification, release, and the Go fixture renderer |
| `installer/` | `install.sh`, the `row-template` command, and its management library |
| `tests/` | The test suites |
| `docs/` | The documentation site; design records in [`docs/design/`](docs/design/README.md) |

## Installation

> **Recommended OS: Ubuntu 24.04 LTS (x86_64).** Other modern Linux distributions may work but have not had the same validation coverage.

**Requirements:** a server running 3X-UI **>= 3.6.0**, root access to it, and `curl`, `tar`, and `sha256sum` (present on virtually all Linux systems). Automatic activation also needs `sqlite3`.

Run as **root** on the server that hosts your 3X-UI panel:

```bash
bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

The installer:

1. Downloads the latest stable release from GitHub.
2. Verifies its SHA-256 checksum (mandatory — no bypass).
3. Extracts it safely and installs to `/etc/3x-ui/sub_templates/row-template`.
4. On a fresh install, offers the design chooser (Enter keeps Row).
5. Prompts for your branding (service name, support link, logo — all optional).
6. Generates and validates the page, then activates it in the panel where possible.

To choose a design without the chooser, for example in a script:

```bash
RT_TEMPLATE=editorial bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

If you prefer not to pipe from the network, download the four release assets (`install.sh`, `manifest.txt`, `SHA256SUMS`, and `row-template-<version>.tar.gz`) from the [Releases page](https://github.com/frank0live/Row-Template/releases/latest) into one folder, verify the checksum yourself as described in [PROVENANCE.md](PROVENANCE.md), and point the installer at that folder:

```bash
RT_RELEASE_DIR=/root/row-template-release bash /root/row-template-release/install.sh
```

### Activation

Row-Template installs to a directory that the panel serves as its subscription page:

```
/etc/3x-ui/sub_templates/row-template
```

- **Automatic:** when `sqlite3` is available, Row-Template sets it for you. It briefly stops the panel service, writes the setting, starts the service again, and checks the value. An interactive install shows the current setting and asks first.
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
| `row-template version` | Show the installed, minimum-supported, and detected 3X-UI versions |
| `row-template uninstall` | Remove Row-Template and revert the panel to its built-in page |
| `row-template help` | Show usage |

Commands that change the system (`config`, `update`, `rollback`, `uninstall`) must run as root.

- **Branding** is stored as data, never executed, and injected into the page as text. Leave a field blank for an unbranded page. The support link accepts only schemes a browser should open, such as `https://…`, `tg://…`, or `mailto:…`.
- **Updates** come from the public stable channel. `row-template update` always applies the latest stable release, even the version you already run; the manager's **Update** compares versions first and asks before changing anything. If the release source is unreachable, nothing is changed and your installation is never treated as damaged.
- **Updating from 1.1.0** takes one `row-template update`. 1.1.0's own updater copies only part of the new release, so the next `row-template`, `row-template config`, or `row-template verify` run as root first downloads the rest of that same release — every design, checksum-verified.
- **Rollback** restores a previous version from a validated backup. The current version is snapshotted first, so a failed rollback can be recovered, and your branding is preserved.
- **Uninstall** removes Row-Template's files. It clears the panel's `subThemeDir` only if it points at Row-Template, so the panel falls back to its built-in page; your inbounds, clients, and certificates are not touched.

The [documentation](https://iitzseridev.github.io/Row-Template/) covers configuration, branding, and troubleshooting in more depth.

## Development

The pages are built from readable sources in `src/`. You need Node.js 22 or newer, and Go 1.22 or newer to run the tests.

```bash
npm run build          # regenerate template/index.html from src/
npm run verify         # check the built page against the safety gates
npm test               # render the fixture pages, then run every test suite
npm run fixtures:all   # render every design's fixture pages on their own
npm run lint:sh        # ShellCheck every shell script
npm run preview        # preview the fixture pages at http://127.0.0.1:8787
```

The build is deterministic — the same sources always produce a byte-identical `template/index.html`. The documentation site is a separate workspace in `docs/`; see [docs/README.md](docs/README.md).

## Testing

- **`npm test`** renders every design's fixture pages with the Go renderer, then runs the suites: the page's scripts, the build, every design's artifact, the release payload, and the installer — which runs the shipped shell library in real `bash` against throwaway fixtures.
- **`npm run verify`** checks a built page against its safety gates, including: a whole document, every build marker substituted, everything inlined, no remote references, no forbidden constructs, intact translations, and no invisible characters in the sources.
- **`npm run lint:sh`** fails on any ShellCheck error; `npm run lint:sh -- -S warning` shows the full report.
- **The Docs workflow** builds the documentation site on every pull request that changes it.

## Roadmap

Direction, not promises:

- **Row-Template 1.2.0** — the fifteen designs and the design chooser described above.
- **PasarGuard and Rebecca** — research. Page shells are built for both; live status needs a small runtime change or a reverse proxy, and that decision is deferred. See [Compatibility](https://iitzseridev.github.io/Row-Template/compatibility/).
- **Installing on more than one panel** — the installer groundwork (a panel interface, a transaction engine, a 3X-UI adapter, and a new backup format) is in place but not yet used by any command.
- **Custom templates** — a proposal for adding your own design: [`docs/design/CUSTOM-TEMPLATES-PROPOSAL.md`](docs/design/CUSTOM-TEMPLATES-PROPOSAL.md).

## Contributing

Bug reports, translations, and documentation fixes are very welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

**Bug reports:** open an issue at <https://github.com/frank0live/Row-Template/issues>. Include your Row-Template version (`row-template version`), 3X-UI version, operating system and version, CPU architecture, the output of `row-template verify`, and clear steps to reproduce.

> **Do not include secrets.** Never paste subscription URLs, `subId` values, client UUIDs, panel usernames or passwords, cookies, tokens, the panel `webBasePath`, TLS keys, or real server addresses. Redact logs before sharing them.

## Security

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md). Do not open a public issue for security problems. [PROVENANCE.md](PROVENANCE.md) explains how releases are built and how to verify them.

## Support the project

Row-Template is free and open source. If it saves you time, you can support its development:

- **USDT (BEP20 / BNB Smart Chain):**

  ```
  0x2606551375987cec71F5fC033968B638A7a4bae4
  ```

- **TRON:**

  ```
  TYD5RFfiYrcETzWNSkAhfwgmRu1wQBbs6W
  ```

- **NOWPayments:** <https://nowpayments.io/donation/iitzfrank0live>

Thank you.

## License

Released under the [MIT License](LICENSE). The bundled QR code generator (`src/vendor/uqr`) is included under its own MIT license, and the embedded Vazirmatn font subset under the SIL Open Font License (`src/fonts/OFL.txt`).

## Developer

Built and maintained by **frank0live** — <https://github.com/frank0live/Row-Template>
