/* The generic transaction engine (P4).
 *
 * WHAT THIS SUITE IS FOR. P4 is an ORCHESTRATOR: it owns the ORDER of
 * operations, the mutation boundary, and the decision to roll back exactly
 * once. Almost everything that can go wrong here is an ordering or
 * fail-open mistake, not an arithmetic one, so the suite is a mix of:
 *
 *   - STRUCTURAL assertions about the engine's source (which call precedes
 *     which, that nothing panel-specific leaked in, that the frozen P3
 *     contract is used rather than re-implemented), and
 *   - BEHAVIOURAL assertions driven through deterministic doubles, which
 *     prove the order is real rather than merely written down.
 *
 * TEST DOUBLES, NOT FAKE PANELS. The doubles are shell functions defined in
 * this harness AFTER the library is sourced, so they override the P3 public
 * entry points for the duration of the run. Nothing is added to shipping code,
 * and no panel adapter is created: installer/panels/ still holds only
 * interface.sh and index.sh.
 *
 * COST, AND WHY THE SHAPE IS WHAT IT IS. This host intercepts process
 * creation, so every `sha256sum`/`awk`/`wc`/`cat` inside the library costs
 * roughly half a second. A safety-snapshot validation therefore costs seconds,
 * and a transaction that also rolls back validates twice. Three consequences
 * shaped this file:
 *
 *   - The whole scenario table runs in ONE bash process (a loop over argv),
 *     not one process per case.
 *   - Fixtures are built and removed from Node, never from bash.
 *   - The bulk fixture is a format-2 snapshot WITHOUT a manifest. That is
 *     deliberate and it is valid: rt_backup_format takes the format from the
 *     canonical `format` file, and rt_backup_manifest_check accepts an absent
 *     manifest by contract. A manifest is P2's own concern and is already
 *     covered by the P2 reader suite, which this suite must not duplicate. One
 *     dedicated test below uses a FULL snapshot (manifest included) so the
 *     realistic shape is covered too.
 *
 * On a normal Linux host the same suite runs in seconds.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve('.');
const LIB = join(ROOT, 'installer', 'lib', 'row-template.sh');
const TXN = join(ROOT, 'installer', 'lib', 'transaction.sh');
const PANELS_DIR = join(ROOT, 'installer', 'panels');

const read = (p) => readFileSync(p, 'utf8');

/* Strip whole-line comments so an assertion about what code DOES is never
   satisfied by prose that happens to use the same word. The engine is heavily
   commented, and several negative assertions below are exactly that shape. */
const codeOf = (src) => src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/* ------------------------------------------------------------------------ */
/* the flock shim                                                           */
/* ------------------------------------------------------------------------ */
/* This host has no flock, so the engine's fail-closed guard fires and no
 * locking behaviour can be exercised at all. The shim below supplies just
 * enough of flock's contract for the engine to run: `flock -n FD` takes an
 * exclusive lock on the file behind FD, `flock -u FD` releases it.
 *
 * It is an EXTERNAL-BINARY double, not a substitute for the engine's logic:
 * the engine still calls `flock -n 9` and `flock -u 9` through a real file
 * descriptor and still checks `command -v flock` first. The shim implements
 * mutual exclusion the portable way available here -- an atomic `mkdir` on a
 * name derived from the locked file -- so two processes genuinely contend.
 *
 * The engine's behaviour when flock is genuinely absent is tested separately,
 * by shadowing `command`, which does not depend on what this host has. */
const FLOCK_SHIM = [
  '#!/usr/bin/env bash',
  'mode=""; fd=""',
  'while [ "$#" -gt 0 ]; do',
  '  case "$1" in',
  '    -n|-x) mode="n"; shift ;;',
  '    -u)    mode="u"; shift ;;',
  '    -*)    shift ;;',
  '    *)     fd="$1"; shift ;;',
  '  esac',
  'done',
  '[ -n "$fd" ] || exit 1',
  'target="$(readlink /proc/self/fd/$fd 2>/dev/null)" || exit 1',
  '[ -n "$target" ] || exit 1',
  'd="$target.d"',
  'case "$mode" in',
  '  u) rmdir "$d" 2>/dev/null; exit 0 ;;',
  'esac',
  'mkdir "$d" 2>/dev/null || exit 1',
  'exit 0',
].join('\n') + '\n';

/* ------------------------------------------------------------------------ */
/* deterministic panel doubles                                              */
/* ------------------------------------------------------------------------ */
/* Each double appends its name to a LOG FILE, not to a shell variable. That
 * distinction is not cosmetic: `caps="$(rt_panel_capabilities ...)"` and
 * `snap="$(rt_backup_create ...)"` run their double in a COMMAND SUBSTITUTION,
 * i.e. in a subshell, and a subshell's assignment to a variable is discarded
 * when it exits. A variable-backed log therefore silently omits exactly the
 * two calls that are made through a substitution, which reads as "the engine
 * never read capabilities" and "the engine never took a snapshot". Appending to
 * a file survives the subshell.
 *
 * The two verification counters let a scenario distinguish the engine's
 * FORWARD static check from the ROLLBACK one, which is what makes "rollback
 * exactly once" and "a failed rollback does not retry" observable. */
const DOUBLES = [
  'double() { printf "%s\\n" "$1" >> "${RT_TXN_LOGFILE:-/dev/null}"; }',
  'rt_panel_detect()             { double detect;       return "${D_DETECT:-0}"; }',
  'rt_panel_capabilities()       { double capabilities; printf "%s\\n" ${D_CAPS-file_placement static_verify live_verify}; return "${D_CAPS_RC:-0}"; }',
  'rt_panel_backup_state()       { double backup_state; return "${D_BACKUP:-0}"; }',
  'rt_panel_install_template()   { double install;      return "${D_INSTALL:-0}"; }',
  'rt_panel_verify() {',
  '  double "verify:$2"',
  '  case "$2" in',
  '    static) D_VS_N=$(( ${D_VS_N:-0} + 1 ))',
  '            if [ "$D_VS_N" -eq 1 ]; then return "${D_VSTATIC:-0}"; else return "${D_VSTATIC2-${D_VSTATIC:-0}}"; fi ;;',
  '    live)   D_VL_N=$(( ${D_VL_N:-0} + 1 ))',
  '            if [ "$D_VL_N" -eq 1 ]; then return "${D_VLIVE:-0}"; else return "${D_VLIVE2-${D_VLIVE:-0}}"; fi ;;',
  '  esac',
  '  return 1',
  '}',
  'rt_panel_restore_state()      { double restore;      return "${D_RESTORE:-0}"; }',
  'rt_panel_uninstall_template() { double uninstall;    return "${D_UNINSTALL:-0}"; }',
  'rt_backup_create() {',
  '  double snapshot',
  '  [ "${D_SNAP:-0}" = "0" ] || return "${D_SNAP}"',
  '  printf "%s" "${D_SNAP_PATH:-}"',
  '}',
].join('\n') + '\n';

