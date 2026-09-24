#!/usr/bin/env node
/* Builds the self-contained template/index.html from the sources in src/.
 *
 * No dependencies and no minification: the artifact is the concatenation of
 * readable sources, so a maintainer can open the installed file and still
 * recognise it. Given the same sources it produces byte-identical output.
 *
 *   node tools/build.mjs [--no-font] [--out path] [--quiet]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATES, DEFAULT_TEMPLATE, resolveTemplate, availableTemplateIds } from './templates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Concatenation order (for the shared runtime) is explicit rather than
   discovered, because both the cascade and the shared function scope depend on
   it. The stylesheet order is per-template and lives in tools/templates.mjs. */
const BOOT = ['detect.js', 'boot.js'];
const APP = [
  'model.js', 'format.js', 'url.js', 'i18n.js', 'brand.js', 'flag.js', 'config.js',
  'clipboard.js', 'qr.js', 'clients.js', 'live.js', 'render.js', 'connect.js', 'explorer.js', 'main.js',
];
const LOCALES = ['en', 'fa', 'ar', 'ru', 'zh'];

const FONT = 'fonts/vazirmatn-arabic-subset.woff2';
const VENDOR_QR = 'vendor/uqr/index.mjs';

/* Size gates: the soft target (185 KiB, a caution) and the hard refusal point
   (204,800 B). Neither may be raised — a new template that cannot fit must be
   reduced, not given headroom. */
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

/* Leading horizontal whitespace is insignificant in CSS, so the generated
   stylesheet drops it: only the left margin of each line is removed, while
   newlines, inter-token spacing, and every string are left exactly as written,
   so the cascade and every declared value are byte-for-byte unchanged. The
   guards refuse a template literal or a backslash line continuation — neither
   occurs in the stylesheet today, and either would make blind margin-stripping
   unsafe — so the transform fails loudly rather than silently if a source ever
   grows one. */
function deindent(text, label) {
  if (text.includes('`')) {
    throw new Error(`${label}: a template literal blocks de-indentation`);
  }
  if (/\\\r?\n/.test(text)) {
    throw new Error(`${label}: a line continuation blocks de-indentation`);
  }
  return text.replace(/^[ \t]+/gm, '');
}

