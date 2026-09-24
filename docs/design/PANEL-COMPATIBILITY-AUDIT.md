# PasarGuard + Rebecca Compatibility Audit

**Phase 0 — source audit only. No implementation. No production files modified.**

Workstream: panel compatibility. Visual template work is out of scope for this document.

| | |
|---|---|
| Audit date | 2026-09-18 |
| Documentation correction pass | 2026-09-19 — stale counts and HEAD references corrected; no new analysis, no recommendation change (see the note below) |
| Row-Template | branch `feat/v1.2-multitemplate`, HEAD `347f828` at audit time (**now `a012108`** — see the Phase 1 reconciliation block below), VERSION 1.1.0, tags v1.0.0 / v1.1.0 |
| Row-Template working tree | 0 tracked source modifications; only the three audit documents differ |
| PasarGuard source | `D:\. frank0live Main\3X-UI Template\PasarGuard Panel\panel-main` (v5.4.1) |
| Rebecca source | `D:\. frank0live Main\3X-UI Template\Rebecca Panel\Rebecca-master` (module `github.com/rebeccapanel/rebecca`, go 1.25) |
| Method | local source read directly; internet used only to pin third-party engine semantics |

> **Documentation correction pass — 2026-09-19.** This document was written against a
> catalogue that has since settled at **15 frozen templates**. The corrections applied were
> mechanical and did not change any finding, option, or recommendation:
>
> | Corrected | Was | Now |
> |---|---|---|
> | `{{ end }}` count (§4.3) | ×105 | **×177** across all 15 layouts |
> | All per-form action counts (§4.3) | ~9-template era | re-measured across all 15 layouts |
> | Distinct action forms (§4.3) | 27 (unstated basis) | **27**, with the 27-vs-28 literal-token reconciliation now shown |
> | Templates affected by a runtime change (§14.2, §15, §16, §17) | "all 14 artifacts" | **"all 15 artifacts"** |
> | Lock accounting (§1.4) | already correct | **15 byte + 15 SHA = 30 lock assertions** (unchanged, cross-referenced from §20) |
> | HEAD reference (header) | `c00a77f` | **`347f828`** |
>
> The architectural conclusion is **unchanged**: multi-panel support is **not approved**, and
> the recommendation remains to keep Row-Template **3X-UI focused** (§20, now stated
> explicitly). No source file, artifact, installer file, or `VERSION` was modified.

---

> ## Flag renderer coverage model — cross-reference (added 2026-09-20)
>
> **This document's own conclusion is unchanged by this note.** Multi-panel support remains
> **not approved**, and the recommendation remains to keep Row-Template **3X-UI focused**
> (§20). This block records one correction from the sibling flag workstream, because §15's
> frozen-template impact analysis and §20's headroom argument both reference the flag
> renderer and a reader arriving here could otherwise take the wrong number from it.
>
> ### The correction
>
> The flag renderer's `FLAGS` registry holds **six** CSS gradients (`DE FR NL JP SE US`).
> That is the size of the *CSS renderer*, not of *country support*:
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
> Measured by sweeping all 258 assigned codes through the real `flagOf` and the real badge
> path: **258 flags, 0 monograms**. The coverage model is pinned by four tests in
> `tests/explorer.test.mjs` — the six CSS flags individually, the emoji-fallback countries
> (`TR IR GB CA AE SG KR CN IN BR HK`), the exhaustive 258-code registry sweep, and the
> invalid-code monogram fallback (`ZZ XX QQ`). That file went **23 → 27 tests**; all pass, and
> the addition is tests-only (+100 / −0) so **no artifact byte moved**.
>
> ### Why it matters to this document
>
> §15 predicts the change class a shared-runtime edit represents, and the flag renderer is a
> live instance of it: it re-baselined **all 15 artifacts** and **all 30 lock assertions**.
> The binding template `pulsenova` is at **204,542 B** — **258 B** of headroom, not the 533 B
> §20 quotes. That strengthens §20's first argument rather than weakening it, and it is the
> figure any panel work must be measured against.
>
> Nothing in this document's findings, options or recommendation changes. `VERSION` is still
> 1.1.0; nothing is pushed and no tag exists.

> ## Phase 1 reconciliation — 2026-09-20 (documentation only)
>
> **This document's own conclusion is unchanged.** Multi-panel support is still **not
> approved**, and the recommendation is still to keep Row-Template **3X-UI focused** (§20).
> Nothing below alters a finding, an option or a recommendation. It records only that the
> tree has moved, and that the change class §15 describes has now occurred once — by a
> different workstream.
>
> ### Tree state
>
> | | At audit time | **Now** |
> |---|---|---|
> | HEAD | `347f828` | **`a012108`** |
> | `VERSION` | 1.1.0 | **1.1.0** (unchanged) |
> | Tags | v1.0.0 / v1.1.0 | **unchanged** — no tag on any new commit |
> | Working tree | only the three audit documents differ | **still only the three audit documents differ** |
> | Lock assertions | 15 byte + 15 SHA = **30** | **30** — same count, all re-baselined |
>
> Three commits landed between the audited HEAD and the current one:
> `46abb7e` (`perf: compact country code registry`) → `9a37123` (`docs: make preview
> capture reproducible across days`) → `4a95cbc` (`feat: paint assigned country flags
> without an image`) → `a012108` (`docs: refresh template previews for flag renderer`).
> These belong to the **flag-renderer workstream**, not to this one. Nothing is pushed, no
> tag was created, and `VERSION` did not move.
>
> ### §15's central prediction has now been exercised once
>
> §15.1 states that any edit to a file concatenated into an artifact changes every artifact
> that includes it, and §15.2 predicts that editing any `src/scripts/*.js` affects **all 15**
> artifacts and re-baselines all 15 byte-locks. That prediction is now a measured event,
> not a projection:
>
> | §15.2 row | Predicted | **Observed (flag renderer, `4a95cbc`)** |
> |---|---|---|
> | Edit any `src/scripts/*.js` | **all 15**; all 15 re-baseline | **exactly that** — `src/scripts/flag.js` (+55) and `src/scripts/explorer.js` (+2) moved **all 15** artifacts by a uniform **+890 B**, and all **30** lock assertions were re-baselined |
> | Edit `src/index.html` | none; 0 re-baseline | still untested — `src/index.html` remains dead code and was not touched |
> | Edit one `src/templates/<id>/*.css` | that template only; 1 re-baseline | not exercised |
>
> **The mechanism behaved exactly as §15 describes.** A two-file shared-runtime edit is a
> global re-freeze; there is no such thing as a local change to the concatenated runtime.
> That is the strongest available evidence for §20's first argument, and it was obtained
> the expensive way.
>
> ### §20 item 3 — the headroom figure
>
> §20 argues against the work partly on the ground that the binding template `pulsenova`
> holds "only 533 B of headroom". **The current figure is 258 B**, not 533 B:
> `pulsenova` is now **204,542 B** against the 204,800 B ceiling. The argument is
> therefore stronger than §20 states, not weaker. (Sequence: 204,267 B / 533 B at the
> audited HEAD → 203,652 B / 1,148 B after `46abb7e` reclaimed 615 B → 204,542 B / 258 B
> after the renderer.) **The whole catalogue remains under the ceiling — 0 of 15 artifacts
> exceed 204,800 B.**
>
> ### §14.3 — a note on scope, not a contradiction
>
> §14.3 lists `src/scripts/{…,explorer,…,flag,…}.js` as **"explicitly NOT to be touched"**.
> That remains correct **as a constraint on this workstream's own change surface** — this
> audit still proposes no change to any of those files. It is not a claim that the files
> are immutable: the flag-renderer workstream changed `flag.js` and `explorer.js` in
> `4a95cbc`, which is precisely why §15's re-freeze occurred. Readers comparing the two
> documents should not read §14.3 as a statement that these files are still at their
> `347f828` contents.
>
> ### Unaffected
>
> §0's headline findings, the PasarGuard and Rebecca source audits (§2, §3), the engine
> comparison (§4), the data-contract and protocol matrices (§5, §6), the live/status,
> activation, caching, security and installer analyses (§7–§11), the compatibility matrix
> (§12), the adapter schema (§13), the phase plan (§16), the test strategy (§17), the VPS
> analysis (§18) and the open questions (§19) are all statements about the *panels*, and
> none of them is touched by the flag renderer. Appendix B's hygiene record describes what
> **this** audit did and remains accurate for it.

---

## 0. Headline findings

1. **The three panels do not share a template engine, and none of the three can render the same shell file.**
   3X-UI = Go `html/template`. PasarGuard = Jinja2. Rebecca = pongo2 v6 (Django-style).
   `{{ if .x }}…{{ end }}` is valid only in the first.

2. **Rebecca already ships a PasarGuard→pongo2 compatibility normalizer.** Its default
   subscription page is a port of PasarGuard's Jinja template, rewritten into pongo2 by
   regex at render time. Rebecca is therefore *already* the closest thing to a
   "PasarGuard-compatible" panel, and its normalizer is direct prior art for our adapter.

3. **Rebecca is architecturally the closest panel to Row-Template.** It has a template
   file + settings-selected template name + a custom templates directory + a
   path-traversal-safe resolver + an `/info` JSON endpoint + `links[]` in the render
   context. PasarGuard is similar but weaker (no path safety, no autoescape, free-text
   template name).

4. **PasarGuard `panel-main` as supplied does not compile.** 13 `SyntaxError`s from
   Python-2 exception syntax (`except A, B:`). See §2.0. This blocks runtime validation
   of PasarGuard but not static contract analysis.

5. **Row-Template's traffic UI consumes only the *combined* `used` and `total`.** `download`
   and `upload` are parsed into the model and never displayed (`render.js`, `main.js`,
   `connect.js` contain no reference to either). This is important: PasarGuard and Rebecca
   both track a single `used_traffic` counter with no upload/download split, and neither
   panel's own `subscription-userinfo` header invents one (`upload=0; download=<used>`).
   The combined-only UI means **no fabricated split is ever required.**

6. **Live polling is the one capability that cannot be delivered without touching the
   shared runtime.** Row-Template polls `location.pathname + '?format=info'`. Both new
   panels put the info payload on a *path suffix* (`/sub/<token>/info`), not a query
   parameter. Reaching it requires either a runtime change (→ all 15 byte-locks
   re-baseline) or a reverse proxy. See §15 and §16.

7. **No announce on Rebecca.** Rebecca has no announce concept anywhere in source — not in
   settings, not in headers, not in the render context. It is a clean `UNSUPPORTED`, and
   the UI must degrade by omission.

---

## 1. Row-Template current integration architecture

Read directly from source. Where the project's own docs disagreed with source, source won;
no disagreement was found.

### 1.1 What a "template" actually is

`tools/templates.mjs` is the authoritative closed registry: **15 entries**
(`row`, `editorial`, `canvas`, `prism`, `terminal`, `pulse`, `brutal`, `arcade`, `sketch`,
`signature`, `saffron`, `pulsenova`, `prismnova`, `terminalnova`, `arcadenova`).
Each entry carries `id`, `name`, `order`, `available`, `emitDataTemplate`, `styles`
(an ordered list of **CSS files only**), and — since the tier work — `tier` and `locked`,
which default to `core` and `true`. **All 15 entries are `tier: core`, `locked: true`,
and `available: true`.**

A template is therefore:

- **5 CSS files** — `tokens.css`, `base.css`, `layout.css`, `components.css`, `rtl.css`,
  under `src/styles/` (Row) or `src/templates/<id>/`;
- **one `layout.html`** — a complete `<!doctype html>` document.

> **All 15 templates own `src/templates/<id>/layout.html` and all 15 use it.** The
> shared-shell model is retired: `loadLayout()` in `tools/build.mjs` selects a
> template's own layout when the file exists and only falls back to `src/index.html`
> otherwise, and since every template now has one, **`src/index.html` is no longer used
> by any template** — it remains in the tree as dead code. The earlier revision of this
> audit described 8 templates owning a layout and 6 sharing `src/index.html`; that is
> obsolete.
>
> **The registry `layout` field is vestigial — do not read it as the source of truth.**
> `tools/templates.mjs` declares `layout: true` on only **13 of the 15** entries
> (`editorial` and `canvas` omit it), yet both of those templates *do* own and use a
> `layout.html` (`src/templates/editorial/layout.html`, `src/templates/canvas/layout.html`).
> The field is decorative: **no tool and no test reads `tpl.layout`.** Layout selection is
> decided purely by `existsSync()` on the filesystem, which is why the registry flag can
> disagree with reality without breaking anything. Any future work that branches on
> `layout` would introduce a bug on the two templates that omit it.

