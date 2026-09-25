/* The Rebecca shell layer's tests.
 *
 * The same shape as the PasarGuard shell suite, over Rebecca's own fixtures and
 * its pongo2 emitter:
 *
 *   Rebecca native  ->  adapter  ->  normalized model
 *                   ->  island context  ->  pongo2 shell  ->  rendered HTML
 *
 * and then that the rendered HTML carries a contract-valid island which
 * normalizes back to the same model. Rebecca adds two things PasarGuard does
 * not have: a ZONELESS `online_at` that must be read as UTC, and an `expire`
 * that is already epoch seconds, so the two time fields differ in kind.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleShell, toIslandContext, SHELL_TOKENS } from '../tools/shell.mjs';
import { renderPongo2, renderJinja } from '../tools/render-jinja.mjs';
import { island as rebeccaIsland, onlineAtToMillis } from '../tools/adapters/rebecca.mjs';
import {
  extractIsland, validateIsland, normalizeIsland, readIsland, MODEL_FIELDS,
} from '../tools/contract.mjs';
import { templateIds } from '../tools/templates.mjs';
import { emitterFor, buildablePanelIds } from '../tools/panels.mjs';
import { transpile } from '../tools/transpile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'fixtures', 'panels', 'rebecca');

const FIXTURES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));

/* `17-unknown-status` is a refusal at the ADAPTER: it throws before rendering
   and has its own test below. (The shipped page cannot throw; it renders an
   unknown status as disabled, the way Rebecca classes it -- proven on real
   pongo2 in tests/panels-engines.test.mjs.) `08-on-hold` renders since 1.3.0. */
const THROWS = ['17-unknown-status'];

const byCase = (name) => FIXTURES.find((f) => f.doc.case === name);

/* The whole path. autoescape ON, because that is the engine the shell's contract
   assumes — the shell interpolates into HTML attributes. */
function renderPanel(doc, templateId = 'row', { autoescape = true } = {}) {
  const model = rebeccaIsland({ ...doc.native, now: doc.source.clock * 1000 });
  const shell = assembleShell('rebecca', templateId);
  return { model, shell, html: renderPongo2(shell.body, toIslandContext(model), { autoescape }) };
}

/* --- 1. the shell assembles for every template --------------------------- */

