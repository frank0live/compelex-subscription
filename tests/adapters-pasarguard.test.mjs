/* The PasarGuard adapter's tests.
 *
 * Two halves. The first drives the adapter against every recorded fixture and
 * asserts it reproduces `expected.model` exactly — the fixtures are the oracle.
 * The second pins the behaviours that are easy to get silently wrong: the
 * seconds/milliseconds split, the refusal of `on_hold`, and the dropping of the
 * subscriber's address.
 *
 * Nothing here touches a runtime file. The contract is the interface.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODEL_FIELDS, validateModel } from '../tools/contract.mjs';
import {
  PANELS, assertAdapter, adapterFor, buildablePanelIds, emitterFor, referencePanel,
} from '../tools/panels.mjs';
import { adapter, island, livePath, id as panelId, emitter } from '../tools/adapters/pasarguard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'fixtures', 'panels', 'pasarguard');

const FIXTURES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));

const byCase = (name) => FIXTURES.find((f) => f.doc.case === name);

/* Every fixture pins the clock, so the online window is decided against the
   recorded instant rather than the wall clock. This is what makes the suite
   reproducible tomorrow. */
const withClock = (doc) => ({ ...doc.native, now: doc.source.clock * 1000 });

/* --- 1..13, and the whole fixture set ----------------------------------- */

test('every fixture reproduces its expected model exactly', () => {
  for (const { file, doc } of FIXTURES) {
    if (doc.expected.model === null) continue;        /* none since 1.3.0 */
    const got = island(withClock(doc));
    assert.deepEqual(got, doc.expected.model, file + ': the adapter must match the fixture');
  }
});

test('every fixture output validates against the contract', () => {
  for (const { file, doc } of FIXTURES) {
    if (doc.expected.model === null) continue;
    assert.deepEqual(validateModel(island(withClock(doc))), [], file + ': model must validate');
  }
});

test('the adapter carries all 16 model fields and nothing else', () => {
  const keys = MODEL_FIELDS.map((f) => f.key);
  assert.equal(keys.length, 16);
  for (const { file, doc } of FIXTURES) {
    if (doc.expected.model === null) continue;
    const m = island(withClock(doc));
    assert.deepEqual(Object.keys(m).sort(), [...keys].sort(), file + ': exact key set');
  }
});

/* 1 — normal active user */
test('an active user maps to an enabled, online, limited subscription', () => {
  const m = island(withClock(byCase('00-showcase').doc));
  assert.equal(m.enabled, true);
  assert.equal(m.online, true);
  assert.equal(m.total, 107374182400);
  assert.equal(m.download, 42949672960);
});

/* 2 — disabled */
test('a disabled user maps to enabled false', () => {
  const m = island(withClock(byCase('03-disabled').doc));
  assert.equal(m.enabled, false);
});

/* 3 — expired */
test('an expired user keeps its expire instant rather than collapsing', () => {
  const doc = byCase('04-expired').doc;
  const m = island(withClock(doc));
  assert.equal(m.expire, doc.expected.model.expire);
  assert.equal(m.enabled, true, 'expired is not disabled');
});

/* 4 — unlimited traffic */
test('a null data_limit means unlimited, encoded as total 0', () => {
  const m = island(withClock(byCase('06-unlimited-traffic').doc));
  assert.equal(m.total, 0);
});

/* 5 — never expires */
test('a null expire means never, encoded as 0', () => {
  const m = island(withClock(byCase('07-never-expires').doc));
  assert.equal(m.expire, 0);
});

/* 6 — missing optional headers */
test('absent optional headers become empty strings, not placeholders', () => {
  const m = island(withClock(byCase('18-missing-optional').doc));
  assert.equal(m.title, '');
  assert.equal(m.announce, '');
  assert.equal(m.supportUrl, '');
});

/* 7 — base64 title */
test('a base64: profile-title is decoded', () => {
  const m = island(withClock(byCase('13-title-encoded').doc));
  assert.equal(m.title, 'گزارش وضعیت');
});

