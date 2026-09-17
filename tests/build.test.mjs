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
  assert.equal(bytes, 203587, 'Editorial artifact changed size; byte-lock violated');
  const sha = createHash('sha256').update(html).digest('hex');
  assert.equal(
    sha,
    '97e32111eb79ea2ded676211dfbd7555d55f71f30b6f3d75cbad0e83cacc58ed',
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

test('the terminal artifact names its own design and shares the Row runtime', () => {
  const count = (terminal.html.match(/data-template="terminal"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(terminal.dataTemplate, 'terminal');
  assert.equal(
    outsideOfStyle(terminal.html),
    outsideOfStyle(withFont.html),
    'boot, locales, app and shell must be shared byte for byte',
  );
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

test('the pulse artifact names its own design and shares the Row runtime', () => {
  const count = (pulse.html.match(/data-template="pulse"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(pulse.dataTemplate, 'pulse');
  assert.equal(
    outsideOfStyle(pulse.html),
    outsideOfStyle(withFont.html),
    'boot, locales, app and shell must be shared byte for byte',
  );
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

test('the brutal artifact names its own design and shares the Row runtime', () => {
  const count = (brutal.html.match(/data-template="brutal"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(brutal.dataTemplate, 'brutal');
  assert.equal(
    outsideOfStyle(brutal.html),
    outsideOfStyle(withFont.html),
    'boot, locales, app and shell must be shared byte for byte',
  );
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

test('the arcade artifact names its own design and shares the Row runtime', () => {
  const count = (arcade.html.match(/data-template="arcade"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(arcade.dataTemplate, 'arcade');
  assert.equal(
    outsideOfStyle(arcade.html),
    outsideOfStyle(withFont.html),
    'boot, locales, app and shell must be shared byte for byte',
  );
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

test('the sketch artifact names its own design and shares the Row runtime', () => {
  const count = (sketch.html.match(/data-template="sketch"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(sketch.dataTemplate, 'sketch');
  assert.equal(
    outsideOfStyle(sketch.html),
    outsideOfStyle(withFont.html),
    'boot, locales, app and shell must be shared byte for byte',
  );
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
  assert.equal(bytes, 203476, 'Canvas artifact changed size; byte-lock violated');
  const sha = createHash('sha256').update(html).digest('hex');
  assert.equal(sha, '2c5c3892ebdd44dbb3755e9367bc40ade6d3034f6d951e63aa2feebd947970f2', 'Canvas artifact changed content; byte-lock violated');
});

test('the prism artifact names its own design and shares the Row runtime', () => {
  const count = (prism.html.match(/data-template="prism"/g) || []).length;
  assert.equal(count, 1, 'exactly one data-template attribute on <html>');
  assert.equal(prism.dataTemplate, 'prism');
  assert.equal(
    outsideOfStyle(prism.html),
    outsideOfStyle(withFont.html),
    'boot, locales, app and shell must be shared byte for byte',
  );
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
  assert.equal(bytes, 204417, 'Pulse Nova artifact changed size; byte-lock violated');
  const sha = createHash('sha256').update(html).digest('hex');
  assert.equal(
    sha,
    '3285990bf7d688e2a0a94c33bf6f71f6dc1a22e8cf7f6ef1060fc9e0f9293c0f',
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

/* Every frozen design is pinned here. Eight of these once had no explicit
   byte-lock at all — they were protected only by the determinism, budget and
   runtime-parity tests above, so an edit to one of their stylesheets could
   change what every subscriber sees without a single test going red. Each row
   asserts both the artifact's exact byte length and its full SHA-256 through
   the same build() the CLI and the release generator use. */
const FROZEN_ARTIFACTS = [
  ['prism', 202994, '1350083b17720628efe64d192759fdadfe082b865c9edb29f85a966b4e3fdb0c'],
  ['terminal', 202522, '26c55b8c2fdfce78d4741c22013e4e66d06b204867bde1863d6b6f08f33023e2'],
  ['pulse', 202977, 'e14e52ce964d67c34b8460ce4163a9ce7f4ca6683f456076a112d1c57621a8fa'],
  ['brutal', 202893, '8a3a7a7131dea56e9ece10b102555e0da85840ffe65545ecf8ac805b185ab950'],
  ['arcade', 202862, 'f806642e1f5d158ae9af688697483c96ef426f0696a85775dd01ad0bc61b70b0'],
  ['sketch', 202991, '02195a35a9a8447fa04bca10877e6667a627c9554d008a154febd3aeda53dceb'],
  ['signature', 202795, '7a7e584731116e1e6e858db3793052546c9c693c40981f4d21096f9db3adf7ac'],
  ['saffron', 202226, '6dc64cc0f2837010bb2c33ced8c073cd8cf768d9d71e65c15e37e8aa57a6431f'],
  ['prismnova', 202967, '992978bde5246bdf57f7d25c1628e4000b097c2f4cacd34762df0b3b565d5b85'],
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
