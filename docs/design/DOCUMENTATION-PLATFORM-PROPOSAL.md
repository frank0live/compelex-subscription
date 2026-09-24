# Documentation Platform — Architecture Proposal

**Status:** proposal only. Nothing in this document has been implemented.
**Repository:** `github.com/frank0live/Row-Template` (public)
**Audience:** maintainers, installers, template authors, developers.
**Related:** `CUSTOM-TEMPLATES-PROPOSAL.md`, `CUSTOM-TEMPLATE-GUIDELINES.md`,
`SECURITY.md`, `INSTALLER-DESIGN.md`, `INSTALLER-VALIDATION.md`,
`PANEL-COMPATIBILITY-AUDIT.md`.

---

## 1. Vision and goals

### 1.1 The problem

The repository is already well documented — twenty-one root-level documents
covering design, security, the installer, protocol support, panel compatibility and
the template contract. That documentation is written for people who already know
the project.

It is not usable by the four audiences that actually arrive:

| audience | what they have | what they need |
|---|---|---|
| **users** | a subscription link | "how do I put this in my client" |
| **installers** | a VPS and a shell | "run this, it worked, now what" |
| **developers** | the source | architecture, the build pipeline, the contracts |
| **template authors** | an idea | the contract they must satisfy |

All four currently land on a `README.md` that has to serve all four at once, plus a
`CONTRIBUTING.md` and a set of audit documents written for maintainers.

### 1.2 The goal

> **A documentation site that answers the question a visitor actually has, in the
> first screen, in their own language, without them needing to understand the
> project first.**

### 1.3 What the platform must do

1. **Separate the four audiences** at the entry point, not in a sidebar.
2. **Turn failures into answers.** The installer already refuses unsafe operations
   with precise messages; those messages should each have a page.
3. **Make the security model legible.** The project's strongest property — that
   every artifact is self-contained, deterministic and byte-locked — is currently
   only visible to someone reading the source.
4. **Give custom template authors the contract** in a form they can follow, not
   discover by breaking things.
5. **Serve Persian and Arabic properly**, not as an afterthought translation.
6. **Never affect the release.** Documentation is a separate build with no path into
   the template pipeline.

### 1.4 Non-goals

- A CMS. Documentation is Markdown in the repository, reviewed like code.
- A live dashboard. The docs describe the product; they do not become one.
- Replacing the root documents. The site is a **presentation layer** over the
  existing Markdown, not a second source of truth.
- A template marketplace (see §9, Phase 4 — explicitly deferred).

---

## 2. Information architecture

### 2.1 Top-level map

```
Home
├── Getting Started
│   ├── What Row-Template is
│   ├── Requirements
│   └── Quick install
├── Installation
│   ├── 3X-UI
│   ├── PasarGuard
│   ├── Rebecca
│   ├── Manual installation
│   └── Updating and rollback
├── Error Center            ← see §3
│   ├── Installer errors
│   ├── Build and verification errors
│   ├── Panel errors
│   └── Client errors
├── Security                ← see §4
│   ├── The threat model
│   ├── Self-contained artifacts
│   ├── Deterministic builds and byte locks
│   └── Runtime isolation
├── Template Gallery
│   ├── Overview (all 15)
│   └── One page per template
├── Custom Template Guide   ← see the guidelines document
│   ├── The contract
│   ├── Building your first template
│   └── Acceptance checklist
├── Developer Documentation
│   ├── Architecture
│   ├── Build pipeline
│   ├── Verification pipeline
│   ├── Data bootstrap (the panel seam)
│   └── Localization
└── Contributing
    ├── Development setup
    ├── Reporting an issue
    ├── Submitting a change
    └── Review process
```

### 2.2 Audience routing

The Home page must offer four explicit doors. A visitor should not have to infer
which section applies to them.

| door | lands on | first question it answers |
|---|---|---|
| **I have a subscription** | Getting Started → client setup | how do I use this link |
| **I want to install it** | Installation | what do I run |
| **I want to build a template** | Custom Template Guide | what must I satisfy |
| **I want to work on the code** | Developer Documentation | how is it built |

### 2.3 Section notes

**Home** — one screen: what the project is, the four doors, and the security
posture stated plainly (self-contained, deterministic, byte-locked). No marketing
filler.

**Installation guides** — the installer is safety-gated and refuses unsafe
operations rather than proceeding, so the guides must explain *why* it refuses
before the reader meets a refusal. Each panel gets its own guide because the panel
seam differs (see `PANEL-COMPATIBILITY-AUDIT.md`).

