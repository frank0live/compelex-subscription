/* PasarGuard fixture validation.
 *
 * These tests validate the FIXTURES, not an adapter — there is no PasarGuard
 * adapter and this phase does not create one. What they pin is that every
 * recorded payload is well formed, reproducible, and expresses a model that the
 * contract will accept. When the adapter lands in Phase 3C, the same fixtures
 * become its oracle: the only new assertion will be that the adapter reproduces
 * `expected.model` exactly.
 *
 * The fixtures record PasarGuard's NATIVE field names (`used_traffic`,
 * `data_limit`, `online_at`). If they recorded Row's names instead, the test
 * would compare an adapter against itself and pass even if the adapter misread
 * the panel.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODEL_FIELDS, OPTIONAL_MODEL_KEYS, validateModel, EXPIRE_MIN, EXPIRE_MAX } from '../tools/contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'fixtures', 'panels', 'pasarguard');

/* The canonical instant, shared with the 3X-UI fixtures: 2026-09-18T12:00:00Z.
   Mid-day UTC so no timezone shifts the calendar date. */
const CLOCK = 1789732800;

const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const FIXTURES = FILES.map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));

const byCase = (name) => FIXTURES.find((f) => f.doc.case === name);

/* --- the set is present and well formed --------------------------------- */

test('the fixture set is present', () => {
  assert.equal(FIXTURES.length, 23, 'the planned case set is 23 fixtures (20-22 added for 1.3.0: limited, expired, on_hold without a duration)');
  assert.deepEqual(FILES, [...FILES].sort(), 'files must be listed in order');
});

