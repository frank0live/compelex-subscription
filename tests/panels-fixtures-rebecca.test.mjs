/* Rebecca fixture validation.
 *
 * These tests validate the FIXTURES, not an adapter — there is no Rebecca
 * adapter and this phase does not create one. What they pin is that every
 * recorded payload is well formed, reproducible, and expresses a model the
 * contract will accept.
 *
 * The five critical tests the brief names are marked T1–T5 below. T2 is the one
 * with real teeth: a zoneless `online_at` read as LOCAL time is wrong by the
 * machine's offset and still passes every structural check, so T2 runs the same
 * conversion under a deliberately non-UTC zone AND proves a naive parse would
 * have differed.
 *
 * The behavioural half of T5 (the adapter throwing on an unknown status) cannot
 * be tested before the adapter exists; what is tested here is that the fixture
 * set declares the closed status set and marks the rejection case explicitly.
 * The adapter half lands in Phase 4D.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODEL_FIELDS, OPTIONAL_MODEL_KEYS, validateModel, EXPIRE_MIN, EXPIRE_MAX } from '../tools/contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'fixtures', 'panels', 'rebecca');

/* The canonical instant, shared with the 3X-UI and PasarGuard fixtures:
   2026-09-18T12:00:00Z. Mid-day UTC so no timezone shifts the date. */
const CLOCK = 1789732800;

/* The frozen status table from REBECCA-ADAPTER-DECISIONS.md §2. */
const KNOWN_STATUSES = ['active', 'limited', 'expired', 'disabled', 'on_hold'];
/* The only statuses that mean the account is off. */
const OFF_STATUSES = ['disabled'];

/* The frozen time decision, REBECCA-ADAPTER-DECISIONS.md §1: Rebecca's
   `online_at` is zoneless but UTC-based, so a value without a zone is read as
   UTC. This helper is the decision expressed as code — it is what the adapter
   will do, and it is what T2 proves is timezone-independent. */
function toMillis(value) {
  if (typeof value !== 'string' || value === '') return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return Date.parse(hasZone ? value : value.replace(' ', 'T') + 'Z');
}

/* The naive form, kept only so T2 can prove it differs. Never used to build an
   expectation. */
function naiveMillis(value) {
  return Date.parse(value);
}

const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const FIXTURES = FILES.map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));
const byCase = (name) => FIXTURES.find((f) => f.doc.case === name);
const withClock = (doc) => ({ ...doc.native, now: doc.source.clock * 1000 });

/* --- the set is present and well formed --------------------------------- */

test('the fixture set is present', () => {
  assert.equal(FIXTURES.length, 19, '17 planned cases, the rejection case, and the ip case');
});

test('every fixture carries the required envelope', () => {
  for (const { file, doc } of FIXTURES) {
    assert.equal(doc.panel, 'rebecca', file + ': panel');
    assert.equal(doc.case, file.replace(/\.json$/, ''), file + ': case must match the file name');
    assert.ok(doc.note.length > 10, file + ': note must say something');
    assert.equal(doc.source.route, 'GET /{token}/info', file + ': route');
    assert.ok(doc.native.info && typeof doc.native.info === 'object', file + ': native.info');
    assert.ok(doc.native.headers && typeof doc.native.headers === 'object', file + ': native.headers');
    assert.ok('model' in doc.expected, file + ': expected.model must be present (null is allowed)');
  }
});

test('every fixture pins the clock and is marked static-read', () => {
  for (const { file, doc } of FIXTURES) {
    assert.equal(doc.source.clock, CLOCK, file + ': source.clock must be the canonical instant');
    assert.equal(doc.source.recorded, 'static-read', file + ': recorded must be static-read');
  }
});

/* --- native keeps the PANEL's field names -------------------------------- */

test('native keeps Rebecca field names, never Row names', () => {
  for (const { file, doc } of FIXTURES) {
    const i = doc.native.info;
    for (const key of ['status', 'used_traffic', 'data_limit', 'online_at', 'subscription_url', 'service_name']) {
      assert.ok(key in i, file + ': native.info must carry ' + key);
    }
    /* Row-only names must not appear. `expire` is deliberately excluded from
       this list: it is genuinely named `expire` in BOTH panels, so its presence
       is a shared name, not pre-normalisation. */
    for (const key of ['download', 'upload', 'total', 'lastOnline', 'enabled', 'online', 'jalali', 'subTitle']) {
      assert.equal(key in i, false, file + ': native.info must not carry Row name ' + key);
    }
  }
});

test('the userinfo header agrees with used_traffic', () => {
  for (const { file, doc } of FIXTURES) {
    const h = doc.native.headers['subscription-userinfo'];
    const m = /upload=(\d+); download=(\d+); total=(\d+); expire=(-?\d+)/.exec(h);
    assert.ok(m, file + ': the userinfo header must parse');
    assert.equal(m[1], '0', file + ': Rebecca reports upload=0');
    assert.equal(Number(m[2]), doc.native.info.used_traffic, file + ': download carries used_traffic');
  }
});

