# Documentation Design System — Proposal

**Status:** proposal only. Nothing in this document has been implemented.
**Applies to:** the future Row-Template documentation platform
(see `DOCUMENTATION-PLATFORM-PROPOSAL.md`).
**Related:** `CUSTOM-TEMPLATE-GUIDELINES.md`, `CUSTOM-TEMPLATES-PROPOSAL.md`,
`UX-SPEC.md`, `DESIGN-REVIEW.md`.

---

## 1. Design philosophy

### 1.1 The target

> **A documentation site that feels like the product it documents: restrained,
> typographic, structurally honest, and fast.**

The named references — Linear, Vercel, Stripe, GitHub Docs — share four qualities
worth borrowing:

| quality | what it means in practice |
|---|---|
| **typographic confidence** | hierarchy comes from type scale and spacing, not from boxes |
| **quiet chrome** | navigation and controls recede; content is the interface |
| **precise density** | information is close together but never crowded |
| **honest structure** | the layout shows how the content is organised |

None of them are decorative. That is the point: a premium documentation experience is
not a *styled* documentation experience, it is one where nothing gets in the way.

### 1.2 Keeping Row-Template identity

Row-Template's own design language is already the right one for documentation. The
Row template is deliberately minimal — one family, one accent, three rule weights, a
spacing ladder, no cards. That is a documentation aesthetic applied to a product.

**So the design system does not invent a new language. It applies Row's existing one
at a documentation scale.**

The three identity constraints that must survive:

1. **Rules and whitespace do the work, not containers.** Where another docs site would
   reach for a card, this one reaches for a hairline and a gap.
2. **One accent, used sparingly.** The accent marks the live thing and the primary
   action. It never becomes decoration.
3. **No remote assets.** The product's whole security story is a self-contained
   artifact. A documentation site that pulls fonts from a third-party CDN would
   contradict the thing it is documenting.

### 1.3 The tension, stated plainly

"Premium like Linear/Vercel/Stripe" usually implies a distinctive self-hosted
typeface. "Row-Template identity" implies the system font stack the product already
uses. These pull in opposite directions.

**Recommendation:** keep `system-ui` for body copy, and treat type *scale and
spacing* as the craft rather than type *face*. This is not a compromise — it is what
makes the site instant-loading, which is itself a premium quality.

If a distinctive face is later judged necessary, it **must be self-hosted and
subset**, never loaded from a remote service (§4.2). The decision is recorded here
rather than made silently.

---

## 2. Brand system

### 2.1 Assets

| asset | file | dimensions | alpha | use |
|---|---|---|---|---|
| **English wordmark** | `Row-Template Logo 2 ( ENG ).png` | 2172×724 (3:1) | RGBA | site header, English locale |
| **Persian wordmark** | `Row-Template Logo 3 ( FA ).png` | 2172×724 (3:1) | RGBA | site header, `fa` locale |
| square mark | `Row-Template Logo 1 ( Main ) Don't Have Bacl Ground.png` | 1254×1254 | RGBA | favicon, social card, mobile |
| square mark (opaque) | `Row-Template Logo 4 ( Main 2).png` | 1254×1254 | RGB | dark/light variant A |
| square mark (opaque) | `Row-Template Logo 4 ( Main 3 ).png` | 1254×1254 | RGB | dark/light variant B |

Assets currently live outside the repository, in a sibling directory:

```
D:\. frank0live Main\3X-UI Template\Row-Template Logo's\
```

### 2.2 Rules

- **The wordmark is the header brand.** Square marks are for favicons, social cards
  and the mobile header — not for the desktop header, where the 3:1 wordmark reads
  better.
- **The Persian wordmark is a distinct asset, never a flipped English one.** It is a
  drawn 3:1 wordmark in its own right.
- **Both wordmarks carry alpha**, so they sit on either theme without a plate. No
  background, no container, no shadow.
- **The mark is never stretched, recoloured or given an effect.** It is placed at its
  natural ratio.

### 2.3 Asset hygiene — a prerequisite