**Consequence for this workstream:** the *visual* layer is pure CSS and is 100 % portable
across panels. Only the shell (HTML + the 27 Go-template actions it contains) is
engine-bound. Panel compatibility is a shell/engine problem, not a design problem.

### 1.2 Layout contract

`tools/build.mjs` defines `REQUIRED_HOOKS`: **79 element ids** that every layout must
contain exactly once (`announce-slot`, `announce-source`, `bar-slot`, `brand-mark`, …,
`traffic-caption`, `traffic-trailing`, `traffic-value`, `updated-slot`).
`validateLayout()` throws on any missing or duplicated hook.

> **Corrected: 79, not 78.** Verified from `tools/build.mjs` at HEAD `347f828`
> (`REQUIRED_HOOKS.length === 79`). All 15 templates satisfy it.
>
> **The shared-shell exemption no longer applies.** Every template is validated, because
> every template owns its layout. There is no grandfathered shell.

This is the seam the adapters must honour: **the runtime addresses the DOM by id only, and
never learns which layout or panel rendered it.**

### 1.3 Build pipeline

`tools/build.mjs`:

- concatenation order is explicit — `BOOT = [detect.js, boot.js]`,
  `APP = [model.js, format.js, url.js, i18n.js, brand.js, flag.js, config.js, clipboard.js,
  qr.js, clients.js, live.js, render.js, connect.js, explorer.js, main.js]`,
  `LOCALES = [en, fa, ar, ru, zh]`;
- ES-module syntax is stripped so the sources concatenate into one shared scope;
- comments are stripped by whole-line rule, keeping only `/* row:…` and `/* ---- ` banners;
- substitutions: `/*__STYLES__*/`, `/*__BOOT__*/`, `/*__LOCALES__*/`, `/*__APP__*/`,
  `__TEMPLATE_ID__`, plus the font base64 block between `/* row:font-face */` markers;
- output: `template/index.html` for the default template, else
  `dist/templates/<id>/template.html`;
- size gates: **WARN 185 KiB, FAIL 204,800 B** — explicitly non-raisable.

The artifact is **one self-contained file**: 1 inline `<style>`, 3 inline `<script>`, no
network references.

### 1.4 Verification pipeline

`tools/verify.mjs` (`npm run verify`):

