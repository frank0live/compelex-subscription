# ADR-0001: Documentation framework

**Status:** Proposed — awaiting approval.
**Date:** 2026-09-18
**Deciders:** repository maintainer.
**Supersedes:** nothing.
**Related:** `DOCUMENTATION-IMPLEMENTATION-PLAN.md` §6 (the record template this
completes), `DOCUMENTATION-PLATFORM-PROPOSAL.md` §6 (the original trade-off survey),
`DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md`.

---

## Context

Row-Template is a public repository with:

- **fifteen byte-locked templates**, each pinned to an exact size and SHA-256;
- **a zero-dependency build** — `package.json` currently has **0 runtime and 0 dev
  dependencies**, which is why the build is instant and auditable;
- **no CI at all** — `.github/` contains only `ISSUE_TEMPLATE`;
- **fourteen test files** run by `npm test`;
- a deliberate **internal/public document split** in `.gitignore`;
- a **self-contained-artifact security story**: the served page fetches nothing from
  anywhere, and that is a product claim, not an implementation detail.

It now needs an official documentation site serving four audiences — users,
installers, developers, template authors — and the site must not affect the product.

Two prior proposals define *what* to build. This ADR decides *what to build it with*,
because that choice is the one that is expensive to reverse.

**The decision must not be made on popularity.** Starlight has roughly 8,400 GitHub
stars and Docusaurus roughly 64,000. That is context, not a criterion — a smaller
project with a better fit is a better choice than a larger project with a worse one,
and star counts measure history rather than suitability.

---

## Decision

> **Adopt Astro Starlight as the documentation framework.**

Starlight is built on Astro, which renders content to static HTML and ships
**near-zero JavaScript by default**. It provides native per-locale internationalization
with a `dir: 'rtl'` option, built-in search via **Pagefind** (a build-time index with
no external service), and a component model that accepts components written in Astro,
React, Vue, Svelte, Solid or plain HTML.

The decision is driven primarily by **criterion 6 (search)**, supported by criteria 1,
2, 5, 7 and 10. The full reasoning is below.

---

## Criteria

Ten criteria, assessed in the order that matters for *this* project. Each is scored
against evidence, not preference.

### C1 — Zero dependency philosophy compatibility

The product's zero-dependency build is an architectural asset. The documentation
workspace will have its own manifest (implementation plan §3.4), so **no candidate
touches the root `package.json`**. The question is therefore which candidate imposes
the smallest and most predictable dependency tree on the *docs* workspace.

| candidate | what arrives |
|---|---|
| **Starlight** | Astro + Starlight + Pagefind (a build-time binary). Moderate tree, no UI framework. |
| Docusaurus | React + Docusaurus + webpack + MDX toolchain. Large tree. |
| Next.js | React + Next.js **plus a separate documentation layer** (Nextra or Fumadocs). Largest tree, and two framework commitments. |

**Starlight** — fewest moving parts, and no UI framework is required at all.

### C2 — Static output quality

| candidate | output |
|---|---|
| **Starlight** | Static HTML with islands; almost no JavaScript shipped. Pages render without JavaScript. |
| Docusaurus | Static HTML **plus a React single-page application** and a hydration step on every page. |
| Next.js | Static export is possible but requires explicit configuration and ongoing discipline to stay static. |

**Starlight** — the only candidate where "static" is the default rather than a
configuration.

### C3 — Persian RTL support

| candidate | support |
|---|---|
| **Starlight** | Native per-locale configuration. The i18n config takes a `dir` field, documented as: *"Defaults to `ltr`. Set to `rtl` for right-to-left languages like Arabic, Hebrew, or Persian."* |
| Docusaurus | RTL is listed as an explicit i18n **goal**: *"locales reading right-to-left (Arabic, Hebrew, etc.) are supported and easy to implement."* |
| Next.js | Whatever the chosen documentation layer provides; varies by layer. |

**Starlight and Docusaurus tie.** Both support it natively. Neither is disqualified.

### C4 — Arabic RTL support

Identical mechanism to C3 — the locale configuration is per-locale, so `ar` receives
the same treatment as `fa`. **Starlight and Docusaurus tie.**

### C5 — Build performance

| candidate | build |
|---|---|
| **Starlight** | Astro's build; no SPA bundle to produce. |
| Docusaurus | webpack build; grows with page count. |
| Next.js | Moderate for a static export, but the build is the largest surface of the three. |

**Starlight.**

### C6 — Search capability — **the decisive criterion**

| candidate | search |
|---|---|
| **Starlight** | **Pagefind**, built in. Indexes the static output **at build time**. No external service, no account, no application step, works offline in the published output. |
| Docusaurus | **Algolia DocSearch** — a **hosted service**, free for qualifying open-source projects, requiring an **application step** and adding a third-party index. |
| Next.js | Depends on the layer; Fumadocs offers a local index, Nextra varies. |

