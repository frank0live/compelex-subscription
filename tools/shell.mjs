/* The panel shell layer.
 *
 * A "shell" is a layout with its five build placeholders filled in — the same
 * document the 3X-UI build produces, but written in the dialect of another
 * panel's template engine. The pipeline is:
 *
 *   src/templates/<id>/layout.html      the canonical shell (Go template)
 *        -> tools/transpile.mjs         rewrites the block syntax
 *        -> this module                 fills the placeholders
 *        -> dist/panels/<panel>/<id>/   a complete, renderable shell
 *
 * WHY THE PLACEHOLDERS MATTER
 *
 * A transpiled layout is NOT a shell. It still carries the five build tokens —
 * the styles, boot, locales and app markers and the template id — which the
 * 3X-UI build substitutes. Until they are filled, the document is a template of
 * a template and cannot be served.
 *
 * The styles, boot, app and locales are taken from tools/build.mjs — the SAME
 * sources the 3X-UI artifacts use. That is deliberate: a PasarGuard page and a
 * 3X-UI page must not be able to drift apart in their CSS or in the shared
 * runtime, and the only way to guarantee that is to assemble them from one
 * place rather than to copy the assembly.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not render the shell. Rendering is the panel's job at request time —
 * Jinja2 for PasarGuard, pongo2 for Rebecca. tools/render-jinja.mjs exists only
 * so the tests can prove a rendered page is correct.
 */

import { readFileSync, mkdirSync } from 'node:fs';
import { writeIfChanged } from './write-if-changed.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStyles, buildBoot, buildApp, buildLocales, substitute } from './build.mjs';
import { resolveTemplate, templateIds } from './templates.mjs';
import { transpile } from './transpile.mjs';
import { emitterFor, resolvePanel, buildablePanelIds } from './panels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The five tokens the layout carries. Kept as data so the leftover check at the
   end of assembleShell() cannot fall out of step with the substitutions. */
export const SHELL_TOKENS = [
  '/*__STYLES__*/',
  '/*__BOOT__*/',
  '/*__LOCALES__*/',
  '/*__APP__*/',
  '__TEMPLATE_ID__',
];

/* The normalized model -> the context the shell actually reads.
 *
 * THE BRIDGE THIS PHASE WAS MISSING. An adapter produces Row's NORMALIZED model
 * (`download`, `total`, `online`, `title`, `supportUrl`), but a shell consumes
 * the ISLAND shape — the raw names the layout's attributes use (`downloadByte`,
 * `totalByte`, `isOnline`, `subTitle`, `subSupportUrl`). The two are not the
 * same vocabulary, and without this projection the page renders an island with
 * empty traffic values and a permanently-offline badge. It renders, and it is
 * wrong, which is the worst combination.
 *
 * The mapping is the inverse of tools/contract.mjs's readIsland(), and the
 * renames are the same six plus the flag inversions. Booleans become the `1`/`0`
 * the layout's `{{ if }}` tests, and `jalali` becomes the `datepicker` string.
 */
export function toIslandContext(model) {
  const num = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    /* BOOLEANS, not '1'/'0'. The layout does the conversion itself —
       `data-enabled="{{ if .enabled }}1{{ else }}0{{ end }}"` — and a Jinja2
       `{% if %}` treats the STRING '0' as truthy, so pre-converting here would
       make every flag read as on. That is a silent, total failure of the
       enabled/online badges, and it is exactly what this projection must not
       do. */
    enabled: Boolean(model.enabled),
    isOnline: Boolean(model.online),
    downloadByte: num(model.download),
    uploadByte: num(model.upload),
    totalByte: num(model.total),
    expire: num(model.expire),
    lastOnline: num(model.lastOnline),
    subUrl: model.subUrl || '',
    subJsonUrl: model.subJsonUrl || '',
    subClashUrl: model.subClashUrl || '',
    subTitle: model.title || '',
    subSupportUrl: model.supportUrl || '',
    datepicker: model.jalali ? 'jalali' : 'gregorian',
    /* The two hidden containers the explorer reads. */
    announce: model.announce || '',
    links: Array.isArray(model.links) ? model.links : [],
  };
}

/* Assemble one panel's shell for one template.
 *
 * `withFont` mirrors the 3X-UI build flag: it embeds the font as base64, which
 * is what the shipped artifacts carry. */