function buildStyles(withFont, styles) {
  /* styles is a list of [path, banner label] from the template registry. The
     label is what appears in the artifact, so Row's historical labels are what
     keep its bytes stable; new templates pick their own. */
  let css = styles.map(([path, label]) => banner(label) + read(...path.split('/'))).join('\n');

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
  return deindent(stripComments(css), 'styles');
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

/* The layout contract. Every template layout must expose exactly one copy of
   each hook the shared runtime addresses by id; the runtime never learns
   which layout rendered it. */
const REQUIRED_HOOKS = [
  'announce-slot', 'announce-source', 'bar-slot', 'brand-mark', 'brand-name',
  'client-list', 'config-canvas', 'config-close', 'config-conf',
  'config-conf-copy', 'config-conf-download', 'config-conf-download-label',
  'config-conf-label', 'config-conf-text', 'config-copy', 'config-copy-done',
  'config-copy-label', 'config-dialog', 'config-frame', 'config-hint',
  'config-list', 'config-open', 'config-open-label', 'config-title',
  'config-toggle', 'config-toggle-label', 'config-url', 'connect',
  'connect-hint', 'connect-title', 'copy-btn', 'copy-btn-done',
  'copy-btn-label', 'expiry-caption', 'expiry-value', 'explorer',
  'explorer-count', 'explorer-empty', 'explorer-hint', 'explorer-search',
  'explorer-search-wrap', 'explorer-title', 'i18n-data', 'lang-code',
  'lang-menu', 'lang-trigger', 'links-source', 'live-region', 'live-state',
  'meta-theme-color', 'plan-slot', 'platform-tabs', 'qr-btn', 'qr-btn-label',
  'qr-canvas', 'qr-close', 'qr-copy', 'qr-copy-done', 'qr-copy-label',
  'qr-dialog', 'qr-frame', 'qr-hint', 'qr-title', 'qr-url', 'state-label',
  'state-pill', 'status-heading', 'sub-data', 'support-label', 'support-link',
  'support-slot', 'theme-icon', 'theme-menu', 'theme-trigger', 'toast',
  'traffic-caption', 'traffic-trailing', 'traffic-value', 'updated-slot',
];

/* Validate a template-specific layout against the contract. The shared shell
   is grandfathered: it is frozen output and predates the contract. */
function validateLayout(html) {
  const missing = [];
  const duplicated = [];
  for (const hook of REQUIRED_HOOKS) {
    const n = html.split(`id="${hook}"`).length - 1;
    if (n === 0) missing.push(hook);
    if (n > 1) duplicated.push(hook);
  }
  if (missing.length) {
    throw new Error(`layout is missing required runtime hooks: ${missing.join(', ')}`);
  }
  if (duplicated.length) {
    throw new Error(`layout duplicates required runtime hooks: ${duplicated.join(', ')}`);
  }
}

/* Layout selection: a template may ship its own build-time layout markup
   (src/templates/<id>/layout.html); everything else uses the shared shell.
   Selection happens at build time only; the artifact stays self-contained. */
function loadLayout(templateId) {
  const templateLayout = join(ROOT, 'src', 'templates', templateId, 'layout.html');
  if (existsSync(templateLayout)) {
    const layout = readFileSync(templateLayout, 'utf8');
    validateLayout(layout);
    return layout;
  }
  return read('src', 'index.html');
}

function build(withFont, templateId = DEFAULT_TEMPLATE) {
  /* templateId comes from the closed registry enum. An unknown or unavailable
     id throws here (see resolveTemplate), so the build can never produce an
     artifact whose template it did not intend. */
  const tpl = resolveTemplate(templateId);
  const styles = buildStyles(withFont, tpl.styles);
  const boot = buildBoot();
  const app = buildApp();
  const locales = buildLocales();

  let html = loadLayout(templateId);
  const shell = Buffer.byteLength(html, 'utf8');

  html = substitute(html, '/*__STYLES__*/', styles);
  html = substitute(html, '/*__BOOT__*/', boot);
  html = substitute(html, '/*__LOCALES__*/', locales);
  html = substitute(html, '/*__APP__*/', app);

  /* Template hook on <html>. Row predates the attribute and must stay
     byte-identical to the v1.1.0 artifact, so its attribute is removed whole;
     every other template substitutes its id into it. */
  if (tpl.emitDataTemplate) {
    html = substitute(html, '__TEMPLATE_ID__', tpl.id);
  } else {
    html = html.replace(' data-template="__TEMPLATE_ID__"', '');
  }
  if (html.includes('__TEMPLATE_ID__')) {
    throw new Error('unsubstituted template id token remains');
  }

  /* Our own markers only. The vendored encoder carries #__PURE__ annotations
     inside its own comments, which are not ours to substitute. */
  const leftover = html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//);
  if (leftover) throw new Error(`unsubstituted build marker: ${leftover[0]}`);
  if (!html.includes('/* row:branding */')) {
    throw new Error('branding marker missing from the artifact');
  }

  /* The served page identifies its own design for the manager to verify; Row is
     the one template that deliberately has no attribute. */
  const dataTemplate = (html.match(/data-template="([^"]+)"/) || [])[1] || null;

  return {
    html,
    templateId: tpl.id,
    dataTemplate,
    sizes: [
      ['html shell', shell],
      ['css', Buffer.byteLength(styles, 'utf8')],
      ['boot js', Buffer.byteLength(boot, 'utf8')],
      ['app js', Buffer.byteLength(app, 'utf8')],
      ['locales', Buffer.byteLength(locales, 'utf8')],
    ],
  };
}

/* The committed artifact for the default template stays at its historical
   path; any other template's build lands under dist/templates/<id>, which is
   the release layout the installer ships and verifies against. */
function defaultOut(templateId) {
  if (templateId === DEFAULT_TEMPLATE) {
    return join(ROOT, 'template', 'index.html');
  }
  return join(ROOT, 'dist', 'templates', templateId, 'template.html');
}

/* The two size lines from the directive. A template past the hard ceiling
   fails the build; past the soft target it only reports, so the growth stays
   visible without blocking. Neither value may be raised. */
function budgetStatus(total) {
  if (total > FAIL_BYTES) return 'FAIL';
  if (total > WARN_BYTES) return 'WARN';
  return 'OK';
}

function sha256(html) {
  return createHash('sha256').update(html, 'utf8').digest('hex');
}

function buildOne(withFont, templateId, outPath, quiet) {
  const result = build(withFont, templateId);
  const total = Buffer.byteLength(result.html, 'utf8');
  const sha = sha256(result.html);
  const status = budgetStatus(total);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result.html);

  if (!quiet) {
    const label = withFont ? 'with embedded font' : 'system fonts only';
    process.stdout.write(`${outPath.replace(ROOT + '\\', '').replace(ROOT + '/', '')}  (${templateId}, ${label})\n`);
    for (const [name, bytes] of result.sizes) {
      process.stdout.write(`  ${name.padEnd(12)}${kib(bytes).padStart(10)}\n`);
    }
    process.stdout.write(`  ${'total'.padEnd(12)}${kib(total).padStart(10)}\n`);
    process.stdout.write(`  sha256      ${sha}\n`);
    process.stdout.write(`  budget      ${status} (soft ${kib(WARN_BYTES)}, hard ${kib(FAIL_BYTES)})\n`);
  }

  if (status === 'FAIL') {
    process.stderr.write(`\nTemplate ${templateId}: artifact is ${kib(total)}; the ceiling is ${kib(FAIL_BYTES)}. It must be reduced.\n`);
  }

  return { result, total, sha, status };
}

