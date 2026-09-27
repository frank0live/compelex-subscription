# PGClock — secondary-reference audit (1.3.0 hardening)

**Status:** read-only audit. **No PGClock code was copied, ported or derived from.**
`PROVENANCE.md` is unchanged, and no licence obligation arises (see §5).

**Subject:** <https://github.com/Mrclocks/PGClock>, at `HEAD` = `2ee77a7`
("نسخهٔ استاندارد — قالب شیشه‌ای صفحهٔ اشتراک برای Pasarguard" — the standard
glass-style subscription page template for PasarGuard).

**Question this audit answers:** does PGClock hold any PasarGuard behaviour that
Row-Template needs for the four 1.3.0 hardening items — subscriber identity,
service/brand name, support URL, or country/flag detection — and is any of it
worth importing?

**Short answer: no.** PGClock is a single self-contained HTML page. It confirms
one decision Row had already taken from the panel source (`user.username` is the
subscriber identity), says nothing at all about the other three, and is
unlicensed, so nothing may be taken from it in any case.

---

## 1. What the repository contains

Every file at `HEAD`, from the Git tree API:

| Path | Bytes | Kind |
|---|---|---|
| `README.md` | 2,920 | Persian install/usage notes |
| `install.sh` | — | Ubuntu installer + version menu (`Lite` / `PGClock` / `Pro`) |
| `index.html` | 91,075 | the page itself — CSS, markup and JS in one file |
| `Preview.png` | 288,721 | screenshot |
| `Host Version/index.html` | 94,525 | the "host" variant of the same page |
| `Host Version/index.php` | 1,862 | a thin wrapper |
| `Host Version/.htaccess` | 27 | rewrite rule |

There is no `package.json`, no build step, no source directory and no test
suite. The README states this as a feature: *"یک فایل HTML — بدون Node.js و
build"* — one HTML file, no Node.js and no build.

---

## 2. The install mechanism it uses (relevant, and consistent with Row)

PGClock writes to `/var/lib/pasarguard/templates/subscription/index.html` and
sets two keys in `/opt/pasarguard/.env`:

```env
CUSTOM_TEMPLATES_DIRECTORY="/var/lib/pasarguard/templates/"
SUBSCRIPTION_PAGE_TEMPLATE="subscription/index.html"
```

That is the same mechanism Row-Template's PasarGuard installer uses
(`PASARGUARD-INSTALLER-AUDIT.md`), reached independently by a third party. It is
useful corroboration that the mechanism is the intended one — and it is the only
thing in the repository that is relevant to Row at all. Row's installer was
written from the panel source and is **not** changed by this finding.

---

## 3. Subscriber identity — confirms `user.username`, and nothing more

PGClock reads exactly one identity field, in one place:

```js
var name = user.username || '—';                      // index.html:2054
document.title = name && name !== '—' ? name : 'اشتراک';   // index.html:2056
```

So the page's own title is **the subscriber's username**, with the generic
Persian word for "subscription" (`اشتراک`) as the fallback — and the static
`<title>اشتراک</title>` in the markup is the same fallback.

This is a **secondary, independent confirmation** of the decision Row's fix
takes from the panel source (`app/templates/subscription/index.html` titles
itself with `user.username`). It is confirmation only: the code is three lines
long, it is the obvious implementation, and nothing was taken from it.

`user.username` is also the only field PGClock reads that Row's fix reads. Its
other reads — `status`, `used_traffic`, `data_limit`, `expire`, `online_at`,
`on_hold_expire_duration`, `on_hold_timeout`, `hwid_limit`, `created_at` — are
fields Row's adapter already maps, and none of them is an identity field.

## 4. Service name, support URL and flags — absent

The whole 91 KB file was searched, not sampled:

| What was searched for | Occurrences in `index.html` |
|---|---|
| `user.username` | 1 (§3) |
| `profile_title` | **0** |
| `support_url` | **0** |
| `service_name` | **0** |
| `sub_settings` | **0** |
| `country` | **0** |
| `flag` | **0** |
| a regional-indicator code point, or `U+1F1E6`–`U+1F1FF` | **0** |

The two apparent "ISO" hits are `Date.prototype.toISOString()` and a variable
named `isOpen`; there is no country-code logic of any kind. PGClock has **no
service/brand name variable, no support URL variable and no country or flag
mapping**, so it offers no guidance on hardening items 2 and 3.

It is worth stating plainly *why* it has none, because it is the same reason Row
has none: PasarGuard's page context is
`{user, links, announce, announce_url, apps}` plus Jinja2's `now`
(`app/operation/subscription.py` `_build_subscription_body_payload`). A
`profile_title` or `support_url` is not in it. PGClock's author therefore had
nothing to read, exactly as Row does not — which is why Row's fix reads the
admin's own column (`user.admin.profile_title`, which *is* in the context) and
why the panel-wide settings are documented as unreachable
(`PASARGUARD-ADAPTER-AUDIT.md` §8).

---

## 5. Licence — none, so nothing may be taken

There is **no `LICENSE` file** (`raw.githubusercontent.com/.../LICENSE` → HTTP
404), **no licence header** in `index.html`, `install.sh`, `index.php` or
`.htaccess`, and **no licence section** in the README. The README's only
statement of terms is the install instructions.

Under the default of "all rights reserved", PGClock is **not** open source, and
no code, comment, identifier, string or data table may be copied from it —
including the "obvious" three-line username block in §3, which Row did not copy
(it is written from the panel's own template, and the fix cites the panel file,
not PGClock).

**No PGClock code is present in Row-Template.** This audit therefore does **not**
trigger the PROVENANCE obligation: `PROVENANCE.md` is unchanged, and no
attribution line is added. If PGClock is ever relicensed, or if any code is ever
taken from it, that file must be updated first.

---

## 6. Verdict

**PGClock is a useful secondary confirmation and a source of nothing else.**

1. It independently corroborates `user.username` as the subscriber identity
   (§3) — the same conclusion the panel source gives, reached without the
   panel source.
2. It corroborates the `.env` + `CUSTOM_TEMPLATES_DIRECTORY` install mechanism
   Row's PasarGuard installer already uses (§2).
3. It has no service-name, support-URL or flag logic to offer (§4).
4. It is unlicensed, so nothing could be taken from it even if it did (§5).

No code was imported, no data table was transcribed, and no licence obligation
arises. The hardening items stand on the panel source, as the task requires.

---

PGCLOCK AUDIT COMPLETE — READ-ONLY — NOTHING DERIVED — PROVENANCE UNCHANGED
