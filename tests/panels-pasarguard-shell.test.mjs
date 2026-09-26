/* The PasarGuard shell layer's tests.
 *
 * These prove the WHOLE path, not a fragment of it:
 *
 *   PasarGuard native  ->  adapter  ->  normalized model
 *                      ->  island context  ->  Jinja2 shell  ->  rendered HTML
 *
 * and then that the rendered HTML carries a contract-valid island which
 * normalizes back to the same model it came from. That round trip is the
 * strongest statement available: it says the page a PasarGuard subscriber would
 * receive carries exactly the figures the panel reported.
 *
 * The renderer is tools/render-jinja.mjs — a test-only stand-in for the panel's
 * own Jinja2. It handles only the closed vocabulary the transpiler emits, so it
 * renders the shell's BODY: the transpiled layout, fed the island context
 * directly. The shipped document adds a prelude that derives that context from
 * PasarGuard's own page context, and an autoescape block; that whole document
 * is rendered by real Jinja2 in tests/panels-engines.test.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleShell, toIslandContext, SHELL_TOKENS } from '../tools/shell.mjs';
import { renderJinja } from '../tools/render-jinja.mjs';
import { island as pasarguardIsland } from '../tools/adapters/pasarguard.mjs';
import {
  extractIsland, validateIsland, normalizeIsland, readIsland, validateModel, MODEL_FIELDS,
} from '../tools/contract.mjs';
import { templateIds } from '../tools/templates.mjs';
import { emitterFor } from '../tools/panels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'fixtures', 'panels', 'pasarguard');

const FIXTURES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));

/* The fixtures whose expectation is a refusal — they throw before rendering. */
const THROWS = ['08-on-hold'];

const byCase = (name) => FIXTURES.find((f) => f.doc.case === name);

/* The whole path, in one call.
 *
 * `autoescape` defaults ON here, because that is the engine the shell's contract
 * assumes: Go's html/template always escapes, and the shell interpolates values
 * into HTML attributes. The unescaped case is exercised deliberately by its own
 * test below, which records what happens on an engine that does not escape. */
function renderPanel(doc, templateId = 'row', { autoescape = true } = {}) {
  const model = pasarguardIsland({ ...doc.native, now: doc.source.clock * 1000 });
  const shell = assembleShell('pasarguard', templateId);
  return { model, shell, html: renderJinja(shell.body, toIslandContext(model), { autoescape }) };
}

/* --- the shell assembles ------------------------------------------------- */

