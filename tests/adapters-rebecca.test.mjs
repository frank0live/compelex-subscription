/* The Rebecca adapter's tests.
 *
 * Two halves. The first drives the adapter against every recorded fixture and
 * asserts it reproduces `expected.model` exactly — the fixtures are the oracle.
 * The second pins the behaviours that are easy to get silently wrong: the
 * zoneless timestamp, the status table, and the two explicit refusals.
 *
 * Nothing here touches a runtime file. The contract is the interface.
 *
 * The registry IS activated as of Phase 4E, so the last block asserts
 * `adapterFor('rebecca')` resolves and that the buildable set is all three
 * panels.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODEL_FIELDS, validateModel } from '../tools/contract.mjs';
import {
  PANELS, adapterFor, assertAdapter, buildablePanelIds, emitterFor, referencePanel,
} from '../tools/panels.mjs';
import { adapter, island, livePath, onlineAtToMillis, id as panelId, emitter } from '../tools/adapters/rebecca.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'fixtures', 'panels', 'rebecca');

const CLOCK = 1789732800;

const FIXTURES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));

const byCase = (name) => FIXTURES.find((f) => f.doc.case === name);
const withClock = (doc) => ({ ...doc.native, now: doc.source.clock * 1000 });

/* The fixture whose expectation is deliberately absent: the unknown status.
   It must THROW, so it is excluded from the oracle sweep and covered by its own
   test below. (`on_hold` resolves since 1.3.0 and is swept like any other.) */
const THROWS = ['17-unknown-status'];

/* --- the oracle sweep ---------------------------------------------------- */

test('every resolvable fixture reproduces its expected model exactly', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    assert.deepEqual(island(withClock(doc)), doc.expected.model, file + ': the adapter must match the fixture');
  }
});

test('every fixture output validates against the contract', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    assert.deepEqual(validateModel(island(withClock(doc))), [], file + ': model must validate');
  }
});

test('the adapter carries all 16 model fields and nothing else', () => {
  const keys = MODEL_FIELDS.map((f) => f.key);
  assert.equal(keys.length, 16);
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    assert.deepEqual(Object.keys(island(withClock(doc))).sort(), [...keys].sort(), file + ': exact key set');
  }
});

/* --- the status table ---------------------------------------------------- */

test('active maps to enabled true and online from online_at', () => {
  const m = island(withClock(byCase('01-active-online').doc));
  assert.equal(m.enabled, true);
  assert.equal(m.online, true);
});

test('limited maps to enabled TRUE — the allowance is spent, the account is not off', () => {
  const doc = byCase('03-limited').doc;
  assert.equal(doc.native.info.status, 'limited');
  const m = island(withClock(doc));
  assert.equal(m.enabled, true, 'limited is not disablement');
  assert.equal(m.used, m.total, 'and the allowance really is spent');
});

test('expired maps to enabled TRUE — expiry is not disablement', () => {
  const doc = byCase('04-expired').doc;
  assert.equal(doc.native.info.status, 'expired');
  const m = island(withClock(doc));
  assert.equal(m.enabled, true, 'expired is not disablement');
  assert.ok(m.expire < CLOCK, 'and the instant really is in the past');
});

test('disabled is the ONLY status that means off', () => {
  const doc = byCase('05-disabled').doc;
  assert.equal(doc.native.info.status, 'disabled');
  const m = island(withClock(doc));
  assert.equal(m.enabled, false);
  assert.equal(m.online, false);

  /* And across the whole set, only disabled ever yields enabled:false. */
  for (const { file, doc: d } of FIXTURES) {
    if (THROWS.includes(d.case)) continue;
    assert.equal(island(withClock(d)).enabled, d.native.info.status !== 'disabled',
      file + ': enabled must be false only for disabled');
  }
});

/* --- on_hold and unknown status both throw ------------------------------- */

test('on_hold resolves to enabled with an unknown expiry, never a tempting wrong answer', () => {
  const doc = byCase('08-on-hold').doc;
  assert.equal(doc.native.info.status, 'on_hold');
  const m = island(withClock(doc));
  assert.deepEqual(m, doc.expected.model);
  assert.equal(m.enabled, true, 'not disabled');
  assert.equal(m.expire, null, 'not 0 ("never"), and not an invented duration');
});

test('an unknown status is refused rather than absorbed by an else branch', () => {
  const doc = byCase('17-unknown-status').doc;
  assert.equal(doc.native.info.status, 'suspended');
  assert.equal(doc.expected.model, null, 'the fixture records no expectation');
  assert.throws(() => island(withClock(doc)), /unknown status/);
  /* The message must name the offending value, so a future sixth state is
     diagnosable from the error alone. */
  assert.throws(() => island(withClock(doc)), /suspended/);
});

