/* Render the fixture pages of every template, where the test suite reads them.
 *
 * tests/adapters.test.mjs and tests/contract.test.mjs read
 * tools/fixtures/out/<template>/00-showcase/rendered.html: a RENDERED page is
 * the only honest source of island values, because a built artifact is still an
 * unrendered template. Those pages are build output and are not committed, so a
 * fresh clone has none. `npm test` runs this first (its pretest hook), which is
 * what lets the suite run from a clean checkout with no manual step.
 *
 * Each template is built in memory by the same build(true, id) the tests
 * compare against, then rendered and checked by the Go fixture tool. The tool is
 * compiled once and run per template, rather than `go run` per template, which
 * would recompile it fifteen times. Pages are always regenerated, never reused:
 * a stale page would let the suite pass against sources that no longer exist.
 *
 * `npm run fixtures` is unchanged: it still renders the committed Row artifact
 * into tools/fixtures/out/ for a quick look.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { build } from './build.mjs';
import { templateIds } from './templates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tools', 'fixtures');

function fail(message) {
  process.stderr.write(`fixtures: ${message}\n`);
  process.exit(1);
}

const go = spawnSync('go', ['version'], { encoding: 'utf8' });
if (go.error || go.status !== 0) {
  fail('Go is required to render the test fixtures (see tools/fixtures/go.mod), and `go` was not found on PATH.');
}

/* Returns an error message, or '' when every template rendered and checked.
   Kept apart from process.exit so the temporary directory is always removed. */
function renderAll(work) {
  const tool = join(work, process.platform === 'win32' ? 'fixtures.exe' : 'fixtures');
  const compiled = spawnSync('go', ['build', '-o', tool, '.'], { cwd: FIXTURES, encoding: 'utf8' });
  if (compiled.error || compiled.status !== 0) {
    return `could not compile the fixture tool:\n${compiled.stderr || compiled.error}`;
  }

  let failed = 0;
  for (const id of templateIds()) {
    const artifact = join(work, `${id}.html`);
    writeFileSync(artifact, build(true, id).html);
    // pages from a removed fixture must not outlive it
    rmSync(join(FIXTURES, 'out', id), { recursive: true, force: true });

    const r = spawnSync(tool, ['-template', artifact, '-out', join('out', id)],
      { cwd: FIXTURES, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (r.error || r.status !== 0) {
      failed += 1;
      process.stdout.write(`FAIL ${id}\n${r.stdout || ''}${r.stderr || r.error || ''}\n`);
      continue;
    }
    const summary = (r.stdout || '').trim().split('\n').pop();
    process.stdout.write(`ok   ${id.padEnd(14)} ${summary}\n`);
  }
  return failed ? `${failed} template(s) failed to render; see above.` : '';
}

const work = mkdtempSync(join(tmpdir(), 'row-fixtures-'));
let error;
try {
  error = renderAll(work);
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (error) fail(error);
