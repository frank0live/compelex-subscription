## What this changes

<!-- What does this pull request do, and why? Link the issue it addresses, if any. -->

## How it was checked

<!-- Tick what applies and delete the rest. -->

- [ ] `npm test` passes (needs Go 1.22+; it renders the fixture pages first)
- [ ] `npm run verify` passes
- [ ] `npm run build` was run and `template/index.html` is committed, if anything under `src/` changed
- [ ] `npm run lint:sh` passes, if a shell script changed
- [ ] `cd docs && npm ci && npm run build` passes, if anything under `docs/` changed

## Before you submit

- [ ] No secrets anywhere: no subscription URLs, `subId` values, UUIDs, panel credentials, cookies, tokens, keys or real server addresses, in code, fixtures, tests, screenshots or commit messages
- [ ] User-facing changes are noted under the unreleased version in `CHANGELOG.md`
- [ ] If the README changed, the translated READMEs keep the same commands, paths, URLs and wallet addresses
