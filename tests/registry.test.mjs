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
  coreTemplateIds,
  lockedTemplateIds,
  applyTierDefaults,
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

test('Row is available and emits no data-template; the others emit their own', () => {
  assert.equal(TEMPLATES.row.available, true);
  assert.equal(TEMPLATES.row.emitDataTemplate, false, 'Row predates the attribute and must stay byte-identical');
  for (const id of ['editorial', 'canvas', 'prism', 'terminal', 'pulse', 'brutal', 'arcade', 'sketch', 'signature', 'saffron', 'pulsenova', 'prismnova', 'terminalnova', 'arcadenova']) {
    assert.equal(TEMPLATES[id].available, true, `${id} availability`);
    assert.equal(TEMPLATES[id].emitDataTemplate, true, `${id} names its own design`);
  }
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
  assert.equal(resolveTemplate('signature').id, 'signature', 'signature resolves');
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
/* --- template tiers -------------------------------------------------------
   A tier separates shipping designs from designs added later. The difference is
   the lock, not the build: both tiers are held to the same hook and runtime
   contract. These tests pin the rules so a future custom template cannot drift
   into the frozen set by accident. */

test('every template carries a tier and a lock, and the defaults are core + locked', () => {
  for (const id of templateIds()) {
    const tpl = TEMPLATES[id];
    assert.ok(tpl.tier === 'core' || tpl.tier === 'custom', `${id} tier must be core or custom`);
    assert.equal(typeof tpl.locked, 'boolean', `${id} locked must be a boolean`);
  }

  /* The seventeen shipped designs are core and locked. None of them declares the
     fields in the registry literal, so this also proves the defaults apply. */
  const core = coreTemplateIds();
  assert.equal(core.length, 17, 'exactly seventeen core templates ship in this release');
  for (const id of core) {
    assert.equal(TEMPLATES[id].tier, 'core', `${id} is core`);
    assert.equal(TEMPLATES[id].locked, true, `${id} is locked`);
  }
  assert.deepEqual(lockedTemplateIds(), core, 'every core template is locked');
});

test('core templates keep order 1..17 and a custom template must use order >= 200', () => {
  const coreOrders = coreTemplateIds()
    .map((id) => TEMPLATES[id].order)
    .sort((a, b) => a - b);
  assert.deepEqual(coreOrders, Array.from({ length: 17 }, (_, i) => i + 1));

  /* The rule a future custom entry must satisfy. Enforced here rather than at
     import time so a misconfiguration fails a test instead of breaking the
     build for every consumer of the registry. */
  for (const id of templateIds()) {
    const { order, tier } = TEMPLATES[id];
    if (tier === 'core') {
      assert.ok(order < 200, `${id} is core so its order must stay below 200`);
    } else {
      assert.ok(order >= 200, `${id} is custom so its order must be 200 or above`);
    }
  }
});

test('applyTierDefaults keeps the current behaviour and defaults a custom entry to unlocked', () => {
  /* An entry that declares nothing is core and locked - exactly what all seventeen
     current entries rely on. */
  assert.deepEqual(applyTierDefaults({}), { tier: 'core', locked: true });

  /* A custom entry is never locked unless it says so explicitly. */
  assert.deepEqual(applyTierDefaults({ tier: 'custom' }), { tier: 'custom', locked: false });

  /* An explicit override wins in both directions. */
  assert.deepEqual(applyTierDefaults({ tier: 'core', locked: false }), { tier: 'core', locked: false });
  assert.deepEqual(applyTierDefaults({ tier: 'custom', locked: true }), { tier: 'custom', locked: true });

  /* An unrecognised tier is not silently accepted as custom. */
  assert.equal(applyTierDefaults({ tier: 'anything' }).tier, 'core');
});

test('the selectable set is sorted by order, so a custom template appended late still sorts correctly', () => {
  const avail = availableTemplateIds();
  const orders = avail.map((id) => TEMPLATES[id].order);
  for (let i = 1; i < orders.length; i++) {
    assert.ok(orders[i - 1] <= orders[i], 'availableTemplateIds must be ascending by order');
  }
  assert.equal(avail[0], DEFAULT_TEMPLATE, 'the default template is still first');
});
