/* The standalone panel build target.
 *
 * A separate entry point, invoked by its own npm script, exactly as
 * tools/verify.mjs is. It deliberately does NOT go through tools/build.mjs:
 * that file is the artifact pipeline, and keeping the panel build out of it is
 * what makes this phase additive. Nothing here can move a byte of a frozen
 * artifact, because nothing here is on the artifact path.
 *
 * WHAT IT EMITS, AND WHAT IT DOES NOT
 *
 * It emits a SHELL per panel per template — the canonical layout transpiled
 * into that panel's dialect. It does NOT emit a finished artifact, because a
 * finished artifact needs a data island and the only adapter that exists is the
 * reference panel's, which is an identity. Emitting a half-built artifact would
 * be worse than emitting none, so the target is honest about its own scope: it
 * builds shells.
 *
 * The reference panel's shell output is byte-identical to its source layout by
 * construction (the Go path is the identity — see tools/transpile.mjs). That is
 * the point of building it here: it proves the new path is faithful to the old
 * one before any new panel depends on it.
 *
 * A `planned` panel has no adapter, so this refuses it with a clear message.
 * "Do not implement PasarGuard or Rebecca yet" is enforced here, not promised
 * in a document.
 */

import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { writeIfChanged } from './write-if-changed.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { templateIds } from './templates.mjs';
import { transpile, assertGoIdentity } from './transpile.mjs';
import { buildablePanelIds, emitterFor, resolvePanel, referencePanel } from './panels.mjs';
import { writeAllShells } from './shell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The transpiled shell keeps the `.html` extension on every dialect: it is the
   same document with different block syntax, and the server decides how to
   parse it, not the filename. */
export function panelShellPath(panelId, templateId) {
  return join(ROOT, 'dist', 'panels', panelId, templateId, 'layout.html');
}

export function sourceLayoutPath(templateId) {
  return join(ROOT, 'src', 'templates', templateId, 'layout.html');
}

/* Build one panel's shell for one template. Returns { panelId, templateId,
   bytes, identical } — `identical` is true when the output matches the source
   byte for byte, which is the expected result for the reference panel. */
export function buildPanelShell(panelId, templateId) {
  const panel = resolvePanel(panelId);
  if (!buildablePanelIds().includes(panelId)) {
    throw new Error(
      `panel ${JSON.stringify(panelId)} is ${JSON.stringify(panel.status)} and has no adapter; `
      + 'only the reference panel can be built',
    );
  }

  const source = readFileSync(sourceLayoutPath(templateId), 'utf8');
  const html = transpile(source, emitterFor(panelId));

  const out = panelShellPath(panelId, templateId);
  mkdirSync(dirname(out), { recursive: true });
  writeIfChanged(out, html);

  return {
    panelId,
    templateId,
    emitter: emitterFor(panelId),
    bytes: Buffer.byteLength(html, 'utf8'),
    identical: html === source,
  };
}

/* Build every buildable panel across every template. */
export function buildAllPanels({ quiet = false } = {}) {
  const results = [];
  for (const panelId of buildablePanelIds()) {
    for (const templateId of templateIds()) {
      const r = buildPanelShell(panelId, templateId);
      results.push(r);
      if (!quiet) {
        process.stdout.write(
          `  ${r.panelId}/${r.templateId}`.padEnd(28)
          + `${String(r.bytes).padStart(6)} B`
          + `  ${r.identical ? 'identical to source' : 'transformed'}\n`,
        );
      }
    }
  }
  return results;
}

function main(argv) {
  const quiet = argv.includes('--quiet');
  const clean = argv.includes('--clean');

  /* The release generator needs the panel set from the registry, the same way
     it takes the template set from `build.mjs --list`. Printing it keeps the
     packaging honest: a panel cannot be shipped by accident, and one that
     exists cannot be silently left out. */
  if (argv.includes('--list')) {
    for (const id of buildablePanelIds()) process.stdout.write(`${id}\n`);
    return;
  }

  if (clean) {
    const dir = join(ROOT, 'dist', 'panels');
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    if (!quiet) process.stdout.write('removed dist/panels\n');
    return;
  }

  if (!quiet) {
    process.stdout.write(`reference panel: ${referencePanel()}\n`);
    process.stdout.write(`buildable panels: ${buildablePanelIds().join(', ')}\n\n`);
  }

  const results = buildAllPanels({ quiet });

  /* The reference panel's output must be byte-identical to its source. If it is
     not, the transpiler has lost information and no other dialect can be
     trusted — so this fails the build rather than reporting it.

     This applies ONLY to the Go emitter, which is the identity by construction.
     Every other dialect TRANSFORMS the shell by design — jinja2 and pongo2 both
     rewrite `{{ .x }}` into `{{ x }}` and `{{ end }}` into `{% endif %}`, so
     their output differs from the input and always will. Checking them here was
     wrong: it made the panel build fail for every non-reference panel as soon as
     one existed. */
  const drifted = results.filter((r) => r.emitter === 'go' && !r.identical);
  if (drifted.length > 0) {
    for (const d of drifted) {
      process.stderr.write(`panel shell drift: ${d.panelId}/${d.templateId}\n`);
    }
    process.exit(1);
  }

  /* G1, re-run as a build precondition. The panel build is worthless if the Go
     path is not lossless, so it is asserted here too rather than only in tests. */
  const sources = {};
  for (const id of templateIds()) sources[id] = readFileSync(sourceLayoutPath(id), 'utf8');
  const failures = assertGoIdentity(sources);
  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`G1 failure: ${f.id} — ${f.reason}\n`);
    process.exit(1);
  }

  if (!quiet) {
    process.stdout.write(`\n${results.length} shell(s) written to dist/panels/\n`);
    process.stdout.write('G1 green — the Go path is lossless\n');
  }

  /* The transpiled layouts above are templates of a template: they still carry
     the five build tokens. tools/shell.mjs fills them from the same styles,
     boot, app and locales the 3X-UI artifacts use, producing a document that
     can actually be served once the panel renders it. Writing both means
     dist/panels/ is the intermediate and dist/shells/ is the finished thing. */
  if (!quiet) process.stdout.write('\nassembled shells:\n');
  const shells = writeAllShells({ quiet });
  if (!quiet) process.stdout.write(`\n${shells.length} shell(s) written to dist/shells/\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Panel build failed: ${err.message}\n`);
    process.exit(1);
  }
}