export function assembleShell(panelId, templateId, { withFont = true } = {}) {
  const panel = resolvePanel(panelId);
  if (!buildablePanelIds().includes(panelId)) {
    throw new Error(
      `panel ${JSON.stringify(panelId)} is ${JSON.stringify(panel.status)} and has no adapter; `
      + 'only a buildable panel can have a shell assembled',
    );
  }

  const tpl = resolveTemplate(templateId);
  const source = readFileSync(join(ROOT, 'src', 'templates', templateId, 'layout.html'), 'utf8');
  const emitter = emitterFor(panelId);

  /* 1. dialect. The Go emitter is the identity; the others rewrite the blocks. */
  let html = transpile(source, emitter);

  /* 2. placeholders, from the same sources the 3X-UI artifacts use.

     On a block dialect the assets must carry no template delimiter at all.
     PasarGuard's Jinja2 and Rebecca's pongo2 both parse the WHOLE file, inline
     CSS and JavaScript included -- and Rebecca rewrites every {{ }} and {% %}
     it finds before parsing. A delimiter inside the runtime would therefore be
     parsed as template code on the server. The check is on the assets alone,
     before substitution, so the layout's own actions are not confused with it. */
  const assets = {
    '/*__STYLES__*/': buildStyles(withFont, tpl.styles),
    '/*__BOOT__*/': buildBoot(),
    '/*__LOCALES__*/': buildLocales(),
    '/*__APP__*/': buildApp(),
  };
  for (const [token, text] of Object.entries(assets)) {
    if (emitter !== 'go') {
      const hit = text.match(TEMPLATE_DELIMITER);
      if (hit) {
        throw new Error(`${panelId}/${templateId}: the ${token} asset contains the template delimiter `
          + `${JSON.stringify(hit[0])}, which ${emitter} would parse as template code`);
      }
    }
    html = substitute(html, token, text);
  }

  /* 3. the template hook on <html>. Row predates the attribute and drops it
     whole; every other template substitutes its id. */
  if (tpl.emitDataTemplate) {
    html = substitute(html, '__TEMPLATE_ID__', tpl.id);
  } else {
    html = html.replace(' data-template="__TEMPLATE_ID__"', '');
  }

  /* 4. nothing may survive. An unfilled token is a shell that would ship a
     comment where its styles should be. */
  for (const token of SHELL_TOKENS) {
    if (html.includes(token)) {
      throw new Error(`unsubstituted shell token ${token} in ${panelId}/${templateId}`);
    }
  }
  const leftover = html.match(/\/\*__[A-Z][A-Z0-9_]*__\*\//);
  if (leftover) throw new Error(`unsubstituted build marker: ${leftover[0]}`);

  /* 5. the panel's own context, and escaping.

     `body` is the layout in the panel's dialect: it reads 3X-UI's names
     (enabled, downloadByte, expire, ...). No other panel supplies those names,
     so on its own `body` renders an empty page. The PRELUDE derives every one
     of them from the context the panel really renders with, and the shipped
     document is prelude + body.

     The body is also wrapped in an explicit autoescape block. On PasarGuard
     this is what makes the page safe at all: its Jinja2 environment does not
     autoescape, and without the block a username, a link remark or an
     announcement would be written into the page as raw HTML. On Rebecca pongo2
     already escapes by default; the block keeps it so. */
  const body = html;
  if (emitter !== 'go') html = wrapForPanel(panelId, emitter, body);

  return {
    panelId,
    templateId,
    emitter,
    html,
    body,
    bytes: Buffer.byteLength(html, 'utf8'),
  };
}

/* The three delimiters a block dialect parses: values, tags and comments. */
export const TEMPLATE_DELIMITER = /\{\{|\{%|\{#/;

/* Each block dialect's explicit autoescape block. */
const AUTOESCAPE = {
  jinja2: { open: '{%- autoescape true -%}', close: '{%- endautoescape %}' },
  pongo2: { open: '{%- autoescape on -%}', close: '{%- endautoescape %}' },
};

/* The prelude a panel's shell starts with: src/panels/<panel>/prelude.<emitter>. */
export function preludePath(panelId, emitter) {
  return join(ROOT, 'src', 'panels', panelId, `prelude.${emitter}`);
}

/* <!doctype html> + prelude + autoescape(body) + </html>.

   The doctype stays the first line, and </html> the last tag, so the installer's
   structural gate (rt_validate_template) reads a shell exactly as it reads a
   3X-UI artifact. Both are outside the autoescape block and neither is a
   template value, so nothing is lost by leaving them there. */
export function wrapForPanel(panelId, emitter, body) {
  const esc = AUTOESCAPE[emitter];
  if (!esc) throw new Error(`no autoescape form for emitter ${JSON.stringify(emitter)}`);
  const prelude = readFileSync(preludePath(panelId, emitter), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const nl = body.indexOf('\n');
  const first = nl === -1 ? body : body.slice(0, nl);
  if (!/^<!doctype html>$/i.test(first)) {
    throw new Error(`${panelId}: a shell must begin with <!doctype html> on its own line`);
  }
  const end = body.lastIndexOf('</html>');
  if (end === -1) throw new Error(`${panelId}: a shell must end with </html>`);
  return `${first}\n${prelude}\n${esc.open}\n${body.slice(nl + 1, end)}${esc.close}</html>${body.slice(end + '</html>'.length)}`;
}

/* Assemble every panel in `panels` across every template.
 *
 * The default is EVERY buildable panel, so the shell layer covers all three by
 * construction rather than by remembering to add each one. Pass an explicit
 * list to narrow it. */
export function assembleAllShells({ panels = null, withFont = true } = {}) {
  const set = panels || buildablePanelIds();
  const out = [];
  for (const panelId of set) {
    for (const templateId of templateIds()) {
      out.push(assembleShell(panelId, templateId, { withFont }));
    }
  }
  return out;
}

/* Where an assembled shell lands. A separate tree from dist/panels/, which holds
   the TRANSPILED layout: this one is the finished document, ready to be served
   after the panel renders it. */
export function shellOutPath(panelId, templateId) {
  return join(ROOT, 'dist', 'shells', panelId, templateId, 'shell.html');
}

/* Assemble and write one shell. Returns the same record assembleShell does,
   plus the path written. */
export function writeShell(panelId, templateId, { withFont = true } = {}) {
  const sh = assembleShell(panelId, templateId, { withFont });
  const out = shellOutPath(panelId, templateId);
  mkdirSync(dirname(out), { recursive: true });
  writeIfChanged(out, sh.html);
  return { ...sh, out };
}

/* Write every shell for `panels`, defaulting to every buildable panel. */
export function writeAllShells({ panels = null, withFont = true, quiet = false } = {}) {
  const set = panels || buildablePanelIds();
  const written = [];
  for (const panelId of set) {
    for (const templateId of templateIds()) {
      const r = writeShell(panelId, templateId, { withFont });
      written.push(r);
      if (!quiet) {
        process.stdout.write(
          `  ${r.panelId}/${r.templateId}`.padEnd(28) + `${String(r.bytes).padStart(7)} B  ${r.emitter}\n`,
        );
      }
    }
  }
  return written;
}