The assets are **outside the repository and untracked**. That is a real problem: a
build that clones the repo cannot reference them, a logo change is invisible, and
nothing is reviewed.

**Before Phase 1, the logo set must be moved into the repository** — for example to
`docs/assets/brand/`, following the existing `docs/assets/` convention which already
holds a banner and two mobile screenshots. The move is a good moment to drop the typo
in `Bacl Ground` and the inconsistent spacing in `( Main 2)` / `( Main 3 )`.

**This proposal does not move the files.** It records the move as a prerequisite
requiring its own approval.

### 2.4 Favicon

The transparent square mark, at 32px and 180px, plus an SVG if one is ever drawn.
Until then, a PNG favicon at those two sizes. The current templates use
`href="data:,"` to suppress the request entirely — the documentation site should not
do that, but it must serve the favicon **from its own origin**, never a third party.

---

## 3. Color system

The palette is **Row's existing palette**, promoted from the template tokens to the
documentation tokens. There is no reason to invent a second one, and a second one
would immediately drift.

### 3.1 Dark theme (default)

| role | token | value | use |
|---|---|---|---|
| page | `--bg` | `#0B0B0C` | document background |
| raised | `--surface` | `#131315` | code blocks, menus, sidebar |
| track | `--track` | `#222226` | inactive bars, inline code |
| rule | `--rule` | `#222226` | hairlines between rows |
| rule strong | `--rule-strong` | `#3A3A40` | section rules, header rule |
| control border | `--control-border` | `#55555E` | input and control outlines |
| text | `--text` | `#EDEDEF` | body copy |
| muted | `--muted` | `#9C9CA4` | captions, secondary |
| subtle | `--subtle` | `#75757E` | labels, metadata |
| **accent** | `--accent` | `#6E9BFF` | links, active nav, focus ring |
| accent solid | `--accent-solid` | `#4C7EF0` | primary button fill |
| accent hover | `--accent-hover` | `#8AB0FF` | hover |

### 3.2 Light theme

| role | token | value |
|---|---|---|
| page | `--bg` | `#FAFAFA` |
| raised | `--surface` | `#FFFFFF` |
| track | `--track` | `#ECECEE` |
| rule | `--rule` | `#E4E4E7` |
| rule strong | `--rule-strong` | `#B6B6BD` |
| control border | `--control-border` | `#7C7C86` |
| text | `--text` | `#101013` |
| muted | `--muted` | `#55555E` |
| subtle | `--subtle` | `#71717A` |
| accent | `--accent` | `#2B54C4` |
| accent solid | `--accent-solid` | `#2B54C4` |
| accent hover | `--accent-hover` | `#1F3F99` |

### 3.3 Semantic colors

Identical token names in both themes; the values differ per theme so contrast holds.

| role | token | dark | light | meaning |
|---|---|---|---|---|
| success | `--success` | `#5FBE8E` | `#1F6B45` | check passed, install complete |
| warning | `--warning` | `#D8A54A` | `#8A5A00` | refusal with a safe path forward |
| error | `--danger` | `#E0726A` | `#B03226` | hard failure |
| info | `--info` | `#74B4D6` | `#1C5E75` | neutral note |
| focus | `--focus` | `#8AB0FF` | `#2B54C4` | focus ring |

### 3.4 The rules that keep it honest

1. **Colour never carries meaning alone.** Every semantic state also carries a word
   or a shape. This is the same rule the templates follow, and it is the reason the
   colourblind case works.
2. **The accent is not a decoration budget.** If the accent appears more than a few
   times per screen, something has gone wrong.
3. **No gradients, no glass, no glow.** The product does not use them and neither
   should its documentation.
4. **Both themes ship from day one.** A dark-only or light-only documentation site is
   a half-finished one.
5. **Contrast is verified, not eyeballed.** Every foreground/background pair must
   meet WCAG AA (§9.3).

---

## 4. Typography

### 4.1 Faces

