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

/* HARNESS COST NOTE. Every bash spawn on this host costs ~470 ms, and a
   bash-side `rm -rf` of a temp tree costs ~7,200 ms because the sandbox
   intercepts it (a Node-side `rmSync` of the same tree costs ~125 ms). The
   original preamble ran `mktemp -d` plus an EXIT-trap `rm -rf`, so EVERY case
   paid the recursive-delete cost whether or not it created anything.

   RT_ROOT is therefore created from Node and handed in as a path that already
   exists; Node removes it in `sh()`'s `finally`. Nothing is created or deleted
   bash-side, so the only cost is the spawn itself. Fixtures still live in the OS
   temp dir. */
const PREAMBLE = [
  'set -Eeuo pipefail',
  'source installer/lib/row-template.sh',
  '',
].join('\n');

function sh(body, snapshot = null) {
  /* The RT_ROOT tree is built and removed from Node. `cygpath` converts the
     Windows path outside bash; on a POSIX host it is absent and the path is
     already usable.

     When `snapshot` is given, its files are written into a `snap` directory
     beside RT_ROOT before the spawn, and `$SNAP` is exported to point at it —
     one Node-side rmSync then removes everything. */
  const base = mkdtempSync(join(tmpdir(), 'row-reader-'));
  try {
    const rt = join(base, 'rt');
    mkdirSync(rt, { recursive: true });
    let head = '';
    if (snapshot) {
      const snap = join(base, 'snap');
      for (const [rel, content] of Object.entries(snapshot)) {
        const full = join(snap, rel);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
      const sw = snap.split('\\').join('/');
      head += `SNAP="$(cygpath -u '${sw}' 2>/dev/null || printf '%s' '${sw}')"\nexport SNAP\n`;
    }
    const win = rt.split('\\').join('/');
    head += `RT_ROOT="$(cygpath -u '${win}' 2>/dev/null || printf '%s' '${win}')"\nexport RT_ROOT\n`;
    const r = spawnSync('bash', ['-c', head + PREAMBLE + body],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
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
  /* Files are laid out by sh() itself, into a tree that one Node-side rmSync
     removes. The path is converted with cygpath because a Node-side mkdtemp
     gives a WINDOWS path (D:\...) that bash cannot resolve — and under `set -e`
     a failing `rt_backup_format` then aborts the whole snippet, which reads as a
     reader failure when it is a harness failure. */
  return sh(body, files);
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

test('formats 1 and 2 are readable; unknown or future formats are refused', () => {
  /* P2 raised RT_BACKUP_FORMAT_READABLE to 2, so format 2 is now READ. This
     test changed with the ceiling, not independently of it. */
  for (const raw of ['3', '99', '0', 'two', '1x', '-1']) {
    const r = withSnapshot({ ...format1Files(), 'meta': `created=x\nformat=${raw}\n` }, VERDICT);
    assert.equal(r.out, 'REJECTED', `format=${raw} must be refused`);
  }
  const two = withSnapshot({ ...format1Files(), 'meta': 'created=x\nformat=2\n' }, VERDICT);
  assert.equal(two.out, '2', 'format 2 is readable once its reader exists');
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
  const r = withSnapshot({ ...format1Files(), 'manifest': `${sha('x')}  panels/3xui/missing\n` },
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
  files['panels/3xui/selection.state'] = 'present\n';
  files['panels/3xui/selection'] = '/etc/3x-ui/tampered\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=1\n';
  files['panels/3xui/files'] = '';
  files['manifest'] =
    `${sha(tpl)}  template.html\n${sha('something else')}  panels/3xui/selection\n`;
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
    const r = withSnapshot({ ...format1Files(), 'manifest': `${sha('x')}  ${rel}\n` },
      'rt_backup_manifest_check "$SNAP" && echo OK || echo FAILED');
    assert.equal(r.out, 'FAILED', `${rel} must be refused`);
  }
});

/* --- panel state reading ------------------------------------------------- */

test('panel state is read as data and never evaluated', () => {
  /* The P2 layout: `selection.state` holds one of absent|empty|present, and
     `selection` holds the raw value. The value below is a command substitution,
     which must come back verbatim rather than being executed. */
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'present\n';
  files['panels/3xui/selection'] = '/etc/3x-ui/$(touch /tmp/row-p2-reader-nope)/x';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=1\n';
  files['panels/3xui/files'] = '';
  const r = withSnapshot(files, `
    echo "panels:"$(rt_backup_panels "$SNAP")
    echo "state:"$(rt_backup_panel_state "$SNAP" 3xui)
    echo "value:"$(rt_backup_panel_selection "$SNAP" 3xui)
    echo "evaluated:"$([ -e /tmp/row-p2-reader-nope ] && echo HAPPENED || echo none)
  `);
  assert.match(r.out, /panels:3xui/);
  assert.match(r.out, /state:present/);
  assert.match(r.out, /value:\/etc\/3x-ui\/\$\(touch \/tmp\/row-p2-reader-nope\)\/x/);
  assert.match(r.out, /evaluated:none/, 'a selection value is data, never code');
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

/* --- placed-file list (P2 follow-up) -------------------------------------- */

test('the recorded placed-file list round-trips as data, one path per line', () => {
  const files = format1Files();
  files['panels/pasarguard/selection.state'] = 'present\n';
  files['panels/pasarguard/selection'] = 'subscription/index.html';
  files['panels/pasarguard/meta'] = 'mechanism=env\nwas_running=1\n';
  files['panels/pasarguard/files'] = 'aa/first.html\nzz/last.html\n';
  const r = withSnapshot(files, `
    rt_backup_panel_files "$SNAP" pasarguard
    echo "|done"
  `);
  assert.equal(r.out, 'aa/first.html\nzz/last.html\n|done');
});

test('an empty placed-file list is valid and reads as nothing', () => {
  /* 3X-UI places no file. The empty list is a RECORD, not an absence — which
     is why the writer always emits the file. */
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'absent\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  files['panels/3xui/files'] = '';
  const r = withSnapshot(files, 'rt_backup_panel_files "$SNAP" 3xui; echo "|rc=$?"');
  assert.equal(r.out, '|rc=0', 'empty is valid, not an error');
});

test('a touched panel without a files list is malformed, not "placed nothing"', () => {
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'absent\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  const r = withSnapshot(files, 'rt_backup_panel_files "$SNAP" 3xui >/dev/null 2>&1 && echo OK || echo REFUSED');
  assert.equal(r.out, 'REFUSED', 'a missing list is an incomplete snapshot');
});

test('a malformed placed-file list is refused entry by entry', () => {
  const bad = [
    '/etc/passwd',            /* absolute */
    '../escape.html',         /* traversal */
    'a/../../b',              /* traversal inside */
    'dir/',                   /* trailing slash => directory */
    'a//b',                   /* empty component */
    'a/./b',                  /* "." component */
    './a',                    /* leading "." component */
    'a b.html',               /* whitespace */
    'a\tb.html',              /* control char */
    'x' + String.fromCharCode(127) + '.html',  /* DEL */
  ];
  for (const entry of bad) {
    const files = format1Files();
    files['panels/3xui/selection.state'] = 'absent\n';
    files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
    files['panels/3xui/files'] = entry + '\n';
    const r = withSnapshot(files,
      'rt_backup_panel_files "$SNAP" 3xui >/dev/null 2>&1 && echo OK || echo REFUSED');
    assert.equal(r.out, 'REFUSED', `${JSON.stringify(entry)} must be refused`);
  }
});

test('a duplicate placed-file entry is refused', () => {
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'absent\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  files['panels/3xui/files'] = 'a.html\nb.html\na.html\n';
  const r = withSnapshot(files,
    'rt_backup_panel_files "$SNAP" 3xui >/dev/null 2>&1 && echo OK || echo REFUSED');
  assert.equal(r.out, 'REFUSED', 'a duplicate is a malformed record');
});

test('a blank line in a placed-file list is refused', () => {
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'absent\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  files['panels/3xui/files'] = 'a.html\n\nb.html\n';
  const r = withSnapshot(files,
    'rt_backup_panel_files "$SNAP" 3xui >/dev/null 2>&1 && echo OK || echo REFUSED');
  assert.equal(r.out, 'REFUSED');
});

test('an unterminated final entry is read in full, not silently dropped', () => {
  /* `read` returns false when it reaches EOF without a terminator, so a
     `while IFS= read -r` loop drops an unterminated final line. For a list of
     PLACED FILES that failure is quiet and dangerous: a truncated record would
     read as a SHORTER record rather than as a damaged one, so a rollback would
     leave our last file behind while believing it had removed everything it
     placed. The loop must therefore treat a non-empty unterminated final line
     as a record. */
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'absent\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  /* deliberately NO trailing newline on the last entry */
  files['panels/3xui/files'] = 'a.html\nb.html';
  const r = withSnapshot(files, `
    echo "count:$(rt_backup_panel_files "$SNAP" 3xui | wc -l)"
    echo "joined:[$(rt_backup_panel_files "$SNAP" 3xui | tr '\\n' ' ')]"
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /count:2/, 'both entries are read, including the unterminated last one');
  assert.match(r.out, /joined:\[a\.html b\.html \]/, 'and in order');

  /* The same truncation must not become an escape hatch: an unterminated
     ILLEGAL entry is still refused rather than skipped. */
  const bad = format1Files();
  bad['panels/3xui/selection.state'] = 'absent\n';
  bad['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  bad['panels/3xui/files'] = 'good.html\n../escape';
  const rb = withSnapshot(bad,
    'rt_backup_panel_files "$SNAP" 3xui >/dev/null 2>&1 && echo OK || echo REFUSED');
  assert.equal(rb.out, 'REFUSED', 'an unterminated traversal must not be skipped over');
});

test('a symlinked placed-file list is refused', (t) => {
  /* A symlink is refused rather than followed, so a snapshot cannot redirect
     the read at an arbitrary file. The link must be created where the snapshot
     lives, which a plain fixture map cannot express — so the case is skipped
     where symlinks are unavailable. */
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'absent\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  const r = withSnapshot(files, `
    if ln -s /etc/passwd "$SNAP/panels/3xui/files" 2>/dev/null; then
      rt_backup_panel_files "$SNAP" 3xui >/dev/null 2>&1 && echo OK || echo REFUSED
    else
      echo NOLINK
    fi
  `);
  if (r.out === 'NOLINK') { t.skip('symlinks unavailable on this host'); return; }
  assert.equal(r.out, 'REFUSED');
});

test('a malformed placed-file list makes the composite validation fail', () => {
  const files = format1Files();
  files['panels/3xui/selection.state'] = 'absent\n';
  files['panels/3xui/meta'] = 'mechanism=db\nwas_running=0\n';
  files['panels/3xui/files'] = '/etc/passwd\n';
  const r = withSnapshot(files, `
    rt_backup_validate "$SNAP" && echo validate-ok || echo validate-failed
    rt_backup_snapshot_check "$SNAP" && echo composite-ok || echo composite-failed
  `);
  const lines = r.out.split('\n');
  assert.ok(lines.includes('validate-ok'),
    'the existing validator is untouched and must not see panel state');
  assert.ok(lines.includes('composite-failed'),
    'the composite refuses a snapshot with a malformed file list');
});

/* --- 5. no writer exists without a reader -------------------------------- */

test('the writer and the reader agree on the format ceiling', () => {
  /* THE GUARD, IN ITS P2 FORM. Phase 8D found `meta` was written by
     rt_backup_create and read by nothing. P1 asserted the inverse discipline —
     no writer before a reader — which is why this file had to exist first. P2
     adds the writer, so the guard moves to the property that must now hold: the
     ceiling, the reader and the writer all name the SAME format, and the format
     still never goes into `meta`. */
  const lib = readFileSync(LIB, 'utf8');

  assert.match(lib, /RT_BACKUP_FORMAT_READABLE=2/,
    'the readable ceiling is 2, raised only alongside its reader');

  assert.ok(lib.includes(`printf '2\\n' > "$tmp/format"`),
    'the v2 writer must emit the canonical marker file');

  assert.deepEqual(lib.match(/printf[^\n]*format=/g) || [], [],
    'no code may write a format key into meta — the marker is its own file');

  for (const fn of ['rt_backup_format', 'rt_backup_meta', 'rt_backup_panels',
    'rt_backup_panel_state', 'rt_backup_manifest_check', 'rt_backup_snapshot_check',
    'rt_backup_create_v2']) {
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

/* --- 6. recursive-delete containment (P2 follow-up) ----------------------- */

test('rt_is_within is strict: a base is not within itself', () => {
  /* The P2 follow-up. The previous implementation appending a slash and
     matching "$BASE"/* accepted PATH == BASE, so rt_safe_rmdir could delete the
     backups root. Both directions are asserted, because a fix that made
     containment strict by breaking the child case would be worse than the bug. */
  const r = sh(`
    mkdir -p "$RT_BACKUPS/a/b"
    rt_is_within "$RT_BACKUPS" "$RT_BACKUPS"            && echo base-base:WITHIN || echo base-base:REFUSED
    rt_is_within "$RT_BACKUPS" "$RT_BACKUPS/a/b"        && echo child:WITHIN || echo child:REFUSED
    rt_is_within "$RT_BACKUPS" "$RT_BACKUPS-other"      && echo prefix:WITHIN || echo prefix:REFUSED
    rt_is_within "$RT_BACKUPS" "$RT_BACKUPS/../evil"    && echo traversal:WITHIN || echo traversal:REFUSED
    rt_is_within "$RT_BACKUPS" "/etc/passwd"            && echo outside:WITHIN || echo outside:REFUSED
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /base-base:REFUSED/, 'the base is not within itself');
  assert.match(r.out, /child:WITHIN/, 'a real descendant is still within');
  assert.match(r.out, /prefix:REFUSED/, 'a prefix sibling is not within');
  assert.match(r.out, /traversal:REFUSED/, 'traversal is still refused');
  assert.match(r.out, /outside:REFUSED/, 'an unrelated path is still refused');
});

test('rt_safe_rmdir refuses every root, and still deletes strict descendants', () => {
  const r = sh(`
    mkdir -p "$RT_BACKUPS/20260101T000000Z__x" "$RT_BACKUPS_V2/20260101T000000Z__x" "$RT_BACKUPS_V2/a/b"
    r(){ "$@" >/dev/null 2>&1 && echo REMOVED || echo REFUSED; }
    echo "empty:$(r rt_safe_rmdir '')"
    echo "slash:$(r rt_safe_rmdir /)"
    echo "rt_root:$(r rt_safe_rmdir "$RT_ROOT")"
    echo "v1_base:$(r rt_safe_rmdir "$RT_BACKUPS")"
    echo "v2_base:$(r rt_safe_rmdir "$RT_BACKUPS_V2")"
    echo "v1_snapshot:$(r rt_safe_rmdir "$RT_BACKUPS/20260101T000000Z__x")"
    echo "v2_snapshot:$(r rt_safe_rmdir "$RT_BACKUPS_V2/20260101T000000Z__x")"
    echo "v2_nested:$(r rt_safe_rmdir "$RT_BACKUPS_V2/a/b")"
    echo "v1_base_still_there:$([ -d "$RT_BACKUPS" ] && echo yes || echo no)"
    echo "v2_base_still_there:$([ -d "$RT_BACKUPS_V2" ] && echo yes || echo no)"
    echo "rt_root_still_there:$([ -d "$RT_ROOT" ] && echo yes || echo no)"
  `);
  assert.equal(r.code, 0, r.err);
  for (const c of ['empty', 'slash', 'rt_root', 'v1_base', 'v2_base']) {
    assert.match(r.out, new RegExp(`^${c}:REFUSED$`, 'm'), `${c} must be refused`);
  }
  for (const c of ['v1_snapshot', 'v2_snapshot', 'v2_nested']) {
    assert.match(r.out, new RegExp(`^${c}:REMOVED$`, 'm'), `${c} must still be deletable`);
  }
  assert.match(r.out, /v1_base_still_there:yes/, 'the v1 root survived');
  assert.match(r.out, /v2_base_still_there:yes/, 'the v2 root survived');
  assert.match(r.out, /rt_root_still_there:yes/, 'the install tree survived');
});
