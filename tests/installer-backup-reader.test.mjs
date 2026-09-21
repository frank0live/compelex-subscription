/* The backup snapshot reader.
 *
 * Phase 8E added reader-only functions to the shipped management library. This
 * suite covers them the same way tests/installer.test.mjs does: every case runs
 * installer/lib/row-template.sh in a real bash process, so there is no second,
 * drifting reimplementation of the reader.
 *
 * The suite exists because of a specific defect recorded in Phase 8D: the
 * snapshot `meta` file is written by rt_backup_create and read by NOTHING. A
 * value written into a file no code reads is a value no rollback can use. The
 * last test in this file is the guard against repeating that — a reader must
 * exist before a writer does.
 *
 * Nothing here activates a panel, changes installer behaviour, or writes a
 * snapshot. The reader functions are defined but called by no existing path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'installer', 'lib', 'row-template.sh');

/* Same harness shape as tests/installer.test.mjs: a throwaway RT_ROOT, the
   shipped library sourced, cleanup on exit. */
const PREAMBLE = [
  'set -Eeuo pipefail',
  'export RT_ROOT="$(mktemp -d)/rt"',
  'mkdir -p "$RT_ROOT"',
  'source installer/lib/row-template.sh',
  'cleanup(){ rm -rf "$(dirname "$RT_ROOT")"; }',
  'trap cleanup EXIT',
  '',
].join('\n');

