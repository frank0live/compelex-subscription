<!-- Keep the developer identity, repository URL, commands, paths, version
     numbers, and wallet addresses in this file byte-for-byte identical to the
     translated READMEs. -->

<p align="center">
  <img src="docs/assets/row-template-banner.png" alt="Row-Template" width="900">
</p>

<p align="center">
  A polished, self-contained custom subscription page for <a href="https://github.com/MHSanaei/3x-ui">3X-UI</a> panels — one HTML file, fully white-label, with no third-party CDNs and no external requests from the page your subscribers open.
</p>

<p align="center">
  <strong>English</strong> | <a href="README.fa.md">فارسی</a> | <a href="README.ar.md">العربية</a> | <a href="README.ru.md">Русский</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/frank0live/Row-Template"></a>
  <a href="https://github.com/frank0live/Row-Template/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/frank0live/Row-Template?sort=semver"></a>
  <img alt="Panel" src="https://img.shields.io/badge/panel-3X--UI%20%E2%89%A5%203.6.0-informational">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux-lightgrey">
</p>

---

## Why Row-Template?

- **Private by design.** The page your subscribers open makes no third-party requests. QR codes are generated locally, and your branding is injected as text — never executed, never sent anywhere.
- **Genuinely white-label.** Your service name, your support link, your logo. Nothing on the served page identifies Row-Template.
- **One file, no runtime dependencies.** CSS, JavaScript, fonts, and the QR generator are inlined into a single HTML file that installs with standard Linux userland — no Node.js, Python, or database.
- **Made for your subscribers.** Live usage and expiry, one-tap import into popular apps, and a searchable list of individual configurations for adding a single server by hand.
- **Safe to operate.** Atomic install with validation and one-command rollback. It never patches 3X-UI and never touches your panel's files.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshot-mobile-dark.png" alt="Row-Template — dark theme"></td>
    <td width="50%"><img src="docs/assets/screenshot-mobile-light.png" alt="Row-Template — light theme"></td>
  </tr>
  <tr>
    <td align="center"><sub>Dark theme</sub></td>
    <td align="center"><sub>Light theme</sub></td>
  </tr>
</table>

<sub>Screens use placeholder data; the configuration list and country badges shown are examples.</sub>

## Quick install

> **Recommended OS: Ubuntu 24.04 LTS (x86_64).** Other modern Linux distributions may work but have not had the same validation coverage.

Run as **root** on the server that hosts your 3X-UI panel:

```bash
bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

The installer downloads the latest stable release, verifies its SHA-256 checksum (there is no skip option), extracts it safely, and walks you through branding. It never patches 3X-UI and never touches your panel's own files.

## Supported panels

| Panel | Status | Notes |
| ----- | ------ | ----- |
| [3X-UI](https://github.com/MHSanaei/3x-ui) (MHSanaei) | ✅ Supported | Requires version **>= 3.6.0** |
| [Marzban](https://github.com/Gozargah/Marzban) | ⬜ Planned | Not yet supported |
| [Marzneshin](https://github.com/marzneshin/marzneshin) | ⬜ Planned | Not yet supported |
| [Rebecca](https://github.com/rebeccapanel/Rebecca) | ⬜ Planned | Not yet supported |
| [PasarGuard](https://github.com/PasarGuard/panel) | ⬜ Planned | Not yet supported |

Only 3X-UI is supported today. The other panels are on the roadmap and are listed here for transparency — there is no partial or experimental support for them in this release.

## Features

- **One self-contained page.** All CSS, JavaScript, fonts, and the QR code generator are inlined into a single HTML file. The page your subscribers open makes no third-party requests.
- **White-label.** Set your own service name, support link, and logo. Nothing identifies Row-Template on the served page.
- **Five languages.** English, Persian, Arabic, Russian, and Chinese, with right-to-left layout support.
- **Safe by construction.** Your branding is treated as data and injected as text, never executed. The page never sends subscriber data anywhere.
- **Live usage view.** Shows plan status, traffic used and remaining, expiry, and per-client links with copy buttons and QR codes.
- **Atomic install and rollback.** Each change is staged, validated, then swapped in. A failed step never leaves a broken page live, and you can roll back to a previous version.
- **No runtime dependencies.** Standard Linux userland only (bash, coreutils, curl, tar, sha256sum). No Node.js, Python, or database is required to install or run it.

## Requirements

- A server running a 3X-UI panel (version **>= 3.6.0**).
- Root access to that server.
- `curl`, `tar`, and `sha256sum` (present on virtually all Linux systems).

## Compatibility

- **Panel:** 3X-UI (MHSanaei) **>= 3.6.0**. Validated against stock 3.7.0.
- **Operating system:** recommended Ubuntu 24.04 LTS. Validated on Ubuntu 24.04 LTS (x86_64). Other distributions may work but have not received the same validation coverage.

## Installation

Run the [Quick install](#quick-install) command as root. The installer will:

1. Download the latest stable release from GitHub.
2. Verify the release checksum (SHA-256, mandatory — no bypass).
3. Extract it safely and install to `/etc/3x-ui/sub_templates/row-template`.
4. Prompt for your branding (service name, support link, logo — all optional).
5. Generate the served page and, where possible, activate it in the panel.

If you prefer not to pipe from the network, you can download the release assets from the [Releases page](https://github.com/frank0live/Row-Template/releases/latest), verify the checksum yourself, and run the bundled `install.sh` from the extracted directory.

## Manager

After installation, manage everything with the `row-template` command. Run it with no arguments in a terminal to open the interactive manager:

```bash
row-template
```

Or use the direct commands:

| Command | What it does |
| ------- | ------------ |
| `row-template config` | Reconfigure branding (service name, support link, logo) |
| `row-template update` | Check the stable channel and update if a newer version exists |
| `row-template rollback` | Roll back to the previous version (`--auto` or `--to <backup>`) |
| `row-template verify` | Check that the installation is healthy |
| `row-template version` | Print the installed version |
| `row-template uninstall` | Remove Row-Template (leaves 3X-UI untouched) |
| `row-template help` | Show usage |

## Branding and configuration

Set your service name, support link, and logo during installation, or change them any time:

```bash
row-template config
```

Your inputs are stored as data (never executed) and injected into the page as text. Leave a field blank for an unbranded, white-label page. The support link accepts only schemes a browser should open (for example `https://…`, `tg://…`, or `mailto:…`).