test('every fixture carries the required envelope', () => {
  for (const { file, doc } of FIXTURES) {
    assert.equal(doc.panel, 'pasarguard', file + ': panel');
    assert.equal(doc.case, file.replace(/\.json$/, ''), file + ': case must match the file name');
    assert.equal(typeof doc.note, 'string', file + ': note');
    assert.ok(doc.note.length > 10, file + ': note must say something');
    assert.equal(doc.source.route, 'GET /{token}/info', file + ': route');
    assert.equal(doc.source.version, '5.4.1', file + ': version');
    assert.ok(doc.native && typeof doc.native === 'object', file + ': native');
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

test('native keeps PasarGuard field names, never Row names', () => {
  for (const { file, doc } of FIXTURES) {
    const i = doc.native.info;
    for (const key of ['used_traffic', 'data_limit', 'status', 'username']) {
      assert.ok(key in i, file + ': native.info must carry ' + key);
    }
    /* Row's canonical names must NOT appear in native — that would mean the
       fixture had been pre-normalised, which is the failure this guards. */
    for (const key of ['download', 'upload', 'total', 'lastOnline', 'jalali', 'subTitle']) {
      assert.equal(key in i, false, file + ': native.info must not carry Row name ' + key);
    }
    assert.ok('subscription-userinfo' in doc.native.headers, file + ': the userinfo header is recorded');
  }
});

test('the userinfo header agrees with used_traffic', () => {
  /* This is the finding the whole mapping rests on: the panel reports
     upload=0 and puts the combined counter in download. If a future version
     starts reporting a real split, this fails loudly. */
  for (const { file, doc } of FIXTURES) {
    const h = doc.native.headers['subscription-userinfo'];
    const m = /upload=(\d+); download=(\d+); total=(\d+); expire=(-?\d+)/.exec(h);
    assert.ok(m, file + ': the userinfo header must parse');
    const [, upload, download] = m;
    assert.equal(upload, '0', file + ': PasarGuard reports upload=0');
    assert.equal(Number(download), doc.native.info.used_traffic, file + ': download carries used_traffic');
  }
});

/* --- expected.model is contract-shaped ----------------------------------- */

test('every non-deferred expected.model validates and carries all 16 fields', () => {
  const modelKeys = new Set(MODEL_FIELDS.map((f) => f.key));
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (m === null) continue;                       /* deferred — see the on_hold test */
    assert.deepEqual(validateModel(m), [], file + ': expected.model must validate');

    /* A2: every declared field is present. */
    for (const key of modelKeys) {
      assert.ok(key in m, file + ': expected.model must carry ' + key);
    }
    /* A4: nothing outside the schema. */
    for (const key of Object.keys(m)) {
      assert.ok(modelKeys.has(key), file + ': expected.model must not carry ' + key);
    }
  }
});

test('expected.model uses Row MODEL_FIELDS only', () => {
  const modelKeys = new Set(MODEL_FIELDS.map((f) => f.key));
  assert.equal(modelKeys.size, 16);
  for (const { file, doc } of FIXTURES) {
    if (doc.expected.model === null) continue;
    assert.equal(Object.keys(doc.expected.model).length, 16, file + ': exactly 16 keys');
  }
});

/* --- the honesty rules hold in the fixtures ------------------------------ */

test('used equals download + upload wherever all three are known', () => {
  for (const { file, doc } of FIXTURES) {
    const m = doc.expected.model;
    if (!m) continue;
    if (m.download !== null && m.upload !== null && m.used !== null) {
      assert.equal(m.used, m.download + m.upload, file + ': used must be the sum');
    }
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

/* --- the cases the brief requires ---------------------------------------- */

test('the 1000x guard: expire is seconds, lastOnline is milliseconds, both exact', () => {
  const f = byCase('19-expire-seconds-vs-ms');
  assert.ok(f, 'the guard case must exist');
  const m = f.doc.expected.model;
  const { expire, online_at: onlineAt } = f.doc.native.info;

  assert.equal(Date.parse(expire) / 1000, CLOCK + 100);
  assert.equal(Date.parse(onlineAt) / 1000, CLOCK - 200);

  assert.equal(m.expire, CLOCK + 100, 'expire must be SECONDS');
  assert.equal(m.lastOnline, (CLOCK - 200) * 1000, 'lastOnline must be MILLISECONDS');

  /* The two units must be distinguishable: a swap would change both values. */
  assert.notEqual(m.expire, CLOCK - 200);
  assert.notEqual(m.lastOnline, (CLOCK + 100) * 1000);
  assert.ok(m.lastOnline > 1e12, 'a millisecond instant is 13 digits at this date');
  assert.ok(m.expire < 1e10, 'a second instant is 10 digits at this date');
});

test('ip is present in native and absent from the model', () => {
  const f = byCase('17-ip-present');
  assert.ok(f, 'the ip case must exist');
  assert.equal(f.doc.native.info.ip, '203.0.113.7', 'native carries the address');
  assert.equal('ip' in f.doc.expected.model, false, 'the model must not carry the address');
  assert.equal(Object.keys(f.doc.expected.model).some((k) => /address|ip/i.test(k)), false);
});

test('the encoded cases store base64: headers and expect the decoded text', () => {
  /* PasarGuard's encode_title() emits `base64:<b64>` — the prefix is a
     client-side convention and nothing in the panel strips it, so the fixture
     must record it. A value without the prefix is plain text, not base64. */
  for (const name of ['12-announce-encoded', '13-title-encoded']) {
    const f = byCase(name);
    assert.ok(f, name + ' must exist');
    const headerKey = name.startsWith('12') ? 'announce' : 'profile-title';
    const field = name.startsWith('12') ? 'announce' : 'title';
    const raw = f.doc.native.headers[headerKey];
    assert.ok(raw.startsWith('base64:'), name + ': the header must carry the base64: prefix');
    const body = raw.slice('base64:'.length);
    assert.match(body, /^[A-Za-z0-9+/]+=*$/, name + ': the body must be base64');
    assert.equal(Buffer.from(body, 'base64').toString('utf8'), f.doc.expected.model[field],
      name + ': the expectation must be the DECODED text');
  }
});

test('every encoded header in the set carries the prefix', () => {
  for (const { file, doc } of FIXTURES) {
    for (const key of ['profile-title', 'announce']) {
      const v = doc.native.headers[key];
      if (typeof v === 'string' && v !== '') {
        assert.ok(v.startsWith('base64:'),
          file + ': ' + key + ' must carry the base64: prefix PasarGuard always adds');
      }
    }
  }
});

test('on_hold with a duration is recorded as a pending expiry, never a guess', () => {
  /* Decided for 1.3.0 (docs/design/PANEL-ON-HOLD-DECISION.md). The clock of an
     on_hold subscription starts on the first connection: Row's negative expire. */
  const f = byCase('08-on-hold');
  assert.ok(f, 'the on_hold case must exist');
  assert.equal(f.doc.native.info.status, 'on_hold');
  assert.ok(f.doc.native.info.on_hold_expire_duration > 0, 'the countdown is recorded');
  const m = f.doc.expected.model;
  assert.equal(m.enabled, true, 'on_hold is enabled');
  assert.equal(m.expire, -f.doc.native.info.on_hold_expire_duration, 'expire is the negative hold duration');
});

test('on_hold without a duration is recorded as unknown, never "never expires"', () => {
  const f = byCase('22-on-hold-no-duration');
  assert.ok(f, 'the case must exist');
  assert.equal(f.doc.native.info.status, 'on_hold');
  assert.equal(f.doc.native.info.on_hold_expire_duration, null);
  assert.equal(f.doc.expected.model.expire, null, 'unknown, not 0');
});

test('no fixture defers its expectation any longer', () => {
  const deferred = FIXTURES.filter((f) => f.doc.expected.model === null).map((f) => f.doc.case);
  assert.deepEqual(deferred, [], 'every PasarGuard case now has a decided expectation');
});

/* --- nothing was rebuilt ------------------------------------------------- */

test('the 15 artifacts are byte-identical to their committed locks', async () => {
  const { build } = await import('../tools/build.mjs');
  const { templateIds } = await import('../tools/templates.mjs');
  const source = readFileSync(join(ROOT, 'tests', 'build.test.mjs'), 'utf8');
  const locked = {};
  for (const m of source.matchAll(/^\s*\['([a-z]+)', (\d+), '([0-9a-f]{64})'\],/gm)) locked[m[1]] = +m[2];
  for (const m of source.matchAll(/assert\.equal\(bytes, (\d+), '([A-Za-z ]+) artifact changed size/g)) {
    const id = m[2] === 'Row' ? 'row' : m[2] === 'Pulse Nova' ? 'pulsenova' : m[2].toLowerCase();
    locked[id] = +m[1];
  }
  assert.equal(Object.keys(locked).length, 15);
  for (const id of templateIds()) {
    assert.equal(Buffer.byteLength(build(true, id).html, 'utf8'), locked[id], id + ' must not move');
  }
});
