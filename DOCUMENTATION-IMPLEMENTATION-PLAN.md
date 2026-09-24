# Documentation Implementation Plan

**Status:** plan only. Nothing in this document has been implemented.
**Converts into a roadmap:** `DOCUMENTATION-PLATFORM-PROPOSAL.md` (architecture,
phases) and `DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md` (visual and UX system).
**Also depends on:** `CUSTOM-TEMPLATE-GUIDELINES.md` (the template contract the
Custom Template Guide presents) and `CUSTOM-TEMPLATES-PROPOSAL.md` (the tier model
the gallery will eventually need).

---

## 1. Purpose

Two proposals now define *what* the documentation platform should be. Neither
defines *how to build it without breaking the product*. This document is that
bridge: a phased roadmap in which every phase is independently safe, independently
verifiable, and independently abandonable.

The plan's organising rule is not speed. It is that **the documentation programme
must be incapable of damaging the product**, and that this must be provable rather
than asserted.

---

## 2. Implementation principles

**P1 — Additive or nothing.**
Every change in this programme adds files. No phase is permitted to require a
modification to an existing product file. If a phase cannot be done additively, the
phase is wrong.

**P2 — The product's test suite is the gate, not a formality.**
`npm test` must pass, unedited, after every phase. If a phase requires editing a
product test, the phase reached too far and stops.

**P3 — The fifteen-way byte comparison is the final word.**
After every phase: build all fifteen templates, compare to the frozen byte/SHA
values, require zero drift. This check has already caught two real defects during
this project (a CRLF translation and a CSS rule splice), so it is not ceremonial.

**P4 — Nothing is decided silently.**
The framework choice is recorded in a Decision Record (§6) with its criteria written
down *before* the choice (§7). A decision without a written record is a decision
that will be relitigated.

**P5 — Documentation consumes the product read-only.**
The gallery and the Error Center read the registry, the artifacts and the tools. They
never write to any of them.

**P6 — One phase at a time, each ending green.**
No phase begins before the previous phase's gates pass.

**P7 — Publishability is a decision, not a default.**
This repository already distinguishes internal design documents from public ones
(§4). New documents must be classified deliberately rather than inheriting
"publishable" by omission.

**P8 — Reversible at every step.**
Every phase has a stated rollback (§15). A phase whose rollback is "figure it out" is
not ready to start.

---

## 3. Repository isolation rules

### 3.1 The absolute rule

> **Documentation must never be able to modify templates, runtime, installer, locks,
> `VERSION`, or release artifacts.**

Not "must not". **Must never be able to.** The distinction is the whole point: an
observed-safe arrangement is one mistake away from an unsafe one.

### 3.2 The six protected surfaces

| protected surface | what it is | why it is protected |
|---|---|---|
| **templates** | `src/templates/**`, `src/styles/**` | fifteen byte-locked designs |
| **runtime** | `src/scripts/**`, `src/locales/**` | shared by every template; locale island must stay byte-identical |
| **installer** | `installer/**` | released and validated |
| **locks** | `FROZEN_ARTIFACTS` in `tests/build.test.mjs` + the four individual locks | the approved baselines |
| **VERSION** | `VERSION`, and the version in `release/manifest.txt` | version bumps are release events |
| **release artifacts** | `release/**`, `template/index.html`, the release tarball | published and checksummed |

### 3.3 How isolation is enforced, not merely intended

| mechanism | effect |
|---|---|
| **Separate workspace** (§5) | documentation lives under its own root; nothing in the product's build reads it |
| **Separate dependency manifest** | the framework's packages never enter the root `package.json`, which *is* the product's build environment |
| **Separate output directory** | the docs build writes only under its own root; never `dist/`, `build/`, `out/`, `release/` |
| **Read-only consumption** | the gallery copies artifacts; it never runs the template build |
| **The product test suite runs unedited** | any phase that would need a product test edited is rejected |
| **The fifteen-way byte comparison** | the mechanical proof, run at every gate |

### 3.4 Why the root `package.json` is the critical one

The product currently has **zero dependencies** — `0` runtime, `0` dev. That is not
an accident; it is why the build is instant and auditable. A documentation framework
would be **the first dependency this project has ever had**.

