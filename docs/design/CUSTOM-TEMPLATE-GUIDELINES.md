# Custom Template Guidelines

**Status:** binding contract for every future custom template.
**Applies to:** any template added to this repository that is not one of the fifteen
frozen core designs.
**Companion documents:** `CUSTOM-TEMPLATES-PROPOSAL.md` (the design rationale and
phased plan), `CONTRIBUTING.md` (the general contribution process),
`UX-SPEC.md` (the interface specification).

---

## 0. How to read this document

Every requirement below is written so it can be **checked**, not just agreed with.
Where a requirement has a mechanical test, the test is named. A custom template is
accepted when the checks pass — not when the reviewer likes it.

The words **MUST**, **MUST NOT** and **MAY** are used in their RFC 2119 sense.

**This document changes nothing by itself.** It adds no registry entry, no folder,
no test and no code. It is the specification a future template will be held to.

---

## 1. Template Tiers

### 1.1 The two tiers

| | `core` | `custom` |
|---|---|---|
| who writes it | the maintainers | a user or the community |
| ships in the release | yes | optionally |
| **byte locked** | **yes** | **no** |
| changeable | only via an explicit freeze update | at will, by its author |
| held to the runtime contract | yes | **yes** |
| held to the accessibility contract | yes | **yes** |
| held to the artifact budget | yes | **yes** |

### 1.2 The single difference

> **The only difference between a core template and a custom template is the byte
> lock. Every runtime, accessibility and artifact requirement is identical.**

This is deliberate and is the whole point of the tier model. A custom template is
not a second-class template: it is a template that nobody has promised not to
change. It may not take a shortcut on the contract merely because it is not locked.

### 1.3 The fields

Tier and lock are declared by the registry entry, and the defaults are applied by
`applyTierDefaults()` in `tools/templates.mjs`:

```js
// core (the default — declaring nothing gives exactly this)
{ tier: 'core',   locked: true  }

// custom
{ tier: 'custom', locked: false }
```

- An entry that declares **neither** field is `core` and `locked`.
- An entry that declares `tier: 'custom'` is **unlocked by default**.
- An explicit `locked` wins in either direction. A core design still in development
  may set `locked: false`; a custom template may opt into a lock if its author
  wants one.
- An unrecognised `tier` value is **not** silently accepted as custom; it resolves
  to `core`.

The fields are applied at load time and an entry that declares them in the registry
literal is rejected — one source of truth, so the literal and the defaults cannot
drift.

**Checked by:** `tests/registry.test.mjs` — *"every template carries a tier and a
lock, and the defaults are core + locked"*, *"applyTierDefaults keeps the current
behaviour and defaults a custom entry to unlocked"*.

### 1.4 Ordering

`order` remains the only sorting mechanism.

- Core templates keep `order: 1…15`.
- **A custom template MUST use `order >= 200`.**
- The default template is `row` and a custom template MUST NOT become it.

The gap between 15 and 200 is intentional: it leaves room for future core designs
without a renumbering, and makes the two tiers distinguishable at a glance.

**Checked by:** `tests/registry.test.mjs` — *"core templates keep order 1..15 and a
custom template must use order >= 200"*, *"the selectable set is sorted by order…"*.

### 1.5 The frozen set

The frozen set is **core-only**. `FROZEN_ARTIFACTS` in `tests/build.test.mjs` holds
eleven of the fifteen; `row`, `editorial`, `canvas` and `pulsenova` hold individual
lock tests. The union is exactly the fifteen core templates.

> **A custom template MUST NOT appear in the frozen set.**

This is enforced structurally, not by convention: the lock table is a literal array
and the build reads only `styles` and `emitDataTemplate` off a registry entry, so no
entry can add itself to the frozen set. The test that pins this fails if a
`tier: 'custom'` id ever appears there.

**Checked by:** `tests/build.test.mjs` — *"the frozen set is exactly the fifteen core
templates, and a custom template can never enter it"*.

---

## 2. Mandatory Runtime Contract

Every custom template MUST satisfy the following. These are the same requirements
the fifteen core templates satisfy; there is no reduced contract for custom work.

| # | requirement | how it is checked |
|---|---|---|
| 2.1 | **79 required hooks, each exactly once** | `validateLayout()` + build tests |
| 2.2 | **`validateLayout()` PASS** | build tests |
| 2.3 | **Same boot runtime** — byte-identical to Row's | build tests |
| 2.4 | **Same application runtime** — byte-identical to Row's | build tests |
| 2.5 | **Same locale system** — the `#i18n-data` island byte-identical | build tests |
| 2.6 | **Exactly three `<script>` tags** — boot, locale island, app | build tests |
| 2.7 | **No duplicated runtime** — the template ships no copy of the runtime | build tests |
| 2.8 | **No custom scripts** unless explicitly approved | review |

