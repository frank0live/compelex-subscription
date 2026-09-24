# PasarGuard Runtime Fixture — Plan

**Phase 3B — planning and validation strategy only. No fixture captured. No adapter created. No project file modified.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree | branch `feat/v1.2-multitemplate`, HEAD `52f8fc0`, `VERSION` 1.1.0 |
| Predecessor | `PASARGUARD-ADAPTER-AUDIT.md` (Phase 3A) — the source audit this plan operationalises |
| PasarGuard source | `D:\. frank0live Main\3X-UI Template\PasarGuard Panel\panel-main`, version 5.4.1 |
| Scope | fixture format · `/info` structure · subscription headers · mapping validation against `MODEL_FIELDS` |
| Out of scope | the adapter · live polling · `on_hold` · any runtime, template or artifact change |

---

## 0. What this phase must settle

Phase 3A mapped PasarGuard to Row's contract **from source**, not from an observed response. This
phase closes that gap: it defines how a **real** PasarGuard payload is recorded, frozen, and
checked against `tools/contract.mjs`, so Phase 3C can write an adapter against recorded truth
instead of against a reading of the code.

**Nothing is captured in this phase.** The deliverable is the format and the strategy.

---

## 1. The fixture format

### 1.1 Where it lives

```
tests/fixtures/panels/          <- must be created; see the note below
  pasarguard/
    00-showcase.json
    01-active-online.json
    ...
  rebecca/            (Phase 4 — same format)
```

> **Correction to an earlier assumption.** The Phase 1 *plan* listed
> `tests/fixtures/panels/.gitkeep` among its new files, but the Phase 1 *implementation*
> (commit `52f8fc0`, 5 files) did not create it — the placeholder was dropped between planning
> and building, and `tests/fixtures/` does not exist. Verified: `test -d tests/fixtures` fails,
> and `git log --all -- tests/fixtures` is empty. **Phase 3B must create the directory**; it is
> not waiting for it.

It sits beside `tests/build.test.mjs` rather than under `tools/fixtures/`, because
`tools/fixtures/` is a **Go program that generates 3X-UI data**, whereas these are **recorded
native payloads from a foreign panel**. Different provenance, different directory.

### 1.2 The shape

One JSON object per case:

```json
{
  "panel": "pasarguard",
  "case": "01-active-online",
  "note": "one line on what this case pins",
  "source": {
    "route": "GET /{token}/info",
    "version": "5.4.1",
    "recorded": "static-read",
    "clock": 1789732800
  },
  "native": {
    "info":    { ...the SubscriptionUserResponse body... },
    "headers": { ...the subscription response headers... }
  },
  "expected": {
    "model": { ...the normalized model this must produce... }
  }
}
```

| Field | Why |
|---|---|
| `panel` | one format, two panels — Phase 4 reuses it unchanged |
| `case` | matches the file name, so a rename fails a test rather than silently orphaning a case |
| `source.clock` | **the pinned instant**, in epoch seconds. Every time-derived value in `native` is relative to it |
| `source.recorded` | `"static-read"` or `"live-capture"` — records honestly whether the payload came from a running panel |
| `native.info` | the panel's own JSON, **verbatim** — not reshaped into Row's field names |
| `native.headers` | the subscription response headers, verbatim |
| `expected.model` | the golden: the contract-valid model this fixture must produce |

### 1.3 Why `native` is verbatim, not pre-normalised

The fixture must record **what PasarGuard actually sends**, in PasarGuard's own field names
(`used_traffic`, `data_limit`, `online_at`). If the fixture stored Row's names, the test would be
comparing the adapter against itself and would pass even if the adapter misread the panel. The
whole point is that the adapter does the translation, and the fixture proves it did.

### 1.4 Reproducibility

The project already solved this problem once, for the 3X-UI fixtures
(`tools/fixtures/data.go`: `ROW_FIXTURE_NOW`, and the canonical instant
**`1789732800`** = `2026-09-18T12:00:00Z`, chosen mid-day UTC so no timezone shifts the date).

This plan adopts the **same instant**, for the same reason:

> **Every fixture pins `source.clock` to `1789732800`.** No fixture may derive a value from the
> wall clock. A fixture whose `expected.model` changes when the test runs tomorrow is a broken
> fixture, and the test suite must be able to prove it is not.

Two consequences worth stating:

- `expire` and `online_at` in `native` are **absolute instants** relative to that clock, never
  "now + 45 days".