**This is the criterion that decides the ADR.**

The product's security documentation makes a specific promise: *the artifact fetches
nothing from anywhere.* A documentation site whose search box depends on a hosted
third-party index would contradict the thing the documentation is there to explain. It
would also make the site's search fail offline and leak visitor queries to a third
party.

**Pagefind is a build-time index served from the site's own origin.** That is the only
candidate whose search is consistent with the product's own stated principle.

**Starlight** — and by a margin that is not close.

### C7 — Custom components support

The design system needs nine components (Hero, Installation Step, Error Card, Warning
Box, Security Card, Code Block, Template Preview Card, Screenshot Gallery, API
Reference Block).

| candidate | components |
|---|---|
| **Starlight** | Astro components, **and components from React, Vue, Svelte, Solid or plain HTML**. Framework-agnostic. |
| Docusaurus | React only. |
| Next.js | React only. |

**Starlight** — and for these nine components, most need no JavaScript at all, which is
exactly where Astro's model fits.

### C8 — Template gallery support

Needs: read a JSON file, generate fifteen pages, embed a self-contained static
artifact, offer a grayscale toggle.

| candidate | generation |
|---|---|
| **Starlight** | Content collections and dynamic routes; an artifact embeds via a plain `<iframe>` with no modification. |
| Docusaurus | Possible through a plugin; more machinery. |
| Next.js | Most flexible of the three. |

**Next.js is the most flexible, but all three are adequate.** Starlight and Docusaurus
both do this comfortably. Not a deciding criterion.

### C9 — Error Center generation support

Needs: read a JSON file, generate pages, and **fail the build** when an error string
has no entry or an entry has no error string.

| candidate | build-time failure |
|---|---|
| **Starlight** | An Astro integration can throw during the build, failing it. |
| Docusaurus | A plugin can throw. |
| Next.js | A build script can throw. |

**All three can do it.** The requirement is that generation is a build step, and every
candidate's build is a step. Not a deciding criterion.

### C10 — Long-term maintenance

| candidate | surface | gap |
|---|---|---|
| **Starlight** | Smaller surface: Astro + Starlight. | **No native documentation versioning** — community plugins or manual folders only. |
| Docusaurus | Large surface, most mature. | **Native versioning is first-class.** |
| Next.js | Largest surface, fastest release cadence, real breaking changes. | Must also maintain the documentation layer. |

**The versioning gap is the one genuine advantage Docusaurus holds**, and it is the
reason many teams choose it.

**For this project it is moot.** Row-Template documents a **single evolving version** —
`VERSION` is 1.1.0, and the release process publishes one tarball per version rather
than maintaining parallel documentation branches. There is no requirement to show 1.0
and 1.1 documentation side by side.

So the criterion resolves to: **which surface is smaller, given that Docusaurus's
advantage is one this project does not need?** — **Starlight.**

---

## Summary

| criterion | Starlight | Docusaurus | Next.js |
|---|---|---|---|
| C1 dependency weight | **best** | heavy | heaviest + second framework |
| C2 static output | **best** | ships a React SPA | needs discipline |
| C3 Persian RTL | native | native | layer-dependent |
| C4 Arabic RTL | native | native | layer-dependent |
| C5 build performance | **best** | slower | moderate |
| C6 **search** | **Pagefind, local, build-time** | Algolia, hosted | layer-dependent |
| C7 components | **framework-agnostic** | React only | React only |
| C8 gallery | adequate | adequate | most flexible |
| C9 Error Center | adequate | adequate | adequate |
| C10 maintenance | **smaller surface** | more mature; versioning | largest surface |

**Starlight wins or ties on nine of ten, and wins C6 decisively.**

---

## Rejected options

### Docusaurus — rejected on C6, C1, C2, C5

Docusaurus is the more mature product and its native versioning is genuinely better
than anything Starlight offers. It was rejected for three reasons.

**First, search (C6).** Algolia DocSearch is a hosted service. A project whose security
documentation says *the artifact fetches nothing from anywhere* cannot ship a
documentation site whose search box queries a third-party index. This is not a
preference — it is a direct contradiction of a product claim. A local search index
could be substituted, but that means replacing a first-party feature with a bespoke
one, which forfeits Docusaurus's out-of-the-box advantage.

**Second, weight (C1, C2, C5).** Docusaurus ships a React single-page application with
a hydration step on every page. For a documentation site read mostly on mobile, in
several languages, that is a real cost for no benefit this project needs.

**Third, its advantage is moot (C10).** Native versioning is the strongest argument for
Docusaurus, and this project documents a single evolving version. Rejecting a framework
for lacking a feature the project does not need is the correct trade.

### Next.js — rejected on C1 and C10

**Next.js is not a documentation framework.** It is a general React framework, and
choosing it means choosing a documentation layer to build on top of it — Nextra or
Fumadocs — which makes it **two** long-term framework commitments rather than one.

