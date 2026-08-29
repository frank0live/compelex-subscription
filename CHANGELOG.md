# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/frank0live/Row-Template/releases/tag/v1.0.0