test('the refusal is the only fixture without an expectation', () => {
  const deferred = FIXTURES.filter((f) => f.doc.expected.model === null).map((f) => f.doc.case);
  assert.deepEqual(deferred, THROWS);
});

/* --- timezone independence ----------------------------------------------- */

test('a zoneless online_at is read as UTC and converted exactly', () => {
  const doc = byCase('09-timezone-independence').doc;
  assert.equal(doc.native.info.online_at, '2026-09-18 11:58:30');
  const m = island(withClock(doc));
  assert.equal(m.lastOnline, (CLOCK - 90) * 1000);
  assert.ok(m.lastOnline > 1e12, 'a millisecond instant is 13 digits at this date');
});

test('the conversion is identical under any TZ', () => {
  const value = '2026-09-18 11:58:30';
  const expected = (CLOCK - 90) * 1000;
  const original = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tehran', 'Asia/Tokyo', 'Australia/Sydney']) {
      process.env.TZ = tz;
      assert.equal(onlineAtToMillis(value), expected, 'TZ=' + tz + ' must not change the instant');
      assert.equal(island(withClock(byCase('09-timezone-independence').doc)).lastOnline, expected,
        'and the adapter must agree under TZ=' + tz);
    }
    /* The test has teeth: the naive parse really does differ under a non-UTC
       zone, so this would catch the bug it exists to prevent. */
    process.env.TZ = 'Asia/Tehran';
    assert.notEqual(Date.parse(value), expected, 'the naive parse must differ, or this proves nothing');
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('a value that already carries a zone parses as-is', () => {
  assert.equal(onlineAtToMillis('2026-09-18T11:58:30Z'), (CLOCK - 90) * 1000);
  assert.equal(onlineAtToMillis('2026-09-18T14:58:30+03:00'), (CLOCK - 90) * 1000);
  assert.equal(onlineAtToMillis(''), null);
  assert.equal(onlineAtToMillis(null), null);
  assert.equal(onlineAtToMillis(undefined), null);
});

test('the 120 second window decides online', () => {
  const base = byCase('01-active-online').doc;
  const at = (delta) => island({ ...base.native, now: CLOCK * 1000, info: { ...base.native.info, online_at: new Date((CLOCK + delta) * 1000).toISOString().replace('T', ' ').replace('Z', '') } });
  assert.equal(at(-90).online, true, '90 s ago is inside the window');
  assert.equal(at(-120).online, true, 'exactly 120 s is the boundary, inclusive');
  assert.equal(at(-121).online, false, '121 s ago is outside');
  assert.equal(at(-3 * 86400).online, false, 'three days ago is well outside');
});

test('a missing online_at yields online false and lastOnline null', () => {
  const m = island(withClock(byCase('11-online-null').doc));
  assert.equal(m.online, false);
  assert.equal(m.lastOnline, null);
});

/* --- expire stays seconds ------------------------------------------------ */

test('expire passes through as SECONDS, unchanged', () => {
  const doc = byCase('10-expire-seconds').doc;
  assert.equal(doc.native.info.expire, CLOCK + 100, 'the native value is already epoch seconds');
  const m = island(withClock(doc));
  assert.equal(m.expire, CLOCK + 100, 'and must be carried through unchanged');
  assert.ok(m.expire < 1e10, 'a second instant is 10 digits at this date');

  for (const { file, doc: d } of FIXTURES) {
    if (THROWS.includes(d.case)) continue;
    const e = d.native.info.expire;
    if (d.native.info.status === 'on_hold') {
      /* the clock has not started and Rebecca passes no hold duration */
      assert.equal(island(withClock(d)).expire, null, file + ': an on_hold expiry is unknown');
      continue;
    }
    assert.equal(island(withClock(d)).expire, e === null || e <= 0 ? 0 : e,
      file + ': expire must be DIRECT, never converted');
  }
});

test('a null expire means never, encoded as 0', () => {
  assert.equal(island(withClock(byCase('07-never-expires').doc)).expire, 0);
});

/* --- traffic ------------------------------------------------------------- */

test('no upload/download split is ever invented', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    const m = island(withClock(doc));
    assert.equal(m.upload, 0, file + ': upload must always be 0');
    assert.equal(m.download, doc.native.info.used_traffic, file + ': download is the combined counter');
    assert.equal(m.used, m.download + m.upload, file + ': used is the sum');
    assert.equal(m.used, doc.native.info.used_traffic, file + ': used is used_traffic');
  }
});

test('a null or zero data_limit means unlimited, encoded as total 0', () => {
  assert.equal(island(withClock(byCase('06-unlimited-traffic').doc)).total, 0);
});

