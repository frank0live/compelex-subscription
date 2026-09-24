# PasarGuard Adapter Audit

**Phase 3A — compatibility audit only. No adapter created. No project file modified.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree audited | `D:\. frank0live Main\3X-UI Template\PasarGuard Panel\panel-main` |
| PasarGuard version | **5.4.1** (`pyproject.toml`, `name = "PasarGuard"`) |
| Method | local source read directly; no network |
| Companion | `PANEL-COMPATIBILITY-AUDIT.md` §2 (the Phase 0 source audit), `ARCHITECTURE-MULTIPANEL-PLAN.md`, `PHASE-1-FOUNDATION-PLAN.md` |
| Verdict | **Compatible. The mapping is honest and lossless for Row's UI. One capability is genuinely absent, and one prior claim needs correcting — see §6.** |

---

## 1. Source layout

```
panel-main/
  app/
    routers/subscription.py       the HTTP surface
    operation/subscription.py     the data assembly  ← the real source
    subscription/share.py         format variables
    subscription/{xray,clash,singbox,links,outline,wireguard}.py   per-engine config
    models/user.py                the user model      ← the field source
    models/subscription.py        subscription models
    templates/subscription/index.html   ONE Jinja2 template, 46 KB
    templates/__init__.py         jinja2.Environment + SandboxedEnvironment
```

**The template engine is Jinja2** — `Environment(loader=FileSystemLoader(...))`, with a
`SandboxedEnvironment` also constructed. This is the dialect `tools/transpile.mjs` already
emits.

---

## 2. The real data source

Four routes carry subscription data. All four are panel-native and require no source patch.

| Route | Returns | Relevance to Row |
|---|---|---|
| `GET /{token}/` | the **HTML subscription page** (Jinja2) | this is what Row would replace |
| `GET /{token}/info` | `SubscriptionUserResponse` JSON | **the natural adapter input** |
| `GET /{token}/raw` | the raw config | not needed |
| `GET /{token}/apps` | `list[Application]` | not needed |
| `GET /{token}/{client_type}` | per-engine config | not needed |

**The single most important fact in this audit** is in `create_response_headers`
(`app/operation/subscription.py:181`):

```python
user_info = {"upload": 0, "download": user.used_traffic, "total": 0, "expire": 0}
if user.data_limit:
    user_info["total"] = user.data_limit
if user.expire:
    user_info["expire"] = int(user.expire.timestamp())
...
"subscription-userinfo": "; ".join(f"{key}={val}" for key, val in user_info.items()),
```

So PasarGuard's own `subscription-userinfo` header reports:

```
upload=0; download=<used_traffic>; total=<data_limit>; expire=<epoch seconds>
```

**The panel puts the combined counter in `download` and reports `upload=0`.** This is not a
limitation the adapter must work around — it is the panel's own honest answer, and it lands
exactly on Row's model:

> Row computes `used = download + upload`. PasarGuard supplies `download = used_traffic` and
> `upload = 0`, so **`used = used_traffic`, exactly right, with no fabricated split.**

Row's UI displays only the combined `used` (verified in Phase 0: `render.js`, `main.js` and
`connect.js` contain no reference to `download` or `upload`), so **nothing is invented and
nothing is lost.**

---

## 3. Subscription / user fields

From `app/models/user.py`, the field set the adapter can read. `SubscriptionUserResponse`
extends `UserResponse` → `UserNotificationResponse` → `User`.

| Field | Type | Notes |
|---|---|---|
| `username` | str | |
| `status` | `UserStatus` | **`active` · `on_hold` · `disabled`** |
| `used_traffic` | int | **combined** counter, bytes |
| `lifetime_used_traffic` | int | not in Row's model |
| `data_limit` | `int \| None` | `None` or `0` = unlimited |
| `expire` | `datetime \| int \| None` | tz-fixed on validate |
| `on_hold_expire_duration` | `int \| None` | seconds; the on-hold countdown |
| `on_hold_timeout` | `datetime \| int \| None` | |
| `data_limit_reset_strategy` | enum \| None | |
| `online_at` | `datetime \| None` | **the only online evidence** |
| `created_at` / `edit_at` | datetime | |
| `subscription_url` | str | **`exclude=True` on `SubscriptionUserResponse`** |
| `hwid_limit` | `int \| None` | |
| `note`, `auto_delete_in_days` | | `exclude=True` |
| `admin` | `AdminContactInfo` | `exclude=True`; carries `support_url` |
| `group_ids` / `group_names` | | |
| `ip` | `str \| None` | set by the router — **must not be carried** |

