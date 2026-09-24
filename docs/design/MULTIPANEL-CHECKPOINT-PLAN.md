# Multi-Panel Checkpoint Plan

**Phase 7C — repository-state audit and safe commit plan. Nothing staged, nothing committed.**

| | |
|---|---|
| Date | 2026-09-20 |
| Branch | `feat/v1.2-multitemplate` |
| Baseline commit | **`52f8fc0`** — `feat: add multi-panel foundation layer` (5 files, +677) |
| Working tree | **14 tracked modified · 21 untracked entries** (39 files once directories are expanded) |
| Gates at audit time | **395/395 tests · verify green · build:panels exit 0 · git diff --check clean · 15/15 locks** |
| Verdict | **Ready. Nine isolated commits proposed below. See §6 for the one structural constraint.** |

---

## 1. Baseline

`52f8fc0` contains exactly five files — the Phase 1 foundation:

```
package.json          |   1 +
tests/panels.test.mjs | 176 +++++++++
tools/build-panel.mjs | 147 +++++++++
tools/panels.mjs      | 168 +++++++++
tools/transpile.mjs   | 185 +++++++++
```

Everything after it is uncommitted. **No tag points at any of it:** `v1.0.0` → `cda2af2` (2026-08-30)
and `v1.1.0` → `86af154` (2026-08-31) both predate the baseline. No release was created.

---

## 2. Branch identity — and the slashed-ref hazard

| check | before | after all inspection |
|---|---|---|
| `HEAD` | `52f8fc02d8bd6f0e5a1c5d327409afa15dcacd2d` | **identical** |
| branch | `feat/v1.2-multitemplate` | **identical** |
| `.git/refs/heads/feat/v1.2-multitemplate` | exists | **exists** |

**The hazard is live and must be watched.** On this host, git operations on this slashed branch can
delete `.git/refs/heads/feat/` entirely — there is no `packed-refs` in this repo, so the ref is
*deleted*, not packed. The symptom misleads: `git diff --cached` then reports every tracked file as
`A` (an unborn HEAD diffed against the empty tree), which is **not** index corruption.

**After every index-writing command in the execution phase, re-check:**

```bash
git rev-parse HEAD && git rev-parse --abbrev-ref HEAD
test -f .git/refs/heads/feat/v1.2-multitemplate || echo "REF LOST"
```

**Recovery, if lost:** read the sha from `.git/logs/HEAD`, `git cat-file -t` it, then

```bash
mkdir -p .git/refs/heads/feat
printf '%s\n' <sha> > .git/refs/heads/feat/v1.2-multitemplate
```

and repair the index with **`git read-tree --reset HEAD`** — *not* `git reset`, which writes a
reflog entry and re-runs the transaction that keeps losing the ref.

---

## 3. File classification

Legend — **Phase** = which phase created the change. All paths are relative to the repo root.

### Tracked, modified (14)

| file | phase | purpose | commit |
|---|---|---|---|
| `FLAG-RENDERER-AUDIT.md` | pre-multi-panel | audit-trail reconciliation (+337/−95) | **C1** |
| `FLAG-RENDERER-PHASE-0.5.md` | pre-multi-panel | audit-trail reconciliation (+181/−38) | **C1** |
| `PANEL-COMPATIBILITY-AUDIT.md` | pre-multi-panel | audit-trail reconciliation (+242/−28) | **C1** |
| `tests/explorer.test.mjs` | pre-multi-panel | flag/gradient/monogram coverage (+100) | **C2** |
| `src/scripts/live.js` | 6B | hardened poll guard (+19/−) | **C7** |
| `template/index.html` | 6B | the committed Row artifact, re-frozen | **C7** |
| `tests/live.test.mjs` | 6B | complete island payload for the new guard | **C7** |
| `tests/build.test.mjs` | 6B | the 15 artifact locks, re-baselined | **C7** |
| `tools/panels.mjs` | 2B + 3C + 4E | the three adapter registrations | **C5** |
| `tests/panels.test.mjs` | 4E | G4 registry assertions | **C5** |
| `tools/build.mjs` | 5A | five additive exports for the shell layer | **C6** |
| `tools/build-panel.mjs` | 5A + 5B + 7B | drift fix, shell write, `--list` | **C6** |
| `tools/make-release.sh` | 7B | shell packaging | **C8** |
| `tests/release.test.mjs` | 7B | shell payload assertions + shared build | **C8** |

