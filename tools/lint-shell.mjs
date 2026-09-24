/* Lint every tracked shell script with ShellCheck.
 *
 * The installer and the release tooling are bash, and bash fails late: a typo
 * in a branch the tests never take ships. ShellCheck reads every branch.
 *
 * The scripts are found, not listed: every tracked `*.sh` plus every tracked
 * file whose first line is a sh or bash shebang (installer/bin/row-template has
 * no extension), so a new script is linted without anyone remembering to add
 * it here.
 *
 * THE GATE IS SEVERITY `error`, where the tree is clean. At `warning` it
 * reports false positives by design: the library is split across files that
 * share globals (RT_PANEL_OK is defined in panels/interface.sh and read by
 * panels/3xui.sh), and ShellCheck checks each file alone. A later flag wins, so
 * the full report is one argument away:
 *
 *   npm run lint:sh                     # the gate
 *   npm run lint:sh -- -S warning       # everything worth a look
 *
 * Not part of `npm test`, so a contributor without ShellCheck can still run
 * the suite.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  process.stderr.write(`lint:sh: ${message}\n`);
  process.exit(1);
}

const version = spawnSync('shellcheck', ['--version'], { encoding: 'utf8' });
if (version.error || version.status !== 0) {
  fail('ShellCheck was not found on PATH. Install it (see CONTRIBUTING.md) and run again.');
}

const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
if (tracked.error || tracked.status !== 0) {
  fail(`could not list the tracked files: ${tracked.stderr || tracked.error}`);
}

const SHEBANG = /^#!\s*\S*(\/|\s)(ba)?sh(\s|$)/;
const scripts = tracked.stdout.split('\0').filter(Boolean).filter((file) => {
  if (file.endsWith('.sh')) return true;
  let head;
  try {
    head = readFileSync(join(ROOT, file)).subarray(0, 128).toString('utf8');
  } catch {
    return false;   // listed by git but absent from the working tree
  }
  return SHEBANG.test(head.split('\n')[0]);
});

if (scripts.length === 0) fail('no shell scripts were found; refusing to report a clean lint.');

const r = spawnSync('shellcheck', ['--severity=error', ...process.argv.slice(2), ...scripts],
  { cwd: ROOT, stdio: 'inherit' });
if (r.error) fail(String(r.error));
if (r.status === 0) process.stdout.write(`shellcheck: ${scripts.length} scripts clean\n`);
process.exit(r.status === null ? 1 : r.status);
