# Installer Panel Adapter — 3X-UI

**P5A — the first real panel adapter. It is implemented, and it is the shipping implementation.**

| | |
|---|---|
| Date | 2026-09-23 |
| Tree | `feat/v1.2-multitemplate`, baseline HEAD `c53d337` |
| Adapter | `installer/panels/3xui.sh` |
| Registered by | `installer/panels/index.sh` (registry + dispatch + the implementation seam) |
| Reached through | the frozen P3 public verbs (`rt_panel_*`) only |
| Driven by | `rt_transaction_run` (P4) |
| Validated by | `tests/installer-panel-3xui.test.mjs` — **fixture tests, not a real panel** |
| Not implemented | PasarGuard, Rebecca |

> **Validation boundary, stated first.** Everything below is verified against fixture databases and
> doubled external binaries in the OS temp directory. **No claim here is a claim about a running
> 3X-UI panel.** Real-server validation is a separate, still-outstanding gate.

---

## 1. What 3X-UI activation actually is

One settings row:

```
settings.subThemeDir = RT_ROOT
```

3X-UI renders its subscription page from a directory, and `subThemeDir` names it. Row-Template owns
its own external root, generates `sub.html` into it, and points the panel at it. **The panel-side act
is the selection write and nothing else.**

The key is the constant `subThemeDir`. `subTemplate` and `subTemplateDir` do not exist upstream and
appear nowhere in this project.

---

## 2. Detection

**Read-only, and corroborated.** The frozen P3 contract pins the rule and it is implemented exactly
as written:

> Two independent signals must agree before this returns SUCCESS. Where they disagree, or where only
> one is available, the answer is FAILURE rather than a guess.

Three independent signals, none sufficient alone:

| signal | evidence |
|---|---|
| A | the panel binary is present and executable (a known path, or `x-ui` on `PATH`) |
| B | the panel's systemd unit is registered |
| C | a panel database exists **and begins with the SQLite file magic** |

C is deliberately stronger than "a file with the right name exists": the magic is positive evidence
that the file is a SQLite database, so a leftover or empty file cannot corroborate anything.

| signals | result |
|---|---|
| 2 or 3 | `0 SUCCESS` |
| exactly 1 | `1 FAILURE` — not enough to be sure |
| 0 | `3 NOT_APPLICABLE` — the panel is not on this host |

The distinction the codes carry, and why each is the honest answer:

- **not present** → `NOT_APPLICABLE`. Nothing was found, so the panel is not here.
- **ambiguous / insufficient evidence** → `FAILURE`. Something is here, but not enough to act on.
  A wrong identification would stage against, write to, and then **restore stale state onto** a panel
  that was never there, so a guess is worse than a refusal.
- **detection impossible in this environment** → `FAILURE`. Detection runs no query and needs no
  credential, so there is no third answer here; `UNAVAILABLE` is reserved for the verbs that need
  the database.

Detection never writes: no file, no database, no service call, no Row-Template state.

---

## 3. Capability set

```
db_activation
selection_read
selection_write
service_control
static_verify
```

Five tokens, `LC_ALL=C` order, every one backed by code, and all drawn from the frozen P3
vocabulary — **no token was added**.

### Why `file_placement` is absent

`file_placement` is defined by the frozen contract as *"installs a template file into the panel's own
tree"*. This adapter places **no file** into the panel's own tree: Row-Template generates `sub.html`
into its **own** root and the panel is pointed at that directory. Declaring the capability would
describe filesystem behaviour that does not exist.

P4.1 removed the mechanism leak that made this impossible to express: the engine requires
`static_verify` universally and **at least one** apply mechanism, so `selection_write` satisfies the
apply requirement on its own. See `INSTALLER-TRANSACTION-DESIGN.md` §11.

### Why `live_verify` is absent

Live verification would mean fetching the subscription the panel actually serves, which needs a
client subscription id (a secret) and a reachable port, and is unreliable when no client exists.
Nothing credential-free and reliable is available in this build, so the capability is **not declared**
and `rt_panel_verify 3xui live` returns `2 UNAVAILABLE`. P4 permits a transaction to commit on a
mandatory static pass when live verification is unavailable.

---

## 4. Backup semantics

