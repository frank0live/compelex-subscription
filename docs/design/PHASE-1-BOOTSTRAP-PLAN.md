# Phase 1 Bootstrap Plan

**Status:** plan only. Nothing in this document has been executed.
**Prepared for:** Phase 1 of the documentation programme.
**Depends on:** `ADR-0001-DOCUMENTATION-FRAMEWORK.md` (approved — Astro Starlight),
`DOCUMENTATION-IMPLEMENTATION-PLAN.md` (§5 workspace, §8 Phase 1, §9 gates),
`DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md` (the tokens and components).

---

## 0. Repository state as inspected

Read before writing, on 2026-09-18.

| fact | value | consequence for this plan |
|---|---|---|
| `docs/` exists | yes, with `docs/assets/` holding 3 tracked PNGs | the workspace **extends** `docs/`; it does not replace it |
| `docs/dist/` | **not gitignored** | a rule must be added — `.gitignore` uses root-anchored `/dist/` |
| `docs/node_modules/` | **already gitignored** | the pattern `node_modules/` is unanchored and matches at any depth. **Do not add a redundant rule.** |
| Node | v22.22.2 | satisfies Astro's requirement (18.17.1+ / 20.3.0+ / 22+) |
| npm | 10.9.7 | available |
| root `package.json` | `0` runtime, `0` dev dependencies; no `workspaces` field | the docs workspace cannot be declared here; it needs its own manifest |
| root scripts | `build`, `verify`, `test`, `fixtures`, `preview` | **none of them may gain a docs entry** |
| test suite | 14 files, `npm test` | the gate |
| `VERSION` | 1.1.0 | not touched |

**The one thing this inspection changes:** `docs/node_modules/` is already ignored but
`docs/dist/` is not. A plan that added both would add a redundant rule; a plan that
added neither would commit build output. Only `docs/dist/` needs a rule.

---

## 1. Astro Starlight workspace structure

```
docs/
├── package.json            # the docs manifest — the framework's deps live ONLY here
├── astro.config.mjs        # Starlight integration, locales, dir:'rtl', sidebar
├── tsconfig.json           # Astro's default; no path aliases into the product
├── .gitignore              # docs-local ignores (belt-and-braces, see §2.4)
├── README.md               # how to work on the docs
├── brand/                  # migrated logo assets (§4)
├── src/
│   ├── content/
│   │   ├── content.config.ts   # content collections
│   │   └── docs/
│   │       ├── en/             # the canonical content
│   │       ├── fa/             # Persian
│   │       └── ar/             # Arabic
│   ├── components/             # the nine design-system components
│   ├── styles/
│   │   └── tokens.css          # the design system's tokens
│   └── data/                   # generated at build time, never hand-edited
│       ├── templates.json
│       └── errors.json
├── public/                 # static passthrough — favicons, and nothing else
└── dist/                   # build output — gitignored (§2.3)
```

### 1.1 The boundary rule

**Nothing under `docs/` may reference a path outside `docs/` except the four
read-only product inputs** named in §1.2. No `../src/`, no `../tools/`, no relative
import that escapes the workspace.

### 1.2 The four permitted read-only product inputs

| input | read by | why it is permitted |
|---|---|---|
| `tools/templates.mjs` → `TEMPLATES` | the gallery generator | the registry is the single source of truth for template metadata |
| `dist/templates/<id>/template.html` | the gallery generator | the frozen artifacts, copied as opaque files |
| `template/index.html` | the gallery generator | Row's frozen artifact |
| the `.md` files at the repo root | the content build | so the Custom Template Guide and Contributing are **generated from the repository file**, not retyped (implementation plan §11.2) |

**Everything else is off limits.** In particular the generator must never import
`tools/build.mjs` and must never invoke it (implementation plan §3.5).

### 1.3 The rule that keeps the two builds apart

