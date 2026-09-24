/* The 3X-UI adapter's gates.
 *
 * The load-bearing test is the first: the adapter must produce EXACTLY what the
 * shipped runtime produces, from the same island, using the runtime's own
 * readDocument() and normalize() as the oracle. "Identical behaviour to the
 * current runtime" is not a claim to be asserted in a comment — it is a
 * comparison, and this is it.
 *
 * Nothing here touches a runtime file. model.js and live.js are read, because
 * they are the behaviour being matched.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { templateIds } from '../tools/templates.mjs';
import { build } from '../tools/build.mjs';
import { normalize, readDocument } from '../src/scripts/model.js';
import { extractIsland, validateModel, validateIsland, MODEL_FIELDS } from '../tools/contract.mjs';
import {
  PANELS, ADAPTER_INTERFACE, assertAdapter, adapterFor, referencePanel, emitterFor,
} from '../tools/panels.mjs';
import { adapter, island as toIsland, livePath, id as panelId, emitter } from '../tools/adapters/3xui.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* A document just large enough for the runtime's readDocument(). */
function fakeDoc({ attributes = {}, announce = '' }) {
  const dataset = {};
  for (const [attr, value] of Object.entries(attributes)) {
    const camel = attr.slice('data-'.length).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    dataset[camel] = value;
  }
  return {
    getElementById(elId) {
      if (elId === 'sub-data') return { dataset };
      if (elId === 'announce-source') return { textContent: announce };
      return null;
    },
  };
}

/* The RENDERED pages — the only honest source of island values, because a built
   artifact is still an unrendered template. */
const RENDERED = {};
for (const id of templateIds()) {
  RENDERED[id] = readFileSync(join(ROOT, 'tools', 'fixtures', 'out', id, '00-showcase', 'rendered.html'), 'utf8');
}

const ARTIFACTS = {};
for (const id of templateIds()) ARTIFACTS[id] = build(true, id).html;

/* --- the behaviour-identity gate ---------------------------------------- */

test('the adapter matches the runtime exactly, for every rendered page', () => {
  for (const id of templateIds()) {
    const isl = extractIsland(RENDERED[id]);
    const mine = toIsland(isl);
    const theirs = normalize(readDocument(fakeDoc(isl)));

    /* links are read by the explorer, not by readDocument(), so the runtime
       model has no links key; everything else must match to the value. */
    const { links, ...rest } = mine;
    assert.deepEqual(rest, theirs, id + ': the adapter must not diverge from the runtime');
    assert.ok(Array.isArray(links), id + ': the adapter still surfaces links');
  }
});

test('the adapter output passes contract validation, for every page', () => {
  for (const id of templateIds()) {
    const isl = extractIsland(RENDERED[id]);
    assert.deepEqual(validateIsland(isl), [], id + ': island must validate');
    const model = toIsland(isl);
    assert.deepEqual(validateModel(model), [], id + ': model must validate');
    /* And every declared field is actually present. */
    for (const { key } of MODEL_FIELDS) {
      assert.ok(key in model, id + ': model must carry ' + key);
    }
  }
});

test('the adapter is deterministic', () => {
  const isl = extractIsland(RENDERED.row);
  assert.deepEqual(toIsland(isl), toIsland(isl));
});

/* --- the registry integration ------------------------------------------- */

test('the adapter validates against the declared interface', () => {
  assert.equal(panelId, '3xui');
  assert.equal(emitter, 'go');
  assert.equal(assertAdapter(adapter, '3xui'), adapter);

  for (const [field, type] of Object.entries(ADAPTER_INTERFACE.required)) {
    assert.equal(typeof adapter[field], type, field + ' must be a ' + type);
  }
  for (const [field, type] of Object.entries(ADAPTER_INTERFACE.optional)) {
    assert.equal(typeof adapter[field], type, field + ' must be a ' + type);
  }
});