/* ------------------------------------------------------------------------ */
/* fixture                                                                  */
/* ------------------------------------------------------------------------ */

const u = (p) => p.split('\\').join('/');

/* A minimal but genuinely VALID format-2 snapshot for PANEL.
 * `withManifest` adds the manifest a real writer would emit. */
function buildSnapshot(rt, name, panel, withManifest) {
  const snap = join(rt, 'backups.v2', name);
  mkdirSync(join(snap, 'panels', panel), { recursive: true });
  const html = '<!doctype html>\n';
  writeFileSync(join(snap, 'template.html'), html);
  writeFileSync(join(snap, 'template.html.sha256'), `${sha256(html)}  template.html\n`);
  writeFileSync(join(snap, 'format'), '2\n');
  writeFileSync(join(snap, 'meta'), 'created=20260923T000000Z\nversion=1.9.0\n');
  writeFileSync(join(snap, `panels/${panel}/selection.state`), 'absent\n');
  writeFileSync(join(snap, `panels/${panel}/meta`), 'mechanism=db\nwas_running=0\n');
  writeFileSync(join(snap, `panels/${panel}/files`), '');
  if (withManifest) {
    const rels = ['format', 'meta', `panels/${panel}/files`, `panels/${panel}/meta`,
      `panels/${panel}/selection.state`, 'template.html', 'template.html.sha256'].sort();
    writeFileSync(join(snap, 'manifest'),
      rels.map((r) => `${sha256(readFileSync(join(snap, r)))}  ${r}`).join('\n') + '\n');
  }
  return snap;
}