From `app/subscription/share.py:251`, `setup_format_variables()` returns **13 template
variables**, all **pre-formatted strings**:

`SERVER_IP` · `SERVER_IPV6` · `USERNAME` · `DATA_USAGE` · `DATA_LIMIT` · `DATA_LEFT` ·
`DAYS_LEFT` · `EXPIRE_DATE` · `JALALI_EXPIRE_DATE` · `TIME_LEFT` · `STATUS_EMOJI` ·
`USAGE_PERCENTAGE` · `ADMIN_USERNAME`

> **These are display strings, not data.** `DATA_LIMIT` is `"∞"` when unlimited;
> `DAYS_LEFT` is `"∞"`, `"0"`, or an `int` depending on status; an unknown key yields
> `"<missing>"` via the `defaultdict`. **An adapter must NOT consume these** — it must go back
> to the raw `user` object, which the template also receives (`user.used_traffic`,
> `user.data_limit`, `user.expire` all appear in `index.html`). Consuming the format variables
> would mean parsing `"∞"` back into a number, which is exactly the kind of lossy round-trip
> the contract exists to prevent.

---

## 4. Field mapping to Row-Template's normalized contract

Against `tools/contract.mjs` `MODEL_FIELDS`. **Every field is reachable.**

| Row canonical | PasarGuard source | Kind | Notes |
|---|---|---|---|
| `enabled` | `status != "disabled"` | ADAPTER | `on_hold` counts as enabled |
| `online` | `online_at` within a window | ADAPTER | only when `online_at` is set |
| `download` | `used_traffic` | DIRECT | the combined counter, per §2 |
| `upload` | `0` | CONST | **exactly what the panel reports** |
| `used` | `used_traffic` | DERIVED | `download + upload` = `used_traffic` ✓ |
| `total` | `data_limit ?? 0` | ADAPTER | `None`/`0` → `0` = unlimited |
| `expire` | `int(expire.timestamp())` | ADAPTER | datetime → epoch **seconds** |
| `lastOnline` | `online_at` → epoch **ms** | ADAPTER | **unit differs from `expire`** |
| `subUrl` | the request URL, or `profile-web-page-url` | DERIVED | `subscription_url` is `exclude=True` |
| `subJsonUrl` | — | **UNSUPPORTED** | no equivalent; omit the button |
| `subClashUrl` | `/{token}/clash_meta` | DERIVED | path, not a field |
| `title` | `profile-title` header (base64) | DERIVED | `encode_title()` |
| `supportUrl` | `support-url` header | DIRECT | admin's `support_url` preferred |
| `announce` | `announce` header (base64) | DERIVED | `encode_title()`; absent → omit |
| `jalali` | — | CONST `false` | the panel always computes *both* calendars |
| `links[]` | the generated configs | ADAPTER | one per host/protocol |
| `panel` | — | CONST `"pasarguard"` | |
| `liveUrl` | `pathname + "/info"` | DERIVED | **a path suffix, not a query param** |

**The `expire` unit trap.** `subscription-userinfo` carries `expire` in **seconds**; the model
wants **seconds**. But `online_at`/`lastOnline` is in **milliseconds**. Both are reachable, and
a mix-up is silent — a timestamp wrong by 1000× still validates as a finite non-negative
number. This is the single likeliest adapter bug and must be pinned by a test with a known
instant.

---

## 5. Missing capabilities