test('the Rebecca shell assembles for every template, with no token left', () => {
  for (const id of templateIds()) {
    const sh = assembleShell('rebecca', id);
    assert.equal(sh.emitter, 'pongo2');
    assert.ok(sh.bytes > 100000, id + ': a shell carries the full CSS and runtime');
    for (const token of SHELL_TOKENS) {
      assert.equal(sh.html.includes(token), false, id + ': ' + token + ' must be filled');
    }
    assert.equal(/\/\*__[A-Z][A-Z0-9_]*__\*\//.test(sh.html), false, id + ': no build marker survives');
  }
});

test('all three panels assemble, and Rebecca is one of them', () => {
  assert.deepEqual(buildablePanelIds(), ['3xui', 'pasarguard', 'rebecca']);
  assert.equal(emitterFor('rebecca'), 'pongo2');
  assert.equal(assembleShell('rebecca', 'row').emitter, 'pongo2');
});

/* --- 2/3. pongo2 syntax, and no Go syntax -------------------------------- */

test('the shell carries pongo2 block syntax', () => {
  const sh = assembleShell('rebecca', 'row');
  assert.ok(sh.html.includes('{% if '), 'block tags must be present');
  assert.ok(sh.html.includes('{% endif %}'), 'and closed');
  assert.ok(sh.html.includes('{% for ') || sh.html.includes('{% endif %}'), 'and the for form is available');
  assert.equal((sh.html.match(/\{% /g) || []).length > 20, true, 'a real number of blocks');
});

test('no Go template syntax survives anywhere', () => {
  for (const id of templateIds()) {
    const sh = assembleShell('rebecca', id);
    assert.equal(/\{\{\s*\.[A-Za-z]/.test(sh.html), false, id + ': no {{ .field }}');
    assert.equal(/\{\{\s*(?:if|else|end|range)\b/.test(sh.html), false, id + ': no {{ if }} / {{ end }}');
    assert.equal(/\{\{\s*end\s*\}\}/.test(sh.html), false, id + ': no bare {{ end }}');
  }
});

test('pongo2 and jinja2 agree for this vocabulary — the renderer alias is sound', () => {
  /* tools/render-jinja.mjs serves both engines because the transpiler emits
     neither loop metadata nor filters, the two places the dialects diverge.
     If that ever stops being true this fails, and the alias must be replaced. */
  for (const id of templateIds()) {
    const src = readFileSync(join(ROOT, 'src', 'templates', id, 'layout.html'), 'utf8');
    assert.equal(transpile(src, 'pongo2'), transpile(src, 'jinja2'), id + ': the dialects must agree here');
  }
});

/* --- 4/5/6. rendering, validation, round trip ---------------------------- */

test('the showcase page renders as a whole document', () => {
  const { html, model } = renderPanel(byCase('00-showcase').doc);
  assert.ok(html.length > 100000, 'a rendered page, not a fragment');
  assert.equal(html.startsWith('<!doctype html>'), true);
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.ok(html.includes(model.title));
  assert.ok(html.includes(model.subUrl));
});

test('every resolvable fixture renders to a contract-valid island', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    assert.deepEqual(validateIsland(extractIsland(renderPanel(doc).html)), [],
      file + ': the rendered island must validate');
  }
});

test('the rendered island normalizes back to the model it came from', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    const { html, model } = renderPanel(doc);
    const back = normalizeIsland(readIsland(extractIsland(html)));
    for (const { key } of MODEL_FIELDS) {
      if (key === 'links') continue;
      assert.deepEqual(back[key], model[key], file + ': ' + key + ' must survive the round trip');
    }
  }
});

/* --- 7. traffic values --------------------------------------------------- */

test('traffic values are preserved through to the page', () => {
  const { html, model } = renderPanel(byCase('00-showcase').doc);
  const rendered = extractIsland(html);
  assert.equal(rendered.attributes['data-download-byte'], String(model.download));
  assert.equal(rendered.attributes['data-upload-byte'], '0', 'Rebecca reports upload=0');
  assert.equal(rendered.attributes['data-total-byte'], String(model.total));
  assert.equal(model.used, model.download + model.upload);
});

test('a limited subscription keeps enabled TRUE on the page', () => {
  /* Rebecca's `limited` is not disablement — Row derives the label downstream. */
  const doc = byCase('03-limited').doc;
  const { html, model } = renderPanel(doc);
  assert.equal(model.enabled, true);
  assert.equal(extractIsland(html).attributes['data-enabled'], '1');
});

test('a disabled subscription renders as off', () => {
  const { html } = renderPanel(byCase('05-disabled').doc);
  const rendered = extractIsland(html);
  assert.equal(rendered.attributes['data-enabled'], '0');
  assert.equal(rendered.attributes['data-online'], '0');
});

test('unlimited traffic renders total 0', () => {
  const { html } = renderPanel(byCase('06-unlimited-traffic').doc);
  assert.equal(extractIsland(html).attributes['data-total-byte'], '0');
});

/* --- 8. expire stays seconds --------------------------------------------- */

test('expire stays SECONDS through to the page', () => {
  const doc = byCase('10-expire-seconds').doc;
  const { html, model } = renderPanel(doc);
  assert.equal(model.expire, doc.native.info.expire, 'no conversion may be applied');
  assert.equal(extractIsland(html).attributes['data-expire'], String(doc.native.info.expire));
  assert.ok(model.expire < 1e10, 'a second instant is 10 digits');
});

test('a never-expiring subscription renders expire 0', () => {
  const { html } = renderPanel(byCase('07-never-expires').doc);
  assert.equal(extractIsland(html).attributes['data-expire'], '0');
});

/* --- 9. online_at timezone handling -------------------------------------- */

test('the zoneless online_at reaches the page as the correct millisecond instant', () => {
  const doc = byCase('09-timezone-independence').doc;
  const { html, model } = renderPanel(doc);
  assert.equal(doc.native.info.online_at, '2026-09-18 11:58:30', 'the native form is zoneless');
  assert.equal(model.lastOnline, 1789732710000);
  assert.equal(extractIsland(html).attributes['data-last-online'], '1789732710000');
  assert.ok(model.lastOnline > 1e12, 'a millisecond instant is 13 digits');
});

test('the rendered instant is the same under any TZ', () => {
  const doc = byCase('09-timezone-independence').doc;
  const expected = 1789732710000;
  const original = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tehran', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      assert.equal(onlineAtToMillis(doc.native.info.online_at), expected, 'TZ=' + tz);
      assert.equal(extractIsland(renderPanel(doc).html).attributes['data-last-online'],
        String(expected), 'and the page agrees under TZ=' + tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('a missing online_at renders online 0 and an empty last-online', () => {
  const { html } = renderPanel(byCase('11-online-null').doc);
  const rendered = extractIsland(html);
  assert.equal(rendered.attributes['data-online'], '0');
  assert.equal(rendered.attributes['data-last-online'], '');
});

/* --- 10. base64 title ---------------------------------------------------- */

test('the base64: title is decoded before it reaches the page', () => {
  const { html, model } = renderPanel(byCase('12-base64-title').doc);
  assert.equal(model.title, 'گزارش وضعیت');
  assert.equal(extractIsland(html).attributes['data-sub-title'], 'گزارش وضعیت');
  assert.equal(html.includes('base64:'), false, 'the prefix must not survive');
});

test('Persian text survives to the page', () => {
  const { html } = renderPanel(byCase('13-persian-title').doc);
  assert.equal(extractIsland(html).attributes['data-sub-title'], 'پرمیوم ۱۰۰ گیگابایت');
});

/* --- 11. announce / support / subJson stay honest ------------------------ */

test('announce is always empty — Rebecca has no announce concept', () => {
  for (const { file, doc } of FIXTURES) {
    if (THROWS.includes(doc.case)) continue;
    assert.equal(extractIsland(renderPanel(doc).html).announce, '', file + ': announce must be empty');
  }
});

test('a missing support-url renders empty, not a default', () => {
  const { html } = renderPanel(byCase('14-missing-support').doc);
  assert.equal(extractIsland(html).attributes['data-support-url'], '');
});

test('subJsonUrl is empty — Rebecca has no JSON subscription', () => {
  const { html } = renderPanel(byCase('00-showcase').doc);
  assert.equal(extractIsland(html).attributes['data-sub-json-url'], '');
});

test('the page never carries the subscriber address', () => {
  const doc = byCase('18-ip-present').doc;
  assert.equal(doc.native.info.ip, '203.0.113.7', 'the fixture really carries an address');
  const { html } = renderPanel(doc);
  assert.equal(html.includes('203.0.113.7'), false, 'the address must not reach the page');
  assert.equal(html.includes('198.51.100.9'), false, 'nor one smuggled under another name');
  assert.equal(/data-[a-z-]*(?:ip|address)[a-z-]*=/.test(html), false);
});

/* --- 12. hostile title escaping ------------------------------------------ */

test('a hostile title is escaped by an autoescaping engine', () => {
  const doc = byCase('16-hostile-title').doc;
  const model = rebeccaIsland({ ...doc.native, now: doc.source.clock * 1000 });
  const html = renderPongo2(assembleShell('rebecca', 'row').body, toIslandContext(model), { autoescape: true });

  assert.equal(html.includes('&lt;img src=x onerror=&#34;alert(1)&#34;&gt;'), true,
    'the raw page must carry the escaped value');
  assert.equal(/data-sub-title="[^"]*<img/.test(html), false, 'the tag must not break out');
  assert.equal(extractIsland(html).attributes['data-sub-title'], '<img src=x onerror="alert(1)"> & "quoted"');
  assert.deepEqual(validateIsland(extractIsland(html)), []);
});

test('WITHOUT autoescape the layout body breaks out, so the shipped shell pins autoescape on', () => {
  /* Same finding as PasarGuard: the body interpolates into attributes, so the
     engine must escape. pongo2 escapes by default and Rebecca does not turn it
     off; the SHIPPED shell nevertheless wraps the body in an explicit
     `{% autoescape on %}` block so it stays safe if that default ever changes.
     tests/panels-engines.test.mjs renders it on real pongo2 with hostile data. */
  const doc = byCase('16-hostile-title').doc;
  const model = rebeccaIsland({ ...doc.native, now: doc.source.clock * 1000 });
  const shell = assembleShell('rebecca', 'row');
  const html = renderPongo2(shell.body, toIslandContext(model), { autoescape: false });
  const errors = validateIsland(extractIsland(html));
  assert.ok(errors.some((e) => /missing attribute/.test(e)), 'attributes are lost after the break');

  const open = shell.html.indexOf('{%- autoescape on -%}');
  const close = shell.html.lastIndexOf('{%- endautoescape %}');
  const island = shell.html.indexOf('id="sub-data"');
  assert.ok(open > 0 && open < island && island < close, 'the shipped shell escapes the whole body');
});

/* --- refusals ------------------------------------------------------------ */

test('the adapter refuses an unknown status, and renders on_hold enabled with an unknown expiry', () => {
  assert.throws(() => renderPanel(byCase('17-unknown-status').doc), /unknown status/);
  const { html } = renderPanel(byCase('08-on-hold').doc);
  const island = extractIsland(html);
  assert.deepEqual(validateIsland(island), []);
  assert.equal(island.attributes['data-enabled'], '1', 'on_hold is enabled');
  assert.equal(island.attributes['data-expire'], '', 'and its expiry is unknown, not "never"');
});

/* --- the shell is written to disk ---------------------------------------- */

test('build:panels writes the assembled shells to dist/shells/', async () => {
  const { writeShell, shellOutPath } = await import('../tools/shell.mjs');
  const r = writeShell('rebecca', 'row');
  assert.equal(existsSync(shellOutPath('rebecca', 'row')), true);
  assert.equal(readFileSync(shellOutPath('rebecca', 'row'), 'utf8'), r.html);
  assert.equal(r.html.includes('/*__STYLES__*/'), false, 'the written shell must be complete');
});

/* --- the 3X-UI artifacts are untouched ----------------------------------- */

test('the 15 frozen 3X-UI artifacts are byte-identical to their locks', async () => {
  const { build } = await import('../tools/build.mjs');
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