**Error Center** — the largest section, and the one with no equivalent today. See §3.

**Security** — see §4. This section should be readable by a non-developer; the
existing `SECURITY.md` is the maintainer-facing version.

**Template Gallery** — one page per template, generated from the registry so the
list cannot drift. Each page shows: the design name, a desktop and mobile
screenshot in both themes, the architecture in one sentence, and the byte size.
Fifteen templates, fifteen pages, no hand-maintained index.

**Custom Template Guide** — `CUSTOM-TEMPLATE-GUIDELINES.md` is already the
contract; the site presents it as a guide with the acceptance checklist as a
copy-paste list.

**Developer Documentation** — the architecture, the build pipeline, the verification
pipeline, the data bootstrap seam and the localization system. This is where the
existing audit documents become navigable.

**Contributing** — `CONTRIBUTING.md` presented as a flow rather than a document.

### 2.4 Language coverage

The repository already ships READMEs in five languages:

```
README.md (en)  README.fa.md  README.ar.md  README.ru.md  README.zh-CN.md
```

The site's language scope should be decided explicitly rather than inherited by
accident. Two honest options:

- **Full i18n for all five** — matches the existing README coverage, but multiplies
  the maintenance surface for every page, including the Error Center.
- **Full i18n for `en` + `fa` + `ar`, English-only for Developer and Contributing** —
  the two audiences that need Persian and Arabic most (users, installers) get full
  coverage; the two that read source code anyway do not need translation.

**This proposal does not choose.** It records that the decision is a real cost
trade-off and should be made before the first page is written, because retrofitting
i18n is more expensive than starting with it.

---

## 3. Error Center design

### 3.1 Why this is the most valuable section

The installer is deliberately conservative. It refuses rather than proceeds:

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

Every one of those is a **correct refusal** — the installer is protecting the user.
But to someone who has just run a command and seen it stop, each is a wall.

> **The Error Center exists to turn each refusal into an explanation.**

### 3.2 The four-part entry structure

Every error gets a page with exactly four parts, in this order:

#### 1. Technical message

The exact string the tool printed, verbatim and copy-pasteable.

```
template brutal failed its checksum; refusing to switch
```

This part exists so search works. A user pastes the message and lands here.

#### 2. Simple explanation

One or two sentences, no jargon, answering *"what just happened?"*

> The installer checked the template file against the fingerprint recorded when it
> was approved. The two did not match, so it stopped before changing anything. Your
> existing setup is untouched.

#### 3. Possible causes

A short list, most likely first. Each cause is a thing the reader can check.

> - The file was edited after it was downloaded.
> - The download was incomplete or corrupted in transit.
> - The file came from somewhere other than the official release.
> - A different version of the installer is being used than the one the template
>   was released with.

#### 4. Step-by-step fix

Numbered commands, each one copy-pasteable, ending in a way to confirm it worked.

> 1. Re-download the release:
>    ```sh
>    curl -fsSLO https://github.com/frank0live/Row-Template/releases/latest/download/row-template.tar.gz
>    ```
> 2. Verify the archive checksum against the published value.
> 3. Run the installer again.
> 4. **Confirm it worked:** the installer should print the template name and
>    `installed`, with no `refusing` line.

### 3.3 The rule that keeps it honest

> **An Error Center entry must never tell the user to bypass the check.**

Every message in that list is a safety mechanism. "Disable the check" is never the
fix. If a legitimate workflow genuinely requires proceeding despite a warning, that
belongs in the tool as a documented flag, not in a documentation page as a
workaround.

### 3.4 Error taxonomy

| category | source | example |
|---|---|---|
| **Installer** | `installer/lib/row-template.sh` | checksum refusal, symlink refusal, unsupported image |
| **Build and verification** | `tools/build.mjs`, `tools/verify.mjs` | hook count mismatch, budget exceeded, unsubstituted token |
| **Panel** | the panel seam | version not detected, endpoint unreachable |
| **Client** | the client application | import rejected, subscription not updating |

### 3.5 Machine-readable source

The Error Center should be generated from a **single structured source** — one entry
per error, keyed by the exact message — rather than hand-written pages. Reasons:

1. An error string that changes in the installer must fail a test, not silently
   orphan a page.
2. The four parts become fields, so a page cannot ship with three of them.
3. The same source can emit the site pages and a plain-text troubleshooting index
   for people who are reading a terminal, not a website.