- exactly **1 `<style>` and 3 `<script>`** elements;
- minimum 40 KiB;
- branding block present and substitutable (`/* row:branding */` … `/* row:branding end */`);
- every inline script compiles;
- `FORBIDDEN`: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval(`, `new Function(`,
  `document.write`, `sourceMappingURL`, `localhost`, `127.0.0.1`, developer machine paths,
  `row-dev`, any CDN host, any AI attribution;
- remote-reference gate — the only permitted remote literal is
  `http://www.w3.org/2000/svg`;
- invisible-character guard (`U+200C` etc. must be JSON-escaped, not literal).

`tests/build.test.mjs` holds `FROZEN_ARTIFACTS` — the byte-lock table, plus four
individual lock tests. Together they pin **all 15 templates** to exact byte counts and
sha256 digests: 11 `FROZEN_ARTIFACTS` rows (`prism`, `terminal`, `pulse`, `brutal`,
`arcade`, `sketch`, `signature`, `saffron`, `prismnova`, `terminalnova`, `arcadenova`)
and 4 individual locks (`row`, `editorial`, `canvas`, `pulsenova`), with no overlap.
That is **15 byte assertions + 15 SHA assertions = 30 lock assertions.**
**This is the regression authority.**

### 1.5 Data bootstrap (the panel seam)

The shell emits three server-rendered islands; the runtime reads them and never re-fetches
the page:

| Island | Content | Read by |
|---|---|---|
| `#sub-data` | 13 `data-*` attributes | `readDocument()` → `normalize()` |
| `#announce-source` | announce text as element content | `.textContent` |
| `#links-source` | one `<span>` per raw share URI | `.textContent` per span |

`src/scripts/model.js` is documented as "the single normalisation point". It reads both
the `data-*` attributes and the `?format=info` payload into the **panel's own field names**,
then normalizes once:

```
raw:        enabled, isOnline, downloadByte, uploadByte, totalByte, expire,
            lastOnline, subUrl, subJsonUrl, subClashUrl, subTitle,
            subSupportUrl, announce, datepicker
normalized: enabled, online, download, upload, used, total, expire,
            lastOnline, subUrl, subJsonUrl, subClashUrl, title,
            supportUrl, announce, jalali
```

Derived views in the same file: `health()` → `disabled | expired | limited | active`;
`isOnline()`; `traffic()` → `usage-unknown | limit-unknown | unlimited | reached | empty |
inuse`; `expiry()` → `unknown | never | pending | expired | today | tomorrow | future`.

Note the deliberate omissions: the subscriber's own address is never read; a percentage is
returned only when one can honestly be computed; out-of-range `expire` values become
`null` rather than rendering as 1970 or 5138.

### 1.6 Live status

`src/scripts/live.js`: polls `win.location.pathname + '?format=info'` with
`Accept: application/json`, `credentials: 'omit'`, `cache: 'no-store'`.
15 s while visible, 60 s idle, 8 s timeout, jitter, backoff `[15,30,60,120]s`,
`MAX_FAILURES = 6`. A non-JSON body or a wrong-shape body halts the poller with
`'unsupported'` and **leaves the server-rendered figures standing**. The poll address is
built from the current path, never from the model, so a rewritten subscription URL cannot
redirect the poll.

### 1.7 Localization

`src/locales/{en,fa,ar,ru,zh}.json`, embedded as a single
`<script type="application/json" id="i18n-data">`. `buildLocales()` throws if a key is
missing or empty in any catalogue. RTL is handled by `dir` + per-template `rtl.css`.

### 1.8 Individual config explorer

`.links` → `#links-source` spans → `src/scripts/config.js` `classify(raw)` → descriptor
`{raw, scheme, protocol, category, specialized, name, copyable, qr}`. Allowlisted schemes:
`vmess vless trojan ss hysteria hysteria2 wireguard vpn(amneziawg) tg(mtproto)`.
DOM is built with `createElement`/`textContent` only (the `FORBIDDEN` list forbids the
alternatives).

### 1.9 Installer

`installer/lib/row-template.sh`, sourced by `installer/install.sh` and the installed CLI
`/usr/local/bin/row-template`.

- install root `RT_ROOT=/etc/3x-ui/sub_templates/row-template` (deliberately *not* the
  panel's config root);
- `RT_LIVE=$RT_ROOT/sub.html` — the generated file the panel serves;
- `RT_DIST` — canonical pristine artifact + `.sha256`;
- `RT_TEMPLATE_STORE=$RT_ROOT/dist/templates/<id>/` — one verified artifact per design;
- **activation = the panel's own `settings` row `subThemeDir`**, written directly with
  `sqlite3` when available, otherwise the admin is guided to the panel UI;
- `RT_MIN_XUI=3.6.0`;
- branding is injected as JSON string literals; `config.env` is never sourced or eval'd;
- every replacement is staged, validated, then swapped by atomic rename; backups and
  rollback exist; `rt_validate_template()` is a dependency-free structural gate
  (`<!doctype html>` head, `</html>` tail, exactly one branding marker pair, `id="sub-data"`
  present, `var BRANDING` present, no unsubstituted `/*__…__*/` placeholders, ≥40 KiB);
- **the panel's source tree is never patched.**

### 1.10 3X-UI serving contract (validated on a real server)

`GET /sub/<subId>` is content-negotiated on one path:

| Request | Response |
|---|---|
| browser Accept/UA | `200 text/html` — the Row-Template page |
| VPN client UA | `200 text/plain` — base64 share links |
| `?format=info` | `200 application/json` — 21-key info payload |

Template loader precedence `sub.html` > `index.html`, mtime re-read, silent fallback to the
built-in page on template error. `subThemeDir` exists since v3.3.0.

`?format=info` keys: `enabled:bool`, `isOnline:bool`, `lastOnline:int` (0 = never),
`expire:int` (Unix **seconds**; 0 = never), `downloadByte`/`uploadByte`/`totalByte:int`
(`totalByte=0` = unlimited), `download`/`upload`/`used`/`total`/`remained:str`,
`datepicker:str`, `announce:str`, `subTitle:str`, `subSupportUrl:str`, `emails:list`,
`sId`/`subUrl`/`subJsonUrl`/`subClashUrl`.

Documented rendering note: Go `html/template` strips comments at render, so the `row:`
markers exist only in the artifact and must never be used as a runtime "is Row-Template
active" signal — the structural ids are the correct observable.

---

## 2. PasarGuard source audit

Version 5.4.1. Python ≥ 3.14, FastAPI + uvicorn, SQLAlchemy async, Jinja2 ≥ 3.1.6.
Repo `github.com/PasarGuard/panel`.

### 2.0 SOURCE INTEGRITY — the supplied snapshot does not compile

**This is a blocker for runtime validation, and it is present in the published zip, not
introduced by extraction.**

`panel-main.zip` and the extracted `panel-main/` tree agree byte-for-byte on this. An AST
sweep of `app/**/*.py` with Python 3.13.12 reports **13 `SyntaxError`s**, all of the form
`except A, B:` (Python 2 syntax; removed in Python 3.0; PEP 3110):

```
app/lifecycle.py:24
app/core/hosts.py:500
app/core/xray.py:234
app/jobs/record_usages.py:479
app/nats/router.py:97
app/operation/subscription.py:144
app/subscription/share.py:175
app/subscription/share.py:185
app/telegram/fsm_storage.py:143
app/utils/crypto.py:93
app/utils/jwt.py:43
app/telegram/handlers/admin/bulk_actions.py:98
app/db/crud/admin.py:79
app/db/crud/general.py:216
```

`app/operation/subscription.py` and `app/subscription/share.py` are both on the
subscription render path, so the panel cannot start, let alone serve a subscription page.

The `Dockerfile` performs no transformation (`uv sync --frozen`, `ADD . /build`) and there
is no `sed`/patch step in `.github/workflows/` or the `Makefile` that would repair this.
`pyproject.toml` declares `requires-python = ">=3.14"`.

**Impact on this audit:** static contract analysis (§2.1–§2.9) is unaffected and remains
valid — the defects are syntax-level and the surrounding logic is readable. **Runtime
validation requires a working build.** Two options, both to be decided before Phase 2:
either obtain a known-good upstream revision, or apply a mechanical
`except A, B:` → `except (A, B):` repair to a throwaway copy for testing only. I will not
silently patch the supplied source as if it were authoritative.

### 2.1 Template engine

**Jinja2.** `app/templates/__init__.py`:

```python
template_directories = ["app/templates"]
if template_settings.custom_templates_directory:
    template_directories.insert(0, template_settings.custom_templates_directory)

env = Environment(loader=FileSystemLoader(template_directories))
env.filters.update(CUSTOM_FILTERS)
env.globals["now"] = lambda: dt.now(UTC)

sandbox_env = SandboxedEnvironment()
sandbox_env.filters.update(CUSTOM_FILTERS)
sandbox_env.globals["now"] = lambda: dt.now(UTC)

def render_template(template, context=None):    return env.get_template(template).render(context or {})
def render_template_string(content, context=None): return sandbox_env.from_string(content).render(context or {})
```

- **File templates use a plain `Environment` — `autoescape` is not set, i.e. `False`.**
  A repo-wide grep for `autoescape` / `select_autoescape` / `Markup` / `markupsafe` across
  `app/` returns **nothing**.
- `render_template_string` (sandboxed) is used only for admin-authored *client* templates
  (Clash/Xray/Sing-box/User-Agent), not for the subscription page.
- Globals: `now()` → `datetime.now(UTC)`.
- Filters: `yaml`, `except`, `only`, `datetime`, `bytesformat` (`app/templates/filters.py`),
  plus Jinja builtins — the page uses `replace`.

### 2.2 Template location

Files on disk, not DB records:

- `app/templates/subscription/index.html` — the subscription page (default);
- `app/templates/home/index.html` — the **pre-built React dashboard SPA** (a bundled
  single-file app, not a hand-written page);
- `app/templates/filters.py`, `app/templates/__init__.py`.

`template_settings.custom_templates_directory` is **prepended** to the loader search path,
so a user-supplied file of the same relative name shadows the built-in one.

### 2.3 Template activation

Four mechanisms, in precedence order:

1. **Per-admin override** — `admins.sub_template` (`String(1024)`, migration
   `0b62f893092b`). `app/operation/subscription.py:447`:
   `template = db_user.admin.sub_template if db_user.admin and db_user.admin.sub_template
   else template_settings.subscription_page_template`. In the dashboard this is a plain
   free-text `<Input>` (`dashboard/src/features/admins/dialogs/admin-modal.tsx:498`,
   schema `sub_template: z.string().optional()`). **No dropdown, no registry, no validation
   against what actually exists.**
2. **Global default name** — env `SUBSCRIPTION_PAGE_TEMPLATE`, default
   `subscription/index.html`.
3. **Custom templates directory** — env `CUSTOM_TEMPLATES_DIRECTORY`.
4. **Disable** — subscription setting `disable_sub_template` (bool): when true a browser
   request gets the raw config inline instead of the HTML page.

The gate is `is_browser_request = "text/html" in accept_header` **and**
`not sub_settings.disable_sub_template`.

### 2.4 Complete verified variable contract

The render context is built by `_build_subscription_body_payload()`
(`app/operation/subscription.py:597`) and is exactly five keys:

| Name | Type | Nullable | Populated at | Meaning |
|---|---|---|---|---|
| `user` | `SubscriptionUserResponse` | never | `SubscriptionUserResponse.model_validate(user)` | the subscriber record |
| `links` | `list[str]` | never (may be `[]`) | `fetch_config(user, ConfigFormat.links)` → `conf.splitlines()` | raw share URIs |
| `announce` | `str` | never (`""`) | `_format_announce()` | announcement text, `.format_map()`-expanded |
| `announce_url` | `str` | never (`""`) | `_format_announce_url()` | announcement link |
| `apps` | `list[Application]` | never (`[]`) | `_make_apps_import_urls()` | recommended-client cards |

`links` is gated: `is_allow_browser_config = sub_settings.allow_browser_config and (not
is_hwid_enabled or not global_hwid_conf.require_hwid_for_manual_sub)`. **When that is
false, `links` is `[]` and the page must render without a config list.**

`user` is `SubscriptionUserResponse` ⊂ `UserResponse` ⊂ `UserNotificationResponse`
(`app/models/user.py`). Fields:

| Field | Type | Nullable | Meaning |
|---|---|---|---|
| `id` | `int` | no | user id |
| `username` | `str` | no | `^[a-zA-Z0-9-_@.]+$`, 3–128, no consecutive specials |
| `status` | `UserStatus` | no | `active \| disabled \| limited \| expired \| on_hold` |
| `used_traffic` | `int` | no | **combined** bytes |
| `lifetime_used_traffic` | `int` | no (default 0) | combined, never reset |
| `data_limit` | `int \| None` | **yes** — `None` = unlimited; `0` allowed | byte cap |
| `data_limit_reset_strategy` | `DataLimitResetStrategy \| None` | **yes** | `no_reset \| day \| week \| month \| year` |
| `expire` | `datetime \| int \| None` | **yes** — `None` = never | absolute expiry |
| `on_hold_expire_duration` | `int \| None` | **yes** — seconds | first-use duration plan |
| `on_hold_timeout` | `datetime \| int \| None` | **yes** | when on-hold starts |
| `online_at` | `datetime \| None` | **yes** | last activity |
| `created_at` | `datetime` | no | |
| `edit_at` | `datetime \| None` | yes | |
| `subscription_url` | `str \| None` | **excluded from serialization** (`exclude=True`) | |
| `admin` | `AdminContactInfo \| None` | **excluded** | |
| `note` | `str \| None` | **excluded** | |
| `auto_delete_in_days` | `int \| None` | **excluded** | |
| `ip` | `str \| None` | yes | caller IP |
| `proxy_settings` | `ProxyTable` | no | protocol credentials |
| `group_ids`, `group_names`, `hwid_limit`, `next_plan` | — | yes | |

Note: `subscription_url` is populated on the object but `exclude=True` removes it from
`model_dump()`. It is still attribute-reachable in Jinja, but `validated_user()` never sets
it on the subscription path, so **in practice `user.subscription_url` is `""` in the
subscription template.**

### 2.5 Subscription links

Routes (`app/routers/subscription.py`), prefix = `subscription_env_settings.path`
(env `XRAY_SUBSCRIPTION_PATH`, else `SUBSCRIPTION_PATH`, default `sub`):

| Path | Returns |
|---|---|
| `GET /{path}/{token}` | content-negotiated: HTML page / client config / base64 |
| `HEAD /{path}/{token}` | headers only |
| `GET /{path}/{token}/info` | **JSON** `SubscriptionUserResponse` |
| `GET /{path}/{token}/raw` | JSON `{body: {...}, headers: {...}}` |
| `GET /{path}/{token}/apps` | JSON `list[Application]` |
| `GET /{path}/{token}/usage` | JSON usage timeseries |
| `GET /{path}/{token}/{client_type}` | one config format |

`ConfigFormat`: `links`, `links_base64`, `xray`, `wireguard`, `sing_box`, `clash`,
`clash_meta`, `outline`, `block`.

Response headers (`create_response_headers`):

```
content-disposition: attachment; filename="<username><ext>"
profile-web-page-url: <request URL>
support-url: <admin.support_url or sub_settings.support_url>
profile-title: base64:<base64(profile_title)>
profile-update-interval: <sub_settings.update_interval>
subscription-userinfo: upload=0; download=<used_traffic>; total=<data_limit>; expire=<unix>
announce: base64:<base64(announce)>
announce-url: <announce_url>
Cache-Control: no-store
```

`profile-web-page-url` is the request URL — i.e. **the subscription URL is recoverable
server-side even though the model field is excluded.**

### 2.6 Status / live data

| Capability | Verdict | Evidence |
|---|---|---|
| enabled / disabled | **DERIVED** | `status` enum; `disabled` ⇒ disabled |
| online / offline | **DERIVED** | `online_at` + `_ONLINE_USERS_WINDOW = timedelta(minutes=2)` (`app/db/crud/user.py:70`) |
| traffic used | **SUPPORTED** | `used_traffic` (combined) |
| traffic limit | **SUPPORTED** | `data_limit`, `None` = unlimited |
| expiry | **SUPPORTED** | `expire` (datetime) |
| last online | **SUPPORTED** | `online_at` |
| reset date / strategy | **SUPPORTED** | `data_limit_reset_strategy` (strategy, not next-reset instant) |
| first-use expiry | **DERIVED** | `on_hold_expire_duration` — semantically *on-hold*, not 3X-UI's negative-expire |
| username / client id | **SUPPORTED** | `username` |
| plan name | **NOT SUPPORTED** | no plan concept on the subscription path; `user_template`/`next_plan` are admin-side |
| announcements | **SUPPORTED** | `announce`, `announce_url` |
| support URL | **SUPPORTED** | `support-url` header / settings |
| **JSON info endpoint** | **SUPPORTED** | `GET /{path}/{token}/info` |
| **`?format=info` on the sub path** | **NOT SUPPORTED** | info is a path suffix |

### 2.7 Protocol data

`ProxyProtocol` (`app/models/protocol.py`): `vmess=1, vless=2, trojan=3, shadowsocks=4,
wireguard=5, hysteria=6`.

`StandardLinks` (the `links` format used for the browser page,
`app/subscription/links.py`) registers exactly six protocol handlers:
`vmess`, `vless`, `trojan`, `shadowsocks`, `hysteria`, `wireguard`. URI shapes:

- `vmess://<base64 JSON>` (remark in JSON `ps`)
- `vless://<uuid>@host:port?…#<remark>`
- `trojan://<password>@host:port?…#<remark>`
- `ss://<base64(method:password)>@host:port#<remark>`
- `hysteria2://<auth>@host:port?…#<remark>` — **the `hysteria` protocol emits the
  `hysteria2://` scheme**; there is no `hysteria://` v1 form
- `wireguard://…`

Plus `EXTERNAL_CONFIG` (env) appended verbatim in `render()` — the direct analogue of
3X-UI's `client_external_links`.

**Absent:** AmneziaWG, TUIC, MTProto, Hysteria v1, AnyTLS. A repo-wide grep for
`amnezia|tuic|mtproto|vpn://|tg://` across `app/**/*.py` returns only unrelated hits
(a `CoreType` enum member, and `tg://user?id=` in Telegram text).

Clash/Sing-box emitters reference `hysteria2` and `tuic` as *transport types*
(`app/subscription/singbox.py:65,72`), but those are not producible by the link layer.

### 2.8 Custom template security

- **Autoescape is off** for file templates. Consequences:
  - `{{ announce | replace('\n', '<br>') }}` (`app/templates/subscription/index.html:553`)
    emits the announcement with `<br>` intact — the intended behaviour — and, because
    nothing is escaped, **the entire `announce` string is injected as raw HTML.**
    `announce` is admin-controlled (`subscription_settings.announce`, `max_length=128`,
    `.format_map()`-expanded) — so this is a privileged-input injection boundary, not a
    subscriber-controlled one. It is still an injection boundary worth recording.
  - `onclick="copyLink('{{ link }}', this)"` and `data-link="{{ link }}"` interpolate raw
    share URIs into a **JavaScript string literal inside an HTML attribute**. A URI
    containing a single quote breaks out of the string. `links` derive from inbound
    configuration (host/remark/password), so a crafted remark is a plausible vector.
  - `{{ user.username }}` is safe: usernames are regex-restricted to
    `[a-zA-Z0-9-_@.]`.
- `render_template_string` uses `SandboxedEnvironment` — used for admin-authored client
  templates only. Note that Jinja's sandbox constrains attribute access, **not** output
  escaping; `autoescape` is off there too.
- No template path traversal protection is applied to `sub_template`; it is a free-text
  string handed to `env.get_template()`. Jinja's `FileSystemLoader` does reject `..`
  segments, so this is bounded — but there is no allowlist and no existence check at
  configuration time, so a typo produces a runtime `TemplateNotFound` on the subscription
  path rather than a validation error.

### 2.9 Cache / reload

- **Template files: no restart required.** `Environment` defaults to `auto_reload=True`
  and `FileSystemLoader` implements `uptodate()` via mtime, so an edited template is
  picked up on the next request. Default `cache_size=400` LRU.
- **Generated configs: 15 s in-process TTL** (`app/subscription/config_cache.py`,
  `SUB_CONFIG_CACHE_TTL_S = 15`, `SUB_CONFIG_CACHE_MAX = 4096`), per Uvicorn worker.
  The cache key is `(user id, format, as_base64, randomize_order, status, data_limit,
  expire, inbounds)` — **`used_traffic` is not part of the key**, so remarks that embed
  usage figures can be up to 15 s stale.
- No mtime watching, no external cache, no CDN involvement.
- Failure behaviour: a missing or malformed template raises `TemplateNotFound` /
  `TemplateSyntaxError` out of the route — **no fallback to the built-in page**. (Contrast
  3X-UI, which silently falls back.) `disable_sub_template` and `allow_browser_config`
  are the only graceful-degradation levers.

### 2.10 Installation model

- Docker (`Dockerfile`: uv + `python:3.14-slim`) or `docker-compose.yml`, or manual
  (`start.sh`, `install_service.sh` → systemd).
- Dashboard mounted by `dashboard/__init__.py` via `app.mount(dashboard_settings.path,
  DashboardStaticFiles(...))`; `dashboard/build/` is produced by
  `build_dashboard.sh` → `bun run build` (the built SPA is committed as
  `app/templates/home/index.html`).
- Config is environment-variable driven (`config.py`, `.env.example`), including
  `CUSTOM_TEMPLATES_DIRECTORY` and `SUBSCRIPTION_PAGE_TEMPLATE`.
- Data in SQLite/PostgreSQL/MySQL via Alembic.

---

## 3. Rebecca source audit

Module `github.com/rebeccapanel/rebecca`, go 1.25. Router: `go-chi/chi/v5`.
Template engine dependency: **`github.com/flosch/pongo2/v6 v6.1.0`**.

### 3.1 Template engine

**pongo2 v6.1.0** — a Django/Jinja-style engine for Go, *not* `html/template`.

`internal/app/user/subscription.go`:

```go
tpl, err := pongo2.FromString(normalizeLegacySubscriptionTemplate(content))
…
rendered, err := tpl.Execute(subscriptionTemplateContext(user, links, usageURL, supportURL, token, vpnInfo...))
```

**Autoescape is ON.** Verified against the pinned tag, not master:
`context.go` declares `var autoescape = true`, and `newExecutionContext()` sets
`Autoescape: autoescape`. `variable.go:198`:

```go
if !nv.expr.FilterApplied("safe") && !value.safe && value.IsString() && ctx.Autoescape {
    value, err = filters["escape"](value, nil)
}
```

`filterEscape` is a flat `& < > " '` replacement. **There is no context awareness** — no
URL-context filtering, no JS-context filtering, no `ZgotmplZ` equivalent. `|safe` opts out
per-expression.

Registered filters: `bytesformat`, `datetime`, `int`.

### 3.2 Template location

- `templates/subscription/index.html` — 4,000 lines, a pongo2 port of PasarGuard's page;
- `templates/home/index.html`, `templates/clash/{default,settings}.yml`,
  `templates/singbox/{default,settings}.json`, `templates/v2ray/{default,settings}.json`,
  `templates/user_agent/{default,grpc}.json`, `templates/mux/default.json`;
- **an embedded Go raw-string default** — `fallbackSubscriptionPageTemplate` at
  `internal/app/user/subscription.go:3601`, used whenever the resolved content is blank.

App template root is resolved dynamically by `appTemplateBasePath()`
(`internal/app/settings/normalize.go`): it probes `cwd/templates`, `../templates`,
`../../templates`, then the same three relative to the executable directory. There is no
env override for the app root.

### 3.3 Template activation

Resolution is `Repository.ReadTemplateContent(ctx, templateKey, adminID)`
(`internal/app/settings/repository.go:687`), with a documented precedence chain:

1. admin-specific **custom** directory (`resolveCustomTemplatePath(name, customDir, adminID)`)
2. global **custom** directory
3. admin-specific **app** template (`resolveAppTemplatePath`)
4. global **app** template
5. empty content → the caller falls back to the embedded default

Selection inputs:

- `subscription_settings.subscription_page_template` — `VARCHAR(255) NOT NULL DEFAULT
  'subscription/index.html'` (migration `000014_subscription_settings.go:106`);
- `subscription_settings.custom_templates_directory` — `VARCHAR(512) NULL`;
- per-admin overrides via `PUT /api/settings/subscriptions/admins/{id}`
  (`internal/app/api/settings.go:209`), stored in `AdminLinkSettings.SubscriptionSettings`
  (`json.RawMessage`);
- the dashboard exposes both fields as text inputs
  (`dashboard/src/pages/IntegrationSettingsPage.tsx:610,613,2817,2866`).

Path safety is real and enforced: `normalizeTemplateName()` rejects absolute paths and
`..`, and `safeJoin()` (`normalize.go:426`) re-checks with `filepath.Rel` and rejects any
result escaping the base. **Path traversal via the template name is blocked.**

### 3.4 Complete verified variable contract

`subscriptionTemplateContext()` (`internal/app/user/subscription.go:3742`) builds exactly:

| Name | Type | Meaning |
|---|---|---|
| `user.username` | `string` | |
| `user.status` | `string` | `active \| limited \| expired \| disabled \| on_hold` |
| `user.status_class` | `string` | CSS class; `on_hold`→`active`, unknown→`disabled` |
| `user.data_limit` | `int64 \| nil` | `nil` when absent or ≤ 0 |
| `user.used_traffic` | `int64` | **combined** bytes |
| `user.data_limit_reset_strategy` | `string` | normalised to `no_reset` when empty |
| `user.expire` | `int64 \| nil` | Unix **seconds**; `nil` when absent or ≤ 0 |
| `user.created_at` | `string` | |
| `user.online_at` | `*string` | **last activity as a string** |
| `user.links` | `[]string` | |
| `user.subscription_url` | `string` | |
| `user.subscription_urls` | `OrderedStringMap` | per-host subscription URLs |
| `user.service_id` | `*int64` | |
| `user.service_name` | `*string` | **the plan/service name** |
| `user.placeholder` | `bool` | placeholder-link mode |
| `links` | `[]string` | raw share URIs |
| `links_text` | `string` | the same list as a JS array literal |
| `usage_url` | `string` | `<sub path>/usage` |
| `support_url` | `string` | |
| `token` | `string` | the subscription identifier |
| `current_timestamp` | `int64` | server Unix seconds |
| `remaining_days` | `int64` | clamped at 0 |
| `openvpn`, `wireguard`, `amneziawg`, `l2tp`, `pptp`, `ikev2`, `anyconnect`, `sstp`, `gre` | `any` | present only when the VPN layer produces them |
| `vpn` | `map[string]any` | the whole VPN bag |

Backing struct `UserDetail` (`internal/app/user/dto.go:117`) additionally carries
`credential_key`, `key_subscription_url`, `lifetime_used_traffic`, `flow`, `note`,
`telegram_id`, `contact_number`, `sub_updated_at`, `sub_last_user_agent`,
`on_hold_expire_duration`, `on_hold_timeout`, `ip_limit`, `auto_delete_in_days`,
`subadress`, `admin_id`, `admin_username`, `proxies`, `excluded_inbounds`, `inbounds`,
`next_plans`, `service_host_orders`, `credentials`, `link_data` — most of which are **not
projected into the template context**.

`user.status == 'active'` is **rewritten by the normalizer** to also match `on_hold` and
`placeholder` (§3.8), so a template written against `active` behaves consistently.

### 3.5 Subscription links

`internal/app/api/subscriptions.go` + `ResolveSubscriptionAlias`
(`internal/app/user/subscription.go:361`). Accepted prefixes: `/sub/`, the configured
`subscription_path`, `/api/v1/client/subscribe[/<id>]`, and any configured
`SubscriptionAliases`.

Path grammar (`resolvePrefixedSubscriptionPath`, `subscription.go:973`):

| Path | Effect |
|---|---|
| `/sub/<token>` | content-negotiated render |
| `/sub/<token>/<clienttype>` | one config format |
| `/sub/<token>/info` | **JSON** `{"user": UserDetail, ...vpnInfo}` |
| `/sub/<token>/usage` | JSON usage timeseries |
| `/sub/<token>/ov/<tag>.ovpn` | OpenVPN profile |
| `/sub/<token>/wg\|wireguard/<tag>.conf` | WireGuard profile |
| `/sub/<token>/awg\|amneziawg/<tag>.conf` | AmneziaWG profile |
| `/sub/<user>/<key>` | username+credential-key form |
| `/sub/<user>/<key>/info`, `/usage`, `/<clienttype>` | as above |

Client types (`subscriptionClientConfigs`): `clash-meta`, `sing-box`, `clash`, `v2ray`,
`outline`, `v2ray-json`, `xray-json`, `happ`, `v2raytun`, `throne`, `shadowrocket`,
`karing`, `hiddify`, `clash-mi`, `incy`, `passwall`, `nekobox`, `openvpn`, `wireguard`,
`amneziawg` — with alias normalisation (`json`→`v2ray-json`, `mihomo`→`clash-meta`,
`singbox`→`sing-box`, `wg`→`wireguard`, `awg`→`amneziawg`, …).

HTML vs config decision (`wantsSubscriptionHTML`): true if `Accept` contains `text/html`
or `application/xhtml+xml`; else false if a client type is present; else true if the UA
looks like a browser (`mozilla/`, `chrome/`, `safari/`, `firefox/`, `edg/`, `opr/`).

Response headers (`subscription.go:1123`):

```
profile-web-page-url: <request URL>
support-url: <settings.SubscriptionSupportURL>
profile-title: base64:<base64(profile title)>
profile-update-interval: <settings.SubscriptionUpdateInterval>
subscription-userinfo: upload=0; download=<used_traffic>; total=<data_limit>; expire=<expire>
```

**There is no `announce` header and no announce concept anywhere in the repository.**
A grep for `announce` across `internal/**/*.go` returns zero matches.

### 3.6 Status / live data

| Capability | Verdict | Evidence |
|---|---|---|
| enabled / disabled | **DERIVED** | `status == "disabled"` |
| online / offline | **DERIVED** | `online_at` present + a freshness window (Rebecca does not publish a window constant; a threshold must be chosen) |
| traffic used | **SUPPORTED** | `used_traffic` (combined) |
| traffic limit | **SUPPORTED** | `data_limit`, `nil`/≤0 = unlimited |
| expiry | **SUPPORTED** | `expire`, Unix seconds |
| last online | **SUPPORTED** | `online_at` (string) |
| reset strategy | **SUPPORTED** | `data_limit_reset_strategy` |
| first-use expiry | **SUPPORTED** | `on_hold_expire_duration` / `on_hold_timeout` on `UserDetail` (not projected into the template context) |
| username / client id | **SUPPORTED** | `username`, `token` |
| plan name | **SUPPORTED** | `user.service_name` |
| multiple subscription URLs | **SUPPORTED** | `user.subscription_urls` |
| announcements | **NOT SUPPORTED** | absent from source entirely |
| support URL | **SUPPORTED** | `support_url`, `support-url` header |
| **JSON info endpoint** | **SUPPORTED** | `/sub/<token>/info` |
| **`?format=info` on the sub path** | **NOT SUPPORTED** | info is a path suffix |
| usage timeseries | **SUPPORTED** | `/sub/<token>/usage` (hourly + daily + per-node) |

### 3.7 Protocol data

Link layer (`supportedSubscriptionScheme`, `subscription.go:3905`) accepts:
`vless`, `vmess`, `trojan`, `ss`, `hysteria`, `hysteria2`, `hy2`, plus the literal
`v2rayn://shadowsocks/` prefix.

VPN layer produces separate artefacts: OpenVPN (`.ovpn`), WireGuard (`.conf`),
AmneziaWG (`.conf`), and the context may carry `l2tp`, `pptp`, `ikev2`, `anyconnect`,
`sstp`, `gre`.

**Absent from the link layer:** TUIC, MTProto, AnyTLS. A grep for
`tuic|mtproto|anytls` across `internal/app/user/` returns **zero** matches.

### 3.8 The built-in PasarGuard compatibility shim

This is the single most important discovery in the Rebecca audit.
`normalizeLegacySubscriptionTemplate()` (`subscription.go:3716`) rewrites template text
before pongo2 parses it:

| Rewrite | Purpose |
|---|---|
| collapse whitespace inside `{{ }}` / `{% %}` | tolerate Jinja formatting |
| `user.status.value` → `user.status` | Jinja enum idiom → plain string |
| `user.data_limit_reset_strategy.value` → `user.data_limit_reset_strategy` | same |
| strip `{% set current_timestamp = … %}` | Jinja global → provided by context |
| strip `{% set remaining_days = … %}` | same |
| `now().timestamp()` / `datetime.now().timestamp()` → `current_timestamp` | Jinja global |
| `\| datetime(...)` → `\| datetime` | filter-argument form |
| `\| bytesformat(...)` → `\| bytesformat` | same |
| `\| int(...)` → `\| int` | same |
| `\| default(x)` → `\| default:x` | filter-argument syntax |
| `{{ remaining_days \| int if (...) > -1 else 0 }}` → `{{ remaining_days \| int }}` | Jinja inline conditional |
| `{{ user.links }}` → `{{ links_text\|safe }}` | JS array-literal idiom |
| `user.status == 'active'` → `… or user.status == 'on_hold' or user.placeholder` | status semantics |
| (same for the double-quoted form) | |

Rebecca has therefore already solved, by regex, the exact problem this workstream faces:
**how to make one template body work on a panel whose data shape differs.** Its answer is
"normalize the template, then normalize the data" — which is precisely the adapter shape
proposed in §13. It is prior art we should cite, and it also marks the boundary of what is
safe: regex rewriting of template *syntax* is workable for a small, closed vocabulary
(§4.3) and fragile beyond it.

### 3.9 Cache / reload

**No template caching at all.** `ReadTemplateContent` calls `os.ReadFile` and the caller
calls `pongo2.FromString` on **every** subscription request. Consequences:

- template edits are live immediately — **no restart, no cache invalidation, no mtime
  watch needed**;
- but every page render pays a disk read plus a full parse of a 4,000-line template;
- failure behaviour: a parse error returns an error from `renderSubscriptionHTML`; there is
  **no fallback to `fallbackSubscriptionPageTemplate` on error** — the embedded default is
  only used when the resolved *content is blank*.

Response caching is explicitly disabled
(`setSubscriptionNoCacheHeaders`: `Cache-Control: no-store, no-cache, must-revalidate,
max-age=0, private`, plus CDN variants and `Expires: 0`).

### 3.10 Installation model

- Binary installer: `curl -sL …/scripts/rebecca/rebecca-binary.sh | sudo bash -s -- install`
  → native systemd services; supports SQLite, MySQL, MariaDB.
- Docker image `rebeccapanel/rebecca`; `docker-compose.yml` present.
- Node installer for node servers (`rebecca-node-binary.sh`).
- Dashboard is a Vite build embedded into the binary (`scripts/build_binary.sh`,
  `dashboard/build`), plus Hugo-built tutorials.
- Data dir default `/var/lib/rebecca` (`REBECCA_DATA_DIR`), certs under
  `<data dir>/certs` (`REBECCA_CERT_BASE`).
- A Go CLI (`rebecca_cli`) and a Go gateway (`rebecca_gateway`) exist as separate binaries.
- Migration scripts from Marzban / Marzban-node are provided.

---

## 4. Template engine comparison

### 4.1 Engine matrix

| | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| Engine | Go `html/template` | Jinja2 ≥ 3.1.6 | pongo2 v6.1.0 |
| Language family | Go template | Jinja/Django | Django (pongo2) |
| `if` | `{{ if .x }}…{{ else }}…{{ end }}` | `{% if x %}…{% else %}…{% endif %}` | `{% if x %}…{% else %}…{% endif %}` |
| Loop | `{{ range .links }}…{{ . }}…{{ end }}` | `{% for l in links %}` | `{% for l in links %}` |
| Field access | `.subTitle` | `user.username` | `user.username` |
| Compare | `eq .totalByte 0`, `lt .expire 0` | `totalByte == 0` | `expire < 0` |
| Comments | `{{/* */}}` | `{# #}`, `{% comment %}` | `{# #}` |
| Autoescape | **contextual**, on | **off** (default `Environment`) | **flat**, on |
| Sandbox | n/a (no code exec) | `SandboxedEnvironment` for string templates only | not sandboxed; `FromString` on `DefaultSet` |
| Template source | file (`sub.html`) | file (Jinja) | file (pongo2) or embedded Go string |
| Context shape | flat struct (22 keys) | 5 keys, `user` nested | ~35 keys, `user` nested |
| Compile cache | panel-managed, mtime re-read | Jinja LRU (400), mtime re-read | **none — recompiled per request** |
| Fallback on error | silent fallback to built-in page | none (raises) | none (raises) |

### 4.2 What this means for Row-Template

The Row-Template shell is a Go `html/template` document. **It cannot be served to
PasarGuard or Rebecca as-is.** The blocker is not the data island — it is the template
*syntax*: `{{ if .enabled }}…{{ end }}` is a parse error in both other engines, and `.links`
resolves to nothing in both.

There is no configuration, no shim, and no loader setting in either panel that changes
this. Rebecca's normalizer comes closest but does not translate Go template syntax (it
translates *Jinja* into pongo2).

### 4.3 Size of the transpilation problem

The complete Go-template vocabulary actually used across **all 15
`layout.html` files** is **27 distinct action forms**, and it is closed:

```
{{ end }}                        ×177
{{ else }}                       ×117
{{ if .enabled }}                × 45
{{ .subTitle }}                  × 45
{{ .subUrl }}                    × 42
{{ if .subTitle }}               × 30
{{ .subSupportUrl }}             × 30
{{ range .links }}               × 15
{{ if eq .totalByte 0 }}         × 15
{{ if eq .expire 0 }}            × 15
{{ if .subSupportUrl }}          × 15
{{ if .remained }}               × 15
{{ if .isOnline }}               × 15
{{ else if lt .expire 0 }}       × 15
{{ .used }} {{ .uploadByte }} {{ .totalByte }} {{ .total }}
{{ .subJsonUrl }} {{ .subClashUrl }} {{ .remained }}
{{ .lastOnline }} {{ .expire }} {{ .downloadByte }}
{{ .datepicker }} {{ .announce }}
{{ if .subUrl }}                 × 12
```

That is: `if` / `else` / `else if` / `end`, one `range` with `.`, field emission, `eq`,
`lt`, and truthiness of a string. **A deterministic transpiler for this vocabulary is a
small, testable build-time tool** — not a general Go-template implementation. This is the
key feasibility finding for the adapter design.

**How the 27 is derived (so the count is checkable).** The enumeration above is **19 lines**
and names **27 forms**. Four of those lines group several literal tokens each (the
`.used` / `.subJsonUrl` / `.lastOnline` / `.datepicker` lines), which is why the line count
and the form count differ:

- **27 forms** = the 15 single-token lines plus the 12 forms named on the four grouped lines
  (`.used` `.uploadByte` `.totalByte` `.total` · `.subJsonUrl` `.subClashUrl` `.remained` ·
  `.lastOnline` `.expire` `.downloadByte` · `.datepicker` `.announce`).
- **28 distinct literal tokens** = those 27, plus the bare `{{ . }}` — **× 15** — which
  appears only inside the `range .links` body. It is the range-body context emission, not an
  independent action, so it is counted *with* `range` rather than as its own form. That is
  the single difference between the 28 raw tokens and the 27-form vocabulary.

**Why the totals are not all multiples of 15.** Twelve of the 15 templates are byte-identical
in template structure (12 `end`, 8 `else`, 3 `.subUrl`, 2 `if .subUrl`). Three — `canvas`,
`saffron` and `signature` — carry one fewer of each (11 `end`, 7 `else`, 2 `.subUrl`, 0
`if .subUrl`), because they omit the conditional sub-URL block. That is the whole of the
variance, and it is the reason `{{ end }}` totals 177 (12 × 12 + 3 × 11) rather than 180.

Escaping is the part that does *not* transpile cleanly: Go's contextual autoescaping
(notably URL filtering in `href`/`value` and `ZgotmplZ` for unsafe schemes) has no
equivalent in Jinja or pongo2. The transpiler must therefore emit explicit escaping, and
the adapter must supply a scheme allowlist for any URL that reaches an attribute.

---

## 5. Complete variable / data-contract comparison

Row-Template's required inputs are the 14 raw fields in `readDocument()` plus `links`.
`emails` and `sId` are present in the 3X-UI payload but not read by the model (the
subscriber's own address is deliberately excluded).

| Row-Template raw field | 3X-UI source | PasarGuard source | Rebecca source |
|---|---|---|---|
| `enabled` | `.enabled` bool | `user.status != "disabled"` | `user.status != "disabled"` |
| `isOnline` | `.isOnline` bool | `online_at` within 2 min | `online_at` within chosen window |
| `downloadByte` | `.downloadByte` int | — (no split) | — (no split) |
| `uploadByte` | `.uploadByte` int | — (no split) | — (no split) |
| `totalByte` | `.totalByte` (0 = ∞) | `data_limit` (None = ∞) | `data_limit` (nil/≤0 = ∞) |
| `expire` | `.expire` int s (0 = ∞, <0 = first-use) | `expire` datetime (None = ∞) | `expire` int s (nil = ∞) |
| `lastOnline` | `.lastOnline` int | `online_at` datetime | `online_at` string |
| `subUrl` | `.subUrl` | request URL (`profile-web-page-url`) | `user.subscription_url` |
| `subJsonUrl` | `.subJsonUrl` | — (no equivalent) | `/sub/<token>/v2ray-json` (constructible) |
| `subClashUrl` | `.subClashUrl` | `/sub/<token>/clash_meta` (constructible) | `/sub/<token>/clash-meta` (constructible) |
| `subTitle` | `.subTitle` | `profile_title` (via `profile-title` header, base64) | settings profile title (via header) |
| `subSupportUrl` | `.subSupportUrl` | `support-url` header / settings / admin | `support_url` / `support-url` header |
| `announce` | `.announce` | `announce` context key | **absent** |
| `datepicker` | `.datepicker` | — | — |
| `links[]` | `.links` | `links` context key (may be `[]`) | `links` / `user.links` |

Additional data neither panel needs to fake because the UI does not use it: the combined
`used` is computed as `download + upload` in `normalize()`; with no split available the
adapter supplies the combined value and the UI renders correctly (§0.5).

---

## 6. Protocol comparison

| Protocol | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| VMess | ✅ `vmess://base64(JSON)` | ✅ same shape | ✅ |
| VLESS | ✅ | ✅ | ✅ |
| Trojan | ✅ | ✅ | ✅ |
| Shadowsocks | ✅ (SIP002/2022) | ✅ `ss://base64(method:password)` | ✅ (+ `v2rayn://shadowsocks/`) |
| Hysteria v1 | ✅ `hysteria://` | ❌ (only v2) | ✅ `hysteria://` accepted |
| Hysteria2 | ✅ `hysteria2://` | ✅ `hysteria2://` | ✅ `hysteria2://`, `hy2://` |
| WireGuard | ✅ `wireguard://` | ✅ `wireguard://` | ✅ `wireguard://` + `.conf` |
| AmneziaWG | ✅ `vpn://base64url(.conf)` | ❌ | ✅ `.conf` artefact (not a `vpn://` URI) |
| MTProto | ✅ `tg://proxy?…` | ❌ | ❌ |
| TUIC | ❌ (not a 3.7.0 sub protocol) | ❌ (transport type only) | ❌ (transport type only) |
| OpenVPN | ❌ | ❌ | ✅ `.ovpn` artefact |
| L2TP / PPTP / IKEv2 / AnyConnect / SSTP / GRE | ❌ | ❌ | ⚠️ in context, not in `links` |

`EXTERNAL_CONFIG` (PasarGuard) is the analogue of 3X-UI's `client_external_links`, and
appends a verbatim URI to `links` — the same escape hatch that lets 3X-UI stage arbitrary
schemes. Rebecca has no equivalent.

**Explorer impact:** `config.js` `classify()` already returns `null` for unknown schemes,
so an Explorer built on a narrower protocol set degrades by showing fewer rows — no change
to the parser is required for PasarGuard or Rebecca. AmneziaWG on Rebecca arrives as a
`.conf` file, not a `vpn://` URI, so its dedicated AmneziaWG treatment would not trigger;
that is a genuine capability difference, not a bug.

---

## 7. Live / status capability comparison

| Capability | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| JSON info endpoint | `GET /sub/<id>?format=info` | `GET /sub/<token>/info` | `GET /sub/<token>/info` |
| Addressing style | **query parameter** | **path suffix** | **path suffix** |
| Auth | subId in path | token in path | token in path |
| `enabled` | ✅ | ✅ (`status`) | ✅ (`status`) |
| `isOnline` | ✅ native bool | ⚠️ derive from `online_at` (2 min) | ⚠️ derive from `online_at` (window unpublished) |
| used / limit / expire | ✅ raw bytes + seconds | ✅ `used_traffic` / `data_limit` / `expire` | ✅ same |
| last online | ✅ | ✅ `online_at` | ✅ `online_at` |
| reset strategy | ❌ | ✅ | ✅ |
| plan name | ⚠️ `subTitle` doubles as plan | ❌ | ✅ `service_name` |
| announce | ✅ | ✅ | ❌ |
| support URL | ✅ | ✅ | ✅ |
| `subscription-userinfo` header | ❌ | ✅ `upload=0; download=…` | ✅ `upload=0; download=…` |
| response caching | panel default | `no-store` | `no-store` + CDN variants |
| **Row-Template poller compatibility** | ✅ works as written | ❌ path mismatch → HTML body → `halt('unsupported')` | ❌ path mismatch → HTML body → `halt('unsupported')` |

**Degradation behaviour, verified by reading both panels:** because the poller sends
`Accept: application/json` but a browser User-Agent, both panels fall through to their
HTML path (`wantsSubscriptionHTML` UA branch for Rebecca; `detect_client_rule` →
browser-UA rule for PasarGuard). The poller receives HTML, `res.json()` raises
`SyntaxError`, and `live.js` halts with `'unsupported'` — **the server-rendered figures
stay on screen and the page remains fully usable.** No crash, no blanking, no fabricated
data. Live status is simply absent until the runtime or the deployment changes.

---

## 8. Template activation / deployment comparison

| | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| What is selected | a **directory** | a **template name** | a **template name** |
| Where | `settings.subThemeDir` (DB) | env + `admins.sub_template` (DB) | `subscription_settings.subscription_page_template` (DB) |
| Filename contract | `sub.html` (then `index.html`) | the name is the path | the name is the path |
| Admin UI | panel settings field | free-text input in the admin modal | text inputs in integration settings |
| Validation of the name | n/a (directory) | **none** | `normalizeTemplateName` + `safeJoin` (traversal blocked) |
| Per-admin override | ❌ | ✅ `admins.sub_template` | ✅ via `AdminLinkSettings` |
| Custom templates dir | ❌ (the dir *is* the setting) | ✅ `CUSTOM_TEMPLATES_DIRECTORY` (prepended) | ✅ `custom_templates_directory` (higher precedence) |
| Restart needed | **yes** (observed: set while stopped) | no (mtime) | no (no cache) |
| Fallback on template error | **silent fallback** to built-in page | none — request errors | none — request errors |
| Disable HTML page | n/a | `disable_sub_template` | n/a (ReadOnly flag only) |
| HTML gate | `Accept: text/html` | `"text/html" in Accept` | `Accept` html/xhtml, or browser UA |
| Extra gate | — | `allow_browser_config` + HWID settings gate `links` | placeholder mode |

**Deployment implication:** for 3X-UI, Row-Template owns a *directory* and writes a file
into it. For the other two, Row-Template owns a *file name* and must land a file inside a
directory the panel already searches. Both are pure file drops — no panel source patch —
which keeps the existing installer philosophy intact.

---

## 9. Caching / reload comparison

| | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| Template caching | panel loader, mtime re-read | Jinja LRU (400), `auto_reload=True`, mtime | **none** — `os.ReadFile` + `FromString` per request |
| Restart for a template edit | **yes** (observed) | no | no |
| mtime watched | yes | yes (loader `uptodate`) | n/a |
| Failure → fallback | yes, silent, to built-in | no | no |
| Content cache | panel-managed | **15 s** in-process config cache, per worker | none |
| Stale-data hazard | none observed | `used_traffic` **not** in the config-cache key ⇒ remarks up to 15 s stale | none |
| HTTP caching | panel default | `Cache-Control: no-store` | `no-store` + CDN + `Expires: 0` |
| Multi-worker consistency | n/a | per-worker caches | n/a |

Practical consequence: on PasarGuard and Rebecca a template edit is live on the next
request; on 3X-UI the operator must restart the panel. Row-Template's installer already
handles this for 3X-UI (it writes `subThemeDir` with the panel stopped and tells the
operator when a restart is needed); the same "restart" step is simply absent for the other
two.

---

## 10. Security / escaping comparison

| | 3X-UI (Go `html/template`) | PasarGuard (Jinja2, autoescape off) | Rebecca (pongo2, autoescape on) |
|---|---|---|---|
| Escaping model | **contextual** — element, attribute, URL, JS, CSS | **none** | **flat** `& < > " '` |
| URL schemes filtered | yes (`javascript:` → `ZgotmplZ`) | no | no |
| JS-context escaping | yes | no | no |
| Attribute breakout via `"` | blocked | **not blocked** | blocked |
| Template path traversal | n/a | bounded by Jinja's loader `..` rejection; **no allowlist, no existence check** | **blocked** (`normalizeTemplateName` + `safeJoin`) |
| Template code execution | none | none (Jinja is not a code sandbox, but no `eval` of template text) | none |
| Sandbox | n/a | `SandboxedEnvironment` for admin client-templates only | not sandboxed |
| Concrete injection found | — | `{{ announce \| replace('\n','<br>') }}` emits raw HTML; `onclick="copyLink('{{ link }}', this)"` interpolates a raw URI into a JS string inside an attribute | none found; `\|safe` is used deliberately on `links_text` (a locally-built JS array literal) |

Notes and boundaries:

- PasarGuard's injection points are driven by **admin-controlled** input (`announce`,
  `applications`, `response_headers`) and by **inbound-derived** URIs (remark, password).
  They are not subscriber-controlled. Usernames are regex-restricted and therefore not a
  vector.
- Rebecca's `|safe` on `links_text` is safe by construction: `legacyTemplateStringList()`
  escapes backslashes and single quotes when building the array literal.
- **Neither PasarGuard nor Rebecca neutralises URL schemes in attribute context.** Any
  adapter that emits a URL into `href`/`value` must apply its own scheme allowlist; it
  cannot rely on the engine.
- Rebecca's `Cache-Control: no-store` + CDN variants matter for Row-Template: a
  reverse-proxy approach (§13.4 option C) must not introduce caching on a URL that is
  itself a credential.

---

## 11. Installer implications

The existing installer is built on four rules: no runtime dependency beyond standard
Linux userland; admin text is data, never shell; **the panel's source tree is never
patched**; every replacement is staged, validated, atomic.

Per panel, what the installer would additionally have to do:

### 3X-UI — unchanged
Write `sub.html` into a directory and set `settings.subThemeDir`. Baseline; must not change.

### PasarGuard
1. Detect the install root and read `.env` / environment for `CUSTOM_TEMPLATES_DIRECTORY`
   and `SUBSCRIPTION_PAGE_TEMPLATE`. If `CUSTOM_TEMPLATES_DIRECTORY` is unset, the
   installer must set it — that is a config write, not a source patch.
2. Land the rendered Jinja page (e.g. `row-template/<id>/index.html`) inside that
   directory.
3. Set `SUBSCRIPTION_PAGE_TEMPLATE` to the template's relative name.
4. Optionally set the per-admin `admins.sub_template` value, or document the dashboard
   field (free text, no validation).
5. **Verify `allow_browser_config` is true**, otherwise `links` is empty and the config
   list will legitimately be blank. The installer should report this rather than treat it
   as a failure.
6. Warn that `disable_sub_template` must be false for the page to be served at all.
7. Restart is **not** required for the template to load.
8. **Blocker to resolve first:** the supplied source does not compile (§2.0).

### Rebecca
1. Read `subscription_settings` (SQLite/MySQL/MariaDB — dialect-dependent) for
   `custom_templates_directory` and `subscription_page_template`. The installer's current
   "no sqlite3 dependency" rule already has a graceful path (guide the admin to the UI);
   the same pattern applies, extended to MySQL/MariaDB.
2. Land the rendered pongo2 page inside the custom templates directory.
3. Set `subscription_page_template` to the relative name.
4. Restart is **not** required.
5. Note that Rebecca validates the template name, so a bad path fails loudly at config
   time rather than at render time — a better failure mode than PasarGuard's.

### Cross-panel
- The `subThemeDir`-style activation must become a per-panel *activation strategy*, since
  the three panels activate differently (directory vs. name vs. name + validation).
- `rt_validate_template()` is a good structural gate but its markers are 3X-UI-specific
  (`id="sub-data"`, `var BRANDING`). Panel artifacts need a gate that checks the same
  invariants in an engine-neutral way.
- SHA256 pinning, atomic install, backups and rollback all carry over unchanged.

---

## 12. Compatibility matrix

Classification: **DIRECT** = panel provides it equivalently · **ADAPTER** = normalizable
safely · **DERIVED** = computable from available values · **OPTIONAL** = UI may omit ·
**UNSUPPORTED** = cannot be implemented without panel changes · **REQUIRES PANEL PATCH** =
panel source must be extended.

| FIELD / FEATURE | 3X-UI | PASARGUARD | REBECCA |
|---|---|---|---|
| `enabled` | DIRECT | DERIVED (`status`) | DERIVED (`status`) |
| `isOnline` | DIRECT | DERIVED (`online_at` + 2 min window) | DERIVED (`online_at` + chosen window) |
| `downloadByte` | DIRECT | **ADAPTER** (combined counter; panels' own header reports `upload=0`) | **ADAPTER** (same) |
| `uploadByte` | DIRECT | **ADAPTER** (as above) | **ADAPTER** (as above) |
| `totalByte` | DIRECT (0 = ∞) | ADAPTER (`None` → 0) | ADAPTER (`nil`/≤0 → 0) |
| `expire` | DIRECT (s; 0 = ∞; <0 = first-use) | ADAPTER (datetime → s; `None` → 0) | ADAPTER (s; `nil` → 0) |
| `lastOnline` | DIRECT | ADAPTER (datetime → epoch ms) | ADAPTER (string → epoch ms) |
| `subUrl` | DIRECT | DERIVED (request URL / `profile-web-page-url`) | DIRECT (`user.subscription_url`) |
| `subJsonUrl` | DIRECT | **OPTIONAL** (no equivalent) | DERIVED (`/sub/<token>/v2ray-json`) |
| `subClashUrl` | DIRECT | DERIVED (`/sub/<token>/clash_meta`) | DERIVED (`/sub/<token>/clash-meta`) |
| `subTitle` | DIRECT | DERIVED (`profile-title` header, base64) | DERIVED (`profile-title` header) |
| `subSupportUrl` | DIRECT | DIRECT (`support-url`) | DIRECT (`support-url`) |
| `announce` | DIRECT | DIRECT (`announce` key) | **UNSUPPORTED** |
| `announce_url` | — (3X-UI uses one field) | DIRECT | **UNSUPPORTED** |
| `datepicker` (jalali) | DIRECT | **OPTIONAL** (default gregorian) | **OPTIONAL** (default gregorian) |
| `links[]` | DIRECT | DIRECT (may be `[]` when `allow_browser_config` is off) | DIRECT |
| `used` (combined) | DIRECT | DIRECT | DIRECT |
| `total` / `remained` (formatted) | DIRECT | DERIVED (client formats bytes) | DERIVED |
| health state (active/disabled/expired/limited) | DIRECT | ADAPTER (5-state → 4-state) | ADAPTER (5-state → 4-state) |
| traffic reset strategy | **UNSUPPORTED** | DIRECT | DIRECT |
| plan name | ADAPTER (`subTitle` doubles) | **UNSUPPORTED** | DIRECT (`service_name`) |
| multiple subscription URLs | **UNSUPPORTED** | **UNSUPPORTED** | DIRECT (`subscription_urls`) |
| JSON info endpoint | DIRECT (`?format=info`) | ADAPTER (`/info` path) | ADAPTER (`/info` path) |
| `?format=info` on the sub path | DIRECT | **REQUIRES PANEL PATCH** (or runtime change / proxy) | **REQUIRES PANEL PATCH** (or runtime change / proxy) |
| Live polling without a runtime change | DIRECT | **UNSUPPORTED** (degrades gracefully) | **UNSUPPORTED** (degrades gracefully) |
| Config explorer | DIRECT | ADAPTER (6 schemes) | ADAPTER (7 schemes) |
| AmneziaWG | DIRECT (`vpn://`) | **UNSUPPORTED** | ADAPTER (`.conf` artefact, not `vpn://`) |
| MTProto | DIRECT (`tg://`) | **UNSUPPORTED** | **UNSUPPORTED** |
| TUIC | **UNSUPPORTED** | **UNSUPPORTED** | **UNSUPPORTED** |
| OpenVPN | **UNSUPPORTED** | **UNSUPPORTED** | ADAPTER (`.ovpn`, outside `links`) |
| Recommended-client apps | **UNSUPPORTED** | DIRECT (`apps`) | **UNSUPPORTED** |
| i18n (5 catalogues) | DIRECT (client-side) | DIRECT (client-side) | DIRECT (client-side) |
| Theme switching | DIRECT (client-side) | DIRECT (client-side) | DIRECT (client-side) |
| QR / copy / per-config dialog | DIRECT (client-side) | DIRECT (client-side) | DIRECT (client-side) |
| Template activation | DIRECT (`subThemeDir`) | ADAPTER (env + `admins.sub_template`) | ADAPTER (settings row) |
| Custom templates directory | n/a | ADAPTER (env) | ADAPTER (settings row) |
| Per-admin template | **UNSUPPORTED** | DIRECT | DIRECT |
| Restart to activate | required | not required | not required |
| Fallback on template error | DIRECT (silent) | **UNSUPPORTED** (raises) | **UNSUPPORTED** (raises) |
| Installer: no source patch needed | DIRECT | DIRECT | DIRECT |

**Nothing in this matrix is `REQUIRES PANEL PATCH` except `?format=info` on the sub path** —
and even that has two patch-free workarounds (§13.4). Everything else is DIRECT, ADAPTER,
DERIVED, or a clean graceful omission.

---

## 13. Normalized adapter schema proposal

**Not implemented. Design only.**

### 13.1 Architecture

```
panel (3X-UI | PasarGuard | Rebecca)
      │
      │  A. PANEL ADAPTER  (one per panel; server-side or build-side)
      │     - reads the panel's native data
      │     - emits the Row-Template data island in the normalized shape
      ▼
NORMALIZED SUBSCRIPTION MODEL   (one schema, engine-neutral)
      │
      │  B. SHELL EMITTER  (per engine: Go | Jinja2 | pongo2)
      │     - transpiles ONE canonical shell into the engine's syntax
      │     - consumes only the normalized model
      ▼
SHARED RUNTIME (JS)  +  FROZEN CSS CASCADE (reused verbatim)
      │
      ▼
existing frozen visual templates
```

Two adapters, not three: 3X-UI needs none (it is the reference), so we add a PasarGuard
adapter and a Rebecca adapter. The shell emitter is per *engine*, not per *panel* —
PasarGuard and Rebecca share the same emitter family, differing only in `{% %}` dialect
details and in the two normalizer quirks Rebecca already handles.

### 13.2 Normalized schema

Canonical names are chosen to be the ones the existing runtime already understands, so
**the runtime's `readDocument()` contract is unchanged** — the adapter emits the island the
runtime already reads.

| Canonical | Type | Req? | 3X-UI mapping | PasarGuard mapping | Rebecca mapping | Fallback when absent |
|---|---|---|---|---|---|---|
| `enabled` | bool | req | `.enabled` | `status != "disabled"` | `status != "disabled"` | `false` |
| `online` | bool | opt | `.isOnline` | `online_at` within 120 s | `online_at` within configured window | omit → UI shows nothing |
| `downloadByte` | int ≥ 0 | opt | `.downloadByte` | `used_traffic` (combined) | `used_traffic` (combined) | omit |
| `uploadByte` | int ≥ 0 | opt | `.uploadByte` | `0` | `0` | omit |
| `totalByte` | int ≥ 0 | req | `.totalByte` | `data_limit ?? 0` | `data_limit ?? 0` | `0` (= unlimited) |
| `expire` | int (s) | req | `.expire` | `expire?.timestamp() ?? 0` | `expire ?? 0` | `0` (= never) |
| `lastOnline` | int (ms) | opt | `.lastOnline` | `online_at` → epoch ms | `online_at` → epoch ms | omit |
| `subUrl` | string | req | `.subUrl` | request URL | `user.subscription_url` | page URL |
| `subJsonUrl` | string | opt | `.subJsonUrl` | `""` | `/sub/<token>/v2ray-json` | omit button |
| `subClashUrl` | string | opt | `.subClashUrl` | `/sub/<token>/clash_meta` | `/sub/<token>/clash-meta` | omit button |
| `subTitle` | string | opt | `.subTitle` | `profile-title` (base64-decoded) | `profile-title` | omit |
| `subSupportUrl` | string | opt | `.subSupportUrl` | `support-url` | `support-url` | omit section |
| `announce` | string | opt | `.announce` | `announce` | **never present** | omit section |
| `datepicker` | `"gregorian"\|"jalali"` | opt | `.datepicker` | `"gregorian"` | `"gregorian"` | `"gregorian"` |
| `links[]` | string[] | opt | `.links` | `links` (may be `[]`) | `links` | omit explorer |
| `panel` | `"3xui"\|"pasarguard"\|"rebecca"` | req | new | new | new | — |
| `liveUrl` | string | opt | `pathname + "?format=info"` | `pathname + "/info"` | `pathname + "/info"` | omit → no polling |

**Honesty rules baked into the schema:**

- `downloadByte`/`uploadByte` carry the combined counter and `0` respectively **because
  that is exactly what the panels' own `subscription-userinfo` header reports**. The UI
  displays only the combined `used`, so no fabricated split is ever rendered. If a future
  design ever displays the split, PasarGuard and Rebecca must show "combined" rather than
  a made-up ratio.
- `online` is only emitted when the panel actually supplies a last-seen timestamp. It is
  never synthesised from traffic activity.
- `announce`, `datepicker`, `plan`, `reset strategy` are omitted rather than defaulted to a
  misleading value.
- `expire` uses `0` = never and a negative value = first-use, matching the existing
  runtime's documented semantics. PasarGuard's `on_hold` is **not** silently folded into
  "first-use"; it is a distinct state and the adapter must decide explicitly (see §19).

### 13.3 Adapter outputs

Each adapter produces exactly one artifact per template per panel:

- a **data island** — the `#sub-data` attributes, `#announce-source`, `#links-source`
  (identical shape on all three panels);
- a **shell** — the canonical shell transpiled to the panel's engine;
- the **frozen CSS cascade** and the **shared runtime JS**, both embedded byte-identically
  from the same sources the 3X-UI artifacts use.

### 13.4 How to get live data, three options

| Option | Change required | Drift risk | Notes |
|---|---|---|---|
| **A. No live polling** | none | **zero** | Poller halts gracefully on both panels; server-rendered values stand. Shippable first. |
| **B. Extend the shared runtime** to resolve the endpoint from a shell-emitted descriptor | `src/scripts/live.js` (+ `model.js` `readDocument` to read it) | **all 15 byte-locks re-baseline** — see §15 | Cleanest long-term; requires design-workstream re-approval |
| **C. Reverse proxy** in front of the panel translating `?format=info` → `/info` and reshaping JSON into the 21-key contract | new installer component; no Row-Template source change | zero artifact drift | Adds a moving part and a credential-bearing URL to the proxy's logs; must not cache |

Recommendation: ship **A** in Phase 1 (zero drift), then take **B** as an explicit,
separately-approved Phase 2 whose cost is the re-baseline of every byte-lock.

---

## 14. Exact files likely to require changes

Nothing below has been changed. This is the predicted change surface.

### 14.1 Purely additive — no existing artifact affected

| Path | Kind | Purpose |
|---|---|---|
| `src/shell/` (new) | new | canonical, engine-neutral shell source + the **15** per-template layout bodies moved/derived from `src/templates/*/layout.html` |
| `tools/transpile.mjs` (new) | new | Go-template → Jinja2 / pongo2 transpiler for the closed 27-action vocabulary |
| `tools/panels.mjs` (new) | new | panel registry + adapter descriptors |
| `tools/build-panel.mjs` (new) | new | build entry point emitting `dist/panels/<panel>/<template>/template.html` |
| `tests/panels.test.mjs` (new) | new | adapter + transpiler + golden-artifact tests |
| `tests/fixtures/panels/` (new) | new | recorded native payloads from each panel for adapter tests |

### 14.2 Existing files that would change (and therefore risk drift)

| Path | Change | Drift consequence |
|---|---|---|
| `tools/build.mjs` | register a new build target; `APP` order may become per-target | **additive if the default path and output are untouched**; any change to `APP`/`BOOT` content changes all artifacts |
| `tools/templates.mjs` | expose the registry to the panel builder | read-only use → no drift |
| `src/scripts/live.js` | only for §13.4 option B | **changes all 15 artifacts** |
| `src/scripts/model.js` | only if the island gains new fields | **changes all 15 artifacts** |
| `src/index.html`, `src/templates/*/layout.html` | only if the canonical shell replaces them | **changes the affected artifacts** |
| `installer/lib/row-template.sh` | per-panel activation strategy | no artifact drift |
| `tests/build.test.mjs` | new `FROZEN_ARTIFACTS` rows for panel artifacts | additive rows; existing rows unchanged |
| `VERSION`, `CHANGELOG.md` | release bookkeeping | none |

### 14.3 Explicitly NOT to be touched

`src/styles/**`, `src/templates/*/tokens.css`, `base.css`, `layout.css`, `components.css`,
`rtl.css`, `src/locales/**`, `src/fonts/**`, `src/vendor/**`, `src/scripts/{render,connect,
explorer,config,qr,clients,i18n,brand,flag,clipboard,format,url,boot,detect,main}.js`.

---

## 15. Frozen-template impact analysis

**This is the section the brief asks to stop and explain.** Stating it plainly:

### 15.1 Why the frozen artifacts are at risk

The artifact is a **single self-contained file**: CSS + boot JS + app JS + locales +
shell, all inlined. There is no runtime include. Therefore:

> **Any edit to any file that is concatenated into an artifact changes every artifact that
> includes it.**

That covers all of `src/scripts/**` (the `BOOT` + `APP` lists), all of `src/styles/**`,
every `src/templates/*/*.css`, `src/locales/**`, and the shells.

### 15.2 Consequence per change class

| Change | Artifacts affected | Byte-locks |
|---|---|---|
| Add a new file to `APP`/`BOOT` in `build.mjs` | **all 15** | all 15 re-baseline |
| Edit any `src/scripts/*.js` (e.g. `live.js`) | **all 15** | all 15 re-baseline |
| Edit `src/styles/*.css` | **Row only** — no other template reads it | 1 re-baseline |
| Edit one `src/templates/<id>/*.css` | that template only | 1 re-baseline |
| Edit `src/index.html` | **none** — no template uses it (dead fallback) | **0 re-baseline** |
| Edit one `src/templates/<id>/layout.html` | that template only | 1 re-baseline |
| **Add a new template to the registry** | **none** | none — build is per-template |
| **Add a new build target writing to a new output tree** | **none** | none — provided the default target is byte-identical |

### 15.3 Verdict on the proposed design

- **Phase 1 (no live polling) requires zero changes to any concatenated file.** The
  adapters and the transpiler are new files; the panel build is a new target; the existing
  default target is untouched. **Zero byte-lock drift. No re-baselining.**
- **Phase 2 (§13.4 option B) requires editing `src/scripts/live.js`.** The runtime is
  inlined, so this **changes all 15 artifacts and re-baselines all 15 byte-locks.**
  That is a design-workstream decision, not a compatibility decision, and it must be
  approved before it is attempted.
- The transpiler must not alter the 3X-UI output path at all. If the canonical shell
  becomes the source of truth for all panels, the transpiler's Go output must reproduce
  the current shells **byte-for-byte** or the locks break. This is testable and must be
  tested before the canonical shell replaces anything.

**No frozen artifact will be invalidated silently. If Phase 2 is approved, the re-baseline
must be explicit, accompanied by a byte-diff review of all 15 artifacts, and signed off by
the design workstream.**

---

## 16. Implementation phases

| Phase | Scope | Artifact drift | Depends on |
|---|---|---|---|
| **P0** | This audit | none | — |
| **P1** | Canonical shell + transpiler + **golden test proving the Go output is byte-identical to today's 15 artifacts** | none | P0 |
| **P2** | Normalized model + adapter interface + adapter unit tests against recorded payloads | none | P1 |
| **P3** | PasarGuard adapter + Jinja emitter + build target + structural gate | none (new output tree) | P2; **blocked by §2.0** |
| **P4** | Rebecca adapter + pongo2 emitter + build target + structural gate | none | P2 |
| **P5** | Installer: per-panel activation strategy; verification; docs | none | P3, P4 |
| **P6** | *(optional, separately approved)* live polling — §13.4 option B | **all 15 re-baseline** | design-workstream sign-off |
| **P7** | Runtime validation on real servers | none | P3–P5 |

P1's byte-identity test is the gate that makes the whole plan safe: if the transpiler
cannot reproduce the current shells exactly, the canonical-shell approach is wrong and we
fall back to authoring two additional engine-specific shells per template (more
duplication, still zero drift).

---

## 17. Test strategy

1. **Transpiler golden tests** — for each of the 15 templates, transpile the canonical
   shell to Go and assert byte-identity against the current committed artifact. This is
   the Phase-1 gate.
2. **Transpiler dialect tests** — the same canonical input to Jinja2 and pongo2; assert
   the output parses under the real engine (Jinja2 via Python; pongo2 via Go).
3. **Adapter unit tests** — recorded native payloads for each panel (PasarGuard
   `SubscriptionUserResponse` JSON; Rebecca `/info` JSON; 3X-UI `?format=info` JSON) →
   assert the normalized model. Cover: `data_limit = None`, `expire = None`,
   `status = on_hold`, empty `links`, `allow_browser_config = false`,
   `online_at = None`, and Rebecca's string-typed `online_at`.
4. **Honesty tests** — assert that absent capabilities are *omitted*, never defaulted:
   no `announce` node on Rebecca, no `datepicker = "jalali"` on either new panel, no
   synthesised `online` without a timestamp.
5. **Structural gate parity** — the server-side gate (analogue of `rt_validate_template`)
   must assert the same invariants for panel artifacts: `<!doctype html>` head, `</html>`
   tail, exactly one branding marker pair, `id="sub-data"` present, no unsubstituted
   placeholders, ≥40 KiB, **and** exactly 1 `<style>` / 3 `<script>` (the verify.mjs
   invariant, which must survive transpilation).
6. **Escaping tests** — for both new panels, feed a value containing `"`, `'`, `<`, `>`,
   `&`, `javascript:` and a `data:` URI, and assert no attribute breakout and no
   navigable script URL. These are the engine gaps identified in §10.
7. **Degradation tests** — simulate a panel that returns HTML to the poller and assert
   `halt('unsupported')` with the server-rendered figures intact.
8. **Frozen-artifact regression** — `npm test` must keep `FROZEN_ARTIFACTS` green
   throughout P1–P5; any red is a stop signal.
9. **Determinism** — build each panel artifact twice and assert byte-identity, matching the
   existing project standard.
10. **Live-server tests** — see §18.

---

## 18. Is a VPS required?

**Static analysis is exhausted. One item genuinely cannot be proven from source, and one
item needs a running panel to be trusted.**

### NO SERVER REQUIRED YET for

- the entire data-contract comparison (§5) — read from the render-context builders and
  DTOs;
- the protocol comparison (§6) — read from the link builders;
- the status/live capability matrix (§7) — read from the DTOs and the info handlers;
- activation, caching, security and installer analysis (§8–§11);
- the frozen-template impact analysis (§15) — this is a property of Row-Template's own
  build, provable locally;
- Phase 1 and Phase 2 in full (§16) — both are offline build/test work.

### SERVER REQUIRED FOR THESE EXACT TESTS

1. **PasarGuard end-to-end render** — that a Jinja page dropped into
   `CUSTOM_TEMPLATES_DIRECTORY`, with `SUBSCRIPTION_PAGE_TEMPLATE` set, is actually served
   at `/sub/<token>` for a browser, with the data island populated and `links` non-empty
   (`allow_browser_config = true`). *Source proves the code path; only a running panel
   proves the configuration surface and the observed payload.*
2. **PasarGuard `/sub/<token>/info` shape** — the exact JSON as emitted, including
   `online_at` nullability and `data_limit`/`expire` null encoding.
3. **PasarGuard `on_hold` behaviour** — how `status = on_hold` plus
   `on_hold_expire_duration`/`on_hold_timeout` actually surfaces on the subscription page,
   which decides §19 Q3.
4. **Rebecca end-to-end render** — the same, via `custom_templates_directory` +
   `subscription_page_template`, confirming per-admin override precedence and that a
   pongo2 page renders with autoescape on.
5. **Rebecca `/sub/<token>/info` shape** — the exact JSON, and the concrete type/format of
   `online_at` (declared `*string`; the layout is not visible from the struct alone).
6. **Rebecca `links` content** — which schemes actually appear for a real client, to
   confirm the §6 protocol table against a live inbound set.
7. **Both panels: poller degradation** — confirm that a browser-Accept poller with a
   browser UA receives HTML and that the page remains usable with server-rendered values.
8. **Both panels: template-edit reload** — confirm empirically that no restart is needed
   (PasarGuard mtime; Rebecca no cache), and that a syntax error in the template produces
   the failure mode predicted in §2.9/§3.9 rather than a silent fallback.

### Server work I would perform myself

Per the brief, I would own the full setup and would not ask for panel installation,
dependency setup, database preparation, Docker, Nginx, config generation, user creation or
test subscriptions. Before any destructive change I would identify the OS, inventory
existing services and data, avoid wiping anything unrelated, and document the intended
install first. A clean disposable VPS is strongly preferred — and for PasarGuard it is
**mandatory**, because the supplied source does not compile (§2.0) and a throwaway box is
where that gets resolved without contaminating anything.

---

## 19. Exact unanswered questions

1. **PasarGuard source integrity.** Is `panel-main.zip` (v5.4.1) the intended upstream
   artifact, or a damaged/staged copy? 13 Python-2 `except` clauses mean it cannot run. Do
   we (a) obtain a known-good revision, or (b) test against a throwaway copy with a
   mechanical `except (A, B):` repair? **This must be settled before Phase 3.**
2. **PasarGuard `announce` encoding.** `announce` is `.format_map()`-expanded from an
   admin template string with `max_length=128`, and rendered as raw HTML. Is the 128-char
   cap intentional, and is raw-HTML rendering of an admin string an accepted design (as
   opposed to a defect to report upstream)?
3. **`on_hold` semantics.** 3X-UI expresses "starts on first connection" as a *negative*
   `expire`. PasarGuard and Rebecca express a related-but-distinct concept as `on_hold` +
   `on_hold_expire_duration` + `on_hold_timeout`. Should the adapter map `on_hold` onto the
   existing `expiry()` `pending` state, or should it be surfaced as a distinct state —
   which would require a runtime change and therefore a re-baseline?
4. **`online` freshness window.** PasarGuard publishes `_ONLINE_USERS_WINDOW =
   timedelta(minutes=2)`. Rebecca publishes no window. What window should the Rebecca
   adapter use, and should it be configurable per panel rather than hard-coded?
5. **Which of Rebecca's extra capabilities are in scope.** `service_name` (plan),
   `subscription_urls` (multiple URLs), `data_limit_reset_strategy`, and the `/usage`
   timeseries are all available and all absent from Row-Template's current UI. Using any
   of them is a **visual/product** decision that belongs to the design workstream, not to
   this one. Default assumption here: **do not use them**; emit them only if the design
   workstream asks.
6. **Phase 2 appetite.** Is live polling on PasarGuard/Rebecca worth re-baselining all 15
   frozen byte-locks — **30 lock assertions** (15 byte + 15 SHA, §1.4), or is "no live
   polling, graceful degradation" the intended end state for the first release?
7. **Per-admin templates.** Both new panels support per-admin template overrides. Should
   the installer configure the global setting only (simpler, one page for everyone), or
   also offer per-admin installation?
8. **Rebecca `announce` substitute.** Rebecca has no announce mechanism at all. Is the
   `support_url` section an acceptable substitute, or should the announcement area simply
   be omitted? Default assumption: **omit**.
9. **PasarGuard `datepicker`.** 3X-UI exposes `jalali`; neither new panel does. Confirm
   that defaulting to Gregorian is correct and that the Jalali rendering path stays
   dormant rather than being emulated client-side from a config flag.
10. **Artifact size budget.** Adding a panel descriptor to the island is a few dozen bytes;
    transpiled shells may differ slightly in length. Confirm that panel artifacts share the
    same 204,800-byte ceiling and that this is acceptable.

---

## 20. Architectural conclusion

**Multi-panel support is NOT approved. The recommendation is that Row-Template stays
3X-UI focused.** This section is the durable record of that conclusion; it was reached in
the Phase 0 architecture review and is unchanged by the 2026-09-19 documentation
correction pass.

| Question | Answer |
|---|---|
| Is multi-panel support required? | **Not established.** Nothing in the product brief or the current release plan requires it. It is a *possibility*, not a requirement, and it must not be treated as a commitment. |
| Should Row-Template remain 3X-UI focused? | **Yes.** 3X-UI is the only engine whose template syntax the shells are authored in, the only one with contextual autoescaping, and the only one the installer, the serving contract and the real-server validation actually target. |
| Adapters, exporters, separate render targets, or something else? | **The distinction is a false one for this artifact.** In a self-contained file the "adapter" has nowhere to live at runtime — normalization must be emitted *into* the template — so an exporter and an adapter are the same artifact. The only honest framing is a **build-time transpiler plus a per-engine emitter**, which is strictly more work than the audit's option list implies. |

**Why the answer is "do not implement" rather than "implement carefully":**

1. **The cost is a global re-freeze, not a local change.** The runtime is inlined into
   every artifact, so any shared-runtime change invalidates **30 lock assertions**
   (15 byte + 15 SHA, §1.4) across **all 15 artifacts** plus the released payload. That is
   affordable once, deliberately — not speculatively.
2. **It trades a security guarantee for a feature nobody has asked for.** Go's contextual
   autoescaping and URL-scheme filtering (`ZgotmplZ`) have **no equivalent** in Jinja2 or
   pongo2 (§10). Both new panels would leave URL schemes unfiltered in attribute context.
   That is a *regression* against the current 3X-UI behaviour, and it is the single
   strongest argument against the work.
3. **Maintainability is the scarce resource.** Three engines means three escaping models,
   three activation paths, three caching behaviours and three failure modes to test —
   against a catalogue of 15 frozen templates with a 204,800-byte ceiling and a binding
   template (`pulsenova`) holding only 533 B of headroom.
4. **Nothing here is foreclosed.** The Phase 1 design (§13, §15.3) is deliberately
   **additive with zero byte-lock drift**, so the option can be taken later at the same
   cost. Deferring loses nothing.

**What would change the answer:** an explicit product decision that PasarGuard or Rebecca
support is required for a named release, *and* acceptance of the escaping regression, *and*
sign-off on the re-freeze of all 15 artifacts. Absent all three, the recommendation stands:
**remain 3X-UI focused; implement nothing.**

---

## Appendix A — Evidence index

**Row-Template**
`tools/templates.mjs` (registry) · `tools/build.mjs` (BOOT/APP order, `REQUIRED_HOOKS`,
`validateLayout`, `loadLayout`, size gates, `defaultOut`) · `tools/verify.mjs` (`FORBIDDEN`,
`ALLOWED_REMOTE`, 1-style/3-script gate) · `src/index.html` · `src/templates/*/layout.html`
· `src/scripts/model.js` (`readDocument`, `normalize`, `health`, `traffic`, `expiry`) ·
`src/scripts/live.js` (poll URL, intervals, halt) · `src/scripts/render.js:171,201,458` ·
`src/scripts/connect.js:12,13` · `installer/lib/row-template.sh` (`RT_*`, `subThemeDir`,
`rt_validate_template`, `rt_switch_template`) · `PROTOCOL-MATRIX.md` ·
`REAL-SERVER-VALIDATION.md` (Stage 2–6) · `tests/build.test.mjs` (`FROZEN_ARTIFACTS`).

**PasarGuard**
`app/templates/__init__.py` · `app/templates/subscription/index.html` ·
`app/templates/filters.py` · `app/routers/subscription.py` ·
`app/operation/subscription.py` (144, 149–168, 196–213, 286–300, 428–480, 597–618, 700–747)
· `app/subscription/links.py` (protocol registry, `_build_hysteria`, `_build_wireguard`) ·
`app/subscription/share.py` (175, 185, 194–266, 490) · `app/subscription/config_cache.py` ·
`app/models/user.py:104–155` · `app/models/protocol.py` · `app/models/settings.py:193–345` ·
`app/db/models.py:177–191` · `app/db/crud/user.py:70,1374` · `config.py:131–150,229` ·
`.env.example:32–44` · `dashboard/src/features/admins/dialogs/admin-modal.tsx:498` ·
`dashboard/src/features/admins/forms/admin-form.ts:60` · `Dockerfile` · `pyproject.toml`.

**Rebecca**
`go.mod` · `internal/app/user/subscription.go` (65–117, 119–200, 202–218, 361–396,
1130–1180, 3601, 3687–3817, 3820–3845, 3905–3924, 973–1039) · `internal/app/user/dto.go`
(117–155, 324–339) · `internal/app/api/subscriptions.go` · `internal/app/api/settings.go:209`
· `internal/app/settings/repository.go:687–747` · `internal/app/settings/normalize.go`
(330–443) · `internal/app/settings/types.go` · `templates/subscription/index.html` ·
`Dockerfile` · `scripts/rebecca/rebecca-binary.sh` · `README.md:91–113`.

**Third-party engines (pinned to the versions the panels declare)**
pongo2 `v6.1.0` — `context.go` (`var autoescape = true`), `variable.go:198`,
`filters_builtin.go:317` (`filterEscape`), `tags_autoescape.go`, `template_sets.go`,
`options.go`, `pongo2.go` (`DefaultSet`).
Jinja2 ≥ 3.1.6 — `Environment` default `autoescape=False`; `FileSystemLoader.uptodate`.

---

## Appendix B — Audit hygiene

- No commit, push, tag, merge, branch switch or `VERSION` change was made.
- No existing file was modified. The four pre-existing working-tree modifications
  (`installer/lib/row-template.sh`, `tests/build.test.mjs`, `tests/registry.test.mjs`,
  `tools/templates.mjs`) and three untracked paths were already present on entry and were
  left untouched.
- This report is the only file written, and it is new.
- Source was treated as authoritative; internet lookups were used only to pin third-party
  engine defaults that are not vendored locally, and were pinned to the exact versions the
  panels declare (`pongo2 v6.1.0`, not master — master differs).

---

PASARGUARD + REBECCA COMPATIBILITY AUDIT READY FOR REVIEW

---

**Reconciled 2026-09-20 — conclusion unchanged.** The verdict above stands: multi-panel
support is **not approved**, and Row-Template stays **3X-UI focused**. What has moved is
the tree, not the argument: `feat/v1.2-multitemplate` is now at **`a012108`**, the flag
renderer having re-baselined all 15 artifacts and all 30 lock assertions — a live instance
of the change class §15 predicts. The binding template `pulsenova` is now at **258 B** of
headroom, not the 533 B §20 quotes, which strengthens rather than weakens §20's first
argument. `VERSION` is still 1.1.0; nothing is pushed and no tag exists. See the **Phase 1
reconciliation** block above.

PASARGUARD + REBECCA COMPATIBILITY AUDIT RECONCILED — CONCLUSION UNCHANGED — 3X-UI FOCUSED