### Untracked — code and tests (11)

| file | phase | purpose | commit |
|---|---|---|---|
| `tools/contract.mjs` | 2A | the normalized model contract | **C3** |
| `tests/contract.test.mjs` | 2A | contract validation | **C3** |
| `tools/adapters/3xui.mjs` | 2B | the reference adapter | **C4** |
| `tools/adapters/pasarguard.mjs` | 3C | the PasarGuard adapter | **C4** |
| `tools/adapters/rebecca.mjs` | 4D | the Rebecca adapter | **C4** |
| `tests/adapters.test.mjs` | 2B | the 3X-UI adapter suite | **C5** |
| `tests/adapters-pasarguard.test.mjs` | 3C (+4E fix) | the PasarGuard adapter suite | **C5** |
| `tests/adapters-rebecca.test.mjs` | 4D (+4E) | the Rebecca adapter suite | **C5** |
| `tests/panels-fixtures.test.mjs` | 3B.5 | the PasarGuard fixture oracle | **C4** |
| `tests/panels-fixtures-rebecca.test.mjs` | 4C | the Rebecca fixture oracle | **C4** |
| `tools/shell.mjs`, `tools/render-jinja.mjs` | 5A/5B | the shell layer | **C6** |
| `tests/panels-pasarguard-shell.test.mjs` | 5A | PasarGuard shell suite | **C6** |
| `tests/panels-rebecca-shell.test.mjs` | 5B | Rebecca shell suite | **C6** |

### Untracked — fixtures (39)

`tests/fixtures/panels/pasarguard/*.json` (20, Phase 3B.5) and
`tests/fixtures/panels/rebecca/*.json` (19, Phase 4C + 4D) — the recorded native payloads. **C4.**

### Untracked — documents (8)

| file | phase | status | commit |
|---|---|---|---|
| `ARCHITECTURE-MULTIPANEL-PLAN.md` | pre-Phase-1 | **current** — the programme's spine | **C9** |
| `PHASE-1-FOUNDATION-PLAN.md` | Phase 1 | **superseded** — executed by `52f8fc0` | **C9** |
| `PASARGUARD-ADAPTER-AUDIT.md` | 3A | current — source audit | **C9** |
| `PASARGUARD-RUNTIME-FIXTURE-PLAN.md` | 3B | **superseded** — fixtures exist | **C9** |
| `REBECCA-ADAPTER-AUDIT.md` | 4A | current — source audit | **C9** |
| `REBECCA-ADAPTER-DECISIONS.md` | 4B | current — the frozen decisions | **C9** |
| `INSTALLER-MULTIPANEL-AUDIT.md` | 7A | current — open recommendation | **C9** |
| `LIVE-POLLING-AUDIT.md` | 6A | current — deferral on record | **C9** |

---

## 4. Stale / superseded documents — classified, not deleted

| file | why superseded | recommendation |
|---|---|---|
| `PHASE-1-FOUNDATION-PLAN.md` | its whole content was executed by `52f8fc0` | **commit as-is.** It is the plan of record for a shipped commit; deleting it loses the reasoning. |
| `PASARGUARD-RUNTIME-FIXTURE-PLAN.md` | the 20 fixtures it specifies now exist and are tested | **commit as-is.** It is the specification the fixtures were built against, and Phase 3B.5 deviated from it in one place (the `base64:` prefix) — keeping it preserves that record. |

**Neither is deleted.** A superseded plan is evidence, not clutter — the same convention this
project already applies to the three audit documents, which are corrected by *addition* and never
rewritten.

---

## 5. No accidental files

Every one of the 39 entries maps to a named phase. Nothing is unexplained:

- no editor backups, no `*.orig`, no `.DS_Store`, no `node_modules`
- `dist/` is **gitignored** (`dist/shells`, `dist/panels`, `dist/templates` are all build output)
- `build/`, `out/`, `docs/dist/` are pre-existing generated trees, untouched
- the two zips and the panel sources live **outside** this repo (`../`), not in the tree

