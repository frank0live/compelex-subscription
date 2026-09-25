# on_hold on PasarGuard and Rebecca — Decision Record

| | |
|---|---|
| Date | 2026-09-25 |
| Release | 1.3.0 |
| Supersedes | `REBECCA-ADAPTER-DECISIONS.md` §3 (option A, "reject") |
| Status | **Decided and implemented** |

## Why the old decision had to change

`REBECCA-ADAPTER-DECISIONS.md` §3 froze option **A — reject `on_hold`** on the grounds
that the adapters were not wired into anything, so a `throw` cost nothing. That is no
longer true. In 1.3.0 the PasarGuard and Rebecca pages are installed on real panels, and
a page template cannot throw: whatever the page does with an `on_hold` subscriber is
what that subscriber sees. "Refuse" is not an option a served page has.

## The decision

Option **B** from the old record, now with a rule for the case it did not cover.

| Panel | Hold duration known to the page? | `enabled` | `expire` | The subscriber sees |
|---|---|---|---|---|
| PasarGuard | **yes** — `user.on_hold_expire_duration` | `true` | **−duration** (seconds) | "Starts on first connection · valid for N days after that" |
| PasarGuard | no (`null` / `0`) | `true` | **unknown** | an unknown expiry (—) |
| Rebecca | **no** — not in the page context | `true` | **unknown** | an unknown expiry (—) |

**Why negative expire.** Row's `expire` encoding already has the slot: a negative value
is "a duration that starts on first connection" (`src/scripts/model.js`, `expiry()`
→ `kind: 'pending'`). That is exactly what `on_hold` means on both panels. No contract,
runtime or artifact change is needed.

**Why unknown, and not "never".** When the duration is not available, the only honest
statement is that the expiry is unknown. `0` would say "never expires", which is false;
any negative number would invent a duration. The page encodes "unknown" the way the
contract already defines it: a value outside the plausible range
(`EXPIRE_MAX = 4.1e9`), which `normalize()` reads as `null`. The page template writes
`9999999999`; the JavaScript adapters return `null`; both normalize to the same model.

**Why enabled.** Rebecca's own page classes `on_hold` as `active`
(`subscriptionStatusClass`), and both panels let an `on_hold` subscriber connect — that
is what starts the clock.

## The other statuses (for completeness)

| Status | `enabled` | Note |
|---|---|---|
| `active` | `true` | |
| `limited` | `true` | the page derives "limited" from `used ≥ total` |
| `expired` | `true` | the page derives "expired" from `expire` |
| `disabled` | `false` | the only "off" state |
| anything else | PasarGuard: cannot occur (a closed enum). Rebecca: **`false`**, because Rebecca's own `status_class` classes an unknown status as `disabled` — the page fails safe. The JavaScript adapter still refuses it, loudly. |

PasarGuard's `limited` and `expired` were missing from its adapter's status table before
1.3.0 (the adapter would have refused a real `limited` subscriber). Both are now covered,
with fixtures `20-status-limited` and `21-status-expired`.

## Where it is implemented and tested

| | |
|---|---|
| Page (PasarGuard) | `src/panels/pasarguard/prelude.jinja2` |
| Page (Rebecca) | `src/panels/rebecca/prelude.pongo2` |
| Adapters | `tools/adapters/pasarguard.mjs`, `tools/adapters/rebecca.mjs` |
| Fixtures | `pasarguard/08-on-hold`, `pasarguard/22-on-hold-no-duration`, `rebecca/08-on-hold` |
| Real-engine proof | `tests/panels-engines.test.mjs` — renders the shipped pages with Jinja2 and pongo2 |
