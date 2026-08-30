# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/frank0live/Row-Template/releases/tag/v1.1.0
[1.0.0]: https://github.com/frank0live/Row-Template/releases/tag/v1.0.0
