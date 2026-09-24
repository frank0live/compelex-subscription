# Live Polling Contract Audit

**Phase 6A — audit only. No adapter, runtime, source, template or installer change.**

| | |
|---|---|
| Date | 2026-09-20 |
| Tree | branch `feat/v1.2-multitemplate`, HEAD `52f8fc0`, `VERSION` 1.1.0 |
| Scope | how live polling works today, and the safest multi-panel extension path |
| Method | source read directly; the failure mode reproduced by executing the runtime's own `normalize()` |
| Verdict | **Two independent problems, not one. `adapter.livePath()` solves neither on its own. Recommend deferring. See §7.** |

---

## 1. Current architecture

### The poller

`src/scripts/live.js` — 4,385 bytes, inlined into all 15 artifacts via `APP` (`tools/build.mjs:26`).

| part | behaviour |
|---|---|
| **Endpoint** | `win.fetch(win.location.pathname + '?format=info', init)` — **line 77**, hard-coded |
| Request | `credentials: 'omit'`, `cache: 'no-store'`, `Accept: application/json`, 8 s abort |
| Cadence | 15 s while the page is visible and the state is `active`, 60 s idle; jittered ±10 % |
| Concurrency | one request at a time (`inFlight`), and a monotonic `ticket` so a stale response cannot overwrite a newer one |
| Visibility | pauses on `visibilitychange`; refreshes at once if the figures are already a full cycle old |
| Backoff | 15/30/60/120 s, halting after **6** failures |
| On failure | the **server-rendered figures stand**; the page is never blanked |

### The response contract

```js
function looksLikeInfo(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return 'enabled' in value || 'totalByte' in value || 'expire' in value;
}
```

The payload is then handed to `normalize()` (`src/scripts/model.js`), which reads the **raw island
names** — `downloadByte`, `uploadByte`, `totalByte`, `isOnline`, `subTitle`, `subSupportUrl`.

### How the page is updated

`src/scripts/main.js:476` — `createPoller({ ... onData })`:

```js
onData: function (data, at) {
  const next = normalize(data);
  const calendar = next.jalali !== model.jalali;
  model = next;
  if (calendar) i18n = createI18n(catalogues, lang, model.jalali);
  lastAt = at;
  stopped = false;
  setAttr(el.updatedSlot, 'data-stale', null);
  paint(at);
}
```

So the polled payload is **normalized directly** — no adapter, no per-panel step. The runtime
assumes the endpoint already speaks the raw island shape.

### What the endpoint actually returns

`tools/fixtures/serve.go:86` `writeInfo` marshals the fixture map, which is built by `data.go`
`base()` and carries exactly the raw island keys: `enabled`, `isOnline`, `downloadByte`,
`uploadByte`, `totalByte`, `expire`, `lastOnline`, `subUrl`, `subTitle`, `subSupportUrl`, …

**3X-UI's `?format=info` returns the raw island shape.** That is why `normalize()` works on it
directly, and it is the assumption the whole live path is built on.

---

## 2. Panel comparison

| | 3X-UI | PasarGuard | Rebecca |
|---|---|---|---|
| live endpoint | `pathname + '?format=info'` — **query parameter** | `pathname + '/info'` — **path suffix** | `pathname + '/info'` — **path suffix** |
| payload shape | **raw island** (`totalByte`, `isOnline`, `subTitle`) | **panel-native** (`used_traffic`, `data_limit`, `expire` as ISO datetime, `online_at`, `status`) | **panel-native** (`used_traffic`, `data_limit`, `expire` as int64 seconds, `online_at` as a zoneless string, `status`) |
| usable by `normalize()` as-is | **yes** | **no** | **no** |
| `adapter.livePath()` exists | yes (`+ '?format=info'`) | yes (`+ '/info'`) | yes (`+ '/info'`) |
| `adapter.livePath()` is called by anything | **no** | **no** | **no** |

**The two new panels differ from 3X-UI in TWO ways, not one.** The endpoint *and* the payload
shape. This is the finding that decides the phase.