Therefore: **the framework's dependencies must not enter the root manifest.** A
separate manifest under the docs workspace keeps the product's zero-dependency
property intact, which is a genuine architectural asset and not a detail.

### 3.5 The one real coupling, and its guard

The gallery displays the frozen artifacts. That is a read and it is safe — but it is
the only place where documentation touches product output.

> **Rule: the gallery consumes `dist/templates/<id>/template.html` and
> `template/index.html` as opaque files. It never runs `node tools/build.mjs`.**

If the gallery ever rebuilt an artifact, a documentation change could alter what it
displays, and the byte comparison would be the only thing standing between that and
a silent drift.

---

## 4. Document classification — an open decision

### 4.1 The finding

`.gitignore` establishes a deliberate internal/public split:

**Internal (gitignored, deliberately not published):**
`DESIGN-REVIEW.md`, `INSTALLER-DESIGN.md`, `INSTALLER-UX.md`,
`INSTALLER-VALIDATION.md`, `REAL-SERVER-VALIDATION.md`, `PROTOCOL-MATRIX.md`,
`RESEARCH.md`, `UX-SPEC.md`

The comment states the reason: these *"contain internal working terminology and are
intentionally excluded from the public tree; the public documentation is the README
set + SECURITY.md + CHANGELOG.md + CONTRIBUTING.md."*

**Public:** the README set, `SECURITY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`.

### 4.2 The problem

Four documents created during this programme are **not gitignored**, and are
therefore **publishable by default**:

```
CUSTOM-TEMPLATES-PROPOSAL.md
CUSTOM-TEMPLATE-GUIDELINES.md
DOCUMENTATION-PLATFORM-PROPOSAL.md
DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md
```

Two of them reference `UX-SPEC.md`, which is internal. All four are working
documents written for a maintainer, not for a public audience.

**This needs an explicit decision, and it should be made before any of them is
committed.** The options:

| option | consequence |
|---|---|
| **Keep them internal** | add them to `.gitignore` alongside the existing eight. Consistent with the established convention. |
| **Publish them** | they become part of the public tree and must be edited for a public audience first. |
| **Split** | publish `CUSTOM-TEMPLATE-GUIDELINES.md` (a genuine author-facing contract) and keep the three proposals internal. |

**This plan does not choose.** It records that the current state — publishable by
omission — is the one option that should not be taken by default.

### 4.3 Applies to this document too

`DOCUMENTATION-IMPLEMENTATION-PLAN.md` is itself an internal working document and
should be classified at the same time as the four above.

---

## 5. Proposed documentation workspace structure

```
Row-Template/                          # the product — untouched
├── src/                               #   protected
├── tools/                             #   protected
├── tests/                             #   protected
├── installer/                         #   protected
├── release/                           #   protected
├── template/                          #   protected
├── VERSION                            #   protected
├── package.json                       #   protected (must stay dependency-free)
└── docs/                              # the documentation workspace
    ├── package.json                   #   its own manifest — the framework's deps
    ├── README.md                      #   how to work on the docs
    ├── brand/                         #   migrated logo assets (§10)
    ├── content/                       #   Markdown, reviewed like code
    │   ├── en/
    │   ├── fa/
    │   └── ar/
    ├── data/                          #   generated, never hand-edited
    │   ├── templates.json             #     gallery data, from the registry
    │   └── errors.json                #     Error Center entries (§12)
    ├── src/                           #   the site's own components and styles
    │   ├── components/
    │   └── styles/                    #     design tokens (§3 of the design system)
    └── dist/                          #   build output — gitignored
```

**Note on `docs/`:** the directory already exists and holds `docs/assets/` with three
PNGs (a banner and two mobile screenshots). The structure above extends it rather
than replacing it; the existing assets move under `brand/` or stay where they are,
decided at Phase 1.

**`docs/dist/` must be added to `.gitignore`** in the same change that creates the
workspace, so build output is never committed.

---

## 6. Framework Decision Record

This is the record to be completed **before** Phase 1 begins. It is deliberately
empty: the criteria (§7) are written first, the choice second, and the reasoning
recorded at the time rather than reconstructed afterwards.

