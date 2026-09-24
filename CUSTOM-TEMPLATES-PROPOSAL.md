# Custom Templates — Architecture Proposal

**Status:** proposal only. Nothing in this document has been implemented.
**Scope:** how to add third-party/custom templates to Row-Template without
touching the fifteen frozen core templates.
**Audience:** maintainers of this repository.

---

## 1. Why this document exists

The catalogue currently ships fifteen templates. All fifteen are frozen: each has
an approved byte/SHA lock, and a change to any of them is a deliberate,
human-approved event. That model is what makes the project safe to release, and it
must not be weakened.

The pressure now is to let people add their *own* templates — `aurora`, `mitzu`,
`nikvand`, and whatever comes after — without:

- re-freezing or re-approving the core fifteen,
- forking the build,
- forking the runtime,
- or turning every new template into a maintenance liability.

The proposal below is a **layering** answer, not a plugin system. It adds one
concept — a template *tier* — and leaves the existing pipeline intact.

---

## 2. Goals and non-goals

**Goals**

1. A custom template is additive: adding or removing one cannot change any core
   artifact by a single byte.
2. A custom template is held to the same *contract* as a core template (hooks,
   runtime parity, budget), but not to a byte lock.
3. The shared runtime, locales and build pipeline are untouched.
4. Registration is one entry in one file.
5. Assets are handled by the build, not at runtime.

**Non-goals**

- A runtime plugin loader. The artifact is a single self-contained HTML file; there
  is no runtime to load plugins into.
- Per-template JavaScript. The hook contract explicitly forbids it.
- Moving or renaming any existing core template as part of this work.
- A visual/theme editor.

---

## 3. Current architecture (as-is, factual)

```
src/
  index.html                 # legacy shared shell — no template uses it any more
  styles/                    # row's CSS (row has always lived here)
  templates/<id>/
    layout.html              # every template owns its own DOM
    tokens.css
    base.css
    layout.css
    components.css
    rtl.css
  scripts/                   # shared runtime — never per-template
  locales/                   # shared locale island — never per-template
tools/
  templates.mjs              # TEMPLATES registry, DEFAULT_TEMPLATE, resolveTemplate()
  build.mjs                  # build(), buildLocales(), validateLayout(), REQUIRED_HOOKS
  verify.mjs
  fixtures/
tests/
  build.test.mjs             # byte locks + architecture contracts
  registry.test.mjs
  release.test.mjs
```

**Registry entry shape** (`tools/templates.mjs`):

```js
row: {
  id: 'row',
  name: 'Row',
  order: 1,
  available: true,
  emitDataTemplate: false,
  layout: true,
  styles: [
    ['src/styles/tokens.css', 'styles/tokens.css'],
    /* … */
  ],
},
```

**Build exports** (`tools/build.mjs`):
`build(withFont, id)`, `buildLocales()`, `stripModuleSyntax()`, `validateLayout()`,
`REQUIRED_HOOKS`.

**Registry exports:** `TEMPLATES`, `DEFAULT_TEMPLATE = 'row'`, `templateIds()`,
`availableTemplateIds()`, `resolveTemplate(id)`.

**Hard invariants that already exist and must survive:**

| invariant | where enforced |
|---|---|
| 79 hooks, each exactly once | `validateLayout()` + build tests |
| exactly 3 `<script>` tags, no per-template JS | build tests |
| boot + app scripts byte-identical to Row's | build tests |
| locale island byte-identical | build tests |
| single `<style>` block, no unsubstituted tokens | build tests |
| artifact ≤ 204,800 bytes | build tests |
| one `/* row:branding */` marker | build tests |
| `row:font-face` marker present with the font inlined | build tests |

---

## 4. Proposed structure

```
src/templates/
├── core/
│   ├── row/          # note: row's CSS stays in src/styles/ (see §9.3)
│   ├── pulse/
│   ├── prism/
│   └── …             # the fifteen frozen templates
└── custom/
    ├── aurora/
    ├── mitzu/
    └── nikvand/
```

The **only** structural change is the `core/` and `custom/` split. Every template
directory keeps exactly the same internal layout it has today.

**Tier is metadata, not a directory convention the build infers.** The build reads
`tier` from the registry; it does not care where the files physically live. That
keeps the split reversible: if the two-tier layout turns out to be wrong, moving
directories back is a registry edit plus a `git mv`.

---

## 5. Template metadata system

Extend the existing registry entry with four optional fields. **All four default
to the current behaviour**, so adding them changes no existing artifact.

```js
aurora: {
  id: 'aurora',
  name: 'Aurora',
  order: 200,                 // core uses 1–15; custom starts at 200
  available: true,
  emitDataTemplate: true,
  layout: true,

  // NEW — defaults keep core behaviour identical:
  tier: 'custom',             // default 'core'
  locked: false,              // default true for tier:'core', false for 'custom'
  assets: {},                 // default {} — see §8
  tokens: null,               // default null — see §6

  styles: [
    ['src/templates/custom/aurora/tokens.css',     'templates/aurora/tokens.css'],
    ['src/templates/custom/aurora/base.css',       'templates/aurora/base.css'],
    ['src/templates/custom/aurora/layout.css',     'templates/aurora/layout.css'],
    ['src/templates/custom/aurora/components.css', 'templates/aurora/components.css'],
    ['src/templates/custom/aurora/rtl.css',        'templates/aurora/rtl.css'],
  ],
},
```

