/* The frozen panel interface (P3).
 *
 * WHAT THIS SUITE IS FOR. P3 introduces a CONTRACT, not an implementation, so
 * most of what can go wrong is structural: a second competing interface, a
 * return code that means one thing here and another there, a capability token
 * invented on the fly, or — the failure this layer exists to prevent — a
 * "read-only" function that quietly mutates something.
 *
 * So the suite is mostly source-level assertions about SHAPE, plus enough
 * behaviour to prove the shape is real rather than aspirational. That is the
 * opposite trade from the P2 suites, and deliberately so: P2 had a format to
 * get byte-exact, P3 has an interface to keep honest.
 *
 * COST. Table-driven cases run many inputs in ONE bash process, and fixtures
 * live in the OS temp dir and are built/removed from Node. On a host where
 * process creation is intercepted a bare spawn is ~0.5s and a bash-side
 * recursive delete ~7s, so a case that spawns per input or cleans up in bash
 * turns a two-second suite into a two-minute one for no added coverage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'installer', 'lib', 'row-template.sh');
const IFACE = join(ROOT, 'installer', 'panels', 'interface.sh');
const INDEX = join(ROOT, 'installer', 'panels', 'index.sh');
const PANELS_DIR = join(ROOT, 'installer', 'panels');

const read = (p) => readFileSync(p, 'utf8');

/* Strip whole-line comments, so an assertion about what code DOES is never
   satisfied — or defeated — by prose that happens to use the same word. Every
   negative assertion below ("the interface must not eval") is that shape, and
   this layer is heavily commented. */
const codeOf = (src) =>
  src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

const PREAMBLE = ['set -Eeuo pipefail', 'source installer/lib/row-template.sh', ''].join('\n');

/* One throwaway RT_ROOT per call, built and removed from Node. `args` become
   "$@" so a table can be tested in a single process. */
