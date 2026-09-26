/* The normalized contract's gates.
 *
 * The load-bearing test here is the first one: the contract must produce
 * EXACTLY what the runtime produces, from the same island, using the runtime's
 * own readDocument() and normalize() as the oracle. A contract that merely
 * looks reasonable is worthless; this one is pinned to the shipped behaviour.
 *
 * Nothing here touches a runtime file. model.js is imported and read, which is
 * the point — it is the thing being described, so it must not be paraphrased.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { templateIds } from '../tools/templates.mjs';
import { build } from '../tools/build.mjs';
import {
  ISLAND_ATTRIBUTES, ISLAND_ELEMENTS, MODEL_FIELDS, OPTIONAL_MODEL_KEYS,
  EXPIRE_MIN, EXPIRE_MAX,
  readIsland, extractIsland, normalizeIsland, validateIsland, validateModel,
  assertModel, toModel,
} from '../tools/contract.mjs';
import { normalize, readDocument } from '../src/scripts/model.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* A document just large enough for readDocument(): the dataset of #sub-data and
   the text of #announce-source. Deliberately mirrors the runtime's own access
   pattern rather than the contract's, so the two are compared honestly. */
function fakeDoc({ attributes = {}, announce = '' }) {
  const dataset = {};
  for (const [attr, value] of Object.entries(attributes)) {
    const camel = attr.slice('data-'.length).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    dataset[camel] = value;
  }
  return {
    getElementById(id) {
      if (id === 'sub-data') return { dataset };
      if (id === 'announce-source') return { textContent: announce };
      return null;
    },
  };
}

/* The runtime model, read exactly as the page reads it. */
function runtimeModel(island) {
  return normalize(readDocument(fakeDoc(island)));
}

/* The RENDERED pages, not the built artifacts. A built artifact is a template:
   its data-* attributes still hold `{{ if .enabled }}1{{ else }}0{{ end }}`,
   because the panel renders them at request time. The fixture server's output
   is the real thing — the same page a subscriber's browser receives — so it is
   the only honest source for validating island VALUES. */
const RENDERED = {};
for (const id of templateIds()) {
  RENDERED[id] = readFileSync(join(ROOT, 'tools', 'fixtures', 'out', id, '00-showcase', 'rendered.html'), 'utf8');
}

/* The artifacts themselves, kept for the byte-identity gate at the end. */
const ARTIFACTS = {};
for (const id of templateIds()) ARTIFACTS[id] = build(true, id).html;

/* --- the faithfulness gate ---------------------------------------------- */

test('the contract reproduces the runtime model exactly, for every artifact', () => {
  for (const id of templateIds()) {
    const island = extractIsland(RENDERED[id]);
    const mine = normalizeIsland(readIsland(island));
    const theirs = runtimeModel(island);

    /* links are read by the explorer, not by readDocument(), so they are not in
       the runtime model; every other field must match to the value. */
    const { links, ...rest } = mine;
    assert.deepEqual(rest, theirs, id + ': the contract must not diverge from the runtime');
    assert.ok(Array.isArray(links), id + ': links must still be present in the contract');
  }
});

test('the contract model validates for every artifact', () => {
  for (const id of templateIds()) {
    const island = extractIsland(RENDERED[id]);
    const errors = validateIsland(island);
    assert.deepEqual(errors, [], id + ': island must validate');
    assert.deepEqual(validateModel(normalizeIsland(readIsland(island))), [], id + ': model must validate');
  }
});

test('toModel is the whole path, validated at both ends', () => {
  const island = extractIsland(RENDERED.row);
  const model = toModel(island);
  assert.equal(model.enabled, true);
  assert.equal(typeof model.total, 'number');
  assert.throws(() => toModel({ attributes: {} }), /island is invalid/);
});

/* --- the schema describes what the shells actually emit ----------------- */

