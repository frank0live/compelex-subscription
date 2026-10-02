/* The built page's scripts compile.
 *
 * The runtime modules are real ES modules for the unit tests, and the build
 * concatenates them into one function scope for the page (tools/build.mjs).
 * Two modules declaring the same top-level name are fine as modules and a
 * SyntaxError as a page -- the whole app script then never runs, and no unit
 * test can see it, because each imports its module on its own. 1.4.0 met
 * exactly that in development (a second `SCHEME`), found only in a browser.
 * These tests close the gap: every script of every artifact, on every panel,
 * is compiled, and no two modules may declare the same top-level name.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { build } from '../tools/build.mjs';
import { assembleShell } from '../tools/shell.mjs';
import { templateIds } from '../tools/templates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function scripts(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

test('every script of every 3X-UI artifact compiles', () => {
  for (const id of templateIds()) {
    const bodies = scripts(build(true, id).html);
    assert.equal(bodies.length, 2, `${id}: the boot script and the app script`);
    for (const body of bodies) {
      assert.doesNotThrow(() => new vm.Script(body, { filename: `${id}.html` }), `${id}: a script does not compile`);
    }
  }
});

test('no two runtime modules declare the same top-level name', () => {
  const build = readFileSync(join(ROOT, 'tools', 'build.mjs'), 'utf8');
  const list = build.match(/const APP = \[([\s\S]*?)\];/)[1].match(/'([a-z]+\.js)'/g).map((s) => s.slice(1, -1));
  const boot = build.match(/const BOOT = \[([\s\S]*?)\];/)[1].match(/'([a-z]+\.js)'/g).map((s) => s.slice(1, -1));
  for (const group of [list, boot]) {
    const seen = new Map();
    for (const f of group) {
      const src = readFileSync(join(ROOT, 'src', 'scripts', f), 'utf8');
      for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        assert.ok(!seen.has(m[1]), `${m[1]} is declared in both ${seen.get(m[1])} and ${f}`);
        seen.set(m[1], f);
      }
    }
  }
});
