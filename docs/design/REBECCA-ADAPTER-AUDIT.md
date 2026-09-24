# Rebecca Adapter Audit

**Phase 4A — compatibility audit only. No adapter created. No project file modified.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree audited | `D:\. frank0live Main\3X-UI Template\Rebecca Panel\Rebecca-master` |
| Module | `github.com/rebeccapanel/rebecca`, **Go 1.25.0** (`go.mod`) |
| Toolchain present | **Go 1.26.7** — a build is *possible*, but was **not attempted** |
| Method | **static-read only** — source read directly, nothing executed |
| Companion | `PASARGUARD-ADAPTER-AUDIT.md` (the same methodology), `PANEL-COMPATIBILITY-AUDIT.md` §3 |
| Verdict | **B — partially compatible. One decision required, and one hard blocker for live polling. See §6.** |

---

## 1. Source identification

```
Rebecca-master/
  cmd/                          entry points
  internal/
    app/user/subscription.go     the subscription engine  ← the real source
    app/user/dto.go              the models               ← the field source
    app/api/subscriptions.go     the HTTP surface
    app/api/routes.go            route registration
    app/user/config_links.go     per-protocol config generation
  templates/
    subscription/index.html      ONE pongo2 template, 192 KB
    clash/  singbox/  v2ray/  mux/  home/  user_agent/
  dashboard/                     the admin UI (separate, not relevant)
```

### Template engine — **pongo2 v6.1.0**

`go.mod` declares `github.com/flosch/pongo2/v6 v6.1.0`, and `internal/app/user/subscription.go:3694`
calls `pongo2.FromString(...)` then `tpl.Execute(...)`.

**This matches the emitter this project already declared for Rebecca.** Phase 1's registry entry
reads `{ id: 'rebecca', emitter: 'pongo2' }` — chosen from the earlier panel audit and now
confirmed against source. `tools/transpile.mjs` already emits the `{% if %}` / `{% for %}` block
dialect pongo2 uses.

> **Note:** `internal/app/api/docs.go` is the only file using Go's `html/template`, for the API
> documentation page. It is unrelated to the subscription path.

### Executability

**Go 1.26.7 is on `PATH` and satisfies `go 1.25.0`, so Rebecca is the first panel in this
workstream that *could* be built and run.** It was **not** built or run in this phase — every
finding below is marked **static-read**, and a live capture remains a separate, unstarted step.
This is a meaningful difference from PasarGuard, whose supplied tree is believed not to compile.

---

## 2. Data flow

### Endpoints

| Route | Serves |
|---|---|
| `/sub/*` (`routes.go:77`) | the subscription path — **suffix-dispatched** |
| `/v1/client/subscribe/*` (`routes.go:226`) | the same handler under a client path |

The handler (`api/subscriptions.go`) switches on the trailing segment:

| Suffix | Result |
|---|---|
| *(none)* | the **HTML subscription page** (pongo2) |
| **`info`** | **JSON** — `writeJSON(w, 200, user)` (`subscriptions.go:43-49`) |
| `usage` | usage statistics |

**Rebecca has a real `/info` JSON endpoint**, exactly as PasarGuard does. This is the natural
adapter input and the natural live-polling target.

### Input — the model

`internal/app/user/dto.go:117`, `UserDetail`:

| Field | Go type | JSON |
|---|---|---|
| `Username` | `string` | `username` |
| `Status` | `string` | `status` |
| `UsedTraffic` | `int64` | `used_traffic` |
| `LifetimeUsedTraffic` | `int64` | `lifetime_used_traffic` |
| `Expire` | **`*int64`** | `expire` |
| `DataLimit` | `*int64` | `data_limit` |
| `DataLimitResetStrategy` | `string` | `data_limit_reset_strategy` |
| `OnlineAt` | **`*string`** | `online_at` |
| `OnHoldExpireDuration` | `*int64` | `on_hold_expire_duration` |
| `OnHoldTimeout` | `*string` | `on_hold_timeout` |
| `ServiceName` | `*string` | `service_name` |
| `KeySubscriptionURL` | `string` | `key_subscription_url` |
| `Subadress` | `string` | `subadress` |
| `CreatedAt` | `string` | `created_at` |
| `SubscriptionURL` / `SubscriptionURLs` | | `subscription_url` / `subscription_urls` |
| `IPLimit` | `int64` | `ip_limit` |
| `Note`, `TelegramID`, `ContactNumber`, `SubLastUserAgent` | | |
| `Proxies`, `Inbound(s)`, `ExcludedInbounds` | maps | |