- The model's `expire` is **epoch seconds**; `lastOnline` is **epoch milliseconds**. Both are
  absolute, so both are reproducible. The 1000× unit difference identified in Phase 3A §4 is
  exactly what the fixture makes visible.

---

## 2. Capturing the `/info` response structure

### 2.1 The route

```
GET /{token}/info   →   SubscriptionUserResponse   (app/routers/subscription.py:58)
```

`user_subscription_info` (`app/operation/subscription.py:700`) returns
`SubscriptionUserResponse.model_dump(mode="json")` — so the fixture stores that JSON.

### 2.2 The fields to record

From `SubscriptionUserResponse` → `UserResponse` → `UserNotificationResponse` → `User`
(`app/models/user.py`), and noting the `exclude=True` markers:

| Field | In `/info`? | Why it matters |
|---|---|---|
| `id` | yes | |
| `username` | yes | |
| `status` | yes | `active` · `on_hold` · `disabled` |
| `used_traffic` | yes | the combined counter |
| `lifetime_used_traffic` | yes | not in Row's model — must be ignored, not mapped |
| `data_limit` | yes | `null`/`0` = unlimited |
| `expire` | yes | datetime |
| `on_hold_expire_duration` | yes | **recorded, not mapped** — see §5 |
| `on_hold_timeout` | yes | recorded, not mapped |
| `online_at` | yes | the only online evidence |
| `created_at`, `edit_at` | yes | not in Row's model |
| `data_limit_reset_strategy` | yes | not in Row's model |
| `hwid_limit` | yes | not in Row's model |
| `group_ids`, `group_names` | partially | `group_names` is `exclude=True` |
| `admin` | **excluded** | but `support_url` reaches the headers |
| `subscription_url` | **excluded** | **so `subUrl` cannot come from here** |
| `note`, `auto_delete_in_days` | **excluded** | |
| `ip` | yes (set by the router) | **must not be carried into the model** |
| `inbounds` | `UsersResponseWithInbounds` only | not in the `/info` response model |

**Three consequences the fixture must exercise:**

1. `subscription_url` is **excluded** from `/info`. `subUrl` must be derived from the request URL
   or the `profile-web-page-url` header. The fixture records the header so the adapter has a
   source.
2. `ip` **is** present in `/info`. A fixture must carry it, and a test must assert it does **not**
   reach the model.
3. `admin` is excluded but `support_url` survives in the headers — so `supportUrl` comes from a
   header, not from the body.

### 2.3 The case set

The 3X-UI fixture set has 31 cases. PasarGuard should cover the **same behavioural surface**, plus
the states only it has. The minimum set:

| # | Case | Pins |
|---|---|---|
| 00 | `showcase` | the ordinary active, online, limited subscription |
| 01 | `active-online` | `status=active`, `online_at` recent |
| 02 | `active-offline` | `online_at` old — `online` false, `lastOnline` still set |
| 03 | `disabled` | `status=disabled` → `enabled=false` |
| 04 | `expired` | `expire` in the past relative to the clock |
| 05 | `traffic-exhausted` | `used_traffic >= data_limit` |
| 06 | `unlimited-traffic` | `data_limit = null` → `total = 0` |
| 07 | `never-expires` | `expire = null` → `expire = 0` |
| 08 | `on-hold` | `status=on_hold` — **recorded only, expectation deferred (§5)** |
| 09 | `zero-total` | `data_limit = 0` |
| 10 | `no-support` | no `support-url` header → omit the section |
| 11 | `no-announce` | no `announce` header → omit the section |
| 12 | `announce-encoded` | base64 `announce` — must be decoded |
| 13 | `title-encoded` | base64 `profile-title` — must be decoded |
| 14 | `persian` | a RTL `username`/title |
| 15 | `hostile-title` | `"`, `<`, `>`, `&`, `javascript:`, a `data:` URI |
| 16 | `online-at-string` | Rebecca-style string timestamp — see §5 |
| 17 | `ip-present` | `ip` set — must not reach the model |
| 18 | `missing-optional` | the optional headers absent entirely |
| 19 | `expire-seconds-vs-ms` | **the 1000× guard** — an exact instant, asserted exactly |

Case 19 is the one that matters most. Phase 3A named the `expire`-seconds /
`lastOnline`-milliseconds mix-up as the likeliest adapter bug, and it is **silent**: a timestamp
wrong by 1000× still validates as a finite non-negative number. Only an exact-value assertion
catches it.