| role | stack | notes |
|---|---|---|
| **English body** | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | Row's stack verbatim |
| **Persian / Arabic** | `Vazirmatn, "Segoe UI", Tahoma, "Noto Naskh Arabic", "Geeza Pro", sans-serif` | Row's stack verbatim |
| **Code** | `ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | Row's stack verbatim |

Using the product's exact stacks is deliberate: it costs nothing, it loads instantly,
and it makes the documentation look like the thing it documents.

**The Arabic face replaces both voices for `fa` and `ar`.** A monospace font has no
Arabic glyphs, and faux-mono letter-spacing closes the joins that carry the script —
so the Arabic face is used for body *and* code-adjacent text, exactly as the
templates do.

### 4.2 If a webfont is ever added

- It **must be self-hosted**, subset to the characters actually used.
- It **must never** come from a remote font service. A documentation site for a
  product whose selling point is "no remote assets" cannot fetch its own typeface
  from a third party.
- It must be loaded with `font-display: swap` and a system fallback, so the page is
  readable before it arrives.

### 4.3 Heading scale

Documentation needs a slightly larger scale than a subscription page, because it has
h1–h4 and long-form prose. The scale stays modular so the hierarchy is predictable.

| role | size | line-height | weight | letter-spacing |
|---|---|---|---|---|
| `h1` page title | `2.25rem` (36px) | 1.15 | 700 | `-0.02em` |
| `h2` section | `1.5rem` (24px) | 1.25 | 700 | `-0.01em` |
| `h3` subsection | `1.125rem` (18px) | 1.35 | 650 | 0 |
| `h4` minor | `1rem` (16px) | 1.4 | 650 | 0 |
| body | `1rem` (16px) | **1.65** | 400 | 0 |
| lead paragraph | `1.125rem` (18px) | 1.6 | 400 | 0 |
| small / caption | `0.8125rem` (13px) | 1.5 | 400 | 0 |
| label / eyebrow | `0.6875rem` (11px) | 1.3 | 600 | `0.08em`, uppercase |
| code inline | `0.875em` of context | inherit | 400 | 0 |
| code block | `0.875rem` (14px) | **1.7** | 400 | 0 |

**Why body line-height is 1.65 and not Row's 1.55:** documentation is read in long
passages, not scanned in a status page. The extra leading is the single cheapest
readability improvement available.

**Arabic and Persian get more:** `--lh-body: 1.75` for body, `1.9` for code blocks,
and **letter-spacing reset to 0** on any tracked label — tracking closes Arabic joins.

### 4.4 Measure

Body text is capped at **68–72 characters** (`--measure: 68ch`). Code blocks and
tables may exceed it; prose may not. This is the rule that most often separates a
readable documentation site from an unreadable one.

---

## 5. Layout system

### 5.1 Desktop

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER   wordmark ······ version · search · theme · lang    │  56px
├───────────────┬──────────────────────────────┬───────────────┤
│               │                              │               │
│   SIDEBAR     │          CONTENT             │     TOC       │
│   240px       │       minmax(0, 1fr)         │    200px      │
│               │         68ch measure         │               │
│  sticky       │                              │  sticky       │
│  scrollable   │                              │  scrollable   │
│               │                              │               │
├───────────────┴──────────────────────────────┴───────────────┤
│  FOOTER   edit this page · prev/next                         │
└──────────────────────────────────────────────────────────────┘
```

| region | width | behaviour |
|---|---|---|
| header | full | sticky, one rule at its foot, 56px tall |
| sidebar | 240px | sticky, scrolls independently, collapses below 1024px |
| content | `minmax(0, 1fr)`, capped at 68ch | the only scrolling region that matters |
| TOC | 200px | sticky, hidden below 1280px |
| footer | full | prev/next, one rule above |

**Maximum content width:** the three columns sit inside `--page-max: 1440px`. Beyond
that the gutters grow, not the columns — prose measure must not stretch.

**Separation is by hairline, not by box.** Sidebar and TOC are separated from content
by a single `1px var(--rule)`. No panels, no shadows, no rounded containers.

### 5.2 Mobile