---

## 6. The one structural constraint

**`tools/panels.mjs` cannot be split per panel without `git add -e`.**

Its diff is four hunks, and the **three adapter imports are one contiguous hunk**:

```
@@ -32,2 +32,6 @@     <- all THREE imports together
@@ -65,6 +69,6 @@     <- the 3xui entry
@@ -73,5 +77,8 @@     <- the pasarguard entry
@@ -80,5 +87,9 @@     <- the rebecca entry
```

A per-panel sequence would need hunk 1 hand-edited into three, twice. **This plan does not do
that.** Instead the adapters and their fixtures land first (**C4**), and the registry lands with
the adapter *suites* (**C5**), because every adapter suite asserts registry state:

```js
assert.equal(PANELS.pasarguard.adapter, adapter);
assert.ok(adapterFor('rebecca'));
```

Landing an adapter suite before its registration would leave a red commit. **This ordering is what
keeps every commit green** — it is not a convenience.

**`tools/build-panel.mjs` spans three workstreams** (5A drift fix, 5B shell write, 7B `--list`). It
is assigned to **C6**. C8 consumes its `--list` flag, and C8 comes after C6, so the order is sound.

---

## 7. Proposed commit sequence

Each commit is independently green. **Verify after each** (see §8).

### C1 — `docs: reconcile the flag-renderer audit trail`

```
FLAG-RENDERER-AUDIT.md
FLAG-RENDERER-PHASE-0.5.md
PANEL-COMPATIBILITY-AUDIT.md
```

**Why together:** the three documents form one reconciliation pass. The project's own convention is
that they are corrected by *addition* — a dated `Was | Now` block at the head, every original figure
preserved — so they are one editorial act and must move as one.

### C2 — `test: cover every assigned flag code, gradient and monogram fallback`

```
tests/explorer.test.mjs
```

**Why alone:** these are coverage tests for the flag renderer the three documents above describe.
They depend on no other uncommitted work.

### C3 — `feat(contract): add the normalized model contract`

```
tools/contract.mjs
tests/contract.test.mjs
```

**Why together:** the contract and its validation suite are one artefact. Nothing else in the tree
depends on them yet, so this is a clean base for C4.

### C4 — `feat(panels): add the three panel adapters and their fixture oracles`

```
tools/adapters/3xui.mjs
tools/adapters/pasarguard.mjs
tools/adapters/rebecca.mjs
tests/fixtures/panels/pasarguard/*.json        (20)
tests/fixtures/panels/rebecca/*.json           (19)
tests/panels-fixtures.test.mjs
tests/panels-fixtures-rebecca.test.mjs
```

**Why together:** the adapters and the recorded payloads they are checked against. The fixture
suites validate the *fixtures*, not the registry, so they pass with the old `panels.mjs` — this is
the largest commit precisely because §6 forbids splitting it further without hunk surgery.

### C5 — `feat(panels): activate all three panels in the registry`

```
tools/panels.mjs
tests/adapters.test.mjs
tests/adapters-pasarguard.test.mjs
tests/adapters-rebecca.test.mjs
tests/panels.test.mjs
```

**Why together:** the registry entry and every suite that asserts it. All four suites read
`PANELS[id].adapter` / `adapterFor(id)`, so they cannot land before the registration — and the
registration cannot land before the adapters (C4).

### C6 — `feat(shells): add the panel shell layer and both panel shells`

```
tools/shell.mjs
tools/render-jinja.mjs
tools/build.mjs
tools/build-panel.mjs
tests/panels-pasarguard-shell.test.mjs
tests/panels-rebecca-shell.test.mjs
```

**Why together:** one layer. `shell.mjs` assembles; `render-jinja.mjs` renders it for the tests;
`build.mjs` supplies the exported styles/boot/locales it reuses; `build-panel.mjs` carries the
Go-only drift fix and the shell write. The two suites exercise both panels.

### C7 — `fix(live): harden the poll guard and re-freeze the catalogue`