---

## 3. Capturing the subscription headers

From `create_response_headers` (`app/operation/subscription.py:171`). The fixture records these
verbatim:

| Header | Notes |
|---|---|
| `subscription-userinfo` | `upload=0; download=<used_traffic>; total=<data_limit>; expire=<epoch s>` |
| `profile-title` | **base64** (`encode_title`) |
| `profile-web-page-url` | the request URL — a source for `subUrl` |
| `support-url` | admin's preferred over settings; may be absent |
| `announce` | **base64**; may be absent |
| `announce-url` | may be absent |
| `profile-update-interval` | not in Row's model |
| `content-disposition` | not in Row's model |
| `Cache-Control` | not in Row's model |

### 3.1 The header is the honest source for the split

`subscription-userinfo` is the panel's **own** answer, and it is the strongest single finding in
the Phase 3A audit:

```
upload=0; download=used_traffic
```

Row computes `used = download + upload`. With these values that is `used_traffic` **exactly**.
The fixture must record this header **and** the matching `used_traffic`, and a test must assert
the two agree — so if a future PasarGuard version starts reporting a real split, the test fails
loudly rather than silently changing what the UI shows.

---

## 4. Validating the mapping against `MODEL_FIELDS`

### 4.1 The four assertions, per fixture

Every fixture is checked by one test that runs four assertions in order:

| # | Assertion | Fails when |
|---|---|---|
| **A1** | the mapping produces a model that passes `validateModel()` | a field is missing, null where it may not be, wrong-typed, negative, or unknown |
| **A2** | **every** `MODEL_FIELDS` key is present | a field was dropped — the contract has 16, so all 16 must appear |
| **A3** | the model deep-equals `expected.model` | the mapping changed behaviour, in any field, by any amount |
| **A4** | no key outside `MODEL_FIELDS` is present | the adapter leaked a panel-only field (`ip`, `on_hold_expire_duration`, …) |

A3 is the one that makes the fixture worth having: it is a full-value comparison, not a
spot-check, and it is the same shape as the test that already pins the 3X-UI adapter to the
runtime (`tests/adapters.test.mjs`, `the adapter matches the runtime exactly`).

### 4.2 The honesty assertions, as invariants

Beyond the four, each fixture is subject to the contract's rules, expressed as checks the fixture
data must satisfy:

| Rule | Fixture check |
|---|---|
| `used = download + upload` when both known | assert against the recorded `used_traffic` |
| `online` true only with `lastOnline` | a fixture with `online: true` **must** carry `online_at` |
| a negative counter is unknown | no fixture may encode `-1` as a value |
| `expire` = 0 means never | the `never-expires` case asserts exactly `0` |
| an absent capability is omitted | `no-support` / `no-announce` assert the **absence of the field's content**, not a placeholder |

### 4.3 The cross-check against the 3X-UI adapter

The strongest available validation is a **shape equivalence**: take a PasarGuard fixture's
`expected.model` and assert it is structurally identical (same key set, same types, same
nullability) to what the reference 3X-UI adapter produces from a 3X-UI fixture. If the two
panels' models differ in shape, one of them is wrong.

This reuses `MODEL_FIELDS` as the single arbiter and needs no new schema.

### 4.4 What the tests must NOT do

- Must not import from `tools/adapters/pasarguard.mjs` — **it does not exist**, and Phase 3B must
  not create it. Until Phase 3C, the tests validate the **fixtures** (A2, A4, and the §4.2 rules
  against `expected.model`); A1/A3 activate when the adapter lands.
- Must not reach into `src/scripts/**`. The contract in `tools/contract.mjs` is the interface.

---

## 5. Deliberately deferred

| Item | Why deferred | What this phase does instead |
|---|---|---|
| **`on_hold`** | A real third state with its own `on_hold_expire_duration`. Row's `expire` encoding (0 = never, negative = duration) has **no slot for it**. It needs a product decision. | **Records** the case (`08-on-hold`) with the raw fields. `expected.model` is left as `null` and the test **skips** that fixture until the decision is made — an explicit, visible skip, not a silent pass. |
| **Live polling** | `/{token}/info` is a **path suffix**, not `?format=info`. Reaching it needs a runtime change (→ all 15 byte-locks re-baseline) or a shell-emitted `liveUrl`. | Records the `liveUrl` the adapter *would* build, in the fixture, but asserts nothing about the runtime. |
| **The adapter** | Phase 3C. | None of these fixtures is consumed by an adapter yet. |
| **Rebecca** | Phase 4. | The format is designed to be shared (§1.2), but no Rebecca fixture is created. |
| **Capturing the payloads** | This phase is planning only. | The format is specified; the files are not written. |

