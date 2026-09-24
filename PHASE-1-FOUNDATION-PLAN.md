# Phase 1 — Foundation Implementation Plan

**Status: plan only. Nothing implemented. No file modified by this document.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree | branch `feat/v1.2-multitemplate`, HEAD **`a012108`**, `VERSION` 1.1.0 |
| Approved scope | foundation only — canonical shell, adapter interface, panel registry, panel build target, proof tests |
| **Not** in scope | PasarGuard support · Rebecca support · live polling · `live.js` · any adapter that reads a real panel |
| Hard constraint | **zero artifact drift, zero lock re-baseline, zero production-template change** |
| Predecessors | `ARCHITECTURE-MULTIPANEL-PLAN.md` (design), `PANEL-COMPATIBILITY-AUDIT.md` (source audit) |

---

## 0. The one design decision that keeps this safe

The architecture plan listed `tools/build.mjs` among the files Phase 1 would modify (to register
a new build target). **This plan drops that change.**

`tools/build.mjs` is the only file in the change set that touches the artifact pipeline, and it
is not worth the risk. `tools/verify.mjs` already proves the pattern: a standalone entry point
invoked by its own npm script, importing what it needs. The panel build does the same.

**So Phase 1 modifies exactly one file — `package.json`, to add one script line.** `package.json`
is tooling config, is never concatenated into an artifact, and therefore cannot move a byte.

---

## 1. Exact files

### A. New — 6 files

| # | Path | Purpose |
|---|---|---|
| 1 | `src/shell/canonical.html` | the panel-neutral shell: one `<!doctype html>` document with the closed 27-action vocabulary and the three island hooks (`#sub-data`, `#announce-source`, `#links-source`) |
| 2 | `tools/panels.mjs` | panel registry + **adapter interface contract** + `assertAdapter()` validator |
| 3 | `tools/transpile.mjs` | canonical shell → Go / Jinja2 / pongo2 |
| 4 | `tools/build-panel.mjs` | standalone build target → `dist/panels/<panel>/<template>/template.html` |
| 5 | `tests/panels.test.mjs` | the four gates in §3 |
| 6 | `tests/fixtures/panels/.gitkeep` | placeholder for recorded payloads (Phase 2 fills it) |

### B. Modified — 1 file

| Path | Change | Drift |
|---|---|---|
| `package.json` | **add one script**: `"build:panels": "node tools/build-panel.mjs"` | **none** — not concatenated |

### C. Explicitly NOT touched

`tools/build.mjs` · `tools/templates.mjs` · `tools/verify.mjs` · `src/scripts/**` (all 17) ·
`src/styles/**` · `src/templates/**` (all 15 layouts + 75 CSS) · `src/locales/**` ·
`src/fonts/**` · `src/vendor/**` · `src/index.html` · `installer/**` · `release/**` ·
`VERSION` · `CHANGELOG.md` · `tests/build.test.mjs` · `tests/flag.test.mjs` ·
`tests/explorer.test.mjs`

---

## 2. Expected diff

| File | Kind | Expected size | Notes |
|---|---|---|---|
| `src/shell/canonical.html` | new | ~11.4 KB | derived from the 15 layouts; not yet authoritative |
| `tools/panels.mjs` | new | ~4–6 KB | registry + interface |
| `tools/transpile.mjs` | new | ~5–8 KB | 27-action vocabulary only |
| `tools/build-panel.mjs` | new | ~3–4 KB | standalone entry |
| `tests/panels.test.mjs` | new | ~6–9 KB | four gates |
| `tests/fixtures/panels/.gitkeep` | new | 0 B | placeholder |
| `package.json` | **modified** | **+1 line** | one script entry |

**`git diff --stat` expectation: `1 file changed, 1 insertion(+)`.**
Every other file is untracked and therefore absent from `git diff`.

### The panel registry's shape

`tools/panels.mjs` declares three panels, of which **only the reference is implemented**:

| id | status | adapter | emitter |
|---|---|---|---|
| `3xui` | **`reference`** | identity — its island is already correct | `go` |
| `pasarguard` | **`planned`** | none | `jinja2` |
| `rebecca` | **`planned`** | none | `pongo2` |

`assertAdapter()` rejects an adapter that does not expose the interface. A `planned` panel has
**no adapter**, so the build target refuses it with a clear message rather than emitting a
half-built artifact. This is what makes "do not implement PasarGuard or Rebecca yet" a
*structural* property rather than a promise.