```
┌──────────────────────────────┐
│ ☰   mark   ·   🔍   ◐   EN   │  sticky header
├──────────────────────────────┤
│                              │
│        CONTENT               │  full width, 16px gutters
│        (one column)          │
│                              │
├──────────────────────────────┤
│  ← previous      next →      │
└──────────────────────────────┘
```

- **Navigation** — the sidebar becomes a full-height drawer opened by the `☰`
  control. It is a `<dialog>` or an equivalent focus-trapped panel, not a
  `translateX` div, so focus and Escape work without custom code.
- **Search** — a single control in the header opening a full-screen overlay. Not an
  inline expanding input, which breaks at 320px.
- **TOC** — hidden on mobile. A long TOC in a drawer is worse than none; the page's
  own headings are the navigation.
- **No fixed-position bottom bar.** It costs vertical space on exactly the devices
  that have least of it.
- **Tap targets: 44px minimum** (§9.1), no exceptions — the same rule the templates
  follow.

### 5.3 Breakpoints

| breakpoint | change |
|---|---|
| `< 640px` | single column, drawer nav, no TOC |
| `640–1023px` | single column, drawer nav, wider gutters |
| `1024–1279px` | sidebar appears, no TOC |
| `≥ 1280px` | three columns |

Four breakpoints, each adding one thing. No breakpoint reshuffles the layout.

---

## 6. Component library

Nine components. Each is specified as: purpose, structure, and the rules that keep it
consistent with the identity.

### 6.1 Hero

**Purpose:** the first screen of Home. Answers "what is this" and routes the four
audiences.

**Structure:** eyebrow label · h1 · one-sentence lead · four audience doors · a
one-line security statement.

**Rules:** no illustration, no gradient, no animated background. The four doors are
plain links in a row (stacked on mobile), separated by rules — not cards. The
security line is text, not a badge.

### 6.2 Installation Step

**Purpose:** one numbered step in an installation guide.

**Structure:**

```
①  Step title                                    [ copy ]
   One sentence of explanation.
   ┌────────────────────────────────────────────────────┐
   │ $ command to run                                   │
   └────────────────────────────────────────────────────┘
   ✓ Expected: the line the user should see
```

**Rules:** the step number is a real ordered-list marker, not a decorative circle.
The expected-output line is mandatory — a step the reader cannot confirm is a step
they will get wrong. Steps are separated by a hairline and a gap, not by cards.

### 6.3 Error Card

**Purpose:** one Error Center entry (§3 of the platform proposal).

**Structure:** the four mandated parts, in order —

1. **Technical message** — monospace, on `--surface`, copy button
2. **Simple explanation** — plain prose, no jargon
3. **Possible causes** — a list, most likely first
4. **Step-by-step fix** — an ordered list, ending with a confirmation line

**Rules:**
- The severity marker is a **word plus a rule colour**, never a colour alone.
- The card is **not** a card: it is a section with a heavier leading rule. An Error
  Center entry that looks like a panel looks dismissible.
- **No entry may ever instruct the reader to bypass a check.** This is a hard rule
  carried over from the platform proposal.

### 6.4 Warning Box

**Purpose:** a caution inline in a guide.

**Structure:** a leading `2px` rule in `--warning`, a short label, then one or two
sentences.

**Rules:** inline and narrow — it must not break the prose rhythm. Never contains a
command. If it needs a command it is an Installation Step, not a warning. Reserved
for genuine "you can lose data here" cases; a site that warns constantly trains
readers to ignore warnings.

### 6.5 Security Card

**Purpose:** one claim from the Security section (§4 of the platform proposal).

**Structure:** claim · why it matters · how to check it yourself.

**Rules:** the third part is mandatory. A security claim the reader cannot verify is
marketing. Where a claim has a limit — byte locks prove integrity, not authorship —
the limit is stated **inside the card**, not in a footnote.

### 6.6 Code Block

**Purpose:** every code sample.

**Structure:** optional filename/type label · the code · a copy button.

**Rules:**
- **Always LTR**, even inside an RTL page, isolated so the surrounding direction
  cannot reorder it.
