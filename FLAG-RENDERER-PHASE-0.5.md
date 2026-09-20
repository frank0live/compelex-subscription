# Flag Renderer — Phase 0.5 Addendum

**Workstream:** CHAT 3 — Flag Rendering / Country Flag System
**Status:** cost study. No production source, test, build, template, installer or version file was modified.
**Supersedes:** §8 of `FLAG-RENDERER-AUDIT.md` (the freeze-accounting section only). Every other finding in Phase 0 stands.

> ## Coverage model reconciliation — SIX GRADIENTS ARE A SELECTION, NOT A LIMIT (added 2026-09-20)
>
> **Read the Phase 1 status block below with this correction in hand.** §F and §G of this
> document search for the largest country set that fits a byte band, and the set finally taken
> was **6**. That number is the size of the *CSS renderer*, not of *country support*. This
> block supplies the distinction. Nothing below is rewritten; every snapshot measurement in
> this document stands as measured.
>
> ### The actual final behaviour
>
> | | Count | Behaviour |
> |---|---|---|
> | **Total assigned country codes** | **258** | every one resolves to a flag badge |
> | CSS gradient rendered | **6** | `DE FR NL JP SE US` |
> | Remaining assigned countries | **252** | keep the **native platform emoji flag** |
> | … of those, becoming a monogram | **0** | **none — never** |
> | Unassigned / invalid codes | — | continue to use the existing **monogram** fallback |
>
> **Six CSS gradients are fidelity-selected premium renderings, not coverage limits.**
>
> §F's coverage tables are therefore not a statement that 252 countries are unsupported. The
> renderer is **progressive enhancement**, exactly as §B describes: `CODES` decides whether a
> pair is a real country at all, and `FLAGS` decides whether that country can be drawn
> *faithfully* without an image. A code absent from `FLAGS` is not uncovered — `paintFlag()`
> returns before painting and the badge keeps the emoji its platform already renders, which is
> the unchanged path. §F's exclusion list (`GB, HK, CN, SG, CA, KR, SA, IN, TW, VN, MY, BR`)
> is a list of flags that no gradient primitive draws faithfully, not a list of gaps.
>
> **Measured, not asserted.** A sweep of all 258 assigned codes through the real `flagOf` and
> the real badge path returns **258 flags, 0 monograms**.
>
> ### Final verification evidence
>
> The coverage model is now pinned by tests in `tests/explorer.test.mjs`, which read the
> **shipped source** — decoding the same 85-byte `CODES` bitmap the runtime decodes — so the
> test list and the runtime cannot disagree:
>
> | Test | What it proves |
> |---|---|
> | `every covered flag paints its own gradient over an intact text node` | the **six CSS flags individually** — each paints its own exact gradient, keeps its text node, and is never a monogram. Previously only `DE` and `US` were asserted. |
> | `a country without a gradient keeps a real flag badge and is never a monogram` | the **emoji fallback countries** — `TR IR GB CA AE SG KR CN IN BR HK` |
> | `every assigned code in the registry renders a flag and never a monogram` | the **exhaustive 258-code registry sweep** — the permanent proof of coverage |
> | `an invalid code still falls to the monogram and never to a gradient` | the **invalid-code monogram fallback** — `ZZ XX QQ`, routed through `flagOf` first |
>
> `tests/explorer.test.mjs` went **23 → 27 tests**; all pass. No production file changed: the
> addition is tests-only, **+100 insertions / 0 deletions**, and all 15 artifacts remain
> byte-identical to their committed locks.
>
> ### What this does *not* change
>
> Every measurement in §A–§J is untouched and still correct **as a snapshot value**. §D's
> prototype costs, §E's fidelity verification and §J's platform table all hold. The binding
> figure is unchanged: `pulsenova` **204,542 B**, **258 B** headroom.