The product's build (`node tools/build.mjs`) and the docs build (`npm run build` inside
`docs/`) must have **no shared entry point**. There is no root script that runs both,
and no root script that runs the docs build at all.

---

## 2. `docs/package.json` isolation rules

### 2.1 It is a separate manifest, not a workspace

The root `package.json` has **no `workspaces` field** and must not gain one. Declaring
a workspace would make the root manifest the install root for the docs dependencies,
which is exactly the leak this plan exists to prevent.

`docs/package.json` is a **standalone** manifest with its own `node_modules` under
`docs/`.

### 2.2 What may appear in it

```jsonc
{
  "name": "row-template-docs",
  "private": true,          // never publishable to npm
  "type": "module",
  "scripts": {
    "dev":     "astro dev",
    "build":   "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "…",
    "@astrojs/starlight": "…"
    // Pagefind arrives with Starlight; do not add it separately unless required
  }
}
```

### 2.3 What must never appear in it

- **No `workspaces` field.** (See §2.1.)
- **No script that writes outside `docs/`.** A `build` script must be `astro build`,
  never something that also touches `../dist` or `../template`.
- **No script that invokes the product build.** Not `node ../tools/build.mjs`, not
  `npm --prefix .. run build`.
- **No dependency whose purpose is to modify the product.** A plugin that rewrites
  `src/` or regenerates artifacts is a rejection, however convenient.
- **No `postinstall` / `prepare` hook that reaches outside `docs/`.** These run
  implicitly on install and are the classic way a build touches something it should not.

### 2.4 `.gitignore` changes required

**Exactly one root-level rule is needed:**

```gitignore
# Documentation build output. The product's /dist/ is root-anchored and does not
# cover this; docs/node_modules/ is already covered by the unanchored node_modules/.
/docs/dist/
```

**And exactly one rule must NOT be added:** `docs/node_modules/`. It is already
ignored (verified with `git check-ignore`), and a redundant rule is noise.

A `docs/.gitignore` may be added for docs-local scratch, but it must not duplicate the
root rules.

### 2.5 The gate this section exists to pass

```
git diff package.json   → must be empty
```

If the root manifest changes at all during Phase 1, the phase has failed and stops.

### 2.6 `docs/package-lock.json` is committed

**The lockfile MUST be committed, in the same commit as the manifest.**

It is the only record of the exact transitive dependency set. Without it, two machines
installing "the same" dependencies can resolve different versions, and the docs build
stops being reproducible — which would make the Phase 1 build verification meaningless,
because a green build would only mean *one machine* built it.

Rules:

- Committed, not gitignored. It lives at `docs/package-lock.json`.
- **Never hand-edited.** It is generated by npm and reviewed as a diff.
- A lockfile change is a reviewable event, not noise. A dependency that appears in the
  lockfile without a corresponding manifest change is a finding.
- It is scoped to `docs/` and has no effect on the root manifest, which stays
  dependency-free.

**Why this matters more here than in most projects:** the product ships a
zero-dependency build. The documentation workspace is the first place in this
repository where a transitive dependency tree exists at all, so it is the first place
where an unreproducible install is possible.

### 2.7 `npm ci` is the install command

**All documentation installs MUST use `npm ci`.** `npm install` is not permitted for
building, testing or deploying the docs.

| | `npm ci` | `npm install` |
|---|---|---|
| reads | the lockfile, exactly | the manifest, resolving ranges |
| `node_modules` | deleted first | reused and reconciled |
| lockfile | **fails if out of sync with the manifest** | **may rewrite it** |
| result | reproducible | may differ between runs |

`npm ci` failing because the lockfile is out of sync is **the desired behaviour** — it
means the manifest changed without the lockfile, which is exactly the mistake this rule
exists to catch.

**The one permitted use of `npm install`:** deliberately adding or changing a
dependency. The sequence is `npm install <pkg>`, verify, then commit the manifest and
the lockfile together. It is never the command used to build.

### 2.8 `docs/.nvmrc` — Node version policy