function makeFixture() {
  const base = mkdtempSync(join(tmpdir(), 'row-p4-'));
  const rt = join(base, 'rt');
  const bin = join(base, 'bin');
  mkdirSync(join(rt, 'dist'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(rt, 'dist', 'template.html'), '<!doctype html>\n');
  writeFileSync(join(bin, 'flock'), FLOCK_SHIM);
  chmodSync(join(bin, 'flock'), 0o755);
  const snap = buildSnapshot(rt, 'S1', '3xui', false);
  const full = buildSnapshot(rt, 'FULL', '3xui', true);
  /* a directory that is NOT a snapshot: validation must reject it */
  const broken = join(rt, 'backups.v2', 'BROKEN');
  mkdirSync(broken, { recursive: true });
  return { base, rt, bin, snap, full, broken, work: join(base, 'work') };
}

/* Run BODY in a throwaway fixture. `args` arrive as "$@" so a table can be
 * driven in a single process. */
function sh(body, { args = [], useShim = true, doubles = false, fixture = null, env = {} } = {}) {
  const fx = fixture || makeFixture();
  const own = !fixture;
  try {
    mkdirSync(fx.work, { recursive: true });
    const head =
      `RT_ROOT="$(cygpath -u '${u(fx.rt)}' 2>/dev/null || printf '%s' '${u(fx.rt)}' )"\nexport RT_ROOT\n` +
      (useShim
        ? `PATH="$(cygpath -u '${u(fx.bin)}' 2>/dev/null || printf '%s' '${u(fx.bin)}' ):$PATH"\nexport PATH\n`
        : '') +
      `D_SNAP_PATH="$(cygpath -u '${u(fx.snap)}' 2>/dev/null || printf '%s' '${u(fx.snap)}' )"\nexport D_SNAP_PATH\n` +
      `D_FULL_PATH="$(cygpath -u '${u(fx.full)}' 2>/dev/null || printf '%s' '${u(fx.full)}' )"\nexport D_FULL_PATH\n` +
      `D_BROKEN_PATH="$(cygpath -u '${u(fx.broken)}' 2>/dev/null || printf '%s' '${u(fx.broken)}' )"\nexport D_BROKEN_PATH\n` +
      `D_WORK="$(cygpath -u '${u(fx.work)}' 2>/dev/null || printf '%s' '${u(fx.work)}' )"\nexport D_WORK\n` +
      `RT_TXN_LOGFILE="$D_WORK/doubles"\nexport RT_TXN_LOGFILE\n: > "$RT_TXN_LOGFILE"\n`;
    const preamble = 'set -Eeuo pipefail\nsource installer/lib/row-template.sh\n';
    const r = spawnSync('bash', ['-c', head + preamble + (doubles ? DOUBLES : '') + body, 'row-p4-test', ...args], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    if (own) rmSync(fx.base, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------------ */
/* 1. the scenario table                                                    */
/* ------------------------------------------------------------------------ */
/* ONE bash process drives every scenario. Row format:
 *   <label>\t<panel>\t<VAR=value>...
 *
 * Each scenario runs against the SAME fixture, so the table is cheap. The
 * stale stage marker is planted once, before the loop, and reported for every
 * scenario: the scenarios that abort BEFORE the capture step must leave it
 * alone, and the first scenario that reaches the capture step must clear it.
 * That turns stage hygiene into a per-scenario observation at no extra cost.
 *
 * ORDER IS LOAD-BEARING, in one direction. The marker is planted ONCE and the
 * first scenario that reaches capture clears it for good, so every scenario
 * that must be observed as "never touched the stage" has to appear BEFORE the
 * first scenario that does reach capture. Keep the refusal cases above the
 * first accepting case; an accepting case inserted too high silently turns
 * later refusals into false "absent" readings.
 */
const SCENARIOS = [
  /* label                    panel    assignments */
  ['bad-panel',               'nope',  []],
  ['detect-fail',             '3xui',  ['D_DETECT=1']],
  ['detect-not-applicable',   '3xui',  ['D_DETECT=3']],
  ['detect-unavailable',      '3xui',  ['D_DETECT=2']],
  ['capabilities-unavailable', '3xui', ['D_CAPS_RC=2']],
  ['capability-unknown',      '3xui',  ['D_CAPS=file_placement static_verify invented_capability']],
  /* No apply capability at all: static_verify alone is not enough, because the
   * engine would have nothing to perform. Refused BEFORE mutation. And neither
   * apply mechanism is enough on its own without static_verify: the two kinds of
   * requirement are independent, so satisfying one must not satisfy the other.
   *
   * These refusals stay ABOVE the first accepting scenario -- see the ordering
   * note above SCENARIOS. */
  ['no-apply-capability',     '3xui',  ['D_CAPS=static_verify']],
  ['capability-no-static-verify', '3xui', ['D_CAPS=file_placement']],
  ['selection-no-static-verify', '3xui', ['D_CAPS=selection_write']],
  ['capability-empty',        '3xui',  ['D_CAPS=']],
  /* The apply requirement is mechanism-INDEPENDENT: each of these is a
   * complete answer on its own, and neither may be required by name.
   * `apply-by-selection` mirrors the `ok` scenario exactly except for the apply
   * mechanism, so the two call sequences are directly comparable -- that is the
   * strongest form of "the engine does not care which mechanism it got". */
  ['apply-by-selection',      '3xui',  ['D_CAPS=selection_write static_verify live_verify']],
  ['apply-by-both',           '3xui',  ['D_CAPS=file_placement selection_write static_verify']],
  ['capture-fail',            '3xui',  ['D_BACKUP=1']],
  ['snapshot-fail',           '3xui',  ['D_SNAP=1']],
  ['ok',                      '3xui',  []],
  ['live-unavailable',        '3xui',  ['D_VLIVE=2']],
  ['live-not-applicable',     '3xui',  ['D_VLIVE=3']],
  ['live-fail',               '3xui',  ['D_VLIVE=1']],
  ['no-live-capability',      '3xui',  ['D_CAPS=file_placement static_verify']],
  ['install-fail',            '3xui',  ['D_INSTALL=1']],
  ['static-fail',             '3xui',  ['D_VSTATIC=1', 'D_VSTATIC2=0']],
  ['static-unavailable',      '3xui',  ['D_VSTATIC=2', 'D_VSTATIC2=0']],
  ['static-not-applicable',   '3xui',  ['D_VSTATIC=3', 'D_VSTATIC2=0']],
  ['rollback-restore-fail',   '3xui',  ['D_INSTALL=1', 'D_RESTORE=1']],
  /* Placement fails, so the rollback's static check is the FIRST one this
   * scenario makes -- D_VSTATIC, not D_VSTATIC2. */
  ['rollback-verify-fail',    '3xui',  ['D_INSTALL=1', 'D_VSTATIC=1']],
  ['pasarguard-ok',           'pasarguard', []],
  ['rebecca-ok',              'rebecca',    []],
];

function runTable() {
  const rows = SCENARIOS.map(([label, panel, assigns]) => [label, panel, ...assigns].join('\t'));
  const body = [
    'TAB=$(printf "\\t")',
    'EV="$D_WORK/events"',
    ': > "$EV"',
    'mkdir -p "$RT_PANEL_STAGE"',
    'printf "stale\\n" > "$RT_PANEL_STAGE/stale"',
    'for row in "$@"; do',
    '  label="${row%%"$TAB"*}"',
    '  rest="${row#*"$TAB"}"',
    '  panel="${rest%%"$TAB"*}"',
    '  assigns="${rest#*"$TAB"}"',
    '  # No trailing assignments leaves ${rest#*"$TAB"} equal to ${rest} itself,',
    '  # because a string without the delimiter is returned unchanged. Comparing',
    '  # against ${rest} -- not ${row} -- is what detects that case; comparing',
    '  # against ${row} never matches and would export the PANEL as a variable.',
    '  if [ "$assigns" = "$rest" ]; then assigns=""; fi',
    '  unset D_DETECT D_CAPS D_CAPS_RC D_BACKUP D_INSTALL D_VSTATIC D_VSTATIC2 D_VLIVE D_VLIVE2 D_RESTORE D_SNAP',
    '  : > "$RT_TXN_LOGFILE"',
    '  D_VS_N=0; D_VL_N=0',
    '  if [ -n "$assigns" ]; then',
    '    IFS="$TAB" read -r -a kv <<< "$assigns"',
    '    for a in "${kv[@]}"; do export "$a"; done',
    '  fi',
    '  printf "MARK %s\\n" "$label" >> "$EV"',
    '  rc=0',
    '  rt_transaction_run "$panel" /src/template.html >/dev/null 2>>"$EV" || rc=$?',
    '  if [ -e "$RT_PANEL_STAGE/stale" ]; then stage=present; else stage=absent; fi',
    '  log=""',
    '  while IFS= read -r l; do log="${log:+$log }$l"; done < "$RT_TXN_LOGFILE"',
    '  printf "ROW\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n" "$label" "$rc" "$RT_TXN_STATE" "$RT_TXN_MUTATED" "$stage" "$log"',
    'done',
    'printf "===EVENTS===\\n"',
    'cat "$EV"',
    'exit 0',
  ].join('\n');
  const r = sh(body, { args: rows, doubles: true });
  assert.equal(r.code, 0, r.err);
  const [rowsPart, eventsPart] = r.out.split('===EVENTS===');
  const results = new Map();
  for (const line of (rowsPart || '').split('\n')) {
    if (!line.startsWith('ROW\t')) continue;
    const [, label, rc, state, mutated, stage, log] = line.split('\t');
    results.set(label, { rc: Number(rc), state, mutated: Number(mutated), stage, log: log || '' });
  }
  const events = new Map();
  let current = null;
  for (const line of (eventsPart || '').split('\n')) {
    const mark = line.match(/^MARK (.+)$/);
    if (mark) { current = mark[1]; events.set(current, []); continue; }
    const ev = line.match(/transaction:([a-z-]+)/);
    if (ev && current) events.get(current).push(ev[1]);
  }
  return { results, events };
}

const TABLE = runTable();
const R = (label) => {
  const row = TABLE.results.get(label);
  assert.ok(row, `no result for scenario ${label}`);
  return row;
};
const E = (label) => TABLE.events.get(label) || [];
const calls = (label) => R(label).log.split(' ').filter(Boolean);
const countCall = (label, name) => calls(label).filter((c) => c === name).length;

/* ------------------------------------------------------------------------ */
/* 2. the happy path and its ordering                                       */
/* ------------------------------------------------------------------------ */

test('a successful transaction commits, and performs every step in the frozen order', () => {
  const row = R('ok');
  assert.equal(row.rc, 0, 'a successful transaction returns SUCCESS');
  assert.equal(row.state, 'COMMITTED');
  assert.equal(row.mutated, 1);
  assert.deepEqual(calls('ok'), [
    'detect', 'capabilities', 'backup_state', 'snapshot', 'install', 'verify:static', 'verify:live',
  ]);
  assert.deepEqual(E('ok'), [
    'begin', 'locked', 'capture', 'snapshot', 'mutate', 'verify-static', 'verify-live', 'commit',
  ]);
});

test('every panel in the closed enum runs the same generic path', () => {
  for (const [panel, label] of [['3xui', 'ok'], ['pasarguard', 'pasarguard-ok'], ['rebecca', 'rebecca-ok']]) {
    const row = R(label);
    assert.equal(row.rc, 0, `${panel} should commit`);
    assert.equal(row.state, 'COMMITTED');
    assert.deepEqual(calls(label), calls('ok'),
      `${panel} must take the identical generic path`);
  }
});

/* ------------------------------------------------------------------------ */
/* 3. single-flight locking                                                 */
/* ------------------------------------------------------------------------ */

test('a second concurrent transaction is refused while the first holds the lock', () => {
  const body = [
    'READY="$D_WORK/ready"; : > "$READY"; rm -f "$READY"',
    '( rt_transaction_lock_acquire && { : > "$READY"; sleep 3; rt_transaction_lock_release; } ) &',
    'holder=$!',
    'n=0',
    'while [ ! -f "$READY" ] && [ "$n" -lt 100 ]; do sleep 0.1; n=$((n+1)); done',
    '[ -f "$READY" ] || { echo "HOLDER NEVER READY"; exit 3; }',
    'rc=0',
    'rt_transaction_lock_acquire 2>/dev/null || rc=$?',
    'printf "second=%s\\n" "$rc"',
    'wait "$holder" 2>/dev/null || true',
    'rc2=0',
    'rt_transaction_lock_acquire 2>/dev/null || rc2=$?',
    'printf "after_release=%s\\n" "$rc2"',
    'rt_transaction_lock_release',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /second=1/, 'the second transaction must fail immediately, not queue');
  assert.match(r.out, /after_release=0/, 'the lock must be usable again once released');
});

test('flock being unavailable fails CLOSED, and never runs unlocked', () => {
  /* `command` is shadowed so the guard is exercised on a host that HAS flock
   * as well as on one that does not. */
  const body = [
    'command() { if [ "$1" = "-v" ] && [ "$2" = "flock" ]; then return 1; fi; builtin command "$@"; }',
    'rc=0',
    'rt_transaction_lock_acquire 2>"$D_WORK/err" || rc=$?',
    'printf "acquire=%s\\n" "$rc"',
    'grep -q "flock is not available" "$D_WORK/err" && echo "message=ok" || echo "message=missing"',
    'rc2=0',
    'rt_transaction_run 3xui /src/template.html >/dev/null 2>&1 || rc2=$?',
    'printf "run=%s state=%s\\n" "$rc2" "$RT_TXN_STATE"',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /acquire=1/, 'acquiring without flock must fail');
  assert.match(r.out, /message=ok/, 'the refusal must say why');
  assert.match(r.out, /run=1 state=FAILED/,
    'a transaction must not run unlocked, and must report FAILED');
});

test('the lock descriptor is refused when it is already open', () => {
  const body = [
    'exec 9>"$D_WORK/preopened"',
    'rc=0',
    'rt_transaction_lock_acquire 2>/dev/null || rc=$?',
    'printf "rc=%s\\n" "$rc"',
    'exec 9>&- 2>/dev/null || true',
    'rc2=0',
    'rt_transaction_lock_acquire 2>/dev/null || rc2=$?',
    'printf "after_close=%s\\n" "$rc2"',
    'rt_transaction_lock_release',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /rc=1/, 'a pre-opened fd 9 must be refused rather than clobbered');
  assert.match(r.out, /after_close=0/);
});

test('the lock is released after both a successful and a failed transaction', () => {
  const body = [
    'ok_rc=0; rt_transaction_run 3xui /src/t.html >/dev/null 2>&1 || ok_rc=$?',
    'fail_rc=0; rt_transaction_run nope /src/t.html >/dev/null 2>&1 || fail_rc=$?',
    'rc=0; rt_transaction_lock_acquire 2>/dev/null || rc=$?',
    'printf "ok=%s fail=%s reacquire=%s\\n" "$ok_rc" "$fail_rc" "$rc"',
    'rt_transaction_lock_release',
    'exit 0',
  ].join('\n');
  const r = sh(body, { doubles: true });
  assert.equal(r.code, 0, r.err);
  /* `reacquire=0` is the proof: the lock was free again after both paths. */
  assert.match(r.out, /ok=0 fail=1 reacquire=0/,
    'neither path may leave the lock held');
});

/* ------------------------------------------------------------------------ */
/* 4. the mutation boundary                                                 */
/* ------------------------------------------------------------------------ */

test('an invalid panel id is rejected before anything is mutated', () => {
  const row = R('bad-panel');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'FAILED');
  assert.equal(row.mutated, 0);
  assert.deepEqual(calls('bad-panel'), [], 'nothing may be called for an unknown panel');
});

test('detection failure aborts before mutation, for every non-success status', () => {
  for (const label of ['detect-fail', 'detect-not-applicable', 'detect-unavailable']) {
    const row = R(label);
    assert.equal(row.rc, 1, label);
    assert.equal(row.state, 'FAILED', label);
    assert.equal(row.mutated, 0, label);
    assert.deepEqual(calls(label), ['detect'], `${label}: detection is the only call`);
  }
});

test('capabilities are read and validated before anything is mutated', () => {
  assert.deepEqual(calls('capabilities-unavailable'), ['detect', 'capabilities']);
  assert.equal(R('capabilities-unavailable').mutated, 0);

  /* A token outside the closed vocabulary is refused rather than ignored: the
   * engine cannot branch on a capability it has never heard of. */
  assert.deepEqual(calls('capability-unknown'), ['detect', 'capabilities']);
  assert.equal(R('capability-unknown').rc, 1);
  assert.equal(R('capability-unknown').mutated, 0);

  /* A missing requirement is refused BEFORE mutating, rather than mutating and
   * then being forced to roll back. This list covers both KINDS of requirement:
   * no apply capability at all, no static_verify, an empty set, and
   * selection_write without static_verify. */
  for (const label of ['no-apply-capability', 'capability-no-static-verify',
    'capability-empty', 'selection-no-static-verify']) {
    assert.equal(R(label).rc, 1, label);
    assert.equal(R(label).mutated, 0, label);
    assert.deepEqual(calls(label), ['detect', 'capabilities'], `${label}: refused before capture`);
  }
});

test('the apply requirement is satisfied by either mechanism, and by both', () => {
  /* THE CORRECTION THIS SUITE EXISTS TO PIN. The engine needs proof that a
   * template CAN be applied, and must not care HOW. Requiring file_placement by
   * name was a mechanism leak that made a selection-only panel impossible to
   * drive; each of these is now a complete answer. */
  for (const label of ['apply-by-selection', 'apply-by-both']) {
    const row = R(label);
    assert.equal(row.rc, 0, `${label} must be accepted`);
    assert.equal(row.state, 'COMMITTED', label);
    assert.equal(row.mutated, 1, label);
  }
  /* ...and a selection-based panel takes the IDENTICAL generic path. */
  assert.deepEqual(calls('apply-by-selection'), calls('ok'),
    'a selection-based panel must not be routed differently');
});

test('the two kinds of capability requirement are independent', () => {
  /* Satisfying the apply requirement does not satisfy static_verify, and vice
   * versa. Each is checked on its own, so neither can be traded for the other. */
  assert.equal(R('selection-no-static-verify').rc, 1,
    'selection_write alone must not be accepted');
  assert.equal(R('selection-no-static-verify').mutated, 0);
  assert.equal(R('capability-no-static-verify').rc, 1,
    'file_placement alone must not be accepted');
  assert.equal(R('capability-no-static-verify').mutated, 0);
  assert.equal(R('no-apply-capability').rc, 1,
    'static_verify alone must not be accepted');
  assert.equal(R('no-apply-capability').mutated, 0);
});

test('a capture failure aborts before mutation', () => {
  const row = R('capture-fail');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'FAILED');
  assert.equal(row.mutated, 0);
  assert.deepEqual(calls('capture-fail'), ['detect', 'capabilities', 'backup_state']);
});

test('no transaction proceeds without a safety snapshot', () => {
  const row = R('snapshot-fail');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'FAILED');
  assert.equal(row.mutated, 0);
  assert.deepEqual(calls('snapshot-fail'), ['detect', 'capabilities', 'backup_state', 'snapshot'],
    'the snapshot must be attempted, and placement must never be reached');
});

/* ------------------------------------------------------------------------ */
/* 5. verification policy                                                   */
/* ------------------------------------------------------------------------ */

test('static verification FAILURE rolls back exactly once', () => {
  const row = R('static-fail');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'ROLLED_BACK');
  assert.equal(countCall('static-fail', 'restore'), 1, 'exactly one restore');
  assert.equal(E('static-fail').filter((e) => e === 'rollback').length, 1);
  assert.equal(E('static-fail').filter((e) => e === 'rollback-failed').length, 0);
});

test('static verification UNAVAILABLE is treated as FAILURE, because static verification is mandatory', () => {
  const row = R('static-unavailable');
  assert.equal(row.rc, 1, 'UNAVAILABLE must not be allowed to pass a mandatory check');
  assert.equal(row.state, 'ROLLED_BACK');
  assert.equal(countCall('static-unavailable', 'restore'), 1);
});

test('static verification NOT_APPLICABLE is treated as FAILURE for a targeted panel', () => {
  const row = R('static-not-applicable');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'ROLLED_BACK');
  assert.equal(countCall('static-not-applicable', 'restore'), 1);
});