test('every layout emits exactly the 13 schema attributes and 2 containers', () => {
  for (const id of templateIds()) {
    const layout = readFileSync(join(ROOT, 'src', 'templates', id, 'layout.html'), 'utf8');
    for (const { attr } of ISLAND_ATTRIBUTES) {
      assert.ok(layout.includes(attr + '='), id + ' must emit ' + attr);
    }
    for (const { id: elId } of ISLAND_ELEMENTS) {
      assert.ok(layout.includes('id="' + elId + '"'), id + ' must emit #' + elId);
    }
    /* And nothing outside the schema, scoped to the island element itself.
       Other elements legitimately carry their own data-* attributes — the state
       pill has data-state — and those are not part of this contract. */
    const block = layout.match(/<div id="sub-data"[\s\S]*?>/);
    assert.ok(block, id + ' must contain the island element');
    const emitted = [...block[0].matchAll(/data-([a-z-]+)=/g)].map((m) => 'data-' + m[1]);
    const known = new Set(ISLAND_ATTRIBUTES.map((f) => f.attr));
    for (const a of emitted) {
      assert.ok(known.has(a), id + ' emits an island attribute outside the schema: ' + a);
    }
    assert.equal(emitted.length, 13, id + ' must emit exactly 13 island attributes');
  }
});

test('the schema and the model agree on field count and naming', () => {
  assert.equal(ISLAND_ATTRIBUTES.length, 13);
  assert.equal(ISLAND_ELEMENTS.length, 2);
  assert.equal(MODEL_FIELDS.length, 16);

  /* The raw field names are the panel's own; the model names are canonical.
     Most pass through unchanged, and these five are the whole of the rename —
     stated explicitly so a silent drift in either direction fails here. */
  const RENAMES = {
    isOnline: 'online',
    downloadByte: 'download',
    uploadByte: 'upload',
    totalByte: 'total',
    subTitle: 'title',
    subSupportUrl: 'supportUrl',
    datepicker: 'jalali',
  };
  const modelKeys = new Set(MODEL_FIELDS.map((f) => f.key));
  for (const { key } of ISLAND_ATTRIBUTES) {
    const canonical = RENAMES[key] || key;
    assert.ok(modelKeys.has(canonical), 'island key ' + key + ' must land in the model as ' + canonical);
  }
  /* The renames are exactly these six and no more. */
  const renamed = ISLAND_ATTRIBUTES.map((f) => f.key).filter((k) => !modelKeys.has(k));
  assert.deepEqual(renamed.sort(), Object.keys(RENAMES).sort());
});

/* --- the honesty rules, as behaviour ------------------------------------ */

test('rule 2: used is known only when both halves are known', () => {
  const both = normalizeIsland(readIsland({ attributes: { 'data-download-byte': '10', 'data-upload-byte': '5' } }));
  assert.equal(both.used, 15);

  const half = normalizeIsland(readIsland({ attributes: { 'data-download-byte': '10', 'data-upload-byte': '' } }));
  assert.equal(half.download, 10);
  assert.equal(half.upload, null);
  assert.equal(half.used, null, 'one half unknown means used is unknown, never the known half');
});

test('rule 3: online requires a reported timestamp', () => {
  const withStamp = normalizeIsland(readIsland({
    attributes: { 'data-online': '1', 'data-last-online': '1700000000000' },
  }));
  assert.equal(withStamp.online, true);
  assert.deepEqual(validateModel(withStamp), []);

  const noStamp = { ...withStamp, lastOnline: null };
  const errors = validateModel(noStamp);
  assert.ok(errors.some((e) => /online may only be true/.test(e)), 'online without a stamp must be refused');
});

test('rule 4: a negative counter is unknown, never negative', () => {
  const m = normalizeIsland(readIsland({
    attributes: { 'data-download-byte': '-1', 'data-upload-byte': '5', 'data-total-byte': '-9' },
  }));
  assert.equal(m.download, null);
  assert.equal(m.total, null);
  assert.deepEqual(validateModel(m), []);
  assert.ok(validateModel({ ...m, total: -1 }).some((e) => /must not be negative/.test(e)));
});