test('the registry exposes the reference adapter and every panel now carries one', () => {
  assert.equal(referencePanel(), '3xui');
  assert.equal(emitterFor('3xui'), 'go');
  assert.equal(adapterFor('3xui'), adapter, 'the reference panel must expose its adapter');
  assert.equal(PANELS['3xui'].adapter, adapter);

  /* PasarGuard went active in Phase 3C and Rebecca in Phase 4E; each has its own
     suite (tests/adapters-pasarguard.test.mjs, tests/adapters-rebecca.test.mjs).
     No panel is planned any more, so this asserts the whole registry. */
  assert.equal(PANELS.pasarguard.status, 'active');
  assert.ok(PANELS.pasarguard.adapter, 'PasarGuard is active, so it carries an adapter');
  assert.equal(PANELS.rebecca.status, 'active');
  assert.ok(PANELS.rebecca.adapter, 'Rebecca is active, so it carries an adapter');

  for (const id of ['3xui', 'pasarguard', 'rebecca']) {
    assert.ok(adapterFor(id), id + ' must resolve an adapter');
  }
});

/* --- livePath matches the runtime's own construction -------------------- */

test('livePath reproduces exactly what live.js builds', () => {
  /* The runtime builds the endpoint inline; this asserts the adapter agrees
     with it rather than paraphrasing it. */
  const live = readFileSync(join(ROOT, 'src', 'scripts', 'live.js'), 'utf8');
  assert.ok(
    live.includes("win.location.pathname + '?format=info'"),
    'live.js must still build the endpoint as pathname + ?format=info',
  );
  assert.equal(livePath('/sub/abc123'), '/sub/abc123?format=info');
  assert.equal(livePath('/'), '/?format=info');
  assert.equal(livePath(''), '?format=info');
  assert.equal(livePath(null), '?format=info', 'a missing path must not throw');
  assert.equal(livePath(undefined), '?format=info');
});

/* --- the honesty rules hold through the adapter ------------------------- */

test('the adapter refuses a malformed island rather than repairing it', () => {
  const good = extractIsland(RENDERED.row);
  assert.doesNotThrow(() => toIsland(good));

  const missing = { ...good, attributes: { ...good.attributes } };
  delete missing.attributes['data-expire'];
  assert.throws(() => toIsland(missing), /island is invalid/);

  const badFlag = { ...good, attributes: { ...good.attributes, 'data-enabled': 'yes' } };
  assert.throws(() => toIsland(badFlag), /island is invalid/);

  assert.throws(() => toIsland({}), /island is invalid/, 'an empty island is not a valid island');
});

test('the adapter keeps used unknown when only one half is known', () => {
  const base = extractIsland(RENDERED.row);
  const half = { ...base, attributes: { ...base.attributes, 'data-upload-byte': '' } };
  const m = toIsland(half);
  assert.equal(m.upload, null);
  assert.equal(m.used, null, 'one half unknown means used is unknown');
});

test('the adapter treats an untrusted counter as unknown, never negative', () => {
  const base = extractIsland(RENDERED.row);
  const neg = { ...base, attributes: { ...base.attributes, 'data-total-byte': '-5' } };
  assert.equal(toIsland(neg).total, null);
});

test('the adapter never carries the subscriber address', () => {
  const base = extractIsland(RENDERED.row);
  /* Even if a panel were to add such an attribute, the contract has no field
     for it and the model must not grow one. */
  const withAddress = { ...base, attributes: { ...base.attributes, 'data-address': '1.2.3.4' } };
  assert.throws(() => toIsland(withAddress), /unknown attribute data-address/);
  const model = toIsland(base);
  assert.equal(Object.keys(model).some((k) => /address|ip/i.test(k)), false);
});

/* --- nothing was rebuilt ------------------------------------------------ */

test('the 15 artifacts are byte-identical to their committed locks', () => {
  const source = readFileSync(join(ROOT, 'tests', 'build.test.mjs'), 'utf8');
  const locked = {};
  for (const m of source.matchAll(/^\s*\['([a-z]+)', (\d+), '([0-9a-f]{64})'\],/gm)) locked[m[1]] = +m[2];
  for (const m of source.matchAll(/assert\.equal\(bytes, (\d+), '([A-Za-z ]+) artifact changed size/g)) {
    const id = m[2] === 'Row' ? 'row' : m[2] === 'Pulse Nova' ? 'pulsenova' : m[2].toLowerCase();
    locked[id] = +m[1];
  }
  assert.equal(Object.keys(locked).length, 15);
  for (const id of templateIds()) {
    assert.equal(Buffer.byteLength(ARTIFACTS[id], 'utf8'), locked[id], id + ' must not move');
  }
});