This is a Phase 3 deliverable (see §9) because it needs the error strings to be
extracted from the tools first.

---

## 4. Security documentation

The site's Security section presents the model in five parts, in this order, each
answering a question a sceptical reader will actually ask.

### 4.1 Self-contained artifact

**Claim:** the served page is one file. It requests nothing from anywhere.

**Why it matters:** an artifact that fetches a font, a stylesheet or an analytics
script is (a) broken offline, (b) a request that leaks the visitor's IP to a third
party, and (c) impossible to verify by checksum, because its behaviour depends on
something outside it.

**How to check it yourself:** open the artifact with the network tab open. Nothing
should be requested. The document must render identically with the network disabled.

### 4.2 No remote assets

**Claim:** the font, the icons and every image are inlined at build time as data
URIs.

**Why it matters:** this is what makes 4.1 true. The Arabic font is inlined the same
way — it is not fetched.

**How to check it yourself:** search the artifact for `http://` or `https://` outside
of documentation strings and user-supplied subscription URLs.

### 4.3 Deterministic builds

**Claim:** the same sources always produce byte-identical output.

**Why it matters:** a build that varies cannot be verified. Determinism is what makes
"this artifact is the approved artifact" a checkable statement rather than a promise.

**How to check it yourself:** build twice and compare the checksums.

### 4.4 Byte locks

**Claim:** each of the fifteen core templates is pinned to an exact size and
SHA-256. A one-byte change fails the test suite.

**Why it matters:** it makes an unintended change impossible to ship. A template
cannot drift because nobody notices — it drifts because somebody deliberately
updated the lock, and that is a reviewed event.

**How to check it yourself:** run the build tests. A changed artifact reports the
expected and actual hash.

**Honest scope note:** the lock proves *integrity*, not *authorship*. It proves the
file is the approved file. It does not prove who produced it — that is what the
release signing and the repository history are for. The documentation should say so
rather than overclaim.

### 4.5 Runtime isolation

**Claim:** templates share a runtime and own nothing executable.

**Why it matters:** the shared runtime is what keeps fifteen templates from becoming
fifteen dialects of the same behaviour, and it is why a template cannot exfiltrate
anything — it has no script of its own to do it with. The contract is exactly three
`<script>` tags, and a fourth fails the tests.

**How to check it yourself:** count the `<script>` elements in an artifact. There
are three: the boot script, the locale island, and the application script.

### 4.6 What the Security section must not do

It must not promise more than the model delivers. Specifically:

- byte locks do not prove authorship (§4.4);
- the artifact is self-contained, but the **subscription URL** it displays comes from
  the panel and is the user's to protect;
- "no remote assets" is a property of the **built artifact**, and the documentation
  site itself is a normal website with normal assets — the two must not be confused.

---

## 5. Branding and visual direction

### 5.1 Identity

The documentation site should look like the product: restrained, typographic,
structurally honest. The Row template is the reference minimal design, and the site
should read as its sibling — a page that is mostly type, rules and whitespace, with
one accent used sparingly.

**What the site must not become:** a themed marketing site with gradients and cards.
The product's own design language is restraint, and a documentation site that shouts
misrepresents it.

### 5.2 Available assets

The logo assets currently live **outside the repository**, in a sibling directory:

```
D:\. frank0live Main\3X-UI Template\Row-Template Logo's\
```

| file | dimensions | alpha | ratio | intended use |
|---|---|---|---|---|
| `Row-Template Logo 1 ( Main ) Don't Have Bacl Ground.png` | 1254×1254 | **RGBA** | 1:1 | square mark, transparent — works on any background |
| `Row-Template Logo 2 ( ENG ).png` | 2172×724 | **RGBA** | 3:1 | **English wordmark** |
| `Row-Template Logo 3 ( FA ).png` | 2172×724 | **RGBA** | 3:1 | **Persian wordmark** |
| `Row-Template Logo 4 ( Main 2).png` | 1254×1254 | RGB | 1:1 | square mark, opaque — dark/light variant A |
| `Row-Template Logo 4 ( Main 3 ).png` | 1254×1254 | RGB | 1:1 | square mark, opaque — dark/light variant B |

**Reading of the set:**

- **English branding** → `Logo 2 ( ENG )` — the 3:1 wordmark, transparent, so it sits
  on either theme.
- **Persian RTL branding** → `Logo 3 ( FA )` — the matching 3:1 wordmark. Being a
  wordmark rather than a mirrored English logo, it must be used as its own asset and
  **not** produced by flipping the English one.