/* --- headers ------------------------------------------------------------- */

test('a base64: profile-title is decoded', () => {
  const m = island(withClock(byCase('12-base64-title').doc));
  assert.equal(m.title, 'گزارش وضعیت');
});

test('an unprefixed header is plain text, not base64', () => {
  const doc = byCase('00-showcase').doc;
  const m = island({ ...doc.native, now: CLOCK * 1000, headers: { ...doc.native.headers, 'profile-title': 'Plain Title' } });
  assert.equal(m.title, 'Plain Title');
});

test('a missing support-url becomes an empty string, not a placeholder', () => {
  const m = island(withClock(byCase('14-missing-support').doc));
  assert.equal(m.supportUrl, '');
});

test('announce is ALWAYS empty — Rebecca has no announce concept', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    assert.equal(island(withClock(doc)).announce, '', file + ': announce must always be empty');
    assert.equal('announce' in doc.native.headers, false, file + ': and no header carries one');
  }
});

test('a hostile title arrives as plain text, never as markup', () => {
  const m = island(withClock(byCase('16-hostile-title').doc));
  assert.equal(m.title, '<img src=x onerror="alert(1)"> & "quoted"');
  assert.equal(typeof m.title, 'string');
});

test('subJsonUrl is empty and subClashUrl is derived from subUrl', () => {
  const m = island(withClock(byCase('00-showcase').doc));
  assert.equal(m.subJsonUrl, '', 'Rebecca has no JSON-subscription equivalent');
  assert.equal(m.subClashUrl, m.subUrl + '/clash-meta');
});

/* --- malformed payloads -------------------------------------------------- */

test('a malformed payload is refused rather than guessed', () => {
  assert.throws(() => island(null), /must be an object/);
  assert.throws(() => island([]), /must be an object/);
  assert.throws(() => island('nope'), /must be an object/);
  assert.throws(() => island({}), /native\.info must be an object/);
  assert.throws(() => island({ info: null }), /native\.info must be an object/);
  assert.throws(() => island({ info: {} }), /unknown status/);
});

/* --- livePath ------------------------------------------------------------ */

test('livePath appends /info as a path suffix, not a query parameter', () => {
  assert.equal(livePath('/abc123'), '/abc123/info');
  assert.equal(livePath('/sub/token'), '/sub/token/info');
  assert.equal(livePath('/abc123/'), '/abc123/info', 'a trailing slash must not double up');
  assert.equal(livePath(''), '/info');
  assert.equal(livePath(null), '/info', 'a missing path must not throw');
  assert.equal(livePath(undefined), '/info');
  assert.equal(livePath('/abc123').includes('?'), false, 'Rebecca uses a path, not a query');
});

/* --- identity ------------------------------------------------------------ */

test('the adapter declares the pongo2 emitter and its own id', () => {
  assert.equal(panelId, 'rebecca');
  assert.equal(emitter, 'pongo2');
  assert.equal(adapter.id, 'rebecca');
  assert.equal(adapter.emitter, 'pongo2');
  assert.equal(typeof adapter.island, 'function');
  assert.equal(typeof adapter.livePath, 'function');
});

test('the adapter is deterministic and does not mutate its input', () => {
  const native = withClock(byCase('00-showcase').doc);
  const snapshot = JSON.stringify(native);
  assert.deepEqual(island(native), island(native));
  assert.equal(JSON.stringify(native), snapshot, 'the input must not be modified');
});

/* --- registry activation (Phase 4E) -------------------------------------- */

test('adapterFor(rebecca) resolves the adapter through the registry', () => {
  assert.equal(PANELS.rebecca.status, 'active');
  assert.equal(PANELS.rebecca.adapter, adapter);
  assert.equal(adapterFor('rebecca'), adapter);
  assert.equal(emitterFor('rebecca'), 'pongo2', 'the emitter must stay pongo2');
  assert.equal(assertAdapter(adapter, 'rebecca'), adapter);
});

test('buildablePanelIds includes all three panels', () => {
  assert.deepEqual(buildablePanelIds().sort(), ['3xui', 'pasarguard', 'rebecca']);
  for (const id of ['3xui', 'pasarguard', 'rebecca']) {
    assert.ok(adapterFor(id), id + ' must resolve an adapter');
    assert.notEqual(PANELS[id].status, 'planned', id + ' must not be planned');
  }
});

test('the other two panels are untouched by the activation', () => {
  assert.equal(referencePanel(), '3xui');
  assert.equal(PANELS['3xui'].status, 'reference');
  assert.equal(PANELS.pasarguard.status, 'active');
  assert.equal(emitterFor('3xui'), 'go');
  assert.equal(emitterFor('pasarguard'), 'jinja2');
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
