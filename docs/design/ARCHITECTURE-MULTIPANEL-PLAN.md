# Multi-Panel Architecture Plan

**Status: architecture review only. Nothing implemented. No production file modified.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree | branch `feat/v1.2-multitemplate`, HEAD **`a012108`**, `VERSION` 1.1.0 |
| Working tree | 3 audit documents + `tests/explorer.test.mjs` modified; nothing staged |
| Scope | design for PasarGuard + Rebecca support alongside 3X-UI |
| Predecessor | **`PANEL-COMPATIBILITY-AUDIT.md`** — the source audit. This document *builds on* it and does not repeat it. |
| Verdict | **Phase 1 is safe and needs no re-freeze. Phase 2 does not. See §6.** |

> **Read `PANEL-COMPATIBILITY-AUDIT.md` first.** Its §13.1 already contains the
> architecture, §13.2 the normalized schema, §14 the file change map, §15 the frozen-template
> impact, §16 the phase list and §17 the test strategy. This plan consolidates those into a
> decision document, resolves the open questions, and adds the migration order. Where the two
> disagree, this document is later and wins; where this document is silent, the audit stands.
>
> The audit's own conclusion — *multi-panel support is **not approved**, keep Row-Template
> 3X-UI focused* — was correct **as a Phase 0 recommendation**: it answered "should we do this
> now", not "can this be built". This plan answers the second question. The first is still the
> user's to answer, and approving this plan is that answer.

---

## 1. How should multi-panel support be designed?

**As an adapter layer that produces the same data island the runtime already reads, with the
shell transpiled per template engine — not as a second renderer.**

The whole path today is five hops, all shared, none per-template:

```
panel  →  data island (#sub-data, #announce-source, #links-source)
       →  shared runtime JS  (readDocument → model → render/connect/explorer)
       →  shared boot JS     (theme, i18n, brand)
       →  frozen CSS cascade (per template)
       →  shell              (per template, Go-template syntax)
```

Only the **first** hop is panel-specific, and only the **last** is engine-specific. Everything
between is already panel-agnostic and frozen. So the design is:

```
panel (3X-UI | PasarGuard | Rebecca)
      │
      │  A. PANEL ADAPTER            ← NEW, one per panel
      │     reads the panel's native data, emits the island in the normalized shape
      ▼
NORMALIZED SUBSCRIPTION MODEL          ← NEW, one schema
      │
      │  B. SHELL EMITTER            ← NEW, one per ENGINE (Go | Jinja2 | pongo2)
      │     transpiles ONE canonical shell into the engine's syntax
      ▼
SHARED RUNTIME (JS) + FROZEN CSS CASCADE   ← REUSED VERBATIM, byte-identical
      │
      ▼
the existing 15 frozen visual templates
```

**Two adapters, not three.** 3X-UI needs none — it is the reference implementation and its
island is already correct. The shell emitter is per *engine*, not per *panel*: PasarGuard and
Rebecca share one family and differ only in `{% %}` dialect details.

**Why not a second renderer.** A parallel implementation would duplicate the explorer, the
connect dialog, the QR path, the i18n catalogues, the theme switcher and the flag renderer —
roughly 60 KB of shared runtime — and would then drift from it. The frozen artifacts are the
product; the panel layer must feed them, not replace them.

---

## 2. Should we introduce a panel abstraction layer?

**Yes — but a narrow one, and only at the two ends.**

The abstraction is warranted, not speculative, because the three panels genuinely differ in
exactly two places and agree everywhere else:

| Layer | Panel-specific? | Verdict |
|---|---|---|
| Data island | **yes** | needs an adapter |
| Shell syntax | **yes** | needs a transpiler |
| Boot JS | no | unchanged |
| App JS (runtime) | no | unchanged |
| CSS cascade | no | unchanged |
| Locales | no | unchanged |
| Fonts / vendor | no | unchanged |

**What the abstraction must NOT do.** It must not become a plugin framework, must not gain a
config file per panel, and must not touch the runtime's `readDocument()` contract. The
canonical names in §4 are chosen to be the ones the runtime **already understands**, so the
island the adapters emit is the island the runtime already reads — `model.js` needs no change.

**The one honest exception.** `src/scripts/live.js:77` hard-codes
`win.location.pathname + '?format=info'`. Both new panels put the payload on a path suffix
(`/sub/<token>/info`), not a query parameter. That single line is the only place where the
"panel-agnostic runtime" is not actually panel-agnostic. See §6.

---

## 3. What common data model should exist?

**The existing one.** The runtime's 34-key island contract is already the neutral schema — it
was designed for 3X-UI, but nothing in it is 3X-UI-specific. The normalized model is therefore
the current contract plus two additive keys:

| New key | Type | Why |
|---|---|---|
| `panel` | `"3xui" \| "pasarguard" \| "rebecca"` | lets the UI vary wording, and makes a mis-paired artifact detectable |
| `liveUrl` | string, optional | the poll endpoint, emitted by the shell, so the runtime need not guess |

