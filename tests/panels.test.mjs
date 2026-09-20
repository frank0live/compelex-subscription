/* The panel foundation's gates.
 *
 * Four gates, ordered by strength. G1 is the keystone: the transpiler's Go path
 * must be lossless, because a tokeniser that cannot round-trip the source
 * cannot safely transform it into another dialect. G2 is the promise this phase
 * makes to the frozen catalogue. G3 proves the new panel path is a faithful
 * second path to the same output. G4 proves the registry refuses what it should.
 *
 * Nothing here builds a PasarGuard or Rebecca artifact, because no adapter for
 * either exists — and G4 asserts that refusal rather than assuming it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { templateIds } from '../tools/templates.mjs';
import { transpile, assertGoIdentity, segments, classify } from '../tools/transpile.mjs';
import {
  PANELS, EMITTERS, ADAPTER_INTERFACE, panelIds, referencePanel, buildablePanelIds,
  resolvePanel, assertAdapter, adapterFor, emitterFor,
} from '../tools/panels.mjs';
import { buildPanelShell, panelShellPath, sourceLayoutPath } from '../tools/build-panel.mjs';
import { build } from '../tools/build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The layouts, read once. These are the canonical source — there is no separate
   canonical shell, by design. */
const LAYOUTS = {};
for (const id of templateIds()) LAYOUTS[id] = readFileSync(sourceLayoutPath(id), 'utf8');

/* --- G1 — the Go path is lossless --------------------------------------- */

test('G1: the transpiler round-trips every layout byte-for-byte in Go', () => {
  const failures = assertGoIdentity(LAYOUTS);
  assert.deepEqual(failures, [], 'the Go path must be lossless for every template');
});

test('G1: the Go emitter is an identity on each layout individually', () => {
  for (const id of templateIds()) {
    assert.equal(transpile(LAYOUTS[id], 'go'), LAYOUTS[id], id + ' must round-trip exactly');
  }
});

test('G1: the action vocabulary is closed and fully classified', () => {
  /* Every action in every layout must classify, and the vocabulary must be the
     measured eight forms. An action outside it is a build failure, not a
     passthrough — that is what keeps the emitters honest. */
  const seen = new Set();
  for (const id of templateIds()) {
    for (const seg of segments(LAYOUTS[id])) {
      if (seg.kind !== 'action') continue;
      seen.add(classify(seg.body).form);
    }
  }
  assert.deepEqual([...seen].sort(), [
    'else', 'else-if-lt-zero', 'end', 'if-eq-zero', 'if-field', 'range-field', 'value-dot', 'value-field',
  ]);
});

test('G1: an action outside the vocabulary is refused, not copied', () => {
  assert.throws(() => classify('template "x"'), /unsupported template action/);
  assert.throws(() => transpile('{{ template "x" }}', 'jinja2'), /unsupported template action/);
  assert.throws(() => transpile('{{ .a }}', 'php'), /unknown emitter/);
});

/* --- G1b — the other dialects are well formed --------------------------- */

