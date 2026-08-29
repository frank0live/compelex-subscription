#!/usr/bin/env node
/* Builds the self-contained template/index.html from the sources in src/.
 *
 * No dependencies and no minification: the artifact is the concatenation of
 * readable sources, so a maintainer can open the installed file and still
 * recognise it. Given the same sources it produces byte-identical output.
 *
 *   node tools/build.mjs [--no-font] [--out path] [--quiet]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Concatenation order is explicit rather than discovered, because both the
   cascade and the shared function scope depend on it. */
const STYLES = ['tokens.css', 'base.css', 'layout.css', 'components.css', 'rtl.css'];
const BOOT = ['detect.js', 'boot.js'];
const APP = [
  'model.js', 'format.js', 'url.js', 'i18n.js', 'brand.js', 'clipboard.js',
  'qr.js', 'clients.js', 'live.js', 'render.js', 'connect.js', 'main.js',
];
const LOCALES = ['en', 'fa', 'ar', 'ru', 'zh'];

const FONT = 'fonts/vazirmatn-arabic-subset.woff2';
const VENDOR_QR = 'vendor/uqr/index.mjs';

const WARN_BYTES = 185 * 1024;
const FAIL_BYTES = 200 * 1024;

const FONT_FACE_OPEN = '/* row:font-face */';
const FONT_FACE_CLOSE = '/* row:font-face end */';

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

function banner(label) {
  return `/* ---- ${label} ---- */\n`;
}

/* The sources are real ES modules so that tests can import them directly.
   Concatenation puts them in one shared scope, which makes the import and
   export keywords both redundant and illegal, so they are removed here. */
function stripModuleSyntax(code, label) {
  const out = code
    .replace(/^import[^\n;]*;[ \t]*\r?\n/gm, '')
    .replace(/^export[ \t]+(?=(?:function|const|let|var|class)\b)/gm, '');
  const leftover = out.match(/^[ \t]*(?:import|export)\b.*$/m);
  if (leftover) {
    throw new Error(`${label}: unsupported module syntax: ${leftover[0].trim()}`);
  }
  return out;
}

/* Comments are written for whoever maintains the sources, and src/ keeps every
   one of them. The artifact is what a subscriber's phone downloads over a
   metered connection, so it carries only the two kinds the build itself relies
   on: the per-file banners that make it navigable and the row: markers.

   Whole lines only, which is what makes this safe without a tokeniser: no
   source file here contains a template literal, so a line whose first
   characters are a comment opener cannot be inside a string, and a regular
   expression cannot span a line either. A comment written beside code on the
   same line is left alone, and a line that ends a comment and then continues
   with code fails the build rather than being guessed at. */
const KEEP_COMMENT = /^\/\*+\s*(?:row:|----)/;

function stripComments(text) {
  const out = [];
  let inBlock = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (inBlock || trimmed.startsWith('/*')) {
      const closes = trimmed.endsWith('*/');
      if (trimmed.includes('*/') && !closes) {
        throw new Error(`code follows a comment on one line: ${trimmed}`);
      }
      if (!inBlock && KEEP_COMMENT.test(trimmed)) {
        out.push(line);
        continue;
      }
      inBlock = !closes;
      continue;
    }
    if (trimmed.startsWith('//')) continue;
    out.push(line);
  }

  if (inBlock) throw new Error('unterminated comment');
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function buildStyles(withFont) {
  let css = STYLES.map((f) => banner(`styles/${f}`) + read('src', 'styles', f)).join('\n');

  const open = css.indexOf(FONT_FACE_OPEN);
  const close = css.indexOf(FONT_FACE_CLOSE);
  if (open < 0 || close < open) throw new Error('tokens.css: font-face markers not found');

  if (withFont) {
    const base64 = readFileSync(join(ROOT, 'src', FONT)).toString('base64');
    css = css.replace('__FONT_BASE64__', base64);
    if (css.includes('__FONT_BASE64__')) throw new Error('font placeholder appears twice');
  } else {
    css = css.slice(0, open) + css.slice(close + FONT_FACE_CLOSE.length);
    if (css.includes('__FONT_BASE64__')) throw new Error('font-face block left a placeholder');
  }
  return stripComments(css);
}

function buildBoot() {
  const parts = BOOT.map(
    (f) => banner(`scripts/${f}`) + stripModuleSyntax(stripComments(read('src', 'scripts', f)), f),
  );
  return `(function () {\n'use strict';\n\n${parts.join('\n')}\n})();\n`;
}

function buildApp() {
  /* The encoder keeps its own scope: it is upstream code and should not have
     to coexist with our identifiers. Only encode() is taken out of it, and it
     travels verbatim, comments and licence header included. */
  const vendor = read('src', VENDOR_QR).replace(/^export\s*\{[^}]*\};?[ \t]*\r?\n?/gm, '');
  if (/^\s*(?:import|export)\b/m.test(vendor)) {
    throw new Error('vendor/uqr: unexpected module syntax');
  }

  const parts = APP.map(
    (f) => banner(`scripts/${f}`) + stripModuleSyntax(stripComments(read('src', 'scripts', f)), f),
  );

  return [
    '(function () {',
    "'use strict';",
    '',
    banner('vendor/uqr 0.1.3 - see src/vendor/uqr/INTEGRITY') + 'var uqr = (function () {',
    vendor,
    'return { encode: encode };',
    '})();',
    '',
    parts.join('\n'),
    '})();',
    '',
  ].join('\n');
}