It offers the most flexibility, and for a project expecting to grow well past
documentation that would be compelling. But the roadmap
(`DOCUMENTATION-IMPLEMENTATION-PLAN.md` §8) does not require it: the gallery and the
Error Center are both build-time generation, which every candidate handles.

Its largest-in-class dependency surface and fastest release cadence mean the most
maintenance for a documentation site, which is the least valuable place to spend it.

**Rejected on the grounds that it adds the most and requires the most, for flexibility
this project does not need.**

---

## Consequences

### What becomes easier

- **Search works offline and locally.** Pagefind indexes at build time; the published
  site searches without any third-party service. This is consistent with the product's
  own principle rather than in tension with it.
- **Pages are fast without effort.** Near-zero JavaScript is the default, so
  performance is a property of the framework rather than a thing to maintain.
- **Components are unconstrained.** The nine design-system components can be written in
  whichever technology suits each one, including plain HTML where no interactivity is
  needed.
- **RTL is configuration, not engineering.** `dir: 'rtl'` per locale.
- **The build stays small.** Fewer transitive dependencies to audit and update.

### What becomes harder

- **No version switcher.** If the project ever needs parallel documentation for
  multiple live versions, this will have to be built or Starlight will have to be
  replaced. This is accepted, and it is the ADR's named revisit trigger.
- **Contributors learn Astro.** One new concept for anyone changing a page's structure.
  Content changes remain plain Markdown.
- **Starlight is younger.** Smaller community, fewer third-party plugins. The trade is
  a smaller surface for a smaller ecosystem.

### What this does not change

- **The root `package.json` stays at zero dependencies.** Astro, Starlight and Pagefind
  arrive in the documentation workspace's own manifest.
- **No template, runtime, installer, lock, test or `VERSION` changes.** The ADR decides
  a tool; it does not install one.
- **The product's build is untouched.** Nothing in `tools/`, `src/` or `installer/`
  reads the documentation workspace.

### Validation required before this ADR is treated as settled

Two things are asserted here from documentation rather than from measurement. Both must
be confirmed in Phase 1, and if either fails, this ADR reopens:

1. **Pagefind must index Persian and Arabic text acceptably.** Pagefind is built for
   static sites and supports multiple languages, but Persian and Arabic word
   segmentation is not the same problem as Latin text, and search quality is the reason
   this framework was chosen. **Build one real Persian page, index it, and search it.**
2. **A real Persian page must be genuinely good**, not merely `dir="rtl"`. The
   implementation plan's C2 says this explicitly: build one page with a code block, a
   table and a sidebar, and read it.

These are gates, not formalities. Criterion 6 is the deciding criterion, and if
Pagefind cannot search Persian well, the decision that rests on it is unsound.

---

## Revisit trigger

Reopen this ADR if **any** of the following becomes true:

1. **The project must document more than one live version side by side.** This is
   Docusaurus's decisive advantage and the single most likely reason to switch.
2. **Pagefind cannot index Persian or Arabic acceptably.** Criterion 6 is the deciding
   criterion; if it fails, the decision rests on nothing. (Test in Phase 1.)
3. **A real Persian page cannot be made good** without abandoning the design system.
   Persian is a primary audience, not a translation.
4. **Astro or Starlight stalls** — no release, or a security issue left unaddressed, for
   a sustained period.
5. **A future phase needs interactive server-side behaviour** that static output cannot
   provide. Note that the roadmap does not currently contain such a phase: live
   template previews embed self-contained static artifacts, which static output handles
   natively.

**A revisit is not a failure.** It means one of five specific conditions was met, and
the condition should be named when it happens.

---

## Correction to a prior document

`DOCUMENTATION-DESIGN-SYSTEM-PROPOSAL.md` §6 states that Docusaurus's *"RTL support
exists but needs work for a genuinely Persian-first reading experience."*

**That claim was asserted without verification and is inaccurate.** Docusaurus lists
RTL as an explicit i18n goal, in its own words: *"locales reading right-to-left
(Arabic, Hebrew, etc.) are supported and easy to implement."*

Docusaurus was **not** rejected on RTL. It was rejected on search (C6), weight (C1, C2,
C5) and a moot advantage (C10) — see above. The prior document should be corrected when
it is next edited; it is **not** edited here, because this task authorises creating the
ADR only.

---

## Appendix — what this ADR does not do

- It does not install anything.
- It does not create the documentation workspace or any folder.
- It does not modify `package.json`, a template, the runtime, the installer, a test, a
  lock or `VERSION`.
- It does not commit to a hosting provider (implementation plan §14.4 leaves that open).
- It does not decide the i18n scope (implementation plan Phase 0, decision 3).

Every framework claim above is sourced from the projects' own documentation as read on
2026-09-18, not from recall.