function sh(body, args = []) {
  const base = mkdtempSync(join(tmpdir(), 'row-p3-'));
  try {
    const rt = join(base, 'rt');
    mkdirSync(join(rt, 'dist'), { recursive: true });
    const win = rt.split('\\').join('/');
    const head = `RT_ROOT="$(cygpath -u '${win}' 2>/dev/null || printf '%s' '${win}')"\nexport RT_ROOT\n`;
    const r = spawnSync('bash', ['-c', head + PREAMBLE + body, 'row-p3-test', ...args],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/* Echo the exit status of `<fn> <args>` for each table row, in ONE process.
 *
 * Row format: `<label>\\t<fn>\\t<arg1>\\t<arg2>...` — TAB-separated, and the
 * arguments arrive one per "$@". This shape matters for two reasons that both
 * bit this suite while it was being written:
 *
 *   - Splitting the args on SPACE destroys any argument that contains one.
 *     `IFS=' ' read -r -a` turned "3xui " into "3xui", so a case asserting that
 *     a trailing space is refused was silently testing a valid id instead, and
 *     reported a false failure against correct code.
 *   - An empty argument cannot survive splitting at all: "a||" produces zero
 *     args, not one empty arg, so `rt_panel_detect ""` was never actually
 *     exercised.
 *
 * TAB separation plus "$@" passes every argument through byte-exactly,
 * including ones that are empty or contain spaces. */
function statusTable(rows) {
  const r = sh(`
    TAB=$(printf '\t')
    for row in "$@"; do
      label="\${row%%"$TAB"*}"
      rest="\${row#*"$TAB"}"
      fn="\${rest%%"$TAB"*}"
      rest="\${rest#*"$TAB"}"
      set --
      if [ "\${rest}" != "\${row}" ] && [ -n "\${rest}" ]; then
        IFS="$TAB" read -r -a a <<< "\${rest}"
        set -- "\${a[@]}"
      fi
      # The probe MUST be allowed to fail. Under 'set -e' a non-zero "$fn" would
      # abort the whole script before its status could be recorded, so the
      # harness would report the abort rather than the status it came for — and
      # every correctly-refused case would look like a broken harness.
      # (Not a 'local' declaration: this body runs at script top level, not
      # inside a function, and 'local' there is itself a fatal error.)
      rc=0
      "$fn" "$@" >/dev/null 2>&1 || rc=$?
      printf '%s|%s\\n' "\${label}" "$rc"
    done
    # The snippet must exit 0: the point of this table is that the PROBED
    # functions return non-zero, and without this the script's own exit status
    # would inherit the last probe's failure.
    exit 0
  `, rows);
  assert.equal(r.code, 0, r.err);
  const out = {};
  for (const line of r.out.split('\n')) {
    if (!line) continue;
    const [label, code] = line.split('|');
    out[label] = Number(code);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* 1. the public surface exists, exactly once                               */
/* ------------------------------------------------------------------------ */

const PUBLIC = [
  'rt_panel_detect',
  'rt_panel_capabilities',
  'rt_panel_backup_state',
  'rt_panel_install_template',
  'rt_panel_verify',
  'rt_panel_restore_state',
  'rt_panel_uninstall_template',
];

test('all seven required public functions exist after sourcing the library', () => {
  const r = sh(`
    for f in ${PUBLIC.join(' ')}; do
      if declare -F "$f" >/dev/null; then echo "present:$f"; else echo "MISSING:$f"; fi
    done
  `);
  assert.equal(r.code, 0, r.err);
  for (const f of PUBLIC) assert.match(r.out, new RegExp('present:' + f), f + ' must exist');
  assert.equal(/MISSING/.test(r.out), false, 'no required function may be missing');
});

test('the interface is loaded by the library without being copied into it', () => {
  /* ONE canonical surface. The contract lives in its own file and the library
     sources it, rather than restating the names — two definitions of a public
     function is two functions that can disagree about a return code. */
  const lib = read(LIB);
  assert.match(lib, /rt_panels_load/, 'the library must load the interface layer');
  assert.match(lib, /interface\.sh/, 'and name interface.sh explicitly');
  assert.match(lib, /index\.sh/, 'and index.sh explicitly');
  /* No globbing: the set of files that can change installer behaviour is fixed
     and reviewable, not "whatever happens to be in a directory". */
  assert.equal(/\.\s+"?\$dir"\?\/\*\.sh/.test(lib), false,
    'the loader must not glob a directory of panel files');
  /* Not restated in the library: the seven names belong to the interface file. */
  const iface = read(IFACE);
  for (const f of PUBLIC) {
    assert.match(iface, new RegExp('^' + f + '\\(\\)', 'm'), f + ' must be defined in interface.sh');
    assert.equal(new RegExp('^' + f + '\\(\\)', 'm').test(lib), false,
      f + ' must NOT also be defined in row-template.sh');
  }
});

test('no competing interface: no operation is defined twice anywhere', () => {
  const files = [LIB, IFACE, INDEX];
  for (const f of PUBLIC) {
    const re = new RegExp('^' + f + '\\(\\)', 'gm');
    let total = 0;
    for (const p of files) total += (read(p).match(re) || []).length;
    assert.equal(total, 1, f + ' must be defined exactly once across the interface layer (found ' + total + ')');
  }
  /* And the two P2 helpers this layer depends on are not redefined either: a
     second rt_panel_id_ok would be a second closed enum. */
  for (const f of ['rt_panel_id_ok', 'rt_backup_relpath_ok', 'rt_backup_panel_write']) {
    const re = new RegExp('^' + f + '\\(\\)', 'gm');
    let total = 0;
    for (const p of files) total += (read(p).match(re) || []).length;
    assert.equal(total, 1, f + ' must remain defined exactly once (found ' + total + ')');
  }
});

/* ------------------------------------------------------------------------ */
/* 2. return-code contract                                                  */
/* ------------------------------------------------------------------------ */

test('the four return-code constants are stable and distinct', () => {
  const r = sh('echo "OK=$RT_PANEL_OK FAIL=$RT_PANEL_FAIL UNAVAIL=$RT_PANEL_UNAVAILABLE NA=$RT_PANEL_NOT_APPLICABLE"');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /OK=0/);
  assert.match(r.out, /FAIL=1/);
  assert.match(r.out, /UNAVAIL=2/);
  assert.match(r.out, /NA=3/);
});

test('a known panel with no implementation is UNAVAILABLE, never SUCCESS and never NOT_APPLICABLE', () => {
  /* The single most important behavioural property of P3. There is no
     implementation yet, so the honest answer is "the capability is absent".
     NOT_APPLICABLE would be a claim about the PANEL that this layer has not
     established (it performs no detection); SUCCESS would be a fabrication a
     transaction engine cannot detect. */
  const verbs = [
    ['detect', '3xui'],
    ['capabilities', '3xui'],
    ['backup_state', '3xui'],
    ['install_template', '3xui', '/tmp/src'],
    ['verify', '3xui', 'static'],
    ['verify', '3xui', 'live'],
    ['restore_state', '3xui', '/tmp/snap'],
    ['uninstall_template', '3xui'],
  ];
  const label = (v) => v[0] + '-' + v[1] + (v[2] ? '-' + v[2] : '');
  const rows = verbs.map((v) => [label(v), 'rt_panel_' + v[0], ...v.slice(1)].join('\t'));
  const got = statusTable(rows);
  for (const v of verbs) {
    assert.equal(got[label(v)], 2,
      `rt_panel_${v[0]} ${v.slice(1).join(' ')} must be UNAVAILABLE (2), got ${got[label(v)]}`);
  }
  /* The same for every panel in the enum, so this cannot pass by accident on 3xui. */
  const all = ['3xui', 'pasarguard', 'rebecca'].map((p) => [p, 'rt_panel_detect', p].join('\t'));
  const got2 = statusTable(all);
  for (const p of ['3xui', 'pasarguard', 'rebecca']) {
    assert.equal(got2[p], 2, p + ' must be UNAVAILABLE while unimplemented');
  }
});

test('a malformed invocation is FAILURE, distinct from UNAVAILABLE', () => {
  const got = statusTable([
    ['no-source', 'rt_panel_install_template', '3xui'].join('\t'),
    ['no-snapshot', 'rt_panel_restore_state', '3xui'].join('\t'),
    ['bad-mode', 'rt_panel_verify', '3xui', 'bogus'].join('\t'),
    ['no-mode', 'rt_panel_verify', '3xui'].join('\t'),
  ]);
  for (const k of ['no-source', 'no-snapshot', 'bad-mode', 'no-mode']) {
    assert.equal(got[k], 1, k + ' must be FAILURE (1), got ' + got[k]);
  }
});

test('unknown panel ids are FAILURE and are refused before dispatch', () => {
  const bad = ['nginx', 'xui', '3xui2', '3XUI', '', '.', '..', '../etc', '3xui/../..', 'a b', '3xui ',
    ' 3xui', 'pasarguardx', 'rebeccax', 'sqlite'];
  const rows = bad.map((p, i) => ['bad' + i, 'rt_panel_detect', p].join('\t'));
  const got = statusTable(rows);
  bad.forEach((p, i) => {
    assert.equal(got['bad' + i], 1,
      `panel id ${JSON.stringify(p)} must be FAILURE (1), got ${got['bad' + i]}`);
  });
  /* Ids containing a TAB cannot ride in a TAB-delimited row — the delimiter and
     the payload would be the same byte. Tested separately, one id per argument
     of the same process. */
  const tabbed = sh(`
    for p in "$@"; do rt_panel_detect "$p" >/dev/null 2>&1 && echo "ACCEPTED:[$p]"; done
    echo "done"
  `, ['3xui\t', '\t3xui', '3\txui']);
  assert.equal(/ACCEPTED/.test(tabbed.out), false,
    'no tab-bearing panel id may be accepted:\n' + tabbed.out);
  assert.match(tabbed.out, /done/);
  /* And the same refusal on every public verb, not just detect. */
  const rows2 = PUBLIC.map((fn, i) => ['v' + i, fn, 'nginx'].join('\t'));
  const got2 = statusTable(rows2);
  PUBLIC.forEach((fn, i) => {
    assert.equal(got2['v' + i], 1, fn + ' must refuse an unknown panel');
  });
});

test('UNAVAILABLE (2) and FAILURE (1) are never conflated', () => {
  /* Stated as its own case because the distinction is the whole point of the
     tri-state: a transaction engine may roll back on FAILURE and MUST NOT roll
     back on UNAVAILABLE. If these ever collapse into one code, the engine
     reverts good changes whenever live verification is unavailable. */
  const got = statusTable([
    ['unavailable', 'rt_panel_verify', '3xui', 'live'].join('\t'),
    ['failure', 'rt_panel_verify', '3xui', 'bogus'].join('\t'),
  ]);
  assert.equal(got.unavailable, 2);
  assert.equal(got.failure, 1);
  assert.notEqual(got.unavailable, got.failure);
  /* The interface must not model verification as a boolean. Asserted against
     the VERIFY path specifically: a two-way `0 | 1` branch is legitimate in the
     mode validator (a mode either is or is not one of two values) and checking
     the whole file for one would flag correct code. What must never be
     two-way is the result of verification itself. */
  const iface = read(IFACE);
  const start = iface.indexOf('rt_panel_verify() {');
  const body = iface.slice(start, iface.indexOf('\n}\n', start));
  /* Asserted against the CONTRACT TEXT, comments included. For this layer the
     documented outcome set IS the deliverable — the code merely delegates — so
     stripping comments here would assert that the one thing P3 was asked to
     freeze had been removed. (Every other negative assertion in this suite uses
     codeOf precisely because there it is code that must be absent.) */
  assert.match(body, /UNAVAILABLE/, 'the verify contract must name UNAVAILABLE as a live result');
  assert.match(body, /rt_panel_verify_mode_ok/, 'and must validate the mode');
  /* The documented live outcome set is three-valued, not two. */
  assert.match(iface, /0 SUCCESS \| 1 FAILURE \| 2 UNAVAILABLE/,
    'live verification must be documented as tri-state');
  /* And the engine obligation is stated, since that is what makes the
     tri-state load-bearing rather than decorative. */
  assert.match(iface, /MUST NOT roll back solely[\s\S]*?live verification was unavailable/,
    'the no-rollback-on-UNAVAILABLE rule must be stated');
});

/* ------------------------------------------------------------------------ */
/* 3. closed panel enum                                                     */
/* ------------------------------------------------------------------------ */

test('the closed panel enum accepts exactly the three panels and nothing else', () => {
  const r = sh(`
    for p in "$@"; do rt_panel_id_ok "$p" && echo "ok:$p"; done
    echo "checked:$(($#))"
  `, ['3xui', 'pasarguard', 'rebecca']);
  assert.equal(r.code, 0, r.err);
  for (const p of ['3xui', 'pasarguard', 'rebecca']) assert.match(r.out, new RegExp('ok:' + p + '$', 'm'));
  assert.match(r.out, /checked:3/);
  assert.equal(/ok:(?!3xui$|pasarguard$|rebecca$)/m.test(r.out), false,
    'nothing outside the three may be accepted');
});

test('the interface does not redeclare or extend the panel enum', () => {
  /* RT_PANEL_IDS belongs to the library. A second copy is a second closed set,
     and a closed set with two copies has two chances to drift. */
  const iface = read(IFACE);
  const index = read(INDEX);
  for (const [name, src] of [['interface.sh', iface], ['index.sh', index]]) {
    assert.equal(/^RT_PANEL_IDS=/m.test(src), false,
      name + ' must not redeclare RT_PANEL_IDS');
  }
  /* No normalisation of arbitrary input into a valid name: no tr/lowercase of
     a caller-supplied panel id, which is how "3XUI" silently becomes "3xui". */
  const code = codeOf(iface + '\n' + index);
  assert.equal(/tr\s+['"]?A-Z['"]?\s+['"]?a-z/.test(code), false,
    'a panel id must never be normalised into a valid one');
  /* The shared validator must be the thing that decides. Asserted by calling
     it: rt_panel_arg_ok is the single guard every public verb routes through,
     and it must consult rt_panel_id_ok rather than compare against a local
     list. */
  const guard = codeOf(iface.slice(
    iface.indexOf('rt_panel_arg_ok() {'), iface.indexOf('\n}\n', iface.indexOf('rt_panel_arg_ok() {'))));
  assert.match(guard, /rt_panel_id_ok/, 'the guard must use the shared panel-id validator');
  /* And every public verb must route through that one guard. */
  for (const f of PUBLIC) {
    const s = iface.indexOf(f + '() {');
    const b = codeOf(iface.slice(s, iface.indexOf('\n}\n', s)));
    assert.match(b, /rt_panel_arg_ok/, f + ' must route through the shared guard');
  }
});

/* ------------------------------------------------------------------------ */
/* 4. capability vocabulary                                                 */
/* ------------------------------------------------------------------------ */

test('the capability vocabulary is exactly the ten frozen tokens, in C order', () => {
  const r = sh('echo "$RT_PANEL_CAPABILITIES"');
  assert.equal(r.code, 0, r.err);
  const got = r.out.split(/\s+/).filter(Boolean);
  const want = ['api_activation', 'db_activation', 'env_activation', 'file_placement',
    'live_verify', 'per_admin_override', 'selection_read', 'selection_write',
    'service_control', 'static_verify'];
  assert.deepEqual(got, want);
  /* LC_ALL=C lexical order, so the list is comparable as bytes. */
  assert.deepEqual(got, [...got].sort(), 'the vocabulary must be in LC_ALL=C lexical order');
  assert.equal(new Set(got).size, got.length, 'no token may repeat');
});

test('the capability vocabulary is closed: an unknown token is refused', () => {
  const r = sh(`
    for t in "$@"; do
      if rt_panel_capability_ok "$t"; then echo "ACCEPTED:[$t]"; fi
    done
    echo "done"
  `, ['telepathy', 'live_verify ', ' live_verify', 'LIVE_VERIFY', 'live', '', 'live_verif',
    'selection_read;rm', 'static_verify_x']);
  assert.equal(r.code, 0, r.err);
  assert.equal(/ACCEPTED/.test(r.out), false, 'no invented token may be accepted:\n' + r.out);
  const ok = sh(`
    for t in "$@"; do rt_panel_capability_ok "$t" && echo "ok:$t"; done
  `, ['live_verify', 'static_verify', 'api_activation']);
  assert.match(ok.out, /ok:live_verify/);
  assert.match(ok.out, /ok:static_verify/);
});

test('capability output is deterministic and machine-readable', () => {
  /* Byte-identical across runs, because a caller may compare two runs directly
     and a header or a timestamp would make every comparison differ.
     `sh()` trims stdout, so the exit status is captured separately rather than
     echoed into the same stream — mixing the two made an earlier version of
     this case assert against its own probe output instead of the interface's. */
  const a = sh('rt_panel_capabilities 3xui 2>/dev/null || true');
  const b = sh('rt_panel_capabilities 3xui 2>/dev/null || true');
  assert.equal(a.out, b.out, 'two runs must produce identical bytes');
  assert.equal(a.out, '', 'an unimplemented panel must print NOTHING on stdout');
  const st = statusTable([['caps', 'rt_panel_capabilities', '3xui'].join('\t')]);
  assert.equal(st.caps, 2, 'and must report UNAVAILABLE');
  /* No prose may ever reach the machine channel from any verb. */
  const r = sh(`
    for v in detect capabilities backup_state verify restore_state uninstall_template; do
      out="$(rt_panel_$v 3xui 2>/dev/null || true)"
      [ -n "$out" ] && echo "STDOUT-FROM:$v[$out]"
    done
    echo "clean"
  `);
  assert.equal(/STDOUT-FROM/.test(r.out), false,
    'the machine channel must stay clean on a refusal:\n' + r.out);
  assert.match(r.out, /clean/);
});

/* ------------------------------------------------------------------------ */
/* 5. the interface mutates nothing                                         */
/* ------------------------------------------------------------------------ */

test('the interface layer performs no mutation', () => {
  /* The layer states a read-only guarantee. Asserted structurally over the
     three files, because that is what makes the guarantee reviewable: if no
     mutating command appears, no call can mutate. */
  for (const [name, src] of [['interface.sh', read(IFACE)], ['index.sh', read(INDEX)]]) {
    const code = codeOf(src);
    const mutators = /\b(rm|rmdir|mv|cp|install|touch|truncate|tee|dd)\b|>\s*"|>>\s*"|mkdir|chmod|chown|ln\s+-s/;
    assert.equal(mutators.test(code), false,
      name + ' must contain no mutating command:\n' + code);
  }
  /* And behaviourally: a full sweep of every verb leaves the tree untouched. */
  const r = sh(`
    before="$(find "$RT_ROOT" -type f | wc -l)"
    for v in detect capabilities backup_state verify restore_state uninstall_template; do
      rt_panel_$v 3xui >/dev/null 2>&1 || true
      rt_panel_$v pasarguard /tmp/x >/dev/null 2>&1 || true
    done
    rt_panel_install_template 3xui /tmp/src >/dev/null 2>&1 || true
    after="$(find "$RT_ROOT" -type f | wc -l)"
    echo "files:$before=$after"
    echo "stage:$([ -e "$RT_PANEL_STAGE" ] && echo exists || echo absent)"
    echo "v2:$([ -e "$RT_BACKUPS_V2" ] && echo exists || echo absent)"
    echo "v1:$([ -e "$RT_BACKUPS" ] && echo exists || echo absent)"
  `);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /files:0=0/, 'no file may be created');
  assert.match(r.out, /stage:absent/, 'the staging area must not be created');
  assert.match(r.out, /v2:absent/, 'no snapshot namespace may be created');
  assert.match(r.out, /v1:absent/, 'no backup namespace may be created');
});

test('detection is read-only by contract, and detection does nothing else', () => {
  /* detect is the operation most likely to be given "just a quick check" that
     writes a cache or probes a socket. It must not: detection runs before any
     decision, so a side effect there is a side effect on no decision. */
  const iface = read(IFACE);
  const body = iface.slice(iface.indexOf('rt_panel_detect()'));
  const det = body.slice(0, body.indexOf('\n}\n') + 3);
  const code = codeOf(det);
  assert.equal(/\b(curl|wget|systemctl|service|sqlite3|nc|ping|ssh)\b/.test(code), false,
    'detection must touch no service, database or network');
  assert.equal(/\b(rm|mv|cp|mkdir|touch|chmod)\b/.test(code), false,
    'detection must write nothing');
  /* It delegates to ONE internal implementation, so there is no second
     detection path that could disagree with it. */
  assert.match(code, /rt_panel_impl_detect/);
});

/* ------------------------------------------------------------------------ */
/* 6. security rules                                                        */
/* ------------------------------------------------------------------------ */

test('the interface never evals, sources or reconstructs a command', () => {
  for (const [name, src] of [['interface.sh', read(IFACE)], ['index.sh', read(INDEX)]]) {
    const code = codeOf(src);
    assert.equal(/\beval\b/.test(code), false, name + ' must never eval');
    /* No second `source`/`.` beyond the loader in the library itself: the only
       files ever loaded are the two named in rt_panels_load. `source` of
       anything else is how panel output becomes code. */
    const sources = code.match(/^\s*\.\s+\S+|^\s*source\s+\S+/gm) || [];
    assert.deepEqual(sources, [], name + ' must not source anything at load time');
    assert.equal(/\bbash\s+-c\b|\bsh\s+-c\b/.test(code), false,
      name + ' must not reconstruct a shell command');
    assert.equal(/xargs/.test(code), false, name + ' must not rebuild an argument vector');
  }
  /* The only sourcing anywhere is the library's explicit loader. */
  const lib = read(LIB);
  const libSources = lib.match(/^\s*\.\s+"\$(dir|dir)\/(interface|index)\.sh"|^\s*\.\s+"\$dir\/(interface|index)\.sh"/gm) || [];
  assert.ok(libSources.length >= 1, 'the library must source the interface explicitly');
});

test('no panel-specific implementation exists in P3', () => {
  /* A stub that pretends to be an implementation is how a temporary shim
     becomes permanent, and P5 must not be able to inherit one. */
  const r = sh('ls installer/panels/');
  assert.equal(r.code, 0, r.err);
  const files = r.out.split('\n').map((s) => s.trim()).filter(Boolean).sort();
  assert.deepEqual(files, ['index.sh', 'interface.sh'],
    'only the two contract files may exist, found: ' + files.join(', '));
  for (const f of ['3xui.sh', 'pasarguard.sh', 'rebecca.sh']) {
    assert.equal(files.includes(f), false, f + ' must not exist in P3');
  }
  /* And the registry maps no panel to an implementation. */
  const idx = codeOf(read(INDEX));
  assert.match(idx, /rt_panel_impl_for/, 'the registry must expose one lookup');
  assert.equal(/rt_panel_(3xui|pasarguard|rebecca)_/.test(idx), false,
    'the registry must not name a panel-specific implementation function');
});

test('no activation exists in the interface', () => {
  /* P3 defines a contract; it must not be able to activate, deactivate, restart
     or reconfigure anything. */
  const all = codeOf(read(IFACE) + '\n' + read(INDEX));
  assert.equal(/rt_activate|rt_subtheme_set|rt_service_start|rt_service_stop|rt_gen_|rt_apply_branding/.test(all),
    false, 'the interface must not call an activation path');
  /* The word "activate" may appear only in the capability tokens, which name a
     mechanism rather than perform one. */
  const calls = all.match(/rt_[a-z_]*activate[a-z_]*/g) || [];
  assert.deepEqual(calls, [], 'no activation function may be called');
});

test('no transaction engine exists', () => {
  const all = read(LIB) + read(IFACE) + read(INDEX);
  assert.deepEqual(all.match(/rt_[a-z_]*transaction[a-z_]*/g) || [], [],
    'P3 adds no transaction engine');
  assert.deepEqual(all.match(/rt_[a-z_]*two_phase[a-z_]*/g) || [], []);
  assert.deepEqual(all.match(/rt_[a-z_]*journal[a-z_]*/g) || [], []);
  assert.deepEqual(all.match(/rt_[a-z_]*single_flight[a-z_]*/g) || [], []);
  assert.deepEqual(all.match(/rt_[a-z_]*rollback_engine[a-z_]*/g) || [], []);
});

/* ------------------------------------------------------------------------ */
/* 7. verify: the tri-state                                                 */
/* ------------------------------------------------------------------------ */

test('verify supports static and live, and rejects any other mode', () => {
  const got = statusTable([
    ['static', 'rt_panel_verify', '3xui', 'static'].join('\t'),
    ['live', 'rt_panel_verify', '3xui', 'live'].join('\t'),
    ['both', 'rt_panel_verify', '3xui', 'static', 'live'].join('\t'),
    ['bogus', 'rt_panel_verify', '3xui', 'bogus'].join('\t'),
    ['upper', 'rt_panel_verify', '3xui', 'STATIC'].join('\t'),
    ['none', 'rt_panel_verify', '3xui'].join('\t'),
  ]);
  /* static and live are accepted modes: they reach the implementation and get
     UNAVAILABLE (2), not FAILURE (1). A mode rejected by validation is 1. */
  assert.equal(got.static, 2, 'static must be a valid mode (reaching impl => 2)');
  assert.equal(got.live, 2, 'live must be a valid mode (reaching impl => 2)');
  assert.equal(got.bogus, 1);
  assert.equal(got.upper, 1, 'modes are a closed set, not case-folded');
  assert.equal(got.none, 1);
  assert.equal(got.both, 1, 'exactly one mode is required');
  /* Structural: a mode validator exists and is shared. */
  assert.match(codeOf(read(IFACE)), /rt_panel_verify_mode_ok/, 'the mode validator must exist');
});

/* ------------------------------------------------------------------------ */
/* 8. data channel: RT_PANEL_STAGE and the P2 contract                      */
/* ------------------------------------------------------------------------ */

test('RT_PANEL_STAGE is the only structured backup-state channel', () => {
  const iface = read(IFACE);
  assert.match(iface, /RT_PANEL_STAGE/,
    'the staging root must be named in the contract');
  /* It is the P2 variable, referenced not redeclared. */
  assert.equal(/^RT_PANEL_STAGE=/m.test(iface), false,
    'RT_PANEL_STAGE must be referenced, not redeclared');
  assert.match(read(LIB), /^RT_PANEL_STAGE=/m, 'the library owns the definition');
  /* The interface must not invent a second staging location. */
  const all = codeOf(iface);
  assert.equal(/(RT_ROOT\/[a-z.]*stage|RT_PANEL_TMP|RT_PANEL_WORK|\.panel-work)/.test(all),
    false, 'no second staging root may be introduced');
});

test('the interface references the P2 staging contract rather than duplicating it', () => {
  /* The format is frozen. P3 must point at rt_backup_panel_write and the P2
     field names, and must not restate the format with its own writer. */
  const iface = read(IFACE);
  assert.match(iface, /rt_backup_panel_write/,
    'the contract must point at the P2 writer, the only door into a snapshot');
  for (const f of ['selection.state', 'selection', 'meta', 'files']) {
    assert.ok(iface.includes(f), 'the contract must name the P2 field ' + f);
  }
  assert.match(iface, /mechanism=db\|env\|api/, 'and the closed mechanism values');
  assert.match(iface, /was_running=0\|1/, 'and the closed was_running values');
  /* It must NOT define a writer of its own, nor a second snapshot builder. */
  const code = codeOf(iface);
  assert.equal(/^rt_backup_[a-z_]*\(\)/m.test(code), false,
    'the interface must not define a backup function');
  assert.equal(/rt_backup_create/.test(code), false,
    'and must not create snapshots — that is the transaction engine\'s job');
});

test('the interface cannot express a secret or an arbitrary key/value blob', () => {
  const iface = read(IFACE);
  const index = read(INDEX);
  /* No free-form KEY=VALUE parsing anywhere: the P2 writer takes positional
     arguments precisely so no such blob can exist. */
  for (const [name, src] of [['interface.sh', iface], ['index.sh', index]]) {
    const code = codeOf(src);
    assert.equal(/for\s+\w+\s+in\s+\S*KEY=|KEY=VALUE|declare\s+-A|eval\s/.test(code), false,
      name + ' must not accept a key/value blob');
  }
  /* The contract SAYS secrets are forbidden; assert the rule is stated, since
     P3's whole product here is a written obligation. */
  assert.match(iface, /secrets, credentials, API tokens/,
    'the no-secrets rule must be stated explicitly for P5');
  /* The mechanism set is closed at three values, and the interface names the
     frozen P2 writer rather than declaring its own writer — a second writer
     would be a second format.
     The NAME is asserted over the whole file, comments included: pointing P5 at
     rt_backup_panel_write is the contract's job, so the reference lives in the
     obligation text. What must be absent from CODE is any writer of the
     interface's own. */
  assert.equal(/^rt_panel_[a-z_]*(write|create|stage)[a-z_]*\(\)/m.test(codeOf(iface)), false,
    'the interface must define no writer of its own');
  assert.match(iface, /rt_backup_panel_write/,
    'it must reference the P2 writer, which is the only door into a snapshot');
});

/* ------------------------------------------------------------------------ */
/* 9. the restore ordering is frozen                                        */
/* ------------------------------------------------------------------------ */

test('the restore order is documented and is the frozen six steps', () => {
  /* The order IS the contract: a different order destroys data no later step
     can repair. Assert each numbered obligation is present in order. */
  const iface = read(IFACE);
  const start = iface.indexOf('rt_panel_restore_state() {');
  assert.notEqual(start, -1);
  const body = iface.slice(start, iface.indexOf('\n}\n', start));
  const steps = [
    /validate the format-2 snapshot/,
    /SAME mechanism recorded in `meta`/,
    /ONLY the Row-Template-created files recorded in `files`/,
    /previous service running\/stopped state/,
    /static verification/,
    /live verification MAY be attempted/,
  ];
  let cursor = 0;
  for (const re of steps) {
    const m = body.slice(cursor).match(re);
    assert.notEqual(m, null, 'restore step missing or out of order: ' + re);
    cursor += m.index + 1;
  }
  /* And the six prohibitions. */
  for (const re of [/guess missing state/, /containing operator directory/,
    /file not recorded by Row-Template/, /malformed snapshot/,
    /SECOND recovery if rollback itself fails/]) {
    assert.match(body, re, 'restore prohibition missing: ' + re);
  }
});

test('the install contract states the refusal and the ownership rules', () => {
  const iface = read(IFACE);
  const start = iface.indexOf('rt_panel_install_template() {');
  const body = iface.slice(start, iface.indexOf('\n}\n', start));
  assert.match(body, /REFUSE if the destination already exists/,
    'the pre-existing-file refusal must be stated');
  assert.match(body, /operator-owned content/, 'ownership must be stated');
  assert.match(body, /never recursively delete a panel-owned directory/);
  assert.match(body, /validated Row-Template shell/, 'the SOURCE precondition must be stated');
  assert.match(body, /record every placed file through the P2 `files` contract/,
    'the placement must be recorded for rollback');
  /* uninstall: fail closed on ambiguity, never delete a directory. */
  const us = iface.indexOf('rt_panel_uninstall_template() {');
  const ub = iface.slice(us, iface.indexOf('\n}\n', us));
  assert.match(ub, /FAIL CLOSED on ambiguous ownership/);
  assert.match(ub, /NEVER delete a panel-owned directory/);
  assert.match(ub, /preserve unrelated operator files/);
});

test('the interface documents the P4 and P5 obligations and the non-goals', () => {
  const iface = read(IFACE);
  /* P5 obligations are stated per operation, which is what makes them binding
     on an implementation that does not exist yet. */
  assert.match(iface, /P5 OBLIGATION/, 'P5 obligations must be stated');
  /* And that no adapter is implemented. */
  assert.match(iface, /no real adapter|There is no real adapter/i,
    'the file must state that no real adapter exists');
});