```markdown
# ADR-0001: Documentation framework

## Status
Proposed | Accepted | Rejected

## Date
<filled at decision time>

## Context
Row-Template is a public repository with 15 byte-locked templates, a zero-dependency
build, and no CI. It needs a documentation site serving users, installers,
developers and template authors. The site must not affect the product.

## Decision
<the framework chosen>

## Criteria applied
See §7. Scoring recorded below.

| criterion | weight | Starlight | Docusaurus | Next.js |
|---|---|---|---|---|
| docs features out of the box | | | | |
| client payload | | | | |
| dependency weight | | | | |
| Persian/Arabic quality | | | | |
| build-time content generation | | | | |
| static embed of self-contained artifacts | | | | |
| versioned docs | | | | |
| contributor learning curve | | | | |
| fits the "no remote assets" ethos | | | | |

## Consequences
- what becomes easier
- what becomes harder
- what is now a dependency of the docs workspace only
- confirmation that the product's `package.json` is unchanged

## Rejected options
<one paragraph per rejected option, stating the deciding criterion>

## Revisit trigger
<the condition that would reopen this decision>
```

**The Rejected-options and Revisit-trigger sections are mandatory.** A decision
record without them is a justification, not a record.

---

## 7. Technology evaluation criteria

Written before the decision, in priority order for *this* project.

### C1 — Does it add a dependency the product would itself refuse? (highest weight)

The product is proud of shipping one self-contained file with three scripts and zero
dependencies. A documentation site that ships megabytes of client JavaScript is a
mismatch worth weighing heavily. **Measured by:** the framework's runtime dependency
count and the site's shipped JS weight for a representative page.

### C2 — How good is the Persian experience, really?

Not "supports RTL". Actually good in Persian. **Measured by:** building one real
Persian page with a code block, a table and a sidebar in each candidate and reading
it. A checklist cannot answer this.

### C3 — How much of the docs layer must be built?

The Error Center (§12) and the Template Gallery (§13) are generated content. A stack
that makes generation hard costs more than it saves. **Measured by:** how the
candidate consumes a JSON file at build time and renders N pages from it.

### C4 — Can it embed a self-contained artifact without modifying it?

Phase 2 of the platform proposal is live previews of the fifteen templates. The
artifacts are self-contained, which makes this cheap — but only if the framework can
embed a static document without rewriting it. **Measured by:** embedding one artifact
and diffing it before and after.

### C5 — Versioned documentation: needed or not?

If the docs must describe more than one release, the field narrows sharply. **Decided
by:** whether the project intends to keep docs for 1.0 and 1.1 side by side.

### C6 — Contributor learning curve

A contributor should be able to fix a typo after reading one page of
`docs/README.md`. **Measured by:** how many concepts a contributor must learn before
their first content change.

### C7 — Static output and hosting freedom

The build must produce a static directory so changing hosts later is a deployment
change, not a rewrite. **Measured by:** whether `build` emits plain files.

### C8 — Longevity and maintenance cost

A public project is choosing a dependency it will maintain for years.
**Measured by:** release cadence, breaking-change history, and how many transitive
packages arrive.

### C9 — Search quality

Documentation without search is a wiki. **Measured by:** whether search is built in,
and whether it works offline in the static output.

### C10 — Accessibility of the default theme

The framework's own defaults should not fail WCAG before a single line is written.
**Measured by:** auditing one generated page.

---

## 8. Phase 0 to Phase 5 roadmap

### Phase 0 — Decisions and classification

**Deliverable:** no code. Four decisions recorded.

1. **Document classification** (§4) — which of the five working documents are
   internal, which are public.
2. **Framework Decision Record** (§6) completed, using the criteria in §7.
3. **i18n scope** — full five-language coverage, or `en`/`fa`/`ar` with English-only
   Developer and Contributing (platform proposal §2.4).
4. **Versioned docs** — needed or not (C5). This decision changes the framework
   scoring, so it must precede it.

**Why this phase exists:** every one of these decisions changes what gets built. Making
them after the workspace exists means redoing the workspace.

### Phase 1 — Workspace, brand, and first page

**Deliverable:** the docs workspace exists, builds, and renders one real page.

1. Create `docs/` with its own `package.json` and its own dependency tree.
2. Add `docs/dist/` to `.gitignore`.
3. Migrate the logo assets (§10).
4. Establish the design tokens from the design system proposal as real CSS.
5. Build one page — Home — in `en`, and confirm the build emits static output.

