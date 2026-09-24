# Contributing to Row-Template

Thanks for your interest in improving Row-Template. This is a small project, so
the process is intentionally lightweight. Everyone taking part is expected to
follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report bugs** using the issue template. Include your Row-Template version,
  3X-UI version, operating system, and clear reproduction steps.
- **Improve translations.** The interface ships in English, Persian, Arabic,
  Russian, and Chinese. Corrections and refinements from native speakers are
  very welcome — see [Translations](#translations).
- **Improve the documentation** — the README, or the documentation site under
  [`docs/`](docs/README.md).
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
4. **Fill in the pull request checklist.** It lists the checks that apply to
   what you changed.

## Development

The template artifact is built from readable sources in `src/`:

```bash
npm run build     # regenerate template/index.html from src/
npm run verify    # check the artifact against the safety gates
npm test          # run the unit and installer test suites
npm run fixtures:all  # render every template's fixture pages (npm test runs this first)
```

`npm test` needs [Go](https://go.dev/) 1.22 or newer on `PATH`: before the
suites run, it renders every template's fixture pages into
`tools/fixtures/out/`, which some tests read and which is not committed.

The build is deterministic: the same sources always produce a byte-identical
`template/index.html`. Edit the files under `src/` rather than the generated
artifact, then rebuild.

The installer and manager live under `installer/` (a bootstrap `install.sh`, the
`row-template` CLI, and the `lib/row-template.sh` management library). Please run
`npm test` and `npm run lint:sh` before submitting changes to these.

### Linting shell scripts

`npm run lint:sh` runs [ShellCheck](https://www.shellcheck.net/) over every
tracked shell script and fails on any error. Install it once:

```bash
sudo apt install shellcheck    # Debian / Ubuntu
brew install shellcheck        # macOS
scoop install shellcheck       # Windows (or: winget install koalaman.shellcheck)
```

The gate is severity `error`. For the full report, including warnings, run
`npm run lint:sh -- -S warning`. Expect some warnings there that are not bugs:
ShellCheck checks each file on its own, so a global defined in one installer
file and read in another is reported as unused.

## Translations

- **The subscription page:** one catalogue per language in `src/locales/`
  (`en.json`, `fa.json`, `ar.json`, `ru.json`, `zh.json`). English is the
  reference: every other catalogue must have exactly its keys, none blank, or
  `npm run build` fails. Rebuild after editing and commit `template/index.html`.
- **The README:** `README.md` and its translations (`README.fa.md`,
  `README.ar.md`, `README.ru.md`, `README.zh-CN.md`) share one structure.
  Commands, paths, URLs, version numbers, and wallet addresses must stay
  byte-for-byte identical across all five.
- **The documentation site:** pages live in `docs/src/content/docs/` — English
  at the top level, Persian under `fa/`, Arabic under `ar/`.

## Designs

Each design lives in `src/templates/<id>/`, and the catalogue in
`tools/templates.mjs` lists them. A new design must meet the binding contract in
[`docs/design/CUSTOM-TEMPLATE-GUIDELINES.md`](docs/design/CUSTOM-TEMPLATE-GUIDELINES.md);
open an issue before starting one.

## Documentation site

The site in `docs/` is its own workspace with its own `package.json`; see
[`docs/README.md`](docs/README.md). Pull requests that touch `docs/` are built
by the Docs workflow, and merges to `main` publish the site to GitHub Pages.

```bash
cd docs
npm ci          # reproducible install from the committed lockfile
npm run dev     # local preview
npm run build   # the same build the workflow runs
```

## Design records

The audits, designs and decision records behind larger changes live in
[`docs/design/`](docs/design/README.md). Code and tests cite them by file name.
A change that alters one of those decisions should update or supersede the
record rather than contradict it silently.

## Commit messages

Write clear, descriptive commit messages in the imperative mood
(e.g. "Fix rollback when no backup exists"). Explain the *why* when it is not
obvious from the diff.

## Code of conduct

Be respectful and constructive, and assume good faith. The full
[Code of Conduct](CODE_OF_CONDUCT.md) applies to every issue, pull request and
discussion.