function main(argv) {
  /* The release tooling needs the selectable set as data, without building. */
  if (argv.includes('--list')) {
    process.stdout.write(`${availableTemplateIds().join('\n')}\n`);
    return;
  }

  const withFont = !argv.includes('--no-font');
  const quiet = argv.includes('--quiet');

  const outFlag = argv.indexOf('--out');
  const outPath = outFlag > -1 && argv[outFlag + 1]
    ? resolve(process.cwd(), argv[outFlag + 1])
    : null;

  /* --template <id> and --template=<id> are both accepted, so a script can
     choose whichever it finds clearer. */
  const spaceFlag = argv.indexOf('--template');
  const eqArg = argv.find((a) => a.startsWith('--template='));
  const templateId = spaceFlag > -1 ? argv[spaceFlag + 1]
    : eqArg ? eqArg.slice('--template='.length)
    : null;

  const matrix = argv.includes('--all');

  if (matrix && templateId) {
    throw new Error('--all cannot be combined with --template');
  }
  if (matrix && outPath) {
    throw new Error('--all cannot be combined with --out');
  }

  let ids;
  if (matrix) ids = availableTemplateIds();
  else if (templateId) ids = [templateId];
  else ids = [DEFAULT_TEMPLATE];

  let failed = false;
  for (const id of ids) {
    const out = outPath || defaultOut(id);
    const r = buildOne(withFont, id, out, quiet);
    if (r.status === 'FAIL') failed = true;
  }

  if (failed) process.exit(1);
}

export { build, buildLocales, stripModuleSyntax, validateLayout, REQUIRED_HOOKS };

/* Exported for the panel shell layer (tools/shell.mjs).
 *
 * A panel shell is assembled from the SAME styles, boot, app and locales the
 * 3X-UI artifacts use, so that a PasarGuard page and a 3X-UI page cannot drift
 * apart in their CSS or their shared runtime. Duplicating that assembly in the
 * panel layer would have made exactly that drift possible, so the functions are
 * exported instead.
 *
 * This is purely additive: these are build-side helpers, never inlined into an
 * artifact by name, so exporting them cannot move a byte of any template. The
 * artifact comparison in the verification step proves it. */
export { buildStyles, buildBoot, buildApp, substitute, loadLayout };

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Build failed: ${err.message}\n`);
    process.exit(1);
  }
}