**Not in this phase:** navigation, search, i18n, generated content. One page that
builds is worth more than a skeleton that does not.

### Phase 2 — Content migration

**Deliverable:** the site carries real documentation for all four audiences.

Per §11: Home, Getting Started, Installation (three panels), Security, Developer
Documentation, Contributing, and the Custom Template Guide.

**Not in this phase:** the Error Center and the Gallery, which need generation and
therefore their own phases.

### Phase 3 — Template Gallery

**Deliverable:** fifteen generated template pages with real previews.

Per §13. Depends on Phase 2 because the gallery links into the docs.

### Phase 4 — Error Center

**Deliverable:** the generated Error Center.

Per §12. Depends on Phase 2 (the site) and Phase 3 (the generation pipeline, which is
the same mechanism).

### Phase 5 — CI/CD and release

**Deliverable:** the site deploys automatically, and the deployment is gated on the
product's suite passing.

Per §14. Deliberately last: automating a pipeline that has not been run by hand is how
a broken pipeline ships.

---

## 9. Safety gates

Every phase ends with the same gate. **The gate is not advisory.**

### 9.1 The standard gate (every phase)

```
1. Product test suite, unedited:      npm test                      → all green
2. Fifteen-way byte comparison:       build --all, compare to locks → 0 drift
3. Release test:                      node --test tests/release.test.mjs → green
4. Root manifest untouched:           git diff package.json         → empty
5. Protected surfaces untouched:      git diff src/ tools/ installer/ template/ VERSION → empty
6. No product test edited:            git diff tests/               → empty
7. Docs build produces static output: ls docs/dist                  → files present
8. LF endings, CR = 0:                CR count on every new file
```

### 9.2 Per-phase emphasis

| phase | gate emphasis | why |
|---|---|---|
| **0** | decisions recorded, nothing built | a phase that changes no file cannot break one |
| **1** | `package.json` **unchanged**; `docs/dist/` ignored | this is the phase that introduces a dependency tree — the riskiest step in the programme |
| **2** | protected surfaces untouched; suite green | content is Markdown, so the only risk is a stray edit outside `docs/` |
| **3** | **the gallery never runs the template build** | the one real coupling (§3.5) |
| **4** | **every installer error string maps to exactly one entry** | a changed error string must fail a test, not orphan a page |
| **5** | deployment gated on the product suite | a docs deploy must not be able to ship a broken product |

### 9.3 The gate that matters most

**Gate 1 and gate 2 together.** If the product's suite passes unedited and all fifteen
artifacts are byte-identical, the documentation programme has provably not touched the
product. Everything else is secondary.

---

## 10. Asset migration plan — Row-Template logos

### 10.1 Current state

The logo set lives **outside the repository**, in a sibling directory:

```
D:\. frank0live Main\3X-UI Template\Row-Template Logo's\
```

| file | dimensions | alpha | proposed destination |
|---|---|---|---|
| `Row-Template Logo 1 ( Main ) Don't Have Bacl Ground.png` | 1254×1254 | RGBA | `docs/brand/mark.png` |
| `Row-Template Logo 2 ( ENG ).png` | 2172×724 | RGBA | `docs/brand/wordmark-en.png` |
| `Row-Template Logo 3 ( FA ).png` | 2172×724 | RGBA | `docs/brand/wordmark-fa.png` |
| `Row-Template Logo 4 ( Main 2).png` | 1254×1254 | RGB | `docs/brand/mark-opaque-a.png` |
| `Row-Template Logo 4 ( Main 3 ).png` | 1254×1254 | RGB | `docs/brand/mark-opaque-b.png` |

### 10.2 Why the migration is required

The assets are **untracked and outside the repo**. A build that clones the repository
cannot reference them; a logo change is invisible; nothing is reviewed. This is a real
asset-hygiene problem in a public project, not a tidiness issue.

### 10.3 The migration steps

1. **Identify the opaque variants.** `Logo 4 ( Main 2)` and `( Main 3)` are RGB with
   no alpha, so each is baked for one background. **Which is the light variant and
   which is the dark one must be determined by inspecting them**, not assumed from the
   filename. Rename accordingly.
2. **Copy, do not move, in the first pass.** The originals stay where they are until
   the copies are verified, so a mistake is recoverable.