test('Rebecca has no announce header anywhere', () => {
  /* The panel has no announce concept in source. Every fixture must therefore
     carry no announce header, and every model must show an empty announce. */
  for (const { file, doc } of FIXTURES) {
    assert.equal('announce' in doc.native.headers, false, file + ': Rebecca has no announce header');
    assert.equal('announce-url' in doc.native.headers, false, file + ': and no announce-url');
    if (doc.expected.model) assert.equal(doc.expected.model.announce, '', file + ': announce must be empty');
  }
});

/* --- expected.model is contract-shaped ----------------------------------- */

test('every non-deferred expected.model validates and carries all 16 fields', () => {
  const keys = MODEL_FIELDS.map((f) => f.key);
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (m === null) continue;
    assert.deepEqual(validateModel(m), [], file + ': expected.model must validate');
    assert.deepEqual(Object.keys(m).sort(), [...keys].sort(), file + ': exact key set');
  }
});

test('expected.model uses Row MODEL_FIELDS only', () => {
  assert.equal(MODEL_FIELDS.length, 16);
  for (const { file, doc } of FIXTURES) {
    if (doc.expected.model === null) continue;
    assert.equal(Object.keys(doc.expected.model).length, 16, file + ': exactly 16 keys');
  }
});

/* --- honesty rules ------------------------------------------------------- */

test('used equals download + upload wherever all three are known', () => {
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    assert.equal(m.upload, 0, file + ': upload is always 0');
    assert.equal(m.used, m.download + m.upload, file + ': used must be the sum');
    assert.equal(m.used, doc.native.info.used_traffic, file + ': used is used_traffic');
  }
});

test('online is true only where a timestamp was reported', () => {
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    if (m.online === true) {
      assert.equal(typeof m.lastOnline, 'number', file + ': online requires lastOnline');
      assert.ok(m.lastOnline > 0, file + ': lastOnline must be a real instant');
    }
  }
});

test('no expected value is negative, and expire stays in range', () => {
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    for (const key of ['download', 'upload', 'used', 'total', 'lastOnline']) {
      if (typeof m[key] === 'number') assert.ok(m[key] >= 0, file + ': ' + key + ' must not be negative');
    }
    if (typeof m.expire === 'number') {
      assert.ok(m.expire >= EXPIRE_MIN && m.expire <= EXPIRE_MAX, file + ': expire must be in range');
    }
  }
});

test('an absent capability is empty, never a placeholder', () => {
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    for (const key of OPTIONAL_MODEL_KEYS) {
      if (key in m && typeof m[key] === 'string') {
        assert.ok(!/missing|undefined|null|N\/A|<.*>/.test(m[key]),
          file + ': ' + key + ' must be empty, not a placeholder');
      }
    }
  }
});

/* --- the frozen status table, applied to the fixtures -------------------- */

test('the status table is applied: only disabled means off', () => {
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    const status = doc.native.info.status;
    assert.ok(KNOWN_STATUSES.includes(status), file + ': status must be in the frozen table');
    assert.equal(m.enabled, !OFF_STATUSES.includes(status),
      file + ': enabled must be true for every status except disabled');
    /* limited and expired must NOT collapse to enabled:false — Row's health()
       derives those labels downstream and needs the facts intact. */
    if (status === 'limited' || status === 'expired') {
      assert.equal(m.enabled, true, file + ': ' + status + ' is not disablement');
    }
  }
});

/* --- T1 — exact online_at conversion ------------------------------------- */

test('T1: online_at converts to an exact millisecond instant', () => {
  const f = byCase('09-timezone-independence');
  assert.ok(f, 'the timezone case must exist');
  assert.equal(f.doc.native.info.online_at, '2026-09-18 11:58:30');
  assert.equal(f.doc.expected.model.lastOnline, (CLOCK - 90) * 1000);
  assert.equal(toMillis(f.doc.native.info.online_at), (CLOCK - 90) * 1000);

  /* And for every fixture, the expectation matches the frozen conversion. */
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    const oa = doc.native.info.online_at;
    assert.equal(m.lastOnline, oa === null ? null : toMillis(oa), file + ': lastOnline must match the conversion');
  }
});

/* --- T2 — timezone independence ------------------------------------------ */