- **Icon variants** → `Logo 1 ( Main )`, which is the only square with alpha, plus
  the two opaque `Logo 4` squares.
- **Dark/light variants** → `Logo 4 ( Main 2)` and `Logo 4 ( Main 3)`. These are
  opaque, so each is baked for one background; the documentation must record which is
  which before use rather than assuming.

### 5.3 The asset-hygiene problem, stated plainly

The assets are **outside the repository and untracked**. That is a real problem for a
public project:

1. They cannot be referenced by a build that clones the repository.
2. They have no history, so a change to the logo is invisible.
3. They are not covered by any review.

**Recommendation:** before the documentation site is built, the logo set should be
moved into the repository under a versioned path (for example
`docs/assets/brand/`), keeping the existing `docs/assets/` convention — which already
holds a banner and two mobile screenshots. The rename in the move is a good
opportunity to drop the typo in `Bacl Ground` and the inconsistent spacing in
`( Main 2)` / `( Main 3 )`.

**This proposal does not move the files.** It records that the move is a prerequisite
for Phase 1, and that it is a repository change requiring its own approval.

### 5.4 Typography and direction

- The site must ship a Persian/Arabic face and use it for `fa` and `ar`, exactly as
  the templates do. The existing templates already solve this; the site should reuse
  the solution rather than invent a second one.
- RTL must be a first-class layout, not a mirrored afterthought: the Persian
  wordmark, the navigation direction and the code-block direction all need explicit
  handling.
- Code samples stay LTR even inside an RTL page, and are isolated so the surrounding
  direction cannot reorder them.

---

## 6. Technology comparison

Three candidate stacks. **No choice is made here** — the trade-offs are recorded so
the decision can be made deliberately.

### 6.1 Astro Starlight

A documentation theme on top of Astro. Ships with a sidebar, search, i18n routing and
a dark/light toggle.

**Strengths**
- Purpose-built for documentation: the default output is already a docs site, so
  there is little to assemble.
- Excellent static output — ships almost no JavaScript by default, which matches a
  project whose whole security story is "no remote assets".
- First-class i18n routing and a built-in RTL story.
- Content is Markdown/MDX in the repository, reviewed like code.

**Weaknesses**
- Astro is a second toolchain alongside the existing Node/Go build; contributors need
  to learn it to change a page's structure.
- Theming beyond the default requires understanding Astro's component model.
- Version-pinning a theme means tracking its release cadence.

**Fit:** strongest match for "documentation, static, i18n, minimal JavaScript".

### 6.2 Docusaurus

A React-based documentation framework from Meta. The most widely used option in this
space.

**Strengths**
- Very mature: versioned docs, i18n, search, and a large plugin ecosystem are all
  first-party.
- Versioned documentation is built in, which matters if the docs must describe
  multiple releases.
- Enormous community, so most problems are already answered.

**Weaknesses**
- React is a substantial dependency tree for a project that currently has none, and
  it is the same dependency tree the *product* deliberately avoids.
- Heavier client payload than a static-first alternative.
- RTL support exists but needs work for a genuinely Persian-first reading experience.
- The default theme looks like Docusaurus; departing from it costs effort.

**Fit:** strongest if versioned documentation and plugin depth matter more than
payload and dependency weight.

### 6.3 Next.js

A general React framework. Documentation would be assembled from primitives.

**Strengths**
- Maximum flexibility: any layout, any interaction, any data source.
- One framework could serve both the docs and a future interactive surface (§9,
  Phase 2 and 4) without a second toolchain.
- Very large ecosystem and hiring pool.

**Weaknesses**
- **Nothing is provided.** Sidebar, search, i18n routing, versioning and the docs
  layout are all bespoke work and all bespoke maintenance.
- The largest dependency tree of the three, for a documentation site.
- Requires deciding between static export and a server, which reintroduces a hosting
  decision the other two avoid.
- The most surface area to keep secure, for a project whose security posture is part
  of its value proposition.

**Fit:** strongest if the roadmap is expected to grow well past documentation, and the
team accepts building the documentation layer itself.

### 6.4 Comparison summary

| | Starlight | Docusaurus | Next.js |
|---|---|---|---|
| docs features out of the box | most | most | none |
| client JavaScript | least | more | most (unless deliberately static) |
| i18n routing | first-party | first-party | build it |
| RTL quality | good | needs work | build it |
| versioned docs | via config | first-party | build it |
| dependency weight | low | high | highest |
| flexibility | moderate | moderate | total |
| cost to change a page's structure | low | low | medium |
| cost to build the docs layer | lowest | low | highest |
| fits "no remote assets" ethos | strongest | moderate | depends on discipline |