Full field-by-field mapping (3X-UI / PasarGuard / Rebecca, with fallbacks) is in
`PANEL-COMPATIBILITY-AUDIT.md` §13.2 and is **not duplicated here**. Its honesty rules are
binding on any implementation:

- `downloadByte`/`uploadByte` carry the **combined** counter and `0`, because that is what both
  panels' own `subscription-userinfo` header reports. The UI displays only the combined `used`,
  so **no fabricated split is ever rendered.**
- `online` is emitted **only** when the panel supplies a last-seen timestamp. It is never
  synthesised from traffic activity.
- `announce`, `datepicker`, plan name and reset strategy are **omitted**, never defaulted to a
  misleading value. Rebecca has no announce concept at all — a clean `UNSUPPORTED`.
- `expire` keeps the runtime's documented semantics (`0` = never, negative = first use).
  PasarGuard's `on_hold` is a **distinct state** and must be decided explicitly, not folded
  into "first use".

---

## 4. Which parts must remain panel-agnostic?

These are **frozen and must not learn about panels**:

| Path | Why |
|---|---|
| `src/styles/**`, `src/templates/*/*.css` | the visual product; a panel branch here is a design regression |
| `src/locales/**` | the five catalogues; panel wording belongs in the island, not the catalogue |
| `src/fonts/**`, `src/vendor/**` | byte-identical payload |
| `src/scripts/{render,connect,explorer,config,qr,clients,i18n,brand,flag,clipboard,format,url,boot,detect,main}.js` | the shared runtime; **no panel branch may enter these** |
| `src/scripts/model.js` | **only if** the island gains a key — and the plan avoids that by using the existing contract |
| `src/templates/*/layout.html` | 15 frozen shells; the canonical shell is a *new* source, not a rewrite of these |

`src/scripts/live.js` is the sole exception, and it is deferred to Phase 2 (§6).

---

## 5. Which files would need modification?

See **FILE CHANGE MAP** below. The short version: **Phase 1 adds six new files and modifies
two, and changes zero artifact bytes.**

---

## 6. Estimated byte / build impact

This is the section that decides the plan. The artifact is a **single self-contained file** —
CSS + boot JS + app JS + locales + shell, all inlined, no runtime include. Therefore:

> **Any edit to any file concatenated into an artifact changes every artifact that includes it.**

| Change | Artifacts affected | Byte-locks |
|---|---|---|
| Add a new file to `APP`/`BOOT` | **all 15** | 15 re-baseline |
| Edit any `src/scripts/*.js` | **all 15** | 15 re-baseline |
| Edit `src/styles/*.css` | Row only | 1 re-baseline |
| Edit one `src/templates/<id>/*.css` | that template only | 1 re-baseline |
| Edit `src/index.html` | **none** — dead fallback, unused by all 15 | **0** |
| Edit one `src/templates/<id>/layout.html` | that template only | 1 re-baseline |
| Add a template to the registry | none | 0 |
| **Add a build target writing to a new output tree** | **none** | **0** |

### The two phases, priced

| Phase | Scope | Artifact drift | Locks |
|---|---|---|---|
| **Phase 1** | canonical shell + transpiler + adapters + new build target | **zero** | **none** |
| **Phase 2** | live polling (`live.js` endpoint resolution) | **all 15 artifacts** | **all 15 re-baseline** |

**Phase 1 is free.** The adapters and transpiler are new files; the panel build is a new target
writing to `dist/panels/<panel>/<template>/`; the default target and its output are untouched.
Verified against the table above: nothing in the Phase 1 change set is a concatenated file.

**Phase 2 is not free, and must not be smuggled into Phase 1.** It edits `src/scripts/live.js`,
which is inlined into all 15 artifacts, so it re-baselines every byte-lock — and the binding
template `pulsenova` is at **204,542 B with only 258 B of headroom**, so a Phase 2 edit must
also fit in 258 bytes or reclaim room first.

### Build cost

| | |
|---|---|
| New build targets | 2 panels × 15 templates = **30 artifacts** |
| Build time | linear in templates; the existing 15 already build in seconds |
| Repo growth | `dist/panels/**` is generated and gitignored, as `dist/` is today |

---

## 7. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Transpiler is not byte-exact** for the Go path, silently breaking the locks | **critical** | P1's golden test: transpile the canonical shell to Go and assert byte-identity against all 15 committed artifacts **before** the canonical shell replaces anything. If it cannot, fall back to per-engine hand-authored shells. |
| R2 | Phase 2 gets bundled into Phase 1 | **critical** | Phase 2 is a separate approval with its own re-baseline and byte-diff review. It is not a compatibility decision. |
| R3 | PasarGuard `panel-main` **does not compile** (13 Python-2 `SyntaxError`s) | high | Blocks *runtime* validation only, not static contract analysis. P3 is blocked until a compiling tree exists. |
| R4 | Escaping gaps in Jinja2 / pongo2 (`|safe`, `autoescape` off) | high | §17.6 escaping tests: feed `"`, `'`, `<`, `>`, `&`, `javascript:`, a `data:` URI; assert no attribute breakout and no navigable script URL. |
| R5 | Adapter fabricates data (invented upload/download split, synthesised `online`) | high | The §3 honesty rules, each pinned by a test asserting **omission, not defaulting**. |
| R6 | Live polling degrades badly on the new panels | medium | Poller halts gracefully; server-rendered values stand. Phase 1 ships **without** polling. |
| R7 | Panel artifacts drift from the frozen CSS/runtime | medium | Embed both **byte-identically** from the same sources; add a parity test. |
| R8 | 258 B headroom blocks any later runtime work | medium | Phase 1 adds no runtime bytes. Any Phase 2 must fit, or reclaim room first. |
| R9 | A panel artifact silently fails its structural gate | medium | Reuse the `verify.mjs` invariants (1 `<style>`, 3 `<script>`, doctype head, `</html>` tail, no unsubstituted placeholders) against panel output. |
| R10 | Rebecca's `online_at` is a **string**, not a number | low | Covered by an adapter unit test with the real recorded payload shape. |