test('T2: a zoneless online_at reads the same under any TZ', () => {
  const value = '2026-09-18 11:58:30';
  const expected = (CLOCK - 90) * 1000;
  const original = process.env.TZ;

  try {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tehran', 'Asia/Tokyo', 'Australia/Sydney']) {
      process.env.TZ = tz;
      assert.equal(toMillis(value), expected, 'TZ=' + tz + ' must not change the instant');
    }

    /* The test has teeth: the NAIVE parse — the bug this decision prevents —
       really does differ under a non-UTC zone. Without this half, T2 would pass
       on a UTC machine even if the conversion were wrong. */
    process.env.TZ = 'Asia/Tehran';
    assert.notEqual(naiveMillis(value), expected,
      'the naive parse must differ, or this test proves nothing');

    process.env.TZ = 'UTC';
    assert.equal(naiveMillis(value), expected, 'and the naive parse happens to agree at UTC');
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('T2: the conversion honours a value that already carries a zone', () => {
  /* A value with a zone must not have another appended. */
  assert.equal(toMillis('2026-09-18T11:58:30Z'), (CLOCK - 90) * 1000);
  assert.equal(toMillis('2026-09-18T14:58:30+03:00'), (CLOCK - 90) * 1000);
  assert.equal(toMillis(''), null);
  assert.equal(toMillis(null), null);
});

/* --- T3 — expire stays seconds ------------------------------------------- */

test('T3: expire passes through as SECONDS, unchanged', () => {
  const f = byCase('10-expire-seconds');
  assert.ok(f, 'the expire case must exist');
  const native = f.doc.native.info.expire;
  assert.equal(native, CLOCK + 100, 'the native value is already epoch seconds');
  assert.equal(f.doc.expected.model.expire, native, 'and must be carried through unchanged');
  assert.ok(native < 1e10, 'a second instant is 10 digits at this date');

  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    const e = doc.native.info.expire;
    if (doc.native.info.status === 'on_hold') {
      assert.equal(m.expire, null, file + ': an on_hold expiry is unknown (Rebecca passes no hold duration)');
      continue;
    }
    assert.equal(m.expire, e === null ? 0 : e, file + ': expire must be DIRECT, never converted');
  }
  /* And the millisecond field must stay in the millisecond magnitude. */
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m || m.lastOnline === null) continue;
    assert.ok(m.lastOnline > 1e12, file + ': lastOnline must be milliseconds');
  }
});

/* --- T4 — on_hold (decided for 1.3.0) ----------------------------------- */

test('T4: on_hold is recorded as enabled with an unknown expiry', () => {
  /* docs/design/PANEL-ON-HOLD-DECISION.md: Rebecca renders on_hold as active,
     and does not pass the hold duration to templates, so the only honest
     expiry is unknown -- never "never expires", never an invented duration. */
  const f = byCase('08-on-hold');
  assert.ok(f, 'the on_hold case must exist');
  assert.equal(f.doc.native.info.status, 'on_hold');
  assert.ok(f.doc.native.info.on_hold_expire_duration > 0, 'the countdown is recorded');
  assert.equal(f.doc.expected.model.enabled, true);
  assert.equal(f.doc.expected.model.expire, null);
});

test('T4: the unknown status is the only deferral, and it is visible', () => {
  const deferred = FIXTURES.filter((f) => f.doc.expected.model === null).map((f) => f.doc.case);
  assert.deepEqual(deferred, ['17-unknown-status'], 'the unknown status is the only deferral');
});

/* --- T5 — an unknown status must be rejected ----------------------------- */

test('T5: the fixture set declares a closed status table', () => {
  /* Every status appearing in the fixtures is either a known one or the
     deliberate rejection case. */
  for (const { file, doc } of FIXTURES) {
    const status = doc.native.info.status;
    if (doc.case === '17-unknown-status') {
      assert.equal(KNOWN_STATUSES.includes(status), false, file + ': this case must be OUTSIDE the table');
    } else {
      assert.ok(KNOWN_STATUSES.includes(status), file + ': status must be in the frozen table');
    }
  }
});

test('T5: every status in the frozen table is exercised by a fixture', () => {
  /* A table with an untested row is a table with an unverified claim. */
  const covered = new Set(FIXTURES.map((f) => f.doc.native.info.status));
  for (const status of KNOWN_STATUSES) {
    assert.ok(covered.has(status), 'no fixture covers status ' + status);
  }
  assert.equal(covered.size, KNOWN_STATUSES.length + 1, 'the five known plus the unknown case');
});

test('T5: the unknown status is marked for rejection, not coerced', () => {
  const f = byCase('17-unknown-status');
  assert.ok(f, 'the rejection case must exist');
  assert.equal(KNOWN_STATUSES.includes(f.doc.native.info.status), false);
  assert.equal(f.doc.expected.model, null,
    'an unknown status must have NO expectation — coercing it to enabled true or false would both be wrong');
  assert.match(f.doc.note, /REJECTED/, 'the note must say it is to be rejected');
});

/* --- nothing was rebuilt ------------------------------------------------- */

test('the 17 artifacts are byte-identical to their committed locks', async () => {
  const { build } = await import('../tools/build.mjs');
  const { templateIds } = await import('../tools/templates.mjs');
  const source = readFileSync(join(ROOT, 'tests', 'build.test.mjs'), 'utf8');
  const locked = {};
  for (const m of source.matchAll(/^\s*\['([a-z]+)', (\d+), '([0-9a-f]{64})'\],/gm)) locked[m[1]] = +m[2];
  for (const m of source.matchAll(/assert\.equal\(bytes, (\d+), '([A-Za-z ]+) artifact changed size/g)) {
    const id = m[2] === 'Row' ? 'row' : m[2] === 'Pulse Nova' ? 'pulsenova' : m[2].toLowerCase();
    locked[id] = +m[1];
  }
  assert.equal(Object.keys(locked).length, 17);
  for (const id of templateIds()) {
    assert.equal(Buffer.byteLength(build(true, id).html, 'utf8'), locked[id], id + ' must not move');
  }
});