> ## Phase 1 status — IMPLEMENTED AND COMMITTED (added 2026-09-20)
>
> **This document is a snapshot and is left intact.** Every byte figure, hash and lock
> count in it remains the value actually measured on 2026-09-18 and is *not* rewritten.
> What follows records only what has changed since, so the snapshot stays honest and the
> current numbers are on the record beside it.
>
> **The verdict this document reaches — §J13, "WAIT FOR LARGER SHARED-RUNTIME
> HEADROOM" — has been superseded by an explicit decision to implement.** The renderer
> shipped on 2026-09-20.
>
> ### Current state
>
> | | Snapshot (this document) | After the `CODES` bitmap | **Now (shipped)** |
> |---|---|---|---|
> | `pulsenova` | 204,417 | 203,652 | **204,542** |
> | Binding headroom | **383 B** | 1,148 B | **258 B** |
> | `CODES` representation | 907 B list | 292 B bitmap | 292 B bitmap |
> | Commits | none (all staged) | `46abb7e` | **`a012108`** |
>
> Tree: `feat/v1.2-multitemplate` @ **`a012108`**, `VERSION` 1.1.0, nothing pushed, no tag.
> The renderer is `4a95cbc`; the deterministic preview refresh is `a012108`.
>
> ### What was taken, and how it compares with §F and §G
>
> | | This document predicted | **Actually shipped** |
> |---|---|---|
> | Set at `n = 6` | `DE FR NL JP RU UA` | **`DE FR NL JP SE US`** |
> | Net cost at `n = 6` | **+553 B** | **+890 B** |
> | Tightest headroom after | −20 B (over the ceiling) | **258 B** (under it) |
>
> **The set differs, and so does the cost.** `RU` and `UA` — cheap 3-band geometries —
> were not taken; `SE` (Nordic cross, 154 B in §E) and `US` (canton + stripes, 111–117 B)
> were, and both are the expensive end of the per-flag range this document measured. §6 of
> the audit requires those two to be signed off individually, and they were, as documented
> in the source comment.
>
> The **+890 B** against a predicted **+553 B** is a 337 B miss, and it decomposes exactly:
> the `flag.js` built section grew 1,250 → 2,108 B (**+858** — 507 B of `FLAGS` literal,
> 350 B of `paintFlag()` and the forced-colors guard, 1 B of separator), and the
> `explorer.js` call site adds **+32 B**. The implementation also writes
> `style.color = 'transparent'` alongside the background — a detail §D and §E did not
> model, and a deliberate one: keeping the text node preserves the badge's geometry.
>
> ### The `CODES` bitmap landed — at 615 B, not 649 B
>
> §F and §J11 price the bitmap at **−649 B**. Measured on the real artifact it is
> **−615 B**, uniformly across all 15 templates: the packed block is **292 B**, not the
> 258 B predicted, because the decoder costs ~176 B rather than ~142 B. It still clears
> §13's "net ≤ −600 B" bar, and it still lands before the renderer, exactly as §J13's
> sequenced recommendation required. Confirmed: 85 bytes, 258 codes, 116-character
> base64, `ZW` preserved.
>
> ### What this does to §G's bands
>
> §G asks which cost bands fit. Against the **258 B** now available, **no band fits** —
> not even §G's narrowest, `< +383 B` (n = 3 at +382 B), which this document already
> rejected as landing on the line. The bands are not invalidated; they are simply moot,
> because the headroom they were measured against (383 B, then 533 B) was consumed by the
> bitmap's reclaim being spent on a renderer that costs more per flag than the 77.8 B mean.
>
> ### What is unchanged
>
> §B (progressive enhancement), §C (`flagOf()` keeps its shape), §E's validity, RTL,
> security and `verify.mjs` findings, and §J3's proof that uncovered flags do not regress
> all hold as written, and the shipped implementation matches them. `CODES` was retained
> and is load-bearing, exactly as §B and §J11 insist.
>
> **Full detail — the shipped file list, the seven §13 requirements, the per-artifact size
> table and the lock accounting — is in the Phase 1 status block of
> `FLAG-RENDERER-AUDIT.md`.**

> **Phase 0.6 note.** `FLAG-RENDERER-AUDIT.md` has since been rewritten so that it is
> internally consistent with this document. In particular the audit no longer recommends
> an SVG-first architecture; it adopts **family B — progressive enhancement by CSS
> gradient** — as the recommended shape, keeps `flagOf()` returning the regional-indicator
> pair, keeps `CODES` as the load-bearing validity source, and carries three new sections:
> the **flag fidelity rule**, the **`CODES` bitmap approval requirements**, and the
> **Pulse Nova line-ending defect**. This Phase 0.5 document remains authoritative on all
> measurements; nothing in it needed correcting.
>
> ---
>
> ### Current state — the freeze prerequisite is satisfied (added 2026-09-18)
>
> **The catalogue is now finalized, and this document is still a snapshot.**
>
> This document is a **historical cost study**, measured against the tree at
> `2026-09-18T01:53:04Z`. Every byte figure, hash and lock count in it is a **snapshot
> value** and is retained unaltered, because rewriting them would misrepresent what was
> actually measured.
>
> What has changed since, at HEAD `347f828`:
>
> | | At this snapshot | Now |
> |---|---|---|
> | Core templates | 15 | **15** |
> | Byte-locked | 14 of 15 | **15 of 15** |
> | `FROZEN_ARTIFACTS` rows | 10 | **11** |
> | Exact byte / SHA assertions | 14 / 14 | **15 / 15** |
> | Total lock assertions | 28 | **30** |
> | Unlocked templates | `arcadenova` | **none** |
> | Repository | no commits, all files staged | committed; HEAD `347f828`, tags `v1.0.0` + `v1.1.0`, `VERSION` 1.1.0 |
>
> `arcadenova` — described throughout this document as **provisional and not
> byte-locked** — has since been **frozen with size + SHA** (203,310 B, sha
> `861577d2…`), so it is no longer the unlocked exception. `pulsenova`'s line-ending
> defect is also resolved: its frozen lock is the clean-checkout LF figure, 204,267 B,
> not the 204,417 B working-tree figure quoted below.
>
> **The catalogue-freeze prerequisite is therefore satisfied.** That removes the
> *catalogue* blocker only. It does **not** authorize implementation, does not
> finalize the country set, and does not discharge the `CODES` bitmap requirement.
> `FLAG-RENDERER-AUDIT.md` §16 remains the recommendation, and its answer is still
> **DO NOT IMPLEMENT** until an explicit decision is recorded.
>
> Where this document and the audit disagree on **freeze accounting**, the audit's
> current figures (§9.3) are the later measurement. On every other question — all
> cost, coverage and fidelity measurements — **this document remains authoritative.**

**Snapshot:** `2026-09-18T01:53:04Z` (05:23:04 +0330)
`tests/build.test.mjs` — 42,762 bytes, mtime `2026-09-18 04:53:04 +0330`, sha256 `8cdebf24f4d9866ce7849c4e3039260aadc4253f0d15ea37826c48140ab1865d`
`VERSION` = 1.1.0 · branch `feat/v1.2-multitemplate` · repository has **no commits** (all files staged as `A`)