### 2.1 The 79 hooks

`REQUIRED_HOOKS` in `tools/build.mjs` is the authoritative list. A template MUST
render every hook id exactly once — not zero times, not twice. The list covers the
status block, the traffic readout and meter, the expiry block, the actions, the
config explorer (search, list, toggle, empty state), the client list and platform
tabs, the announcement, the support link, both dialogs and the live region.

**A missing hook is a broken page, not a design choice.** The runtime fills these
by id; a hook that is absent means a feature that silently does nothing.

### 2.6 Why exactly three scripts

The artifact carries three `<script>` elements and no more:

1. the boot script (runs before first paint, sets `data-js`),
2. the locale island (`type="application/json"`, id `i18n-data`),
3. the application script.

A fourth script means a template is carrying its own JavaScript. **That is not
permitted.** The runtime is shared precisely so that fifteen — or fifty — templates
cannot each drift into their own dialect of the same behaviour.

### 2.8 Requesting a custom script

If a design genuinely cannot be expressed without script, it MUST be raised as an
explicit, reviewed exception **before** the template is built. The default answer is
no. A template that adds script is not a custom template; it is a change to the
runtime, and the runtime is not per-template.

---

## 3. Layout Ownership Rules

### 3.1 Every template owns its layout

A custom template MUST live at:

```
src/templates/<id>/
├── layout.html
├── tokens.css
├── base.css
├── layout.css
├── components.css
└── rtl.css
```

All six files MUST be present. `layout.html` is the document; the five stylesheets
are the cascade, in that order.

> **Historical note:** `row` keeps its CSS in `src/styles/` rather than
> `src/templates/row/`. That is a legacy arrangement from when Row *was* the shared
> shell. It is the only exception and MUST NOT be copied by a custom template.

### 3.2 No cross-template imports

- A template **MUST NOT** import, reference or `@import` another template's
  stylesheet.
- A template **MUST NOT** reference another template's asset directory.
- **Shared runtime is allowed and expected.** Shared *visual structure* is
  forbidden.

The distinction matters: templates share behaviour (the runtime, the locale island,
the hook ids) and share nothing visual. Copying Row's `components.css` into a new
template is not "reusing the design system" — it is shipping Row a second time under
a different name, and it defeats the purpose of having a catalogue.

### 3.3 The stylesheet contract

Each stylesheet has one job. Keeping to it is what makes a template reviewable:

- **`tokens.css`** — every value a theme can change, and nothing else. Both
  `[data-theme="dark"]` and `[data-theme="light"]` blocks MUST be present. The
  `/* row:font-face */ … /* row:font-face end */` marker pair MUST be present with
  `__FONT_BASE64__` inside, and the `[lang="fa"], [lang="ar"]` block MUST be present.
- **`base.css`** — reset, document shell, primitives. No component styling.
- **`layout.css`** — the page skeleton. Placement only; no component styling.
- **`components.css`** — the component vocabulary.
- **`rtl.css`** — only the rules that genuinely differ by direction.

The rest of the cascade MUST read custom properties and never a literal colour,
size or duration.

---

## 4. RTL / Localization Requirements

Every custom template MUST support **English, Persian and Arabic**. Persian and
Arabic are first-class, not a later addition.

### 4.1 Logical properties

- **MUST** use logical properties throughout: `margin-inline`, `padding-block`,
  `inset-inline-start`, `border-inline-end`, `inline-size`, `block-size`.
- **MUST NOT** hardcode `left` / `right` for anything that should mirror.
- The handful of genuinely physical values MUST be isolated in `rtl.css` with a
  comment explaining why they cannot be logical.

### 4.2 Direction and bidi

- Setting `dir` on `<html>` MUST be sufficient to mirror the whole page.
- Values whose script is known to be Latin — figures, units, URLs, protocol names —
  MUST be isolated so the surrounding direction cannot reorder them.
- Content whose direction is genuinely unknown (a service name, a config name) MUST
  carry `dir="auto"`.
- Arabic and Persian MUST get the Arabic font face and relaxed line-height; the
  monospace face has no Arabic glyphs and faux-mono tracking closes the joins that
  carry the script.

### 4.3 No horizontal overflow

**The artifact MUST NOT scroll horizontally at any tested viewport.** This is a
hard requirement, not a preference.

### 4.4 Required viewport tests

A custom template MUST be tested at:

| width | class |
|---|---|
| **320px** | narrowest supported phone |
| **390px** | common phone |
| **430px** | large phone |
| **1440px** | desktop |