### Input — the headers

`internal/app/user/subscription.go:1120`, `subscriptionHeaders`:

```go
"content-disposition":     `attachment; filename="` + user.Username + `"`
"profile-web-page-url":    req.URL
"support-url":             strings.TrimSpace(settings.SubscriptionSupportURL)
"profile-title":           "base64:" + base64.StdEncoding.EncodeToString(...)
"profile-update-interval": firstNonEmptyString(settings.SubscriptionUpdateInterval, "12")
"subscription-userinfo":   fmt.Sprintf("upload=0; download=%d; total=%d; expire=%d",
                              user.UsedTraffic, int64OrZero(user.DataLimit), int64OrZero(user.Expire))
```

**Six headers. There is no `announce` and no `announce-url`** — a `grep -rn announce` across
`internal/**/*.go` returns **nothing at all**. Rebecca has no announce concept anywhere: not in
settings, not in headers, not in the render context. It is a clean **UNSUPPORTED**, and the UI
must degrade by omission. This confirms `PANEL-COMPATIBILITY-AUDIT.md` §0 finding 7.

### Output — the template context

`internal/app/user/subscription.go:3742`, `subscriptionTemplateContext`:

```go
"user": { username, status, status_class, data_limit, used_traffic,
          data_limit_reset_strategy, expire, created_at, online_at, links,
          subscription_url, subscription_urls, service_id, service_name, placeholder }
"links", "links_text", "usage_url", "support_url", "token",
"current_timestamp": time.Now().UTC().Unix(),
"remaining_days":    subscriptionRemainingDaysInt(user.Expire),
+ vpn keys (openvpn, wireguard, amneziawg, l2tp, pptp, ikev2, anyconnect, sstp, gre)
```

Two things the context does that matter:

- **`expire` and `data_limit` are emitted only when positive.** `data_limit` is set only when
  `*DataLimit > 0`; `expire` only when `*Expire > 0`. Otherwise the key is **absent** (`nil`),
  not `0`. A `<= 0` expire is therefore indistinguishable from "never".
- **`current_timestamp` is `time.Now().UTC().Unix()` — seconds.** Confirms the whole time model
  is seconds-based.

The template itself uses **26 `if` / 26 `endif`, 8 `else`, 6 `for` / 6 `endfor`** — balanced, and
all in the pongo2 dialect.

---

## 3. Mapping to Row's normalized contract

Against `tools/contract.mjs` `MODEL_FIELDS`.