test('the PasarGuard shell assembles for every template, with no token left', () => {
  for (const id of templateIds()) {
    const sh = assembleShell('pasarguard', id);
    assert.equal(sh.emitter, 'jinja2');
    assert.ok(sh.bytes > 100000, id + ': a shell carries the full CSS and runtime');
    for (const token of SHELL_TOKENS) {
      assert.equal(sh.html.includes(token), false, id + ': ' + token + ' must be filled');
    }
    assert.equal(/\/\*__[A-Z][A-Z0-9_]*__\*\//.test(sh.html), false, id + ': no build marker survives');
  }
});

test('the shell is a real Jinja2 document, not a Go one', () => {
  const sh = assembleShell('pasarguard', 'row');
  assert.ok(sh.html.includes('{% if '), 'Jinja2 block tags must be present');
  assert.ok(sh.html.includes('{% endif %}'), 'and closed');
  assert.equal(/\{\{\s*\.[A-Za-z]/.test(sh.html), false, 'no Go field syntax may survive');
  assert.equal(/\{\{\s*(?:if|else|end|range)\b/.test(sh.html), false, 'no Go tag may survive');
  assert.equal(sh.html.startsWith('<!doctype html>'), true);
});

test('the shell carries the same CSS and runtime as the 3X-UI build', () => {
  /* Both are assembled from tools/build.mjs, so the panel cannot drift from the
     product in its styling or its shared runtime. */
  const sh = assembleShell('pasarguard', 'row');
  const style = sh.html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(style && style[1].length > 50000, 'the CSS cascade must be inlined');
  assert.equal(sh.html.includes('/* row:branding */'), true, 'the branding marker must survive');
  assert.equal(sh.html.includes('id="sub-data"'), true, 'the island hook must be present');
  assert.equal(sh.html.includes('id="links-source"'), true);
  assert.equal(sh.html.includes('id="announce-source"'), true);
});

test('a non-buildable panel cannot have a shell assembled', () => {
  assert.throws(() => assembleShell('nope', 'row'), /unknown panel/);
  assert.equal(emitterFor('pasarguard'), 'jinja2');
});

/* --- 1. the showcase page renders ---------------------------------------- */

test('the showcase page renders', () => {
  const { html, model } = renderPanel(byCase('00-showcase').doc);
  assert.ok(html.length > 100000, 'a rendered page, not a fragment');
  assert.equal(html.startsWith('<!doctype html>'), true);
  assert.ok(html.trimEnd().endsWith('</html>'), 'and it is a whole document');
  assert.ok(html.includes(model.title), 'the title reaches the page');
  assert.ok(html.includes(model.subUrl), 'and the subscription URL');
});

test('every resolvable fixture renders to a contract-valid island', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    const { html } = renderPanel(doc);
    const rendered = extractIsland(html);
    assert.deepEqual(validateIsland(rendered), [], file + ': the rendered island must validate');
  }
});

test('the rendered island normalizes back to the model it came from', () => {
  /* The round trip is the proof: what a subscriber's browser reads is what the
     panel reported. */
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    const { html, model } = renderPanel(doc);
    const back = normalizeIsland(readIsland(extractIsland(html)));
    for (const { key } of MODEL_FIELDS) {
      if (key === 'links') continue;
      assert.deepEqual(back[key], model[key], file + ': ' + key + ' must survive the round trip');
    }
    assert.deepEqual(validateModel(back), [], file + ': and the round-tripped model must validate');
  }
});

/* --- 2. traffic values are correct --------------------------------------- */

test('traffic values reach the page as the panel reported them', () => {
  const { html, model } = renderPanel(byCase('00-showcase').doc);
  const rendered = extractIsland(html);
  assert.equal(rendered.attributes['data-download-byte'], String(model.download));
  assert.equal(rendered.attributes['data-upload-byte'], '0', 'PasarGuard reports upload=0');
  assert.equal(rendered.attributes['data-total-byte'], String(model.total));

  /* And no split is invented anywhere in the rendered page. */
  assert.equal(model.download, model.used, 'the combined counter lands in download');
  assert.equal(model.used, model.download + model.upload);
});

test('an exhausted subscription renders its full usage, not zero', () => {
  const { html, model } = renderPanel(byCase('05-traffic-exhausted').doc);
  const rendered = extractIsland(html);
  assert.equal(rendered.attributes['data-total-byte'], String(model.total));
  assert.equal(Number(rendered.attributes['data-download-byte']), model.total, 'used equals the limit');
});

test('unlimited traffic renders as 0, which the runtime reads as no limit', () => {
  const { html } = renderPanel(byCase('06-unlimited-traffic').doc);
  assert.equal(extractIsland(html).attributes['data-total-byte'], '0');
});

/* --- 3. expire handling is correct --------------------------------------- */

test('expire reaches the page in SECONDS, unconverted', () => {
  const doc = byCase('19-expire-seconds-vs-ms').doc;
  const { html, model } = renderPanel(doc);
  assert.equal(extractIsland(html).attributes['data-expire'], String(1789732900));
  assert.equal(model.expire, 1789732900);
  assert.ok(model.expire < 1e10, 'a second instant is 10 digits');
});

test('lastOnline reaches the page in MILLISECONDS, and the two units stay distinct', () => {
  const doc = byCase('19-expire-seconds-vs-ms').doc;
  const { html, model } = renderPanel(doc);
  assert.equal(extractIsland(html).attributes['data-last-online'], String(1789732600000));
  assert.ok(model.lastOnline > 1e12, 'a millisecond instant is 13 digits');
  assert.notEqual(model.expire, model.lastOnline);
});

test('a never-expiring subscription renders expire 0', () => {
  const { html } = renderPanel(byCase('07-never-expires').doc);
  assert.equal(extractIsland(html).attributes['data-expire'], '0');
});

/* --- 4. title and base64 handling ---------------------------------------- */

test('the base64: title is decoded before it reaches the page', () => {
  const { html, model } = renderPanel(byCase('13-title-encoded').doc);
  assert.equal(model.title, 'گزارش وضعیت');
  assert.equal(extractIsland(html).attributes['data-sub-title'], 'گزارش وضعیت');
  assert.equal(html.includes('base64:'), false, 'the prefix must not survive into the page');
});

test('the announce container is decoded and rendered', () => {
  const { html } = renderPanel(byCase('12-announce-encoded').doc);
  assert.equal(extractIsland(html).announce, 'Line one.\nLine two.');
});

test('a hostile title is escaped by an autoescaping engine', () => {
  /* The shell interpolates the title into an HTML ATTRIBUTE, so the engine must
     escape it. Go's html/template always does; PasarGuard's Jinja2 does NOT,
     because its environment is built without autoescape. This test pins the
     shell's expectation against the engine that satisfies it. */
  const doc = byCase('15-hostile-title').doc;
  const model = pasarguardIsland({ ...doc.native, now: doc.source.clock * 1000 });
  const shell = assembleShell('pasarguard', 'row');
  const html = renderJinja(shell.body, toIslandContext(model), { autoescape: true });

  /* The raw HTML carries the escaped form, so the attribute cannot terminate
     early. */
  assert.equal(html.includes('&lt;img src=x onerror=&#34;alert(1)&#34;&gt;'), true,
    'the raw page must carry the escaped value');
  assert.equal(/data-sub-title="[^"]*<img/.test(html), false, 'the tag must not break out of the attribute');

  /* And a DOM reader — modelled by extractIsland, which decodes entities —
     hands back the original string, so the island round-trips. */
  assert.equal(extractIsland(html).attributes['data-sub-title'],
    '<img src=x onerror="alert(1)"> & "quoted"');
  assert.deepEqual(validateIsland(extractIsland(html)), [], 'and the island still validates');
});

test('WITHOUT autoescape the layout body breaks out, so the shipped shell wraps it in an autoescape block', () => {
  /* The finding, and its fix. The layout BODY, rendered by an engine that does
     not escape, produces an attribute the parser terminates early -- the island
     loses its remaining attributes. PasarGuard's Jinja2 environment is
     `Environment(loader=...)` with no autoescape, so the body alone is unsafe
     there. The SHIPPED shell therefore puts the body inside an explicit
     `{% autoescape true %}` block; tests/panels-engines.test.mjs renders that
     document with real Jinja2 and hostile data and proves nothing breaks out. */
  const doc = byCase('15-hostile-title').doc;
  const model = pasarguardIsland({ ...doc.native, now: doc.source.clock * 1000 });
  const shell = assembleShell('pasarguard', 'row');
  const html = renderJinja(shell.body, toIslandContext(model));

  const errors = validateIsland(extractIsland(html));
  assert.ok(errors.length > 0, 'an unescaped attribute must visibly damage the island');
  assert.ok(errors.some((e) => /missing attribute/.test(e)), 'attributes are lost after the break');

  const open = shell.html.indexOf('{%- autoescape true -%}');
  const close = shell.html.lastIndexOf('{%- endautoescape %}');
  const island = shell.html.indexOf('id="sub-data"');
  assert.ok(open > 0 && open < island && island < close, 'the shipped shell escapes the whole body');
  const inner = shell.body.slice(shell.body.indexOf('\n') + 1, shell.body.lastIndexOf('</html>'));
  assert.equal(shell.html.includes(inner), true,
    'and the body inside the block is exactly the rendered-and-tested body');
});

/* --- 5. unsupported fields are not invented ------------------------------ */

test('announce is empty when the panel has none — no placeholder is substituted', () => {
  const { html } = renderPanel(byCase('11-no-announce').doc);
  assert.equal(extractIsland(html).announce, '');
});

test('a missing support-url renders empty, not a default', () => {
  const { html } = renderPanel(byCase('10-no-support').doc);
  assert.equal(extractIsland(html).attributes['data-support-url'], '');
});

test('subJsonUrl is empty — PasarGuard has no JSON subscription', () => {
  const { html } = renderPanel(byCase('00-showcase').doc);
  assert.equal(extractIsland(html).attributes['data-sub-json-url'], '');
});

test('the page never carries the subscriber address', () => {
  const { html } = renderPanel(byCase('17-ip-present').doc);
  assert.equal(html.includes('203.0.113.7'), false, 'the address must not reach the page');
  assert.equal(/data-[a-z-]*(?:ip|address)[a-z-]*=/.test(html), false);
});

test('no field outside the contract is rendered into the island', () => {
  const { html } = renderPanel(byCase('00-showcase').doc);
  const rendered = extractIsland(html);
  const known = new Set(['data-enabled', 'data-online', 'data-download-byte', 'data-upload-byte',
    'data-total-byte', 'data-expire', 'data-last-online', 'data-sub-url', 'data-sub-json-url',
    'data-sub-clash-url', 'data-sub-title', 'data-support-url', 'data-datepicker']);
  for (const attr of Object.keys(rendered.attributes)) {
    assert.ok(known.has(attr), 'the island must not gain ' + attr);
  }
});

test('on_hold renders enabled, with the hold duration as a pending expiry', () => {
  /* Decided for 1.3.0 (docs/design/PANEL-ON-HOLD-DECISION.md): the clock of
     an on_hold subscription starts on the first connection, which is exactly
     Row's negative-expire encoding. */
  const doc = byCase('08-on-hold').doc;
  const { html } = renderPanel(doc);
  const island = extractIsland(html);
  assert.deepEqual(validateIsland(island), []);
  assert.equal(island.attributes['data-enabled'], '1');
  assert.equal(island.attributes['data-expire'], String(-doc.native.info.on_hold_expire_duration));
});

/* --- the 3X-UI artifacts are untouched ----------------------------------- */

test('the 17 frozen 3X-UI artifacts are byte-identical to their locks', async () => {
  const { build } = await import('../tools/build.mjs');
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
