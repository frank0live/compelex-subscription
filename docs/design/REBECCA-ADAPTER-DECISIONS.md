# Rebecca Adapter — Decision Record

**Phase 4B — decision document only. No adapter. No source, runtime or template change.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree | branch `feat/v1.2-multitemplate`, HEAD `52f8fc0`, `VERSION` 1.1.0 |
| Input | `REBECCA-ADAPTER-AUDIT.md` — verdict **B, partially compatible** |
| Purpose | close the three open questions so an adapter can be written without guessing |
| Status | **all four decisions taken and frozen below** |
| Result | **READY FOR ADAPTER** (§5) |

---

## 1. Time handling

### The input

Rebecca sends `online_at` as a **naive, space-separated** string with **no timezone**:

```
"2026-07-01 10:20:30"
```

Confirmed by the panel's own test fixture (`internal/app/user/subscription_test.go:2227`).

### Decision — **interpret `online_at` as UTC**

Rebecca is a UTC-based service. Its own template context sets
`"current_timestamp": time.Now().UTC().Unix()`, its expiry logic compares against `now.Unix()`,
and `config_links.go:610` does `time.Unix(*item.Expire, 0).UTC()`. There is no local-time concept
anywhere in the subscription path. **UTC is therefore the only reading consistent with the panel
itself.**

### The hazard this closes

`Date.parse("2026-07-01 10:20:30")` — with no zone — is interpreted by V8 as **LOCAL time**. A
reader at **GMT+3:30** would get an instant **3.5 hours wrong**, and it would be wrong
*silently*: the result is still a finite positive number, so every structural check passes.

> **The PasarGuard adapter's `Date.parse` call would be WRONG for Rebecca**, even though the two
> panels' `online_at` look alike. PasarGuard sends ISO with a `Z`; Rebecca does not. This is the
> near-miss that a "they're the same" assumption produces.

### Conversion rule

```
lastOnline (ms) =
    value already carries a zone (ends with Z, or ±HH:MM)  ->  Date.parse(value)
    otherwise                                              ->  Date.parse(value.replace(' ', 'T') + 'Z')
```

Both the space→`T` normalisation **and** the `Z` are required. The space alone is not valid ISO;
the `Z` alone does not survive the space form on every engine. Doing both makes the intent
explicit and the result engine-independent.

### `expire` needs no conversion

Rebecca's `expire` is `*int64` and **already epoch seconds** — `config_links.go:610` calls
`time.Unix(*item.Expire, 0)` and `lifecycle.go:121` compares `*row.Expire <= now.Unix()`. Row
wants seconds. **DIRECT.** Note the asymmetry that must be kept straight:

| field | Rebecca unit | Row unit | conversion |
|---|---|---|---|
| `expire` | **seconds** | **seconds** | **none** |
| `online_at` | naive string | **milliseconds** | UTC-normalise, then ×1000 |

`expire` is `nil` or `<= 0` → Row **`0`** (= never). Rebecca's context emits `expire` only when
`*Expire > 0`, so a non-positive value is already indistinguishable from "never" at the source.

### Online window

**120 seconds**, the same value PasarGuard uses, and for the same reason: neither panel publishes
a threshold, so it is an **adapter decision, not a panel fact**, and must be labelled as such in
the source.

The window is evaluated against a **caller-supplied `now`** (`native.now` in milliseconds),
falling back to `Date.now()`. This is what makes the fixtures reproducible — without a pin, a
fixture captured today is stale tomorrow.

`online_at` absent → `online` false, `lastOnline` null. **Never synthesised.**

### Test requirements

| # | Test | Fails when |
|---|---|---|
| T1 | a known `online_at` and a pinned clock produce an **exact** `lastOnline` ms | the conversion is off by any amount |
| T2 | **timezone independence** — set `process.env.TZ` to a non-UTC zone, re-parse, assert the **same instant** | the value was read as local time |
| T3 | `online_at` absent → `online` false and `lastOnline` null | a value was invented |
| T4 | `online_at` inside vs outside 120 s → `online` true vs false | the window is wrong |
| T5 | `expire` is **unchanged** from the native int | a spurious conversion crept in |
| T6 | a value that already carries a zone parses as-is | the normaliser double-appends |

**T2 is the one that matters.** T1 alone would pass even with a local-time bug, because the test
machine might be UTC. T2 must run under a deliberately non-UTC `TZ`.

---

## 2. Status normalization

Rebecca has **five** statuses: `active`, `limited`, `expired`, `disabled`, `on_hold`
(`subscription.go:3820`, `subscriptionStatusClass`).

### Decision table