**A `.nvmrc` goes in `docs/`, never at the repository root.**

This is an isolation rule, not a tidiness preference. The product's *build* uses Node,
but the product itself does not — the installed artifact runs on standard Linux userland
with no Node, Python or database. **A root `.nvmrc` would declare a runtime requirement
for the product that does not exist**, and a reader would reasonably conclude the
installed page needs Node.

Policy:

- **Location:** `docs/.nvmrc` only.
- **Contents:** `22.12` — a **minor** pin, not a bare major.
- **Why not a bare `22`:** verified during execution against the registry, Astro 7.3.3
  declares `engines.node: ">=22.12.0"`. **A bare `22` can resolve to 22.11.x, which
  Astro refuses.** The earlier draft of this plan said `22` and cited
  `18.17.1+ / 20.3.0+ / 22+`, which was the requirement for older Astro majors and is
  **wrong for the version actually being installed**. Corrected here.
- **Why not the exact patch:** a minor pin is stable and does not require a commit for
  every patch release. The exact patch belongs in the CI workflow (Phase 5), where
  pinning it is cheap to update.
- **Verified against:** the repository's own Node is v22.22.2, which satisfies
  `>=22.12.0`.
- **Never a root `.nvmrc`.** If a root one is ever wanted, it is a product decision
  with a different justification, and it is out of scope for this programme.

---

## 3. Required folders

Created in this order. The order matters because each step is verifiable before the
next begins.

| # | folder | purpose | verification after creating |
|---|---|---|---|
| 1 | `docs/brand/` | migrated logo assets | files present, dimensions match (§4) |
| 2 | `docs/src/` | all source | — |
| 3 | `docs/src/content/docs/en/` | English content | — |
| 4 | `docs/src/content/docs/fa/` | Persian content | — |
| 5 | `docs/src/content/docs/ar/` | Arabic content | — |
| 6 | `docs/src/components/` | the nine components | — |
| 7 | `docs/src/styles/` | tokens | — |
| 8 | `docs/src/data/` | generated data | — |
| 9 | `docs/public/` | favicons | — |

Three files are created alongside the folders, because a folder list alone would leave
them out:/n/n| file | purpose | governed by |
|---|---|---|
| `docs/package.json` | the standalone manifest | 2.1-2.3 |
| `docs/package-lock.json` | the committed lockfile | 2.6 |
| `docs/.nvmrc` | the Node major for the docs build | 2.8 |

**`docs/package-lock.json` is generated by npm, not authored.** It is listed here so it
is not forgotten, not so it is hand-written.