- Horizontal scroll **inside the block**; the page itself never scrolls horizontally.
- The copy button is 44px and confirms in place.
- Syntax highlighting is **optional and must degrade to plain text**. A block that is
  unreadable without colour is a block that fails the colourblind and the
  forced-colours case.
- No line-number gutters. They cost horizontal space and nobody copies them.

### 6.7 Template Preview Card

**Purpose:** one of the fifteen templates in the gallery.

**Structure:** name · architecture in one line · desktop + mobile thumbnail · byte
size · headroom · a link to the template page.

**Rules:**
- The thumbnail is a **real screenshot of the frozen artifact**, not a mockup.
- The byte size is shown, because the budget is a real product constraint and showing
  it is honest.
- Cards are separated by rules in a grid, not floated as separate boxes — this is
  where the identity is most at risk of becoming generic.
- **The preview does not rebuild the artifact.** It displays the frozen bytes.

### 6.8 Screenshot Gallery

**Purpose:** multiple views of one template — themes, viewports, RTL.

**Structure:** a grid of labelled thumbnails; click opens a lightbox.

**Rules:**
- Every thumbnail is labelled with **theme, viewport and language**. An unlabelled
  screenshot is decoration.
- The lightbox is a focus-trapped `<dialog>` with Escape to close.
- Images carry meaningful `alt` text.
- Screenshots are captured at a fixed device scale so they are comparable.

### 6.9 API Reference Block

**Purpose:** a documented function, option or flag.

**Structure:** signature · parameters table · returns · one minimal example ·
notes.

**Rules:**
- Parameters are a real `<table>` with a header row — screen readers need the
  relationship.
- Types are monospace; descriptions are prose.
- Exactly one example, minimal. A reference block with three examples is a tutorial.
- Required parameters are marked with a word, not only a colour.

---

## 7. RTL / LTR rules

Persian and Arabic are first-class. RTL is a layout mode, not a mirroring pass.

### 7.1 Persian and Arabic layout

- The document sets `dir="rtl"` on `<html>` and `lang="fa"` or `lang="ar"`.
- **All spacing and placement is logical**: `margin-inline`, `padding-block`,
  `inset-inline-start`, `border-inline-end`, `inline-size`. A physical `left` or
  `right` must be justified in a comment or it is a bug.
- The header brand switches to the **Persian wordmark** (§2.1) — the asset, not a
  flipped English logo.
- The sidebar moves to the inline-start edge (the right, in RTL). Its scrollbar
  follows.
- Chevrons and arrows that indicate direction are mirrored. **Icons that do not
  indicate direction are not mirrored** — a magnifying glass is not mirrored, a
  back-arrow is.
- Text alignment follows the document direction; it is never hardcoded.

### 7.2 Code blocks

> **Code is always LTR, in every locale.**

Code is not prose. Reversing a shell command's direction would change what it means
visually while doing nothing to its meaning. Every code block and inline code span
carries an explicit LTR isolation so the surrounding RTL context cannot reorder it.

The code block's *frame* mirrors — it sits on the inline-start side of the content
column like any other block. Its *contents* do not.

### 7.3 Terminal output

Terminal output follows the same rule as code: **always LTR**.

With one addition: the installer's output contains Persian and Arabic in its messages.
Those messages are wrapped in `dir="auto"` so each message resolves its own direction,
while the surrounding block stays LTR. The installer already handles this correctly;
the documentation must not regress it by pasting raw text into an LTR block.

### 7.4 URLs and identifiers

URLs, subscription links, file paths, template ids and protocol names are
**always LTR** and isolated. A URL that reorders is a URL that no longer works when
copied.

### 7.5 Mixed-direction prose

When a Persian sentence contains a Latin identifier, the identifier is isolated. The
`<bdi>` element or `dir="auto"` on the containing element handles this; hand-placed
direction marks do not survive editing and must not be used.

### 7.6 What must be tested

Every page template, in `fa` and `ar`, at 320 / 390 / 430 / 1440:

- no horizontal overflow;
- no element that accidentally stayed LTR;
- no clipped text;
- code blocks scrolled internally, not the page.

This is the same matrix the RTL audit applies to the templates, and for the same
reason: these are the failures that survive review.