---

## 6. Validation strategy — the sequence

| Step | Action | Gate |
|---|---|---|
| **V0** | Write one fixture by hand from the source (`00-showcase`), as a format proof | it parses, and its `expected.model` passes `validateModel` |
| **V1** | Write `tests/panels-fixtures.test.mjs` — the format checks (A2, A4, §4.2) | green on the single fixture |
| **V2** | Capture the remaining cases | each validates |
| **V3** | Add the cross-check (§4.3) against the 3X-UI adapter's output shape | key sets and types match |
| **V4** | *(Phase 3C)* land the adapter, then A1/A3 activate | the adapter reproduces every `expected.model` exactly |
| **V5** | Re-run the whole suite; confirm the 15 artifacts are still byte-identical | `FROZEN_ARTIFACTS` green, 0 differing |

**The abort conditions**, matching the project's standing rule:

- any fixture's `expected.model` fails `validateModel` → stop, the fixture is wrong
- `FROZEN_ARTIFACTS` goes red → stop, something touched the artifact path
- a fixture's expectation changes when the clock advances → stop, it is not reproducible
- any tracked file outside the fixture directory changes → stop

### 6.1 Why the fixtures cannot break the artifacts

`tests/fixtures/panels/**` is data read by a test. It is not in `APP`/`BOOT`, not a stylesheet,
not a shell, and not in the build's script list. **It cannot move a byte of any artifact.** The
V5 check exists to prove that, not to discover it.

---

## 7. File change map

### New, when this plan is executed

| Path | Kind |
|---|---|
| `tests/fixtures/panels/` | **new directory** — does not exist today (§1.1) |
| `tests/fixtures/panels/pasarguard/*.json` | recorded native payloads, one per case |
| `tests/fixtures/panels/README.md` | the format, in one page |
| `tests/panels-fixtures.test.mjs` | the format + mapping tests |

### Explicitly NOT touched

`src/**` · `tools/adapters/**` · `tools/contract.mjs` · `tools/panels.mjs` ·
`tools/fixtures/**` · `tools/build*.mjs` · `template/**` · `installer/**` · `release/**` ·
`docs/**` · `VERSION` · `CHANGELOG.md` · `package.json`

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **`expire` seconds vs `lastOnline` milliseconds** | **high** | Case `19-expire-seconds-vs-ms` asserts both against one exact instant |
| R2 | A fixture derived from the wall clock | **high** | `source.clock` pinned to `1789732800`; a test asserts every fixture carries it |
| R3 | **Fixtures captured from a panel that will not run** | **high** | Phase 3A recorded 13 Python-2 `SyntaxError`s. `source.recorded` distinguishes `static-read` from `live-capture` — **do not claim a capture that was not made** |
| R4 | The fixture stores Row's field names | high | `native` is verbatim panel JSON; a test asserts `used_traffic`/`data_limit`/`online_at` are present |
| R5 | `ip` leaking into the model | medium | Case `17-ip-present` + assertion A4 |
| R6 | `subscription_url` assumed present | medium | It is `exclude=True`; case `00` records the header instead |
| R7 | base64 headers stored decoded | medium | Record verbatim (encoded); the adapter decodes |
| R8 | An `on_hold` expectation guessed | medium | The case is recorded and **explicitly skipped** |

**R3 is the one to watch.** The panel is known not to compile. This plan therefore does **not**
assume a live capture is possible; `static-read` fixtures derived from the source are the honest
baseline, and any `live-capture` must be labelled as such.

---

## 9. Approval request

This plan needs two decisions before Phase 3C:

1. **Is a `static-read` fixture acceptable as the baseline**, given the panel may not compile
   (R3)? The alternative is to make a compiling tree a hard prerequisite, which blocks the
   phase on work outside this repository.
2. **When should `on_hold` be decided?** It is the only field the contract cannot express. It can
   stay recorded-and-skipped indefinitely, but the adapter cannot ship with it unresolved.

---

PASARGUARD RUNTIME FIXTURE PLAN COMPLETE — NO FIXTURE CAPTURED, NO ADAPTER CREATED — AWAITING REVIEW