---

## 3. The failure mode — and why it is worse than it looks

`looksLikeInfo` passes on a PasarGuard payload, because **`expire` is present** — as an ISO
datetime string. The guard is a key-presence check, not a shape check, so it cannot tell the two
vocabularies apart.

Executed against the real fixture, using the runtime's own `normalize()`:

```
looksLikeInfo(pgPayload)          -> true      (expire is present)
normalize(pgPayload) ->
    enabled     false
    online      false
    download    null
    upload      null
    used        null
    total       null
    expire      null
    lastOnline  null
    title       ""
```

> **The page would silently flip to disabled, offline, and unknown traffic — with no halt, no
> error, and no `unsupported` state.** The poller would keep running, consider itself healthy,
> and repaint a wrong page every 15 seconds. `normalize()` coerces rather than throwing, so
> nothing catches it.

This is materially worse than the "endpoint not found" case, which halts cleanly via
`halt('unsupported')`. **A wrong answer that looks like a right one is the failure to guard
against**, and today nothing guards it.

---

## 4. The four questions

### 4.1 Can `adapter.livePath()` solve this without runtime modification?

**No — and for two separate reasons.**

1. **Nothing calls it.** `live.js:77` hard-codes the path. `livePath()` is a pure function with no
   caller; it cannot reach the browser without a runtime change.
2. **Even if it were called, the payload is still wrong.** `onData` hands the response straight to
   `normalize()`. A PasarGuard response would produce the all-null model above. Fixing the
   endpoint without fixing the shape makes the page *silently wrong* instead of merely stale.

### 4.2 Does the runtime need a minimal abstraction?

**Yes, and it needs two hooks, not one:**

| hook | what it must do |
|---|---|
| **endpoint** | resolve the URL instead of hard-coding `?format=info` |
| **payload → island** | transform a panel-native payload into the raw island shape before `normalize()` |

The second is the expensive one. The transform is **per-panel**, so it cannot be a single generic
function — and putting three panels' transforms in `live.js` inlines all three into all 15
artifacts.

### 4.3 Would changing the runtime affect the 15 frozen artifacts?

**Yes — all 15, and the ceiling is the binding constraint.**

`live.js` is in `APP`, so it is inlined into every artifact. Any byte added to it is added to all
15. Measured headroom against the **204,800 B** ceiling:

| template | bytes | headroom |
|---|---|---|
| **pulsenova** | 204,542 | **258 B** |
| editorial | 204,123 | 677 B |
| signature | 203,954 | 846 B |
| arcadenova | 203,585 | 1,215 B |

**`pulsenova` has 258 bytes of headroom.** A live-polling change must therefore fit in **258 B**,
or the artifacts must be trimmed first — and a per-panel payload transform is unlikely to fit in
that budget alongside an endpoint hook.

### 4.4 What exact files would need modification?

| file | change | drift |
|---|---|---|
| `src/scripts/live.js` | endpoint resolution + payload transform | **all 15 artifacts re-baseline** |
| `src/scripts/main.js` | pass the adapter/panel identity into `createPoller` | **all 15 artifacts re-baseline** |
| `src/templates/*/layout.html` | emit the live endpoint (15 files) | **15 artifacts re-baseline** |
| `tests/build.test.mjs` | new `FROZEN_ARTIFACTS` rows | bookkeeping |

**Every path re-baselines the catalogue.** There is no zero-drift route through the runtime.

---

## 5. Security considerations

| # | Concern | Current handling | Gap |
|---|---|---|---|
| S1 | **Invalid JSON** | `res.json()` throws `SyntaxError` → `halt('unsupported')` | handled |
| S2 | **Wrong shape, right keys** | `looksLikeInfo` is a key-presence check | **NOT handled** — §3 is exactly this |
| S3 | **Missing fields** | `normalize()` coerces to `null`/`false`/`''` | **silent** — a partially-correct payload degrades the page without a signal |
| S4 | **Unexpected panel response** | an HTML error page fails `looksLikeInfo` → halt | handled |
| S5 | **Endpoint mismatch** | 404/400/403 → `halt('unsupported')`; other errors retry | handled |
| S6 | **Redirect to another host** | endpoint built from `location.pathname`, never from the model's `subUrl` | handled — deliberate, and documented in the file header |
| S7 | **Credential leakage** | `credentials: 'omit'` | handled |
| S8 | **Caching** | `cache: 'no-store'` | handled |
| S9 | **Response race** | monotonic `ticket` | handled |