**`order` is the compatibility lever.** Core templates keep `order: 1…15`. Custom
templates start at `200`. Anything that sorts by `order` — the picker, the docs
table, `availableTemplateIds()` — therefore keeps core first, in the same order,
with custom templates appended. No existing ordering changes.

**`locked` decides test behaviour, not build behaviour.** The build emits a
custom template exactly like a core one. `locked: false` means the test suite
asserts the *contract* for that template but not a byte hash. This is the single
most important rule in this document: **the lock table stays core-only.**

---

## 6. Theme token overrides

Every template already owns `tokens.css`, and the stylesheet only ever reads
custom properties. So a custom theme is already expressible today with no new
mechanism — a custom template ships its own `tokens.css`.

The proposal adds **nothing** here, deliberately. A `tokens` field that merged
overrides into a core token file would create a second source of truth and make
core artifacts depend on custom files. **Rejected.**

What a custom template must preserve in its `tokens.css`:

- the `/* row:font-face */ … /* row:font-face end */` marker pair with
  `__FONT_BASE64__` inlined — the build substitutes it, and the `row:font-face`
  marker is asserted exactly once;
- both `[data-theme="dark"]` and `[data-theme="light"]` blocks;
- the `[lang="fa"], [lang="ar"]` block, including the Arabic font swap and the
  relaxed line-height.

Everything else in `tokens.css` is the template's own business.

---

## 7. Branding variables

Branding already flows through the runtime, not the template: the logo arrives as
a data URI on the sub-data element, and `#brand-mark` / `#brand-name` are filled at
runtime. A custom template therefore inherits branding for free as long as it
renders those two hooks.

**Recommendation:** document the branding hooks as part of the contract rather
than adding a branding config file. The existing arrangement is already correct —
branding is per-*subscription*, not per-*template*, and conflating the two would
mean a template could override a user's own logo.

If a template needs a fallback mark when no logo is configured, it should style
`.brand-mark` (which is what all fifteen do) and must not assume the logo exists.

---

## 8. Custom asset handling

This is the one genuinely new capability, and it has a hard constraint:

> **The artifact is a single self-contained HTML file. It cannot reference an
> external asset at runtime.**

Therefore every asset must be **inlined at build time** as a data URI. The
existing font already works this way (`__FONT_BASE64__`). Custom assets should
follow the same pattern.

Proposed registry field:

```js
assets: {
  '__LOGO_SVG__': 'src/templates/custom/aurora/assets/logo.svg',
},
```

The build reads each file, base64-encodes it, and substitutes the placeholder in
the template's CSS and layout — reusing the same substitution pass that already
handles `__FONT_BASE64__`, `__STYLES__`, `__LOCALES__` and `__BOOT__`/`__APP__`.

Rules:

1. **Assets are per-template.** A custom template may not reference a core
   template's asset directory.
2. **The build fails on an unresolved placeholder.** This already happens — the
   build asserts no `/*__TOKEN__*/` survives — and must extend to asset
   placeholders.
3. **Budget applies.** Inlining grows the artifact. A custom template with a large
   logo is still bound by the 204,800-byte ceiling, and the build should report
   the per-asset cost so the author can see it before shipping.
4. **No remote URLs.** A `https://` asset reference would make the artifact
   non-self-contained and leak a request to a third party. Reject at build time.

---

## 9. Template registration

### 9.1 Adding a template

One entry in `TEMPLATES`, in the custom block, with `tier: 'custom'`. Nothing else
in the build changes.

### 9.2 Discovery

`availableTemplateIds()` currently returns templates where `available === true`.
It should keep returning core first, then custom, sorted by `order`. This is
already the behaviour if custom templates use `order ≥ 200`; the proposal only
makes it an explicit, tested guarantee.

### 9.3 The `row` special case

Row's CSS lives in `src/styles/`, not `src/templates/row/`, because Row *was* the
shared shell. Every other template owns `src/templates/<id>/`.

**Proposal: leave it exactly as it is.** Moving Row's CSS into
`src/templates/core/row/` would be tidier but would touch the frozen artifact's
build inputs for a purely cosmetic reason. The registry already abstracts the
paths, so the inconsistency costs nothing and is documented in one place. Revisit
only if a future refactor is already touching Row's artifact.

### 9.4 `DEFAULT_TEMPLATE`

Stays `'row'`. A custom template must never become the default implicitly — the
default is a product decision, not an `order` side effect.

---

## 10. Compatibility with the existing runtime

The runtime (`src/scripts/**`) and locales (`src/locales/**`) are **not touched**
by this proposal, and custom templates do not get to touch them either.

A custom template's obligations are exactly the core templates' obligations:

- render all 79 hooks, each exactly once;
- include `<div id="sub-data">` with the full `data-*` attribute set;
- include `#announce-source`, `#links-source`, the `#i18n-data` island, the QR and
  config dialogs, and `#live-region`;
- emit exactly three `<script>` tags — boot, locale island, app — with the same
  bodies as Row's;
- carry the `/* row:branding */` marker once.

These are already machine-checked by `validateLayout()` and the build tests. The
proposal is to **run those same checks for custom templates**, so a custom
template that breaks the contract fails the suite the same way a core one would.

**This is the load-bearing idea:** the *contract* is shared and enforced; only the
*byte lock* is tier-specific.

---

## 11. Migration safety

This is the section that matters most, because it is the one that can break
existing users.

### 11.1 What must not change

- The fifteen artifacts stay byte-identical. Same bytes, same SHA-256.
- `template/index.html` (the published default) stays byte-identical.
- `DEFAULT_TEMPLATE` stays `'row'`.
- The runtime and locale islands stay byte-identical.
- No public URL, filename or `data-template` value changes.

### 11.2 The risky step

**Moving directories is the only step that can plausibly break byte-identity**,
and only if the build ever embeds a source path into the output. It should not —
the CSS content is what gets inlined, and moving a file does not change its
content — but "should not" is not good enough for a public release.

Therefore:

1. Before the move: record all fifteen byte/SHA values.
2. Move with `git mv` so history follows.
3. Update only the `styles` source paths in the registry. **Do not touch the
   destination paths** — those are emitted into `dist/` and into the artifact.
4. Rebuild and compare all fifteen against the recorded values.
5. If a single byte differs, revert and investigate before proceeding.

Step 3 is the subtle one: `['src/…/tokens.css', 'templates/aurora/tokens.css']` —
the second element is the artifact's internal path. Changing the first element is
safe; changing the second changes the artifact.

### 11.3 Sequencing

Do the split in its own commit, with **no new templates**, so that any byte drift
is unambiguously attributable to the move. Only after that commit is verified
should custom template support land.

### 11.4 Test changes

- The lock table stays core-only. Do not add custom templates to it.
- Add a registry test asserting every `tier: 'custom'` template has
  `locked: false` and an `order ≥ 200`.
- Add a test asserting the core lock table has exactly fifteen entries and that
  their order matches `order: 1…15`.
- The architecture-contract tests should iterate over *all* templates, so a custom
  template is held to the runtime contract from the day it is added.

---

## 12. Rollout phases

| phase | content | risk |
|---|---|---|
| 0 | This document. No code. | none |
| 1 | Add `tier`/`locked` to the registry, defaulting to core behaviour. Prove all fifteen artifacts unchanged. | low — metadata only |
| 2 | Move `src/templates/<id>` → `src/templates/core/<id>` with `git mv`; update source paths only. Prove all fifteen artifacts unchanged. | **medium — the one risky step** |
| 3 | Extend the substitution pass to asset placeholders; add the unresolved-placeholder failure. | low |
| 4 | Add the first custom template as a reference implementation. | low |
| 5 | Document the authoring workflow in `CONTRIBUTING.md`. | none |

Phases 1 and 2 must each end with a byte-identity proof over all fifteen. No phase
starts before the previous one is green.

---

## 13. Risks and open questions

**Risks**

1. **Two-tier drift.** If core and custom templates diverge in structure, the
   build grows branches. Mitigation: the only difference is `locked`; everything
   else is shared.
2. **Budget pressure.** Custom templates with large assets could push the
   catalogue's expectations. Mitigation: report per-asset cost at build time; keep
   the ceiling global.
3. **Contract erosion.** Someone will eventually want a custom template with its
   own JavaScript. The answer is no, and it should be written down here rather
   than relitigated each time.
4. **Directory move.** Covered in §11. It is the only step that can plausibly
   break a frozen artifact, and it is entirely avoidable if the project decides
   the split is not worth it.

**Open questions for the maintainer**

1. Should custom templates ship in the released catalogue, or only in a
   user-supplied directory that the build reads? The former is simpler; the latter
   keeps the release surface small.
2. Should `order: 200+` be enforced, or merely conventional? Enforcing it makes
   the ordering guarantee testable.
3. Do custom templates need their own budget line, or the global ceiling? The
   global ceiling is simpler and already tested.
4. Is the `core/` + `custom/` split worth the §11 risk at all, given the registry
   already abstracts paths? **This is the question to answer first** — if the
   answer is no, phases 3–5 can proceed without any directory move.

---

## 14. Summary

- One new concept: a template **tier** (`core` | `custom`).
- Core templates keep their byte locks and stay byte-identical throughout.
- Custom templates are held to the same **contract**, but not to a byte lock.
- Assets are inlined at build time; the artifact stays self-contained.
- The runtime and locales are untouched.
- The only step that can break a frozen artifact is the directory move, and it is
  isolated, sequenced, and verifiable by a fifteen-way byte comparison.

Nothing here is implemented. No directories were created, no files were moved, and
no architecture was changed.