At each width, in **both** `fa` and `ar`, the reviewer MUST confirm: no horizontal
overflow, correct mirroring, no text collision, no clipping, and no section that
accidentally stayed LTR.

---

## 5. Accessibility Requirements

### 5.1 Tap targets

> **Every interactive element MUST have a minimum tap target of 44px.**

This applies to **buttons, links, tabs, dialog controls and dropdown items**. There
are **no exceptions**.

The floor is stated once per template rather than patched rule by rule, because
per-rule patching is how it gets missed:

```css
.ctl,
.btn,
.btn-sm,
.tab,
.menu-item,
.cfg-toggle { min-block-size: var(--tap); }
```

**A note from the audit that found a real defect here:** enumerating selectors is
fragile. Signature shipped a 40px target for months because its tap floor listed
eight selectors and the offending control — an announcement "show more" toggle —
was the ninth. **State the floor on the element type where you can, and measure it
rather than trusting the list.**

**Checked by:** the tap-target measurement in the RTL audit, which reports the
minimum computed height of every `button`, `a.btn`, `input` and `[role="tab"]` on
the page. A template is not accepted while that number is below 44.

### 5.2 The rest

- Every interactive element MUST be reachable and operable by keyboard.
- Focus MUST be visible.
- A control that is disabled MUST be marked as such, not merely styled dimmer.
- State MUST NOT be communicated by colour alone — every state carries a word or a
  shape as well as a colour.
- Colour contrast MUST meet WCAG AA in both themes.
- The dialogs MUST trap focus, close on Escape, and restore focus on close.
- Motion MUST respect `prefers-reduced-motion`.

---

## 6. Artifact Rules

### 6.1 One self-contained file

Every template produces **one self-contained HTML artifact**. That is the product.

### 6.2 No network dependency

- **MUST NOT** reference a remote asset.
- **MUST NOT** load an external font.
- **MUST NOT** make any network request at render time.

A template that fetches anything is broken offline, leaks a request to a third
party, and cannot be verified by checksum. Assets MUST be **inlined at build time**
as data URIs, following the pattern the Arabic font already uses
(`__FONT_BASE64__`).

### 6.3 Deterministic output

The same sources MUST always produce byte-identical output. The build is
deterministic by construction; a template must not defeat it with a timestamp, a
random value or an environment-dependent branch.

### 6.4 Budget

The artifact MUST stay within the enforced ceiling:

| | |
|---|---|
| soft target | 185 KiB |
| **hard ceiling** | **204,800 bytes** |

A custom template is held to the same ceiling. Inlined assets count. A template that
only fits by trimming another template's budget does not fit.

### 6.5 Line endings

Source files MUST be LF. `.gitattributes` carries `* text=auto eol=lf`, so the
repository normalises on commit — but a CRLF working copy has caused a real defect
here before, so it MUST be verified with a CR count rather than assumed.

---

## 7. Design Rules

A custom template MUST have:

- **a unique visual identity** — it must be distinguishable from the other
  templates at a glance;
- **intentional hierarchy** — the reader must know what matters without being told;
- **a readable mobile layout** — mobile is a composition, not a stack of the desktop
  columns;
- **a premium appearance** — deliberate spacing, deliberate type, nothing accidental;
- **grayscale recognisability** — see below.

### 7.1 The grayscale test

> **With colour removed and text blurred, the template MUST still be distinguishable
> from every other template in the catalogue.**

Colour, fonts, border radius and spacing are **not** structural differentiation. If
two templates differ only in hue and corner radius, they are the same template.
Structure — the dominant geometry, how the status reads, how a record is shaped, how
the client area is organised — is what distinguishes them.

### 7.2 Avoid

- **copying an existing template.** A custom template that is Row with a different
  accent is not a new template.
- **generic cards everywhere.** A page of interchangeable boxes is a wireframe, not
  a design.
- **excessive gradients.** Decoration that carries no meaning competes with the
  information that does.
- **unnecessary animations.** Motion that does not explain a change is noise, and it
  costs bytes.

---

## 8. Testing Requirements

A custom template MUST NOT be accepted until all of the following pass.

### 8.1 Required suites

| suite | requirement |
|---|---|
| **build tests** | the template's own deterministic/budget test passes |
| **registry tests** | tier, order and shape rules pass |
| **release tests** | the release payload still builds deterministically |
| **`verify.mjs`** | all checks pass on the built artifact |
| **fixture tests** | all 31 fixtures render with zero failures |
| **hook validation** | 79/79 exactly once, `validateLayout` PASS |

### 8.2 Required visual evidence

