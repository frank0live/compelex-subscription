/* The template registry. The registry is the single source
   of truth every consumer — build, tests, installer, manager — agrees on, so its
   contract is tested directly: the enum is closed, availability is explicit, an
   unknown id and an unavailable id are distinguished but both refused, and the
   default is always Row. The Bash projection in installer/lib/row-template.sh
   is parsed here too, so the two lists cannot drift apart. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEMPLATES,
  DEFAULT_TEMPLATE,
  templateIds,
  availableTemplateIds,
  resolveTemplate,
} from '../tools/templates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = readFileSync(join(ROOT, 'installer', 'lib', 'row-template.sh'), 'utf8');

test('the default template is Row, and Row is the first available one', () => {
  assert.equal(DEFAULT_TEMPLATE, 'row');
  const ids = availableTemplateIds();
  assert.ok(ids.includes('row'));
  assert.equal(ids[0], 'row');
});

test('the enum is closed and every entry is well-formed', () => {
  const ids = templateIds();
  assert.ok(ids.length >= 2, 'a template enum must contain more than one entry');
  for (const id of ids) {
    const tpl = TEMPLATES[id];
    assert.equal(tpl.id, id, 'id must match its registry key');
    assert.ok(typeof tpl.name === 'string' && tpl.name.length > 0, `${id} name`);
    assert.ok(typeof tpl.order === 'number', `${id} order`);
    assert.ok(typeof tpl.available === 'boolean', `${id} availability`);
    assert.ok(typeof tpl.emitDataTemplate === 'boolean', `${id} emitDataTemplate`);
    assert.ok(Array.isArray(tpl.styles), `${id} styles`);
    for (const [path, label] of tpl.styles) {
      assert.ok(typeof path === 'string' && path.length > 0, `${id} style path`);
      assert.ok(typeof label === 'string' && label.length > 0, `${id} style label`);
    }
  }
});

test('Row is available and emits no data-template; Editorial is available and emits one', () => {
  assert.equal(TEMPLATES.row.available, true);
  assert.equal(TEMPLATES.row.emitDataTemplate, false, 'Row predates the attribute and must stay byte-identical');
  assert.equal(TEMPLATES.editorial.available, true);
  assert.equal(TEMPLATES.editorial.emitDataTemplate, true);
});

test('the selectable set is exactly the available templates, in order', () => {
  const avail = availableTemplateIds();
  const expected = templateIds()
    .filter((id) => TEMPLATES[id].available)
    .sort((a, b) => TEMPLATES[a].order - TEMPLATES[b].order);
  assert.deepEqual(avail, expected);
});

test('resolveTemplate returns a descriptor for an available id', () => {
  const tpl = resolveTemplate('editorial');
  assert.equal(tpl.id, 'editorial');
  assert.ok(tpl.styles.length > 0, 'an available template must have styles');
});

test('an unknown id is refused, an unavailable id is refused, and both are distinct errors', () => {
  assert.throws(() => resolveTemplate('does-not-exist'), /unknown template id/);
  /* A reserved id is known to the enum but not selectable this release. */
  assert.throws(() => resolveTemplate('canvas'), /not available/);
  assert.throws(() => resolveTemplate(undefined), /unknown template id/);
});

test('Row carries a full, ordered style list that is stable', () => {
  assert.deepEqual(
    TEMPLATES.row.styles.map(([, label]) => label),
    ['styles/tokens.css', 'styles/base.css', 'styles/layout.css', 'styles/components.css', 'styles/rtl.css'],
  );
});

/* The ids an operator or a config file may supply are data, not paths. None of
   these values may ever resolve, and none of them may reach the filesystem as
   a path component: the allowlist is the only route from a string to a
   template directory. */
const HOSTILE_IDS = [
  '../../etc/passwd',
  '../row',
  'row/../../x',
  'editorial;rm',
  'editorial && whoami',
  '$(command)',
  '`id`',
  'ROW<script>',
  '%2e%2e/',
  'C:\\Windows',
  '/absolute/path',
  '',
  '   ',
  'row ',
  ' row',
  'ROW',
  'Editorial',
  'row\nevil',
  'row\0',
  'row/editorial',
  'row.editorial',
  'row-editorial',
  'röw',
  'editorial ',
];

test('hostile and malformed identifiers never resolve to a template', () => {
  for (const id of HOSTILE_IDS) {
    assert.throws(() => resolveTemplate(id), /unknown template id|not available/, JSON.stringify(id));
  }
});

/* installer/lib/row-template.sh carries a Bash projection of the registry:
   RT_TEMPLATES_AVAILABLE is the selectable set and rt_template_allowed is its
   validator. Parsing them here means a template added to one side without the
   other fails the suite instead of surfacing as an install-time surprise. */
test('the Bash projection of the registry stays in lockstep with it', () => {
  const listMatch = LIB.match(/^RT_TEMPLATES_AVAILABLE="([^"]*)"$/m);
  assert.ok(listMatch, 'RT_TEMPLATES_AVAILABLE must be defined');
  const bashList = listMatch[1].trim().split(/\s+/).filter(Boolean);
  assert.deepEqual(bashList, availableTemplateIds(), 'Bash selectable set vs registry');
  assert.equal(bashList[0], DEFAULT_TEMPLATE, 'Row must be first in the Bash list');

  const fnMatch = LIB.match(/rt_template_allowed\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'rt_template_allowed must be defined');
  assert.ok(
    fnMatch[0].includes('$RT_TEMPLATES_AVAILABLE'),
    'rt_template_allowed must validate against the shared list, not its own',
  );
});

/* The strings above must be refused by the shipped Bash validator too, and
   must never be able to name a store path. (The NUL case is JS-only: it
   cannot survive argv passing to reach bash at all.) */
test('the Bash validator refuses every hostile identifier', () => {
  for (const id of HOSTILE_IDS) {
    if (id.includes('\0')) continue;
    const r = spawnSync('bash', ['-c', `set -Eeuo pipefail\nsource installer/lib/row-template.sh\nrt_template_allowed ${JSON.stringify(id)}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.notEqual(r.status, 0, `bash accepted hostile id: ${JSON.stringify(id)}`);
  }
});
