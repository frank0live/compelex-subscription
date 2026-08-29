# Contributing to Row-Template

Thanks for your interest in improving Row-Template. This is a small project, so
the process is intentionally lightweight.

## Ways to help

- **Report bugs** using the issue template. Include your Row-Template version,
  3X-UI version, operating system, and clear reproduction steps.
- **Improve translations.** The interface ships in English, Persian, Arabic,
  Russian, and Chinese. Corrections and refinements from native speakers are
  very welcome.
- **Suggest features** by opening an issue to discuss the idea before writing
  code.

## Before you open a pull request

1. **Discuss large changes first.** Open an issue so the direction can be agreed
   on before you invest time.
2. **Keep the artifact self-contained.** The served page must not add third-party
   CDNs, external network requests, or runtime dependencies.
3. **Never commit secrets.** No subscription URLs, `subId` values, UUIDs, panel
   credentials, cookies, tokens, private keys, or real server addresses — in
   code, fixtures, tests, commit messages, or history.

## Development

The template artifact is built from readable sources in `src/`:

```bash
npm run build     # regenerate template/index.html from src/
npm run verify    # check the artifact against the safety gates
npm test          # run the unit and installer test suites
```

The build is deterministic: the same sources always produce a byte-identical
`template/index.html`. Edit the files under `src/` rather than the generated
artifact, then rebuild.

The installer and manager live under `installer/` (a bootstrap `install.sh`, the
`row-template` CLI, and the `lib/row-template.sh` management library). Please run
`npm test` before submitting changes to these.

## Commit messages

Write clear, descriptive commit messages in the imperative mood
(e.g. "Fix rollback when no backup exists"). Explain the *why* when it is not
obvious from the diff.

## Code of conduct

Be respectful and constructive. Assume good faith.