---

## MIGRATION PLAN

Ordered so that **every phase before P6 changes zero artifact bytes**, and the one phase that
does is explicitly gated.

| Phase | Scope | Drift | Gate to leave the phase |
|---|---|---|---|
| **P0** | This plan + the source audit | none | approval of this document |
| **P1** | Canonical shell source + transpiler | none | **golden test: Go output byte-identical to all 15 committed artifacts** |
| **P2** | Normalized model + adapter interface + recorded-payload fixtures | none | adapter unit tests green against real payloads |
| **P3** | PasarGuard adapter + Jinja emitter + build target + structural gate | none | blocked by R3 until the panel compiles |
| **P4** | Rebecca adapter + pongo2 emitter + build target + structural gate | none | adapter + escaping tests green |
| **P5** | Installer: per-panel activation strategy, verification, docs | none | installer suite green |
| **P6** | *(optional, separately approved)* live polling | **all 15 re-baseline** | design-workstream sign-off + byte-diff review |
| **P7** | Runtime validation on real servers | none | real-panel smoke pass |

**P1 is the keystone.** If the transpiler cannot reproduce the current shells exactly, the
canonical-shell approach is wrong and the fallback is two hand-authored engine-specific shells
per template — more duplication, still zero drift. Either way the frozen artifacts survive.

**Ordering rationale.** P1 before P2 because the shell is the riskiest surface and it is
testable in isolation against a known-good oracle (the committed artifacts). P3 before P4 only
because PasarGuard is the harder engine case; if P3 is blocked by R3, P4 may proceed first.

---

## FILE CHANGE MAP

### A. New files — Phase 1, zero drift

| Path | Kind | Purpose |
|---|---|---|
| `src/shell/` | new dir | canonical, engine-neutral shell source |
| `tools/transpile.mjs` | new | Go-template → Jinja2 / pongo2 transpiler for the closed 27-action vocabulary |
| `tools/panels.mjs` | new | panel registry + adapter descriptors |
| `tools/build-panel.mjs` | new | emits `dist/panels/<panel>/<template>/template.html` |
| `tests/panels.test.mjs` | new | adapter + transpiler + golden-artifact tests |
| `tests/fixtures/panels/` | new | recorded native payloads per panel |

### B. Existing files that change — and what it costs

| Path | Change | Drift |
|---|---|---|
| `tools/build.mjs` | register a new target | **additive if the default path and output are untouched**; any change to `APP`/`BOOT` content changes all 15 |
| `tools/templates.mjs` | expose the registry to the panel builder | read-only → none |
| `tests/build.test.mjs` | new `FROZEN_ARTIFACTS` rows for panel artifacts | additive rows; existing rows untouched |
| `installer/lib/row-template.sh` | per-panel activation | no artifact drift |
| `src/scripts/live.js` | **Phase 2 only** | **all 15 re-baseline** |
| `src/scripts/model.js` | **only if** the island gains a key | **all 15 re-baseline** |
| `src/index.html`, `src/templates/*/layout.html` | **only if** the canonical shell replaces them | affected artifacts re-baseline |
| `VERSION`, `CHANGELOG.md` | release bookkeeping | none |

### C. Explicitly NOT to be touched

`src/styles/**` · `src/templates/*/{tokens,base,layout,components,rtl}.css` · `src/locales/**` ·
`src/fonts/**` · `src/vendor/**` ·
`src/scripts/{render,connect,explorer,config,qr,clients,i18n,brand,flag,clipboard,format,url,boot,detect,main}.js`

---

## Open questions this plan does not decide

1. **Does Phase 2 happen at all?** It is the only change that re-baselines the catalogue. The
   honest default is **no**: Phase 1 ships a complete product without live polling, and the
   server-rendered figures are correct.
2. **`on_hold` semantics.** PasarGuard's `on_hold` is a distinct state. Mapping it to `expire`
   needs an explicit product decision, not an adapter guess.
3. **Per-admin template selection.** Both new panels support it; 3X-UI does not. Whether the
   product exposes it is a product question.
4. **A compiling PasarGuard tree** (R3) is a hard prerequisite for P3.

---

ARCHITECTURE REVIEW COMPLETE — AWAITING APPROVAL BEFORE ANY IMPLEMENTATION