3. **Rename on the way in.** The current names carry a typo (`Bacl Ground`) and
   inconsistent spacing (`( Main 2)` / `( Main 3 )`). The migration is the right
   moment to fix both.
4. **Verify dimensions and alpha after copying** — the same IHDR check used when these
   assets were first measured, so a truncated copy is caught immediately.
5. **Commit the assets in their own commit**, with no other change, so the diff is
   purely binary additions.
6. **Then reference them from the site.** No page may reference the sibling directory.

### 10.4 Gate

- Every logo file present under `docs/brand/` with the dimensions and alpha recorded
  above.
- No reference anywhere in `docs/` to `Row-Template Logo's` or any path outside the
  repository.
- The product's suite green; fifteen artifacts byte-identical. **The logos are not
  referenced by any template**, so this must be a pure addition.

### 10.5 Rollback

Delete `docs/brand/`. The originals were never moved.

---

## 11. Content migration strategy

### 11.1 What migrates, and what does not

| source | action |
|---|---|
| `README.md` and the four translations | **restructured** into the site; the READMEs stay as the repo's front door |
| `SECURITY.md` | **expanded** into the Security section — the README version is maintainer-facing, the site version is reader-facing |
| `CONTRIBUTING.md` | **presented as a flow** rather than a document |
| `CHANGELOG.md` | **linked**, not duplicated |
| `CUSTOM-TEMPLATE-GUIDELINES.md` | **presented** as the Custom Template Guide (subject to §4 classification) |
| the eight internal documents | **not migrated.** They are internal by design |
| installer behaviour | **described**, not copied — the installer's own help is authoritative |

### 11.2 The rule that prevents a second source of truth

> **The site is a presentation layer over existing Markdown, not a parallel copy.**

Where content must exist in both places, the site **generates** from the repository
file at build time rather than holding a hand-copied duplicate. A duplicated paragraph
is a paragraph that will diverge.

**Concretely:** the Custom Template Guide and the Contributing flow should be built
from the repository's Markdown files, not retyped into `docs/content/`.

### 11.3 Order of migration

Migrate in audience order, because the first pages set the patterns the rest follow:

1. **Home** — sets the tone, the audience routing, the security statement.
2. **Getting Started + Installation** — sets the code-block, step and warning
   components, and these are the highest-traffic pages.
3. **Security** — sets the "claim / why / verify" pattern.
4. **Custom Template Guide** — sets the reference-block pattern.
5. **Developer Documentation** — sets the long-form pattern.
6. **Contributing** — sets the process pattern.

### 11.4 Per-page acceptance

A migrated page is done when:

- it renders in both themes;
- it renders in every agreed locale (§8 Phase 0 decision) with no overflow;
- every code block copies correctly;
- every command in it has been run and works;
- it contains no link to an internal document.

**That last one is a real risk** (§4.2): two of the working documents already
reference `UX-SPEC.md`, which is internal. Every migrated page must be checked for
links to the eight internal documents.

---

## 12. Error Center implementation strategy

### 12.1 The source of truth

Every entry derives from an error string that exists in the code. The initial set is
the installer's refusals, which are already precise:

```
template <id> failed its checksum; refusing to switch
logo path is a symlink; refusing to read it
unsupported image: only PNG, JPEG or WebP by content
branding contains control characters; refusing to generate.
refusing to operate on a symlink: <path>
refusing to recursively delete path outside backups: <dir>
cannot determine the 3x-ui version; refusing to proceed
refusing to install an invalid artifact
unsafe member type in archive: '<type>' (symlink/hardlink/special refused)
install root is a symlink; refusing to proceed.
refusing to delete <root>: it does not look like a Row-Template install root.
refusing to delete a system path: <path>
refusing to uninstall non-interactively without RT_ASSUME_YES=1.
refusing to roll back from a path outside the backups tree.
Live check could not reach the subscription endpoint.
```

### 12.2 The data model

One JSON entry per error, with the four mandated parts as fields:

