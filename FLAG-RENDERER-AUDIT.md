# Flag Renderer Audit — Country Flag System

**Workstream:** CHAT 3 — Flag Rendering / Country Flag System
**Scope:** audit and cost study only. No source, build, test, template, installer or version file was modified in Phase 0, 0.5 or 0.6.
**Tree audited:** `D:\. frank0live Main\3X-UI Template\Row-Template` @ branch `feat/v1.2-multitemplate`, `VERSION` = 1.1.0
**Dates:** Phase 0 (audit) · Phase 0.5 (cost study) · Phase 0.6 (consistency pass) — all 2026-09-18. Documentation correction pass 2026-09-19. **Phase 1 (implementation) and implementation reconciliation — 2026-09-20.**
**Companion document:** `FLAG-RENDERER-PHASE-0.5.md` (cost study, sections A–J). Where the two disagree, **Phase 0.5 is authoritative on measurements; this document is authoritative on the freeze accounting**.

> ## Coverage model reconciliation — SIX GRADIENTS ARE A SELECTION, NOT A LIMIT (added 2026-09-20)
>
> **Read the Phase 1 status block below with this correction in hand.** That block records
> `| Country set | 6 — DE FR NL JP SE US |`, which is accurate as a list of *what the CSS
> renderer draws* and misleading as a statement of *what the product supports*. This block
> supplies the distinction. Nothing below is rewritten; the Phase 1 block stands as written.
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
> The two sets answer different questions and were always meant to. `CODES` decides whether a
> pair is a real country at all — it is the gate between an emoji and a monogram. `FLAGS`
> decides whether that country can be drawn *faithfully* without an image. A code absent from
> `FLAGS` is not uncovered: `paintFlag()` returns before painting and the badge keeps the emoji
> its platform already renders, which is the unchanged path. §6's fidelity rule is why the
> list is short, not any budget or coverage constraint — the Union Jack's counterchanged
> saltire, Canada's maple leaf, Hong Kong's bauhinia, Korea's taegeuk, the five-star groups of
> China and Singapore, and the crescents of Singapore and Turkey are identities no gradient
> primitive draws, and a bands-only version of them would ship a *different flag*.
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
> §6's fidelity rule, §9's lock accounting, §10's headroom floor, §11's accessibility and
> security analysis and §13's semantic point that `CODES` stays all hold as written. The
> binding figure is unchanged: `pulsenova` **204,542 B**, **258 B** headroom.

> ## Phase 1 status — IMPLEMENTED AND COMMITTED (added 2026-09-20)
>
> **The decision this document deferred has been taken, and the renderer has shipped.**
> The §16 recommendation (*DO NOT IMPLEMENT*) and the deferral it describes are
> **superseded by that explicit decision** — the fourth bullet of §16's "what would change
> the answer to implement". Everything below is retained unaltered as the audit history
> that informed it. No finding, measurement or recommendation below has been rewritten.
>
> **Tree state.** `feat/v1.2-multitemplate` is at **`a012108`**, on top of the `347f828`
> this document audits:
>
> | # | Commit | Subject | Files |
> |---|---|---|---|
> | — | `347f828` | *(the HEAD this document audits)* | — |
> | — | `46abb7e` | `perf: compact country code registry` — the §13 bitmap | — |
> | 1 | `9a37123` | `docs: make preview capture reproducible across days` | 4 |
> | 2 | `4a95cbc` | `feat: paint assigned country flags without an image` | 5 |
> | 3 | `a012108` | `docs: refresh template previews for flag renderer` | 24 |
>
> Nothing is pushed; there is no tag on any of the three and no release. `VERSION`
> remains **1.1.0**. No `layout.html`, stylesheet, locale or installer file changed.
>
> ### What shipped
>
> | Item | Value |
> |---|---|
> | Renderer family | **K** — CSS gradient, emoji-keyed, inline paint, forced-colors guard (§5) |
> | Country set | **6 — `DE FR NL JP SE US`** |
> | `CODES` | **retained**, repacked as the §13 bitmap (not removed — §5, §13) |
> | Files changed | `src/scripts/flag.js` (+55), `src/scripts/explorer.js` (+2) — **nothing else in `src/`** |
> | Artifacts re-baselined | **all 15** |
> | Lock assertions | **30** (15 byte + 15 SHA) — unchanged in count, all re-baselined (§9) |
> | Binding template | `pulsenova` **204,542 B**, **258 B** headroom |
> | Artifacts over 204,800 B | **0** |
>
> **The shipped set is not the `n = 6` row of §7.4.** That row reads `DE FR NL JP RU UA`;
> the set actually chosen is `DE FR NL JP SE US`. `SE` and `US` are precisely the two
> approximations §6 requires to be signed off individually, and they were: the source
> comment in `flag.js` records that `SE` carries a 15 % cross rather than the true
> 18.75 % / 20 %, and that `US` carries the canton and the thirteen stripes but omits the
> fifty stars. `RU` and `UA` — cheap 3-band geometries — were not taken.
>
> ### Cost — measured, against §7.4's prediction
>
> The renderer costs a **uniform +890 B on every one of the 15 artifacts**. §7.4 predicted
> **+553 B** for `n = 6`. The 337 B difference is real and decomposes exactly:
>
> | Component | Bytes |
> |---|---|
> | `flag.js` built section, before → after | 1,250 → **2,108** (**+858**) |
> | … of which the `FLAGS` registry literal | 507 |
> | … of which `paintFlag()` and the guard | 350 |
> | … separator | 1 |
> | `explorer.js` call site (`configRow`) | **+32** |
> | **Total per artifact** | **+890** |
>
> §7.4's 77.8 B mean per flag understates this set, because it contains two of the most
> expensive geometries in §E — a Nordic cross (`SE`) and a canton-plus-stripes (`US`) —
> and because the implementation adds a `color: transparent` write (§5's rule 4 predicted
> only a `background` write) that the cost study did not model.
>
> ### The `CODES` bitmap landed — and reclaimed 615 B, not 649 B
>
> §13's packing was implemented in `46abb7e`, *before* the renderer, exactly as §10 step 4
> requires. Against §13's seven approval requirements:
>
> | §13 requirement | Status |
> |---|---|
> | 1. Round-trip equivalence proved in-repo against all 258 codes | **met** — `tests/flag.test.mjs` decodes the bitmap and compares it to the readable list |
> | 2. A regression test that fails on the truncating form | **met** — `ZW survives, which a truncated bitmap would silently drop` |
> | 3. Net reclaim ≥ 600 B verified against the real artifact | **met** — measured **−615 B** uniformly |
> | 4. Its own change, its own re-freeze | **met** — `46abb7e` |
> | 5. Readable list retained, or a generator exists | **met** — the list lives in `tests/flag.test.mjs` |
> | 6. `flagOf()` bit-identical for all 258 codes and every negative case | **met** — `all 676 letter pairs behave exactly as the previous list did` |
> | 7. A second reader confirms bit order and no endianness assumption | **not evidenced in the repository** — a process requirement, not a code property |
>
> **Measured: 85 bytes, 258 set bits, 116-character base64, `ZW` present.** The reclaim is
> **615 B**, not the 649 B §13 predicted, because the decoder came in at ~176 B rather
> than ~142 B; the packed block is **292 B**, not 258 B. The `new Uint8Array(676 / 8)`
> truncation trap §13 warns about is guarded by a test, not merely by a comment.
>
> ### The §10 precondition was met *before* the renderer landed
>
> §10 requires the tightest template to hold **≥ 1 KB** of headroom before a re-freeze is
> declared good. The bitmap created exactly that room: `pulsenova` went **204,267 →
> 203,652 B**, i.e. 533 → **1,148 B**. The renderer then consumed 890 B of it, leaving
> **258 B** — *below* the 1 KB floor §10 sets. That floor is a **pre**-re-freeze gate, and
> it was satisfied on entry; it is not satisfied on exit. This is the single most important
> correction in this block, and it is the number to carry forward.
>
> ### Current frozen sizes — all 15, after the renderer
>
> | Template | `347f828` (§4.1) | `46abb7e` (bitmap) | **`a012108`** (shipped) | Δ vs `46abb7e` | **Headroom** |
> |---|---|---|---|---|---|
> | **pulsenova** | 204,267 | 203,652 | **204,542** | +890 | **258** |
> | editorial | 203,848 | 203,233 | **204,123** | +890 | 677 |
> | signature | 203,679 | 203,064 | **203,954** | +890 | 846 |
> | arcadenova | 203,310 | 202,695 | **203,585** | +890 | 1,215 |
> | saffron | 203,057 | 202,442 | **203,332** | +890 | 1,468 |
> | arcade | 203,033 | 202,418 | **203,308** | +890 | 1,492 |
> | prismnova | 202,967 | 202,352 | **203,242** | +890 | 1,558 |
> | terminalnova | 202,944 | 202,329 | **203,219** | +890 | 1,581 |
> | brutal | 202,533 | 201,918 | **202,808** | +890 | 1,992 |
> | canvas | 202,339 | 201,724 | **202,614** | +890 | 2,186 |
> | prism | 202,127 | 201,512 | **202,402** | +890 | 2,398 |
> | pulse | 202,075 | 201,460 | **202,350** | +890 | 2,450 |
> | sketch | 202,075 | 201,460 | **202,350** | +890 | 2,450 |
> | **row** | 200,999 | 200,384 | **201,274** | +890 | 3,526 |
> | terminal | 199,642 | 199,027 | **199,917** | +890 | 4,883 |
>
> **`pulsenova` at 258 B is now the binding constraint**, replacing the 533 B used
> throughout this document. Every headroom figure in §4.1, §4.4, §4.5, §7.2, §7.4, §9,
> §10 and §16 is a statement about the tree *before* the renderer; none has been rewritten,
> and all of them are superseded by this table.
>
> ### Preview capture — a separate defect, fixed in the same window
>
> The docs previews were **not reproducible across calendar days**: the fixture clock set
> the expiry date while the reader's own clock set the "days remaining" caption, so a
> capture could match one and not the other. Both clocks are now pinned (`9a37123`), the
> previews were regenerated deterministically (`a012108`), and the manifest↔disk invariant
> is a permanent test rather than a one-off check. Of the 30 previews, **exactly 23 changed
> and 7 did not**. This is downstream documentation only: no artifact, byte-lock, contract
> or shipped page is affected by it.
>
> ### What this does *not* change
>
> §6's fidelity rule, §11's accessibility and security analysis, §12's test matrix and
> §13's semantic point that `CODES` stays all hold as written — and §11's forced-colors
> hazard is the one that would have produced a blank badge, which is why the shipped
> `paintFlag()` reads `matchMedia('(forced-colors: active)')` and returns before painting.