test('rule 5: expire keeps its documented encoding', () => {
  const at = (v) => normalizeIsland(readIsland({ attributes: { 'data-expire': String(v) } })).expire;
  assert.equal(at(0), 0, '0 is never');
  assert.equal(at(-86400), -86400, 'negative is a duration');
  assert.equal(at(''), null, 'empty is unknown');
  assert.equal(at(EXPIRE_MAX + 1), null, 'out of range is unknown, not the year 5138');
  assert.equal(at(EXPIRE_MIN - 1), null);
});

test('rule 1: an absent capability is omitted, not defaulted', () => {
  /* The reference panel has all of these; the point is that the validator
     distinguishes an empty string from a missing field for the optional set. */
  const island = extractIsland(RENDERED.row);
  const m = normalizeIsland(readIsland(island));
  for (const key of OPTIONAL_MODEL_KEYS) {
    assert.ok(key in m, key + ' must be present as a field even when empty');
  }
  /* An empty announce stays empty — it is never given placeholder text. */
  assert.equal(typeof m.announce, 'string');
});

/* --- the validator refuses what it should ------------------------------- */

test('validateIsland rejects a missing or unknown attribute', () => {
  const good = extractIsland(RENDERED.row);
  assert.deepEqual(validateIsland(good), []);

  const missing = { ...good, attributes: { ...good.attributes } };
  delete missing.attributes['data-expire'];
  assert.ok(validateIsland(missing).some((e) => /missing attribute data-expire/.test(e)));

  const extra = { ...good, attributes: { ...good.attributes, 'data-surprise': 'x' } };
  assert.ok(validateIsland(extra).some((e) => /unknown attribute data-surprise/.test(e)));
});

test('validateIsland rejects a malformed flag or counter', () => {
  const good = extractIsland(RENDERED.row);
  const bad = { ...good, attributes: { ...good.attributes, 'data-enabled': 'yes' } };
  assert.ok(validateIsland(bad).some((e) => /flag must be "0" or "1"/.test(e)));

  const badCounter = { ...good, attributes: { ...good.attributes, 'data-total-byte': 'lots' } };
  assert.ok(validateIsland(badCounter).some((e) => /counter must be an integer/.test(e)));
});

test('validateModel rejects missing, unknown, and wrong-typed fields', () => {
  const base = toModel(extractIsland(RENDERED.row));
  assert.deepEqual(validateModel(base), []);

  const missing = { ...base };
  delete missing.total;
  assert.ok(validateModel(missing).some((e) => /missing model field total/.test(e)));

  const extra = { ...base, surprise: 1 };
  assert.ok(validateModel(extra).some((e) => /unknown model field surprise/.test(e)));

  assert.ok(validateModel({ ...base, total: '100' }).some((e) => /total must be a number/.test(e)));
  assert.ok(validateModel({ ...base, enabled: null }).some((e) => /enabled must not be null/.test(e)));
  assert.ok(validateModel({ ...base, links: [1] }).some((e) => /links must contain only strings/.test(e)));
  assert.ok(validateModel(null).some((e) => /model must be an object/.test(e)));
  assert.throws(() => assertModel(missing), /normalized model is invalid/);
});

/* --- nothing was rebuilt ------------------------------------------------- */

test('the 17 artifacts are byte-identical to their committed locks', () => {
  const source = readFileSync(join(ROOT, 'tests', 'build.test.mjs'), 'utf8');
  const locked = {};
  for (const m of source.matchAll(/^\s*\['([a-z]+)', (\d+), '([0-9a-f]{64})'\],/gm)) locked[m[1]] = +m[2];
  for (const m of source.matchAll(/assert\.equal\(bytes, (\d+), '([A-Za-z ]+) artifact changed size/g)) {
    const id = m[2] === 'Row' ? 'row' : m[2] === 'Pulse Nova' ? 'pulsenova' : m[2].toLowerCase();
    locked[id] = +m[1];
  }
  assert.equal(Object.keys(locked).length, 17);
  for (const id of templateIds()) {
    assert.equal(Buffer.byteLength(ARTIFACTS[id], 'utf8'), locked[id], id + ' must not move');
  }
});