test('live verification SUCCESS allows the commit', () => {
  assert.equal(R('ok').rc, 0);
  assert.equal(R('ok').state, 'COMMITTED');
});

test('live verification UNAVAILABLE allows the commit when static verification passed', () => {
  const row = R('live-unavailable');
  assert.equal(row.rc, 0, 'UNAVAILABLE is not a rollback trigger');
  assert.equal(row.state, 'COMMITTED');
  assert.equal(countCall('live-unavailable', 'restore'), 0, 'no rollback may be attempted');
  assert.equal(E('live-unavailable').includes('rollback'), false);
});

test('live verification NOT_APPLICABLE is not silently reinterpreted as SUCCESS', () => {
  const row = R('live-not-applicable');
  assert.equal(row.rc, 0, 'the transaction may still commit');
  assert.equal(row.state, 'COMMITTED');
  /* It is reported, not swallowed: the engine warns and the event stream shows
   * the check was attempted. */
  assert.equal(E('live-not-applicable').includes('verify-live'), true);
});

test('live verification FAILURE follows the documented failure policy and rolls back once', () => {
  const row = R('live-fail');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'ROLLED_BACK');
  assert.equal(countCall('live-fail', 'restore'), 1);
});

test('live verification is skipped entirely when the capability is absent', () => {
  const row = R('no-live-capability');
  assert.equal(row.rc, 0);
  assert.equal(row.state, 'COMMITTED');
  assert.equal(calls('no-live-capability').includes('verify:live'), false);
  assert.equal(E('no-live-capability').includes('verify-live'), false);
});