---

## 3. Tests — the four gates

`tests/panels.test.mjs` must prove all four. They are ordered by strength.

| # | Gate | Assertion |
|---|---|---|
| **G1** | **Transpiler byte-identity** | For each of the **15** templates, transpile `src/shell/canonical.html` to Go and assert the result is **byte-identical to that template's current `src/templates/<id>/layout.html`**. This is the keystone: it proves the canonical shell can reproduce today's shells exactly, before it is ever authoritative. |
| **G2** | **Artifact byte-identity** | Build all 15 through the **existing** `build()` and assert byte-identity against the committed `FROZEN_ARTIFACTS` locks. The 15 artifacts must not move. |
| **G3** | **Panel-target equivalence** | Build the `3xui` panel tree into `dist/panels/3xui/**` and assert every file is **byte-identical** to its `dist/templates/**` counterpart (and `template/index.html` for `row`). Proves the new pipeline is a faithful second path. |
| **G4** | **Registry + interface** | `assertAdapter()` accepts a well-formed adapter and rejects malformed ones; a `planned` panel has no adapter and the build target **refuses it** with a clear error. |

**G1 is the gate that makes the whole approach safe.** If the transpiler cannot reproduce the
current shells byte-for-byte, the canonical-shell approach is wrong — and the fallback is
15 hand-authored per-engine shells, which is more duplication but still zero drift. Either way
the frozen artifacts survive. **G1 must be green before anything else in Phase 1 is trusted.**

### Why G1 is achievable rather than hopeful

The 15 layouts share one **closed** vocabulary of **27 action forms** across **177** `{{ end }}`
actions, and the shared sections (boot / locales / app / shell) are already byte-for-byte
identical between templates. The transpiler only has to handle a closed, enumerable set — and
G1 checks it against a known-good oracle (the committed files) rather than against an opinion.

---

## 4. Rollback strategy

**Rollback is total and trivial, because Phase 1 is additive by construction.**

| Step | Action |
|---|---|
| 1 | `git checkout -- package.json` — reverts the single modified line |
| 2 | `rm -rf src/shell tools/panels.mjs tools/transpile.mjs tools/build-panel.mjs tests/panels.test.mjs tests/fixtures/panels` |
| 3 | `rm -rf dist/panels` (generated, gitignored) |

**Blast radius: zero.** No tracked file other than `package.json` is modified, so nothing else
needs reverting. No artifact is rebuilt, no lock is touched, no template is edited. A rollback
cannot leave the catalogue in a partially-migrated state because the catalogue is never
touched in the first place.

**The abort conditions** — stop and roll back immediately if any of these occur:

| # | Condition | Why it stops |
|---|---|---|
| A1 | G1 fails for any template | the canonical shell cannot reproduce that shell; the approach needs rethinking |
| A2 | G2 fails | an artifact moved — the change set is not additive after all |
| A3 | `npm test` goes red on `FROZEN_ARTIFACTS` | stop signal per the existing project rule |
| A4 | `npm run verify` fails | a gate invariant broke |
| A5 | `git status` shows any tracked file besides `package.json` modified | the change set leaked |

---

## 5. What Phase 1 deliberately does *not* do

- **No adapter reads a real panel.** The only adapter is the `3xui` identity path.
- **No live polling.** `src/scripts/live.js` is untouched, and `liveUrl` is not emitted.
- **No production template change.** The 15 `layout.html` files are read by G1 and never written.
- **No `build.mjs` change.** The existing pipeline is not entered at all.
- **No new dependency.** The transpiler is hand-written over a closed vocabulary; no parser
  library, no network.
- **No artifact or lock change.** G2 exists to prove it.

---

## 6. Approval request

Approve to proceed and I will implement in this order, checking the gates as I go:

1. `tools/panels.mjs` — registry + interface + validator
2. `tools/transpile.mjs` — the Go emitter
3. `src/shell/canonical.html` — derived, then **G1 run immediately**
4. `tools/build-panel.mjs` + `package.json` script
5. `tests/panels.test.mjs` — G1–G4 wired
6. Run: `npm test` · `npm run verify` · `git diff --stat` · `git status`

**If G1 fails at step 3, I stop there and report** rather than continuing — the canonical shell
would have been shown wrong before it could affect anything.

---

PHASE 1 FOUNDATION PLAN COMPLETE — AWAITING APPROVAL BEFORE ANY FILE IS MODIFIED