function buildLocales() {
  const cats = {};
  for (const code of LOCALES) {
    try {
      cats[code] = JSON.parse(read('src', 'locales', `${code}.json`));
    } catch (err) {
      throw new Error(`locales/${code}.json: ${err.message}`);
    }
  }

  const base = Object.keys(cats.en).sort();
  const problems = [];
  for (const code of LOCALES) {
    const keys = Object.keys(cats[code]);
    const missing = base.filter((k) => !(k in cats[code]));
    const extra = keys.filter((k) => !base.includes(k));
    const blank = keys.filter((k) => typeof cats[code][k] !== 'string' || !cats[code][k].trim());
    if (missing.length) problems.push(`${code}: missing ${missing.join(', ')}`);
    if (extra.length) problems.push(`${code}: not present in en: ${extra.join(', ')}`);
    if (blank.length) problems.push(`${code}: empty ${blank.join(', ')}`);
  }
  if (problems.length) throw new Error(`locale catalogues disagree\n  ${problems.join('\n  ')}`);

  /* Sorted keys keep the bundle stable however the files are edited. */
  const bundle = {};
  for (const code of LOCALES) {
    bundle[code] = {};
    for (const key of base) bundle[code][key] = cats[code][key];
  }
  return escapeForScript(JSON.stringify(bundle));
}

/* A JSON island is safe inside <script> until it contains "</script". The
   parser stops at the first "</", so escaping every "<" removes the whole
   class of problem and JSON.parse still sees the same text. */
function escapeForScript(json) {
  return json.split('<').join('\\u003c');
}

function substitute(html, token, value) {
  const parts = html.split(token);
  if (parts.length !== 2) {
    throw new Error(`src/index.html: expected exactly one ${token}, found ${parts.length - 1}`);
  }
  return parts.join(value);
}

function kib(n) {
  return `${(n / 1024).toFixed(1)} KiB`;
}

function build(withFont) {
  const styles = buildStyles(withFont);
  const boot = buildBoot();
  const app = buildApp();
  const locales = buildLocales();

  let html = read('src', 'index.html');
  const shell = Buffer.byteLength(html, 'utf8');

  html = substitute(html, '/*__STYLES__*/', styles);
  html = substitute(html, '/*__BOOT__*/', boot);
  html = substitute(html, '/*__LOCALES__*/', locales);
  html = substitute(html, '/*__APP__*/', app);

  /* Our own markers only. The vendored encoder carries #__PURE__ annotations
     inside its own comments, which are not ours to substitute. */
  const leftover = html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//);
  if (leftover) throw new Error(`unsubstituted build marker: ${leftover[0]}`);
  if (!html.includes('/* row:branding */')) {
    throw new Error('branding marker missing from the artifact');
  }

  return {
    html,
    sizes: [
      ['html shell', shell],
      ['css', Buffer.byteLength(styles, 'utf8')],
      ['boot js', Buffer.byteLength(boot, 'utf8')],
      ['app js', Buffer.byteLength(app, 'utf8')],
      ['locales', Buffer.byteLength(locales, 'utf8')],
    ],
  };
}

function main(argv) {
  const withFont = !argv.includes('--no-font');
  const quiet = argv.includes('--quiet');
  const outFlag = argv.indexOf('--out');
  const outPath = outFlag > -1 && argv[outFlag + 1]
    ? resolve(process.cwd(), argv[outFlag + 1])
    : join(ROOT, 'template', 'index.html');

  const result = build(withFont);
  const total = Buffer.byteLength(result.html, 'utf8');

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result.html);

  if (!quiet) {
    const label = withFont ? 'with embedded font' : 'system fonts only';
    process.stdout.write(`${outPath.replace(ROOT + '\\', '').replace(ROOT + '/', '')}  (${label})\n`);
    for (const [name, bytes] of result.sizes) {
      process.stdout.write(`  ${name.padEnd(12)}${kib(bytes).padStart(10)}\n`);
    }
    process.stdout.write(`  ${'total'.padEnd(12)}${kib(total).padStart(10)}\n`);
  }

  if (total > FAIL_BYTES) {
    process.stderr.write(`\nArtifact is ${kib(total)}; the budget is ${kib(FAIL_BYTES)}.\n`);
    process.exit(1);
  }
  if (total > WARN_BYTES && !quiet) {
    process.stderr.write(`\nWarning: ${kib(total)} exceeds the ${kib(WARN_BYTES)} target.\n`);
  }
}

export { build, buildLocales, stripModuleSyntax };

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Build failed: ${err.message}\n`);
    process.exit(1);
  }
}