```json
{
  "id": "installer.checksum-refusal",
  "category": "installer",
  "severity": "error",
  "technical": "template <id> failed its checksum; refusing to switch",
  "match": "^template .+ failed its checksum; refusing to switch$",
  "explanation": "The installer checked the template against the fingerprint recorded when it was approved. They did not match, so it stopped before changing anything. Your existing setup is untouched.",
  "causes": [
    "The file was edited after it was downloaded.",
    "The download was incomplete or corrupted in transit.",
    "The file came from somewhere other than the official release.",
    "A different installer version than the template was released with."
  ],
  "fix": [
    "Re-download the release from the official releases page.",
    "Verify the archive checksum against the published SHA256SUMS.",
    "Run the installer again.",
    "Confirm: the installer prints the template name and `installed`, with no `refusing` line."
  ]
}
```

**The `fix` array's last item is always a confirmation step.** A fix the reader cannot
verify is a guess.

### 12.3 The extraction pipeline

1. **Extract** every error string from `installer/lib/row-template.sh` and the
   verification tools, at build time.
2. **Match** each extracted string against the `match` patterns in the data file.
3. **Fail the build** if an extracted string matches no entry — a new error with no
   documentation.
4. **Fail the build** if an entry matches no extracted string — a documented error
   that no longer exists.
5. **Generate** the pages, plus a plain-text index for terminal users.

Steps 3 and 4 are what make this a system rather than a page. They are the reason the
Error Center is Phase 4 and not Phase 2.

### 12.4 The two hard rules

1. **No entry may ever instruct the reader to bypass a check.** Every message in that
   list is a safety mechanism. If a legitimate workflow needs to proceed despite a
   warning, that belongs in the tool as a documented flag, not in a page as a
   workaround.
2. **Severity is a word plus a rule colour, never a colour alone** — the same rule the
   templates follow.

### 12.5 Gate

Every error string in the installer and the verification tools maps to exactly one
entry, and the mapping is tested in both directions. Adding an error to the installer
without documenting it fails the build.

---

## 13. Template Gallery generation strategy

### 13.1 The data

Generated at build time from the registry — never hand-maintained:

| field | source |
|---|---|
| id, name, order, availability | `TEMPLATES` from `tools/templates.mjs` |
| byte size, SHA-256 | the frozen locks |
| headroom | ceiling (204,800) minus size |
| accent, radius, page width | each template's `tokens.css` |
| screenshots | captured from the frozen artifacts |

### 13.2 The token-name trap

**Three templates do not use the token name `--accent`:** arcade and arcadenova use
`--signal`, sketch uses `--ink`. The generator must read the **resolved value** by
trying the known names in order, or parse the theme block — not assume `--accent`.

This is a real trap that a hand-written table would have got wrong, and it will recur
when custom templates arrive with their own token vocabularies.

### 13.3 Screenshot capture

The gallery needs desktop and mobile, dark and light, for fifteen templates.

**Screenshots are captured from the frozen artifacts**, using the same headless
capture approach already used for the RTL audit — not from a rebuilt copy. Captured
once at a fixed device scale, committed under `docs/brand/` or a parallel
`docs/previews/`, and regenerated only when a template changes.

**A screenshot is a build input, not a build output.** Committing them keeps the docs
build independent of a headless browser.

### 13.4 The grayscale toggle

The design system proposes a grayscale toggle, and it is worth building: because the
templates are distinguished structurally rather than by colour, the toggle lets a
visitor see immediately whether a template has a real identity or only a palette. It
is the design contract's own test, exposed.

**Implementation:** a CSS filter on the gallery container. No per-image processing, no
second set of screenshots.

### 13.5 Gate

- Fifteen entries, matching `availableTemplateIds()` exactly.
- Every size matches its frozen lock.
- Every accent matches its template's token.
- **The gallery never runs `node tools/build.mjs`** (§3.5).
- The product's suite green; fifteen artifacts byte-identical.

---

## 14. CI/CD deployment plan

### 14.1 The current state

**There is no CI.** `.github/` contains only `ISSUE_TEMPLATE`. Every check in this
project — the suite, the byte comparison, the release build — is currently run by
hand.

That is worth stating plainly, because it means the documentation programme's CI plan
is also the project's **first** CI, and the first workflow should therefore be the
product's own suite rather than the docs deploy.

### 14.2 Proposed workflow order