**S2 and S3 are the live gaps, and both are created by the multi-panel work rather than
pre-existing.** 3X-UI alone could not trigger them, because its endpoint is the only thing the
poller ever talked to.

**A minimal mitigation, independent of any endpoint work:** strengthen `looksLikeInfo` to require
a key that only the island shape has — `totalByte` or `downloadByte` — rather than accepting
`expire`, which every panel sends in a different type. That would convert S2 from *silently wrong*
into *halt('unsupported')*, which is the honest outcome. It still costs bytes in all 15.

---

## 6. Options considered

| | Option | Endpoint | Shape | Drift | Verdict |
|---|---|---|---|---|---|
| **A** | **Defer live polling for the new panels** | n/a | n/a | **zero** | **Recommended for this phase** |
| B | Runtime reads a shell-emitted `liveUrl` | solved | **unsolved** | all 15 | insufficient alone |
| C | Runtime + per-panel transform | solved | solved | all 15, and the transform likely exceeds 258 B | needs trimming first |
| D | Reverse proxy reshapes `/{token}/info` → island | solved | solved | **zero** | viable, adds a moving part |
| E | Patch each panel to serve the island shape | solved | solved | zero | out of our control; two upstream projects |

**B is not a solution** — it addresses half the problem, and the half it leaves is the dangerous
one (§3). It is worth stating plainly because it is the option the earlier architecture plans
named, and it was scoped before the payload-shape problem was known.

**D is the only zero-drift option that solves both halves.** It is not free: it adds a component
to the deployment, it sees the subscription token in its logs, and it must not cache.

---

## 7. Recommendation

### Defer live polling. Do not touch the runtime in this phase.

**Why:**

1. **The server-rendered figures are already correct.** Polling only *refreshes* them. A page
   without polling is complete, not degraded — this was the Phase 1 finding and it still holds.
2. **The cost is a full re-freeze of the catalogue** against **258 B** of headroom, and the
   change needs two hooks, not one.
3. **The payload-shape problem has no in-runtime cheap fix.** Three per-panel transforms inlined
   into 15 artifacts is the wrong shape of change for a 258 B budget.
4. **Deferring is reversible at zero cost.** Doing it now commits the catalogue to a re-baseline
   before the design is settled.

### If it is pursued, the order that minimises risk

1. **First, and independently:** tighten `looksLikeInfo` so a foreign payload **halts** instead of
   being normalized. This is a correctness fix, not a feature — today the poller can silently
   publish wrong figures. It is worth its bytes even if polling is never extended.
2. **Then** choose between **C** (runtime + transform, after trimming ~1 KB from `pulsenova`) and
   **D** (reverse proxy, zero drift).
3. **Do not** ship the endpoint hook alone. That is option **B**, and it makes the page silently
   wrong rather than stale.

### What this phase does NOT decide

- Whether live polling is wanted for the new panels at all — a product question.
- Which of C or D to take — that needs the deployment model settled first.
- Anything about the installer.

---

## 8. Verification

| check | result |
|---|---|
| `git diff --check` | **clean** |
| Only allowed new file | **`LIVE-POLLING-AUDIT.md`** |
| `src/` · `template/` · `installer/` · `release/` · `docs/` · `VERSION` · `CHANGELOG.md` · `package.json` | **0 changes** |
| Artifacts | **15 compared, 0 differing — byte-identical** |
| Committed | **no** |

---

LIVE POLLING AUDIT COMPLETE — TWO PROBLEMS, NOT ONE — RECOMMEND DEFER — AWAITING APPROVAL