**Not created in Phase 1:** `docs/dist/` (the build creates it, and it is gitignored),
and any `docs/src/pages/` (Starlight's content collections handle routing).

**The existing `docs/assets/` is left alone.** Its three PNGs are tracked and
referenced; moving them is a separate decision, not a bootstrap step.

---

## 4. Logo migration process

### 4.1 Source

The assets live **outside the repository**, in a sibling directory:

```
D:\. frank0live Main\3X-UI Template\Row-Template Logo's\
```

| source file | dimensions | alpha | destination |
|---|---|---|---|
| `Row-Template Logo 1 ( Main ) Don't Have Bacl Ground.png` | 1254×1254 | RGBA | `docs/brand/mark.png` |
| `Row-Template Logo 2 ( ENG ).png` | 2172×724 | RGBA | `docs/brand/wordmark-en.png` |
| `Row-Template Logo 3 ( FA ).png` | 2172×724 | RGBA | `docs/brand/wordmark-fa.png` |
| `Row-Template Logo 4 ( Main 2).png` | 1254×1254 | **RGB, no alpha** | `docs/brand/mark-opaque-a.png` |
| `Row-Template Logo 4 ( Main 3 ).png` | 1254×1254 | **RGB, no alpha** | `docs/brand/mark-opaque-b.png` |

### 4.2 Step 1 — determine which opaque mark is light and which is dark

**This must be done by inspecting the images, not by reading the filenames.**
`Logo 4 ( Main 2)` and `( Main 3)` are RGB with no alpha, so each is baked for one
background. The filenames carry no information about which is which.

Until this is determined, the two files keep neutral names (`mark-opaque-a/b`). They are
**not** renamed to `-light` / `-dark` on a guess.

### 4.3 Step 2 — copy, do not move

Copy first. The originals stay in the sibling directory until the copies are verified,
so a mistake is recoverable. Moving is a later, separate step.

### 4.4 Step 3 — rename on the way in

The current names carry a typo (`Bacl Ground`) and inconsistent spacing
(`( Main 2)` / `( Main 3 )`). The migration is the right moment to fix both.

### 4.5 Step 4 — verify the copies

Re-read each copied file's IHDR chunk and confirm dimensions and alpha against §4.1.
**A truncated copy is caught here or not at all.**

### 4.6 Step 5 — commit the assets in their own commit

Binary additions, nothing else in the commit, so the diff is unambiguous.

### 4.7 Step 6 — reference them, and only from `docs/`

No page may reference `Row-Template Logo's` or any path outside the repository.

### 4.8 Gate

- All five files present under `docs/brand/` with the dimensions and alpha of §4.1.
- `git grep` for `Logo's` across `docs/` returns nothing.
- The product's suite green; fifteen artifacts byte-identical.
  **No template references these assets**, so this must be a pure addition.

### 4.9 Rollback

Delete `docs/brand/`. The originals were never moved.

### 4.10 Asset and licence ownership

This applies to **every asset in `docs/`** — logos, the banner, screenshots, and any
font the site adds. It is not limited to the logo migration.

#### 4.10.1 The precedent already in this repository

The project already handles third-party assets rigorously, and the documentation must
follow the same pattern rather than invent one:

| asset | what sits beside it |
|---|---|
| the bundled font (`src/fonts/`) | `OFL.txt` — the SIL Open Font License text · `INTEGRITY` — upstream URL, pinned release, source file, and the fact that it is reproducible via `tools/subset-font.sh` |
| the vendored QR generator (`src/vendor/uqr/`) | `LICENSE` — MIT · `INTEGRITY` · `VERSION` |

**The pattern is: a licence file and an integrity record beside the asset.** The
documentation workspace adopts it unchanged.

#### 4.10.2 The three classes of documentation asset

**1. First-party** — the logo set, the banner, and any original illustration.

Covered by the root `LICENSE` (MIT, copyright 2026 frank0live).

> **The logos' ownership MUST be confirmed, not assumed.** They are believed to be the
> project's own work, but nothing in the repository says so. Until that is confirmed in
> writing, they are **not committed** — a public repository cannot redistribute an asset
> whose provenance is unknown, and "it was probably ours" is not a licence.

**2. Generated** — screenshots of the frozen artifacts.

These depict the project's own output, so they inherit the project licence. Each must
record **which artifact and which hash** it depicts, so a screenshot can never silently
misrepresent a template.

**3. Third-party** — any font, icon set or image the site adds.

Self-hosted, with its licence file and an integrity record beside it, following 4.10.1.
The design system already requires self-hosting for fonts
(`DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md` section 4.2); this rule extends that to
licensing.

#### 4.10.3 The rules

1. **Every asset has a determined licence.** An asset whose licence is unknown is a
   **rejection**, not a to-do.
2. **Third-party assets carry their licence beside them** — `LICENSE`, or the
   licence-specific filename (`OFL.txt` for OFL fonts), plus an `INTEGRITY` record.
3. **No asset is added from a source whose licence forbids redistribution.** Checked
   before the asset is committed, not after.
4. **Screenshots record their source artifact and hash.**
5. **The site surfaces attribution.** A licences page listing every third-party asset
   and its licence, linked from the footer. The repository already does this in
   `README.md`'s License section for the vendored QR generator; the site extends the
   same disclosure to the web.
6. **Nothing here changes the root `LICENSE`.** The documentation workspace does not
   alter the product's licence.

#### 4.10.4 Gate

- Every asset under `docs/` has a recorded licence.
- Third-party assets have their licence file and `INTEGRITY` record beside them.
- Logo ownership confirmed in writing, or the logos are not committed.
- Screenshots record their source artifact and hash.
- The attribution page exists and is linked from the footer.

---

## 5. First Persian test page specification

### 5.1 Why this page exists

`ADR-0001` names two gates that must pass before the framework decision is treated as
settled. **This page is both of them.** It is not a demo; it is the acceptance test.

### 5.2 Content — deliberately chosen to exercise every risk

The page must contain, in Persian:

1. **A heading hierarchy** — `h1` through `h3`, so heading spacing in an RTL context is
   visible.
2. **A paragraph of real Persian prose** — long enough to wrap several times, so the
   measure and line-height are testable.
3. **A mixed-direction paragraph** — Persian prose containing a Latin identifier, a
   version number and a URL. This is where bidi fails if it is going to.
4. **A shell command in a code block** — with a Persian sentence explaining it. The
   block must be LTR; the prose must be RTL.
5. **Inline code** inside Persian prose.
6. **A table** with Persian headers and Latin values (a template name and a byte size).
7. **An ordered list** — the Installation Step pattern, so the numbering's direction is
   checked.
8. **A warning box** — the design system's warning component.
9. **An internal link and an external link** — so link direction is visible.
10. **A screenshot with Persian `alt` text.**

### 5.3 What is being verified

| # | check | fail condition |
|---|---|---|
| 1 | `dir="rtl"` applied to the document | the page renders LTR |
| 2 | prose aligns to the right | text aligns left |
| 3 | code blocks render **LTR** | a command is reversed |
| 4 | the code block scrolls internally | the page scrolls horizontally |
| 5 | the sidebar is on the right | sidebar on the left |
| 6 | chevrons and back-arrows mirror | they point the wrong way |
| 7 | the magnifying glass does **not** mirror | it is mirrored |
| 8 | the Persian wordmark is used | the English one appears |
| 9 | no horizontal overflow at any width | overflow |
| 10 | mixed-direction prose reads correctly | a Latin identifier reorders |

**Check 3 and check 10 are the two that matter most.** They are the failures that
survive a casual review.

### 5.4 Viewports

**320 / 390 / 430 / 1440** — the same four the template RTL audit uses, in both themes.
No new matrix.

### 5.5 Gate

Every one of the ten checks passes at all four widths in both themes. **If check 3 or
check 10 fails, the ADR's revisit trigger fires** and the framework decision reopens.

---

## 6. Pagefind validation procedure

### 6.1 Why this is a gate and not a formality

`ADR-0001` chose Starlight **because of Pagefind** — a build-time index served from the
site's own origin, which is the only candidate consistent with the product's
"fetches nothing" principle. **If Pagefind cannot search Persian and Arabic well, the
decision rests on nothing.**

Persian and Arabic are not the Latin segmentation problem. This procedure exists to
find that out early.

### 6.2 Procedure

1. **Build** the site with the Persian test page present (`npm run build` in `docs/`).
2. **Confirm the index exists** in `docs/dist/` — Pagefind emits a `pagefind/` directory
   with its index fragments. Its absence means indexing did not run.
3. **Search in the built output**, not in `dev`. The index is a build artifact; `astro
   dev` does not produce it. Serve `docs/dist/` over a static server and search there.
4. **Run the query set** below and record the result of each.

### 6.3 The query set

Each query is chosen to exercise a different failure mode.

| # | query | what it tests |
|---|---|---|
| 1 | a whole Persian word from the page | basic Persian indexing |
| 2 | a Persian word **with a ZWNJ** (`نیمفاصله`) | the half-space is a Persian-specific token boundary and a classic indexer failure |
| 3 | a Persian word **without** the ZWNJ | whether the two forms match the same content |
| 4 | a Persian word with a **different diacritic** form | Arabic/Persian orthographic variance |
| 5 | a Latin identifier from the page | mixed-script indexing still works |
| 6 | an Arabic word (from the `ar` locale once it exists) | Arabic specifically, not only Persian |
| 7 | a two-word Persian phrase | multi-term matching |
| 8 | a word that appears **only in a code block** | whether code is indexed |

**Query 2 is the one most likely to fail** and the most important: ZWNJ handling is
where Persian search usually breaks, and the templates themselves already handle ZWNJ
in their own text.

### 6.4 Recording the result

For each query: found / not found, and the rank if found. **A query that returns nothing
is a finding, not a failure of the procedure.**

### 6.5 Gate

- The index exists in `docs/dist/pagefind/`.
- Queries 1, 5 and 6 return the expected page.
- **Queries 2 and 3 both return the expected page** — if ZWNJ breaks search, that is a
  real limitation to record and decide on, not something to work around silently.

**If ZWNJ handling is broken and cannot be fixed by configuration, `ADR-0001`'s revisit
trigger fires.**

### 6.6 What is not in scope

Pagefind's index size, ranking quality, and whether it is "good" in an absolute sense.
The question is whether it works for Persian and Arabic at all.

---

## 7. RTL validation procedure

### 7.1 The method

The template programme already has a working RTL audit harness: headless Chrome over
the fixture server, measuring overflow, tap targets, accidental LTR, and clipped
elements. **Phase 1 reuses that approach against the docs site**, with one change — the
docs site is served from `docs/dist/`, not from the fixture server.

### 7.2 What is measured, per page per viewport

| measurement | pass condition |
|---|---|
| `scrollWidth` vs `clientWidth` | equal — no horizontal overflow |
| every `button`, `a.btn`, `input`, `[role="tab"]` | minimum computed height **≥ 44px** |
| elements whose computed `direction` contradicts the document | **none**, excluding deliberate isolates and form controls |
| elements painting outside the viewport | **none**, excluding those clipped by an `overflow: hidden` ancestor |
| `dir` on `<html>` | `rtl` for `fa` and `ar`, `ltr` for `en` |

### 7.3 The two detector traps, already learned

Both were hit during the template RTL audit and must be built into the harness from the
start:

1. **`dir="auto"` resolves Latin content to `direction: ltr`.** That is correct bidi
   behaviour, not a leak. The detector must skip elements carrying `dir="auto"`, or it
   will report false positives on every page containing a Latin identifier.
2. **`text-overflow: ellipsis` leaves the inner element's rect extending past the
   clipped box.** Invisible, but `getBoundingClientRect` reports it. The detector needs
   an `overflow: hidden` ancestor check.

**Verify every flag against the DOM before reporting it as a defect.** The template
audit produced 54 flags of which 53 were detector artefacts — the ratio is worth
remembering.

### 7.4 Scope

- locales: `fa`, `ar`, and `en` as the control
- viewports: **320 / 390 / 430 / 1440**
- themes: both

Phase 1 has one page, so this is a small run. It establishes the harness that later
phases reuse.

### 7.5 Gate

No horizontal overflow; every tap target ≥ 44px; no confirmed accidental LTR; no
confirmed clipping.

---

## 8. Accessibility checks

### 8.1 Automated

| check | tool |
|---|---|
| contrast, both themes | an automated audit against WCAG AA |
| heading order | one `h1`, no skipped levels |
| image `alt` | every `<img>` has `alt`, empty for decorative |
| form labels | every input has an associated label |
| landmark structure | one `<main>`, header, nav, footer |

### 8.2 Manual — these cannot be automated

| check | method |
|---|---|
| **keyboard-only navigation** | `Tab` through the page; the skip link is first; focus is always visible; the mobile drawer traps focus and closes on `Escape` |
| **tap targets, measured** | the RTL harness reports the minimum; **measured, not assumed** |
| **`prefers-reduced-motion`** | enable it; no transition or animation runs |
| **`forced-colors: active`** | the page remains usable; no content disappears |
| **zoom to 200%** | no horizontal overflow, no clipped content |
| **screen reader pass** | one page, one reader, headings and landmarks announced sensibly |

### 8.3 Why "measured, not assumed" is stated again here

Signature shipped a 40px tap target for months because its tap floor enumerated eight
selectors and the offending control was the ninth. **A hand-maintained list of
accessible elements is a list that will be wrong.** The harness measures every
interactive element on the page; nothing is exempted by being on a list.

### 8.4 Gate

Automated checks clean; keyboard navigation complete; tap targets measured ≥ 44px;
reduced-motion and forced-colors verified.

---

## 9. Build output verification

### 9.1 What the build must produce

| artifact | expected |
|---|---|
| `docs/dist/` | a static directory: HTML files, CSS, the Pagefind index |
| `docs/dist/index.html` | the Home page |
| `docs/dist/fa/…` | the Persian page under its locale path |
| `docs/dist/pagefind/` | the search index |
| **no server requirement** | the output must be servable by any static file server |

### 9.2 What the build must NOT produce

| must not | check |
|---|---|
| any write outside `docs/` | compare `dist/`, `build/`, `out/`, `release/`, `template/` before and after |
| a modification to the root `package.json` | `git diff package.json` empty |
| a modification to any product file | the mtime scan of §9.4 |
| a rebuild of a template artifact | the fifteen-way byte comparison |

### 9.3 The verification sequence

```
1. record: git rev-parse HEAD, and the 15 frozen byte/SHA values
2. record: mtimes of every file under src/ tools/ tests/ installer/ template/ release/
3. run:    npm run build  (inside docs/)
4. check:  docs/dist/ contains HTML + CSS + pagefind/
5. check:  git diff package.json                        → empty
6. check:  git diff src/ tools/ tests/ installer/ template/ VERSION → empty
7. re-scan: the mtimes from step 2                      → unchanged
8. compare: the 15 artifacts to step 1                  → 0 drift
9. run:    npm test  (at the repo root)                 → green, unedited
```

**Steps 5 through 8 are the ones that matter.** Steps 1–4 confirm the build worked;
5–8 confirm it did not touch anything it should not have.

### 9.4 The mtime scan

A byte comparison catches content changes; it does not catch a file being rewritten
with identical bytes. The mtime scan catches that.

**Known and expected:** running the product's own test suite rewrites
`template/index.html` with byte-identical content (the release test rebuilds it). That
is a **product** behaviour, not a docs one — the docs build must not cause any mtime to
move at all.

### 9.5 Serving the output

Serve `docs/dist/` with a plain static server and confirm:

- every page loads with no console errors;
- **no request leaves the origin** — the network panel shows only same-origin requests;
- the Persian page renders RTL;
- search works, using the build-time index.

**The no-external-request check is the one that ties this back to the product's own
principle.** A docs site that fetches a font from a CDN would contradict the
documentation it is serving.

### 9.6 Gate

Build succeeds, output is static, no external requests, no product file touched, fifteen
artifacts byte-identical, product suite green.

---

## 10. Rollback procedure

### 10.1 The principle

Phase 1 is **additive**. Rollback is a deletion, not an unpicking. Nothing in this
phase modifies an existing product file, so no rollback can require reverting one.

### 10.2 Rollback by step

| step | rollback | notes |
|---|---|---|
| `.gitignore` rule | remove the one `/docs/dist/` line | a one-line revert |
| workspace folders | delete `docs/src/`, `docs/public/` | additive |
| `docs/package.json` + lockfile | delete both | no root manifest change to undo |
| installed dependencies | delete `docs/node_modules/` | never entered the root manifest |
| `docs/astro.config.mjs` | delete | — |
| `docs/package-lock.json` | delete with the manifest | generated; no root manifest change to undo |
| `docs/.nvmrc` | delete | docs-local by design (2.8) |
| **logo assets** | delete `docs/brand/` | **the only committed binary addition**; originals were never moved |
| the Persian test page | delete it | content only |
| the build output | delete `docs/dist/` | gitignored, never committed |

### 10.3 The one irreversible action

**Committing the logo assets** is the only change that adds binary content to the
repository's history. It is reversible in git terms, but a large binary in history is a
permanent cost to every future clone.

**Therefore:** commit the assets in their own commit (§4.6), and if a variant turns out
to be unused, do not commit it.

### 10.4 The emergency stop

If any gate fails in a way that touches a protected surface:

1. **Stop.** Do not proceed to the next step.
2. **Revert the docs change** — a deletion.
3. **Verify the product** — run `npm test` and the fifteen-way byte comparison, and
   confirm zero drift.
4. **Investigate before retrying.** A gate failure that touched a protected surface
   means the isolation has a hole, and retrying without understanding it will hit the
   same hole.

### 10.5 What rollback must never be needed for

**Because Phase 1 touches nothing in the product, no rollback can ever require reverting
a template, a lock, the runtime, the installer or `VERSION`.**

If a rollback *does* require touching one of those, a gate failed and §10.4 applies.

---

## 11. Phase 1 definition of done

Phase 1 is complete when **all** of the following hold.

**Workspace**
- [ ] `docs/` builds with its own manifest
- [ ] root `package.json` untouched — `git diff package.json` empty
- [ ] `docs/dist/` is gitignored; `docs/node_modules/` needs no new rule
- [ ] no docs script reaches outside `docs/`
- [ ] `docs/package-lock.json` is committed, in the same commit as the manifest
- [ ] every install in the phase used `npm ci`, not `npm install`
- [ ] `docs/.nvmrc` exists and there is **no root `.nvmrc`**

**Brand**
- [ ] five logo files under `docs/brand/`, dimensions and alpha verified
- [ ] the light/dark question for the opaque marks **answered by inspection**
- [ ] no reference to any path outside the repository
- [ ] **logo ownership confirmed in writing** — or the logos are not committed (4.10.2)
- [ ] every asset under `docs/` has a recorded licence; third-party assets carry their
      licence file and an `INTEGRITY` record beside them (4.10.3)
- [ ] the attribution page exists and is linked from the footer

**Content**
- [ ] the Persian test page exists and contains all ten elements of §5.2
- [ ] Home renders in `en`

**Gates**
- [ ] the ten RTL checks of §5.3 pass at 320 / 390 / 430 / 1440, both themes
- [ ] Pagefind's index exists and the §6.3 query set has been run and recorded
- [ ] **ZWNJ queries 2 and 3 both return the expected page** — or the limitation is
      recorded and escalated
- [ ] no horizontal overflow; every tap target measured ≥ 44px
- [ ] automated accessibility checks clean; keyboard navigation complete

**Isolation**
- [ ] no product file modified — the mtime scan is clean
- [ ] fifteen artifacts byte-identical
- [ ] `npm test` green, unedited
- [ ] the built site makes no request to another origin

**Rollback**
- [ ] every step in §10.2 is still a deletion

---

## 12. Explicitly not in Phase 1

- **No dependency installation.** This document specifies; it does not install.
- **No workspace created.** The folders in §3 are listed, not made.
- **No navigation, search UI, i18n beyond `fa`/`ar`, or generated content.** Those are
  Phases 2–4.
- **No hosting or CI.** Phase 5.
- **No framework substitution.** `ADR-0001` is approved; this plan implements it.
- **No product change of any kind.**

---

**Waiting for approval before executing any step of this plan.**