```
src/scripts/live.js
tests/live.test.mjs
tests/build.test.mjs
template/index.html
```

**Why together — this one is load-bearing.** The guard change adds −16 B to *every* artifact, so
`template/index.html` and the 15 locks in `tests/build.test.mjs` **must** move in the same commit or
the tree is inconsistent. Splitting them would produce a commit whose tests fail. This is the first
re-freeze since the freeze, and it is atomic by necessity.

### C8 — `feat(release): package every panel shell`

```
tools/make-release.sh
tests/release.test.mjs
```

**Why together:** the packaging change and its assertions. Depends on C6's `--list` flag and on C7's
frozen artifacts.

### C9 — `docs: record the multi-panel audits and plans`

```
ARCHITECTURE-MULTIPANEL-PLAN.md
PHASE-1-FOUNDATION-PLAN.md
PASARGUARD-ADAPTER-AUDIT.md
PASARGUARD-RUNTIME-FIXTURE-PLAN.md
REBECCA-ADAPTER-AUDIT.md
REBECCA-ADAPTER-DECISIONS.md
INSTALLER-MULTIPANEL-AUDIT.md
LIVE-POLLING-AUDIT.md
```

**Why together and last:** documents. Committing them last means every commit before it is code
that stands on its own, and the record arrives once the work it describes is in. The two superseded
plans stay (§4).

---

## 8. Verification, per commit

**Before the first commit:**

```bash
git rev-parse HEAD && git rev-parse --abbrev-ref HEAD
test -f .git/refs/heads/feat/v1.2-multitemplate || echo "REF LOST — see §2"
npm test && npm run verify && git diff --check
```

**After each `git add <explicit paths>` (never `git add .`):**

```bash
git status --short                       # confirm ONLY the intended paths are staged
git diff --cached --stat                 # confirm the expected file set
git rev-parse HEAD && git rev-parse --abbrev-ref HEAD     # ref still alive
```

**After each `git commit`:**

```bash
git rev-parse HEAD && git rev-parse --abbrev-ref HEAD
test -f .git/refs/heads/feat/v1.2-multitemplate || echo "REF LOST — see §2"
git show --stat --oneline HEAD           # confirm the committed file set
```

**Full gates, required before the final commit and again at the end:**

| gate | expected |
|---|---|
| `npm test` | 395/395 pass (the slow installer suite is excluded by convention) |
| `npm run verify` | all checks passed |
| `npm run build:panels` | exit 0, **45** shells |
| `git diff --check` | clean |
| artifact locks | **15/15** |
| `template/index.html` | matches `build(true,'row')` — 201258 B |
| release payload | **45 shells + 45 sidecars**, inner 125 checksums validate, outer SHA256SUMS OK |
| `installer/`, `release/` | **0** changes |
| `VERSION` | still `1.1.0` — unchanged |
| tags | still exactly `v1.0.0`, `v1.1.0` — no new tag |
| `git status` after the last commit | clean |

---

## 9. Explicitly out of scope

- **No `git add .`** — every commit uses explicit paths, listed above.
- **No staging during this audit.** Nothing is staged now.
- **No commit, no push, no tag, no release.**
- **`VERSION` and `CHANGELOG.md` are untouched** — `VERSION` stays `1.1.0`.
- **No `git reset`** anywhere in the recovery path; use `git read-tree --reset HEAD` (§2).

---

## 10. Open items carried into the commits

These are recorded, not resolved by this plan:

1. **Rebecca registry activation is in C5** — it is `active` in the tree, so it ships with C5.
2. **The installer still knows only 3X-UI.** `INSTALLER-MULTIPANEL-AUDIT.md` recommends packaging
   the shells only; **that recommendation is not yet authorised** and no installer code has moved.
3. **Live polling is deferred** — `LIVE-POLLING-AUDIT.md` recommends deferring, and Phase 6B shipped
   only the guard hardening.
4. **The release is now 4.7 MB** (was ~106 KB) — inherent to shipping 45 full documents.

---

MULTI-PANEL CHECKPOINT AUDIT COMPLETE — READY FOR ISOLATED COMMIT EXECUTION