/* ------------------------------------------------------------------------ */
/* 6. rollback behaviour                                                    */
/* ------------------------------------------------------------------------ */

test('a placement failure after the mutation boundary triggers rollback exactly once', () => {
  const row = R('install-fail');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'ROLLED_BACK');
  assert.equal(row.mutated, 1);
  assert.equal(countCall('install-fail', 'restore'), 1, 'exactly one restore');
  assert.equal(E('install-fail').filter((e) => e === 'rollback').length, 1);
  /* The FORWARD static check is never reached: placement failed first. The
   * rollback's own static check does run, so the distinguishing fact is the
   * call immediately following placement. */
  assert.equal(calls('install-fail')[calls('install-fail').indexOf('install') + 1], 'restore',
    'placement failure must go straight to rollback, not to verification');
});

test('a rollback whose restore fails is reported, and does NOT trigger another recovery attempt', () => {
  const row = R('rollback-restore-fail');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'FAILED', 'a failed rollback is a failure, not a rolled-back state');
  assert.equal(countCall('rollback-restore-fail', 'restore'), 1,
    'a failed restore must not be retried');
  assert.equal(E('rollback-restore-fail').filter((e) => e === 'rollback').length, 1);
  assert.equal(E('rollback-restore-fail').filter((e) => e === 'rollback-failed').length, 1);
});

test('a rollback whose static verification fails is reported as a rollback failure', () => {
  const row = R('rollback-verify-fail');
  assert.equal(row.rc, 1);
  assert.equal(row.state, 'FAILED');
  assert.equal(countCall('rollback-verify-fail', 'restore'), 1);
  assert.equal(E('rollback-verify-fail').filter((e) => e === 'rollback-failed').length, 1);
});

test('a malformed safety snapshot is refused before restore is attempted', () => {
  /* Called directly: reaching rollback with a snapshot that has become
   * unreadable is not something a scenario can arrange without mutating the
   * snapshot mid-transaction, and the guarantee under test is the ORDER inside
   * rt_transaction_rollback. */
  const body = [
    'rc=0',
    'rt_transaction_rollback 3xui "$D_BROKEN_PATH" 1 2>"$D_WORK/err" || rc=$?',
    'printf "rc=%s log=%s\\n" "$rc" "${RT_TXN_LOG:-}"',
    'grep -c "transaction:rollback-failed" "$D_WORK/err" || true',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /rc=1/);
  assert.match(r.out, /log=/, 'restore must never be called for an invalid snapshot');
  assert.equal(/\brestore\b/.test(r.out.split('\n')[0]), false,
    'restore_state must not be reached when the snapshot does not validate');
  assert.match(r.out, /^1$/m, 'the failure must be reported as rollback-failed');
});

test('a fully realistic snapshot, manifest included, is accepted', () => {
  const body = [
    'rc=0',
    'rt_transaction_snapshot_validate "$D_FULL_PATH" || rc=$?',
    'printf "full=%s\\n" "$rc"',
    'rc2=0',
    'rt_transaction_snapshot_validate "$D_BROKEN_PATH" || rc2=$?',
    'printf "broken=%s\\n" "$rc2"',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /full=0/, 'a complete format-2 snapshot must validate');
  assert.match(r.out, /broken=1/, 'a directory that is not a snapshot must be refused');
});

/* ------------------------------------------------------------------------ */
/* 7. stage hygiene                                                         */
/* ------------------------------------------------------------------------ */