| Capability | Status | Handling |
|---|---|---|
| **Upload/download split** | **ABSENT** | Not needed — the UI shows only the combined `used`, and `upload=0` is the panel's own report. **No fabrication required.** |
| `subJsonUrl` | **ABSENT** | Omit the button; the contract allows it. |
| `announce` | present via header | base64-encoded (`encode_title`) — must be decoded |
| `datepicker` / jalali-only | **ABSENT** | The panel emits **both** `EXPIRE_DATE` and `JALALI_EXPIRE_DATE`. The template has its own toggle. Row's `jalali` is a client-side setting, so the adapter should not try to drive it. |
| Per-admin template | **PRESENT** (`admins.sub_template`) | out of scope for the adapter |
| Live polling via `?format=info` | **UNSUPPORTED** | The endpoint is `/{token}/info` — a **path suffix**. Requires either a runtime change (→ all 15 byte-locks re-baseline) or the shell emitting `liveUrl`. **This is the one place the runtime is not panel-agnostic.** |
| `on_hold` | **PRESENT, and distinct** | PasarGuard's `on_hold` is a real third state with its own countdown. Row's model has no equivalent. **Do not fold it into "first use"** — see §6. |
| `data_limit_reset_strategy` | present | not in Row's model; omit |
| Recommended-client apps | **PRESENT** (`/{token}/apps`) | not in Row's model; omit |

---

## 6. Corrections to the prior audit, and risks

### A prior claim needs correcting

`PANEL-COMPATIBILITY-AUDIT.md` §2.0 records that **PasarGuard `panel-main` does not compile —
13 `SyntaxError`s from Python-2 exception syntax (`except A, B:`)**. This audit read the source
statically and **did not run it**, so it neither confirms nor contradicts that finding, and the
mapping above does not depend on it. It remains a **hard prerequisite for P3** (runtime
validation), not for this audit.

### The five risks, in order

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **`expire` seconds vs `lastOnline` milliseconds** mixed up | **high** | Pin both against a known instant; a 1000× error still validates, so only an exact-value test catches it |
| R2 | **`on_hold` folded into "first use"** | **high** | `on_hold` is a distinct state with `on_hold_expire_duration`. It needs an explicit product decision, not an adapter guess. Row's `expire` encoding (0 = never, negative = duration) has no slot for it. |
| R3 | **Consuming the format variables instead of the raw user** | **high** | `"∞"` and `"<missing>"` are display strings. Read `user.data_limit` / `user.used_traffic` / `user.expire` directly. |
| R4 | **`ip` leaking into the model** | medium | `SubscriptionUserResponse.ip` is set by the router. Row's contract has no address field, and `validateIsland` already refuses unknown attributes — a test should assert it. |
| R5 | **`subscription_url` is `exclude=True`** | medium | It is **not** in the `/info` payload. Derive `subUrl` from the request URL or the `profile-web-page-url` header. |
| R6 | **`profile-title` / `announce` are base64** | low | `encode_title()`; decode before use, and omit rather than emit the encoded form |
| R7 | Live polling needs a path suffix | medium | Deferred. Not an adapter problem — a runtime one, and it is the only item that would re-baseline the 15 artifacts. |

### What this audit does NOT establish

- **No adapter was written, and none should be until this is reviewed.**
- The source was **read, not executed** — no payload was captured from a running panel. A
  recorded fixture is the first task of Phase 3B.
- The mapping in §4 is derived from **source**, not from an observed response.

---

## 7. Verdict

**PasarGuard is compatible, and the mapping is honest.**

The strongest result is §2: PasarGuard's own `subscription-userinfo` header reports
`upload=0; download=used_traffic`, and Row's model computes `used = download + upload`. The two
agree **by construction** — `used = used_traffic` exactly — so the combined-only UI needs no
fabricated split. The Phase 0 audit reached the same conclusion from the header contract; this
audit confirms it from the source that writes the header.

Two things must be decided before an adapter is written, and neither is an adapter decision:

1. **`on_hold`** — a third state with no slot in Row's `expire` encoding.
2. **Live polling** — needs a path suffix, which means a runtime change and a full re-freeze,
   or a shell-emitted `liveUrl`.

Everything else is DIRECT, ADAPTER, DERIVED, or a clean omission.

---

PASARGUARD ADAPTER AUDIT COMPLETE — NO ADAPTER CREATED — AWAITING REVIEW BEFORE PHASE 3B