> ## Phase 0.6 status — FREEZE PREREQUISITE SATISFIED, IMPLEMENTATION STILL DEFERRED
>
> This document has been rewritten so that it no longer recommends an SVG-first
> architecture. The recommended shape is **progressive enhancement by CSS gradient**
> (Phase 0.5 family B). The country set is **not finalized** (§7).
>
> **The catalogue-freeze prerequisite is now satisfied.** As of HEAD `347f828` the
> catalogue is finalized at **15 core templates, all 15 frozen and byte-locked**
> (11 `FROZEN_ARTIFACTS` rows plus 4 individual locks: `row`, `editorial`, `canvas`,
> `pulsenova`), with the full product suite green at 238 tests / 234 passed / 0 failed
> / 4 skipped.
>
> **This does not authorise implementation.** The remaining §7.2 preconditions and the
> `CODES` bitmap (§13) are still outstanding, and the recommendation in §16 remains
> **DO NOT IMPLEMENT** until an explicit decision is taken. Nothing in this workstream
> has been implemented, and none of it is in the frozen catalogue.

### Corrections applied in Phase 0.6

| # | What changed | Where |
|---|---|---|
| A | Recommended architecture replaced with the progressive-enhancement tree | §5 |
| B | `flagOf()` keeps returning the **regional-indicator pair** — no alpha-2 change | §5, §8 |
| C | `CODES` is **semantically authoritative and load-bearing**; it stays | §5, §8, §13 |
| D | The compact bitmap is a **byte-reclamation technique**, not semantic removal | §13 |
| E | Obsolete SVG-first implementation guidance removed | §1, §3, §5, §8, §11, §12, §15 |
| F | Obsolete "remove `CODES` first" migration step removed | §10 |
| G | Freeze accounting reconciled to the **current** figure: **15 / 15 / 15 / 30** — 15 unique byte-locked templates, 15 byte assertions, 15 SHA assertions, 30 lock assertions. The Phase 0.5 snapshot figure of 14 / 14 / 14 / 28 is retained only where it is labelled as historical | §1, §4.1, §7.2, §9, §10, §12, §15, §16 |
| H | `arcadenova` was **provisional** at the snapshot (budget only, no lock). It is **now frozen with size + SHA**, so it is no longer described as provisional or unlocked | §4.1, §7.2, §9.3 |

### Corrections carried over from Phase 0.5

- The freeze accounting in the original Phase 0 draft was wrong in three ways — "13 of 15 pinned", "4 individual locks + 10 rows", "46 lock assertions". The correct figure is **15 unique byte-locked templates, 15 byte assertions, 15 SHA assertions, 30 lock assertions**. (The Phase 0.5 snapshot recorded 14 / 14 / 14 / 28, because `arcadenova` was not yet byte-locked; that deferral is now complete.) Enumerated in §9.
- `CODES` holds **258** codes, not 261.
- The suggestion that the `CODES` literal could be reclaimed to fund the renderer is **withdrawn** (§4.5). Packing it is a separate question (§13).

> ### Current state at HEAD `347f828`
>
> The drift recorded in earlier revisions of this document is **resolved**. The
> catalogue is finalized:
>
> - **15 core templates**, all 15 `tier: core` and `locked: true` in the registry.
> - **15 of 15 byte-locked** — 11 `FROZEN_ARTIFACTS` rows (`prism`, `terminal`,
>   `pulse`, `brutal`, `arcade`, `sketch`, `signature`, `saffron`, `prismnova`,
>   `terminalnova`, `arcadenova`) plus 4 individual locks (`row`, `editorial`,
>   `canvas`, `pulsenova`). **No template appears in both sets.**
> - That gives **15 byte assertions, 15 SHA assertions, 30 lock assertions**.
> - `arcadenova` is **no longer provisional or unlocked**; it carries size + SHA.
> - Every template owns `src/templates/<id>/layout.html`, so `src/index.html` is
>   **no longer used by any template** — it is dead code (§4.1).
>
> **Current frozen sizes** (ceiling 204,800 B; full table in §4.1). The tightest
> headroom in the catalogue is **533 B** on `pulsenova`:
> `row` 200,999 · `terminal` 199,642 · `pulsenova` 204,267 · `editorial` 203,848 ·
> `signature` 203,679 · `arcadenova` 203,310 · `saffron` 203,057 · `arcade` 203,033 ·
> `prismnova` 202,967 · `terminalnova` 202,944 · `brutal` 202,533 · `canvas` 202,339 ·
> `prism` 202,127 · `pulse` 202,075 · `sketch` 202,075.

---

## 1. Current flag rendering architecture

The whole path is five hops, all shared, none per-template:

```
panel share link
      │
      ▼
src/scripts/config.js  classify()
      │   name = fragmentName(raw) | vmessName(raw) | amneziaName(raw)
      │   displayName = cleanName(name)        ← indicators stripped
      │   flag        = flagOf(name)           ← returns the RAW regional-indicator PAIR, e.g. "🇩🇪"
      ▼
src/scripts/explorer.js  configRow()
      │   <span class="cfg-flag" aria-hidden="true">
      │   cfg.flag ?  badge.textContent = cfg.flag
      │            :  badge[data-mono] = 1 ; badge.textContent = monoLetter(cfg)
      ▼
src/styles/components.css  (or src/templates/<id>/components.css)
      │   .cfg-flag            { display:grid; place-items:center; font-size:18–21px; overflow:hidden }
      │   .cfg-flag[data-mono] { background/border/color/font-weight }
      ▼
platform emoji font       (no emoji face is named anywhere in the cascade)
```

**`src/scripts/flag.js`** (built section: **1,903 B**) exports exactly two functions:

| Symbol | Role | Built bytes |
|---|---|---|
| `RI_FIRST` / `RI_LAST` | the regional-indicator block `U+1F1E6`–`U+1F1FF` | ~60 |
| `CODES` | a `Set` of **258** assigned / exceptionally-reserved alpha-2 codes, built from a 14-line string literal | **907** (773 list + 134 wrapper) |
| `isIndicator(cp)` | block test | ~80 |
| `letter(cp)` | indicator → `A`–`Z` | ~80 |
| `flagOf(text)` | first valid indicator **pair** in a string, returned as the two code points, or `''` | ~430 |
| `cleanName(text)` | the same string with every indicator removed, separators tidied | ~350 |

Two deliberate behaviours worth preserving in any redesign:

- **Pair-aligned scan.** An unassigned pair is consumed as a unit (`🇿🇿🇺🇸` → `🇺🇸`), so a tofu pair cannot realign the scan onto a spurious code.
- **Refusal over invention.** A lone indicator, an unassigned pair, the white flag and the black flag all yield `''` and fall through to the monogram. There is never an empty circle.

**Build pipeline.** `tools/build.mjs` concatenates `src/scripts/**` in a fixed order (`… brand.js, flag.js, config.js …`) into **one** `<script>`, stripping module syntax and all comments except `/* row:` and `/* ----` banners. The artifact is deliberately **not minified** — readable source is shipped verbatim. Every template shares this one runtime; every core template uses its own `layout.html` alongside its template-specific styles; `src/index.html` remains only as an unused fallback.

**Gate.** `tools/verify.mjs` enforces, among others:

- exactly **1 `<style>`** and **3 `<script>`** elements — a fourth script or a second stylesheet is a hard failure;
- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval(`, `new Function(`, `document.write` are **forbidden**;
- no remote reference anywhere except `ALLOWED_REMOTE = { 'http://www.w3.org/2000/svg' }`;
- no CDN, no `localhost`, no dev-machine path, no source map;
- sources carry no invisible characters;
- the `/* row:branding */` block stays substitutable.

`innerHTML` being banned means markup-string flag injection is impossible by policy, not merely by discipline. The recommended design in §5 uses **no markup at all** — it assigns one CSSOM property — so the ban is not even exercised.

**Freeze state.** **All 15 artifacts** are pinned to an exact byte length **and** full SHA-256 in `tests/build.test.mjs` — 4 individual tests (`row`, `editorial`, `canvas`, `pulsenova`) plus 11 `FROZEN_ARTIFACTS` rows (`prism`, `terminal`, `pulse`, `brutal`, `arcade`, `sketch`, `signature`, `saffron`, `prismnova`, `terminalnova`, `arcadenova`), with **no template appearing in both sets**. That is **15 byte assertions + 15 SHA assertions = 30 lock assertions**; no template is left on determinism + budget alone. Enumerated in §9.

---

## 2. Why Windows shows `DE` / `FR` / `NL` / `JP` / `US`

**Windows ships no country-flag glyphs.** `Segoe UI Emoji` has no ligature mapping a regional-indicator pair to a flag image, so the shaper falls back to drawing the two code points as two letters. `🇩🇪` becomes the text `DE`. This is a missing-glyph outcome, not a CSS outcome.

Consequences by platform:

| Platform / browser | Emoji face actually used | Result today |
|---|---|---|
| Windows 10/11 — Chrome, Edge, Brave, Opera, Electron | Segoe UI Emoji | **`DE` letters** |
| Windows 10/11 — Firefox | Twemoji Mozilla (bundled, COLR/CPAL) | real flag |
| macOS / iOS — any browser | Apple Color Emoji | real flag |
| Android — any browser | Noto Color Emoji | real flag |
| Linux — any browser | whatever emoji font is installed (Noto Color Emoji / Twemoji) | usually real flag |

The published `country-flag-emoji-polyfill` project states the same thing flatly: on recent Windows, *"all Chromium-based browsers can't display country flag emojis natively."* The failure therefore correlates with **Windows + Chromium**, which is the single largest desktop cohort a subscription page will meet.

**Why CSS cannot fix it *by itself*.** `--font` is `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, …` with no emoji face named, so the badge falls through to the platform emoji font. Adding a `font-family` list is useless: Windows has **no locally installed font containing flag glyphs** to fall back to. The one embedded face, `vazirmatn-arabic-subset.woff2`, is Arabic-script only (`unicode-range: U+0600-06FF, U+200C-200F, U+2066-2069, U+FB50-FDFF, U+FE70-FEFF`) and contains no emoji.

The remedy that *does* work is to **stop asking the platform for a glyph at all** and draw the flag ourselves — which is what §5 does, with CSS gradients rather than SVG geometry (§3 K).

---

## 3. Candidate solution comparison

`+B` = added bytes **per built artifact**. Registry figures are measured from `country-flag-icons@1.6.20` (265-code 3×2 set) and from hand-authored prototypes; none are estimated from memory.

The final column is the **progressive-enhancement** fallback: for every approach, a code that is *assigned but not covered by the renderer* keeps today's emoji pair. Only a string with no assigned pair at all reaches the monogram.

| | Approach | Cross-platform | Runtime cx | Build cx | A11y | RTL | Security | Registry src B | **+B per artifact** | All locks change? | Maintenance | Uncovered valid code |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** | Regional-indicator emoji (today) | macOS/iOS/Android/Linux ✅ · **Windows Chromium ❌** | none | none | clean (`aria-hidden`) | none | none | 907 (`CODES`) | **0** | — | none | — (this *is* the fallback) |
| **B** | Inline SVG per flag, full library | ✅ all | medium | none | clean | none | safe (DOM-built) | **159,682** inner / 177,993 raw | **+159,700** → impossible | yes | high (265 files) | emoji pair |
| **C** | Embedded SVG sprite, all codes | ✅ all | low (`<use>`) | none | clean | none | safe if static markup | 159,682 + 43×265 = **171,077** | **+171,000** → impossible | yes | high | emoji pair |
| **D** | Build-time injected sprite | ✅ all | low | medium | clean | none | safe | same as C | **+171,000** → impossible, **and** requires per-template work (at the time of writing, `src/index.html` + 8 `layout.html` files; **all 15 templates now own a `layout.html`**) | yes | high | emoji pair |
| **E** | Compact hand-authored **SVG path** registry | ✅ all | medium | none | clean | none | safe | **658 B for 29 simple flags**; 20,881 B for 30 emblem flags | **+1,899** (measured prototype, 29 flags) | yes | medium | emoji pair |
| **F** | Embedded raster / data URI | ✅ all | low | medium | clean | none | safe | 32 px PNG ≈ 300–800 B each → 80–210 KB full set, **+33 % base64** | **+100,000**+ → impossible; also loses vector crispness | yes | high | emoji pair |
| **G** | Common subset + fallback | ✅ all for covered codes | medium | none | clean | none | safe | bands-only ≈ 400 B; +disc/cross ≈ 660 B | **+0 … +1,899** depending on subset depth | yes | medium | emoji pair |
| **H** | Full ISO-3166 coverage | ✅ all | high | none | clean | none | safe | ≥ 20 KB even hand-optimised | **+20,000** → impossible | yes | very high | emoji pair |
| **I** | Embedded COLR flag font (Twemoji Country Flags) | ✅ all | none (CSS) | none | clean | none | safe | `TwemojiCountryFlags.woff2` = **78,292 B** → **104,430 B** as a data URI | **+104,430** → impossible | yes | low | emoji pair |
| **J** | Runtime capability sniff + emoji fallback | mixed | high | none | clean | none | safe | small | +400 … +1,900 | yes | medium | emoji pair |
| **K** | **Compact CSS-gradient registry — RECOMMENDED** | ✅ all | none | none | clean | none | safe (no markup, no URL) | **77.8 B per flag** (mean, 29-flag prototype) | **+191 floor**, then **+77.8/flag** | yes | medium | **emoji pair (preserved)** |

**J deserves a note.** The tempting idea is "use the emoji where the platform has flags, and draw only where it does not." It does not survive contact with reality: there is no reliable, cheap way to ask a browser *"do you have a glyph for `U+1F1E9 U+1F1EA`?"*. `CanvasRenderingContext2D.measureText` width comparison against a known-tofu probe is the usual trick, but it is font-load-timing dependent, differs across DPI settings, and produces false positives — and a wrong guess is exactly the failure mode we are trying to remove. **J is rejected: it pays the full byte cost of the subset while keeping the unreliability of the emoji.**

**K is not a compromise between B–J — it is a different mechanism.** Approaches B–I all *draw vector geometry*; K *paints a background*. That single change is what moves the fixed floor from ~1,589 B to **191 B** and the per-flag cost from ~18 B of geometry-plus-expander to a flat **77.8 B of declarative literal**. K is evaluated in full in §5 and measured in §4.

**`<use>` does not save artifact bytes.** The sprite must ship regardless of whether it is referenced. `<use href="#f-DE">` saves *runtime DOM*, not downloaded bytes. **Recommendation: no `<use>`, no sprite, no font.**

---

## 4. Measured byte table

### 4.1 Current frozen sizes

| Template | Bytes | Headroom to 204,800 | Locked? |
|---|---|---|---|
| **pulsenova** | 204,267 | **533** | size + SHA — **binding** |
| editorial | 203,848 | 952 | size + SHA |
| signature | 203,679 | 1,121 | size + SHA |
| arcadenova | 203,310 | 1,490 | size + SHA |
| saffron | 203,057 | 1,743 | size + SHA |
| arcade | 203,033 | 1,767 | size + SHA |
| prismnova | 202,967 | 1,833 | size + SHA |
| terminalnova | 202,944 | 1,856 | size + SHA |
| brutal | 202,533 | 2,267 | size + SHA |
| canvas | 202,339 | 2,461 | size + SHA |
| prism | 202,127 | 2,673 | size + SHA |
| pulse | 202,075 | 2,725 | size + SHA |
| sketch | 202,075 | 2,725 | size + SHA |
| **row** | 200,999 | 3,801 | size + SHA |
| terminal | 199,642 | 5,158 | size + SHA |

All 15 templates are `tier: core` and `locked: true`; the lock inventory is enumerated in §9. **`pulsenova` at 533 B is the binding constraint for every headroom figure in this document.**

Composition of the Row artifact (200,999 B): `<style>` 63,199 · i18n island 22,481 · app script 101,426 (including the vendored `uqr` at 27,469) · boot script 2,717 · shell remainder 11,176.

> **Historical — Phase 0.5 snapshot.** The cost study in `FLAG-RENDERER-PHASE-0.5.md`
> was measured against the sizes in force on 2026-09-18, when `pulsenova` read 204,417 B
> (a CRLF-inflated figure, since resolved — §14) and the tightest headroom was 383 B.
> Per-flag *costs* are unaffected by that change; every *headroom* figure in this
> document has been recomputed against the current 533 B. The snapshot table is
> preserved in `FLAG-RENDERER-PHASE-0.5.md` §A.

**`src/index.html` is dead code.** `loadLayout()` in `tools/build.mjs` selects a
template's own `src/templates/<id>/layout.html` when the file exists and only falls back
to `src/index.html` otherwise; all 15 templates have one, so the fallback is never taken.
The registry's `layout` field is **vestigial** — no tool or test reads it (see §8).

### 4.2 Registry cost, measured

| Registry | Flags | Bytes | Avg/flag |
|---|---|---|---|
| `country-flag-icons` full set, minified `<svg>` | 265 | 177,993 | 672 |
| … same, inner geometry only (no `<svg>` wrapper) | 265 | **159,682** | 603 |
| … largest: `IO` 5,321 · `SA` 3,333 · `BL` 2,878 · `AC` 2,794 · `ME` 2,597 | | | |
| … smallest: `ID` 146 · `PL` 151 · `MC` 151 · `PW` 153 · `JP` 158 | | | |
| `<symbol>` wrapper overhead | 265 | +11,395 | 43 |
| subset "core 12" (DE FR NL GB US JP SG HK RU IR TR CN) | 12 | 6,266 | 522 |
| subset "common 31" | 31 | 15,833 | 511 |
| subset "common 43" | 43 | 20,312 | 472 |
| hand-compact SVG DSL, simple geometry (bands / Nordic cross / disc) | 29 | **658** | **23** |
| hand-compact SVG DSL, emblem flags needing real path data | 30 | 20,881 | 696 |
| **CSS-gradient registry (family K), all 29 prototype flags** | 29 | **2,256** | **77.8** |
| COLR flag font `TwemojiCountryFlags.woff2` | 265 | 78,292 (104,430 as data URI) | 295 |

### 4.3 Measured prototype (Option E/G, 29 flags — SVG geometry)

A real prototype of the **SVG-geometry** shape — compact geometry literal plus a `createElementNS` renderer plus the existing detector — was compiled through an emulation of the build's comment/module stripping:

| Component | Bytes |
|---|---|
| `FLAGS` registry literal (29 flags: 26 band/cross/disc + 3 square/other) | 658 |
| detector + renderer (unminified, as the build ships it) | 3,144 |
| **new built `flag.js` section** | **3,802** |
| current built `flag.js` section | 1,903 |
| **net delta** | **+1,899** |

This prototype is **rejected** and is retained only as the reason the recommendation moved to family K. See §5.

### 4.4 Headroom is the binding constraint

Templates failing the 204,800 B ceiling at a given net delta:

| Net delta | Templates that FAIL |
|---|---|
| +100 B | 0 / 15 |
| +191 B (family K fixed floor) | 0 / 15 |
| +300 B | 0 / 15 |
| +400 B | 0 / 15 |
| **+533 B** | 0 / 15 (pulsenova lands exactly on the line) |
| +600 B | **1 / 15** (pulsenova) |
| +1,000 B | **2 / 15** (pulsenova, editorial) |
| **+1,899 B (the SVG prototype)** | **8 / 15** |
| **+2,474 B (family K at n = 29)** | **10 / 15** |

At +1,899 B the eight failures are pulsenova, editorial, signature, arcadenova, saffron, arcade, prismnova and terminalnova. The seven survivors land at brutal 368 B, canvas 562 B, prism 774 B, pulse 826 B, sketch 826 B, **row** 1,902 B, terminal 3,259 B.

> **Recomputed 2026-09-19.** At the 383 B snapshot the same delta failed 10 of 15 and left
> brutal and arcade within 40 bytes of the ceiling. Against the current 533 B it fails
> **8 of 15** and no survivor is within 1 KB of the line. The SVG family is still
> rejected (§5), but on the strength of failing 8 of 15 templates and of an ~8× larger
> fixed floor — not on marginal survivors. The "7 bytes of headroom is a deferred
> outage" argument no longer applies at this delta.

### 4.5 Can existing bytes be reclaimed?

| Reclaimable | Bytes | Consequence |
|---|---|---|
| `CODES` literal | **907** | **Withdrawn as "removal".** Under progressive enhancement `CODES` is **load-bearing** — it is what keeps uncovered countries on the emoji path instead of the monogram. It must stay. *Packing* it into a 116-byte base64 bitmap is a separate option worth **649 B** — see §13. |
| locale island (5 × ~4.5 KB) | 22,481 | Translation content; removing keys is a product regression |
| `uqr` vendor | 27,469 | Required for QR |
| CSS | 63,199 | The design itself |

**Best case, honestly stated.** Reclaiming the `CODES` *literal* is off the table (it is load-bearing), but **packing** it returns 649 B without changing behaviour. Even so, the SVG prototype's +1,899 B does not close: 1,899 − 649 = **+1,250 B**, which still fails **3 of 15** templates (pulsenova, editorial, signature) and leaves arcadenova only 240 B from the line.

The arithmetic **does** close for family K: with the bitmap, an 8-flag CSS-gradient set costs **+23 B net** and a 10-flag set **+240 B** (§7.3). The difference is not the reclaim — it is the renderer family.

---

## 5. Recommended architecture — progressive enhancement by CSS gradient

```
share-link name
      │
      ▼
config.js classify()
      │   flag = flagOf(name)        ← regional-indicator PAIR, e.g. "🇩🇪"   (UNCHANGED)
      ▼
explorer.js configRow()
      │
      ├── cfg.flag === ''  ─────────────────────────► monogram  (UNCHANGED)
      │
      └── cfg.flag is an assigned pair
              │
              ├── FLAGS[cfg.flag] exists ──► badge.style.background = FLAGS[cfg.flag]
              │                              (gradient painted; no text node)
              │
              └── no entry ────────────────► badge.textContent = cfg.flag
                                             (EXACTLY today's behaviour, every platform)
```

The mechanism is deliberately trivial: the badge already receives `cfg.flag` as text. The enhancement **adds one conditional assignment beside it** and never removes the existing path.

**The structural consequence is that `CODES` must stay.** `flagOf` is the test for "is this a real country", and it must keep returning the emoji for every assigned code. If `CODES` were replaced by the (smaller) renderer registry, uncovered-but-valid flags would fall to the monogram instead of the emoji — a genuine regression. **Under progressive enhancement the renderer registry is strictly additive and `CODES` is load-bearing.** This reverses the Phase 0 suggestion that reclaiming `CODES` could fund the change.

### Design rules for the eventual implementation

1. **One shared module.** `src/scripts/flag.js` keeps `flagOf` / `cleanName` and gains **one constant** (`FLAGS`). `explorer.js` changes ~10 lines. Nothing else in the runtime moves. Zero per-template logic — a future template inherits the renderer by existing.
2. **`flagOf` keeps its public shape.** It returns the **regional-indicator pair**, not an alpha-2 code. `cfg.flag` stays `'🇩🇪'`. Keying the registry by that pair costs 0 extra bytes and 8 B/flag more than ASCII keys, but it avoids a ~110 B helper that would break even only at ~16 flags — which the budget never reaches. Choosing on bytes and regression risk, not elegance:
   - `src/scripts/config.js` needs **no change** — `flag: flagOf(name)` stays correct.
   - `tests/flag.test.mjs` needs **no change** — all 10 tests pass verbatim.
   - `tests/config.test.mjs` needs **no change** — the three `'🇺🇸'` / `'🇩🇪'` / `'🇷🇺'` assertions still hold.
3. **`CODES` stays.** It is the validity source. See §13 for the packing option.
4. **Paint, do not build markup.** The write is a single CSSOM property assignment (`badge.style.background = …`). There is no parsing step, so there is no injection surface at all, and `innerHTML` stays banned *and unused*.
5. **The forced-colors guard is mandatory.** In forced-colors mode Chromium forces `background-image: none`, so a gradient-only badge becomes an **empty box**. Today's badge shows letters, which is degraded but legible. A `matchMedia('(forced-colors: active)')` guard — read at paint time, so toggling High Contrast without a reload is handled — keeps the badge on its emoji text under High Contrast. **49 B. Without it the design has a mode where the badge is blank.**
6. **No `<use>`, no sprite, no font, no `<svg>`.** A sprite adds a DOM container and a fragment-reference surface for zero artifact savings; an embedded COLR font costs 104 KB.
7. **Zero per-template CSS.** The badge is already a fixed square box with `display: grid; place-items: center; overflow: hidden`; a gradient fills it 1:1. No template's CSS changes.
8. **Coverage is a product decision, constrained by the fidelity rule.** See §6 and §7.

### Hardening details worth writing into the implementation

- **No `Object.hasOwn` guard is needed** — but say why in a comment. The key is always exactly two code points from `U+1F1E6`–`U+1F1FF`, so it can never be `__proto__`, `constructor`, `prototype` or any other inherited name. The absence of the guard is a proof obligation, not an oversight.
- **Keep `aria-hidden="true"`** on the badge. Do **not** add `role="img"`, an `aria-label` or a text alternative — the badge is decorative and the country is already implied by the row label; announcing it would make every row redundant.
- **Keep the `|| ''`.** 10 B of defensive insurance: `style.background = undefined` coerces to the string `"undefined"` (invalid, silently ignored) rather than clearing the declaration.
- **Do not introduce `url(`.** A gradient literal *can* contain `url(...)`, which would be a remote reference. Add a build-time or test-time assertion that the `FLAGS` block contains no `url(` — that is the CSS-family equivalent of the SVG family's `foreignObject` guard, and it is cheaper.
- **Guard `matchMedia`.** It does not exist in Node, and `flag.js` is imported directly by `tests/flag.test.mjs`, `tests/config.test.mjs` (via `config.js`) and `tests/explorer.test.mjs`. A bare module-level `matchMedia(…)` throws `ReferenceError` on import and **takes the whole suite down**. The cheapest correct form is `try { HC = matchMedia(…) } catch (err) {}` (122 B module), which also matches the existing `prefersLight()` precedent in `boot.js`.
- **Avoid identifier collisions.** After concatenation every module shares one scope. `shape` is already declared in `i18n.js`, `live.js` and `model.js`; `paint` in `boot.js`, `detect.js` and `main.js`. Declaring either in the new module is a **duplicate declaration → SyntaxError → the page never boots**, and no unit test would catch it because the tests import modules individually rather than the concatenated artifact. (`FLAGS`, `HC`, `flagPaint`, `flagCode`, `SVGNS`, `hex` are all free.)

---

## 6. Flag fidelity rule

> **A compact CSS flag may only be included when it is faithful enough at ~30–34 px to
> be identified as the actual national flag. An approximation must never be labelled,
> shipped or described as a real flag.**

This is a product rule, not a technical preference, and it governs §7.

1. **Faithful-at-a-glance only.** If a viewer cannot name the country from the badge alone, the entry does not ship.
2. **Never call an approximation a flag.** The registry key is a country code. A gradient that is merely "flag-like" for a country whose real flag carries an emblem is misleading, not a shortcut.
3. **These countries must be individually justified before inclusion**, because their real flags carry emblems, cantons, seals or text that a gradient cannot express: **IR · US · CN · SG · TR · HK · KR · CA · GB**.
4. **When a country cannot be made faithful within the byte budget, keep the emoji fallback.** That is not a failure; it is the design working.
5. **Never degrade an uncovered flag to a monogram.** The monogram is reserved for "no assigned country pair at all". An uncovered-but-valid country keeps its emoji pair, exactly as today.
6. **Record the judgement per country.** The registry should carry, adjacent to each entry, the reason it is considered faithful — not infer coverage from whether the geometry happens to be cheap.

### Assessment of the scrutiny list (from the Phase 0.5 prototypes)

| Code | Country | Real flag needs | Verdict |
|---|---|---|---|
| IR | Iran | tricolour + central emblem + Kufic border text | **Marginal** — the three bands alone are recognisable; the omitted emblem must be accepted explicitly |
| US | United States | canton + 13 stripes | **Acceptable** — canton via `repeating-linear-gradient`, recognisable at 32 px (111–117 B) |
| CN | China | red field + five stars | **Excluded** — a gradient cannot draw stars; a plain red box is not the flag. Keep the emoji |
| SG | Singapore | crescent + five stars | **Excluded** — same problem. Keep the emoji |
| TR | Türkiye | red field + white crescent **and star** | **Marginal** — the crescent is drawable (two offset radials, 144 B) but the star is not; the omission must be accepted explicitly |
| HK | Hong Kong, China | five-petal bauhinia on red | **Excluded** — no gradient representation. Keep the emoji |
| KR | Korea | taegeuk + four trigrams | **Excluded** — no gradient representation. Keep the emoji |
| CA | Canada | maple leaf on a white pale | **Excluded** — no gradient representation. Keep the emoji |
| GB | United Kingdom | Union Jack — three counterchanged crosses | **Excluded** — no gradient representation. Keep the emoji |

**The consequence is uncomfortable and must be stated plainly:** the countries a gradient cannot serve faithfully (GB, HK, KR, CA, CN, SG) overlap heavily with the locations a proxy subscription page sees most. A "29-flag" count therefore overstates the product value. The fidelity rule is what stops the workstream from shipping a misleading badge to make a coverage number look better.

---

## 7. Coverage and the country set

### 7.1 Full ISO-3166 is not achievable in any encoding

The measured floor for a *library* set is 159,682 B of inner geometry. Even a hand-authored DSL — which only works for flags that are simple geometric compositions — costs 20,881 B for just 30 emblem-bearing flags, because arms, stars, crescents and union jacks have to be real path data. Full coverage lands somewhere around 20–40 KB at absolute best. The entire artifact is 203 KB and the ceiling is 204,800 B. **There is no budget for full coverage, in any encoding.**

### 7.2 The country set is NOT finalized

The set must not be locked until **all four** preconditions hold:

1. **Arcade Nova is settled** — its `components.css` and `layout.css` were rewritten *during* the Phase 0.5 study, so its 203,310 B was provisional. It has since gained a byte lock (§9.3), which is evidence the template is settling — but the lock must be **stable** (no further edits to that template) before the set is chosen. **Status at HEAD `347f828`: the template is frozen and byte-locked; no further edits have been made.**
2. **The remaining catalogue is frozen** — no new templates for a full release cycle. Every template added after a re-freeze invalidates that re-freeze for itself and changes the headroom arithmetic. **Status at HEAD `347f828`: SATISFIED — the catalogue is finalized at 15 core templates, all 15 frozen and byte-locked.**
3. **The Pulse Nova line-ending defect is resolved** by the workstream that owns it (§14), so headroom is measured against a clean checkout rather than a working-tree artifact. **Status at HEAD `347f828`: resolved — the frozen lock is the clean-checkout figure, 204,267 B.**
4. **Headroom is re-measured** on that frozen, clean tree — not against this snapshot. **Status at HEAD `347f828`: the frozen sizes ARE the clean-tree figures, so the headroom arithmetic can now be recomputed against §9.3 rather than §4.1.**

**The four preconditions are therefore satisfied as of HEAD `347f828`.** That removes
the *catalogue* blocker. It does **not** finalize the country set and it does **not**
authorise implementation: the `CODES` bitmap (§13) is still outstanding and §16's
recommendation still stands until an explicit decision is taken.

### 7.3 Selection criteria — three axes, not one

The set is chosen to optimize **usefulness + fidelity + byte cost together**. Optimizing byte cost alone produces a cheap set of countries nobody connects to; optimizing usefulness alone produces a set that cannot fit; ignoring fidelity produces a badge that lies. The three axes are ranked: **fidelity is a gate** (§6 — a country that fails it is out regardless of cost), **usefulness orders the survivors**, and **byte cost decides how deep the list goes**.

### 7.4 Cumulative cost of the recommended family (measured)

Family K (emoji-keyed CSS gradient, inline paint, `try/catch` guard). "Removed" is 0 B under progressive enhancement because `CODES` must be retained (§5); the right-hand block shows the alternative where `CODES` is additionally packed into a 116-byte base64 bitmap (**−649 B**, round-trip verified exact against all 258 codes).

`over` = templates exceeding 204,800 B. `under1KB` = templates with less than 1 KB of headroom *after* the change. Frozen set = **15** (all templates — `arcadenova` is now locked, §9.3). **Tightest headroom** = `pulsenova`'s remaining headroom (`533 − NET`); negative means it crosses the ceiling. **Recomputed 2026-09-19 against the current 15 frozen sizes**; the previous revision of this table was computed against the 14-template Phase 0.5 snapshot with a 383 B binding headroom.

| n | Codes covered | Registry | Renderer module | **NET** | Tightest headroom | over | under1KB |
|---|---|---|---|---|---|---|---|
| 0 | — | 0 | 122 | **+191** | 342 | 0 | 3 |
| **1** | DE | 61 | 183 | **+252** | 281 | 0 | 3 |
| **2** | DE FR | 129 | 251 | **+320** | 213 | 0 | 3 |
| **3** | DE FR NL | 191 | 313 | **+382** | 151 | 0 | 3 |
| 4 | +JP | 249 | 371 | +440 | 93 | 0 | 3 |
| 6 | +RU UA | 362 | 484 | +553 | **−20** ⚠ | **1** | 4 |
| **8** | +PL IT | 481 | 603 | **+672** | −139 | 1 | 4 |
| **9** | +ES | 543 | 665 | **+734** | −201 | 1 | 5 |
| 10 | +SE | 698 | 820 | +889 | −356 | 1 | 8 |
| 12 | +FI IR | 915 | 1,037 | +1,106 | −573 | 2 | 8 |
| 16 | +AE US TR AT | 1,352 | 1,474 | +1,543 | −1,010 | 4 | 10 |
| 24 | +BE IE RO HU BG EE LT ID | 1,855 | 1,977 | +2,046 | −1,513 | 8 | 13 |
| 29 | +MC BD LA TH DK | 2,283 | 2,405 | +2,474 | −1,941 | 10 | 13 |

**Read this table for the budget, not for the flag count.** Every row from n = 6
onward already breaks the ceiling on `pulsenova`, and even n = 4 leaves only 93 B —
far inside the ≥ 1 KB floor §10 sets. The affordable rows are the bitmap rows below,
not the raw ones.

**Same sets with the `CODES` bitmap (−649 B):**

| n | NET | Tightest headroom | over |
|---|---|---|---|
| 2 | −329 | 862 | 0 |
| 8 | **+23** | 510 | 0 |
| **10** | **+240** | 293 | 0 |
| 11 | +395 | 138 | 0 |
| 12 | +457 | 76 | 0 |

**Deliberately excluded by the fidelity rule, not by cost:** GB, HK, CN, SG, CA, KR, SA, IN, TW, VN, MY, BR. Per §6, no emblem flag was forced into the renderer. GB (Union Jack), HK, KR and CA (maple leaf) have no CSS-gradient representation that would be recognisable at 32 px; CN and SG need stars/crescents whose gradient approximations are misleading rather than helpful. `US` and `TR` remain **marginal** and require explicit sign-off before inclusion.

---

## 8. Exact files that would need changes

| File | Change | Kind |
|---|---|---|
| `src/scripts/flag.js` | add the `FLAGS` gradient registry + the forced-colors guard; `flagOf()` **unchanged** | edit |
| `src/scripts/explorer.js` | badge: add one conditional paint (~10 lines, **+69 B**) | edit |
| `src/scripts/config.js` | **none** — `flag: flagOf(name)` stays correct | — |
| `src/scripts/main.js` | **none** | — |
| `src/styles/components.css` + 14 `src/templates/*/components.css` | **none** — the badge is already a fixed square box | — |
| `tests/flag.test.mjs` | **none** — all 10 tests pass verbatim under the emoji-key design | — |
| `tests/config.test.mjs` | **none** — the three emoji assertions still hold | — |
| `tests/explorer.test.mjs` | 1 fixture: add `this.style = {};` to the hand-rolled `El` constructor (**9 B of test file, 0 B artifact**); add a painted-badge case | edit |
| `tests/build.test.mjs` | 4 individual byte-locks + `FROZEN_ARTIFACTS` table + per-template budget lines → **28 lock assertions at the snapshot, 30 now** (§9) | edit |
| `tools/verify.mjs` | optional: assert the `FLAGS` block contains no `url(` | edit |
| `template/index.html` | regenerated by `npm run build` | generated |
| `dist/templates/*/template.html` | regenerated (15 files) | generated |
| `out/_audit-baseline.html` | stale copy of the 202,976 B baseline; untested, will drift | housekeeping |
| `release/row-template-*.tar.gz`, `SHA256SUMS`, `manifest.txt` | regenerate | **release/panel-compatibility surface — coordinate** |
| `VERSION` | bump | **release/panel-compatibility surface — coordinate** |
| `installer/lib/row-template.sh` | `template.html.sha256` sidecars are regenerated, not edited | **release/panel-compatibility surface — coordinate** |

**No `layout.html` changes.** That is the test of whether the architecture goal was met.

> **On `src/index.html`:** it still exists in the tree, but **no template uses it any
> more**. `loadLayout()` in `tools/build.mjs` selects a template's own
> `src/templates/<id>/layout.html` when the file exists and only falls back to
> `src/index.html` otherwise — and **all 15 templates own a `layout.html`**, so the
> fallback is unreachable. The shared-shell model is retired for template layouts;
> `src/index.html` is now dead code, not a shared dependency. A change to it would
> therefore have **no effect on any artifact**, which is a stronger position than the
> original claim.

**`tests/explorer.test.mjs` detail.** The hand-rolled DOM's `El` class has **no `style` property** and its `doc` has **no `createElementNS`**. `badge.style.background = …` would throw `TypeError` and break that suite. The fix is `this.style = {};` in the `El` constructor. (The rejected SVG family would additionally need `createElementNS` on the fake document — one more reason it is the wrong shape.)

---

## 9. Impact on frozen SHA / byte-locks

`flag.js` is concatenated into the **shared** app script. A change to it therefore changes **every** built artifact — all 15, not only the ones that use flags.

### 9.1 The lock inventory at the Phase 0.5 snapshot, enumerated (not inferred)

> **Historical — do not quote these numbers as current.** This subsection is the
> Phase 0.5 snapshot inventory, retained because §9.2's invalidation logic was
> derived from it. **The current inventory is §9.3: 15 unique byte-locked templates,
> 15 byte assertions, 15 SHA assertions, 30 lock assertions.** The byte values and
> line numbers below were read from `tests/build.test.mjs` @ 42,762 B, sha
> `8cdebf24…`; the file is now 51,281 B and every line number has moved.

**Individual tests — 4** (`tests/build.test.mjs`). Each asserts a byte length *and* a SHA-256 on separate lines.

| # | Template | Byte assertion | SHA assertion | Test at line |
|---|---|---|---|---|
| 1 | `row` | `202976` (L137) | `2120e116…751cf6` (L140) | 132 |
| 2 | `editorial` | `203587` (L241) | `97e32111…cc58ed` (L245) | 238 |
| 3 | `canvas` | `203476` (L528) | `2c5c3892…7970f2` (L530) | 525 |
| 4 | `pulsenova` | `204417` (L613) | `3285990b…293c0f` (L617) | 610 |

**`FROZEN_ARTIFACTS` table — 10 rows** (L843–852). The loop at L855–867 runs one `test()` per row and performs a byte assertion (L858) and a SHA assertion (L862).

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

**Overlap: none.** The two sets are disjoint. **14 unique byte-locked templates of 15 at the snapshot** — **15 of 15 now** (§9.3).

| | Count at the snapshot | Current |
|---|---|---|
| Exact byte assertions | **14** (4 individual + 10 loop iterations) | **15** (4 + 11) |
| Exact SHA assertions | **14** (4 + 10) | **15** (4 + 11) |
| **Total exact lock assertions** | **28** | **30** |

At the snapshot, `arcadenova` was the only template with no byte lock — its lock was
deferred to the freeze phase. **That deferral is complete: `arcadenova` is now an 11th
`FROZEN_ARTIFACTS` row (203,310 B, sha `861577d2…`), so there is no unlocked template.**

### 9.2 What a shared-runtime change actually invalidates

| Assertion class | Count | Invalidated by a shared-runtime change? |
|---|---|---|
| Exact byte assertions | **15** | **Yes — all 15** |
| Exact SHA assertions | **15** | **Yes — all 15** |
| **Total** | **30** | **30** |
| `the committed artifact is not stale` (L114) | 1 | Only if `template/index.html` is *not* regenerated — a regeneration gate, not a lock |
| Budget inequalities (`<= 200 * 1024`, `<= 203 * 1024`) | 24 | Only those whose template crosses the line — magnitude-dependent |
| Shared-section parity (boot / locales / app / shell byte-for-byte) | — | **No** — they compare templates to each other |
| Installer / release suites | — | No exact artifact-size or hash pins exist (`release.test.mjs` uses `<=`; `installer.test.mjs` builds its own fixtures) |

**Net: 30 lock assertions to re-baseline** — 15 exact byte and 15 exact SHA, from 4 individual tests plus 11 `FROZEN_ARTIFACTS` rows (28 at the Phase 0.5 snapshot, before `arcadenova` was locked — §9.3). Add 1 regeneration gate for `template/index.html`, 15 regenerated artifacts, and the release payload. This is not a subtle change; it is a global re-freeze.

### 9.3 The current accounting — 15 / 15 / 15 / 30 (drift resolved)

The drift noted in earlier revisions is **resolved**, and the tree has since moved
further. At HEAD `347f828` the `FROZEN_ARTIFACTS` table has **11 rows**, not 10:

| # | Template | Bytes | SHA (prefix) | Note |
|---|---|---|---|---|
| 11 | `arcadenova` | 203310 | `861577d2…` | **added since the snapshot** |

The 11 rows currently pinned, read from `tests/build.test.mjs`: `prism` 202,127 ·
`terminal` 199,642 · `pulse` 202,075 · `brutal` 202,533 · `arcade` 203,033 ·
`sketch` 202,075 · `signature` 203,679 · `saffron` 203,057 · `prismnova` 202,967 ·
`terminalnova` 202,944 · `arcadenova` 203,310. The four individual locks are `row`
200,999 · `editorial` 203,848 · `canvas` 202,339 · `pulsenova` 204,267.

**Where each lock lives in the current file** (verified 2026-09-19 against HEAD
`347f828`; `tests/build.test.mjs` @ 51,281 B):

| Lock | Location |
|---|---|
| `row` — byte L138, SHA L139–141 | individual `test()` block |
| `editorial` — byte L242, SHA L244–246 | individual `test()` block |
| `canvas` — byte L638, SHA L640 | individual `test()` block |
| `pulsenova` — byte L748, SHA L750–752 | individual `test()` block |
| `FROZEN_ARTIFACTS` table | L977–988 (11 rows) |
| Loop over the table | L991, byte assertion L994, SHA assertion L998 |

| | Snapshot (Phase 0.5) | Current |
|---|---|---|
| `FROZEN_ARTIFACTS` rows | 10 | **11** |
| Unique byte-locked templates | 14 of 15 | **15 of 15** |
| Exact byte assertions | 14 | **15** |
| Exact SHA assertions | 14 | **15** |
| **Total lock assertions** | **28** | **30** |
| Unlocked templates | `arcadenova` | **none** |

**Consequence:** `arcadenova` is no longer the unlocked exception, and a
shared-runtime change now invalidates **30** lock assertions rather than 28. The
moving-target problem §10 warns about was real — a template was re-frozen *during*
this study — but it is now settled: the catalogue is final at HEAD `347f828`, so the
arithmetic below is stable. **Re-measure immediately before any re-freeze.**

---

## 10. Migration / re-freeze implications

Any change to the shared runtime is a **full-catalogue re-freeze**, so it must be a single deliberate act, not a sequence of small ones.

Required sequence:

1. **Isolate.** `git worktree add ../row-flag-renderer -b feat/flag-renderer` from the current `feat/v1.2-multitemplate`. Do not touch the main worktree — other workstreams are live in it.
2. **Confirm the catalogue is frozen.** No new templates for a full release cycle. Every new template added *after* the re-freeze invalidates the re-freeze for that template and must be re-locked anyway; adding templates *before* it changes the headroom arithmetic in §4.1. **Satisfied at HEAD `347f828`: 15 core templates, all 15 frozen and byte-locked (§9.3).**
3. **Confirm the tree is clean.** Headroom must be measured on a checkout without the Pulse Nova line-ending defect (§14), not on the working-tree artifact.
4. **Land the `CODES` bitmap first, as its own reviewed change** — *if and only if* it passes the seven approval requirements in §13. Do **not** bundle it silently with the renderer. Its 649 B reclaim is what makes an 8–10 flag set affordable (§7.4).
5. **Build and re-baseline.** `npm run build -- --all`, capture the 15 new sizes and SHAs, update the lock assertions enumerated in §9 (**30** as of the current tree; **28** at the Phase 0.5 snapshot), then `npm test` and `npm run verify`.
6. **Regenerate the release** — `tools/make-release.sh` — then bump `VERSION` and re-run the installer suite. This crosses into the release/panel-compatibility surface; coordinate rather than assume.
7. **Record the new baseline** in `CHANGELOG.md` with the reason: *"shared runtime changed; all 15 artifacts re-frozen"*, and refresh `out/_audit-baseline.html`.

> **Removed in Phase 0.6:** the previous step 3, *"Reclaim first. Land the `CODES` removal in the same commit as the renderer."* That instruction is **wrong** under the adopted architecture — `CODES` is load-bearing and must not be removed (§5, §13). It is replaced by step 4 above.

**Precondition that must hold before step 5:** the re-baselined `pulsenova` must land **below 204,800 B with meaningful margin** — not 533 bytes under. Self-imposed floor: **≥ 1 KB of headroom on the tightest template** before the re-freeze is declared good. Note that `pulsenova` is the binding constraint (§4.1), so the 1 KB floor is a statement about `pulsenova` specifically; at 533 B it is currently 467 B short of that floor.

---

## 11. Accessibility and security analysis

### Accessibility

| Concern | Position |
|---|---|
| Screen readers | The badge already carries `aria-hidden="true"` and the country is not announced. Keep that. Do **not** add `role="img"`, `<title>`, `<desc>` or an `aria-label` — it would make every row announce a redundant country name. |
| Keyboard / focus | The badge is a `<span>`; no focusable element is introduced. No `tabindex`. |
| Contrast / forced colors | **The one real hazard.** Forced-colors mode forces `background-image: none`, so a gradient-only badge becomes an **empty box**. The `matchMedia('(forced-colors: active)')` guard (49 B, read at paint time) keeps the badge on its emoji text under High Contrast — i.e. today's behaviour, exactly. Without the guard the design has a mode where the badge is blank. |
| Zoom / text scaling | The badge is a **fixed-pixel** box (30 / 32 / 34 px / 2 rem depending on template), so the flag does **not** track the user's font-size setting. This is a deliberate, documented limitation of the CSS-gradient family: the *label* scales with text zoom, the badge does not. A flag is a pictorial mark, so this is acceptable — but it must be stated, not glossed. |
| Motion / vestibular | None; no animation. |
| RTL | **No impact.** `90deg` is a physical angle; CSS backgrounds are unaffected by `direction` or `dir`. `src/styles/rtl.css` contains no `.cfg-flag` rule, and `dir` is set only on `<html>` and `.cfg-name`. Flags therefore render identically in LTR and RTL, and — importantly — they do **not** mirror, which is correct: national flags are not mirrored for RTL locales. |
| Degradation | Uncovered-but-valid code → the emoji pair, exactly as today. No assigned pair → monogram, exactly as today. Never a broken image, never an empty circle. |

### Security

| Vector | Assessment |
|---|---|
| Arbitrary user CSS | **Impossible.** Every value is a static literal in a shared module. The only input is `cfg.flag`, which `flagOf` derives by arithmetic from regional-indicator code points and validates against `CODES`. |
| Prototype pollution via the registry key | **Impossible.** The key is always exactly two code points from `U+1F1E6`–`U+1F1FF`, so it can never be `__proto__`, `constructor`, `prototype` or any other inherited name. No `Object.hasOwn` guard is needed — but the reason should be recorded. |
| Markup injection | **Impossible by policy and by construction.** `innerHTML`, `outerHTML` and `insertAdjacentHTML` are forbidden by `verify.mjs` and unused; the paint is a CSSOM property assignment with no parsing step. |
| Remote reference via `url(` | A gradient literal *can* contain `url(...)`. Nothing in the design does; an assertion that the `FLAGS` block contains no `url(` should be added so that it never can. |
| External `href` / `<use>` | Not used at all — there is no SVG, no `<image>`, no fragment reference. The "reaches for nothing" property is preserved, which matters because the page URL is itself a credential. |
| Data exfiltration | None. No network call, no beacon, no font fetch. |
| `verify.mjs` gate | Passes unmodified: no forbidden construct, no URL of any kind, still 1 `<style>` / 3 `<script>`, branding block untouched, regional indicators are **not** in the `INVISIBLE` set. |
| Reset / cleanup | **None required, and verifiable.** `buildList()` returns early if `host.firstElementChild` exists and `relabel()` touches only `.cfg-name` and button labels — a badge is created once and **never rebuilt or repainted**. A painted badge keeps its gradient; a fallback badge keeps its emoji; neither state can follow the other. |

---

## 12. Future test matrix

**Platforms**

| Target | Priority | What it proves |
|---|---|---|
| Windows 11 — Chrome | **P0** | the actual bug is fixed for covered codes |
| Windows 11 — Edge | **P0** | same engine, different vendor build |
| Windows 11 — Firefox | P1 | no double-drawing; uncovered codes still show Twemoji flags |
| macOS — Safari + Chrome | P1 | covered codes switch to the gradient; uncovered codes keep Apple emoji |
| Android — Chrome | P1 | mobile, metered connection, font stack |
| iOS — Safari | P2 | if a device is reachable; otherwise note as untested |
| Linux — Firefox/Chromium | P2 | Noto/Twemoji fallback |

**Modes and viewports**

- forced colors (Windows High Contrast) — the guard must keep the emoji/letters visible; the badge must never be blank
- `prefers-color-scheme: dark` and `light`, for all 15 templates
- 320 px, 390 px, 1440 px — badge must not reflow the row at any of them
- `prefers-reduced-motion` (regression guard; nothing animates)
- browser zoom 200 % — the badge is fixed-pixel; verify it neither clips nor overlaps

**Languages / direction**

- Persian RTL (`fa`), Arabic RTL (`ar`) — badge position, **no mirroring**, no clipping
- Chinese, Russian, Turkish labels alongside a flag — the `cleanName` separator tidy must still hold

**Data cases**

| Input | Expected |
|---|---|
| covered code (e.g. `🇩🇪`) | gradient badge |
| **uncovered but assigned code (e.g. `🇨🇦`, `🇬🇧`)** | **the emoji pair, unchanged** |
| unassigned pair (`🇿🇿`) | monogram |
| lone indicator | monogram |
| non-flag emoji (`🔥`, `🏳️`, `🏴`) | monogram; the emoji stays in the label |
| no emoji at all | monogram from the first letter |
| unicode name with no Latin characters | monogram from the first glyph |
| **50 and 100 configurations** | DOM weight, scroll performance, no paint leakage between rows |
| **one flag repeated 100 times** | proves the no-`<use>` decision was right, or exposes it |

**Gates**

- `npm test` green with all re-baselined lock assertions (§9 — **30** as of the current tree)
- `npm run verify` on every one of the 15 artifacts — 1 style, 3 scripts, no forbidden construct, no remote reference, no `url(` in the registry
- `npm run build -- --all` reports `OK` with **no template within 1 KB of 204,800 B**

---

## 13. The `CODES` bitmap — PROMISING, NOT APPROVED FOR PRODUCTION

**Status: promising, not approved. Do not land it as part of the renderer.**

Under the adopted architecture `CODES` is **semantically load-bearing and stays** (§5). Replacing its *representation* is a **byte-reclamation technique**, not a semantic removal: the same 258 codes remain the validity source, only the encoding changes.

| | Current | Packed |
|---|---|---|
| Representation | 14-line quoted literal + `new Set(( … ).split(' '))` | 676-bit bitmap (85 bytes) → **116 B** base64 + ~142 B decoder |
| Block size | **907 B** (773 list + 134 wrapper) | **258 B** |
| Reclaim | — | **−649 B** |
| Round-trip | n/a | **verified exact against all 258 codes** |

**Why it matters.** 649 B is worth more than the entire renderer at n = 8. With it, an 8-flag set costs **+23 B net** and a 10-flag set **+240 B with 293 B of margin** (§7.4). Without it, the same 8-flag set is +672 B and fails.

**Why it is not approved yet.** It replaces a reviewable list with an opaque blob, and it carries a real trap: the natural `new Uint8Array(676 / 8)` **truncates to 84 bytes and silently drops `ZW`** — a bug the Phase 0.5 prototype hit and fixed with `Math.ceil(676 / 8)`.

**Approval requirements (all seven):**

1. Round-trip equivalence proved in-repo against all **258** codes — not just in the prototype.
2. A regression test that **fails on the truncating form** (`676 / 8`), so the `Math.ceil` fix cannot be silently undone.
3. The decoder must be cheaper than the reclaim it funds — net **≤ −600 B** verified against the real built artifact.
4. Reviewed as its **own change with its own re-freeze**, never bundled silently with the renderer.
5. The opaque blob carries an adjacent human-readable list, **or** a generator script exists, so the code set stays reviewable.
6. `flagOf()`'s public behaviour is **bit-identical**: same inputs → same outputs for all 258 codes and every negative case.
7. A second reader independently confirms the bit order is stable and no endianness assumption is baked in.

---

## 14. Known defect outside this workstream — Pulse Nova line endings

**Reported, not owned by this workstream — and now RESOLVED.** Recorded here because it changed the headroom arithmetic this audit depends on.

| | |
|---|---|
| `dist/templates/pulsenova/template.html` **at the time of the defect** | **204,417 B** (150 CR bytes) |
| `dist/templates/pulsenova/template.html` **now** (HEAD `347f828`) | **204,267 B**, **0 CR bytes** — verified 2026-09-19 |
| Difference the defect accounted for | **150 CR bytes** |
| Contaminated files | **`pulsenova` only** — every other artifact had 0 CRLF pairs |
| Source of the contamination | `src/templates/pulsenova/components.css` had **158 CRLF pairs**; `src/scripts` (17 files) and `src/styles` (5 files) have 0 |
| Root cause | the build's comment-stripper splits on `\n` and left the trailing `\r` inside emitted CSS lines; the blank-line collapse consumed the remaining 8 CRs |
| Repo intent | `.gitattributes` declares `* text=auto eol=lf` — the repo stores LF, so the CRLF artifact was the anomaly |

**Consequences for this workstream:**

- **The defect is resolved.** `dist/templates/pulsenova/template.html` is now **204,267 B with 0 CR bytes**, matching the clean-checkout LF figure, and the frozen byte lock asserts that value (§9.3).
- **The binding headroom is therefore 533 B**, not 383 B: 204,800 − 204,267 = 533. This is the number used throughout §4.4 and §4.5.
- **383 B was the conservative figure and remains on the record as such.** While the defect was live, the byte-locked artifact was inflated by 150 CR bytes and the measured headroom was 383 B (204,800 − 204,417). This audit treated 383 B as binding during that window precisely because it was the more pessimistic number — any conclusion drawn against 383 B still holds against 533 B, so the earlier analysis is not invalidated, only understated.
- The defect belonged to the workstream that owns Pulse Nova and the build pipeline, not to Chat 3. It was resolved before the final catalogue freeze, and the current frozen Pulse Nova lock is based on the clean-checkout LF artifact, so the re-freeze is measured on a clean checkout (§10 step 3).

---

## 15. Implementation phases

| Phase | Work | Gate to leave the phase |
|---|---|---|
| **0** | Audit + cost study + this consistency pass | reviewed and accepted; **implementation deferred pending explicit approval** |
| **1 — Freeze** | Catalogue frozen; Pulse Nova line endings resolved; headroom re-measured on a clean tree | the four preconditions in §7.2 all hold |
| **2 — Reclaim** | Pack `CODES` into the bitmap (§13), as its own reviewed change. **No visual change.** | all seven §13 requirements met; `npm test` green |
| **3 — Renderer** | `flag.js`: `FLAGS` registry + guard. `explorer.js`: one conditional paint. Same isolated worktree. | Windows Chrome shows gradients for covered codes; uncovered codes unchanged; forced-colors safe |
| **4 — Tests and guards** | `explorer.test.mjs` fixture; `url(` assertion; extend `verify.mjs` if needed | `npm test` green locally |
| **5 — Re-freeze** | `npm run build -- --all`; re-baseline the lock assertions in §9 (**30**); refresh `out/_audit-baseline.html` | every artifact **≥ 1 KB** under 204,800 B |
| **6 — Release** | `make-release.sh`, `VERSION` bump, installer suite — **hand off to the release/panel-compatibility workstream** | installer and release suites green |
| **7 — Device pass** | Run §12 on real Windows/macOS/Android hardware | signed-off matrix attached to the PR |

Phases 2 and 3 may land in the same freeze window; a re-freeze between them would be pure churn. Phases 3–4 must be one commit.

---

## 16. Explicit recommendation

> ### DEFERRED — THE CATALOGUE FREEZE IS SATISFIED; IMPLEMENTATION STILL REQUIRES AN EXPLICIT DECISION.
>
> **The answer remains DO NOT IMPLEMENT until that decision is taken.** The
> catalogue-freeze prerequisite is now **satisfied** (HEAD `347f828`: 15 core
> templates, all 15 frozen and byte-locked), so the deferral now rests on the
> remaining grounds below — chiefly the absent byte budget and the outstanding
> `CODES` bitmap — not on a moving catalogue.

Reasoning, in order of weight:

1. **The budget does not exist yet.** The fixed floor of any renderer that touches the badge is **+191 B** — **36 % of the binding template's entire 533 B headroom before a single flag is drawn.** Nothing fits under +250 B; nothing fits under +533 B with acceptable margin (n = 3 lands at +382 B, which clears the ceiling by only 151 B — far inside the "≥ 1 KB of headroom" floor §10 sets, and n = 4 already lands at +446 B).
2. **The fidelity rule (§6) shrinks the set further than the byte budget does.** GB, HK, KR, CA, CN and SG — the locations a subscription page meets most — cannot be drawn faithfully as gradients and must keep the emoji. A "29-flag" count therefore overstates the product value, and the honest number is smaller.
3. **Full coverage is impossible in every encoding.** A library set is 159,682 B; a hand-optimised DSL is still 20–40 KB. The artifact is 203 KB with a 204,800 B ceiling. No encoding closes a 160 KB gap.
4. **Everything is frozen and byte-locked.** The change touches the shared runtime, so it invalidates the lock assertions in §9 — **30** as of the current tree, **28** at the Phase 0.5 snapshot — plus 15 artifacts and the released payload. That is affordable once, deliberately — not speculatively.
5. **The catalogue has stopped moving, which makes the arithmetic stable but the cost real.** `arcadenova` was added and rewritten during this study and re-frozen to a byte lock after the Phase 0.5 snapshot (§9.3). The catalogue is now final at HEAD `347f828`, so a re-freeze would no longer chase a moving target — but the 30 lock assertions it invalidates are now the *settled* ones, which makes the decision more consequential, not less.
6. **The affordable version needs the bitmap first.** With 649 B reclaimed, an 8-flag set costs **+23 B net** and a 10-flag set +240 B with 293 B of margin. Without it, the same set is +672 B and fails.

**What would change the answer to "implement":**

- ~~the four §7.2 preconditions all hold~~ — **these are now satisfied at HEAD `347f828`** (§7.2 records each one's status), **and**
- the `CODES` bitmap lands and passes all seven §13 approval requirements, **and**
- per-country fidelity sign-off is recorded for the final set, including the **marginal** cases IR and TR, **and**
- an explicit decision is recorded to accept the cost — 30 lock assertions, 15 artifacts and the released payload.

**What would change it to "do not implement" permanently:** acceptance that Windows Chromium shows `DE`/`FR` letters is tolerable, or a decision to move the badge to something non-flag (protocol icon, monogram everywhere) — which costs nothing and is consistent on every platform.

**Cheapest honest interim option, if Windows must be addressed before the freeze:** change nothing in the runtime, and note the limitation in the release notes. The monogram/emoji path already guarantees no broken state; the letters are a cosmetic degradation on one platform cohort, not a defect that hides data.

---

**Workstream status:** no production source, test, build, template, installer or version file was modified in any phase. `VERSION` = 1.1.0. The two figures quoted here at the time of writing were `template/index.html` = 202,976 B and `dist/templates/pulsenova/template.html` = 204,417 B — **both are historical**; at HEAD `347f828` they are **200,999 B** and **204,267 B** respectively. No worktree was created and no Git write was performed.

FLAG RENDERER RESEARCH COMPLETE — IMPLEMENTATION DEFERRED

---

**Superseded 2026-09-20.** The line above is the Phase 0 / 0.5 / 0.6 verdict and is retained
as the record of it. It no longer describes the tree. The renderer was implemented and
committed — `4a95cbc` — on top of the deterministic preview-capture infrastructure
(`9a37123`), with the regenerated previews at `a012108`. `pulsenova` is **204,542 B** with
**258 B** of headroom; all 15 artifacts are re-baselined and the 30 lock assertions pass.
See the **Phase 1 status** block at the head of this document for the shipped figures and
for the one gate that is *not* satisfied on exit: the §10 ≥ 1 KB headroom floor.

FLAG RENDERER IMPLEMENTED — COMMITTED AT `4a95cbc` — PREVIEWS REFRESHED AT `a012108`