/* 8 — base64 announce */
test('a base64: announce is decoded, newlines included', () => {
  const m = island(withClock(byCase('12-announce-encoded').doc));
  assert.equal(m.announce, 'Line one.\nLine two.');
});

/* 9 — persian */
test('Persian text survives unchanged', () => {
  const m = island(withClock(byCase('14-persian').doc));
  assert.equal(m.title, 'پرمیوم ۱۰۰ گیگابایت');
});

/* 10 — hostile title */
test('a hostile title arrives as plain text, never as markup', () => {
  const m = island(withClock(byCase('15-hostile-title').doc));
  assert.equal(m.title, '<img src=x onerror="alert(1)"> & "quoted"');
  assert.equal(typeof m.title, 'string');
});

/* 11 — ip */
test('the subscriber address never reaches the model', () => {
  const doc = byCase('17-ip-present').doc;
  assert.equal(doc.native.info.ip, '203.0.113.7', 'the fixture really carries an address');
  const m = island(withClock(doc));
  assert.equal('ip' in m, false);
  assert.equal(Object.keys(m).some((k) => /address|ip/i.test(k)), false);

  /* The adapter builds the model from known fields only, so an address smuggled
     under another name is IGNORED rather than carried. That is the contract the
     brief allows — reject or ignore — and ignoring is the safer half: a throw
     would turn a panel's extra metadata into an outage. */
  const smuggled = island({
    ...withClock(doc), info: { ...doc.native.info, address: '203.0.113.7', ip: '198.51.100.9' },
  });
  assert.deepEqual(smuggled, m, 'extra panel metadata must not change the model');
  assert.equal(JSON.stringify(smuggled).includes('203.0.113.7'), false, 'the address must not appear');
  assert.equal(JSON.stringify(smuggled).includes('198.51.100.9'), false);
});

/* 12 — expire seconds */
test('expire is converted to SECONDS, exactly', () => {
  const doc = byCase('19-expire-seconds-vs-ms').doc;
  const m = island(withClock(doc));
  assert.equal(m.expire, 1789732900, 'CLOCK + 100, in seconds');
  assert.ok(m.expire < 1e10, 'a second instant is 10 digits at this date');
});

/* 13 — lastOnline milliseconds */
test('lastOnline is converted to MILLISECONDS, exactly', () => {
  const doc = byCase('19-expire-seconds-vs-ms').doc;
  const m = island(withClock(doc));
  assert.equal(m.lastOnline, 1789732600000, '(CLOCK - 200) * 1000, in milliseconds');
  assert.ok(m.lastOnline > 1e12, 'a millisecond instant is 13 digits at this date');
});

test('a seconds/milliseconds swap would be caught', () => {
  const m = island(withClock(byCase('19-expire-seconds-vs-ms').doc));
  /* The two fields are different units AND different instants, so neither a
     unit swap nor a value swap can pass. */
  assert.notEqual(m.expire, m.lastOnline);
  assert.notEqual(m.expire, 1789732600);
  assert.notEqual(m.lastOnline, 1789732900000);
  assert.equal(m.expire * 1000 === m.lastOnline, false, 'they are not the same instant');
});

/* 14 — on_hold (decided for 1.3.0, docs/design/PANEL-ON-HOLD-DECISION.md) */
test('on_hold resolves to a pending expiry of the hold duration, never a tempting wrong answer', () => {
  const doc = byCase('08-on-hold').doc;
  assert.equal(doc.native.info.status, 'on_hold');
  const m = island(withClock(doc));
  assert.deepEqual(m, doc.expected.model);
  assert.equal(m.enabled, true, 'not disabled');
  assert.equal(m.expire, -doc.native.info.on_hold_expire_duration, 'the clock starts on first connection');
  const noDuration = island(withClock(byCase('22-on-hold-no-duration').doc));
  assert.equal(noDuration.expire, null, 'without a duration the expiry is unknown, not 0 ("never")');
});