### 6.5 What should decide it

In order of importance for *this* project:

1. **Does the choice add a dependency the product would refuse?** The product is
   proud of shipping one self-contained file with three scripts. A documentation site
   that ships megabytes of client JavaScript is a mismatch worth weighing.
2. **How good is the Persian experience, really?** Not "supports RTL" — actually good
   in Persian. This should be tested on a real page before deciding.
3. **How much of the docs layer must be built?** The Error Center (§3) and the
   template gallery (§2.3) are generated content; a stack that makes generation hard
   costs more than it saves.
4. **Versioned docs — needed or not?** If the docs must describe more than one
   release, that narrows the field considerably.

---

## 7. Deployment options

### 7.1 GitHub Pages

**How:** build the site to a static directory, publish from a workflow.

**Pros**
- Free for a public repository, and already where the code lives.
- HTTPS and the default `github.io` domain come for free.
- No server to patch, no runtime to secure.

**Cons**
- A `github.io` subpath means asset URLs need a base path, which is a classic source
  of broken links.
- A custom domain needs a `CNAME` record and DNS configuration.
- Soft limits on size and build frequency; a large generated gallery could approach
  them.

### 7.2 Custom domain

**How:** point a domain at whichever host serves the site.

**Pros**
- The documentation stops being tied to one host — moving later is a DNS change.
- `docs.example.com` reads as official in a way a `github.io` path does not.
- Necessary if the site ever serves more than documentation.

**Cons**
- A domain to renew, and a DNS record to maintain.
- Certificate handling depends on the host (automatic on Pages and most CDNs).
- **A lapsed domain is a supply-chain risk**: whoever takes it over inherits the
  project's documentation URL.

### 7.3 CDN

**How:** put a CDN in front of the static output.

**Pros**
- Fast for a globally distributed audience — which this project has, given the
  Persian, Arabic, Russian and Chinese readership.
- Absorbs traffic spikes and provides caching without configuration.
- Usually includes TLS, compression and HTTP/2 or /3.

**Cons**
- A third party in the request path, with its own logging and its own outage surface.
- **Directly relevant to this project's security story:** the docs site would depend
  on a third party, while the product's whole argument is that it depends on nothing.
  The two are not contradictory — the artifact and the documentation site are
  different things — but the documentation must say so explicitly, or the contrast
  looks like hypocrisy.
- Cache invalidation needs care when a page changes.

### 7.4 What is orthogonal

- **Domain and host are independent.** A custom domain can point at GitHub Pages.
- **A CDN is a layer, not a host.** It can sit in front of any of the above.
- **The build is the same in all cases.** Whichever is chosen, the site must build to
  a static directory so that changing hosts later is a deployment change and not a
  rewrite.

---

## 8. Migration safety

This is the section that matters most, because the documentation project is the
first thing to touch this repository that is not the product.

### 8.1 The rule

> **The documentation platform must never affect a frozen artifact, a template
> build, the runtime, or the release process.**

Not "should not". **Must not.** And it must be *structurally* impossible, not merely
observed to be true today.

### 8.2 What must not change

| must not change | why |
|---|---|
| the fifteen frozen artifacts | they are byte-locked and approved |
| the fifteen byte locks | a documentation change must not move a lock |
| `tools/build.mjs`, `tools/verify.mjs` | the build is the product |
| `tools/templates.mjs` registry semantics | the installer and manager consume it |
| `src/scripts/**` (runtime) | shared by every template |
| `src/locales/**` | the locale island must stay byte-identical |
| `installer/**` | the installer is released and validated |
| `template/index.html` | the published default |
| `VERSION` | version bumps are release events |
| the release tarball contents | `tests/release.test.mjs` pins it |

### 8.3 How to make it structurally safe

1. **The documentation builds separately.** Its own directory, its own dependency
   manifest, its own build command. Nothing in the template pipeline reads it, and it
   reads nothing from the template pipeline except generated data.
2. **No shared dependency.** The documentation must not add a package to the root
   `package.json`, because that file is the product's build environment. A separate
   manifest keeps the two toolchains independent.
3. **The existing suites must stay green, unchanged.** If a documentation change
   requires editing a test, that is the signal that the change reached too far.