`rt_panel_3xui_backup_state` fills `RT_PANEL_STAGE` through the P2 writer `rt_backup_panel_write` —
the only door into a snapshot. It composes no snapshot file itself and adds no field to the format.

| recorded | value |
|---|---|
| `selection.state` | `absent` \| `empty` \| `present` |
| `selection` | the raw value, written **only** when the state is `present` |
| `meta` | `mechanism=db`, `was_running=0\|1` |
| `files` | **empty** |

The three selection states are not decoration — they are three different restore actions:

| state | meaning | restore does |
|---|---|---|
| `absent` | the row did not exist | **remove** the row |
| `empty` | the row existed with an empty value | ensure the row exists, empty |
| `present` | the row held a value | write that exact value |

`absent` and `empty` are never collapsed. A NULL value and an empty string both land in `empty`,
because the frozen P2 format has no third representation and "the row existed but held nothing" is
the honest reading of both.

**A value that cannot be recorded exactly is refused.** `selection` holds the raw value with no
terminator, so an embedded newline would read back as a *different* value; a value containing one
fails the capture rather than being normalised or truncated.

### Why the `files` list is empty

`files` names the files Row-Template placed **inside the panel's managed root**. This adapter places
none. `RT_ROOT`, `sub.html` and `dist/template.html` are Row-Template's **own install state**, not
panel-side placements, and recording them would make a later rollback try to delete files it never
placed.

The list is still **written** — an absent file is indistinguishable from an incomplete snapshot and
the reader refuses it, so the empty record is what keeps "we placed nothing" knowable.

---

## 5. `subThemeDir` mutation

`rt_panel_3xui_install_template PANEL SOURCE` applies the selection:

```
settings.subThemeDir = RT_ROOT
```

It is **not** file placement. Before anything is written:

- `SOURCE` must be a **regular file** — a symlink is refused outright, because a symlinked
  "template" is a way to point the panel at something that is not Row-Template's artifact;
- `SOURCE` must resolve **strictly inside `RT_ROOT`** — the panel's selection must name the directory
  Row-Template serves from, so a SOURCE outside it would make the request and the mechanism disagree.

The write then reuses `rt_subtheme_set_sqlite`, the proven mechanism.

---

## 6. SQLite safety

| rule | how it is met |
|---|---|
| only the fixed key is touched | the literal `subThemeDir` appears in every statement; the key is never derived from input |
| no arbitrary identifiers | no identifier is built at runtime at all |
| the value is data | one narrow escaping helper: `'` → `''`, applied to values placed between single quotes |
| no `eval` | nothing is eval'd or sourced; SQLite output is data like any file's contents |
| no database replacement | the live database is opened in place, never copied or recreated |
| unrelated rows survive | `UPDATE … WHERE key='subThemeDir'` / `INSERT` / `DELETE … WHERE key='subThemeDir'` — the `WHERE` clause is what makes "and nothing else" true |

Because the key has a non-unique index upstream, the row count decides between `UPDATE` and
`INSERT` rather than an `ON CONFLICT` clause that would need a unique constraint.

**Tested explicitly:** an apostrophe-bearing value round-trips verbatim, and a value such as
`x'; DROP TABLE settings; --` is stored **as data**, with the table left intact.

---

## 7. Service-state preservation

The panel can flush a stale in-memory value back over a database change, so the write is bracketed
by a service stop and start — **but only when the service was running.**

`was_running` is captured before mutation and the exact pre-transaction state is preserved:

| before | after activation | after restore |
|---|---|---|
| running | running | running |
| stopped | stopped | stopped |

**No known service unit means no service action.** Inventing a unit, or running a service command
against one this host does not have, would be a mutation nobody asked for. The legacy path behaves
the same way: it writes the setting without service control when no unit is known. A unit that was
never there is never started.

This was audited rather than assumed. The high-level setter records whether the service was active,
stops it **only** if it was, and restarts it **only** if it was — so it does not start a service that
was originally stopped. Had it done so, it would not have been suitable and the lower-level helpers
would have been used instead.

---

## 8. Verification

### Static — mandatory, and `0` or `1` only

The frozen contract documents no `UNAVAILABLE` for static, so **"could not verify" is `FAILURE`**,
not a third state. Returning `UNAVAILABLE` would invent a code the contract does not allow and invite
a caller to treat an unrun mandatory check as anything other than a failure.

All four checks must pass:

1. the intended artifact exists;
2. it passes the existing structural validation (`rt_validate_template`);
3. it still matches the checksum recorded at install time, when one was recorded;
4. `settings.subThemeDir` is readable **and equals `RT_ROOT` exactly**.

Existence alone is never proof: a truncated or replaced file exists too, which is why (2) and (3)
are both required.

### Live — `UNAVAILABLE`

No credential-free, reliable subscriber-side check exists in this build, so live verification returns
`UNAVAILABLE` and the capability is not declared. It is never claimed as a pass.

---

## 9. Restore semantics

`rt_panel_3xui_restore_state PANEL SNAPSHOT` fails closed on anything malformed. The engine validates
the snapshot before calling, but this adapter re-checks the panel record itself rather than relying
on that.

Refused, each for a reason:

| condition | why |
|---|---|
| `selection.state` outside `absent\|empty\|present` | the record is malformed |
| `meta` malformed | `mechanism` and `was_running` are what a restore follows |
| `mechanism` ≠ `db` | a different write path may not even address the same setting |
| `was_running` not `0\|1` | a restore must not guess whether to start the service |
| **`files` non-empty** | the record claims a panel-side placement this adapter can never make, so acting on it would delete files on the strength of a claim it knows to be impossible |
| `state=present` with an unreadable value | the value to restore is not there |

Then:

| state | action |
|---|---|
| `absent` | remove the `subThemeDir` rows — **only** those |
| `empty` | ensure the row exists with an empty value |
| `present` | write the exact recorded value |

Finally the service is returned to the recorded state.

**The adapter never invokes rollback.** It does not call the transaction engine, does not retry, and
does not chain a second recovery: P4 owns rollback sequencing and its exactly-once rule.

---

## 10. Uninstall

**Panel-side only.** The adapter removes the panel's selection when — and only when — it currently
names Row-Template's root:

- pointing at us → the `subThemeDir` rows are removed, nothing else is touched → `SUCCESS`
- pointing elsewhere → the selection is not ours, so it is left alone → `NOT_APPLICABLE`
- database unreadable → `UNAVAILABLE`, because ownership cannot be established and guessing would
  delete someone else's setting

It does **not** delete the Row-Template installation, does not recurse into `RT_ROOT`, and does not
broaden the legacy uninstall flow. Deleting the installation remains the user-facing uninstall's job.

---

## 11. Transaction integration

The adapter is reached only through the frozen P3 verbs, so P4 drives it without knowing which panel
it is:

```
rt_transaction_run 3xui SOURCE
  lock → detect → capabilities → capture → snapshot → MUTATE → static verify → live verify → commit
```

- `detect` → the corroboration rule above;
- `capabilities` → the five tokens, which satisfy the apply requirement through `selection_write`;
- `capture` → the stage record described in §4;
- `snapshot` → P2's `rt_backup_create v2`, untouched;
- `mutate` → the `subThemeDir` write;
- `static verify` → mandatory;
- `live verify` → skipped (the capability is not declared), or `UNAVAILABLE` if called directly;
- on any failure at or after the boundary → **one** rollback through `rt_panel_restore_state`.

**`transaction.sh` contains no panel name.** It branches on capabilities, never on identity, and the
adapter is registered in the registry rather than named in the engine.

The seam is wired in `index.sh`: `interface.sh` declares each public verb as a call to one internal
`rt_panel_impl_<verb>` and defines those as `UNAVAILABLE` stubs; `index.sh` fills them in with
one-line pass-throughs to `rt_panel_dispatch`. That is the restructuring P3 explicitly reserved for
P5 — the seven public names, signatures and return codes are untouched.

---

## 12. Unit / fixture validation boundary

**What the fixture tests do prove**

- the registry resolves `3xui` to the real adapter, and leaves the other two unimplemented;
- detection's corroboration rule, at every signal count, and that detection mutates nothing;
- the capability set exactly, including the two absences;
- capture: all three selection states, `was_running` both ways, `mechanism=db`, an empty `files`
  record, and that no unrelated database value reaches the stage;
- the write changes `subThemeDir` and **only** `subThemeDir`;
- apostrophes and SQL-injection-looking values remain data;
- service state is preserved in both directions, and no unit means no service action;
- static verification passes only for correct, intact state and fails on a wrong selection, a
  missing artifact and a corrupted one;