| evidence | requirement |
|---|---|
| **RTL audit** | `fa` and `ar` at 320 / 390 / 430 / 1440, no overflow, min tap ≥ 44 |
| **mobile screenshots** | 320, 390, 430 — dark and light |
| **desktop screenshots** | 1440 — dark and light |
| **stress screenshots** | 100 configurations, long service name, both dialogs |

### 8.3 Regression

> **Adding a custom template MUST NOT change any core artifact by a single byte.**

This is checked by comparing all fifteen core artifacts before and after. If one
byte moves, the change is rejected and investigated — the custom template is
additive by definition, and an additive change cannot alter a frozen artifact.

---

## 9. Branding Rules

### 9.1 Branding is subscription data

> **A template MUST NOT override subscription branding.**

The logo and the service name belong to the **subscription**, not to the template
design. They arrive at runtime and fill `#brand-mark` and `#brand-name`. A template
styles those hooks; it does not decide what goes in them.

This is a correctness rule, not a style rule. If a template could override the
branding, then a user's own logo would change depending on which template they
picked — which is exactly backwards.

### 9.2 Logo assets

- A logo MUST be supplied **separately**, as subscription data.
- A template MUST NOT assume a logo exists. It MUST style a sensible fallback in
  `.brand-mark` and MUST NOT break when no logo is configured.
- A template MUST NOT ship a hardcoded brand name.

### 9.3 What a template may own

Type, spacing, colour, structure, the shape of a record, the layout of the page.
Not the identity of the service being displayed.

---

## 10. First Custom Template Preparation

The first custom template is the reference implementation. It sets the precedent, so
its constraints are stricter than the ones that follow.

The first custom template MUST:

1. **not replace Row** — Row remains the reference minimal template and the default;
2. **not become `DEFAULT_TEMPLATE`** — that is a product decision, not a side effect
   of adding a template;
3. **not modify any core template** — no source, no artifact, no lock;
4. **use `order >= 200`** — so it sorts after every core template;
5. **declare `tier: 'custom'`** — and therefore be unlocked by default;
6. **satisfy every requirement in this document** — sections 2 through 9;
7. **leave all fifteen core artifacts byte-identical** — verified before and after.

It SHOULD:

8. be reviewed against `CUSTOM-TEMPLATES-PROPOSAL.md` §11 before its registry entry
   is added, because that is where the migration risk is analysed;
9. be added in its own commit, with no other change, so any drift is unambiguous.

---

## Appendix A — Acceptance checklist

A custom template is accepted when every line below is true.

**Registry**
- [ ] `tier: 'custom'` declared; `locked` false (or explicitly set)
- [ ] `order >= 200`
- [ ] `available` set correctly for the release it ships in
- [ ] `DEFAULT_TEMPLATE` is still `row`

**Runtime**
- [ ] 79 hooks, each exactly once
- [ ] `validateLayout()` PASS
- [ ] exactly three `<script>` tags
- [ ] boot and app scripts byte-identical to Row's
- [ ] locale island byte-identical
- [ ] no per-template JavaScript

**Layout**
- [ ] all six files present under `src/templates/<id>/`
- [ ] no import of another template's stylesheet or assets
- [ ] `tokens.css` carries both themes, the font-face marker and the `fa`/`ar` block

**RTL and localisation**
- [ ] logical properties throughout
- [ ] `dir="auto"` on genuinely unknown-direction content
- [ ] no horizontal overflow at 320 / 390 / 430 / 1440, in `fa` and `ar`

**Accessibility**
- [ ] every interactive element ≥ 44px, measured not assumed
- [ ] keyboard operable, visible focus, focus-trapping dialogs
- [ ] no state conveyed by colour alone
- [ ] WCAG AA contrast in both themes

**Artifact**
- [ ] single self-contained file
- [ ] no remote asset, no external font, no network request
- [ ] deterministic output
- [ ] within 204,800 bytes
- [ ] LF line endings

**Design**
- [ ] unique identity, distinguishable in grayscale
- [ ] intentional hierarchy; mobile is a composition, not a stack
- [ ] no copied template, no card soup, no decorative gradients, no gratuitous motion

**Branding**
- [ ] does not override subscription branding
- [ ] tolerates a missing logo

**Regression**
- [ ] all fifteen core artifacts byte-identical
- [ ] build / registry / release / verify / fixtures all green

---

## Appendix B — What this document does not do

This document is a specification. It adds no code, no registry entry, no folder and
no test. Creating it changed nothing about the build, the runtime or any artifact.

Implementing the tier mechanism it describes is Phase 1 of
`CUSTOM-TEMPLATES-PROPOSAL.md`. Adding the first custom template is Phase 4. Neither
is authorised by this document.