| workflow | trigger | purpose |
|---|---|---|
| **1. product** | every push, every PR | `npm test` + the fifteen-way byte comparison |
| **2. docs build** | push touching `docs/**` | build the site, fail on a broken link or a missing generated entry |
| **3. docs deploy** | push to the default branch, **after 1 and 2 pass** | publish |
| **4. release** | manual, tagged | the existing release process |

**Workflow 1 comes first and is not optional.** A documentation deploy that is not
gated on the product's suite could publish docs for a product that is currently
broken.

### 14.3 Gating

```
push / PR
   │
   ├─ workflow 1: product suite + byte comparison
   │      │
   │      └─ must pass ──┐
   │                     │
   └─ workflow 2: docs build
          │              │
          └─ must pass ──┤
                         ▼
              workflow 3: docs deploy
```

**The docs deploy depends on both.** This is the mechanism that makes §3.1's absolute
rule true in practice: a documentation change cannot ship if the product is not
provably intact.

### 14.4 Hosting

Per the platform proposal §7, three options are on the table: GitHub Pages, a custom
domain, and a CDN. The plan does not choose, but records two constraints:

1. **The build must emit a static directory** regardless, so changing hosts later is a
   deployment change and not a rewrite.
2. **A `github.io` subpath needs a configured base path.** This is the single most
   common way a static docs site ships with broken asset URLs, and it should be
   tested in Phase 1 with one page rather than discovered at Phase 5.

### 14.5 Secrets and permissions

- The docs deploy needs **no secrets** beyond the platform's own token.
- The workflow's `permissions` should be the minimum required to publish.
- **The product's workflow must not have write access to anything.** It reads and
  reports.

### 14.6 What CI must never do

- Never `git commit` a build artifact back to the repository.
- Never modify `VERSION`, a lock, or a template.
- Never run with a token that could push to the default branch from a PR.

---

## 15. Rollback strategy

### 15.1 The principle

Every phase is additive and reversible. Rollback is a deletion, not an unpicking.

| phase | rollback | cost |
|---|---|---|
| **0** | delete the decision documents | trivial |
| **1** | delete `docs/` (except migrated brand assets if already committed) and the `.gitignore` line | trivial |
| **2** | revert the content commit | trivial — content is Markdown |
| **3** | delete the gallery pages and the generator | trivial |
| **4** | delete the Error Center pages and the data file | trivial |
| **5** | disable the workflows; the site keeps serving the last good build | trivial |

### 15.2 What rollback must never be needed for

**Because nothing in the programme touches the product, no rollback can ever require
reverting a template, a lock, the runtime, the installer or `VERSION`.**

If a rollback *does* require touching one of those, then a phase broke §3.1 and the
correct response is not to roll back the docs — it is to stop and investigate how the
isolation failed.

### 15.3 The emergency stop

If any phase's gate fails in a way that touches a protected surface:

1. **Stop.** Do not proceed to the next phase.
2. **Revert the docs change** (a deletion).
3. **Verify the product** — run the suite and the byte comparison, and confirm zero
   drift.
4. **Investigate before retrying.** A gate failure that touched a protected surface
   means the isolation mechanism has a hole, and retrying without understanding it
   will hit the same hole.

### 15.4 The one irreversible action

Committing the logo assets is the only change in the programme that adds binary
content to the repository's history. It is reversible in git terms, but a large binary
in history is a permanent cost to every future clone.

**Therefore:** keep the assets small (they are), and if a variant is never used,
do not commit it.

---

## 16. Risks and mitigations

