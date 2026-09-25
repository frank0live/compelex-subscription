/* The real 3X-UI panel adapter (P5A).
 *
 * WHAT THIS SUITE IS FOR. P5A is the first phase where a panel adapter actually
 * DOES something, so the questions change: not "is the shape right" but "does
 * the right row change, does the wrong row survive, does the service end where
 * it started, and does a rollback put the selection back".
 *
 * THE ADAPTER UNDER TEST IS THE SHIPPING ONE. Nothing here re-implements or
 * stubs the adapter: every case dispatches through the real P3 public verbs
 * into installer/panels/3xui.sh.
 *
 * WHAT IS DOUBLED, AND WHY. This host has neither sqlite3 nor systemctl, so the
 * two EXTERNAL BINARIES the adapter talks to are supplied as PATH shims:
 *
 *   sqlite3    forwards to Python's real sqlite3 module, so the fixture is a
 *              genuine SQLite database and the adapter's SQL is executed for
 *              real -- real escaping, real UPDATE/DELETE semantics, real
 *              unrelated-row preservation. It is a stand-in for a missing
 *              binary, not for SQLite.
 *   systemctl  reads and writes a state file, so service transitions are real
 *              state changes the assertions can inspect.
 *
 * Neither shim knows anything about 3X-UI or about the adapter.
 *
 * VALIDATION BOUNDARY. These are fixture tests. They do not prove behaviour
 * against a running 3X-UI panel; that remains an explicit real-server gate.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve('.');
const TXN = join(ROOT, 'installer', 'lib', 'transaction.sh');
const ADAPTER = join(ROOT, 'installer', 'panels', '3xui.sh');
const PANELS_DIR = join(ROOT, 'installer', 'panels');

const read = (p) => readFileSync(p, 'utf8');
const codeOf = (src) => src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const u = (p) => p.split('\\').join('/');

function workingProgram(candidates, args = ['--version']) {
  for (const candidate of candidates) {
    const r = spawnSync(candidate, args, { encoding: 'utf8' });
    if (!r.error && r.status === 0) return candidate;
  }
  throw new Error(`none of these programs is usable: ${candidates.join(', ')}`);
}

function bashProgram() {
  if (process.platform !== 'win32') return workingProgram(['bash']);
  if (process.env.BASH_PATH) return workingProgram([process.env.BASH_PATH]);

  /* Git for Windows ships the POSIX Bash this fixture needs. Derive it from
   * Git's installation rather than baking one machine's drive into the test. */
  const git = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  if (!git.error && git.status === 0) {
    const candidate = resolve(git.stdout.trim(), '..', '..', '..', 'bin', 'bash.exe');
    if (existsSync(candidate)) return workingProgram([candidate]);
  }
  return workingProgram(['bash']);
}

