# Security Policy

## Supported versions

Row-Template follows semantic versioning. Security fixes are released against the
latest stable version. Older versions are not maintained — update to the latest
release before reporting an issue.

| Version | Supported |
| ------- | --------- |
| Latest stable (1.x) | ✅ |
| Older / pre-release / `-dev` | ❌ |

## Reporting a vulnerability

Please report security issues **privately** so they can be fixed before public
disclosure. Do **not** open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability** (Private vulnerability reporting).
3. Describe the issue, the affected version (`row-template version`), and clear
   reproduction steps.

If private reporting is unavailable to you, open a minimal public issue that
asks a maintainer to enable private reporting — **without** including any
exploit details or sensitive data.

## What to include

- Row-Template version (`row-template version`).
- 3X-UI (Xray panel) version and operating system.
- A clear description and reproduction steps.
- Impact assessment, if you have one.

## Do not include secrets

Never paste secrets into a report or a public issue. This includes:

- Subscription URLs, `subId` values, client UUIDs.
- Panel usernames, passwords, cookies, session tokens, or API tokens.
- The panel's `webBasePath`, TLS private keys, or certificates.
- Server IP addresses or hostnames you do not want made public.

Redact these before sharing any logs or command output.

## Verifying releases

Every release is distributed with a mandatory SHA-256 checksum, and the
installer refuses to continue on a mismatch. For the full trust model — what the
checksum does and does not prove, how to verify a build independently, and the
optional signed-tag path for publisher authenticity — see
[PROVENANCE.md](PROVENANCE.md).

## Scope

Row-Template generates and serves a **static** subscription page from the
administrator's own server. It has no backend of its own, makes no third-party
network requests from the served page, and never transmits subscriber data
anywhere. Reports about the underlying 3X-UI panel or Xray-core belong to their
respective projects.