## Activation

Row-Template installs to a directory that the panel serves as the subscription page:

```
/etc/3x-ui/sub_templates/row-template
```

- **Automatic:** when `sqlite3` is available, the installer/manager can point the panel at Row-Template for you.
- **Manual:** otherwise, set it in the panel yourself — open **Panel Settings → Subscription → Profile → Sub Theme Directory** and enter exactly:

  ```
  /etc/3x-ui/sub_templates/row-template
  ```

## Update

```bash
row-template update
```

This checks the public stable release channel, shows the installed and available versions, and updates only when a newer stable version exists. If the network or release source is unreachable, it reports that it could not check — your installation is never treated as damaged. Normal use needs no URLs or manual downloads.

## Rollback

```bash
row-template rollback
```

Restores the previous version from a validated backup. The current version is snapshotted first, so a failed rollback can be recovered. Your branding configuration is preserved.

## Verify

```bash
row-template verify
```

Reports whether the installed artifact, panel wiring, and service are healthy.

## Uninstall

```bash
row-template uninstall
```

Removes Row-Template and its files. It **does not** touch 3X-UI, its database, your inbounds, clients, or certificates.

## Languages

The subscription page ships in five interface languages and follows the subscriber's panel/browser locale:

**English · فارسی · العربية · Русский · 简体中文**

Arabic and Persian are rendered right-to-left.

## Bug reports

Please open an issue: <https://github.com/frank0live/Row-Template/issues>

Include your Row-Template version (`row-template version`), 3X-UI version, operating system and version, CPU architecture, the output of `row-template verify`, and clear steps to reproduce.

> **Do not include secrets.** Never paste subscription URLs, `subId` values, client UUIDs, panel usernames or passwords, cookies, tokens, the panel `webBasePath`, TLS keys, or real server addresses. Redact logs before sharing them.

## Security

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md). Do not open a public issue for security problems.

## Development

The single-file artifact is built from readable sources in `src/`:

```bash
npm run build     # regenerate template/index.html from src/
npm run verify    # check the artifact against the safety gates
npm test          # run the unit and installer test suites
```

The build is deterministic — the same sources always produce a byte-identical `template/index.html`. See [CONTRIBUTING.md](CONTRIBUTING.md).

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

Released under the [MIT License](LICENSE). The bundled QR code generator (`src/vendor/uqr`) is included under its own MIT license.

## Developer

Built and maintained by **frank0live** — <https://github.com/frank0live/Row-Template>