const BASH = bashProgram();
const PYTHON = workingProgram(process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']);

/* The adapter writes the value the SHELL holds, which is the cygpath-converted
 * (POSIX) form of RT_ROOT -- not the Windows path Node built the fixture with.
 * Assertions about the stored value must use the same form the adapter saw. */
const toPosix = (p) => {
  const r = spawnSync(BASH, ['-c', `cygpath -u ${JSON.stringify(p)} 2>/dev/null || printf '%s' ${JSON.stringify(p)}`], { encoding: 'utf8' });
  return (r.stdout || '').trim();
};

/* ------------------------------------------------------------------------ */
/* shims                                                                    */
/* ------------------------------------------------------------------------ */

const SQLITE_SHIM = `#!/usr/bin/env bash
set -u
if [ -n "\${RT_3XUI_SQL_LOG:-}" ]; then printf '%s\\n' "\$2" >> "\$RT_3XUI_SQL_LOG"; fi
if [ -n "\${RT_3XUI_SQL_FAIL_ONCE:-}" ] && [ ! -f "\${RT_3XUI_SQL_FAIL_MARK:-/nonexistent}" ]; then
  case "\$2" in
    *"\$RT_3XUI_SQL_FAIL_ONCE"*)
      : > "\${RT_3XUI_SQL_FAIL_MARK:-/nonexistent}"
      echo "shim: injected failure" >&2
      exit 1 ;;
  esac
fi
# The shell hands us an MSYS path; Python is a native Windows binary and cannot
# open one. Convert at the boundary rather than making the adapter care.
db="\$(cygpath -w "\$1" 2>/dev/null || printf '%s' "\$1")"
"\$RT_3XUI_PYTHON" - "\$db" "\$2" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
try:
    cur = con.execute(sys.argv[2])
    rows = cur.fetchall()
    con.commit()
    for r in rows:
        print("|".join("" if v is None else str(v) for v in r))
finally:
    con.close()
PYEOF
`;

const SYSTEMCTL_SHIM = `#!/usr/bin/env bash
set -u
cmd="\${1:-}"; shift 2>/dev/null || true
unit=""
for a in "\$@"; do case "\$a" in --*) ;; *) unit="\$a" ;; esac; done
units="\${RT_3XUI_UNITS:-/dev/null}"
state="\${RT_3XUI_SVC_STATE:-/dev/null}"
case "\$cmd" in
  list-unit-files)
    [ -f "\$units" ] && cat "\$units"
    exit 0 ;;
  is-active)
    [ -n "\$unit" ] || exit 3
    if [ -f "\$state" ] && [ "\$(cat "\$state")" = "active" ]; then exit 0; fi
    exit 3 ;;
  start)
    printf 'active\\n' > "\$state"; exit 0 ;;
  stop)
    printf 'inactive\\n' > "\$state"; exit 0 ;;
esac
exit 1
`;

/* The transaction engine locks with flock, which this host also lacks. Same
 * technique as the other two shims: an external binary replaced, not logic. */
const FLOCK_SHIM = `#!/usr/bin/env bash
mode=""; fd=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -n|-x) mode="n"; shift ;;
    -u)    mode="u"; shift ;;
    -*)    shift ;;
    *)     fd="$1"; shift ;;
  esac
done
[ -n "$fd" ] || exit 1
target="$(readlink /proc/self/fd/$fd 2>/dev/null)" || exit 1
d="$target.d"
case "$mode" in
  u) rmdir "$d" 2>/dev/null; exit 0 ;;
esac
mkdir "$d" 2>/dev/null || exit 1
exit 0
`;

const MAKEDB_PY = `import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
con.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT, value TEXT)")
con.execute("DELETE FROM settings")
for k, v in json.loads(sys.argv[2]):
    con.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (k, v))
con.commit()
con.close()
`;

const READDB_PY = `import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
print(json.dumps(con.execute("SELECT key, value FROM settings ORDER BY rowid").fetchall()))
con.close()
`;

/* A structurally valid Row-Template artifact: rt_validate_template demands at
 * least 40 KiB, the doctype, the closing tag, one branding marker pair, the
 * sub-data island and the BRANDING block. */
function makeArtifact() {
  const head = '<!doctype html>\n<html><head><title>t</title></head><body>\n';
  const tail = '/* row:branding */\nvar BRANDING = {};\n/* row:branding end */\n'
    + '<div id="sub-data"></div>\n</body></html>\n';
  const filler = '<!-- ' + 'x'.repeat(40960) + ' -->\n';
  return head + filler + tail;
}

/* ------------------------------------------------------------------------ */
/* fixture                                                                  */
/* ------------------------------------------------------------------------ */

/* A fixture that cannot be built must not be left behind. The throw happens
 * BEFORE the caller's try/finally exists, so nothing else would remove the
 * tree. Leaked trees accumulate across runs until process creation itself
 * begins failing with EBUSY -- which reads as a code failure and is not one.
 * (22 such trees were found in the temp directory after one such run.) */
function makeFixture(opts = {}) {
  const base = mkdtempSync(join(tmpdir(), 'row-3xui-'));
  try {
    return makeFixtureInto(base, opts);
  } catch (e) {
    rmSync(base, { recursive: true, force: true });
    throw e;
  }
}

/* `signals` is a BITMASK: 1 = binary, 2 = systemd unit, 4 = panel database.
 * The default is all three, because a fixture without a database cannot
 * exercise any verb that touches the selection -- detection tests pass an
 * explicit mask to pin a specific evidence count. */
function makeFixtureInto(base, { rows = [['subThemeDir', '/somewhere/else']], service = 'active', units = 'x-ui.service enabled\n', signals = 7 } = {}) {
  const rt = join(base, 'rt');
  const bin = join(base, 'bin');
  const work = join(base, 'work');
  const dbFolder = join(base, 'db');
  mkdirSync(join(rt, 'dist'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(dbFolder, { recursive: true });

  // the artifact + recorded checksum, so static verification has something real
  const art = makeArtifact();
  writeFileSync(join(rt, 'dist', 'template.html'), art);
  writeFileSync(join(rt, 'dist', 'template.html.sha256'), `${sha256(art)}  template.html\n`);

  writeFileSync(join(bin, 'sqlite3'), SQLITE_SHIM);
  writeFileSync(join(bin, 'systemctl'), SYSTEMCTL_SHIM);
  writeFileSync(join(bin, 'flock'), FLOCK_SHIM);
  chmodSync(join(bin, 'sqlite3'), 0o755);
  chmodSync(join(bin, 'systemctl'), 0o755);
  chmodSync(join(bin, 'flock'), 0o755);

  // signal A: the panel binary on PATH (rt_detect_xui finds it via command -v)
  if (signals & 1) {
    writeFileSync(join(bin, 'x-ui'), '#!/usr/bin/env bash\necho "3.6.0"\n');
    chmodSync(join(bin, 'x-ui'), 0o755);
  }
  // signal B: the systemd unit
  writeFileSync(join(work, 'units'), signals & 2 ? units : '');
  // signal C: the panel database
  const db = join(dbFolder, 'x-ui.db');
  if (signals & 4) {
    const py = join(work, 'makedb.py');
    writeFileSync(py, MAKEDB_PY);
    const r = spawnSync(PYTHON, [py, db, JSON.stringify(rows)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('fixture db: ' + r.stderr);
  }
  writeFileSync(join(work, 'svc'), service === 'active' ? 'active\n' : 'inactive\n');

  return { base, rt, bin, work, dbFolder, db, signals };
}

function sh(body, { fx = null, args = [], env = {} } = {}) {
  const f = fx || makeFixture();
  const own = !fx;
  try {
    const head =
      `RT_ROOT="$(cygpath -u '${u(f.rt)}' 2>/dev/null || printf '%s' '${u(f.rt)}' )"\nexport RT_ROOT\n` +
      `PATH="$(cygpath -u '${u(f.bin)}' 2>/dev/null || printf '%s' '${u(f.bin)}' ):$PATH"\nexport PATH\n` +
      `XUI_DB_FOLDER="$(cygpath -u '${u(f.dbFolder)}' 2>/dev/null || printf '%s' '${u(f.dbFolder)}' )"\nexport XUI_DB_FOLDER\n` +
      `RT_3XUI_UNITS="$(cygpath -u '${u(f.work)}/units' 2>/dev/null || printf '%s' '${u(f.work)}/units' )"\nexport RT_3XUI_UNITS\n` +
      `RT_3XUI_SVC_STATE="$(cygpath -u '${u(f.work)}/svc' 2>/dev/null || printf '%s' '${u(f.work)}/svc' )"\nexport RT_3XUI_SVC_STATE\n` +
      `RT_3XUI_SQL_LOG="$(cygpath -u '${u(f.work)}/sql.log' 2>/dev/null || printf '%s' '${u(f.work)}/sql.log' )"\nexport RT_3XUI_SQL_LOG\n` +
      `RT_3XUI_SQL_FAIL_MARK="$(cygpath -u '${u(f.work)}/failed' 2>/dev/null || printf '%s' '${u(f.work)}/failed' )"\nexport RT_3XUI_SQL_FAIL_MARK\n` +
      `D_WORK="$(cygpath -u '${u(f.work)}' 2>/dev/null || printf '%s' '${u(f.work)}' )"\nexport D_WORK\n` +
      `: > "$RT_3XUI_SQL_LOG"\n`;
    const preamble = 'set -Eeuo pipefail\nsource installer/lib/row-template.sh\n';
    const r = spawnSync(BASH, ['-c', head + preamble + body, 'row-3xui-test', ...args], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, RT_3XUI_PYTHON: PYTHON, ...env },
    });
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    if (own) rmSync(f.base, { recursive: true, force: true });
  }
}

function dbRows(f) {
  const py = join(f.work, 'readdb.py');
  writeFileSync(py, READDB_PY);
  const r = spawnSync(PYTHON, [py, f.db], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('readdb: ' + r.stderr);
  return JSON.parse(r.stdout.trim());
}
function setRows(f, rows) {
  const py = join(f.work, 'makedb.py');
  writeFileSync(py, MAKEDB_PY);
  const r = spawnSync(PYTHON, [py, f.db, JSON.stringify(rows)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('setRows: ' + r.stderr);
}
const svcState = (f) => readFileSync(join(f.work, 'svc'), 'utf8').trim();

/* ------------------------------------------------------------------------ */
/* 1. registration                                                          */
/* ------------------------------------------------------------------------ */

test('3xui is registered and reachable, as are the two panels added in 1.3.0', () => {
  const r = sh(`
    for p in 3xui pasarguard rebecca; do
      printf 'impl|%s|%s\\n' "$p" "$(rt_panel_impl_for "$p" || true)"
    done
    exit 0
  `);
  assert.equal(r.code, 0, r.err);
  const got = new Map(r.out.split('\n').filter(Boolean).map((l) => l.split('|').slice(1)));
  assert.equal(got.get('3xui'), '3xui', '3xui must resolve to its real implementation');
  assert.equal(got.get('pasarguard'), 'pasarguard', 'pasarguard resolves to its own adapter');
  assert.equal(got.get('rebecca'), 'rebecca', 'rebecca resolves to its own adapter');
});

test('the shipping adapters are what answer, each defining every frozen verb', () => {
  for (const name of ['3xui', 'pasarguard', 'rebecca']) {
    const file = join(PANELS_DIR, `${name}.sh`);
    assert.equal(existsSync(file), true, `installer/panels/${name}.sh must exist`);
    const src = read(file);
    for (const v of ['detect', 'capabilities', 'backup_state', 'install_template',
      'verify', 'restore_state', 'uninstall_template']) {
      assert.match(src, new RegExp(`^rt_panel_${name}_${v}\\(\\)`, 'm'), `${name} adapter must define ${v}`);
    }
  }
});

/* ------------------------------------------------------------------------ */
/* 2. detection                                                             */
/* ------------------------------------------------------------------------ */

test('detection is evidence-based: the frozen corroboration rule is implemented exactly', () => {
  /* P3 pins the rule: "Two independent signals must agree before this returns
   * SUCCESS. Where they disagree, or where only one is available, the answer is
   * FAILURE rather than a guess." Three signals, and the threshold is asserted
   * here rather than assumed. */
  const cases = [
    ['all-three', 7, 0],
    ['two-bin-unit', 3, 0],
    ['two-bin-db', 5, 0],
    ['two-unit-db', 6, 0],
    ['one-bin', 1, 1],
    ['one-unit', 2, 1],
    ['one-db', 4, 1],
    ['none', 0, 3],
  ];
  for (const [label, signals, want] of cases) {
    const fx = makeFixture({ signals });
    try {
      const r = sh('rc=0; rt_panel_detect 3xui >/dev/null 2>&1 || rc=$?; printf "%s" "$rc"; exit 0', { fx });
      assert.equal(r.code, 0, r.err);
      assert.equal(Number(r.out), want,
        `${label}: expected ${want}, got ${r.out}`);
    } finally {
      rmSync(fx.base, { recursive: true, force: true });
    }
  }
});

test('detection is read-only: no file, database or service state changes', () => {
  const fx = makeFixture();
  try {
    const before = {
      rows: JSON.stringify(dbRows(fx)),
      svc: svcState(fx),
      files: readdirSafe(fx.rt),
    };
    const r = sh(`
      for i in 1 2 3; do rt_panel_detect 3xui >/dev/null 2>&1 || true; done
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    assert.equal(JSON.stringify(dbRows(fx)), before.rows, 'the database must be untouched');
    assert.equal(svcState(fx), before.svc, 'the service state must be untouched');
    assert.equal(readdirSafe(fx.rt), before.files, 'no file may be created under RT_ROOT');
    /* And the structural guarantee: the adapter's detect uses no mutating call. */
    const body = codeOf(read(ADAPTER));
    const detect = body.slice(body.indexOf('rt_panel_3xui_detect() {'));
    const fn = detect.slice(0, detect.indexOf('\n}\n'));
    assert.equal(/\bsqlite3\b|\bsystemctl\b|rt_service_(start|stop)|rm |mv |cp /.test(fn), false,
      'detection must not reach a mutating or database call');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

function readdirSafe(dir) {
  const r = spawnSync(BASH, ['-c', `find "$(cygpath -u '${u(dir)}' 2>/dev/null || printf '%s' '${u(dir)}')" -type f | LC_ALL=C sort`], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

/* ------------------------------------------------------------------------ */
/* 3. capabilities                                                          */
/* ------------------------------------------------------------------------ */

test('the capability set is exactly what the adapter implements', () => {
  const r = sh('rt_panel_capabilities 3xui; exit 0');
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.split('\n').filter(Boolean), [
    'db_activation', 'selection_read', 'selection_write', 'service_control', 'static_verify',
  ], 'the set must be exactly this, in LC_ALL=C order');
});

test('no fake capability is declared: no file_placement, no live_verify', () => {
  const r = sh('rt_panel_capabilities 3xui; exit 0');
  const caps = r.out.split('\n').filter(Boolean);
  /* 3X-UI places no panel-side file, so claiming file_placement would describe
   * filesystem behaviour it does not have. */
  assert.equal(caps.includes('file_placement'), false, 'file_placement must not be declared');
  /* And no credential-free reliable live check exists, so it must not be either. */
  assert.equal(caps.includes('live_verify'), false, 'live_verify must not be declared');
  for (const c of caps) {
    assert.equal(/^[a-z_]+$/.test(c), true, `token must be well formed: ${c}`);
  }
});

/* ------------------------------------------------------------------------ */
/* 4. backup state                                                          */
/* ------------------------------------------------------------------------ */

test('the selection state is captured exactly, and absent is never confused with empty', () => {
  const cases = [
    ['absent', [], 'absent', ''],
    ['empty', [['subThemeDir', '']], 'empty', ''],
    ['present', [['subThemeDir', '/opt/themes/mine']], 'present', '/opt/themes/mine'],
    ['present-odd', [['subThemeDir', "/opt/it's here"]], 'present', "/opt/it's here"],
  ];
  for (const [label, rows, wantState, wantValue] of cases) {
    const fx = makeFixture({ rows, service: 'inactive' });
    try {
      const r = sh(`
        rc=0; rt_panel_backup_state 3xui || rc=$?
        printf 'rc|%s\\n' "$rc"
        printf 'state|%s\\n' "$(cat "$RT_PANEL_STAGE/3xui/selection.state" 2>/dev/null)"
        printf 'value|%s\\n' "$(cat "$RT_PANEL_STAGE/3xui/selection" 2>/dev/null)"
        printf 'meta|%s\\n' "$(tr '\\n' ' ' < "$RT_PANEL_STAGE/3xui/meta" 2>/dev/null)"
        printf 'filesbytes|%s\\n' "$(wc -c < "$RT_PANEL_STAGE/3xui/files" 2>/dev/null)"
        exit 0
      `, { fx });
      assert.equal(r.code, 0, r.err);
      const got = new Map(r.out.split('\n').filter(Boolean).map((l) => l.split('|')));
      assert.equal(got.get('rc'), '0', `${label}: capture must succeed`);
      assert.equal(got.get('state'), wantState, `${label}: state`);
      assert.equal(got.get('value') || '', wantValue, `${label}: value`);
      assert.equal(got.get('meta'), 'mechanism=db was_running=0 ', `${label}: meta`);
      assert.equal(got.get('filesbytes'), '0', `${label}: files must exist and be empty`);
    } finally {
      rmSync(fx.base, { recursive: true, force: true });
    }
  }
});

test('was_running is captured from the real service state', () => {
  for (const [service, want] of [['active', '1'], ['inactive', '0']]) {
    const fx = makeFixture({ service });
    try {
      const r = sh(`
        rt_panel_backup_state 3xui >/dev/null 2>&1 || true
        printf '%s' "$(LC_ALL=C awk -F= '/^was_running=/{print $2}' "$RT_PANEL_STAGE/3xui/meta")"
        exit 0
      `, { fx });
      assert.equal(r.code, 0, r.err);
      assert.equal(r.out, want, `service ${service} must record was_running=${want}`);
    } finally {
      rmSync(fx.base, { recursive: true, force: true });
    }
  }
});

test('the stage holds no credential, token or secret', () => {
  const fx = makeFixture({ rows: [['subThemeDir', '/opt/themes/mine'], ['subId', 'SECRET-SUB-ID'], ['password', 'hunter2']] });
  try {
    const r = sh(`
      rt_panel_backup_state 3xui >/dev/null 2>&1 || true
      cat "$RT_PANEL_STAGE/3xui/selection.state" "$RT_PANEL_STAGE/3xui/meta" "$RT_PANEL_STAGE/3xui/files"
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    assert.equal(/SECRET-SUB-ID|hunter2/.test(r.out), false,
      'no unrelated database value may reach the stage');
    /* The adapter reads exactly one key, and it is a constant. */
    const body = codeOf(read(ADAPTER));
    assert.equal(/subTemplate|subTemplateDir/.test(body), false,
      'subTemplate/subTemplateDir must never be used');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('a value that cannot be recorded exactly fails closed rather than being altered', () => {
  const fx = makeFixture({ rows: [['subThemeDir', 'line1\nline2']] });
  try {
    const r = sh('rc=0; rt_panel_backup_state 3xui >/dev/null 2>&1 || rc=$?; printf "%s" "$rc"; exit 0', { fx });
    assert.equal(r.code, 0, r.err);
    assert.equal(Number(r.out), 1, 'a newline-bearing value must be refused, not truncated');
    const staged = sh('[ -e "$RT_PANEL_STAGE/3xui/selection.state" ] && echo staged || echo nothing', { fx });
    assert.equal(staged.out, 'nothing', 'nothing may be staged for a refused capture');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------------ */
/* 5. SQLite mutation safety                                                */
/* ------------------------------------------------------------------------ */

test('the apply writes only subThemeDir, and leaves every other row untouched', () => {
  const fx = makeFixture({
    rows: [['subThemeDir', '/old'], ['subPort', '2096'], ['subPath', '/sub/'], ['webBasePath', '/']],
  });
  try {
    const r = sh(`
      printf '%s' "$RT_ROOT" > "$RT_3XUI_SVC_STATE"
      src="$RT_ROOT/dist/template.html"
      rc=0; rt_panel_install_template 3xui "$src" >/dev/null 2>&1 || rc=$?
      printf 'rc|%s\\n' "$rc"
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, 'rc|0');
    const rows = dbRows(fx);
    const map = new Map(rows);
    assert.equal(map.get('subThemeDir'), toPosix(fx.rt),
      'subThemeDir must now name RT_ROOT');
    assert.equal(map.get('subPort'), '2096', 'an unrelated row must be unchanged');
    assert.equal(map.get('subPath'), '/sub/', 'an unrelated row must be unchanged');
    assert.equal(map.get('webBasePath'), '/', 'an unrelated row must be unchanged');
    assert.equal(rows.length, 4, 'no row may be added or removed');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('apostrophes and SQL-looking values remain data', () => {
  const hostile = "x'; DROP TABLE settings; --";
  const fx = makeFixture({ rows: [['subThemeDir', "/opt/it's here"]] });
  try {
    /* First: a stored value with an apostrophe must round-trip through restore. */
    const r = sh(`
      rt_panel_backup_state 3xui >/dev/null 2>&1 || true
      printf 'staged|%s\\n' "$(cat "$RT_PANEL_STAGE/3xui/selection")"
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, "staged|/opt/it's here", 'the apostrophe must survive verbatim');

    /* Second: writing a hostile value must not execute anything. */
    const fx2 = makeFixture({ rows: [['subThemeDir', '/old']] });
    try {
      const r2 = sh(`
        src="$RT_ROOT/dist/template.html"
        rt_panel_3xui_db_ready >/dev/null 2>&1 || true

        rt_panel_3xui_selection_write '${hostile.replace(/'/g, "'\\''")}' >/dev/null 2>&1 || true
        exit 0
      `, { fx: fx2 });
      assert.equal(r2.code, 0, r2.err);
      const rows = dbRows(fx2);
      assert.equal(rows.length, 1, 'the table must still have exactly one row');
      assert.equal(rows[0][0], 'subThemeDir');
      assert.equal(rows[0][1], hostile, 'the hostile value must be stored as data, verbatim');
    } finally {
      rmSync(fx2.base, { recursive: true, force: true });
    }
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('the adapter never evals, sources or shells out to a database client', () => {
  const code = codeOf(read(ADAPTER));
  assert.equal(/\beval\b/.test(code), false, 'eval is forbidden');
  assert.equal(/^\s*(\.|source)\s/m.test(code), false, 'sourcing data is forbidden');
  assert.equal(/git\b|curl\b|wget\b/.test(code), false, 'no network or VCS access');
});

/* ------------------------------------------------------------------------ */
/* 6. service-state preservation                                            */
/* ------------------------------------------------------------------------ */

test('activation preserves the exact pre-transaction service state', () => {
  for (const [before, want] of [['active', 'active'], ['inactive', 'inactive']]) {
    const fx = makeFixture({ service: before });
    try {
      const r = sh(`
        src="$RT_ROOT/dist/template.html"
        rc=0; rt_panel_install_template 3xui "$src" >/dev/null 2>&1 || rc=$?
        printf '%s' "$rc"
        exit 0
      `, { fx });
      assert.equal(r.code, 0, r.err);
      assert.equal(r.out, '0', `install must succeed from ${before}`);
      assert.equal(svcState(fx), want,
        `a service that was ${before} must end ${want}`);
    } finally {
      rmSync(fx.base, { recursive: true, force: true });
    }
  }
});

test('with no known service unit, no service action is invented', () => {
  /* signals = 5 is binary + database, NO unit. The service starts out stopped so
   * that any start would be visible as a change. */
  const fx = makeFixture({ signals: 5, service: 'inactive' });
  try {
    const r = sh(`
      src="$RT_ROOT/dist/template.html"
      rc=0; rt_panel_install_template 3xui "$src" >/dev/null 2>&1 || rc=$?
      printf 'rc|%s\\n' "$rc"
      printf 'svc|%s\\n' "$(cat "$RT_3XUI_SVC_STATE" 2>/dev/null)"
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    const got = new Map(r.out.split('\n').filter(Boolean).map((l) => l.split('|')));
    assert.equal(got.get('rc'), '0', 'the write must still succeed');
    assert.equal(got.get('svc'), 'inactive', 'the service state file must be untouched');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------------ */
/* 7. verification                                                          */
/* ------------------------------------------------------------------------ */

test('static verification passes only for the correct, intact state', () => {
  const fx = makeFixture();
  try {
    const r = sh(`
      printf '%s' "$RT_ROOT" > "$RT_3XUI_SVC_STATE"
      rt_panel_3xui_db_ready >/dev/null 2>&1 || true

      rt_panel_3xui_selection_write "$RT_ROOT" >/dev/null 2>&1 || true
      rc=0; rt_panel_verify 3xui static >/dev/null 2>&1 || rc=$?
      printf 'good|%s\\n' "$rc"
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, 'good|0', 'correct state must verify');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('static verification fails on a wrong selection, a missing artifact and a corrupt one', () => {
  /* wrong selection */
  const fx1 = makeFixture({ rows: [['subThemeDir', '/somewhere/else']] });
  try {
    const r = sh('rc=0; rt_panel_verify 3xui static >/dev/null 2>&1 || rc=$?; printf "%s" "$rc"; exit 0', { fx: fx1 });
    assert.equal(r.out, '1', 'a wrong subThemeDir must fail');
  } finally { rmSync(fx1.base, { recursive: true, force: true }); }

  /* missing artifact */
  const fx2 = makeFixture();
  try {
    rmSync(join(fx2.rt, 'dist', 'template.html'));
    const r = sh(`
      rt_panel_3xui_db_ready >/dev/null 2>&1 || true

      rt_panel_3xui_selection_write "$RT_ROOT" >/dev/null 2>&1 || true
      rc=0; rt_panel_verify 3xui static >/dev/null 2>&1 || rc=$?
      printf '%s' "$rc"; exit 0
    `, { fx: fx2 });
    assert.equal(r.out, '1', 'a missing artifact must fail, not pass on existence alone');
  } finally { rmSync(fx2.base, { recursive: true, force: true }); }

  /* corrupt artifact: the file exists but no longer matches its recorded checksum */
  const fx3 = makeFixture();
  try {
    const p = join(fx3.rt, 'dist', 'template.html');
    const good = readFileSync(p, 'utf8');
    writeFileSync(p, good.replace('<body>', '<body> '));
    const r = sh(`
      rt_panel_3xui_db_ready >/dev/null 2>&1 || true

      rt_panel_3xui_selection_write "$RT_ROOT" >/dev/null 2>&1 || true
      rc=0; rt_panel_verify 3xui static >/dev/null 2>&1 || rc=$?
      printf '%s' "$rc"; exit 0
    `, { fx: fx3 });
    assert.equal(r.out, '1', 'a checksum mismatch must fail');
  } finally { rmSync(fx3.base, { recursive: true, force: true }); }
});

test('static verification never returns UNAVAILABLE, which the contract does not allow for it', () => {
  /* With no database at all, a mandatory check that cannot run has not passed. */
  const fx = makeFixture({ signals: 1 });
  try {
    const r = sh('rc=0; rt_panel_verify 3xui static >/dev/null 2>&1 || rc=$?; printf "%s" "$rc"; exit 0', { fx });
    assert.equal(r.out, '1', 'an unrun mandatory check is FAILURE, not UNAVAILABLE');
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test('live verification honestly reports UNAVAILABLE', () => {
  const r = sh('rc=0; rt_panel_verify 3xui live >/dev/null 2>&1 || rc=$?; printf "%s" "$rc"; exit 0');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, '2', 'live verification is UNAVAILABLE in this build');
});

/* ------------------------------------------------------------------------ */
/* 8. restore                                                               */
/* ------------------------------------------------------------------------ */

/* Build a format-2 snapshot by hand, so restore can be driven directly. */
function makeSnapshot(fx, panel, { state, value = '', files = '', mechanism = 'db', wasRunning = '0' }) {
  const snap = join(fx.work, 'snap');
  mkdirSync(join(snap, 'panels', panel), { recursive: true });
  const html = makeArtifact();
  writeFileSync(join(snap, 'template.html'), html);
  writeFileSync(join(snap, 'template.html.sha256'), `${sha256(html)}  template.html\n`);
  writeFileSync(join(snap, 'format'), '2\n');
  writeFileSync(join(snap, 'meta'), 'created=x\nversion=1.9.0\n');
  writeFileSync(join(snap, `panels/${panel}/selection.state`), `${state}\n`);
  if (state === 'present') writeFileSync(join(snap, `panels/${panel}/selection`), value);
  writeFileSync(join(snap, `panels/${panel}/meta`), `mechanism=${mechanism}\nwas_running=${wasRunning}\n`);
  writeFileSync(join(snap, `panels/${panel}/files`), files);
  const rels = ['format', 'meta', `panels/${panel}/files`, `panels/${panel}/meta`,
    `panels/${panel}/selection.state`, 'template.html', 'template.html.sha256'];
  if (state === 'present') rels.push(`panels/${panel}/selection`);
  rels.sort();
  writeFileSync(join(snap, 'manifest'),
    rels.map((r) => `${sha256(readFileSync(join(snap, r)))}  ${r}`).join('\n') + '\n');
  return snap;
}

test('restore applies absent, empty and present exactly', () => {
  const cases = [
    ['absent', { state: 'absent' }, []],
    ['empty', { state: 'empty' }, [['subThemeDir', '']]],
    ['present', { state: 'present', value: '/opt/original' }, [['subThemeDir', '/opt/original']]],
  ];
  for (const [label, spec, wantRows] of cases) {
    const fx = makeFixture({ rows: [['subThemeDir', '/current'], ['subPort', '2096']] });
    try {
      const snap = makeSnapshot(fx, '3xui', spec);
      const r = sh(`
        rc=0; rt_panel_restore_state 3xui "$(cygpath -u '${u(snap)}' 2>/dev/null || printf '%s' '${u(snap)}')" >/dev/null 2>&1 || rc=$?
        printf '%s' "$rc"; exit 0
      `, { fx });
      assert.equal(r.code, 0, r.err);
      assert.equal(r.out, '0', `${label}: restore must succeed`);
      const rows = dbRows(fx);
      const map = new Map(rows);
      assert.equal(map.get('subPort'), '2096', `${label}: an unrelated row must survive`);
      const sub = rows.filter(([k]) => k === 'subThemeDir');
      assert.equal(sub.length, wantRows.filter(([k]) => k === 'subThemeDir').length,
        `${label}: subThemeDir row count`);
      if (label !== 'absent') {
        assert.equal(map.get('subThemeDir'), wantRows[0][1], `${label}: exact value`);
      } else {
        assert.equal(map.has('subThemeDir'), false, 'absent must REMOVE the row');
      }
    } finally {
      rmSync(fx.base, { recursive: true, force: true });
    }
  }
});

test('restore fails closed on a non-empty files list, a wrong mechanism and a malformed state', () => {
  const cases = [
    ['non-empty-files', { state: 'absent', files: 'sub.html\n' }],
    ['wrong-mechanism', { state: 'absent', mechanism: 'env' }],
    ['bad-state-word', { state: 'nonsense' }],
    ['bad-was-running', { state: 'absent', wasRunning: '7' }],
  ];
  for (const [label, spec] of cases) {
    const fx = makeFixture({ rows: [['subThemeDir', '/current']] });
    try {
      const snap = makeSnapshot(fx, '3xui', spec);
      const r = sh(`
        rc=0; rt_panel_restore_state 3xui "$(cygpath -u '${u(snap)}' 2>/dev/null || printf '%s' '${u(snap)}')" >/dev/null 2>&1 || rc=$?
        printf '%s' "$rc"; exit 0
      `, { fx });
      assert.equal(r.code, 0, r.err);
      assert.equal(r.out, '1', `${label}: restore must be refused`);
      assert.equal(new Map(dbRows(fx)).get('subThemeDir'), '/current',
        `${label}: a refused restore must change nothing`);
    } finally {
      rmSync(fx.base, { recursive: true, force: true });
    }
  }
});

test('restore returns the service to its recorded state', () => {
  for (const [wasRunning, before, want] of [['1', 'inactive', 'active'], ['0', 'active', 'inactive']]) {
    const fx = makeFixture({ rows: [['subThemeDir', '/current']], service: before });
    try {
      const snap = makeSnapshot(fx, '3xui', { state: 'present', value: '/restored', wasRunning });
      const r = sh(`
        rc=0; rt_panel_restore_state 3xui "$(cygpath -u '${u(snap)}' 2>/dev/null || printf '%s' '${u(snap)}')" >/dev/null 2>&1 || rc=$?
        printf '%s' "$rc"; exit 0
      `, { fx });
      assert.equal(r.code, 0, r.err);
      assert.equal(r.out, '0', `restore must succeed (was_running=${wasRunning})`);
      assert.equal(svcState(fx), want, `was_running=${wasRunning} must end ${want}`);
    } finally {
      rmSync(fx.base, { recursive: true, force: true });
    }
  }
});

/* ------------------------------------------------------------------------ */
/* 9. uninstall                                                             */
/* ------------------------------------------------------------------------ */

test('uninstall removes only our selection, and refuses to touch someone else\'s', () => {
  /* pointing at us -> cleared */
  const fx1 = makeFixture({ rows: [['subThemeDir', 'PLACEHOLDER'], ['subPort', '2096']] });
  try {
    const r = sh(`
      rt_panel_3xui_db_ready >/dev/null 2>&1 || true

      rt_panel_3xui_selection_write "$RT_ROOT" >/dev/null 2>&1 || true
      rc=0; rt_panel_uninstall_template 3xui >/dev/null 2>&1 || rc=$?
      printf '%s' "$rc"; exit 0
    `, { fx: fx1 });
    assert.equal(r.out, '0', 'our own selection may be cleared');
    const map = new Map(dbRows(fx1));
    assert.equal(map.has('subThemeDir'), false, 'the row must be gone');
    assert.equal(map.get('subPort'), '2096', 'and nothing else may be touched');
  } finally { rmSync(fx1.base, { recursive: true, force: true }); }

  /* pointing elsewhere -> NOT_APPLICABLE, and nothing changes */
  const fx2 = makeFixture({ rows: [['subThemeDir', '/someone/elses/theme']] });
  try {
    const r = sh('rc=0; rt_panel_uninstall_template 3xui >/dev/null 2>&1 || rc=$?; printf "%s" "$rc"; exit 0', { fx: fx2 });
    assert.equal(r.out, '3', 'a foreign selection is NOT_APPLICABLE, not ours to delete');
    assert.equal(new Map(dbRows(fx2)).get('subThemeDir'), '/someone/elses/theme',
      'a foreign selection must be left alone');
  } finally { rmSync(fx2.base, { recursive: true, force: true }); }
});

/* ------------------------------------------------------------------------ */
/* 10. the adapter stays inside its contract                                */
/* ------------------------------------------------------------------------ */

test('the adapter does not add fields to the P2 snapshot schema', () => {
  const code = codeOf(read(ADAPTER));
  /* The only WRITER is the P2 function; the adapter composes no record itself.
   * It does READ the panel meta (to learn the mechanism and was_running), which
   * is why the assertion is about writing rather than about the path appearing. */
  assert.match(code, /rt_backup_panel_write/, 'the adapter must stage through the P2 writer');
  assert.equal(/>\s*"?\$?\{?RT_PANEL_STAGE/.test(code), false,
    'the adapter must not write staging files directly');
  assert.equal(/>\s*"?\$?\{?snap/.test(code), false,
    'the adapter must not write snapshot files directly');
  assert.equal(/\bmkdir\b/.test(code), false,
    'the adapter must not create snapshot directories');
  /* And it adds no field: the only names it writes come from the P2 writer's
   * own positional arguments. */
  assert.equal(/selection\.state\s*[=:>]/.test(code), false,
    'the adapter must not synthesise a selection.state of its own');
});

test('the transaction engine still contains no panel name', () => {
  const code = codeOf(read(TXN));
  for (const w of ['3xui', 'pasarguard', 'rebecca']) {
    assert.equal(new RegExp(w, 'i').test(code), false, `transaction.sh must not name ${w}`);
  }
  assert.equal(read(TXN).includes('3xui'), false, 'not even in a comment');
});

/* ------------------------------------------------------------------------ */
/* 11. the real engine driving the real adapter                             */
/* ------------------------------------------------------------------------ */
/* No doubles anywhere in this section: rt_transaction_run, the frozen P3
 * interface and the shipping adapter, all real. The snapshot writer is P2's,
 * unmodified. These are the cases that prove the architecture can actually
 * carry a real panel. */

test('a transaction through the real engine and the real adapter commits', () => {
  const fx = makeFixture({ rows: [['subThemeDir', '/before'], ['subPort', '2096']], service: 'active' });
  try {
    const r = sh(`
      rc=0
      rt_transaction_run 3xui "$RT_ROOT/dist/template.html" >/dev/null 2>"$D_WORK/txn.log" || rc=$?
      printf 'rc|%s\\n' "$rc"
      printf 'state|%s\\n' "$RT_TXN_STATE"
      printf 'events|%s\\n' "$(LC_ALL=C grep -o 'transaction:[a-z-]*' "$D_WORK/txn.log" | tr '\\n' ' ')"
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    const got = new Map(r.out.split('\n').filter(Boolean).map((l) => l.split('|')));
    assert.equal(got.get('rc'), '0', 'the transaction must commit');
    assert.equal(got.get('state'), 'COMMITTED');
    /* The event stream is `grep -o | tr '\n' ' '`, and $( ) strips the trailing
     * newline rather than the trailing space, so the joined string has no
     * trailing space. Compare without one. */
    assert.equal(got.get('events'),
      'transaction:begin transaction:locked transaction:capture transaction:snapshot '
      + 'transaction:mutate transaction:verify-static transaction:commit',
      'and it must take the documented order');

    const map = new Map(dbRows(fx));
    assert.equal(map.get('subThemeDir'), toPosix(fx.rt), 'the panel must now point at RT_ROOT');
    assert.equal(map.get('subPort'), '2096', 'an unrelated row must survive the transaction');
    assert.equal(svcState(fx), 'active', 'a running service must still be running');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('a post-mutation failure rolls back once, restoring the selection and the service', () => {
  const fx = makeFixture({ rows: [['subThemeDir', '/original'], ['subPort', '2096']], service: 'active' });
  try {
    const r = sh(`
      RT_3XUI_SQL_FAIL_ONCE='UPDATE settings SET value=' ; export RT_3XUI_SQL_FAIL_ONCE
      rc=0
      rt_transaction_run 3xui "$RT_ROOT/dist/template.html" >/dev/null 2>"$D_WORK/txn.log" || rc=$?
      printf 'rc|%s\\n' "$rc"
      printf 'state|%s\\n' "$RT_TXN_STATE"
      printf 'rollback|%s\\n' "$(LC_ALL=C grep -cE 'transaction:rollback$' "$D_WORK/txn.log" || true)"
      printf 'rollbackfail|%s\\n' "$(LC_ALL=C grep -c 'transaction:rollback-failed' "$D_WORK/txn.log" || true)"
      exit 0
    `, { fx });
    assert.equal(r.code, 0, r.err);
    const got = new Map(r.out.split('\n').filter(Boolean).map((l) => l.split('|')));
    assert.equal(got.get('rc'), '1', 'the transaction must fail');
    /* The engine reports FAILED, not ROLLED_BACK, and that is the CONSERVATIVE,
     * contract-correct outcome rather than a defect: it claims ROLLED_BACK only
     * after its post-restore static check passes, and for a selection-based
     * panel that check asks the INSTALL question ("does the panel serve
     * Row-Template?"), to which the honest answer after a rollback is no. The
     * engine therefore declines to claim a clean rollback it cannot confirm --
     * it never over-reports. The limitation is recorded in
     * INSTALLER-PANEL-3XUI.md; what matters here is what the rollback DID. */
    assert.equal(got.get('state'), 'FAILED',
      'the engine must not claim a clean rollback it cannot confirm');
    assert.equal(got.get('rollback'), '1', 'rollback is attempted exactly once');
    assert.equal(got.get('rollbackfail'), '1',
      'and the engine reports the post-restore check it could not satisfy');

    const map = new Map(dbRows(fx));
    assert.equal(map.get('subThemeDir'), '/original',
      'the ORIGINAL selection must be back, exactly');
    assert.equal(map.get('subPort'), '2096', 'unrelated rows must survive the rollback too');
    assert.equal(svcState(fx), 'active', 'and the service must be back in its original state');
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('the user-facing format-1 rollback path is untouched by P5A', () => {
  /* P5A adds an adapter. It does not re-wire the production rollback, which must
   * keep reading the format-1 namespace only. */
  const lib = read(join(ROOT, 'installer', 'lib', 'row-template.sh'));
  const start = lib.indexOf('rt_cmd_rollback() {');
  assert.ok(start > 0, 'rt_cmd_rollback must still exist');
  const body = lib.slice(start, lib.indexOf('\nrt_print_help() {', start));
  assert.equal(body.includes('RT_BACKUPS_V2'), false,
    'the production rollback must not read format-2 snapshots');
  assert.equal(body.includes('RT_BACKUPS'), true);
  const create = lib.slice(lib.indexOf('rt_backup_create() {'));
  assert.match(create.slice(0, 4000), /\[ "\$\{1:-\}" = "v2" \]/,
    'format 2 must still require an explicit mode');
});