---

## 8. Template Gallery UX

### 8.1 The list

The gallery shows all fifteen frozen templates. Generated from the registry, so it
cannot drift.

| template | accent | radius | page width | bytes | headroom |
|---|---|---|---|---|---|
| row | `#6E9BFF` | 4px | 1000px | 200,999 | 3,801 |
| editorial | `#DD8A5C` | 4px | 720px | 203,848 | 952 |
| canvas | `#8B95F5` | 8px | 840px | 202,339 | 2,461 |
| prism | `#9B6CFF` | 0px | 1000px | 202,127 | 2,673 |
| terminal | `#D9A24B` | 0px | 880px | 199,642 | 5,158 |
| pulse | `#FF7A6B` | 4px | 960px | 202,075 | 2,725 |
| brutal | `#CDF14A` | 0px | 1240px | 202,533 | 2,267 |
| arcade | `#D946EF` | 3px | 1180px | 203,033 | 1,767 |
| sketch | `#9D8FFF` | 0px | 940px | 202,075 | 2,725 |
| signature | `#D3C6A0` | 10px | 880px | 203,679 | 1,121 |
| saffron | `#DB924D` | 12px | 640px | 203,057 | 1,743 |
| pulsenova | `#5EE7FF` | 14px | 760px | 204,267 | **533** |
| prismnova | `#4C7DFF` | 8px | 1140px | 202,967 | 1,833 |
| terminalnova | `#35E08C` | 4px | 672px | 202,944 | 1,856 |
| arcadenova | `#FF2E7E` | 6px | 1180px | 203,310 | 1,490 |

**A note on the accent column:** three templates do not use the token name `--accent`
— arcade and arcadenova use `--signal`, sketch uses `--ink`. This is intentional: each
template owns its tokens. The gallery should read the resolved value, not assume a
token name.

**A note on the headroom column:** pulsenova has **533 bytes** of headroom under the
204,800 ceiling. Showing headroom in the gallery is not decoration — it tells a
reader that this template is the one where a change needs a trim in the same pass.

### 8.2 What each entry shows

1. **Name** and architecture in one sentence — e.g. *Row — reference minimal
   information system*.
2. **Preview** — a real screenshot of the frozen artifact, desktop and mobile.
3. **Size** — bytes, with headroom.
4. **Features** — the template's own composition, described structurally, not
   aesthetically: dominant geometry, how the status reads, how a configuration is
   shaped, how the client area is organised.
5. **Compatibility** — the panels it has been validated against. This must be
   **generated from the validation records**, never asserted by hand, because a
   compatibility claim that is not tested is worse than no claim.

### 8.3 The grayscale requirement

Because the templates are distinguished structurally rather than by colour, the
gallery should offer a **grayscale toggle**. A visitor who turns it on sees
immediately whether a template has a real identity or is only a palette — which is
the same test the design contract applies.

This is a genuinely useful feature, not a gimmick: it exposes the design system's own
honesty.

### 8.4 Filtering and sorting

Filter by: architecture family (legacy / Nova), radius class (cut / soft), page width
band. Sort by: registry order (default), size, name.

**No ranking, no "featured", no popularity.** Every template is a shipped, approved
design; ordering them by preference is a product decision the gallery should not make
by accident.

---

## 9. Accessibility

Accessibility is a requirement, not a section. It is collected here so it can be
checked.

### 9.1 Target and tap sizes

> **Every interactive element is at least 44px in its smallest dimension.**

Buttons, links, tabs, dialog controls, dropdown items, the search control, the theme
toggle, the language selector, the copy button, the drawer handle. **No exceptions.**

**Measure it, do not assume it.** The lesson from the template programme is concrete:
Signature shipped a 40px control because its tap floor enumerated eight selectors and
the offending control was the ninth. The documentation site must have an automated
check, not a hand-maintained list.

### 9.2 Keyboard navigation