| Rebecca status | `enabled` | `online` | Rationale |
|---|---|---|---|
| `active` | **`true`** | from `online_at` | the ordinary case |
| `limited` | **`true`** | from `online_at` | the account is enabled; it has merely exhausted its allowance |
| `expired` | **`true`** | from `online_at` | expiry is not disablement |
| `disabled` | **`false`** | **`false`** | the only state that means "off" |
| `on_hold` | **see §3** | **see §3** | a product decision, not an adapter guess |
| anything else | — | — | **THROW** |

### Why `limited` and `expired` are `enabled: true`

Row's runtime already derives both, downstream, from the data (`src/scripts/model.js`):

```js
export function health(m, now) {
  if (!m.enabled) return 'disabled';
  if (m.expire !== null && m.expire > 0 && m.expire * 1000 <= now) return 'expired';
  if (m.total > 0 && m.used !== null && m.used >= m.total) return 'limited';
  return 'active';
}
```

Mapping `limited` or `expired` to `enabled: false` would collapse three distinguishable states
into one and **destroy `health()`'s ability to tell them apart.** The adapter reports the facts
(`enabled`, `expire`, `used`, `total`); the runtime derives the health label. That is the correct
division and it requires no new field.

Similarly, `online` is already gated downstream by `isOnline(m, state)`, which requires
`state === 'active'`. So the adapter reports the raw online fact and lets the runtime decide.

### Do not silently map unclear states

Any status outside the five **throws**. A panel version that adds a sixth state must fail loudly,
not be coerced into `enabled: true` by an `else` branch.

---

## 3. `on_hold` policy

### Comparison

| | PasarGuard | Rebecca |
|---|---|---|
| `on_hold` exists | yes (`status = "on_hold"`) | yes (`status = "on_hold"`) |
| carries a duration | `on_hold_expire_duration` | `on_hold_expire_duration` |
| carries a deadline | `on_hold_timeout` | `on_hold_timeout` |
| panel's own rendering | a distinct state | **`subscriptionStatusClass` maps it to `"active"`** (`:3820`) |
| our adapter today | **throws `unsupported on_hold state`** | — |

Rebecca's template goes further and rewrites its own condition
(`subscription.go:3737`): `user.status == 'active'` becomes
`user.status == 'active' or user.status == 'on_hold' or user.placeholder`. **Rebecca treats
`on_hold` as active.**

### The three options

| | Option | Cost | Honesty |
|---|---|---|---|
| **A** | **reject explicitly** — throw, as PasarGuard does | zero | refuses to guess |
| **B** | display as a supported state | zero contract cost, needs its own test set | requires a mapping decision |
| **C** | add a normalized field (`onHold` / `status`) | **contract change → runtime change → all 15 re-baseline** | most expressive |

### Analysis

**C is disproportionate.** It grows `MODEL_FIELDS` from 16 to 17, which means `contract.mjs`,
`model.js`, `render.js` and the shells all change — and `model.js` is inlined into all 15
artifacts. Against `pulsenova`'s **258 B** of headroom, that is the single most expensive option
on the table, for one state on two panels. **Rejected for v1.9.0.**

**B is more viable than it first appears**, and the evidence is in Row's own contract. Row's
`expire` encoding already has a slot for "not started yet":

```js
// src/scripts/model.js
if (m.expire < 0) return { kind: 'pending', days: Math.max(1, Math.round(-m.expire / 86400)) };
```

`pending` means *the clock starts on the first connection*. That is **the same concept as
`on_hold`**: the subscription is held and its countdown has not begun. So
`expire = -(on_hold_expire_duration)` would render a correct "pending, N days" — with **no
contract change and no runtime change.**

**A is what this document freezes for v1.9.0**, for three reasons:

1. **Consistency.** PasarGuard already throws, and it is shipped and tested. Two panels behaving
   differently for the same state is a worse defect than either behaviour alone.
2. **It costs nothing today.** The adapter is **not wired into the runtime** — no production path
   calls it. A `throw` is a build-and-validation-time signal, not a user-facing error page. That
   materially changes the calculus: A is cheap *now* and can be revisited without a migration.
3. **It does not guess.** B is a real mapping, but it is a *product* claim — "on hold is the same
   as pending first-use" — and that claim should be made deliberately, with its own test set,
   rather than smuggled in as an adapter detail.

### Decision — **A: reject `on_hold` explicitly, for v1.9.0**

Both adapters throw `unsupported on_hold state`. The state is **recorded** in the fixtures with a
**null expectation** and a **visible skip**, so the gap stays on the record rather than being
silently absorbed.

**Recommended follow-up for v1.10:** adopt **B** via the `pending` encoding, as a separately
approved change with its own tests — `on_hold` → `enabled: true`, `expire = -duration`, and a
test asserting `expiry()` returns `kind: 'pending'` with the right day count. The evidence for it
is already in this document; it needs a product sign-off, not more research.