test('the stage is cleared before capture, and only from the capture step onwards', () => {
  /* The marker is planted before the table runs. Every scenario that aborts
   * BEFORE the capture step must leave it untouched; the first scenario that
   * reaches the capture step must clear it. */
  for (const label of ['bad-panel', 'detect-fail', 'detect-not-applicable', 'detect-unavailable',
    'capabilities-unavailable', 'capability-unknown', 'no-apply-capability',
    'capability-empty', 'capability-no-static-verify', 'selection-no-static-verify']) {
    assert.equal(R(label).stage, 'present',
      `${label} aborts before capture, so it must not have touched the stage`);
  }
  for (const label of ['capture-fail', 'snapshot-fail', 'ok', 'install-fail',
    'apply-by-selection', 'apply-by-both']) {
    assert.equal(R(label).stage, 'absent',
      `${label} reaches capture, so the stale stage must be gone`);
  }
});

test('stage reset refuses every path that is not the owned staging tree', () => {
  const body = [
    'probe() { local v="$1"; RT_PANEL_STAGE="$v"; local rc=0; rt_transaction_stage_reset 2>/dev/null || rc=$?; printf "%s|%s\\n" "$2" "$rc"; }',
    'probe "" "empty"',
    'probe "/" "root"',
    'probe "$RT_ROOT" "install-root"',
    'probe "$RT_ROOT/other" "wrong-basename"',
    'probe "$RT_ROOT/../.panel-stage" "outside-root"',
    /* Creating a symlink needs a privilege this host may not grant, so the
     * case reports SKIP rather than aborting the script. The refusal itself is
     * asserted structurally below, so the guarantee is still covered. */
    'mkdir -p "$RT_ROOT/linktarget"',
    'ln -s "$RT_ROOT/linktarget" "$RT_ROOT/.panel-stage" 2>/dev/null || true',
    'if [ -L "$RT_ROOT/.panel-stage" ]; then',
    '  RT_PANEL_STAGE="$RT_ROOT/.panel-stage"',
    '  rc=0; rt_transaction_stage_reset 2>/dev/null || rc=$?',
    '  printf "%s|%s\\n" "symlink" "$rc"',
    'else',
    '  printf "%s|%s\\n" "symlink" "SKIP"',
    'fi',
    /* Git Bash on Windows may materialise this as a directory-style link that
     * does not satisfy -L and cannot be removed with rm -f. RT_ROOT is the
     * isolated fixture tree, so remove either representation before continuing. */
    'rm -rf -- "$RT_ROOT/.panel-stage"',
    'mkdir -p "$RT_ROOT/.panel-stage/deep/deeper"',
    'RT_PANEL_STAGE="$RT_ROOT/.panel-stage"',
    'rc2=0; rt_transaction_stage_reset 2>/dev/null || rc2=$?',
    'printf "%s|%s|%s\\n" "owned" "$rc2" "$( [ -e "$RT_ROOT/.panel-stage" ] && echo still-there || echo gone )"',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  const got = new Map(r.out.split('\n').filter(Boolean).map((l) => {
    const [k, v, extra] = l.split('|');
    return [k, extra ? `${v}|${extra}` : v];
  }));
  for (const [label, expect] of [
    ['empty', '1'], ['root', '1'], ['install-root', '1'], ['wrong-basename', '1'],
    ['outside-root', '1'],
  ]) {
    assert.equal(got.get(label), expect, `stage reset must refuse: ${label}`);
  }
  assert.ok(['1', 'SKIP'].includes(got.get('symlink')),
    `stage reset must refuse a symlinked stage, or report SKIP: got ${got.get('symlink')}`);
  assert.equal(got.get('owned'), '0|gone', 'the owned stage must be cleared');
});

test('stage reset checks for a symlink and pins the expected basename', () => {
  /* The behavioural symlink case above may be SKIPped on a host that cannot
   * create symlinks, so the guard itself is asserted here. */
  const code = codeOf(read(TXN));
  const body = code.slice(code.indexOf('rt_transaction_stage_reset() {'));
  const fn = body.slice(0, body.indexOf('\n}\n'));
  assert.match(fn, /\[ -L "\$d" \]/, 'a symlinked stage must be refused');
  assert.match(fn, /\.panel-stage/, 'the expected basename must be pinned');
  assert.match(fn, /rt_is_within "\$RT_ROOT" "\$d"/,
    'containment must be required against the install root');
  assert.match(fn, /\[ "\$d" = "\/" \]/, '/ must be refused');
  assert.equal(/rm -rf -- "\$RT_PANEL_STAGE"/.test(code), false,
    'the stage must never be removed through an unguarded variable');
});

/* ------------------------------------------------------------------------ */
/* 8. the engine stays generic                                              */
/* ------------------------------------------------------------------------ */

test('the transaction engine contains no panel-specific branch or literal', () => {
  const code = codeOf(read(TXN));
  for (const word of ['3xui', 'pasarguard', 'rebecca']) {
    assert.equal(new RegExp(word, 'i').test(code), false,
      `no panel name may appear in the engine's code: ${word}`);
  }
  assert.equal(/\b(if|case)\b[^\n]*(panel)\s*=\s*"/.test(code), false,
    'the engine must not branch on a panel name');
});

test('the transaction engine contains no panel-specific paths, SQL, env keys or endpoints', () => {
  const code = codeOf(read(TXN));
  const forbidden = [
    [/sqlite|mysql|psql|\bUPDATE\s+\w|\bINSERT\s+INTO|\bDELETE\s+FROM|\bSELECT\s/i, 'SQL'],
    [/systemctl|service\s+\w+\s+(start|stop|restart)/, 'service control'],
    [/https?:\/\//, 'an API endpoint'],
    [/\bcurl\b|\bwget\b/, 'a network client'],
    [/XUI_|PG_|REBECCA_|\.env\b/, 'a panel-specific environment key'],
  ];
  for (const [re, what] of forbidden) {
    assert.equal(re.test(code), false, `the engine must not contain ${what}`);
  }
});

test('the engine never evals, sources panel data, or shells out to git', () => {
  const code = codeOf(read(TXN));
  assert.equal(/\beval\b/.test(code), false, 'eval is forbidden');
  assert.equal(/^\s*(\.|source)\s/m.test(code), false, 'sourcing panel data is forbidden');
  assert.equal(/\bgit\b/.test(code), false, 'the engine must not touch git');
  assert.equal(/\brt_cmd_rollback\b/.test(code), false,
    'the engine must never invoke the user-facing rollback command');
});

test('the engine cannot express a secret', () => {
  const code = codeOf(read(TXN));
  assert.equal(/secret|token|password|credential|api[_-]?key/i.test(code), false,
    'no secret-shaped vocabulary may appear in the engine');
});

test('the rollback helper is invoked directly, never through a subshell', () => {
  /* A command substitution runs in a SUBSHELL, so the rollback would update its
   * own copy of the state model and discard it, and `return "$(...)"` would
   * return the empty string rather than a status. This was a real defect. */
  const code = codeOf(read(TXN));
  assert.equal(/\$\(\s*rt_transaction_rollback/.test(code), false,
    'rt_transaction_rollback must never be called inside a command substitution');
  assert.equal(/\$\(\s*rt_transaction_(static|live)_verify/.test(code), false,
    'the verification helpers must never be called inside a command substitution');
});

test('rollback is attempted from exactly the three post-mutation failure paths', () => {
  const code = codeOf(read(TXN));
  const callsites = code.match(/^\s*rt_transaction_rollback\s+"\$panel"/gm) || [];
  assert.equal(callsites.length, 3,
    'placement failure, static verification failure, live verification failure');
  /* and nothing recursive */
  const body = code.slice(code.indexOf('rt_transaction_rollback() {'));
  assert.equal(/rt_transaction_run/.test(body.slice(0, body.indexOf('\nrt_transaction_body'))), false,
    'rollback must not re-enter the transaction');
});

/* ------------------------------------------------------------------------ */
/* 9. the state model                                                       */
/* ------------------------------------------------------------------------ */

test('the state model is the frozen closed set', () => {
  const src = read(TXN);
  const m = src.match(/^RT_TXN_STATES="([^"]+)"/m);
  assert.ok(m, 'the state vocabulary must be declared');
  assert.deepEqual(m[1].split(' '), [
    'INIT', 'LOCKED', 'CAPTURED', 'SNAPSHOT', 'MUTATING', 'VERIFIED',
    'COMMITTED', 'ROLLING_BACK', 'ROLLED_BACK', 'FAILED',
  ]);
});

test('the state model refuses an invalid transition', () => {
  const body = [
    'rc=0',
    'RT_TXN_STATE="INIT"; rt_transaction_state_set CAPTURED 2>/dev/null || rc=$?',
    'printf "init_to_captured=%s\\n" "$rc"',
    'rc2=0',
    'RT_TXN_STATE="INIT"; rt_transaction_state_set LOCKED 2>/dev/null || rc2=$?',
    'printf "init_to_locked=%s\\n" "$rc2"',
    'rc3=0',
    'RT_TXN_STATE="COMMITTED"; rt_transaction_state_set FAILED 2>/dev/null || rc3=$?',
    'printf "terminal_refuses=%s\\n" "$rc3"',
    'rc4=0',
    'RT_TXN_STATE="INIT"; rt_transaction_state_set NOT_A_STATE 2>/dev/null || rc4=$?',
    'printf "unknown_state=%s\\n" "$rc4"',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /init_to_captured=1/, 'skipping LOCKED must be refused');
  assert.match(r.out, /init_to_locked=0/);
  assert.match(r.out, /terminal_refuses=1/, 'a terminal state must accept nothing');
  assert.match(r.out, /unknown_state=1/);
});

test('every scenario ends in a terminal state', () => {
  const terminal = new Set(['COMMITTED', 'ROLLED_BACK', 'FAILED']);
  for (const [label] of SCENARIOS) {
    assert.equal(terminal.has(R(label).state), true,
      `${label} ended in ${R(label).state}`);
  }
});

/* ------------------------------------------------------------------------ */
/* 10. the frozen P3 contract is used, not re-implemented                    */
/* ------------------------------------------------------------------------ */

test('the engine uses the P3 public interface and defines no panel abstraction of its own', () => {
  const code = codeOf(read(TXN));
  for (const fn of ['rt_panel_detect', 'rt_panel_capabilities', 'rt_panel_backup_state',
    'rt_panel_install_template', 'rt_panel_verify', 'rt_panel_restore_state']) {
    assert.equal(code.includes(fn), true, `the engine must call ${fn}`);
  }
  assert.equal(/^rt_panel_[a-z_]*\(\)/m.test(code), false,
    'the engine must not define any rt_panel_* function');
  assert.equal(/rt_panel_impl_/.test(code), false,
    'the engine must not reach past the contract into an implementation');
});

test('the engine does not redefine the P3 return codes', () => {
  const code = codeOf(read(TXN));
  for (const name of ['RT_PANEL_OK', 'RT_PANEL_FAIL', 'RT_PANEL_UNAVAILABLE', 'RT_PANEL_NOT_APPLICABLE']) {
    assert.equal(new RegExp(`^${name}=`, 'm').test(code), false,
      `${name} belongs to the frozen contract and must not be redeclared`);
  }
});

test('the engine separates universal requirements from the apply requirement', () => {
  /* Two sets, two KINDS of requirement. static_verify is universal; the apply
   * operation is proved by at least one mechanism from a set, so the engine
   * never names a mechanism it actually does not care about. */
  const universal = read(TXN).match(/^RT_TXN_REQUIRED_CAPABILITIES="([^"]+)"/m);
  assert.ok(universal, 'the universal requirement set must be declared');
  assert.deepEqual(universal[1].split(' '), ['static_verify'],
    'static_verify is the only universally required capability');

  const apply = read(TXN).match(/^RT_TXN_REQUIRED_APPLY_CAPABILITIES="([^"]+)"/m);
  assert.ok(apply, 'the apply capability set must be declared');
  assert.deepEqual(apply[1].split(' '), ['file_placement', 'selection_write'],
    'the recognised apply mechanisms are file placement and selection');

  /* Both sets must draw only on the FROZEN P3 vocabulary. This correction adds
   * no token: it changes what the engine requires, not what a panel may say. */
  for (const tok of [...universal[1].split(' '), ...apply[1].split(' ')]) {
    assert.equal(/^[a-z_]+$/.test(tok), true, `token must be well formed: ${tok}`);
  }
});

test('the apply-requirement helper matches whole tokens and fails closed', () => {
  /* CAPS arrives as the output of rt_panel_capabilities: ONE TOKEN PER LINE.
   * The newline shape is load-bearing, not cosmetic -- the vocabulary check in
   * rt_transaction_body reads it line by line, so a space-separated list is
   * already refused as an unknown token before the requirement checks run.
   * These probes therefore use the real shape. */
  const body = [
    'probe() { local rc=0; rt_transaction_has_any_capability "$1" "$2" || rc=$?; printf "%s|%s\\n" "$3" "$rc"; }',
    'probe "$(printf "file_placement\\nstatic_verify")" "file_placement selection_write" "has-file"',
    'probe "$(printf "selection_write\\nstatic_verify")" "file_placement selection_write" "has-selection"',
    'probe "$(printf "static_verify")" "file_placement selection_write" "has-neither"',
    'probe "" "file_placement selection_write" "has-empty-caps"',
    'probe "$(printf "file_placement\\nstatic_verify")" "" "empty-set"',
    'probe "$(printf "file_placement_extra\\nstatic_verify")" "file_placement selection_write" "prefix-not-a-match"',
    'probe "$(printf "file_placement\\nstatic_verify")" "file_placement" "single-member-set"',
    'probe "$(printf "file_placement selection_write\\nstatic_verify")" "file_placement selection_write" "space-joined-is-not-a-token"',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  const got = new Map(r.out.split('\n').filter(Boolean).map((l) => l.split('|')));
  assert.equal(got.get('has-file'), '0');
  assert.equal(got.get('has-selection'), '0');
  assert.equal(got.get('has-neither'), '1', 'neither mechanism must be refused');
  assert.equal(got.get('has-empty-caps'), '1', 'a panel declaring nothing must be refused');
  assert.equal(got.get('empty-set'), '1', 'a misconfigured set must refuse, not permit');
  assert.equal(got.get('prefix-not-a-match'), '1', 'a set member is a whole token, not a prefix');
  assert.equal(got.get('single-member-set'), '0');
  assert.equal(got.get('space-joined-is-not-a-token'), '1',
    'a capability list that is not one-token-per-line must not satisfy the requirement');
});

test('the engine emits only the documented event vocabulary', () => {
  const src = read(TXN);
  const emitted = new Set();
  for (const m of src.matchAll(/rt_transaction_event\s+"?([a-z-]+)/g)) emitted.add(m[1]);
  for (const m of src.matchAll(/rt_transaction_event\s+([a-z-]+)$/gm)) emitted.add(m[1]);
  const allowed = new Set(['begin', 'locked', 'capture', 'snapshot', 'mutate',
    'verify-static', 'verify-live', 'commit', 'rollback', 'rollback-failed']);
  for (const e of emitted) {
    assert.equal(allowed.has(e), true, `undocumented event emitted: ${e}`);
  }
  assert.equal(emitted.size >= 8, true, 'the documented events must actually be emitted');
});

test('stdout stays reserved: a transaction writes its record to stderr only', () => {
  const body = [
    'rt_transaction_run nope /src/t.html >"$D_WORK/out" 2>/dev/null || true',
    'printf "stdout_bytes=%s\\n" "$(wc -c < "$D_WORK/out")"',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /stdout_bytes=0/, 'the engine must not write to stdout');
});

/* ------------------------------------------------------------------------ */
/* 11. the loader and the untouched production paths                        */
/* ------------------------------------------------------------------------ */

test('the engine is loaded explicitly, never by a glob, and idempotently', () => {
  const src = read(LIB);
  assert.equal(/rt_transaction_load\(\) \{/.test(src), true, 'a loader must exist');
  assert.equal(/\.\s+"\$dir\/transaction\.sh"/.test(src), true,
    'the engine must be sourced by its explicit name');
  assert.equal(/for\s+\w+\s+in\s+"\$dir"\/\*/.test(src), false,
    'the loader must not glob');
  assert.equal(/RT_TRANSACTION_LOADED/.test(src), true, 'the loader must be idempotent');
});

test('the user-facing rollback path is unchanged: it still reads the format-1 namespace', () => {
  const src = read(LIB);
  const start = src.indexOf('rt_cmd_rollback() {');
  assert.ok(start > 0, 'rt_cmd_rollback must still exist');
  const body = src.slice(start, src.indexOf('\nrt_print_help() {', start));
  assert.equal(body.includes('RT_BACKUPS_V2'), false,
    'the production rollback must not have been wired to format-2 snapshots');
  assert.equal(body.includes('RT_BACKUPS'), true);
  /* and the format-1 writer is still the default */
  const create = src.slice(src.indexOf('rt_backup_create() {'));
  assert.match(create.slice(0, 4000), /\[ "\$\{1:-\}" = "v2" \]/,
    'format 2 must still require an explicit mode');
});

test('the panels directory holds exactly the authorised adapters', () => {
  /* P4 added no adapter. P5A (2026-09-23) adds exactly one, and the claim is
     kept PRECISE rather than dropped: a second adapter appearing without a
     phase authorising it is still a failure, and the panels with no adapter are
     still asserted absent. */
  const files = readdirSync(PANELS_DIR).sort();
  assert.deepEqual(files, ['3xui.sh', 'index.sh', 'interface.sh'],
    'expected the two contract files plus the authorised 3xui adapter');
  for (const name of ['pasarguard.sh', 'rebecca.sh']) {
    assert.equal(existsSync(join(PANELS_DIR, name)), false,
      `${name} must not exist: no adapter is authorised for it`);
  }
});

test('the registry implements exactly the panels a phase has authorised', () => {
  /* The registry is the single decision point, so this is where "implemented"
     is either true or false for every panel in the enum. A panel with no
     implementation must resolve to NOTHING -- never to a stub that reports
     success, because a transaction engine cannot detect a fabricated one. */
  const body = [
    'for p in 3xui pasarguard rebecca; do',
    '  impl="$(rt_panel_impl_for "$p")"',
    '  printf "%s|%s\\n" "$p" "${impl:-none}"',
    'done',
    'exit 0',
  ].join('\n');
  const r = sh(body);
  assert.equal(r.code, 0, r.err);
  const got = new Map(r.out.split('\n').filter(Boolean).map((l) => l.split('|')));
  assert.equal(got.get('3xui'), '3xui', '3xui must resolve to its real implementation');
  assert.equal(got.get('pasarguard'), 'none', 'pasarguard must resolve to nothing');
  assert.equal(got.get('rebecca'), 'none', 'rebecca must resolve to nothing');
});

test('a transaction against the real interface, with no panel on this host, fails closed', () => {
  /* No doubles at all: this is the shipped state of the tree. P5A implements
   * 3X-UI, so the real adapter now runs -- and on a host with no panel binary,
   * no unit and no database it must still refuse at DETECTION, before anything
   * is captured or written. The fixture already contains the snapshot
   * directories this suite built, so the assertion is that the transaction
   * ADDS nothing. */
  const body = [
    'before="$(ls "$RT_BACKUPS_V2" 2>/dev/null | wc -l)"',
    'rc=0',
    'rt_transaction_run 3xui /src/t.html >/dev/null 2>&1 || rc=$?',
    'after="$(ls "$RT_BACKUPS_V2" 2>/dev/null | wc -l)"',
    'printf "rc=%s state=%s mutated=%s\\n" "$rc" "$RT_TXN_STATE" "$RT_TXN_MUTATED"',
    'printf "snapshot=%s\\n" "${RT_TXN_SNAPSHOT:-none}"',
    'printf "stage=%s snapshots=%s\\n" "$( [ -e "$RT_PANEL_STAGE" ] && echo yes || echo no )" "$after"',
    'printf "added=%s\\n" "$(( after - before ))"',
    'exit 0',
  ].join('\n');
  const r = sh(body, { useShim: true });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /rc=1 state=FAILED mutated=0/, 'it must fail closed');
  assert.match(r.out, /snapshot=none/, 'no snapshot may be recorded');
  assert.match(r.out, /stage=no/, 'no staging tree may be created');
  assert.match(r.out, /added=0/, 'no snapshot may be written');
});
