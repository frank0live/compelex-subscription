/* The build. Two properties matter to anyone installing this template: the same
   sources always produce the same bytes, and the artifact is a whole document
   with nothing left to substitute. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, buildLocales, stripModuleSyntax, REQUIRED_HOOKS } from '../tools/build.mjs';
import { TEMPLATES, templateIds, coreTemplateIds, lockedTemplateIds } from '../tools/templates.mjs';

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

  assert.equal(bytes, 201258, 'Row artifact changed size; byte-lock violated');
  assert.equal(
    sha,
    '9694504337c27dacae2b6e9e2b2954b03560ae44761f514ff7f051718ba66776',
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

/* Editorial ships its own layout, so its shell markup legitimately differs from
   Row's — the same arrangement Canvas, Signature and Saffron already have. What
   must never differ is the shared runtime, and what the layout must still honour
   is the build's hook contract. The last assertion is the one that keeps the
   mobile reading order honest: source order IS the phone's order, so the grid
   may place regions that are already in that order but may never reorder them
   with the `order` property. */
test('the editorial layout satisfies the hook contract, shares the Row runtime, and reorders nothing in CSS', () => {
  for (const hook of REQUIRED_HOOKS) {
    const n = editorial.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(editorial.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(editorial.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  /* `order` is matched only as a whole declaration name: the "order" inside
     `border` is preceded by a letter, so it cannot trip this. */
  const style = editorial.html.slice(
    editorial.html.indexOf('<style>'), editorial.html.indexOf('</style>'));
  assert.equal(/(^|[;{\s])order\s*:/.test(style), false,
    'the editorial grid must not use the order property; DOM order is the mobile order');

  /* The reading order the phone gets, and therefore the order the document has
     to be written in. */
  const sequence = [
    'plan-slot', 'traffic-value', 'state-pill', 'copy-btn',
    'explorer', 'connect', 'announce-slot', 'support-slot',
  ];
  let previous = -1;
  for (const id of sequence) {
    const at = editorial.html.indexOf(`id="${id}"`);
    assert.ok(at > previous, `#${id} must follow the region before it in source order`);
    previous = at;
  }

  /* Dialogs and the toast are page furniture, not part of the column. */
  const mainEnd = editorial.html.indexOf('</main>');
  for (const id of ['qr-dialog', 'config-dialog', 'toast']) {
    assert.ok(editorial.html.indexOf(`id="${id}"`) > mainEnd, `#${id} must stay outside <main>`);
  }
});

/* Editorial is frozen: the magazine composition is the approved design, so the
   artifact is pinned to the exact bytes it was approved at. A change to the
   layout, the grid or the component rules has to be a deliberate one that
   updates this lock, not a drift nobody noticed. */
test('the editorial artifact is byte-locked to the approved magazine design', () => {
  const html = build(true, 'editorial').html;
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.equal(bytes, 204107, 'Editorial artifact changed size; byte-lock violated');
  const sha = createHash('sha256').update(html).digest('hex');
  assert.equal(
    sha,
    '407b6008019975c3ce768db064bf9268795f2ccb24d3627e4040f2e9f502a8fd',
    'Editorial artifact changed content; byte-lock violated',
  );
});

/* Canvas is the third design: same guarantees, its own budget line. It must
   also land meaningfully below the refusal point — headroom is part of the
   design, not an accident to be spent later. */
const canvas = build(true, 'canvas');

test('the canvas build is deterministic, whole and inside its budget', () => {
  const html = canvas.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'canvas').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the canvas budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the canvas artifact names its own design and shares the Row runtime JS', () => {
  const count = (canvas.html.match(/data-template="canvas"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(canvas.dataTemplate, 'canvas');
  // Canvas ships its own layout.html, so the shell markup legitimately
  // differs; parity is asserted on the shared runtime itself.
  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(canvas.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(canvas.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');
});

/* Prism is the fourth design: same guarantees, its own budget line. */
const prism = build(true, 'prism');

test('the prism build is deterministic, whole and inside its budget', () => {
  const html = prism.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'prism').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the prism budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

/* Terminal is the fifth design: same guarantees, its own budget line. */
const terminal = build(true, 'terminal');

test('the terminal build is deterministic, whole and inside its budget', () => {
  const html = terminal.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'terminal').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the terminal budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

/* Terminal owns its layout: the session sheet is its own document, so the
   shared-shell assertion that used to stand here is obsolete. The contract it
   must meet is the independent-layout one - it owns its DOM, and everything
   that is not layout stays shared byte for byte. */
test('the terminal sheet owns its own DOM and shares the Row runtime', () => {
  const count = (terminal.html.match(/data-template="terminal"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(terminal.dataTemplate, 'terminal');

  assert.notEqual(
    outsideOfStyle(terminal.html),
    outsideOfStyle(withFont.html),
    'the session sheet must own its layout, not reuse the shared shell',
  );

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(terminal.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(terminal.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  /* Owning a layout must not mean owning a script. */
  assert.equal((terminal.html.match(/<script(?: |>)/g) || []).length, 3,
    'owning a layout must not introduce per-template JavaScript');

  for (const hook of REQUIRED_HOOKS) {
    const n = terminal.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
});

/* Pulse is the sixth design: same guarantees, its own budget line. */
const pulse = build(true, 'pulse');

test('the pulse build is deterministic, whole and inside its budget', () => {
  const html = pulse.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'pulse').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the pulse budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

/* Pulse owns its layout: the signal flow is its own document, so the
   shared-shell assertion that used to stand here is obsolete. The contract it
   must meet is the independent-layout one - it owns its DOM, and everything
   that is not layout stays shared byte for byte. */
test('the pulse flow owns its own DOM and shares the Row runtime', () => {
  const count = (pulse.html.match(/data-template="pulse"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(pulse.dataTemplate, 'pulse');

  assert.notEqual(
    outsideOfStyle(pulse.html),
    outsideOfStyle(withFont.html),
    'the signal flow must own its layout, not reuse the shared shell',
  );

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(pulse.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(pulse.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  assert.equal((pulse.html.match(/<script(?: |>)/g) || []).length, 3,
    'owning a layout must not introduce per-template JavaScript');

  for (const hook of REQUIRED_HOOKS) {
    const n = pulse.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
});

/* Brutal is the seventh design: same guarantees, its own budget line. */
const brutal = build(true, 'brutal');

test('the brutal build is deterministic, whole and inside its budget', () => {
  const html = brutal.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'brutal').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the brutal budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

/* Brutal owns its layout too: the poster board is its own document, so the
   shared-shell assertion that used to stand here is obsolete. Same contract as
   Terminal: own the DOM, share everything that is not layout. */
test('the brutal board owns its own DOM and shares the Row runtime', () => {
  const count = (brutal.html.match(/data-template="brutal"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(brutal.dataTemplate, 'brutal');

  assert.notEqual(
    outsideOfStyle(brutal.html),
    outsideOfStyle(withFont.html),
    'the poster board must own its layout, not reuse the shared shell',
  );

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(brutal.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(brutal.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  assert.equal((brutal.html.match(/<script(?: |>)/g) || []).length, 3,
    'owning a layout must not introduce per-template JavaScript');

  for (const hook of REQUIRED_HOOKS) {
    const n = brutal.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
});

/* Arcade is the eighth design: same guarantees, its own budget line. */
const arcade = build(true, 'arcade');

test('the arcade build is deterministic, whole and inside its budget', () => {
  const html = arcade.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'arcade').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the arcade budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

/* Arcade owns its layout: the selection screen is its own document, so the
   shared-shell assertion that used to stand here is obsolete. The contract it
   must meet is the independent-layout one - it owns its DOM, and everything
   that is not layout stays shared byte for byte. */
test('the arcade screen owns its own DOM and shares the Row runtime', () => {
  const count = (arcade.html.match(/data-template="arcade"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(arcade.dataTemplate, 'arcade');

  assert.notEqual(
    outsideOfStyle(arcade.html),
    outsideOfStyle(withFont.html),
    'the selection screen must own its layout, not reuse the shared shell',
  );

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(arcade.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(arcade.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  assert.equal((arcade.html.match(/<script(?: |>)/g) || []).length, 3,
    'owning a layout must not introduce per-template JavaScript');

  for (const hook of REQUIRED_HOOKS) {
    const n = arcade.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
});

/* Sketch is the ninth design: same guarantees, its own budget line. */
const sketch = build(true, 'sketch');

test('the sketch build is deterministic, whole and inside its budget', () => {
  const html = sketch.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'sketch').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the sketch budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

/* Sketch owns its layout too: the blueprint sheet is its own document, so the
   shared-shell assertion that used to stand here is obsolete. Same contract as
   Arcade: own the DOM, share everything that is not layout. */
test('the sketch sheet owns its own DOM and shares the Row runtime', () => {
  const count = (sketch.html.match(/data-template="sketch"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(sketch.dataTemplate, 'sketch');

  assert.notEqual(
    outsideOfStyle(sketch.html),
    outsideOfStyle(withFont.html),
    'the blueprint sheet must own its layout, not reuse the shared shell',
  );

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(sketch.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(sketch.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  assert.equal((sketch.html.match(/<script(?: |>)/g) || []).length, 3,
    'owning a layout must not introduce per-template JavaScript');

  for (const hook of REQUIRED_HOOKS) {
    const n = sketch.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
});

/* Signature is the tenth design: it also ships its own layout, so besides the
   usual guarantees its artifact must satisfy the layout hook contract. */
const signature = build(true, 'signature');

test('the signature build is deterministic, whole and inside its budget', () => {
  const html = signature.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'signature').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the signature budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the signature artifact names its own design, satisfies the hook contract, and shares the Row runtime JS', () => {
  const count = (signature.html.match(/data-template="signature"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(signature.dataTemplate, 'signature');
  for (const hook of REQUIRED_HOOKS) {
    const n = signature.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
  // Signature's layout markup legitimately differs, so parity is asserted on
  // the shared runtime itself: boot script, app script and locale island must
  // be byte-identical to Row's.
  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(signature.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(signature.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');
});

/* Saffron is the eleventh design: same guarantees, its own budget line. */
const saffron = build(true, 'saffron');

test('the saffron build is deterministic, whole and inside its budget', () => {
  const html = saffron.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'saffron').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 203 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the saffron budget line`);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the saffron artifact names its own design, satisfies the hook contract, and shares the Row runtime JS', () => {
  const count = (saffron.html.match(/data-template="saffron"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(saffron.dataTemplate, 'saffron');
  for (const hook of REQUIRED_HOOKS) {
    const n = saffron.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(saffron.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(saffron.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');
});

test('the canvas artifact is byte-locked to the approved design', () => {
  const html = build(true, 'canvas').html;
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.equal(bytes, 202598, 'Canvas artifact changed size; byte-lock violated');
  const sha = createHash('sha256').update(html).digest('hex');
  assert.equal(sha, '122ccfb1238a1265e7f1878ac862bb7ede8c7e6aff691f4599d043dcf1e3aefa', 'Canvas artifact changed content; byte-lock violated');
});

/* Prism owns its layout: the faceted sheet is its own document, so the
   shared-shell assertion that used to stand here is obsolete. The contract it
   must meet is the independent-layout one - it owns its DOM, and everything
   that is not layout stays shared byte for byte. */
test('the prism sheet owns its own DOM and shares the Row runtime', () => {
  const count = (prism.html.match(/data-template="prism"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(prism.dataTemplate, 'prism');

  /* Own the DOM, positively: a regression back to the shared shell fails here. */
  assert.notEqual(
    outsideOfStyle(prism.html),
    outsideOfStyle(withFont.html),
    'the faceted sheet must own its layout, not reuse the shared shell',
  );

  /* The two script bodies are compared as a pair, so a change to either the boot
     script or the app script fails. */
  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(prism.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(prism.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  assert.equal((prism.html.match(/<script(?: |>)/g) || []).length, 3,
    'owning a layout must not introduce per-template JavaScript');

  for (const hook of REQUIRED_HOOKS) {
    const n = prism.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }
});

/* Pulse Nova is the twelfth design and the second to ship a layout of its own:
   a live-dashboard composition whose source order is the phone's reading order.
   It carries the same guarantees as every other template — the shared runtime
   byte for byte, the full hook contract, and no CSS reordering. */
const pulsenova = build(true, 'pulsenova');

test('the pulsenova build is deterministic, whole and inside its budget', () => {
  const html = pulsenova.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'pulsenova').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the pulsenova layout satisfies the hook contract, shares the Row runtime, and reorders nothing in CSS', () => {
  const count = (pulsenova.html.match(/data-template="pulsenova"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(pulsenova.dataTemplate, 'pulsenova');

  for (const hook of REQUIRED_HOOKS) {
    const n = pulsenova.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(pulsenova.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(pulsenova.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  const style = pulsenova.html.slice(
    pulsenova.html.indexOf('<style>'), pulsenova.html.indexOf('</style>'));
  assert.equal(/(^|[;{\s])order\s*:/.test(style), false,
    'the pulsenova layout must not use the order property; DOM order is the mobile order');

  /* The reading order the design fixes: header, hero, status, usage, actions,
     nodes, clients, announcements. */
  const sequence = [
    'brand-mark', 'state-pill', 'updated-slot', 'traffic-value', 'copy-btn',
    'explorer', 'connect', 'announce-slot',
  ];
  let previous = -1;
  for (const id of sequence) {
    const at = pulsenova.html.indexOf(`id="${id}"`);
    assert.ok(at > previous, `#${id} must follow the region before it in source order`);
    previous = at;
  }

  const mainEnd = pulsenova.html.indexOf('</main>');
  for (const id of ['qr-dialog', 'config-dialog', 'toast']) {
    assert.ok(pulsenova.html.indexOf(`id="${id}"`) > mainEnd, `#${id} must stay outside <main>`);
  }
});

/* Pulse Nova is frozen at the design it was reviewed and approved at. Its
   margin under the refusal point is the tightest of any template, so this lock
   is also the thing that will catch an innocent-looking rule creeping it over. */
test('the pulsenova artifact is byte-locked to the approved dashboard design', () => {
  const html = build(true, 'pulsenova').html;
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.equal(bytes, 204526, 'Pulse Nova artifact changed size; byte-lock violated');
  const sha = createHash('sha256').update(html).digest('hex');
  assert.equal(
    sha,
    'c8c1f27201d717028b5994d02422f4d7fcb13ef60a856a556828969c39e0c6b2',
    'Pulse Nova artifact changed content; byte-lock violated',
  );
});

/* Prism Nova is the thirteenth design and the third to ship a layout of its own:
   a two-pane console whose inline-start spine becomes a faceplate band on a
   phone. It carries the same guarantees as every other template — the shared
   runtime byte for byte, the full hook contract, and no CSS reordering. Its
   byte-lock is deliberately deferred to the freeze phase. */
const prismnova = build(true, 'prismnova');

test('the prismnova build is deterministic, whole and inside its budget', () => {
  const html = prismnova.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'prismnova').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the prismnova console satisfies the hook contract, shares the Row runtime, and reorders nothing in CSS', () => {
  const count = (prismnova.html.match(/data-template="prismnova"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(prismnova.dataTemplate, 'prismnova');

  for (const hook of REQUIRED_HOOKS) {
    const n = prismnova.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(prismnova.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(prismnova.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  const style = prismnova.html.slice(
    prismnova.html.indexOf('<style>'), prismnova.html.indexOf('</style>'));
  assert.equal(/(^|[;{\s])order\s*:/.test(style), false,
    'the prismnova console must not use the order property; DOM order is the mobile order');

  /* The reading order the design fixes: masthead, then the instrument spine
     (identity, state, usage, expiry, actions), then the bay (matrix, ports,
     band). The spine is the faceplate on a phone and the side column on a
     desktop — the same order in both, so focus order never diverges. */
  const sequence = [
    'brand-mark', 'status-heading', 'plan-slot', 'state-pill',
    'traffic-value', 'bar-slot', 'expiry-value', 'copy-btn',
    'explorer', 'connect', 'announce-slot', 'support-slot',
  ];
  let previous = -1;
  for (const id of sequence) {
    const at = prismnova.html.indexOf(`id="${id}"`);
    assert.ok(at > previous, `#${id} must follow the region before it in source order`);
    previous = at;
  }

  const mainEnd = prismnova.html.indexOf('</main>');
  for (const id of ['qr-dialog', 'config-dialog', 'toast']) {
    assert.ok(prismnova.html.indexOf(`id="${id}"`) > mainEnd, `#${id} must stay outside <main>`);
  }
});

/* Terminal Nova is the fourteenth design and the fourth to ship a layout of its
   own: an operational command workspace whose full-bleed command bar sits
   outside the constrained column, with a side-by-side session readout and a
   two-pane resource workspace beneath it. Same guarantees as every other
   template: the shared runtime byte for byte, the full hook contract, and no
   CSS reordering. Its byte-lock is deferred to the freeze phase. */
const terminalnova = build(true, 'terminalnova');

test('the terminalnova build is deterministic, whole and inside its budget', () => {
  const html = terminalnova.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'terminalnova').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the terminalnova console satisfies the hook contract, shares the Row runtime, and reorders nothing in CSS', () => {
  const count = (terminalnova.html.match(/data-template="terminalnova"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(terminalnova.dataTemplate, 'terminalnova');

  for (const hook of REQUIRED_HOOKS) {
    const n = terminalnova.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(terminalnova.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(terminalnova.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  const style = terminalnova.html.slice(
    terminalnova.html.indexOf('<style>'), terminalnova.html.indexOf('</style>'));
  assert.equal(/(^|[;{\s])order\s*:/.test(style), false,
    'the terminalnova console must not use the order property; DOM order is the mobile order');

  /* The command bar is a real full-width document region, so it must not be
     built with a viewport unit, a negative margin or a transform - any of which
     can produce a horizontal scrollbar. */
  assert.equal(/100vw|margin-inline:\s*-|translateX/.test(style), false,
    'the full-bleed command bar must not use 100vw, negative margins or transforms');

  /* The reading order the design fixes: command bar, then the session console
     (status, plan, traffic, expiry, actions), then the resource workspace
     (directory, launcher), then the system notice. The desktop split places
     those regions; it never reorders them, so focus order never diverges. */
  const sequence = [
    'brand-mark', 'state-pill', 'status-heading', 'plan-slot',
    'traffic-value', 'bar-slot', 'expiry-value', 'updated-slot', 'copy-btn',
    'explorer', 'connect', 'announce-slot', 'support-slot',
  ];
  let previous = -1;
  for (const id of sequence) {
    const at = terminalnova.html.indexOf(`id="${id}"`);
    assert.ok(at > previous, `#${id} must follow the region before it in source order`);
    previous = at;
  }

  const mainEnd = terminalnova.html.indexOf('</main>');
  for (const id of ['qr-dialog', 'config-dialog', 'toast']) {
    assert.ok(terminalnova.html.indexOf(`id="${id}"`) > mainEnd, `#${id} must stay outside <main>`);
  }
});

/* Arcade Nova is the fifteenth design: one cabinet frame, one inset bezel
   screen, a cartridge rail of slots and a lower control/system bay. Same
   guarantees as every other template: the shared runtime byte for byte, the
   full hook contract, and no CSS reordering. Its byte-lock is deferred to the
   freeze phase. */
const arcadenova = build(true, 'arcadenova');

test('the arcadenova build is deterministic, whole and inside its budget', () => {
  const html = arcadenova.html;
  const bytes = Buffer.byteLength(html, 'utf8');

  assert.equal(build(true, 'arcadenova').html, html, 'same sources must produce the same bytes');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal(html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//), null);
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.equal((html.match(/<script(?: |>)/g) || []).length, 3);
  assert.equal((html.match(/\/\* row:branding \*\//g) || []).length, 1);
  assert.ok(bytes <= 200 * 1024, `${(bytes / 1024).toFixed(1)} KiB exceeds the 200 KiB refusal point`);
});

test('the arcadenova cabinet satisfies the hook contract, shares the Row runtime, and reorders nothing in CSS', () => {
  const count = (arcadenova.html.match(/data-template="arcadenova"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(arcadenova.dataTemplate, 'arcadenova');

  for (const hook of REQUIRED_HOOKS) {
    const n = arcadenova.html.split(`id="${hook}"`).length - 1;
    assert.equal(n, 1, `hook id="${hook}" must appear exactly once`);
  }

  const scriptBodies = (html) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const islandOf = (html) =>
    html.match(/<script type="application\/json" id="i18n-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(scriptBodies(arcadenova.html), scriptBodies(withFont.html),
    'boot and app scripts must be shared byte for byte');
  assert.equal(islandOf(arcadenova.html), islandOf(withFont.html),
    'the locale island must be shared byte for byte');

  const style = arcadenova.html.slice(
    arcadenova.html.indexOf('<style>'), arcadenova.html.indexOf('</style>'));
  assert.equal(/(^|[;{\s])order\s*:/.test(style), false,
    'the arcadenova cabinet must not use the order property; DOM order is the mobile order');

  /* The cabinet is a framed document region, so it must not be built with a
     viewport unit, a negative margin or a transform - any of which can produce
     a horizontal scrollbar. */
  assert.equal(/100vw|margin-inline:\s*-|translateX/.test(style), false,
    'the cabinet must not use 100vw, negative margins or transforms');

  /* The reading order the design fixes: marquee, then the bezel screen (status,
     plan, figure, gauge, expiry, actions), then the cartridge rail, then the
     lower bay (control mode, system). The bay split only places those regions;
     it never reorders them, so focus order never diverges. */
  const sequence = [
    'brand-mark', 'state-pill', 'status-heading', 'plan-slot',
    'traffic-value', 'bar-slot', 'expiry-value', 'updated-slot', 'copy-btn',
    'explorer', 'connect', 'announce-slot', 'support-slot',
  ];
  let previous = -1;
  for (const id of sequence) {
    const at = arcadenova.html.indexOf(`id="${id}"`);
    assert.ok(at > previous, `#${id} must follow the region before it in source order`);
    previous = at;
  }

  const mainEnd = arcadenova.html.indexOf('</main>');
  for (const id of ['qr-dialog', 'config-dialog', 'toast']) {
    assert.ok(arcadenova.html.indexOf(`id="${id}"`) > mainEnd, `#${id} must stay outside <main>`);
  }
});

/* Every frozen design is pinned here. Eight of these once had no explicit
   byte-lock at all — they were protected only by the determinism, budget and
   runtime-parity tests above, so an edit to one of their stylesheets could
   change what every subscriber sees without a single test going red. Each row
   asserts both the artifact's exact byte length and its full SHA-256 through
   the same build() the CLI and the release generator use. */
const FROZEN_ARTIFACTS = [
  ['prism', 202386, 'dd6a45eb8ba2e706c521a9542032c39a95bce1d7b8444c5b9fec4c135d33134b'],
  ['terminal', 199901, '75bd73accaddb403a7d657685f9a4d0d6b2e51da461a8efafe5a29b30ab6f4ba'],
  ['pulse', 202334, 'f29c3ff07dcf9eaff2959607823439824f455d082e1771ff4371a8b00106ac7f'],
  ['brutal', 202792, '6d676cdad52ff61c65b4a249093c6d6a2e9f8ac52efcff2efe84b176a4fa9731'],
  ['arcade', 203292, '71e1141e427fa1de5d081ef580e6878c1d507c69ecd6bf186140b657f5904e53'],
  ['sketch', 202334, '6ef86fc952a17632d9496141cdf9af57cca8bf31d9d39627af24347c9eb2a4d5'],
  ['signature', 203938, '5d103d8956c25ce598148bf48797b83bf83c81a28b04729aaeae83af17381a9d'],
  ['saffron', 203316, '78f20de84e635f0f2c75e7436537c5187f21e3067528c81c243e47e56ad99274'],
  ['prismnova', 203226, 'c6eb485fdcf3fb66c5c705eb2f897b176c5fbc0c684b3ff624289714421708cd'],
  ['terminalnova', 203203, 'afd6ed22a69450915f87fb7dcdfa7b2f8ee47da65f3896ae57ad73d2e00b587a'],
  ['arcadenova', 203569, 'adb9b1088d8b3d492536cc883f53b806da54a5d2a2d749934fadf611964f450e'],
];

for (const [id, bytes, sha] of FROZEN_ARTIFACTS) {
  test(`the ${id} artifact is byte-locked to its approved design`, () => {
    const html = build(true, id).html;
    assert.equal(
      Buffer.byteLength(html, 'utf8'), bytes,
      `${id} artifact changed size; byte-lock violated`,
    );
    assert.equal(
      createHash('sha256').update(html).digest('hex'), sha,
      `${id} artifact changed content; byte-lock violated`,
    );
  });
}

/* --- the frozen set and the template tier ---------------------------------
   The frozen set is core-only. The FROZEN_ARTIFACTS table holds eleven of the
   fifteen; the other four hold individual locks above. These assertions pin both
   the membership and the size, so a future custom template can never enter the
   frozen set by accident. */
const INDIVIDUALLY_LOCKED = ['row', 'editorial', 'canvas', 'pulsenova'];

test('the frozen set is exactly the fifteen core templates, and a custom template can never enter it', () => {
  const tableIds = FROZEN_ARTIFACTS.map(([id]) => id);
  const frozen = [...tableIds, ...INDIVIDUALLY_LOCKED];

  assert.equal(new Set(frozen).size, frozen.length, 'a template must not be locked twice');

  assert.deepEqual(
    [...frozen].sort(),
    [...coreTemplateIds()].sort(),
    'the frozen set must be exactly the core templates',
  );

  for (const id of frozen) {
    assert.equal(TEMPLATES[id].tier, 'core', `${id} is in the frozen set so it must be core`);
    assert.equal(TEMPLATES[id].locked, true, `${id} is in the frozen set so it must be locked`);
  }

  assert.equal(coreTemplateIds().length, 15, 'exactly fifteen core templates ship in this release');
  assert.equal(lockedTemplateIds().length, 15, 'every core template is locked');

  /* Structural exclusion: the table is a literal array and the build reads only
     `styles` and `emitDataTemplate`, so no registry entry can add itself to the
     frozen set. If a custom template ever appears here, this fails. */
  for (const id of templateIds()) {
    if (TEMPLATES[id].tier === 'custom') {
      assert.ok(!frozen.includes(id), `${id} is custom and must never be byte-locked`);
    }
  }
});