**Provisional:** `dist/templates/arcadenova/template.html` = **203,310 B**. Its `components.css` was written at `05:17:17` and its `layout.css` at `05:08:58` — both *during* this study. **Arcade Nova is not the binding authority.** Pulse Nova (`pulsenova`) is the binding frozen template and is used as such throughout. **At the snapshot its working-tree artifact read 204,417 B (383 B headroom); the defect is now resolved and the frozen artifact is 204,267 B, so the current binding headroom is 533 B.** Every 383 B figure in this document is therefore a *conservative* snapshot value: conclusions drawn against it still hold against 533 B.

**Throwaway prototypes** live in `C:\Users\itzse\AppData\Local\Temp\flagaudit\` and `D:\Temp\flagaudit\` — both outside the repository, untracked, deletable at any time.

---

## A. Corrected freeze / lock accounting

> **Historical.** The figures in this section describe the tree at the snapshot. The
> current accounting is **15 / 15 / 15 / 30** — see the current-state note at the top.

Phase 0 stated "13 of 15 artifacts are pinned", "4 individual locks + 10 `FROZEN_ARTIFACTS` rows", and later "46 lock assertions". **All three were wrong.** Enumerated from the live file:

### 1–2. Every template with an exact byte / exact SHA assertion

**Individual tests (4).** Each asserts a byte length *and* a SHA-256, on separate lines.

| # | Template | Byte assertion | SHA assertion | Test at line |
|---|---|---|---|---|
| 1 | `row` | `202976` (L137) | `2120e116…751cf6` (L140) | 132 |
| 2 | `editorial` | `203587` (L241) | `97e32111…cc58ed` (L245) | 238 |
| 3 | `canvas` | `203476` (L528) | `2c5c3892…7970f2` (L530) | 525 |
| 4 | `pulsenova` | `204417` (L613) | `3285990b…293c0f` (L617) | 610 |

**`FROZEN_ARTIFACTS` table (10 rows, L843–852).** The loop at L855–867 runs one `test()` per row and performs a byte assertion (L858) and a SHA assertion (L862).

| # | Template | Bytes | SHA (prefix) |
|---|---|---|---|
| 5 | `prism` | 202994 | `1350083b…3fdb0c` |
| 6 | `terminal` | 202522 | `26c55b8c…023e2` |
| 7 | `pulse` | 202977 | `e14e52ce…21a8fa` |
| 8 | `brutal` | 202893 | `8a3a7a71…5ab950` |
| 9 | `arcade` | 202862 | `f806642e…1b70b0` |
| 10 | `sketch` | 202991 | `02195a35…53dceb` |
| 11 | `signature` | 202795 | `7a7e5847…adf7ac` |
| 12 | `saffron` | 202226 | `6dc64cc0…a6431f` |
| 13 | `prismnova` | 202967 | `992978bd…5d5b85` |
| 14 | `terminalnova` | 202944 | `4390867f…d8a3` |

### 3–6. Representation and overlap

- **Individual tests represent:** `row`, `editorial`, `canvas`, `pulsenova`.
- **`FROZEN_ARTIFACTS` represents:** `prism`, `terminal`, `pulse`, `brutal`, `arcade`, `sketch`, `signature`, `saffron`, `prismnova`, `terminalnova`.
- **Overlap: none.** The two sets are disjoint — no template appears in both. (The Phase 0 "46" arose from adding 10 rows × 2 to 13 × 2, double-counting the ten table rows.)
- **Total unique byte-locked templates: 14 of 15** *at the snapshot*. `arcadenova` was the only template with no byte lock; its lock was deferred to the freeze phase. **That deferral is now complete — it is frozen, so the current figure is 15 of 15.**

### 7–8. Assertion counts

| | Count |
|---|---|
| Exact byte assertions | **14** (4 individual + 10 loop iterations) |
| Exact SHA assertions | **14** (4 + 10) |
| **Total exact lock assertions** | **28** |

### 9. Assertions a shared-runtime re-freeze would actually invalidate

`flag.js` is concatenated into the shared app script, so **every** artifact changes:

| Assertion class | Count at snapshot | **Current** | Invalidated by a shared-runtime change? |
|---|---|---|---|
| Exact byte assertions (4 individual + 10 loop) | **14** | **15** (4 + 11) | **Yes — all of them** |
| Exact SHA assertions (4 individual + 10 loop) | **14** | **15** (4 + 11) | **Yes — all of them** |
| **Total** | **28** | **30** | **30** |
| `the committed artifact is not stale` (L114) | 1 | 1 | Only if `template/index.html` is *not* regenerated — a regeneration gate, not a lock |
| Budget inequalities (`<= 200 * 1024`, `<= 203 * 1024`) | 24 | 24 | Only those whose template crosses the line — magnitude-dependent |
| Shared-section parity (boot / locales / app / shell byte-for-byte) | — | — | **No** — they compare templates to each other |
| Installer / release suites | — | — | No exact artifact-size or hash pins exist (`release.test.mjs` uses `<=`, `installer.test.mjs` builds its own fixtures) |

**Corrected figure: 28 lock assertions, not 46** — *at the snapshot*. **The current figure is 30**, because `arcadenova` has since gained the 11th `FROZEN_ARTIFACTS` row. The regeneration gate and the budget inequalities are additional consequences, not lock re-baselines.

### Also corrected from Phase 0

- `CODES` holds **258** codes, not 261. Measured: block **907 B**, bare code list **773 B**, `new Set((` + `.split(' '))` wrapper **134 B**.

---

## B. Progressive-enhancement architecture

Phase 0 assumed `registry miss → monogram`. That was the wrong branch. The correct tree is:

```
regional-indicator pair detected and assigned (CODES)
        │
        ├── pair present in FLAGS  ──►  paint the badge (gradient flag)
        │
        └── pair absent from FLAGS ──►  badge.textContent = the emoji pair
                                        (exactly today's behaviour)

no assigned pair at all            ──►  monogram (unchanged)
```

The mechanism is deliberately trivial: the badge already receives `cfg.flag` as text. The enhancement adds one conditional assignment beside it and never removes the existing path.

**The structural consequence is that `CODES` must stay.** `flagOf` is the test for "is this a real country", and it must keep returning the emoji for every assigned code. If `CODES` were replaced by the (smaller) renderer registry, uncovered-but-valid flags would fall to the monogram instead of the emoji — a genuine regression. **Under progressive enhancement the renderer registry is strictly additive and `CODES` is load-bearing.** This reverses the Phase 0 suggestion that reclaiming `CODES` could fund the change.

---

## C. `flagOf()` public shape — preserved, and it is also the cheapest option

The user's instinct was right, and the measurement makes it unambiguous.

**Keep `flagOf(text)` returning the regional-indicator pair.** Key the registry by that pair:

```js
const FLAGS = {
  '🇩🇪':'linear-gradient(#000 0 33%,#D00 0 67%,#F00 0)',
  …
};
```

| Option | Extra code | Registry cost/flag | Verdict |
|---|---|---|---|
| **Key by the emoji pair** | **0 B** | ~78 B (pair costs 8 B UTF-8 vs 2 B ASCII) | **chosen** |
| `flagCode(flag)` helper + ASCII keys | ~110 B | ~71 B | pays 110 B to save ~7 B/flag; break-even ≈ 16 flags — never reached |
| `flagInfo(text)` → `{code, flag}` | ~180 B + per-row allocation | ~71 B | worst of both |

Choosing on bytes and regression risk, not elegance:

- **`src/scripts/config.js` needs no change** — `flag: flagOf(name)` stays correct.
- **`tests/flag.test.mjs` needs no change** — all 10 tests still pass verbatim.
- **`tests/config.test.mjs` needs no change** — the three `'🇺🇸'` / `'🇩🇪'` / `'🇷🇺'` assertions still hold.
- The **only** runtime file that changes is `explorer.js`, by **+69 B**.

That is the minimum possible blast radius: one function body in one file, plus one additive constant.

---

## D. Cheaper renderers — four prototypes, measured

All figures are built bytes, compiled through an emulation of `tools/build.mjs` (comment stripping, module-syntax stripping, banner). `explorer.js` delta measured as a real string diff.

| # | Family | Fixed floor (0 flags) | Registry cost/flag | Notes |
|---|---|---|---|---|
| **A** | CSS gradient, ASCII key, `flagCode()` + `flagPaint()` functions, HC guard | **400 B** | ~55 B | 209 B more floor than B for no benefit |
| **B** | **CSS gradient, emoji key, inline paint in `explorer.js`, HC guard** | **191 B** | ~78 B | **winner** |
| C | Same as B, no forced-colors guard | 174 B | ~78 B | 17 B cheaper; badge becomes an **empty box** in Windows High Contrast |
| D | Compact band spec + runtime expander (`h000D00F00` → gradient) | 996 B | ~18 B | break-even vs B at ≈ 13 flags; both far over budget by then |
| E | Minimal DOM SVG, bands + disc + Nordic cross | ~1,589 B | ~18 B | **additionally disqualified — see below** |

**The Phase 0 SVG prototype was not merely general — it was structurally worse.** Two independent findings:

1. **Identifier collision.** After concatenation every module shares one scope. `shape` is already declared in `i18n.js`, `live.js` and `model.js`; `paint` in `boot.js`, `detect.js` and `main.js`. A `const shape` / `function paint` in the new module is a **duplicate declaration → SyntaxError → the page never boots**, and no unit test would catch it because the tests import modules individually rather than the concatenated artifact. The SVG family must rename both. (`FLAGS`, `HC`, `flagPaint`, `flagCode`, `SVGNS`, `hex` are all free.)
2. **The expansion cost is irreducible.** Building DOM nodes with attribute objects costs ~1,000 B of code to save ~60 B/flag — a trade that only pays above ~30 flags, by which point the artifact is 2 KB over the ceiling.

**A third finding applies to every family:** `matchMedia` does not exist in Node, and `flag.js` is imported directly by `tests/flag.test.mjs`, `tests/config.test.mjs` (via `config.js`) and `tests/explorer.test.mjs`. A bare module-level `const HC = matchMedia(…)` throws `ReferenceError` on import and **takes the whole suite down**. The guard is mandatory and costs 49 B:

| Guard | Module bytes (n=0) |
|---|---|
| bare `matchMedia` | 73 |
| `typeof matchMedia === 'function' ? … : { matches: false }` | 129 |
| **`try { HC = matchMedia(…) } catch (err) {}`** | **122** ← cheapest, and matches the existing `prefersLight()` precedent in `boot.js` |

**Fourth finding:** `tests/explorer.test.mjs` drives the row builder with a hand-rolled DOM whose `El` class has **no `style` property**. `badge.style.background = …` would throw `TypeError` and break that suite. The fixture needs `this.style = {};` in the `El` constructor — **9 bytes in the test file, zero artifact bytes.** A test can then assert the painted value directly. (The SVG family would additionally need `createElementNS` on the fake document.)

---

## E. CSS-gradient option — evaluation

### Built byte cost

Measured across the 29 candidate flags: **mean 77.8 B per flag** including key, quotes and trailing comma.

| Cost tier | Flags | Bytes/flag | Examples |
|---|---|---|---|
| 2-band | UA, PL, ID, MC | 50 | `linear-gradient(#05B 0 50%,#F00 0)` |
| 3-band | DE, NL, RU, AT, HU, BG, EE, LT, IR | 61 | `linear-gradient(#000 0 33%,#D00 0 67%,#F00 0)` |
| disc | JP, BD, LA | 57–68 | `radial-gradient(circle,#BC0 0 42%,#FFF 0)` |
| layered | AE, US | 111–117 | canton + `repeating-linear-gradient` |
| crescent | TR | 144 | two offset radial gradients |
| Nordic cross | SE, FI, DK | **154** | two hard-stop linear layers + field |

### Validity — verified, not assumed

Every one of the 29 literals was parsed with `css-tree`:

- **all 29 parse as a valid `background:` declaration**;
- the colour-layer rule (a colour may appear only in the final layer) **holds for all 29**;
- layer counts: 1 layer for bands/discs, 2 for AE/US, 3 for SE/FI/DK/TR.

This matters because an invalid literal is silently dropped by the CSSOM, leaving an empty box with no text — the exact failure mode the design is meant to prevent.

### Forced colors

**This is the one real hazard.** In forced-colors mode Chromium forces `background-image: none`, so a gradient-only badge becomes an **empty box**. Today's badge shows letters, which is degraded but legible.

Mitigation: the 49 B `matchMedia('(forced-colors: active)')` guard, read at paint time (the MQL object updates live, so toggling High Contrast without a reload is handled). Under High Contrast the badge keeps its emoji text — i.e. **today's behaviour, exactly**. Cost: 49 B. Worth every byte; without it the design has a mode where the badge is blank.

### RTL

**No impact.** `90deg` is a physical angle; CSS backgrounds are not affected by `direction` or `dir`. `src/styles/rtl.css` contains no `.cfg-flag` rule, and `dir` is set only on `<html>` and `.cfg-name`. Flags therefore render identically in LTR and RTL, and — importantly — they do **not** mirror, which is correct: national flags are not mirrored for RTL locales.

### Existing badge geometry

`.cfg-flag` is a fixed square box (30 / 32 / 34 px / 2 rem depending on template) with `display: grid; place-items: center; overflow: hidden`. A gradient fills that box, so the flag is drawn **1:1 rather than 3:2**.

- Horizontal-band flags (DE, NL, RU, AT, HU, BG, EE, LT, IR, PL, UA, ID, MC): bands simply become taller. **No distortion** — visually correct.
- Vertical-band flags (FR, IT, BE, IE, RO): each band becomes 1.5× wider relative to its height. **Mild, acceptable** at 32 px.
- Discs (JP, BD): a centred circle stays a circle. **Correct.**
- Crosses (SE, FI, DK): the cross bars scale with the box; the cross stays a cross. **Correct.**

No template's CSS needs to change. `border-radius` and `overflow: hidden`, where present, clip the gradient to the existing rounded square — which is how the box already looks with a monogram.

### Security

- **No user-controlled CSS.** Every value is a static literal in a shared module. The only input is `cfg.flag`, which `flagOf` derives by arithmetic from regional-indicator code points and validates against `CODES`.
- `FLAGS[cfg.flag]` cannot reach `Object.prototype`: the key is always exactly two code points from `U+1F1E6`–`U+1F1FF`, so it can never be `__proto__`, `constructor`, `prototype` or any other inherited name. No `Object.hasOwn` guard is needed.
- The write is a **CSSOM property assignment**, not markup. `innerHTML` / `outerHTML` / `insertAdjacentHTML` remain forbidden and unused. There is no parsing step, so there is no injection surface at all.
- No network, no font fetch, no external reference. The "reaches for nothing" property is preserved.

### `verify.mjs` — does it permit the resulting source?

Checked rule by rule against family B:

| Rule | Result |
|---|---|
| `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval(` / `new Function(` / `document.write` | not used ✅ |
| `sourceMappingURL`, `localhost`, `127.0.0.1`, dev-machine path, `row-dev` | absent ✅ |
| CDN patterns (`jsdelivr\|unpkg\|cdnjs\|googleapis\|gstatic\|cdn.`) | absent ✅ |
| `no remote references` — only `http://www.w3.org/2000/svg` allowed | **no URL of any kind appears** ✅ |
| exactly 1 `<style>` and 3 `<script>` | unchanged — code is added inside the existing app script ✅ |
| branding block substitutable | untouched ✅ |
| template actions balance / 22-key model | untouched ✅ |
| sources carry no invisible characters | regional indicators are `U+1F1E6`–`U+1F1FF`, **not** in the `INVISIBLE` set ✅ |
| build's comment stripper (no code after a closing comment) | comments are on their own lines ✅ |

The design passes the gate unmodified. **One optional hardening:** add `foreignObject`, `xlink:href` and `<animate` to `FORBIDDEN`. Nothing in the design uses them; the guard would make that permanent.

### Reset / cleanup

**None is required, and that is verifiable.** `buildList()` is guarded by `if (!host || host.firstElementChild) return;` and `relabel()` touches only `.cfg-name` and button labels — the badge is created once and **never rebuilt or repainted**. A painted badge keeps its gradient; a fallback badge keeps its emoji; neither state can follow the other.

`|| ''` is retained as 10 B of defensive insurance in case rows are ever rebuilt, and because `style.background = undefined` would coerce to the string `"undefined"` (invalid, ignored) rather than clearing the declaration.

---

## F. Cumulative country-set cost

Family B (emoji-keyed CSS gradient, inline paint, `try/catch` guard). "Removed" is 0 B under progressive enhancement because `CODES` must be retained (§B); the right-hand column shows the alternative where `CODES` is additionally packed into a 116-byte base64 bitmap (**−649 B**, round-trip verified exact against all 258 codes).

`over` = templates exceeding 204,800 B. `under1KB` = templates with less than 1 KB of headroom. Frozen set = 14 (arcadenova excluded).

| n | Codes covered | Registry | Renderer module | Removed | **NET** | Tightest headroom | over | under1KB |
|---|---|---|---|---|---|---|---|---|
| 0 | — | 0 | 122 | 0 | **+191** | pulsenova −192 | 0 | 2 |
| **1** | DE | 61 | 183 | 0 | **+252** | pulsenova **−131** | 0 | 2 |
| **2** | DE FR | 129 | 251 | 0 | **+320** | pulsenova **−63** | 0 | 3 |
| **3** | DE FR NL | 191 | 313 | 0 | **+382** | pulsenova **−1** ⚠ | 0 | 3 |
| 4 | +JP | 249 | 371 | 0 | +440 | pulsenova +57 | **1** | 3 |
| 6 | +RU UA | 362 | 484 | 0 | +553 | pulsenova +170 | 1 | 3 |
| **8** | +PL IT | 481 | 603 | 0 | **+672** | pulsenova +289 | 1 | 3 |
| **9** | +ES | 543 | 665 | 0 | **+734** | pulsenova +351 | 1 | 3 |
| 10 | +SE | 698 | 820 | 0 | +889 | pulsenova +506 | 1 | 10 |
| 12 | +FI IR | 915 | 1,037 | 0 | +1,106 | pulsenova +723 | 1 | 12 |
| 16 | +AE US TR AT | 1,352 | 1,474 | 0 | +1,543 | pulsenova +1,160 | 3 | 13 |
| 24 | +BE IE RO HU BG EE LT ID | 1,855 | 1,977 | 0 | +2,046 | pulsenova +1,663 | 11 | 14 |
| 29 | +MC BD LA TH DK | 2,283 | 2,405 | 0 | +2,474 | pulsenova +2,091 | 13 | 14 |

**Same sets with the `CODES` bitmap (−649 B):**

| n | NET | Tightest headroom | over |
|---|---|---|---|
| 2 | −329 | pulsenova −712 | 0 |
| 8 | **+23** | pulsenova −360 | 0 |
| **10** | **+240** | pulsenova **−143** | 0 |
| 11 | +395 | pulsenova +12 | **1** |
| 12 | +457 | pulsenova +74 | 1 |

**Deliberately excluded for lack of cheap geometry:** GB, HK, CN, SG, CA, KR, SA, IN, TW, VN, MY, BR. Per the brief, no emblem flag was forced into the renderer. GB (Union Jack), HK, KR and CA (maple leaf) have no CSS-gradient representation that would be recognisable at 32 px; CN and SG need stars/crescents whose gradient approximations are misleading rather than helpful. `US` and `TR` are included at 111–144 B because a canton+stripes and a crescent *are* recognisable without their small details.

---

## G. Target cost bands

Searched across n = 0…29 for family B:

| Target | Best achievable | Codes | NET | Overrun vs. 383 B | Overrun vs. **533 B** |
|---|---|---|---|---|---|
| **< +100 B** | **nothing** — the fixed floor alone is +191 B | — | — | — | — |
| **< +250 B** | **nothing** — n=0 (+191 B) covers zero flags | — | — | — | — |
| **< +383 B** | n=3 | DE FR NL | +382 | **−1 B** ⚠ | **−151 B** |
| < +500 B | n=4 | DE FR NL JP | +440 | +57 | −93 |
| < +750 B | n=9 | DE FR NL JP RU UA PL IT ES | +734 | +351 | **+201** |
| < +1 KB | n=10 | + SE | +889 | +506 | **+356** |

**Negative = headroom still remaining; positive = the artifact crosses the 204,800 B ceiling.**
The **383 B** column is the snapshot measurement. The **533 B** column is the same NET applied to
the current resolved headroom (§H) — every value improves by exactly 150 B, and the
conclusions do not change.

**The `< +383 B` band cannot be met with acceptable margin.** n=3 lands at +382 B — one byte inside the snapshot ceiling, and still only **151 B** inside the current one, far below the ≥ 1 KB floor the audit's §10 sets. That is precisely the "landing exactly on the hard ceiling" the brief rules out. n=2 (+320 B) leaves 63 B at the snapshot and 213 B now; it is the largest set that is *defensible*, and neither margin is comfortable for a template that is itself the tightest in the catalogue.

The reason is structural: **the fixed floor of any renderer that touches the badge is ~191 B — 50 % of the snapshot headroom on the binding template, and 36 % of the current 533 B — before a single flag is drawn.** With the `CODES` bitmap reclaiming 649 B the picture changes completely — n=10 fits with **293 B** of margin (143 B at the snapshot), and n=8 fits at a net cost of **+23 B**.

---

## H. Arcade Nova handling

| Template | Bytes at snapshot | Status |
|---|---|---|
| `pulsenova` | 204,417 → **204,267** | **binding** — frozen, byte-locked; 383 B headroom at the snapshot, **533 B now** (line-ending defect resolved) |
| `arcadenova` | **203,310** | **provisional at the snapshot** — not frozen, not byte-locked then; `components.css` and `layout.css` written during this study. **Now frozen with size + SHA.** |

Every impact figure in this document is computed against the **frozen 14 at the snapshot** (15 now), with `pulsenova` as the binding constraint. Arcade Nova appears only in the "all 15" counts and never determines a conclusion. **The catalogue freeze has since happened (HEAD `347f828`, 15 of 15 locked), so these figures can now be recomputed against a settled tree — but they are not recomputed here, because this document records what was measured at the snapshot.**

---

## I. Production isolation — confirmed

No edits were made to `src/scripts/flag.js`, `explorer.js`, `config.js`, `verify.mjs`, any test, `tools/build.mjs`, any template, the installer, `VERSION`, or any lock hash. `VERSION` still reads 1.1.0. The two artifacts quoted at the snapshot were `template/index.html` = 202,976 B and `dist/templates/pulsenova/template.html` = 204,417 B; **both are historical** — at HEAD `347f828` they read **200,999 B** and **204,267 B**. No release was regenerated and no worktree was created.

The `M` entries visible in `git status` (`installer/lib/row-template.sh`, `tests/build.test.mjs`, `tests/registry.test.mjs`, `tools/templates.mjs`) are Chat 1's in-flight edits and were already present before this study began.

All prototypes are outside the repository in `%TEMP%\flagaudit\`.

---

## J. Decision output

### 1. Corrected freeze / lock accounting
14 unique byte-locked templates *at the snapshot*; **14 exact byte assertions, 14 exact SHA assertions, 28 total lock assertions** — not 13 and not 46. Four individual tests (`row`, `editorial`, `canvas`, `pulsenova`) and ten `FROZEN_ARTIFACTS` rows, with **no overlap**. `arcadenova` was unlocked at the snapshot; **it is now locked, giving 15 / 15 / 15 / 30**. A shared-runtime change invalidates **all 28 at the snapshot — 30 now**, plus 1 regeneration gate and a magnitude-dependent subset of 24 budget inequalities. `CODES` holds 258 codes (not 261).

### 2. Progressive-enhancement architecture
Covered code → painted gradient badge. Uncovered-but-valid code → the existing emoji pair, untouched. No valid pair → the existing monogram. Implemented as one additive conditional in `explorer.js` (+69 B) and one constant. `CODES` becomes load-bearing and must not be removed.

### 3. Why uncovered flags do not regress
The emoji path is not replaced, only pre-empted for codes the renderer actually knows. For any code outside the registry, the badge receives exactly the same `textContent` it receives today, on every platform. There is no state in which an uncovered flag renders worse than it does now — the only way to reach the monogram is to have no assigned pair at all, which is today's rule too. The one honest caveat is not a regression but a **consistency change**: on macOS/iOS/Android/Firefox, where the emoji already renders, a covered country switches from a platform emoji to a flat gradient. That is a deliberate visual unification, and it is the price of the design.

### 4. Minimal SVG prototype cost
Fixed floor **~1,589 B**; ~18 B per flag. Disqualified on three counts: 8× the CSS floor, two identifier collisions in the concatenated scope (`shape`, `paint`) that would break the artifact at parse time, and a `createElementNS` requirement that the test fixture does not provide.

### 5. CSS-gradient prototype cost
Fixed floor **+191 B** (renderer module 122 B + `explorer.js` 69 B); **77.8 B per flag** including key. All 29 literals verified valid CSS by `css-tree`. Forced-colors guard costs 49 B and is mandatory. Zero per-template CSS.

### 6. Hybrid prototype cost
Not justified. The hybrid's only purpose is to cover flags CSS cannot express, and those are exactly the expensive ones: GB, HK, KR, CA, SG, CN. Adding a single SVG escape hatch costs ~600 B of extra renderer code plus 250–1,300 B of path data — **+850 to +1,900 B for one flag**, i.e. more than the entire budget for a ten-flag CSS set. Recommendation: **reject the hybrid**; leave those countries on the emoji.

### 7. Cumulative country-set cost
See §F. Under progressive enhancement with `CODES` retained: n=1 +252 B, n=2 +320 B, n=4 +440 B, n=8 +672 B, n=12 +1,106 B. With the `CODES` bitmap: n=8 **+23 B**, n=10 **+240 B**.

### 8. Best solution under +383 B *(the snapshot fit threshold; +533 B now)*
**n = 2 — DE, FR — at +320 B**, leaving **63 B** on `pulsenova` at the snapshot and **213 B** against the current 533 B. n=3 fits arithmetically at +382 B but leaves only **1 byte** at the snapshot (151 B now), which the brief correctly rejects. If 63 B is judged too thin (it is), the honest answer for this band is **nothing fits**.

### 9. Best solution under +750 B *(a cost band, not a fit threshold)*
**n = 9 — DE FR NL JP RU UA PL IT ES — at +734 B**, which is **over** the ceiling by 351 B at the snapshot and by 201 B against the current 533 B — so this band does not actually fit. With the `CODES` bitmap the same band buys n=10 (+240 B, **293 B** margin) or n=8 at a net **+23 B**.

### 10. Best solution under +1 KB *(a cost band, not a fit threshold)*
**n = 10 — DE FR NL JP RU UA PL IT ES SE — at +889 B**, which is **over** the ceiling by 506 B at the snapshot and by 356 B against the current 533 B. With the bitmap, n=10 costs +240 B and the 1 KB band is not even reached until n=12.

### 11. Is removing `CODES` still desirable?
**No — under progressive enhancement it is not merely undesirable, it is incorrect.** `CODES` is what distinguishes "a real country we cannot draw" (keep the emoji) from "not a flag at all" (monogram). Replacing it with the renderer registry would send every uncovered country to the monogram, converting an enhancement into a regression. It must stay.

**Packing it is a different question, and the answer there is yes.** Replacing the 773-byte literal + 134-byte wrapper (907 B) with a 116-byte base64 bitmap and a ~142-byte decoder costs **258 B and returns 649 B** — round-trip verified exact against all 258 codes. That single change is worth more than the entire renderer at n=8. It is, however, a change to `flagOf`'s internals, it replaces a reviewable list with an opaque blob, and it carries a real trap: the natural `new Uint8Array(676 / 8)` truncates to 84 bytes and silently drops `ZW` — a bug this study hit and fixed. **Recommendation: treat the bitmap as a separate, independently reviewed change that must land before or with the renderer, not as part of it.**

### 12. Exact behaviour by platform

| Platform / mode | Covered code | Uncovered valid code | No valid pair |
|---|---|---|---|
| **Windows Chromium** (Chrome, Edge, Brave, Electron) | gradient flag | **`DE` / `US` letters — identical to today** | monogram |
| **Windows Firefox** | gradient flag | native emoji flag | monogram |
| **macOS / iOS** | gradient flag | native emoji flag | monogram |
| **Android** | gradient flag | native emoji flag | monogram |
| **Linux** | gradient flag | native emoji flag (if an emoji font is installed) | monogram |
| **Any platform, forced colors** | **emoji / letters** (guard active) | emoji / letters | monogram |
| **Unknown or unassigned pair** (`🇿🇿`) | — | — | monogram |
| **Lone indicator, white/black flag, plain emoji** | — | — | monogram; the emoji stays in the label |

No cell in this table is worse than today.

### 13. Final recommendation

> ## WAIT FOR LARGER SHARED-RUNTIME HEADROOM

Progressive enhancement **resolves the product objection** that drove the Phase 0 verdict — an incomplete renderer is genuinely not a regression, and §J3 is the proof. It does **not** resolve the byte objection, which is unchanged.

Reasoning:

1. **The fixed floor is +191 B.** Any renderer that touches the badge costs 50 % of the binding template's snapshot headroom (36 % of the current 533 B) before a single flag is drawn. There is no design under +250 B, and none under +533 B with acceptable margin.
2. **Two flags for 320 B is a bad trade.** DE + FR would consume 84 % of `pulsenova`'s snapshot headroom (60 % of the current 533 B) to improve 2 of 258 codes. Nine flags cost 734 B and do not fit at all.
3. **The catalogue was still moving at the snapshot.** Chat 1 rewrote `arcadenova`'s stylesheets during this study, and four files were in flight. A re-freeze then would have been re-freezing a moving target — and it would have consumed 28 lock assertions plus the release payload for a two-flag gain. **The catalogue has since settled (HEAD `347f828`), so the target is no longer moving; the cost, however, is now 30 settled lock assertions rather than 28 in-flight ones.**
4. **The affordable version needs the `CODES` bitmap first.** With 649 B reclaimed, n=8 costs **+23 B net** and n=10 costs +240 B with **293 B** of margin (143 B at the snapshot). That is a real design. Without it, the same set is +672 B and fails.

**Sequenced recommendation:**

1. **Now:** do nothing to the runtime. Record the `CODES` bitmap as a candidate optimisation and this cost study as the reason.
2. **At catalogue freeze:** land the `CODES` bitmap as its own reviewed change, re-freezing once.
3. **Immediately after:** land family B at **n = 8–10** as a single follow-up commit in the same freeze window, using the headroom step 2 created. Two re-freezes in one window is acceptable; two across release boundaries is not.
4. **Never:** the hybrid, the SVG family, an embedded COLR font, or full ISO coverage. All are arithmetically impossible against a 204,800 B ceiling.

**If the user wants a Windows improvement before the freeze**, the only honest option is family B at **n = 2 (DE, FR) for +320 B** — accepting that `pulsenova` drops from 533 B to 213 B of headroom (383 B → 63 B at the snapshot) and that every subsequent template must be built against that. It is defensible, it is not reckless, and it is a 2 % coverage improvement. My recommendation is not to take it.

---

FLAG RENDERER PHASE 0.5 COST STUDY READY FOR REVIEW

---

**Superseded 2026-09-20.** The line above is this document's verdict as a cost study and is
retained as the record of it. The recommendation it reached — §J13, *WAIT FOR LARGER
SHARED-RUNTIME HEADROOM* — was overtaken by an explicit decision to implement. The renderer
shipped at `4a95cbc` on the deterministic preview infrastructure (`9a37123`), with the
regenerated previews at `a012108`. The snapshot measurements in this document are
unchanged and still correct **as snapshot values**; the current figures are in the Phase 1
status block at the head of this document.

FLAG RENDERER IMPLEMENTED — COMMITTED AT `4a95cbc` — PREVIEWS REFRESHED AT `a012108`