- Every interactive element is reachable by `Tab` in a logical order.
- Focus is **always visible**, using `--focus`, with a 2px ring and 2px offset.
- The mobile drawer and the search overlay are focus-trapped and close on `Escape`.
- A skip-to-content link is the first focusable element on every page.
- The TOC and sidebar are navigable without a mouse.
- No keyboard trap anywhere, including in code blocks.

### 9.3 Contrast — WCAG AA

| content | requirement |
|---|---|
| body text | ≥ 4.5:1 |
| large text (≥ 18.66px bold or ≥ 24px) | ≥ 3:1 |
| UI component boundaries | ≥ 3:1 |
| focus indicator | ≥ 3:1 against both adjacent colours |
| semantic colours used as text | ≥ 4.5:1 on their background |

**Both themes must be verified.** The light theme is the one that usually fails —
`--warning: #8A5A00` exists in the light theme specifically because the dark theme's
`#D8A54A` does not hold contrast on white.

### 9.4 Reduced motion

`prefers-reduced-motion: reduce` must disable every transition and animation. The
site should have very little motion to begin with — the design language has no
decorative animation — so this is a small surface.

### 9.5 Beyond AA

- **Forced colours** (`forced-colors: active`) must remain usable. The templates
  already handle this; the site must too.
- **`prefers-contrast: more`** should raise rule and muted-text contrast.
- **Colour is never the only signal** (§3.4).
- Images carry meaningful `alt`; decorative images carry `alt=""`.
- Tables have real header cells, so screen readers can associate them.
- The page has one `<h1>`, and heading levels are never skipped.

---

## 10. Migration safety

### 10.1 The rule

> **The documentation design system must have no effect on the frozen artifacts, the
> build, the runtime, the installer, or the release process.**

Not "should have no effect". **Must have no effect**, and it must be structurally
impossible rather than merely observed.

### 10.2 What must not change

| must not change | why |
|---|---|
| the fifteen frozen artifacts | byte-locked and approved |
| the fifteen byte locks | a design-system change must not move a lock |
| `tools/build.mjs`, `tools/verify.mjs` | the build is the product |
| `tools/templates.mjs` registry semantics | consumed by the installer and manager |
| `src/scripts/**` runtime | shared by every template |
| `src/locales/**` | the locale island must stay byte-identical |
| `installer/**` | released and validated |
| `template/index.html` | the published default |
| `package.json` | the product's build environment |
| `VERSION` | version bumps are release events |
| the release tarball | pinned by `tests/release.test.mjs` |

### 10.3 How it stays safe

1. **Separate build, separate manifest.** The documentation site must not add a
   dependency to the root `package.json`, because that file *is* the product's build
   environment. A separate manifest keeps the two toolchains independent.
2. **Distinct output directory.** The docs build writes to its own directory; it never
   writes into `dist/`, `build/`, `out/` or `release/`.
3. **Read-only consumption.** The gallery reads the registry and the frozen artifacts.
   It never writes to either.
4. **The fifteen-way byte comparison is the gate.** After any documentation change,
   build all fifteen and compare to the frozen values. Zero drift, or the change is
   rejected.
5. **The existing suites stay green and unedited.** If a documentation change requires
   editing a template test, the change reached too far.

### 10.4 The one real coupling

The gallery displays the frozen artifacts. That is a read, and it is safe — but it
means the gallery's build must **copy** the artifacts, never rebuild them. If the
gallery ever runs the template build, a documentation change could in principle alter
what it displays, and the byte comparison would be the only thing standing between
that and a silent drift.

**Rule: the gallery consumes `dist/templates/<id>/template.html` and
`template/index.html` as opaque files.**

### 10.5 Sequencing

Each phase of the documentation platform ends with the same check used throughout
this project: all fifteen artifacts byte-identical, all suites green, zero drift.
**No phase starts before the previous one is green.**

---

## Appendix — What this document does not do

This is a proposal. Creating it:

- created no website file;
- installed no dependency;
- changed no `package.json`, template, runtime, test, registry, lock or `VERSION`;
- did not move the logo assets.

Every token value in §3 and §4 is quoted from the existing template tokens, not
invented. The design system promotes Row's language to a documentation scale rather
than introducing a second one.
