# Release provenance and verification

This document explains how Row-Template releases are published, what each
release contains, and how to verify that what you install is exactly what the
maintainer built. It states plainly what each check does and does not prove, so
you can decide how much to trust a download.

## What a release contains

Every release published on GitHub carries these assets:

| Asset | Purpose |
| ----- | ------- |
| `row-template-<version>.tar.gz` | The runtime payload (template, `VERSION`, `install.sh`, `lib/`, `bin/`). |
| `SHA256SUMS` | The SHA-256 checksum of the tarball above. |
| `manifest.txt` | Plain-text metadata (`name`, `version`, `artifact`, `min_xui`, `created`), parsed as data — never executed. |
| `install.sh` | The bootstrap used by the one-command installer. |

Inside the tarball there is a second `SHA256SUMS` listing the checksum of every
payload file, so the contents can be checked after extraction as well.

The build is deterministic: the same sources always produce a byte-identical
`row-template-<version>.tar.gz`. Anyone can rebuild it from a checkout with
`tools/make-release.sh` and compare the checksum.

## Integrity: mandatory SHA-256

The installer verifies the tarball's SHA-256 against `SHA256SUMS` before it
extracts anything. There is **no skip option** and no environment variable that
disables the check — a mismatch aborts the install.

To verify a download by hand, in the directory holding the downloaded assets:

```bash
sha256sum -c SHA256SUMS
```

or compare explicitly:

```bash
sha256sum row-template-<version>.tar.gz
cat SHA256SUMS
```

## What SHA-256 does and does not prove

A matching SHA-256 proves **integrity relative to that checksum file**: the
tarball you have is bit-for-bit the tarball named in `SHA256SUMS`, with no
corruption or truncation in transit.

It does **not**, on its own, authenticate the publisher. If an attacker could
replace the tarball on the download host, they could replace `SHA256SUMS` in the
same step, and the two would still agree. A checksum is tamper-evidence against
a *fixed reference*, not proof of *who* produced the bytes.

Two things contribute to publisher trust here, and neither is the checksum:

- **HTTPS/TLS** authenticates the GitHub host and encrypts the transfer, so you
  know you reached GitHub and not a machine on the path.
- **GitHub account and repository control** determine who is allowed to publish
  a release under `frank0live/Row-Template`.

Do not read "checksum verified" as "signed by the author." They are different
guarantees.

## Optional stronger provenance: signed tags

For cryptographic assurance of authorship, a release can be tied to a **signed
git tag**. When a release tag is signed, you can verify the signature against a
public key you already trust — that is authenticity, not just integrity.

To verify a signed tag, when a signature is published:

```bash
git clone https://github.com/frank0live/Row-Template
cd Row-Template
git tag -v v<version>
```

For SSH-signed tags, git checks the signature against your configured allowed
signers file; for GPG-signed tags, against your imported public keys. A tag that
is not signed, or whose key you do not trust, will not verify — treat that as
"integrity only."

The project never publishes, commits, or prints a private signing key. Only the
public key and the signature travel with the release.

## Recommended verification, most to least cautious

1. Rebuild the tarball from a source checkout and compare its SHA-256 with the
   published `SHA256SUMS` — this is fully independent of the release host.
2. Verify a signed tag against a maintainer public key you already hold.
3. Download over HTTPS and run `sha256sum -c SHA256SUMS` before installing.

The one-command installer always performs at least step 3 for you, and refuses
to continue on a mismatch.