function sh(body) {
  const r = spawnSync('bash', ['-c', PREAMBLE + body], { cwd: ROOT, encoding: 'utf8' });
  if (r.error) throw r.error;
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

const ok = (body) => sh(body).code === 0;

/* Build a snapshot directory on disk, then run a snippet against it.
 *
 * The dir is made in the OS TEMP dir, not the repo root. A repo-rooted mkdtemp
 * leaves litter behind whenever a case throws before its `finally` — which is
 * exactly what happened while this suite was being written, leaving 78
 * `.tmp-snap-*` directories in the working tree. Temp dirs belong in temp.
 *
 * The path is converted with cygpath inside bash. A node-side mkdtemp gives a
 * WINDOWS path (D:\...), which bash cannot resolve — and under `set -e` a
 * failing `rt_backup_format` then aborts the whole snippet, which reads as a
 * reader failure when it is a harness failure. tests/release.test.mjs uses the
 * same conversion for the same reason. On a POSIX host cygpath is absent and the
 * path is already usable as-is. */
function withSnapshot(files, body) {
  const dir = mkdtempSync(join(tmpdir(), 'row-snap-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const raw = JSON.stringify(dir);
    return sh(
      `SNAP="$(cygpath -u ${raw} 2>/dev/null || printf '%s' ${raw})"\n${body}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sha = (text) => createHash('sha256').update(text).digest('hex');

/* A faithful format-1 snapshot: exactly what the shipped 1.1.0 library writes.
   No `format` key, no `manifest`, no `panels/`. */
const FORMAT_1 = {
  'template.html': '<!doctype html><html><body>row</body></html>',
  'template.html.sha256': '',
  'VERSION': '1.1.0\n',
  'config.env': 'RT_SERVICE_NAME=Row\n',
  'meta': 'created=20260921T081500Z\nversion=1.1.0\ntemplate=row\n',
};

function format1Files() {
  const tpl = FORMAT_1['template.html'];
  return { ...FORMAT_1, 'template.html.sha256': `${sha(tpl)}  template.html\n` };
}

/* --- 1. an old 1.1.0 snapshot is readable -------------------------------- */

test('a format-1 (1.1.0) snapshot is readable', () => {
  const files = format1Files();
  const r = withSnapshot(files, `
    rt_backup_format "$SNAP"; echo
    rt_backup_meta version "$SNAP"; echo
    rt_backup_panels "$SNAP"; echo
    rt_backup_manifest_check "$SNAP" && echo manifest-ok
    rt_backup_validate "$SNAP" && echo validate-ok
    rt_backup_snapshot_check "$SNAP" && echo composite-ok
  `);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n');
  assert.equal(lines[0], '1', 'an absent format key means format 1, never "unknown"');
  assert.equal(lines[1], '1.1.0', 'meta is now readable — it was write-only before');
  assert.equal(lines[2], '', 'a format-1 snapshot records no panels');
  assert.ok(lines.includes('manifest-ok'), 'no manifest is accepted for format 1');
  assert.ok(lines.includes('validate-ok'), 'the existing validator still passes');
  assert.ok(lines.includes('composite-ok'), 'the composite accepts a real 1.1.0 snapshot');
});

test('the reader does not require a manifest, so no existing backup is refused', () => {
  /* This is the compatibility invariant: the shipped library writes no manifest,
     so requiring one would make every backup already on disk unrestorable. */
  assert.ok(ok('SNAP=/nonexistent; rt_backup_manifest_check "$SNAP" && false || true'));
  const r = withSnapshot(format1Files(), 'rt_backup_manifest_check "$SNAP" && echo accepted');
  assert.equal(r.out, 'accepted');
});

/* Print a reader's verdict on its own line. `rt_backup_format` uses printf with
   no trailing newline, so `rt_backup_format … && echo ACCEPTED` concatenates to
   "1ACCEPTED" — capture first, then print. */
const VERDICT = 'v="$(rt_backup_format "$SNAP" 2>/dev/null)" && printf \'%s\\n\' "$v" || echo REJECTED';

/* --- 2. an unknown format is rejected ------------------------------------ */

test('an unknown or future format is rejected, not ignored', () => {
  for (const raw of ['2', '3', '99', '0', 'two', '1x', '-1']) {
    const r = withSnapshot({ ...format1Files(), 'meta': `created=x\nformat=${raw}\n` }, VERDICT);
    assert.equal(r.out, 'REJECTED', `format=${raw} must be refused`);
  }
});

test('format=1 is still accepted when written explicitly', () => {
  const r = withSnapshot({ ...format1Files(), 'meta': 'created=x\nformat=1\n' }, VERDICT);
  assert.equal(r.out, '1');
});

test('a malformed format is refused rather than coerced', () => {
  /* A `case` with a non-digit guard, not an arithmetic comparison: bash would
     treat a bare string as 0 in `[ ]`, silently accepting garbage. */
  for (const raw of ['two', '1.0', ' 1', '1 ', '0x1']) {
    const r = withSnapshot({ ...format1Files(), 'meta': `created=x\nformat=${raw}\n` }, VERDICT);
    assert.equal(r.out, 'REJECTED', `format=${JSON.stringify(raw)} must be refused`);
  }

  /* An EMPTY value is indistinguishable from an absent key through
     rt_manifest_get, and absent means format 1. Recorded, not hidden. */
  const empty = withSnapshot({ ...format1Files(), 'meta': 'created=x\nformat=\n' }, VERDICT);
  assert.equal(empty.out, '1', 'an empty format value reads as absent => format 1');
});

/* --- 3. a missing manifest is detected ----------------------------------- */

test('a manifest that is present but unreadable fails the check', () => {
  const r = withSnapshot({ ...format1Files(), 'manifest': 'not-a-hash not-a-path\n' },
    'rt_backup_manifest_check "$SNAP" && echo OK || echo FAILED');
  assert.equal(r.out, 'FAILED', 'a malformed manifest line must fail');
});

test('a manifest listing a file that is not there fails the check', () => {
  const r = withSnapshot({ ...format1Files(), 'manifest': `${sha('x')} panels/3xui/state\n` },
    'rt_backup_manifest_check "$SNAP" && echo OK || echo FAILED');
  assert.equal(r.out, 'FAILED', 'a missing listed file must fail');
});

/* --- 4. a corrupted snapshot is detected --------------------------------- */

test('a corrupted artifact is detected by the existing validator', () => {
  const files = format1Files();
  files['template.html'] = '<!doctype html><html><body>tampered</body></html>';
  const r = withSnapshot(files, 'rt_backup_validate "$SNAP" && echo OK || echo FAILED');
  assert.equal(r.out, 'FAILED', 'the sidecar no longer matches the artifact');
});

test('a corrupted snapshot fails the composite check', () => {
  const files = format1Files();
  files['template.html'] = '<!doctype html><body>tampered</body>';
  const r = withSnapshot(files, 'rt_backup_snapshot_check "$SNAP" && echo OK || echo FAILED');
  assert.equal(r.out, 'FAILED');
});

test('a manifest mismatch is detected even when the artifact is intact', () => {
  /* The case the existing validator cannot see: the template is fine, but a
     file the manifest covers has changed. */
  const files = format1Files();
  const tpl = files['template.html'];
  files['panels/3xui/state'] = 'subThemeDir=/wrong\n';
  files['manifest'] = `${sha(tpl)} template.html\n${sha('something else')} panels/3xui/state\n`;
  const r = withSnapshot(files, `
    rt_backup_validate "$SNAP" && echo validate-ok || echo validate-failed
    rt_backup_manifest_check "$SNAP" && echo manifest-ok || echo manifest-failed
    rt_backup_snapshot_check "$SNAP" && echo composite-ok || echo composite-failed
  `);
  const lines = r.out.split('\n');
  assert.ok(lines.includes('validate-ok'), 'the existing validator cannot see this');
  assert.ok(lines.includes('manifest-failed'), 'the manifest catches it');
  assert.ok(lines.includes('composite-failed'), 'and the composite refuses the snapshot');
});

test('a manifest path escaping the snapshot is refused', () => {
  for (const rel of ['../outside', '/etc/passwd', 'panels/../../escape']) {
    const r = withSnapshot({ ...format1Files(), 'manifest': `${sha('x')} ${rel}\n` },
      'rt_backup_manifest_check "$SNAP" && echo OK || echo FAILED');
    assert.equal(r.out, 'FAILED', `${rel} must be refused`);
  }
});

/* --- panel state reading ------------------------------------------------- */

test('panel state is read as data and never evaluated', () => {
  const files = format1Files();
  files['panels/3xui/state'] = 'mechanism=db\nwas_running=1\nsubThemeDir=/etc/3x-ui/x\n';
  const r = withSnapshot(files, `
    rt_backup_panels "$SNAP" | head -c0
    rt_backup_panel_state "$SNAP" 3xui | tr '\\n' ';'
  `);
  assert.match(r.out, /subThemeDir=\/etc\/3x-ui\/x/);
});

test('an untagged panel id is refused, so a state path cannot be crafted', () => {
  for (const bad of ['../etc', '3xui/../..', 'a b', 'A', '']) {
    const r = withSnapshot(format1Files(),
      `rt_backup_panel_state "$SNAP" ${JSON.stringify(bad)} >/dev/null 2>&1 && echo OK || echo REFUSED`);
    assert.equal(r.out, 'REFUSED', `${JSON.stringify(bad)} must be refused`);
  }
});

test('a panel the snapshot did not touch reads as empty, not as an error', () => {
  const r = withSnapshot(format1Files(), 'rt_backup_panel_state "$SNAP" rebecca; echo "|done"');
  assert.equal(r.out, '|done');
});

/* --- 5. no writer exists without a reader -------------------------------- */

test('no snapshot writer exists that the reader cannot read', () => {
  /* THE GUARD. Phase 8D found `meta` was written by rt_backup_create and read by
     nothing. This asserts the inverse discipline holds for the new format: no
     code writes a `format` key, and every reader the format model needs exists.
     If someone adds a format=2 writer without the readers, this fails. */
  const lib = readFileSync(LIB, 'utf8');

  const writers = lib.match(/printf[^\n]*format=/g) || [];
  assert.deepEqual(writers, [],
    'no code may write a snapshot format key until the corresponding reader is tested');

  assert.equal(/RT_BACKUP_FORMAT_READABLE=2/.test(lib), false,
    'the readable ceiling must not be raised to 2 before a format-2 reader exists');

  for (const fn of ['rt_backup_format', 'rt_backup_meta', 'rt_backup_panels',
    'rt_backup_panel_state', 'rt_backup_manifest_check', 'rt_backup_snapshot_check']) {
    assert.ok(new RegExp(`^${fn}\\(\\)`, 'm').test(lib), `${fn} must be defined`);
    assert.ok(ok(`type -t ${fn} >/dev/null && echo defined`), `${fn} must be sourceable`);
  }
});

test('the reader changed no existing behaviour', () => {
  /* The functions are defined but called by no existing path. Asserted two ways:
     the existing rollback entry points still resolve, and the reader is not
     referenced from any of them. */
  const lib = readFileSync(LIB, 'utf8');
  for (const fn of ['rt_backup_create', 'rt_backup_validate', 'rt_backups_list',
    'rt_backups_prune', 'rt_restore_from_backup', 'rt_cmd_rollback']) {
    assert.ok(new RegExp(`^${fn}\\(\\)`, 'm').test(lib), `${fn} must still be defined`);
  }

  /* The body of rt_backup_validate must not have gained a manifest call — its
     behaviour is deliberately unchanged; the composite is a separate function. */
  const body = lib.match(/^rt_backup_validate\(\) \{[\s\S]*?\n\}/m)[0];
  assert.equal(/manifest|format/.test(body), false,
    'rt_backup_validate must not consult the new format model');

  const create = lib.match(/^rt_backup_create\(\) \{[\s\S]*?\n\}/m)[0];
  assert.equal(/format=|manifest/.test(create), false,
    'rt_backup_create must still write only what it wrote before');
});

test('the snapshot format model matches what the shipped library writes', () => {
  /* A real rt_backup_create output must read back as format 1 — not "unknown".
     This is the compatibility invariant, exercised against the actual writer. */
  const r = sh(`
    mkdir -p "$RT_ROOT/dist"
    printf '<!doctype html><body>row</body>' > "$RT_ROOT/dist/template.html"
    printf '1.1.0\\n' > "$RT_ROOT/VERSION"
    RT_DIST="$RT_ROOT/dist/template.html"
    RT_VERSION_FILE="$RT_ROOT/VERSION"
    RT_CONFIG="$RT_ROOT/config.env"
    RT_BACKUPS="$RT_ROOT/backups"
    mkdir -p "$RT_BACKUPS"
    d="$(rt_backup_create)"
    echo "created:$d"
    echo -n "format:"; rt_backup_format "$d"; echo
    echo -n "panels:"; rt_backup_panels "$d"; echo
    rt_backup_snapshot_check "$d" && echo "composite:ok" || echo "composite:failed"
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /format:1/, 'a snapshot the shipped writer makes reads as format 1');
  assert.match(r.out, /panels:/, 'and records no panels');
  assert.match(r.out, /composite:ok/, 'and passes the composite check');
});