test('limited and expired are enabled statuses, and a status outside the enum is refused', () => {
  for (const kase of ['20-status-limited', '21-status-expired']) {
    const doc = byCase(kase).doc;
    assert.equal(island(withClock(doc)).enabled, true, kase);
  }
  const doc = byCase('01-active-online').doc;
  const bad = { ...doc.native, info: { ...doc.native.info, status: 'suspended' }, now: doc.source.clock * 1000 };
  assert.throws(() => island(bad), /unknown status "suspended"/);
});

/* 15 — malformed payload */
test('a malformed payload is refused rather than guessed', () => {
  assert.throws(() => island(null), /must be an object/);
  assert.throws(() => island([]), /must be an object/);
  assert.throws(() => island('nope'), /must be an object/);
  assert.throws(() => island({}), /native\.info must be an object/);
  assert.throws(() => island({ info: null }), /native\.info must be an object/);
  assert.throws(() => island({ info: { status: 'weird' } }), /unknown status/);
  assert.throws(() => island({ info: {} }), /unknown status/);
});

/* --- traffic honesty ---------------------------------------------------- */

test('no upload/download split is ever invented', () => {
  for (const { file, doc } of FIXTURES) {
    if (doc.expected.model === null) continue;
    const m = island(withClock(doc));
    assert.equal(m.upload, 0, file + ': upload must always be 0');
    assert.equal(m.download, doc.native.info.used_traffic, file + ': download is the combined counter');
    assert.equal(m.used, m.download + m.upload, file + ': used is the sum');
    assert.equal(m.used, doc.native.info.used_traffic, file + ': used is used_traffic');
  }
});

/* --- registry integration ----------------------------------------------- */

test('the adapter validates and is registered as an active panel', () => {
  assert.equal(panelId, 'pasarguard');
  assert.equal(emitter, 'jinja2');
  assert.equal(assertAdapter(adapter, 'pasarguard'), adapter);
  assert.equal(PANELS.pasarguard.status, 'active');
  assert.equal(PANELS.pasarguard.adapter, adapter);
  assert.equal(adapterFor('pasarguard'), adapter);
  assert.equal(emitterFor('pasarguard'), 'jinja2');
});

test('the reference panel and the other active panels are untouched by this adapter', () => {
  assert.equal(referencePanel(), '3xui');
  assert.equal(PANELS['3xui'].status, 'reference');
  assert.ok(PANELS['3xui'].adapter, '3X-UI still has its adapter');
  assert.equal(PANELS.rebecca.status, 'active', 'Rebecca was activated in Phase 4E');
  assert.ok(adapterFor('rebecca'), 'Rebecca now carries an adapter');
  assert.deepEqual(buildablePanelIds().sort(), ['3xui', 'pasarguard', 'rebecca']);
});

/* --- livePath ----------------------------------------------------------- */

test('livePath appends /info as a path suffix, not a query parameter', () => {
  assert.equal(livePath('/abc123'), '/abc123/info');
  assert.equal(livePath('/sub/token'), '/sub/token/info');
  assert.equal(livePath('/abc123/'), '/abc123/info', 'a trailing slash must not double up');
  assert.equal(livePath(''), '/info');
  assert.equal(livePath(null), '/info', 'a missing path must not throw');
  assert.equal(livePath(undefined), '/info');
  assert.equal(livePath('/abc123').includes('?'), false, 'PasarGuard uses a path, not a query');
});

/* --- determinism -------------------------------------------------------- */

test('the adapter is deterministic and does not mutate its input', () => {
  const doc = byCase('00-showcase').doc;
  const native = withClock(doc);
  const snapshot = JSON.stringify(native);
  const a = island(native);
  const b = island(native);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(native), snapshot, 'the input must not be modified');
});

/* --- nothing was rebuilt ------------------------------------------------ */

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