4. **The fifteen-way byte comparison is the gate.** Any documentation change should
   be followed by the same check used throughout this project: build all fifteen,
   compare to the frozen values, require zero drift.
5. **Generated content is read-only.** The template gallery reads the registry; it
   must never write to it.

### 8.4 Risks

| risk | mitigation |
|---|---|
| a root `package.json` change breaks the build | separate manifest; the root manifest is not touched |
| a docs build writes into `dist/` or `build/` | distinct output directory; verified by the byte comparison |
| generated gallery content drifts from the registry | generate at build time; never hand-maintain a list |
| a docs dependency pulls a transitive package into the product | separate install root |
| the docs site implies the product makes network requests | §4.6 — the documentation must state the distinction explicitly |
| the logo assets stay outside the repo and rot | §5.3 — move them in as a separate, approved change |

### 8.5 Sequencing

The documentation project should be introduced the way the custom-template work was:
one phase at a time, each ending in a verified byte-identity check over all fifteen
artifacts. **No phase starts before the previous one is green.**

---

## 9. Future roadmap

Four phases. Each is independently valuable, and each is a prerequisite for the next.

### Phase 1 — Documentation MVP

**Content:** Home, Getting Started, Installation (all three panels), Security,
Template Gallery, Custom Template Guide, Developer Documentation, Contributing.

**Includes:**
- the technology decision from §6 and the hosting decision from §7;
- the logo assets moved into the repository (§5.3);
- the i18n scope decided (§2.4);
- the template gallery generated from the registry, not hand-maintained.

**Success:** a user, an installer, a developer and a template author can each land on
the site and find their answer without reading the repository.

**Gate:** all fifteen artifacts byte-identical; all existing suites green and
unedited.

### Phase 2 — Interactive examples

**Content:** live previews. Each of the fifteen templates rendered inline, in both
themes, at multiple viewports, with the real fixtures.

**Why it needs Phase 1:** it requires the gallery's generated content and a hosting
decision that can serve the artifacts.

**The interesting constraint:** the artifacts are self-contained, so they can be
embedded without a runtime — which is exactly the property that makes this phase
cheap. A stack that cannot embed a static document is the wrong stack.

**Gate:** embedding must not modify the artifacts. The gallery displays the frozen
bytes; it does not rebuild them.

### Phase 3 — Error database

**Content:** the Error Center (§3), generated from a structured source.

**Why it needs Phase 1 and 2:** it needs the site, and it needs the error strings
extracted from the tools and the installer.

**Includes:**
- one structured entry per error, keyed by the exact message;
- a test that fails when a tool's error string no longer matches an entry, so a page
  cannot silently orphan;
- a plain-text index for terminal users.

**Gate:** every error string in `installer/lib/row-template.sh` and the verification
tools maps to exactly one entry, and the mapping is tested.

### Phase 4 — Template marketplace

**Content:** a place to discover and install community templates.

**Explicitly deferred, and this proposal recommends keeping it deferred.** The
reasons are worth recording now, because they will not have changed when the phase
arrives:

1. **The contract is the hard part, and it is already written.**
   `CUSTOM-TEMPLATE-GUIDELINES.md` defines what a template must satisfy. A
   marketplace does not make satisfying it easier.
2. **A marketplace implies a trust model the project does not have.** A template is
   executable in the sense that it is markup and CSS served to a user's browser. Who
   reviews it? Who is accountable when it is wrong? Byte locks solve integrity, not
   authorship (§4.4), and a marketplace is mostly an authorship problem.
3. **The tier work is a prerequisite, and it is only at Phase 1.**
   `CUSTOM-TEMPLATES-PROPOSAL.md` describes the tier model; its directory move is the
   one step that can plausibly break a frozen artifact. A marketplace built on an
   unfinished foundation multiplies that risk.
4. **Distribution can be simpler than a marketplace.** A community template is a
   directory of files and a registry entry. A documented contribution path may serve
   the need without building a platform.

**If Phase 4 is ever pursued, the gate should be:** a custom template can be
contributed, reviewed and installed through a documented process that leaves all
fifteen core artifacts byte-identical — and that process should exist and be used by
hand before any of it is automated.

---

## Appendix — What this document does not do

This is a proposal. Creating it:

- created no website file;
- added no dependency;
- changed no build, template, runtime, test, registry or lock;
- did not change `VERSION`;
- did not move the logo assets.

Nothing here is authorised by this document. Each phase requires its own approval,
and the migration-safety gate in §8.3 applies to every one of them.