---

## 4. Live polling decision

### The situation

| panel | info endpoint | shape |
|---|---|---|
| 3X-UI | `pathname + '?format=info'` | **query parameter** |
| PasarGuard | `pathname + '/info'` | **path suffix** |
| Rebecca | `pathname + '/info'` | **path suffix** |

The runtime hard-codes the query form (`src/scripts/live.js:77`):

```js
return win.fetch(win.location.pathname + '?format=info', init);
```

Both adapters already expose `livePath()` returning the correct suffix, but **nothing calls it.**

### The options

| | Option | Artifact drift | Notes |
|---|---|---|---|
| 1 | **Runtime modification** — `live.js` reads a shell-emitted descriptor | **all 15 re-baseline** | `live.js` is in `APP`, inlined into every artifact. Needs design-workstream approval and must fit `pulsenova`'s **258 B**. |
| 2 | **Shell-emitted `liveUrl`** | **all 15 re-baseline** | The shell emits the endpoint, but the *runtime must still read it* — so this is option 1 with a different data source, not a cheaper one. |
| 3 | **Defer live support** | **zero** | The poller halts gracefully; the server-rendered figures stand and are correct. |

### Decision — **3: defer, for v1.9.0**

Three reasons:

1. **The server-rendered values are already correct.** Polling only *refreshes* them. A page
   without polling is complete; it is not degraded in any way the reader can detect.
2. **The cost is a full re-freeze of the catalogue**, against **258 B** of headroom. That is the
   most expensive change class in the project, and it is not an adapter decision.
3. **It is reversible at any time.** Deferring costs nothing later; doing it now costs 15
   re-baselines and a design-workstream sign-off.

**This is explicitly a design-workstream decision, not a compatibility one.** The adapters report
the correct path; wiring it is a separate, separately-approved phase (P6 in
`ARCHITECTURE-MULTIPANEL-PLAN.md`).

---

## 5. Final adapter readiness

### **READY FOR ADAPTER**

Every open question from the Phase 4A verdict has been closed:

| Phase 4A open item | Resolution |
|---|---|
| `online_at` timezone | **UTC**, explicit normalisation, T2 timezone-independence test (§1) |
| status mapping | **table frozen**, `limited`/`expired` → `enabled: true` so `health()` still works (§2) |
| `on_hold` | **A — reject**, consistent with PasarGuard; B documented for v1.10 (§3) |
| live polling | **deferred** — a design-workstream decision, not an adapter one (§4) |

### What "ready" means here — and what it does not

**Ready:** the island-producing adapter. Every field of Row's 16-key model has a decided source;
the traffic mapping is honest by construction (`upload=0; download=used_traffic`, identical to
PasarGuard); `expire` is DIRECT; the three derived fields (`enabled`, `online`, `lastOnline`) have
decided rules and named tests. The engine (pongo2) is already declared in the registry, so **no
registry change is needed** to admit Rebecca.

**Not covered by "ready":**

- **The Rebecca shell is a separate workstream.** Phase 4A §5 found that Rebecca's template
  depends on **Go-registered runtime filters** (`bytesformat`, `datetime`), which a transpiled
  shell cannot reproduce. The Rebecca shell must be **authored by us** in the pongo2 dialect,
  not mechanically transpiled. That is a shell task, not an adapter task, and it is unchanged by
  this document.
- **No Rebecca fixture exists yet.** The `tests/fixtures/panels/` format is shared-ready, but no
  case has been written.
- **Every finding remains static-read.** Go 1.26.7 is available and Rebecca *could* be built, but
  it was not. No payload has been observed from a running panel.

### The next phase, in order

1. Rebecca fixtures in `tests/fixtures/panels/rebecca/`, including a **timezone case** (T2).
2. `tools/adapters/rebecca.mjs` — island + livePath, per this record.
3. `tests/adapters-rebecca.test.mjs` — the fixture oracle plus T1–T6.
4. Registry entry `planned` → `active`, emitter `pongo2` (already correct).
5. *(Separate workstream)* author the Rebecca shell.

---

## Verification

| Check | Result |
|---|---|
| `git diff --check` | **clean** |
| Only allowed new file | **`REBECCA-ADAPTER-DECISIONS.md`** — no other new file |
| `src/` · `template/` · `installer/` · `release/` · `docs/` · `VERSION` · `CHANGELOG.md` · `package.json` | **0 changes** |
| `tools/adapters/` | **`3xui.mjs` + `pasarguard.mjs` only — no Rebecca adapter** |
| Artifacts | **15 compared, 0 differing — byte-identical** |
| Committed | **no** |

---

REBECCA ADAPTER DECISIONS FROZEN — READY FOR ADAPTER — NO IMPLEMENTATION PERFORMED
