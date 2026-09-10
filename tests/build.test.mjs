/* The build. Two properties matter to anyone installing this template: the same
   sources always produce the same bytes, and the artifact is a whole document
   with nothing left to substitute. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, buildLocales, stripModuleSyntax } from '../tools/build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* UX-SPEC.md 25.5: the target and the refusal point. */
const TARGET_BYTES = 185 * 1024;
const FAIL_BYTES = 200 * 1024;

const withFont = build(true);
const noFont = build(false);

function bytes(html) {
  return Buffer.byteLength(html, 'utf8');
}

test('the same sources produce the same bytes', () => {
  assert.equal(build(true).html, withFont.html);
  assert.equal(build(false).html, noFont.html);
  assert.equal(buildLocales(), buildLocales());
});

test('both artifacts are whole documents with nothing left to substitute', () => {
  for (const [label, result] of [['with font', withFont], ['no font', noFont]]) {
    const html = result.html;
    assert.ok(html.startsWith('<!doctype html>'), label);
    assert.ok(html.trimEnd().endsWith('</html>'), label);
    assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null, label);
    assert.equal((html.match(/<style>/g) || []).length, 1, label);
    assert.equal((html.match(/<script(?: |>)/g) || []).length, 3, label);
    assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1, label);
    assert.equal((html.match(/\/\* row:branding end \*\//g) || []).length, 1, label);
  }
});

test('--no-font removes the face and the payload, not just the file', () => {
  assert.ok(withFont.html.includes('row:font-face'));
  assert.ok(withFont.html.includes('font/woff2;base64,'));
  assert.ok(!noFont.html.includes('row:font-face'));
  assert.ok(!noFont.html.includes('woff2'));
  assert.ok(!withFont.html.includes('__FONT_BASE64__'));
  assert.ok(!noFont.html.includes('__FONT_BASE64__'));
  assert.ok(bytes(noFont.html) < bytes(withFont.html) - 30 * 1024);
});

test('the artifact stays inside its size budget', () => {
  const total = bytes(withFont.html);
  /* UX-SPEC.md 25.5 draws two lines: a soft target and a hard refusal point.
     The refusal point is the gate — past it the artifact is rejected, exactly
     as tools/build.mjs exits non-zero. The target is a caution, not a failure:
     crossing it (as the v1.1.0 Configuration Explorer does) is surfaced so the
     growth stays visible, but only the refusal point fails the suite. */
  assert.ok(total <= FAIL_BYTES, `${(total / 1024).toFixed(1)} KiB exceeds the refusal point`);
  assert.ok(bytes(noFont.html) <= FAIL_BYTES);
  if (total > TARGET_BYTES) {
    console.warn(`  note: artifact is ${(total / 1024).toFixed(1)} KiB, over the ${TARGET_BYTES / 1024} KiB target`);
  }
});

test('the locale island is one escaped, stable, complete JSON object', () => {
  const island = buildLocales();
  assert.ok(!island.includes('<'), 'a "</script" cannot be written into the island');

  const cats = JSON.parse(island.split('\\u003c').join('<'));
  assert.deepEqual(Object.keys(cats), ['en', 'fa', 'ar', 'ru', 'zh']);

  const base = Object.keys(cats.en);
  assert.deepEqual(base, [...base].sort(), 'sorted, so an edit cannot reorder the bundle');
  for (const code of Object.keys(cats)) {
    assert.deepEqual(Object.keys(cats[code]), base, `${code} key order and key set`);
  }
});

/* Concatenating the modules into one scope is the build's only real trick, so
   what it does to module syntax is stated rather than assumed. */
test('module syntax is removed, and unsupported syntax is refused', () => {
  const source = [
    "import { a, b } from './x.js';",
    "import './side-effect.js';",
    'export function f() {',
    '  return 1;',
    '}',
    'export const c = 2;',
    'let notExported = 3;',
    "const text = 'the word export in a string';",
  ].join('\n');

  const out = stripModuleSyntax(source, 'x.js');
  assert.ok(!/^import\b/m.test(out));
  assert.ok(!/^export\b/m.test(out));
  assert.ok(out.includes('function f() {'));
  assert.ok(out.includes('const c = 2;'));
  assert.ok(out.includes('let notExported = 3;'));
  assert.ok(out.includes("const text = 'the word export in a string';"));

  for (const bad of ['export default f;', 'export { f };', 'export * from "./x.js";']) {
    assert.throws(() => stripModuleSyntax(bad, 'x.js'), /unsupported module syntax/, bad);
  }
});

/* Every module the build concatenates is also imported directly by these tests,
   so a syntax error would fail here; what this asserts is that the file checked
   in under template/ is the one the current sources produce. */
test('the committed artifact is not stale', () => {
  let artifact;
  try {
    artifact = readFileSync(join(ROOT, 'template', 'index.html'), 'utf8');
  } catch (err) {
    assert.equal(err.code, 'ENOENT', err.message);
    return;
  }
  assert.ok(
    artifact === withFont.html || artifact === noFont.html,
    'template/index.html differs from the sources: run node tools/build.mjs',
  );
});

/* Row is the immutable reference build: it must come out at exactly the
   committed size and checksum. Any refactor that silently changes the bytes —
   an added attribute, a moved banner, a reordered file — fails here before it
   can drift the released v1.1.0 artifact. */
test('the default (Row) build is byte-locked to the v1.1.0 artifact', () => {
  const html = build(true).html;
  const bytes = Buffer.byteLength(html, 'utf8');
  const sha = createHash('sha256').update(html).digest('hex');

  assert.equal(bytes, 202976, 'Row artifact changed size; byte-lock violated');
  assert.equal(
    sha,
    '2120e116e8f20677a8cdf602131436acecc9493be76da98b0379141a2e751cf6',
    'Row artifact changed content; byte-lock violated',
  );

  /* The hook token must never leak into Row's output. */
  assert.equal(html.includes('__TEMPLATE_ID__'), false, '"__TEMPLATE_ID__" leaked into Row');
  assert.equal(/\bdata-template\b/.test(html), false, 'Row must not carry a data-template attribute');
});

/* A template is a stylesheet swap on a fixed runtime: everything outside the
   one <style> element — shell, boot script, locales, app script — has to be
   byte-identical between any two templates. If this ever fails, a template
   has started carrying its own JavaScript or DOM, which the architecture
   forbids: the shared runtime is what keeps every artifact inside its budget. */
const editorial = build(true, 'editorial');

function outsideOfStyle(html) {
  const open = html.indexOf('<style>');
  const close = html.indexOf('</style>') + '</style>'.length;
  /* The data-template attribute is the one sanctioned outside difference: it
     is the hook that names the design on the served page. */
  return html.slice(0, open).replace(/ data-template="([a-z0-9]+)"/, '') + html.slice(close);
}

test('the editorial build is deterministic, whole and inside the budget', () => {
  const html = editorial.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'editorial').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the editorial artifact names its own design and Row names none', () => {
  const count = (editorial.html.match(/data-template="editorial"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(editorial.dataTemplate, 'editorial');
  assert.equal(withFont.dataTemplate, null);
});

test('a template differs from Row only inside the style element', () => {
  assert.equal(
    outsideOfStyle(editorial.html),
    outsideOfStyle(withFont.html),
    'boot, locales, app and shell must be shared byte for byte',
  );
});