| # | risk | likelihood | impact | mitigation |
|---|---|---|---|---|
| R1 | the framework's dependencies leak into the root `package.json` | medium | **high** — the product loses its zero-dependency property | separate manifest; gate 4 checks `git diff package.json` is empty |
| R2 | the docs build writes into `dist/`, `build/`, `out/` or `release/` | low | high | separate output dir; the byte comparison catches it |
| R3 | the gallery rebuilds artifacts instead of copying them | low | **high** — a docs change could alter what it displays | §3.5 rule; gate 3 checks the gallery never runs the build |
| R4 | a docs change requires editing a product test | low | high | gate 6: `git diff tests/` must be empty; if it is not, the phase stops |
| R5 | an Error Center entry tells the user to bypass a check | medium | **high** — it would actively weaken the product | §12.4 hard rule; review every entry |
| R6 | an error string changes and orphans a page | medium | medium | bidirectional matching (§12.3); the build fails |
| R7 | the site links to an internal document | medium | medium | per-page check (§11.4); the eight internal files are known |
| R8 | a `github.io` base path breaks asset URLs | medium | medium | test one page in Phase 1, not at Phase 5 |
| R9 | the Persian experience is bad despite "supports RTL" | medium | high — it is a primary audience | build a real Persian page per candidate before deciding (C2) |
| R10 | the docs site ships heavy client JavaScript | medium | medium — contradicts the product's ethos | C1 is the highest-weighted criterion |
| R11 | working documents are published by omission | **high** | medium | §4 — decide classification in Phase 0 |
| R12 | a screenshot goes stale and misrepresents a template | medium | medium | regenerate on template change; the gallery shows the frozen artifact's hash |
| R13 | logo assets stay outside the repo and rot | medium | medium | §10 migration in Phase 1 |
| R14 | the programme's own documents reference internal ones | medium | low | §4.2; check at classification time |
| R15 | CI is introduced for docs before the product has any | medium | medium | workflow 1 is the product suite, added first (§14.2) |

---

## 17. Final release checklist

### 17.1 Before the documentation site goes live

**Product integrity**
- [ ] `npm test` green, **unedited**
- [ ] all fifteen artifacts byte-identical to their locks
- [ ] `git diff package.json` empty
- [ ] `git diff src/ tools/ installer/ template/ VERSION` empty
- [ ] `git diff tests/` empty
- [ ] the release test green
- [ ] the release tarball unchanged

**Isolation**
- [ ] the docs build writes only under `docs/`
- [ ] `docs/dist/` is gitignored
- [ ] the gallery never invokes the template build
- [ ] the docs workspace has its own dependency manifest
- [ ] no page references a path outside the repository

**Content**
- [ ] every code block copies correctly
- [ ] every command in the docs has been run and works
- [ ] no link to any of the eight internal documents
- [ ] every page renders in both themes
- [ ] every page renders in each agreed locale

**Accessibility**
- [ ] every interactive element measured at ≥ 44px — **measured, not assumed**
- [ ] WCAG AA contrast verified in both themes
- [ ] full keyboard navigation, including the mobile drawer and search
- [ ] `prefers-reduced-motion` honoured
- [ ] `forced-colors` usable

**RTL**
- [ ] `fa` and `ar` at 320 / 390 / 430 / 1440: no horizontal overflow
- [ ] no element accidentally LTR
- [ ] code blocks LTR and scrolled internally
- [ ] the Persian wordmark used, not a flipped English one

**Gallery**
- [ ] fifteen entries, matching `availableTemplateIds()`
- [ ] every size matches its frozen lock
- [ ] every accent matches its template's token, including the three non-`--accent` names
- [ ] screenshots are of the frozen artifacts, with the hash recorded
- [ ] the grayscale toggle works

**Error Center**
- [ ] every installer and tool error string maps to exactly one entry
- [ ] the bidirectional matching test passes
- [ ] **no entry instructs the user to bypass a check**
- [ ] the plain-text index generates

**Deployment**
- [ ] workflow 1 (product) passes before workflow 3 (deploy) runs
- [ ] the deploy workflow's permissions are minimal
- [ ] no workflow commits a build artifact back to the repository
- [ ] the site loads with no console errors and no failed requests

**Documentation of the documentation**
- [ ] `docs/README.md` explains how to work on the docs
- [ ] the Framework Decision Record is complete, including rejected options and the
      revisit trigger
- [ ] §4 document classification decided and applied

### 17.2 The one-line version

> **If the product's suite passes unedited and all fifteen artifacts are
> byte-identical, and every Error Center entry refuses to bypass a check, the
> documentation programme has done its job.**

---

## Appendix — What this document does not do

This is a plan. Creating it:

- created no `docs/` workspace and no folder;
- installed no dependency;
- changed no `package.json`, template, runtime, installer, test, lock or `VERSION`;
- moved no logo asset;
- chose no framework.

Every fact quoted here was read from the repository: the absence of CI, the
zero-dependency manifest, the fourteen test files, the `.gitignore` internal/public
split, the release manifest fields, the installer's refusal strings, and the three
templates that name their accent token something other than `--accent`.
