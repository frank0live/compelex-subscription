/* The backup format-2 writer (P2).
 *
 * P1 added the reader; P2 adds the writer. This suite covers the writer the same
 * way tests/installer-backup-reader.test.mjs covers the reader: every case runs
 * installer/lib/row-template.sh in a real bash process, so there is no second,
 * drifting reimplementation of anything.
 *
 * The properties this file exists to protect, in order of how expensive they
 * would be to get wrong:
 *
 *   1. DOWNGRADE SAFETY. A format-2 snapshot lives only under backups.v2, so the
 *      shipped 1.1.0 library — which discovers only the directories directly
 *      under $RT_BACKUPS — cannot find one. Without that separation the old
 *      library would restore a future snapshot's template.html and leave the
 *      panel selection pointing at the directory it just replaced. That is the
 *      half-rollback.
 *   2. ROLLBACK IS UNTOUCHED. rt_backup_latest, rt_backups_prune and
 *      rt_cmd_rollback still read $RT_BACKUPS only, and the no-argument
 *      rt_backup_create still writes format 1 there. The v2 writer is opt-in.
 *   3. A SNAPSHOT IS NEVER VISIBLE HALF-BUILT. It is assembled inside
 *      backups.v2/.tmp.XXXXXX and renamed into place only after it validates.
 *   4. SECRETS NEVER REACH DISK. The panel writer accepts no free-form
 *      key/value input, so there is no path by which an activation token could
 *      be serialized into a long-lived artefact.
 *
 * Nothing here activates a panel, restores a panel, or changes installer
 * behaviour. No transaction engine exists, and none is introduced here.
 *
 * A NOTE ON COST. The RT_ROOT tree is built and removed from Node rather than
 * with `mktemp -d` + `rm -rf` inside the script. On a host where process
 * creation is intercepted, a bash-side `rm -rf` of a temp tree costs ~9s per
 * call and a single rt_backup_create v2 costs ~25s — enough to turn this file
 * into a multi-minute run for no added coverage. Fixtures still live in the OS
 * temp dir and never in the repository, which Phase 8E established the hard way.
 * Cases that only need the library sourced (the table-driven grammar and
 * panel-id cases) run many inputs in ONE bash process for the same reason.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'installer', 'lib', 'row-template.sh');
const TPL = '<!doctype html><html><body>row</body></html>';

/* RT_ROOT is set by the harness BEFORE the library is sourced, because the
   library derives RT_BACKUPS / RT_BACKUPS_V2 / RT_PANEL_STAGE at source time. */
const PREAMBLE = [
  'set -Eeuo pipefail',
  'source installer/lib/row-template.sh',
  'mkdir -p "$RT_BACKUPS" "$RT_BACKUPS_V2" "$RT_PANEL_STAGE"',
  'RT_DIST="$RT_ROOT/dist/template.html"',
  'RT_CONFIG="$RT_ROOT/config.env"',
  '',
].join('\n');

/* Run a body against a throwaway RT_ROOT. Extra `args` become "$@" in the
   script, which lets a table-driven case test many inputs in one process. */