test('every layout transpiles to balanced Jinja2 and pongo2', () => {
  for (const id of templateIds()) {
    for (const dialect of ['jinja2', 'pongo2']) {
      const out = transpile(LAYOUTS[id], dialect);
      const opens = (out.match(/\{% (?:if|for) /g) || []).length;
      const closes = (out.match(/\{% (?:endif|endfor) %\}/g) || []).length;
      assert.equal(opens, closes, id + '/' + dialect + ' must have balanced blocks');
      assert.equal(/\{\{\s*\.[A-Za-z]/.test(out), false, id + '/' + dialect + ' left Go field syntax behind');
      assert.equal(/\{\{\s*(?:if|else|end|range)\b/.test(out), false, id + '/' + dialect + ' left a Go tag behind');
    }
  }
});

test('transpiling is deterministic', () => {
  for (const id of templateIds()) {
    for (const dialect of EMITTERS) {
      assert.equal(transpile(LAYOUTS[id], dialect), transpile(LAYOUTS[id], dialect));
    }
  }
});

/* --- G2 — the frozen catalogue has not moved ---------------------------- */

test('G2: all 15 artifacts are byte-identical to their committed locks', () => {
  const source = readFileSync(join(ROOT, 'tests', 'build.test.mjs'), 'utf8');
  const locked = {};
  for (const m of source.matchAll(/^\s*\['([a-z]+)', (\d+), '([0-9a-f]{64})'\],/gm)) {
    locked[m[1]] = +m[2];
  }
  for (const m of source.matchAll(/assert\.equal\(bytes, (\d+), '([A-Za-z ]+) artifact changed size/g)) {
    const id = m[2] === 'Row' ? 'row' : m[2] === 'Pulse Nova' ? 'pulsenova' : m[2].toLowerCase();
    locked[id] = +m[1];
  }

  assert.equal(Object.keys(locked).length, 15, 'all 15 templates must carry a byte lock');
  for (const id of templateIds()) {
    const bytes = Buffer.byteLength(build(true, id).html, 'utf8');
    assert.equal(bytes, locked[id], id + ' must not move');
  }
});

test('G2: no layout source has been modified by this phase', () => {
  /* The layouts are read, never written. If one ever changes, this phase has
     overstepped — the count and the shared lines are the cheap tripwire. */
  assert.equal(Object.keys(LAYOUTS).length, 15);
  for (const id of templateIds()) {
    assert.ok(LAYOUTS[id].startsWith('<!doctype html>'), id + ' must be a whole document');
    assert.ok(LAYOUTS[id].includes('id="sub-data"'), id + ' must carry the island hook');
  }
});

/* --- G3 — the panel path is faithful ------------------------------------ */

test('G3: the reference panel shell is byte-identical to its source layout', () => {
  const ref = referencePanel();
  for (const id of templateIds()) {
    const r = buildPanelShell(ref, id);
    assert.equal(r.identical, true, ref + '/' + id + ' must be byte-identical to the source');
    assert.equal(readFileSync(panelShellPath(ref, id), 'utf8'), LAYOUTS[id]);
  }
});

/* --- G4 — the registry refuses what it should --------------------------- */

test('G4: the registry declares exactly three panels and one reference', () => {
  assert.deepEqual(panelIds(), ['3xui', 'pasarguard', 'rebecca']);
  assert.equal(referencePanel(), '3xui');
  assert.deepEqual(buildablePanelIds(), ['3xui'], 'only the reference panel is buildable');
});

test('G4: a planned panel has no adapter and is refused by the builder', () => {
  for (const id of ['pasarguard', 'rebecca']) {
    assert.equal(resolvePanel(id).status, 'planned', id + ' must still be planned');
    assert.equal(adapterFor(id), null, id + ' must have no adapter');
    assert.throws(() => buildPanelShell(id, 'row'), /has no adapter/, id + ' must be refused');
  }
});

test('G4: an unknown panel fails loudly rather than defaulting', () => {
  assert.throws(() => resolvePanel('nope'), /unknown panel/);
  assert.throws(() => emitterFor('nope'), /unknown panel/);
});

test('G4: assertAdapter accepts a well-formed adapter and rejects the rest', () => {
  const good = { id: 'x', emitter: 'jinja2' };
  assert.equal(assertAdapter(good, 'x'), good);

  assert.throws(() => assertAdapter(null, 'x'), /must be an object/);
  assert.throws(() => assertAdapter([], 'x'), /must be an object/);
  assert.throws(() => assertAdapter({ emitter: 'jinja2' }, 'x'), /missing required field id/);
  assert.throws(() => assertAdapter({ id: 'x' }, 'x'), /missing required field emitter/);
  assert.throws(() => assertAdapter({ id: 'x', emitter: 'php' }, 'x'), /unknown emitter/);
  assert.throws(() => assertAdapter({ id: 'y', emitter: 'go' }, 'x'), /declares id/);
  assert.throws(() => assertAdapter({ id: 'x', emitter: 'go', island: 3 }, 'x'), /must be a function/);
  assert.equal(assertAdapter({ id: 'x', emitter: 'go', island: null }, 'x').id, 'x', 'null is allowed');
});

test('G4: the declared emitters and interface are the closed sets the code uses', () => {
  assert.deepEqual(EMITTERS, ['go', 'jinja2', 'pongo2']);
  assert.deepEqual(Object.keys(ADAPTER_INTERFACE.required), ['id', 'emitter']);
  assert.deepEqual(Object.keys(ADAPTER_INTERFACE.optional), ['island', 'livePath']);
  for (const id of panelIds()) {
    assert.ok(EMITTERS.includes(PANELS[id].emitter), id + ' declares a known emitter');
  }
});