- restore for all three states, plus every refusal, plus service restoration;
- uninstall's ownership rule;
- the adapter adds no field to the P2 schema, and the engine stays panel-name-free.

**How the doubles are bounded.** This host has neither `sqlite3` nor `systemctl`, so both are
supplied as `PATH` shims. The `sqlite3` shim forwards to Python's **real** SQLite module, so the
fixture is a genuine database and the adapter's SQL is executed for real — real escaping, real
`UPDATE`/`DELETE` semantics, real unrelated-row preservation. It stands in for a missing *binary*,
not for SQLite. The `systemctl` shim reads and writes a state file, so service transitions are real
state changes the assertions inspect. Neither shim knows anything about 3X-UI or about the adapter.

**What they do not prove.** Anything about a real panel: whether a real `subThemeDir` write is picked
up by a running 3X-UI, whether the real service restart ordering behaves as assumed, whether the real
database is where this adapter looks, or whether the panel actually serves Row-Template's `sub.html`
afterwards.

---

## 13. Resolved in 1.3.0 — the rollback's post-restore check asked the wrong question

Found as a limitation during P5A, recorded rather than worked around, and **fixed in 1.3.0**. It is kept here
because the shape of the mistake is worth remembering: it was a real defect that had been documented as
deliberate conservative behaviour, and the test suite agreed with the documentation.

**What happened.** After a rollback, P4 called `rt_panel_verify PANEL static` as its "did the restore work?"
check. For 3X-UI that check asserts `settings.subThemeDir == RT_ROOT`. A rollback restores the **original**
selection, which is by design *not* `RT_ROOT`, so the check failed and the engine ended the transaction in
`FAILED` rather than `ROLLED_BACK` — even though the selection and the service had both been restored
correctly. Because the engine only claims `ROLLED_BACK` after that check passes, the defect looked like
caution rather than a bug.

**Why it was still a bug.** It was not merely "a less informative outcome". A caller that cannot distinguish
"rolled back cleanly" from "left half-mutated" cannot decide whether to retry, escalate, or do nothing — and
the reported `FAILED` was wrong about the panel's actual state. A rollback that worked was being reported as
a rollback that did not.

**The fix.** The obligation to verify a restore belongs to the layer that owns the state model, and
`interface.sh` already placed it there: a panel's `restore_state` returns SUCCESS only when the operation
completed **and its required verification passed**. So the fix does not add a P3 verb, does not touch the
frozen seven-name surface, and does not weaken static verification:

1. Each adapter's `restore_state` now **reads the state back** and compares it with the record, so its
   SUCCESS means what the contract always said it meant. `3xui` re-reads `subThemeDir` and, for `present`,
   its value; PasarGuard re-reads the `.env` block and the effective page value; Rebecca re-reads both
   subscription-settings columns.
2. P4's rollback no longer re-runs the forward check. It treats `restore_state`'s status as the rollback's
   verification — which is exactly the "restore question" the old design could not express — and still runs
   live verification afterwards as evidence, never as a gate.

Both directions are now tested: a rollback that lands is reported `ROLLED_BACK`, and a restore that reports
FAILURE **or UNAVAILABLE** is reported as a failed rollback. `tests/installer-transaction.test.mjs` asserts
the call sequence directly, so the forward check cannot be reintroduced after a rollback without failing.

---

## 14. Remaining real-server gate

Outstanding, and required before this adapter can be called release-ready:

1. **Real detection.** A host with an actual 3X-UI install: confirm the binary/unit/database signals
   resolve, and that the corroboration threshold does not refuse a legitimate panel.
2. **Real activation.** Run a transaction against a live panel; confirm `subThemeDir` changes, the
   service comes back in its original state, and the panel serves Row-Template's page.
3. **Real restore.** Roll a transaction back on a live panel and confirm the previous selection and
   service state return exactly.
4. **Real uninstall.** Confirm the selection is cleared and nothing else is disturbed.
5. **A stopped panel.** Confirm the stop/start bracketing is safe when the panel was not running.
6. **Live verification.** Establish whether any credential-free, reliable subscriber-side check
   exists; if it does, implement it and declare `live_verify`.

Until then, the honest statement is: **implemented, fixture-validated, not yet validated against a
running 3X-UI panel.**