function sh(body, args = []) {
  const base = mkdtempSync(join(tmpdir(), 'row-p2-'));
  try {
    const rt = join(base, 'rt');
    mkdirSync(join(rt, 'dist'), { recursive: true });
    writeFileSync(join(rt, 'dist', 'template.html'), TPL);
    writeFileSync(join(rt, 'VERSION'), '1.1.0\n');
    writeFileSync(join(rt, 'config.env'), 'RT_SERVICE_NAME=Row\n');

    /* Forward slashes so cygpath accepts the path; on a POSIX host cygpath is
       absent and the path is already usable as-is. */
    const win = rt.split('\\').join('/');
    const head = `RT_ROOT="$(cygpath -u '${win}' 2>/dev/null || printf '%s' '${win}')"\nexport RT_ROOT\n`;

    const r = spawnSync('bash', ['-c', head + PREAMBLE + body, 'row-writer-test', ...args],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/* Extract a top-level function's text: from its definition line to the next
   top-level definition or section header.
 *
 * Slicing to the next definition is robust for one-liners (rt_backup_latest is
 * one) and avoids brace counting, which quotes and comments inside a body would
 * confuse. Cutting at `# ---` matters: without it the slice runs on into the
 * following section and an assertion like "rt_backups_prune never mentions
 * RT_BACKUPS_V2" would fail on a neighbour's text rather than its own. */
function fnBody(name) {
  const lines = readFileSync(LIB, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith(name + '() {'));
  assert.notEqual(start, -1, name + ' must be defined at top level');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('# ---')) { end = i; break; }
    if (/^[a-z_][a-z0-9_]*\(\) \{/.test(lines[i])) { end = i; break; }
  }
  const body = lines.slice(start, end).join('\n').trimEnd();
  assert.ok(body.length > 40, name + ': extraction looks truncated');
  assert.ok(body.endsWith('}'), name + ': extraction must end at a closing brace');
  return body;
}

/* Strip whole-line comments, so an assertion about what the code DOES is not
   defeated — or accidentally satisfied — by a comment mentioning the same
   words. Several of the negative assertions below are exactly this shape. */
const codeOf = (body) => body.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/* Assert every entry of `table` is REFUSED by `fn`, in ONE bash process. */
function assertAllRefused(fn, table, label) {
  const r = sh(`
    for p in "$@"; do
      if ${fn} "$p"; then echo "ACCEPTED:[$p]"; fi
    done
    echo "checked:$(($#))"
  `, table);
  assert.equal(r.code, 0, r.err);
  assert.equal(/ACCEPTED/.test(r.out), false, `${label}: nothing here may be accepted:\n${r.out}`);
  assert.match(r.out, new RegExp('checked:' + table.length + '$'), `${label}: every entry must be checked`);
}

/* Assert every entry of `table` is ACCEPTED by `fn`, in ONE bash process. */
function assertAllAccepted(fn, table, label) {
  const r = sh(`
    for p in "$@"; do
      if ${fn} "$p"; then echo "ok"; else echo "REFUSED:[$p]"; fi
    done
    echo "checked:$(($#))"
  `, table);
  assert.equal(r.code, 0, r.err);
  assert.equal(/REFUSED/.test(r.out), false, `${label}: nothing here may be refused:\n${r.out}`);
  assert.match(r.out, new RegExp('checked:' + table.length + '$'), `${label}: every entry must be checked`);
}

/* --- 1. the snapshot lands in the v2 namespace ---------------------------- */

test('the writer creates a snapshot under backups.v2, never under backups', () => {
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/3x-ui/custom db 1
    d="$(rt_backup_create v2 3xui)"
    case "$d" in
      "$RT_BACKUPS_V2"/*) echo "where:v2" ;;
      "$RT_BACKUPS"/*)    echo "where:v1-WRONG" ;;
      *)                  echo "where:elsewhere" ;;
    esac
    echo "is-dir:"$([ -d "$d" ] && echo yes || echo no)
    echo "v1-count:"$(ls -1 "$RT_BACKUPS" 2>/dev/null | wc -l)
    echo "v2-count:"$(ls -1 "$RT_BACKUPS_V2" 2>/dev/null | wc -l)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /where:v2/);
  assert.match(r.out, /is-dir:yes/);
  assert.match(r.out, /v1-count:0/, 'a format-2 snapshot must never land in the v1 namespace');
  assert.match(r.out, /v2-count:1/);
});

/* --- 2. the canonical format marker, and reading it back ------------------ */

test('the format marker is its own file holding exactly "2\\n", and reads back as 2', () => {
  const r = sh(`
    d="$(rt_backup_create v2)"
    echo "bytes:"$(wc -c < "$d/format" | tr -cd "0-9")
    echo "hex:"$(od -An -tx1 "$d/format" | tr -d " \\n")
    echo "meta-format-len:"$(rt_manifest_get format "$d/meta" | wc -c)
    echo "meta:"$(tr "\\n" ";" < "$d/meta")
    v="$(rt_backup_format "$d")" && echo "format:$v" || echo "format:REJECTED"
    rt_backup_snapshot_check "$d" >/dev/null 2>&1 && echo "composite:ok" || echo "composite:FAILED"
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /bytes:2/, 'the marker is two bytes');
  assert.match(r.out, /hex:320a/, 'exactly "2" then a newline — no CR, no padding');
  assert.match(r.out, /meta-format-len:0/, 'format= must NOT be written into meta');
  assert.match(r.out, /meta:created=/, 'meta keeps its informational fields');
  assert.match(r.out, /version=1\.1\.0/, 'meta keeps its version field');
  assert.match(r.out, /format:2/, 'the reader reads 2 from the canonical file');
  assert.match(r.out, /composite:ok/);
});

/* --- 3. the manifest ------------------------------------------------------ */

test('the manifest is deterministic, sorted, covers every file, and excludes itself', () => {
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/x db 1
    d="$(rt_backup_create v2 3xui)"

    # the same content must produce a byte-identical manifest
    cp -r "$d" "$RT_ROOT/copy"
    rm -f "$RT_ROOT/copy/manifest"
    rt_backup_manifest_write "$RT_ROOT/copy"
    cmp -s "$d/manifest" "$RT_ROOT/copy/manifest" && echo "regenerated:identical" || echo "regenerated:DIFFERENT"
    # The manifest is sorted by PATH, and each line BEGINS with the hash — so
    # checking the raw lines would compare hashes and prove nothing. Check the
    # path column, and check it equals the C-locale collation rather than the
    # order the filesystem happened to hand back.
    awk '{print $2}' "$d/manifest" | LC_ALL=C sort -c && echo "sorted:yes" || echo "sorted:NO"
    diff <(awk '{print $2}' "$d/manifest") \
         <(awk '{print $2}' "$d/manifest" | LC_ALL=C sort) >/dev/null \
      && echo "c-order:yes" || echo "c-order:NO"
    echo "entry-format:"$(head -n1 "$d/manifest" | grep -cE "^[0-9a-f]{64}  [^ ]" || true)
    echo "self-refs:"$(grep -c "manifest" "$d/manifest" || true)

    for f in template.html template.html.sha256 VERSION config.env meta format \\
             panels/3xui/selection panels/3xui/selection.state panels/3xui/meta; do
      printf "%s:" "$f"; grep -q "  $f$" "$d/manifest" && echo yes || echo NO
    done
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /regenerated:identical/, 'generation must be deterministic');
  assert.match(r.out, /sorted:yes/, 'the path column must be LC_ALL=C ordered');
  assert.match(r.out, /c-order:yes/, 'and must equal the C-locale collation, not the filesystem order');
  assert.match(r.out, /entry-format:1/, 'each line is 64 lowercase hex, two spaces, then the path');
  assert.match(r.out, /self-refs:0/, 'the manifest must not hash itself');
  for (const f of ['template.html', 'template.html.sha256', 'VERSION', 'config.env', 'meta',
    'format', 'panels/3xui/selection', 'panels/3xui/selection.state', 'panels/3xui/meta']) {
    assert.match(r.out, new RegExp(f.replace(/[.]/g, '\\.') + ':yes'), f + ' must be covered');
  }
});

test('tampering with a covered file is detected', () => {
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/x db 1
    d="$(rt_backup_create v2 3xui)"
    rt_backup_manifest_check "$d" && echo "clean:ok" || echo "clean:FAILED"
    # the artifact is left intact; only a panel-state file changes
    printf "tampered" > "$d/panels/3xui/selection"
    rt_backup_manifest_check "$d" && echo "tampered:ACCEPTED" || echo "tampered:refused"
    rt_backup_snapshot_check "$d" >/dev/null 2>&1 && echo "composite:ACCEPTED" || echo "composite:refused"
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /clean:ok/);
  assert.match(r.out, /tampered:refused/, 'the manifest covers panel state, not just the artifact');
  assert.match(r.out, /composite:refused/, 'a corrupt snapshot must not pass the composite');
});

/* --- 4. the selection state model ----------------------------------------- */

test('absent, empty and present round-trip as three distinct states, and are never evaluated', () => {
  /* No sentinel values: `absent` and `empty` both leave the selection file
     absent, and what differs is the state word — which is the instruction a
     restore follows. Writing the literal ABSENT into the selection file would
     conflate "the setting was empty" with "the value is the word ABSENT". */
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui absent "" db 1
    a="$(rt_backup_create v2 3xui)"
    echo "absent-state:"$(rt_backup_panel_state "$a" 3xui)
    echo "absent-sel:"$([ -e "$a/panels/3xui/selection" ] && echo exists || echo absent)
    rt_safe_rmdir "$a"

    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui empty "" db 1
    b="$(rt_backup_create v2 3xui)"
    echo "empty-state:"$(rt_backup_panel_state "$b" 3xui)
    echo "empty-sel:"$([ -e "$b/panels/3xui/selection" ] && echo exists || echo absent)
    rt_safe_rmdir "$b"

    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present '/etc/3x-ui/$(touch /tmp/row-p2-nope)/x' db 1
    c="$(rt_backup_create v2 3xui)"
    echo "present-state:"$(rt_backup_panel_state "$c" 3xui)
    echo "present-value:"$(rt_backup_panel_selection "$c" 3xui)
    echo "present-sel:"$([ -e "$c/panels/3xui/selection" ] && echo exists || echo absent)
    echo "evaluated:"$([ -e /tmp/row-p2-nope ] && echo HAPPENED || echo none)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /absent-state:absent/);
  assert.match(r.out, /absent-sel:absent/);
  assert.match(r.out, /empty-state:empty/);
  assert.match(r.out, /empty-sel:absent/, 'empty means the setting existed but held nothing');
  assert.match(r.out, /present-state:present/);
  assert.match(r.out, /present-value:\/etc\/3x-ui\/\$\(touch \/tmp\/row-p2-nope\)\/x/,
    'the value round-trips verbatim');
  assert.match(r.out, /present-sel:exists/);
  assert.match(r.out, /evaluated:none/, 'a selection value must never be executed');
  assert.equal(/ABSENT|__/.test(r.out), false, 'no sentinel value may appear anywhere');
});

/* --- 5. the path grammar is closed ---------------------------------------- */

test('traversal, absolute and malformed paths are refused', () => {
  const bad = [
    '../outside', '/etc/passwd', 'panels/../../escape', 'a//b', './a', 'a/.',
    'a/..', 'a/', '.', '..', 'a b', 'a  b', 'a$b', 'a;b', 'a\\b', 'a"b', '',
  ];
  assertAllRefused('rt_backup_relpath_ok', bad, 'manifest path grammar');

  /* The length boundary is inclusive-exclusive at 256 bytes. */
  const r = sh(`
    if rt_backup_relpath_ok "$1"; then echo "len256:ACCEPTED"; else echo "len256:refused"; fi
    if rt_backup_relpath_ok "$2"; then echo "len255:ACCEPTED"; else echo "len255:refused"; fi
  `, ['a'.repeat(256), 'a'.repeat(255)]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /len256:refused/, 'a path of 256 bytes must be refused');
  assert.match(r.out, /len255:ACCEPTED/, 'a path of 255 bytes is still allowed');
});

test('the allowed path grammar accepts exactly what the writer emits', () => {
  const good = ['template.html', 'template.html.sha256', 'VERSION', 'config.env', 'meta',
    'format', 'manifest', 'panels/3xui/selection', 'panels/3xui/selection.state',
    'panels/3xui/meta', 'panels/pasarguard/meta', 'panels/rebecca/selection.state',
    'a-b_c.d'];
  assertAllAccepted('rt_backup_relpath_ok', good, 'allowed grammar');

  /* A control character is outside the allowed set for the same reason a space
     is: it cannot survive a line-oriented manifest unambiguously. */
  const tab = sh(`rt_backup_relpath_ok $'a\\tb' && echo ACCEPTED || echo refused`);
  assert.equal(tab.out, 'refused', 'a tab must be refused');
});

test('the reader and the writer share one path grammar, so they cannot drift', () => {
  /* Both call rt_backup_relpath_ok. Asserted structurally: each must reference
     it, and the reader must not keep a second, private copy of the rules. */
  const reader = codeOf(fnBody('rt_backup_manifest_check'));
  const writer = codeOf(fnBody('rt_backup_manifest_write'));
  assert.match(reader, /rt_backup_relpath_ok/, 'the reader must use the shared validator');
  assert.match(writer, /rt_backup_relpath_ok/, 'the writer must use the shared validator');
  assert.equal(/\*\.\.\*\)/.test(reader), false,
    'the reader must not keep an ad-hoc traversal pattern beside the shared grammar');
});

/* --- 6. symlinks ---------------------------------------------------------- */

test('a symlink inside a snapshot is refused, not silently skipped', (t) => {
  /* `find -type f` does not report symlinks, so without an explicit check a
     symlink would be omitted from the manifest rather than rejected — and an
     unlisted file in a snapshot is exactly what the manifest exists to prevent. */
  const r = sh(`
    d="$RT_ROOT/sym"; mkdir -p "$d"
    printf "x" > "$d/real"
    if ln -s /etc/passwd "$d/link" 2>/dev/null && [ -L "$d/link" ]; then
      echo "symlink:created"
    else
      echo "symlink:unavailable"
    fi
    rt_backup_manifest_write "$d" >/dev/null 2>&1 && echo "manifest:ACCEPTED" || echo "manifest:refused"

    p="$RT_ROOT/sympanel"; mkdir -p "$p/panels"
    if ln -s /etc "$p/panels/3xui" 2>/dev/null && [ -L "$p/panels/3xui" ]; then
      rt_backup_panels "$p" >/dev/null 2>&1 && echo "panels:ACCEPTED" || echo "panels:refused"
    else
      echo "panels:unavailable"
    fi
  `);
  if (r.out.includes('symlink:unavailable')) {
    t.skip('this host cannot create symlinks');
    return;
  }
  assert.match(r.out, /manifest:refused/);
  if (!r.out.includes('panels:unavailable')) assert.match(r.out, /panels:refused/);
});

/* --- 7. panel ids --------------------------------------------------------- */

test('invalid and unknown panel ids are refused; the three known ones are accepted', () => {
  assertAllRefused('rt_panel_id_ok',
    ['../etc', '3xui/../..', 'a b', 'A', '3XUI', '', '3xui ', ' 3xui', '3xui/x', '.',
      'nginx', 'xui', '3xui2', 'pasarguardx', 'rebeccax', 'sqlite'],
    'panel id grammar');
  assertAllAccepted('rt_panel_id_ok', ['3xui', 'pasarguard', 'rebecca'], 'known panel ids');
});

test('the writer refuses an unknown or unstaged panel outright', () => {
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/x db 1
    rt_backup_create v2 ../evil      >/dev/null 2>&1 && echo "traversal:ACCEPTED" || echo "traversal:refused"
    rt_backup_create v2 nginx        >/dev/null 2>&1 && echo "unknown:ACCEPTED"   || echo "unknown:refused"
    rt_backup_create v2 pasarguard   >/dev/null 2>&1 && echo "unstaged:ACCEPTED"  || echo "unstaged:refused"
    echo "v2-count:"$(ls -1 "$RT_BACKUPS_V2" 2>/dev/null | wc -l)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /traversal:refused/);
  assert.match(r.out, /unknown:refused/);
  assert.match(r.out, /unstaged:refused/, 'a panel with no staged state must not be guessed at');
  assert.match(r.out, /v2-count:0/, 'a refused create must leave no snapshot behind');
});

test('the panel writer refuses values outside the closed sets', () => {
  const r = sh(`
    for spec in "3xui weird db 1" "3xui present db 1" "3xui absent telepathy 1" \\
                "3xui absent db 2" "3xui absent db yes"; do
      set -- $spec
      if rt_backup_panel_write "$RT_ROOT/stage" "$1" "$2" "" "$3" "$4" 2>/dev/null; then
        echo "ACCEPTED:[$spec]"
      fi
    done
    if rt_backup_panel_write "$RT_ROOT/stage" 3xui present "" db 1 2>/dev/null; then
      echo "ACCEPTED:[present-with-no-value]"
    fi
    echo "done"
  `);
  assert.equal(r.code, 0, r.err);
  assert.equal(/ACCEPTED/.test(r.out), false, 'no malformed spec may be accepted:\n' + r.out);
  assert.match(r.out, /done/);
});

/* --- 8. secrets ----------------------------------------------------------- */

test('secrets are never serialized into a snapshot', () => {
  const r = sh(`
    export RT_ACTIVATION_TOKEN="s3cr3t-token-DO-NOT-PERSIST"
    export RT_API_KEY="api-key-DO-NOT-PERSIST"
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/x db 1
    d="$(rt_backup_create v2 3xui)"
    echo "token-hits:"$(grep -rl "s3cr3t-token-DO-NOT-PERSIST" "$d" 2>/dev/null | wc -l)
    echo "key-hits:"$(grep -rl "api-key-DO-NOT-PERSIST" "$d" 2>/dev/null | wc -l)
    echo "files:"$(find "$d" -type f | wc -l)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /token-hits:0/);
  assert.match(r.out, /key-hits:0/);

  /* Structural, not incidental: the panel writer takes positional arguments and
     no free-form key/value input, so there is no mechanism by which a caller
     could smuggle a credential into a snapshot. */
  const code = codeOf(fnBody('rt_backup_panel_write'));
  assert.equal(/token|secret|password|credential|api[_-]?key/i.test(code), false,
    'the panel writer must have no code path that handles secret material');
});

/* --- 9. incompleteness and atomicity -------------------------------------- */

test('an incomplete snapshot fails validation', () => {
  const r = sh(`
    # a panel directory with no selection.state
    a="$RT_ROOT/inc1"; mkdir -p "$a/panels/3xui"
    printf "mechanism=db\\nwas_running=1\\n" > "$a/panels/3xui/meta"
    rt_backup_panel_state "$a" 3xui >/dev/null 2>&1 && echo "nostate:ACCEPTED" || echo "nostate:refused"

    # state=present but the selection file is missing
    b="$RT_ROOT/inc2"; mkdir -p "$b/panels/3xui"
    printf "present\\n" > "$b/panels/3xui/selection.state"
    printf "mechanism=db\\nwas_running=1\\n" > "$b/panels/3xui/meta"
    rt_backup_panel_state "$b" 3xui >/dev/null 2>&1 && echo "novalue:ACCEPTED" || echo "novalue:refused"

    # state=absent but a selection file exists anyway
    c="$RT_ROOT/inc3"; mkdir -p "$c/panels/3xui"
    printf "absent\\n" > "$c/panels/3xui/selection.state"
    printf "leftover" > "$c/panels/3xui/selection"
    printf "mechanism=db\\nwas_running=1\\n" > "$c/panels/3xui/meta"
    rt_backup_panel_state "$c" 3xui >/dev/null 2>&1 && echo "contradiction:ACCEPTED" || echo "contradiction:refused"

    # a mechanism outside the closed set, then a was_running outside it
    d="$RT_ROOT/inc4"; mkdir -p "$d/panels/3xui"
    printf "absent\\n" > "$d/panels/3xui/selection.state"
    printf "mechanism=telepathy\\nwas_running=1\\n" > "$d/panels/3xui/meta"
    rt_backup_panel_meta_check "$d" 3xui && echo "mech:ACCEPTED" || echo "mech:refused"
    printf "mechanism=db\\nwas_running=2\\n" > "$d/panels/3xui/meta"
    rt_backup_panel_meta_check "$d" 3xui && echo "running:ACCEPTED" || echo "running:refused"
    printf "mechanism=db\\nwas_running=1\\n" > "$d/panels/3xui/meta"
    rt_backup_panel_meta_check "$d" 3xui && echo "valid:ok" || echo "valid:FAILED"

    # an unknown panel directory makes the whole snapshot invalid
    e="$RT_ROOT/inc5"; mkdir -p "$e/panels/nginx"
    rt_backup_panels "$e" >/dev/null 2>&1 && echo "unknownpanel:ACCEPTED" || echo "unknownpanel:refused"
  `);
  assert.equal(r.code, 0, r.err);
  for (const k of ['nostate', 'novalue', 'contradiction', 'mech', 'running', 'unknownpanel']) {
    assert.match(r.out, new RegExp(k + ':refused'), k + ' must be refused');
  }
  assert.match(r.out, /valid:ok/);
});

test('a failed write leaves no temporary directory and no snapshot behind', () => {
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/x db 1
    rt_backup_create v2 ../evil    >/dev/null 2>&1 || true
    rt_backup_create v2 nginx      >/dev/null 2>&1 || true
    rt_backup_create v2 pasarguard >/dev/null 2>&1 || true
    RT_DIST=/nonexistent rt_backup_create v2 >/dev/null 2>&1 || true

    # a staged symlink aborts the build after the temp dir already exists
    mkdir -p "$RT_PANEL_STAGE/rebecca"
    printf "absent\\n" > "$RT_PANEL_STAGE/rebecca/selection.state"
    printf "mechanism=env\\nwas_running=0\\n" > "$RT_PANEL_STAGE/rebecca/meta"
    if ln -s /etc/passwd "$RT_PANEL_STAGE/rebecca/selection" 2>/dev/null; then
      rt_backup_create v2 rebecca >/dev/null 2>&1 || true
    fi

    echo "tmp-left:"$(ls -d "$RT_BACKUPS_V2"/.tmp.* 2>/dev/null | wc -l)
    echo "snapshots-left:"$(ls -1 "$RT_BACKUPS_V2" 2>/dev/null | wc -l)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /tmp-left:0/, 'every failure path must clean its temporary directory');
  assert.match(r.out, /snapshots-left:0/, 'and must never expose a partial final snapshot');
});

test('a half-built snapshot is invisible to v2 discovery while it is being built', () => {
  const r = sh(`
    mkdir -p "$RT_BACKUPS_V2/.tmp.ABCDEF"
    printf "x" > "$RT_BACKUPS_V2/.tmp.ABCDEF/template.html"
    echo "listed:"$(rt_backups_list_v2 | wc -l)
    echo "all:"$(rt_backups_list_all | wc -l)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /listed:0/, 'a .tmp.* directory is not a snapshot');
  assert.match(r.out, /all:0/);
});

/* --- 10. format handling -------------------------------------------------- */

test('unsupported and malformed formats are refused', () => {
  const r = sh(`
    for f in 3 99 0 two 1x -1 " 1" "1 "; do
      d="$RT_ROOT/f"; rm -rf "$d"; mkdir -p "$d"
      printf "%s\\n" "$f" > "$d/format"
      if rt_backup_format "$d" >/dev/null 2>&1; then echo "ACCEPTED:[$f]"; fi
    done
    # a trailing blank line and a CR are not the marker we wrote
    d="$RT_ROOT/f"; rm -rf "$d"; mkdir -p "$d"; printf "2\\n\\n" > "$d/format"
    if rt_backup_format "$d" >/dev/null 2>&1; then echo "ACCEPTED:[blank-line]"; fi
    printf "2\\r\\n" > "$d/format"
    if rt_backup_format "$d" >/dev/null 2>&1; then echo "ACCEPTED:[crlf]"; fi
    printf "2\\n" > "$d/format"
    echo "valid:"$(rt_backup_format "$d")
  `);
  assert.equal(r.code, 0, r.err);
  assert.equal(/ACCEPTED/.test(r.out), false, 'nothing malformed may be accepted:\n' + r.out);
  assert.match(r.out, /valid:2/);
});

test('two contradictory format records fail closed', () => {
  const r = sh(`
    d="$RT_ROOT/conflict"; mkdir -p "$d"
    printf "2\\n" > "$d/format"; printf "created=x\\nformat=1\\n" > "$d/meta"
    rt_backup_format "$d" >/dev/null 2>&1 && echo "disagree:ACCEPTED" || echo "disagree:refused"
    printf "1\\n" > "$d/format"
    echo "agree:"$(rt_backup_format "$d")
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /disagree:refused/, 'picking either record would be a guess');
  assert.match(r.out, /agree:1/);
});

/* --- 11. migration safety ------------------------------------------------- */

test('an old 1.1.0 snapshot is still readable, and reports no panel state', () => {
  const r = sh(`
    d="$RT_BACKUPS/20260101T000000Z__1.1.0"
    mkdir -p "$d"
    printf "<!doctype html><html><body>old</body></html>" > "$d/template.html"
    printf "%s  template.html\\n" "$(rt_sha256 "$d/template.html")" > "$d/template.html.sha256"
    printf "1.1.0\\n" > "$d/VERSION"
    printf "created=20260101T000000Z\\nversion=1.1.0\\ntemplate=row\\n" > "$d/meta"
    echo "format:"$(rt_backup_format "$d")
    rt_backup_validate "$d" && echo "validate:ok" || echo "validate:FAILED"
    rt_backup_snapshot_check "$d" >/dev/null 2>&1 && echo "composite:ok" || echo "composite:FAILED"
    echo "panels:[$(rt_backup_panels "$d")]"
    echo "panel-state:[$(rt_backup_panel_state "$d" 3xui)]"
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /format:1/, 'an absent marker means format 1, never "unknown"');
  assert.match(r.out, /validate:ok/);
  assert.match(r.out, /composite:ok/);
  assert.match(r.out, /panels:\[\]/, 'a format-1 snapshot records no panels');
  assert.match(r.out, /panel-state:\[\]/, 'its panel state predates capture');
});

test('a format-2 snapshot is invisible to 1.1.0 discovery', () => {
  /* The 1.1.0 library discovers only the directories under $RT_BACKUPS. If a
     format-2 snapshot ever landed there, the old library would restore its
     template.html and leave the panel selection pointing at the directory it
     just replaced. */
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/x db 1
    v2="$(rt_backup_create v2 3xui)"
    echo "v2-exists:"$([ -d "$v2" ] && echo yes || echo no)
    echo "v1-list:"$(rt_backups_list | wc -l)
    echo "v1-latest:[$(rt_backup_latest)]"
    echo "v2-list:"$(rt_backups_list_v2 | wc -l)
    echo "all-list:"$(rt_backups_list_all | wc -l)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /v2-exists:yes/);
  assert.match(r.out, /v1-list:0/, 'the v1 namespace is empty');
  assert.match(r.out, /v1-latest:\[\]/, 'so old rollback has no target at all');
  assert.match(r.out, /v2-list:1/);
  assert.match(r.out, /all-list:1/);

  /* And structurally: no v1 discovery function may reference the v2 root. */
  for (const fn of ['rt_backups_list', 'rt_backup_latest', 'rt_backups_prune', 'rt_cmd_rollback']) {
    assert.equal(/RT_BACKUPS_V2/.test(codeOf(fnBody(fn))), false,
      fn + ' must still read only the v1 namespace');
  }
});

test('the old rollback path cannot address a format-2 snapshot', () => {
  const r = sh(`
    rt_backup_panel_write "$RT_PANEL_STAGE" 3xui present /etc/x db 1
    v2="$(rt_backup_create v2 3xui)"
    # the v2 resolver must not reach out of its namespace, or into the v1 one
    rt_backup_resolve "$RT_BACKUPS"                >/dev/null 2>&1 && echo "v1root:ACCEPTED" || echo "v1root:refused"
    rt_backup_resolve "$RT_BACKUPS_V2/../backups"  >/dev/null 2>&1 && echo "escape:ACCEPTED" || echo "escape:refused"
    rt_backup_resolve /etc                         >/dev/null 2>&1 && echo "system:ACCEPTED" || echo "system:refused"
    rt_backup_resolve "$(basename "$v2")"          >/dev/null 2>&1 && echo "byName:ok" || echo "byName:FAILED"
    # and prune, which walks the v1 list, cannot reach it either
    rt_backups_prune 1 >/dev/null 2>&1 || true
    echo "v2-survived-prune:"$([ -d "$v2" ] && echo yes || echo NO)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /v1root:refused/);
  assert.match(r.out, /escape:refused/, 'containment must be proven, not assumed');
  assert.match(r.out, /system:refused/);
  assert.match(r.out, /byName:ok/);
  assert.match(r.out, /v2-survived-prune:yes/, 'prune walks the v1 list and cannot see v2');
});

/* --- 12. scope guards ----------------------------------------------------- */

test('existing restore behaviour is unchanged', () => {
  /* The v2 writer must be inert with respect to every existing path. Asserted
     two ways: the functions are textually free of the new model, and the
     no-argument writer still produces a format-1 snapshot under $RT_BACKUPS. */
  for (const fn of ['rt_restore_from_backup', 'rt_cmd_rollback', 'rt_backup_validate',
    'rt_backups_list', 'rt_backup_latest', 'rt_backups_prune']) {
    const code = codeOf(fnBody(fn));
    assert.equal(/rt_backup_create_v2|rt_backup_panel_|rt_backups_list_v2|rt_backup_snapshot_check/.test(code),
      false, fn + ' must not consult the format-2 model');
  }

  const r = sh(`
    d="$(rt_backup_create)"
    echo "format:"$(rt_backup_format "$d")
    echo "where:"$(case "$d" in "$RT_BACKUPS"/*) echo v1;; *) echo ELSEWHERE;; esac)
    echo "composite:"$(rt_backup_snapshot_check "$d" >/dev/null 2>&1 && echo ok || echo FAILED)
    echo "panels:[$(rt_backup_panels "$d")]"
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /format:1/, 'the default writer is unchanged');
  assert.match(r.out, /where:v1/);
  assert.match(r.out, /composite:ok/);
  assert.match(r.out, /panels:\[\]/);
});

test('config.env is still captured and still deliberately NOT restored', () => {
  /* The asymmetry is the feature: restoring config.env would overwrite the
     operator's current branding on every rollback. */
  const code = codeOf(fnBody('rt_restore_from_backup'));
  assert.equal(/config\.env/.test(code), false,
    'rt_restore_from_backup must not restore config.env');

  const r = sh(`
    d="$(rt_backup_create v2)"
    echo "captured:"$([ -f "$d/config.env" ] && echo yes || echo no)
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /captured:yes/, 'it is still captured into the snapshot');
});

test('no activation function is called from the P2 writer', () => {
  const p2 = ['rt_backup_create_v2', 'rt_backup_panel_write', 'rt_backup_manifest_write',
    'rt_backups_list_v2', 'rt_backups_list_all', 'rt_backups_list_v1', 'rt_backup_resolve',
    'rt_backup_panel_state', 'rt_backup_panel_selection', 'rt_backup_panel_meta_check',
    'rt_backup_manifest_check', 'rt_backup_snapshot_check', 'rt_backup_panels']
    .map(fnBody).join('\n');
  const code = codeOf(p2);
  assert.equal(/rt_activate|rt_panel_activate|rt_service_start|rt_service_stop|rt_subtheme_set/.test(code),
    false, 'P2 must not activate, deactivate or restart anything');
});

test('no transaction engine exists', () => {
  const lib = readFileSync(LIB, 'utf8');
  assert.deepEqual(lib.match(/rt_[a-z_]*transaction[a-z_]*/g) || [], [],
    'P2 adds no transaction engine');
  assert.deepEqual(lib.match(/rt_[a-z_]*two_phase[a-z_]*/g) || [], []);
  assert.deepEqual(lib.match(/rt_[a-z_]*journal[a-z_]*/g) || [], []);
  /* And no panel adapter tree was created. */
  assert.deepEqual(lib.match(/installer\/panels\//g) || [], []);
});