| Row Field | Rebecca Source | Type |
|---|---|---|
| `enabled` | `status != "disabled"` | **ADAPTER** |
| `online` | `online_at` within a window | **ADAPTER** |
| `download` | `used_traffic` (via the header's `download=`) | **DIRECT** |
| `upload` | `0` | **CONSTANT** |
| `used` | `used_traffic` | **DIRECT** |
| `total` | `data_limit ?? 0` | **ADAPTER** |
| `expire` | `expire` (**already epoch seconds**) | **DIRECT** |
| `lastOnline` | `online_at` → epoch **ms** | **ADAPTER** |
| `subUrl` | `subscription_url` **or** `profile-web-page-url` | **DIRECT** |
| `subJsonUrl` | — | **MISSING** (omit the button) |
| `subClashUrl` | `path + "/clash-meta"` | **DERIVED** |
| `title` | `profile-title` header (base64, prefixed) | **DERIVED** |
| `supportUrl` | `support-url` header | **DIRECT** |
| `announce` | — | **MISSING** (Rebecca has no concept) |
| `jalali` | — | **CONSTANT `false`** |
| `links` | `user.links` / `links` | **DIRECT** |

**Eleven of the sixteen are DIRECT, DERIVED or CONSTANT.** Only three need real adapter logic
(`enabled`, `online`, `lastOnline`), and two are cleanly MISSING.

### The traffic mapping is honest, exactly as with PasarGuard

Rebecca's own header says:

```
upload=0; download=<used_traffic>; total=<data_limit>; expire=<expire>
```

Row computes `used = download + upload`, so `used = used_traffic` **exactly**. The combined
counter is reported the way the panel reports it, the UI shows only the combined figure, and
**no split is fabricated.** This is byte-for-byte the same conclusion as PasarGuard — the two
panels write the identical header format.

---

## 4. Dangerous differences

### 4.1 Time fields — **the sharpest difference in this audit**

| | PasarGuard | **Rebecca** |
|---|---|---|
| `expire` type | datetime (ISO, `Z`) | **`*int64`** |
| `expire` unit | seconds (after conversion) | **already seconds** |
| `online_at` type | datetime (ISO, `Z`) | **`*string`** |
| `online_at` format | `2026-09-18T11:58:30Z` | **`2026-07-01 10:20:30`** |

**`expire` needs NO conversion on Rebecca** — `config_links.go:610` does
`time.Unix(*item.Expire, 0)` and `lifecycle.go:121` compares `*row.Expire <= now.Unix()`, so it
is unambiguously epoch **seconds**. Row wants seconds. **DIRECT.**

**`online_at` is the hazard.** Its format is a **naive, space-separated** `YYYY-MM-DD HH:MM:SS`
with **no `Z` and no offset** — confirmed by the test fixture at `subscription_test.go:2227`
(`onlineAt := "2026-07-01 10:20:30"`).

Three consequences, in order of severity:

1. **`Date.parse("2026-07-01 10:20:30")` is interpreted as LOCAL time by V8**, whereas Rebecca
   writes it from a UTC-based service (`time.Now().UTC()` appears throughout). A reader in
   `GMT+3:30` would get an instant **3.5 hours wrong** — silently, because the result is still a
   finite positive number.
2. **The PasarGuard adapter's `Date.parse` call would therefore be WRONG for Rebecca**, even
   though the two panels look alike. This is exactly the kind of near-miss that a "they're the
   same" assumption produces.
3. The fix is explicit: append `Z` (or `+00:00`) before parsing, or parse the components and
   build the instant with `Date.UTC`.

**A test with a known instant is mandatory**, in the same shape as PasarGuard's
`19-expire-seconds-vs-ms` guard — and it must assert the **timezone**, not just the unit.

### 4.2 Traffic fields

| Check | Rebecca | Verdict |
|---|---|---|
| upload/download split | `upload=0; download=used_traffic` | **no split — same as PasarGuard** |
| combined usage | `used_traffic` | DIRECT |
| unlimited | `DataLimit == nil` **or** `<= 0` | → Row `total = 0` |
| lifetime counter | `lifetime_used_traffic` present | not in Row's model — ignore |

### 4.3 Online status

- Rebecca stores `online_at` as a **string**, nullable.
- No heartbeat window is published in the source; the template only branches on presence.
- **`online` must therefore be derived from a window this adapter chooses**, exactly as
  PasarGuard's 120 s. The number is an adapter decision, not a panel fact, and should be stated
  as such in the source.
- `nil` → `online` false, `lastOnline` null. Never synthesised.

### 4.4 Encoded fields

| Field | Encoding | Note |
|---|---|---|
| `profile-title` | **`base64:` + StdEncoding** | **same prefix convention as PasarGuard** — a test must strip it |
| `support-url` | plain, trimmed | |
| `profile-web-page-url` | plain URL | |
| `content-disposition` | contains the username | **not** in Row's model |
| `announce` | **absent entirely** | |

**No URL encoding or HTML escaping is applied to the header values.** Escaping is the template
engine's job on the page side, and the shell must keep doing it.

---

## 5. Template engine audit

| Question | Answer |
|---|---|
| Go template? | **No** — only `docs.go` uses it, for the API docs page |
| Jinja2? | No |
| **pongo2?** | **Yes — `github.com/flosch/pongo2/v6 v6.1.0`** |
| Custom engine? | No, but **custom filters are registered at runtime** |

### Compatibility with the current transpiler

**The dialect matches.** `tools/transpile.mjs` already emits `{% if %}` / `{% else %}` /
`{% elif %}` / `{% endif %}` / `{% for %}` / `{% endfor %}` — the exact family Rebecca's
template uses. Phase 1's registry already names `pongo2` as Rebecca's emitter, so **no registry
change is needed to declare it.**

### Differences the transpiler does not currently handle

| # | Difference | Impact |
|---|---|---|
| D1 | **`{% if not user.data_limit %}`** — a `not` operator | the Go vocabulary has no `not`; the transpiler must map it or the shell must be rewritten |
| D2 | **`{% if user.status == 'active' or ... %}`** — `or`, and string comparison | Go's `if eq` form does not express this; needs a mapping |
| D3 | **Filters**: `bytesformat`, `datetime`, plus runtime-registered filters | **not expressible in the current 8-form vocabulary at all** |
| D4 | **`{{ item.Body }}`-style capitalised fields** over a `for` loop | the current emitter maps `{{ . }}` to a loop var, not field access |
| D5 | **192 KB template** vs the 3X-UI shells' ~11 KB | a much larger surface to transpile |

**D3 is the real finding.** Rebecca's template depends on filters that are **registered in Go at
runtime** (`registerSubscriptionTemplateFilters`, `subscriptionBytesFilter`,
`subscriptionDatetimeFilter`, `bytesformat`, `datetime`). A transpiled shell cannot reproduce a
Go-registered filter — so **the Rebecca shell cannot be a mechanical transpile of Rebecca's own
template.** It must be a shell *we* author, in the pongo2 dialect, with no custom filters.

That is not a blocker — it is the same conclusion Phase 1 reached for 3X-UI: the shell is ours,
and the panel's own template is a reference, not a source.

---

## 6. Compatibility verdict

### **B — Rebecca is partially compatible. Decisions required before adapter.**

**Why not A.** Three items are unresolved and none is mechanical:

1. **`online_at` timezone.** The format is naive and space-separated; parsing it without an
   explicit UTC assumption yields a silently wrong instant. This needs a decision (treat as UTC)
   **and** a test that pins the timezone, not just the unit.
2. **`on_hold`.** Rebecca has a real `on_hold` state — and, notably, **Rebecca's own
   `subscriptionStatusClass` maps `on_hold` to `"active"`** (`subscription.go:3820`). The
   PasarGuard adapter **throws** on `on_hold`. Applying the same rule to Rebecca would refuse a
   state the panel itself renders as active. This is the same product decision still open from
   Phase 3C, and Rebecca makes it sharper rather than easier.
3. **Five statuses, not three.** `active`, `limited`, `expired`, `disabled`, `on_hold`. The
   adapter must decide how `limited` and `expired` fold into Row's `enabled`/`online` pair —
   PasarGuard never presented this.

**Why not C.** Nothing here requires an architecture change. The island, the contract, the
adapter interface, the registry and the emitter family all fit as they are.

### What is already proven compatible

- **The engine matches** — pongo2, already declared in the registry.
- **The traffic mapping is identical to PasarGuard's** and honest by construction.
- **`expire` is DIRECT** — no conversion at all, which is *simpler* than PasarGuard.
- **An `/info` JSON endpoint exists**, so live polling has the same shape of solution.
- **Eleven of sixteen fields** are DIRECT, DERIVED or CONSTANT.

### The one hard blocker, stated plainly

**Live polling still cannot be delivered without a runtime change.** Rebecca serves `/info` on a
**path suffix**, exactly like PasarGuard and unlike 3X-UI's `?format=info`. The runtime's
`live.js:77` builds a query parameter. Reaching Rebecca's endpoint requires either editing
`src/scripts/live.js` — which re-baselines **all 15 artifacts** against `pulsenova`'s **258 B**
of headroom — or a shell-emitted `liveUrl`. **This is a design-workstream decision, not an
adapter decision, and it is unchanged by Rebecca.**

---

## 7. Safety checks

| Check | Result |
|---|---|
| `git status` | the audit file plus the pre-existing uncommitted Phase 1–3C work; **no new entry outside the audit** |
| `src/` unchanged | **0** |
| `template/` unchanged | **0** |
| `tools/adapters/` unchanged | **0** — still only `3xui.mjs` and `pasarguard.mjs` |
| `installer/`, `release/`, `docs/`, `VERSION`, `CHANGELOG.md`, `package.json` | **0** |
| Artifacts byte-identical | **15 compared, 0 differing** |
| `git diff --check` | **clean** |
| Committed | **no** |

---

## 8. What this audit does NOT establish

- **No adapter was written, and none should be until §6 is decided.**
- **The source was read, not executed.** Go 1.26.7 is available and the module *could* be built,
  but it was not. Every finding is **static-read**, and no payload was captured from a running
  panel.
- **No Rebecca fixture exists.** The PasarGuard fixture format (`tests/fixtures/panels/`) is
  designed to be shared, but no Rebecca case has been written.
- The mapping in §3 is derived from source, not from an observed response.

---

REBECCA ADAPTER AUDIT COMPLETE — VERDICT B: PARTIALLY COMPATIBLE, DECISIONS REQUIRED — NO ADAPTER CREATED
