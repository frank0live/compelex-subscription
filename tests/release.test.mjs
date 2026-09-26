/* The release payload. tools/make-release.sh must ship the committed Row
   artifact as the top-level template.html — the file an OLDER installed
   library updates against, so it must stay Row — plus every selectable design
   of the release under templates/ with its checksum sidecar, and every panel's
   assembled shell under shells/ with its own sidecar. Nothing else: a design
   that is not selectable must not ship, and neither must a panel that is not
   buildable.

   The shells are PACKAGED, not installed. Nothing here places one on a target
   host or configures a panel to use one — that is the installer's business and
   it is deliberately untouched.

   BUILD COST. A release build rebuilds 15 artifacts and 45 shells and gzips a
   multi-megabyte payload; under the sandbox that costs minutes, not seconds.
   Every test that only INSPECTS the payload therefore shares ONE build, so added
   coverage does not add build time. Only the determinism test builds again, and
   it must — comparing two independent runs is the whole point. */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../tools/build.mjs';
import { availableTemplateIds, TEMPLATES } from '../tools/templates.mjs';
import { assembleShell } from '../tools/shell.mjs';
import { buildablePanelIds, emitterFor } from '../tools/panels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ROW = readFileSync(join(ROOT, 'template', 'index.html'));
const EDITORIAL = Buffer.from(build(true, 'editorial').html);
const CANVAS = Buffer.from(build(true, 'canvas').html);
const PRISM = Buffer.from(build(true, 'prism').html);
const TERMINAL = Buffer.from(build(true, 'terminal').html);
const PULSE = Buffer.from(build(true, 'pulse').html);
const BRUTAL = Buffer.from(build(true, 'brutal').html);
const ARCADE = Buffer.from(build(true, 'arcade').html);
const SKETCH = Buffer.from(build(true, 'sketch').html);
const SIGNATURE = Buffer.from(build(true, 'signature').html);
const SAFFRON = Buffer.from(build(true, 'saffron').html);
const RESERVED = Object.keys(TEMPLATES).filter((id) => !TEMPLATES[id].available);

function makeRelease(out) {
  // cygpath converts the Windows temp path to an MSYS one; on a native POSIX
  // host cygpath is absent and the path is already usable as-is.
  return spawnSync(
    'bash',
    ['-c', 'out="$(cygpath -u "$1" 2>/dev/null || printf "%s" "$1")"; tools/make-release.sh "$out"',
      'make-release', out],
    { cwd: ROOT, encoding: 'utf8' },
  );
}

function extractPayload(out) {
  const version = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
  const name = `row-template-${version}`;
  // through bash with cygpath: a direct tar argv would hand GNU tar a
  // "D:\..." path it reads as a remote host
  const r = spawnSync(
    'bash',
    ['-c', 't="$(cygpath -u "$1" 2>/dev/null || printf "%s" "$1")"; d="$(cygpath -u "$2" 2>/dev/null || printf "%s" "$2")"; tar -xzf "$t" -C "$d"',
      'extract', join(out, `${name}.tar.gz`), out],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, 'the tarball extracts');
  return join(out, name);
}

/* A release build is EXPENSIVE here — it rebuilds 15 artifacts and 45 shells and
   gzips a multi-megabyte payload, and under the sandbox that costs minutes, not
   seconds. Every test that only inspects the payload shares ONE build, so adding
   coverage does not add build time. Only the determinism test builds again, and
   it must: comparing two runs is the whole point. */
let shared = null;
function sharedPayload() {
  if (shared === null) {
    const out = mkdtempSync(join(tmpdir(), 'row-rel-shared-'));
    const r = makeRelease(out);
    assert.equal(r.status, 0, r.stderr);
    shared = { out, payload: extractPayload(out) };
  }
  return shared;
}

after(() => {
  if (shared !== null) rmSync(shared.out, { recursive: true, force: true });
});

test('the release payload ships Row on top and every selectable design with checksums', () => {
  const { payload } = sharedPayload();

  // the top-level file an older library updates against is the Row artifact,
  // byte for byte
  assert.equal(readFileSync(join(payload, 'template.html')).equals(ROW), true,
    'top-level template.html must be the committed Row artifact');

  // the store holds exactly the selectable set — no reserved placeholder ids
  assert.deepEqual(readdirSync(join(payload, 'templates')).sort(), availableTemplateIds().sort(),
    'templates/ must contain exactly the available ids');
  for (const reserved of RESERVED) {
    assert.ok(!readdirSync(join(payload, 'templates')).includes(reserved),
      `reserved design ${reserved} must not ship`);
  }

  // every store artifact matches its sidecar and the bytes it claims
  for (const id of availableTemplateIds()) {
    const file = readFileSync(join(payload, 'templates', id, 'template.html'));
    const sha = createHash('sha256').update(file).digest('hex');
    const sidecar = readFileSync(join(payload, 'templates', id, 'template.html.sha256'), 'utf8');
    assert.ok(sidecar.startsWith(sha), `${id} sidecar matches its artifact`);
    if (id === 'row') {
      assert.equal(file.equals(ROW), true, 'row store artifact equals the top-level file');
    }
    if (id === 'editorial') {
      assert.equal(file.equals(EDITORIAL), true, 'editorial store artifact is the current build');
      assert.ok(file.length <= 200 * 1024, 'editorial stays inside the hard ceiling');
    }
      if (id === 'canvas') {
        assert.equal(file.equals(CANVAS), true, 'canvas store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'canvas stays inside its own budget line');
      }
      if (id === 'prism') {
        assert.equal(file.equals(PRISM), true, 'prism store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'prism stays inside its own budget line');
      }
      if (id === 'terminal') {
        assert.equal(file.equals(TERMINAL), true, 'terminal store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'terminal stays inside its own budget line');
      }
      if (id === 'pulse') {
        assert.equal(file.equals(PULSE), true, 'pulse store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'pulse stays inside its own budget line');
      }
      if (id === 'brutal') {
        assert.equal(file.equals(BRUTAL), true, 'brutal store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'brutal stays inside its own budget line');
      }
      if (id === 'arcade') {
        assert.equal(file.equals(ARCADE), true, 'arcade store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'arcade stays inside its own budget line');
      }
      if (id === 'sketch') {
        assert.equal(file.equals(SKETCH), true, 'sketch store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'sketch stays inside its own budget line');
      }
      if (id === 'signature') {
        assert.equal(file.equals(SIGNATURE), true, 'signature store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'signature stays inside its own budget line');
      }
      if (id === 'saffron') {
        assert.equal(file.equals(SAFFRON), true, 'saffron store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'saffron stays inside its own budget line');
      }
    }

    // the inner SHA256SUMS covers every payload file, correctly. The star is
    // sha256sum's binary-mode marker on some platforms; strip it like the
    // installer library does.
    const sums = readFileSync(join(payload, 'SHA256SUMS'), 'utf8').trim().split('\n');
    const listed = new Set();
    for (const line of sums) {
      const [hex, raw] = line.split(/\s+/).filter(Boolean);
      const file = raw.replace(/^\*/, '').replace(/^\.\//, '');
      const bytes = readFileSync(join(payload, file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hex, file);
      listed.add(file);
    }
    const actual = readdirSync(payload, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name !== 'SHA256SUMS')
      .map((e) => join(e.parentPath ?? e.path, e.name).slice(payload.length + 1).replace(/\\/g, '/'));
    for (const f of actual) {
      assert.ok(listed.has(f), `inner SHA256SUMS lists ${f}`);
    }
});

/* The shell tree. The release carries every panel's assembled shell for every
   selectable design — packaged, not installed. Nothing here places a shell on a
   target host or configures a panel to use one; that is the installer's business
   and it is deliberately untouched by this phase. */
test('the release payload ships every panel shell for every design, with checksums', () => {
  const { payload } = sharedPayload();
  const shellRoot = join(payload, 'shells');

  // all three families, and nothing else
  assert.deepEqual(readdirSync(shellRoot).sort(), buildablePanelIds().sort(),
    'shells/ must contain exactly the buildable panels');
  /* Buildable, not supported: a shell is packaged for every panel in the
     registry, but only 3X-UI can be installed (see panel-support.test.mjs). */
  assert.deepEqual(buildablePanelIds().sort(), ['3xui', 'pasarguard', 'rebecca'],
    'the three buildable panels');

  // every design, under every panel
  for (const panel of buildablePanelIds()) {
    assert.deepEqual(readdirSync(join(shellRoot, panel)).sort(), availableTemplateIds().sort(),
      `${panel} must carry exactly the selectable designs`);
  }

  // every shell is the assembled shell, byte for byte, and its sidecar matches
  for (const panel of buildablePanelIds()) {
    for (const id of availableTemplateIds()) {
      const file = readFileSync(join(shellRoot, panel, id, 'shell.html'));
      const text = file.toString('utf8');
      const expected = Buffer.from(assembleShell(panel, id).html);
      assert.equal(file.equals(expected), true,
        `${panel}/${id} must be the current assembled shell`);

      const sha = createHash('sha256').update(file).digest('hex');
      const sidecar = readFileSync(join(shellRoot, panel, id, 'shell.html.sha256'), 'utf8');
      assert.ok(sidecar.startsWith(sha), `${panel}/${id} sidecar matches its shell`);

      // complete, and in that panel's own dialect. The reference panel's emitter
      // IS Go, so its shell correctly carries Go syntax — the "no Go" assertions
      // apply only to the dialects that must have been rewritten.
      assert.equal(text.includes('/*__STYLES__*/'), false, `${panel}/${id} has no unfilled token`);
      if (emitterFor(panel) === 'go') {
        assert.ok(text.includes('{{'), `${panel}/${id} is a Go shell and keeps Go syntax`);
      } else {
        assert.equal(/\{\{\s*\.[A-Za-z]/.test(text), false, `${panel}/${id} carries no Go field syntax`);
        assert.equal(/\{\{\s*(?:if|else|end|range)\b/.test(text), false, `${panel}/${id} carries no Go tag`);
        assert.ok(text.includes('{% if '), `${panel}/${id} carries block syntax`);
        assert.equal(text.includes('data-template="__TEMPLATE_ID__"'), false,
          `${panel}/${id} has no unfilled template id`);
      }
    }
  }
});

test('the release tarball is byte-deterministic', () => {
  /* Compared against the SHARED build rather than making two more: the shared
     one is already on disk, so this costs one extra build instead of two. The
     comparison is identical — two independent runs, byte for byte. */
  const { out: sharedOut } = sharedPayload();
  const b = mkdtempSync(join(tmpdir(), 'row-rel-b-'));
  try {
    assert.equal(makeRelease(b).status, 0);
    const version = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
    const ta = readFileSync(join(sharedOut, `row-template-${version}.tar.gz`));
    const tb = readFileSync(join(b, `row-template-${version}.tar.gz`));
    assert.equal(ta.equals(tb), true, 'two release runs must produce identical tarballs');
  } finally {
    rmSync(b, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------------ */
/* Installing from the release                                              */
/*                                                                          */
/* The tests above prove what the tarball CONTAINS. These prove it WORKS: a */
/* fresh install from the extracted payload, and an upgrade from v1.1.0     */
/* driven by the v1.1.0 updater itself -- the code actually installed on    */
/* existing hosts -- against this release.                                  */
/*                                                                          */
/* Everything runs against a throwaway RT_ROOT and RT_BIN. The panel is     */
/* stubbed as detected but without a database, and the service controls    */
/* are no-ops, so no test can reach a real 3X-UI on the machine running it. */
/* install.sh itself is not run: it requires root, and everything after its */
/* root check is what these tests do -- extract the tarball, source the     */
/* payload's own library, and call rt_cmd_install on the payload.           */
/* ------------------------------------------------------------------------ */

/* The management library's companions: what rt_panels_load and
   rt_transaction_load source, so what a release must ship and an install
   must put next to the library. */
const COMPANIONS = ['lib/transaction.sh', 'panels/3xui.sh', 'panels/index.sh', 'panels/interface.sh', 'panels/pasarguard.sh', 'panels/rebecca.sh'];

/* installer/lib/row-template.sh exactly as released in v1.1.0; see its README. */
const V110_LIB = join(ROOT, 'tests', 'fixtures', 'installer-1.1.0', 'row-template.sh');
const V110_SHA = 'c5a2b069826e5f1b46c1ace42d111d8f7a035c3c9651f064b69e62ca41ed32ac';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const same = (a, b) => readFileSync(a).equals(readFileSync(b));

/* A detected 3X-UI 3.7.0 with no database: activation takes the manual path.
   Root is assumed and the service is never touched. Defined AFTER a library
   is sourced, so they replace its functions. */
const PANEL_STUBS = [
  'rt_require_root(){ :; }',
  'rt_detect_xui(){ RT_XUI_UNIT="x-ui.service"; return 0; }',
  'rt_detect_xui_version(){ RT_XUI_VERSION="3.7.0"; printf "3.7.0"; }',
  'rt_detect_xui_db(){ RT_XUI_DB=""; return 1; }',
  'rt_service_active(){ return 1; }',
  'rt_service_start(){ :; }',
  'rt_service_stop(){ :; }',
  'trap "rt_cleanup" EXIT',
].join('\n');

/* Run a bash script with each PATHS entry exported as a POSIX path (cygpath on
   Windows, as-is elsewhere). Returns {code, out, err}. */
function bashRun(lines, paths = {}) {
  const head = Object.entries(paths).map(([k, v]) =>
    `${k}="$(cygpath -u ${sq(v)} 2>/dev/null || printf '%s' ${sq(v)})"; export ${k}`);
  const script = ['set -Eeuo pipefail', 'unset RT_TEMPLATE RT_RELEASE_URL RT_ASSUME_YES XUI_DB_FOLDER',
    ...head, ...lines].join('\n');
  const r = spawnSync('bash', ['-c', script], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'row-install-'));
  mkdirSync(join(base, 'bin'));
  return { base, rt: join(base, 'rt'), bin: join(base, 'bin', 'row-template') };
}

/* What a fresh bash sees when it sources the INSTALLED library. verify
   completes an incomplete install from the release source, so none is
   reachable here: this reports the state as it is. (A library that predates
   that ignores the stub.) */
function installedState(sb) {
  return bashRun([
    'if . "$RT_ROOT/lib/row-template.sh"; then echo "loaded=yes"; else echo "loaded=NO"; exit 0; fi',
    'echo "panels=${RT_PANELS_LOADED:-} txn=${RT_TRANSACTION_LOADED:-}"',
    'if rt_installer_complete; then echo "complete=yes"; else echo "complete=no"; fi',
    'echo "name=$(rt_config_get_text SERVICE_NAME_B64)"',
    PANEL_STUBS,
    'rt_fetch_release(){ return 1; }',
    'echo "--- verify"',
    '( rt_cmd_verify ) 2>&1 || true',
  ], { RT_ROOT: sb.rt, RT_BIN: sb.bin });
}

/* The installed CLI, run the way an operator runs it. `version` needs no root. */
function cli(sb, ...args) {
  return bashRun([`bash "$RT_BIN" ${args.join(' ')}`], { RT_ROOT: sb.rt, RT_BIN: sb.bin });
}

function assertComplete(sb, label) {
  for (const rel of ['lib/row-template.sh', ...COMPANIONS]) {
    assert.ok(existsSync(join(sb.rt, rel)), `${label}: ${rel} is installed`);
    assert.ok(same(join(sb.rt, rel), join(ROOT, 'installer', rel)), `${label}: ${rel} is this release's file`);
  }
  assert.ok(same(sb.bin, join(ROOT, 'installer', 'bin', 'row-template')), `${label}: the CLI is this release's`);
  assert.deepEqual(readdirSync(join(sb.rt, 'dist', 'templates')).sort(), availableTemplateIds().sort(),
    `${label}: every design is in the store`);
  const s = installedState(sb);
  assert.equal(s.code, 0, s.err);
  assert.match(s.out, /loaded=yes/, `${label}: the installed library loads`);
  assert.match(s.out, /panels=1 txn=1/, `${label}: with the panel layer and the transaction engine`);
  assert.match(s.out, /complete=yes/);
  assert.match(s.out, /Installer components present/, `${label}: verify sees a complete install`);
  assert.match(s.out, new RegExp(`Template store verified \\(${availableTemplateIds().length} design`));
  const v = cli(sb, 'version');
  assert.equal(v.code, 0, `${label}: the installed CLI runs\n${v.err}`);
  assert.match(v.out, new RegExp(readFileSync(join(ROOT, 'VERSION'), 'utf8').trim().replace(/\./g, '\\.')));
  return s;
}

test('the release payload ships the management library with every companion it loads', () => {
  const { payload } = sharedPayload();
  assert.deepEqual(readdirSync(payload).sort(),
    ['SHA256SUMS', 'VERSION', 'bin', 'install.sh', 'lib', 'panels', 'shells', 'template.html', 'templates'],
    'the payload top level');

  /* The set is the one on disk, so a companion added to installer/ must ship. */
  const onDisk = [
    ...readdirSync(join(ROOT, 'installer', 'lib')).filter((f) => f !== 'row-template.sh').map((f) => `lib/${f}`),
    ...readdirSync(join(ROOT, 'installer', 'panels')).map((f) => `panels/${f}`),
  ].sort();
  assert.deepEqual(onDisk, COMPANIONS, 'every file beside the library is a companion');
  const lib = readFileSync(join(ROOT, 'installer', 'lib', 'row-template.sh'), 'utf8');
  const declared = (lib.match(/^RT_INSTALLER_COMPANIONS="([^"]*)"/m) || [])[1];
  assert.ok(declared, 'the library declares its companions');
  assert.deepEqual(declared.split(/\s+/).filter(Boolean).sort(), COMPANIONS,
    'and the declaration is exactly the files on disk');

  const sums = readFileSync(join(payload, 'SHA256SUMS'), 'utf8');
  for (const rel of ['lib/row-template.sh', 'bin/row-template', 'install.sh', ...COMPANIONS]) {
    const src = rel === 'install.sh' ? join(ROOT, 'installer', 'install.sh') : join(ROOT, 'installer', rel);
    assert.ok(same(join(payload, rel), src), `${rel} ships byte-identical to the source`);
    assert.ok(sums.includes(`${sha256(readFileSync(join(payload, rel)))}  ${rel}\n`), `${rel} is in SHA256SUMS`);
  }

  /* The packaged library loads from the payload, as install.sh sources it. */
  const sb = sandbox();
  try {
    const r = bashRun(['. "$PAYLOAD/lib/row-template.sh"',
      'echo "panels=${RT_PANELS_LOADED:-} txn=${RT_TRANSACTION_LOADED:-}"'],
    { PAYLOAD: payload, RT_ROOT: sb.rt });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /panels=1 txn=1/, 'the packaged library loads both layers');
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

test('a fresh install from the release tarball installs a complete, working manager', () => {
  const { payload } = sharedPayload();
  const sb = sandbox();
  try {
    const r = bashRun([
      '. "$PAYLOAD/lib/row-template.sh"',
      PANEL_STUBS,
      'RT_SERVICE_NAME="Test VPN" rt_cmd_install "$PAYLOAD"',
    ], { PAYLOAD: payload, RT_ROOT: sb.rt, RT_BIN: sb.bin });
    assert.equal(r.code, 0, r.err);
    const s = assertComplete(sb, 'fresh install');
    assert.match(s.out, /name=Test VPN/, 'branding was applied');
    assert.ok(existsSync(join(sb.rt, 'sub.html')), 'the page was generated');
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

/* A host as v1.1.0 left it, then updated by its own updater to this release:
   install v1.1.0 with the v1.1.0 library, then run that library's
   rt_cmd_update against the real release directory. bin/row-template is
   unchanged since v1.1.0, so this release's copy is the v1.1.0 one. */
function upgradedByV110(sb, out, payload) {
  assert.equal(sha256(readFileSync(V110_LIB)), V110_SHA, 'the fixture is the released v1.1.0 library');
  const old = join(sb.base, 'payload-1.1.0');
  mkdirSync(join(old, 'lib'), { recursive: true });
  mkdirSync(join(old, 'bin'));
  copyFileSync(join(payload, 'template.html'), join(old, 'template.html'));
  writeFileSync(join(old, 'VERSION'), '1.1.0\n');
  copyFileSync(V110_LIB, join(old, 'lib', 'row-template.sh'));
  copyFileSync(join(ROOT, 'installer', 'bin', 'row-template'), join(old, 'bin', 'row-template'));

  const paths = { OLD: old, REL: out, RT_ROOT: sb.rt, RT_BIN: sb.bin };
  const install = bashRun(['. "$OLD/lib/row-template.sh"', PANEL_STUBS,
    'RT_SERVICE_NAME="Test VPN" rt_cmd_install "$OLD"'], paths);
  assert.equal(install.code, 0, 'v1.1.0 installs\n' + install.err);
  assert.equal(readFileSync(join(sb.rt, 'VERSION'), 'utf8').trim(), '1.1.0');
  assert.ok(same(join(sb.rt, 'lib', 'row-template.sh'), V110_LIB), 'the v1.1.0 library is installed');

  const update = bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS,
    'RT_RELEASE_DIR="$REL" rt_cmd_update'], paths);
  assert.equal(update.code, 0, 'the v1.1.0 updater applies this release\n' + update.err);
  assert.equal(readFileSync(join(sb.rt, 'VERSION'), 'utf8'), readFileSync(join(ROOT, 'VERSION'), 'utf8'));
  assert.ok(same(join(sb.rt, 'lib', 'row-template.sh'), join(ROOT, 'installer', 'lib', 'row-template.sh')),
    'the old updater installed the new library');
  /* ...and nothing else: it copies four files, so this state is unavoidable. */
  for (const rel of COMPANIONS) {
    assert.equal(existsSync(join(sb.rt, rel)), false, `the v1.1.0 updater cannot install ${rel}`);
  }
}

test('after the v1.1.0 updater applies this release, the manager still works and reports the install incomplete', () => {
  const { out, payload } = sharedPayload();
  const sb = sandbox();
  try {
    upgradedByV110(sb, out, payload);
    const v = cli(sb, 'version');
    assert.equal(v.code, 0, 'the CLI must start with the companions absent\n' + v.err);
    const s = installedState(sb);
    assert.equal(s.code, 0, s.err);
    assert.match(s.out, /loaded=yes/, 'the new library loads without its companions');
    assert.match(s.out, /panels= txn=/, 'and marks both layers absent');
    assert.match(s.out, /complete=no/);
    assert.match(s.out, /name=Test VPN/, 'branding survived the update');
    assert.match(s.out, /installer components are missing[^\n]*row-template update/,
      'verify names the problem and the remedy');
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

test('row-template update completes an install the v1.1.0 updater left incomplete', () => {
  const { out, payload } = sharedPayload();
  const sb = sandbox();
  try {
    upgradedByV110(sb, out, payload);
    const r = bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS,
      'RT_RELEASE_DIR="$REL" rt_cmd_update'], { REL: out, RT_ROOT: sb.rt, RT_BIN: sb.bin });
    assert.equal(r.code, 0, r.err);
    const s = assertComplete(sb, 'completed upgrade');
    assert.match(s.out, /name=Test VPN/, 'branding survived the whole path');
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

test('the manager offers to complete an incomplete install even when it is up to date', () => {
  const { out, payload } = sharedPayload();
  const sb = sandbox();
  try {
    upgradedByV110(sb, out, payload);
    /* stdin is not a terminal, so every confirmation takes its default. */
    const r = bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS,
      'RT_RELEASE_DIR="$REL" rt_manager_update </dev/null 2>&1'], { REL: out, RT_ROOT: sb.rt, RT_BIN: sb.bin });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /incomplete/, 'the manager says why it offers a re-install');
    assertComplete(sb, 'manager completion');
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------------ */
/* One `row-template update` from v1.1.0 is enough                          */
/*                                                                          */
/* v1.1.0's updater installs this release's library but copies only four    */
/* files, so the store arrives empty. The FIRST run of the new code -- the  */
/* manager an operator opens next -- completes the install from the same    */
/* release, and the Template chooser offers every design. No second update, */
/* no manual copy.                                                          */
/* ------------------------------------------------------------------------ */

const DESIGN_NAMES = availableTemplateIds().map((id) => TEMPLATES[id].name);

/* The manager as an operator opens it, then Reconfigure branding -> Template.
   stdin is not a terminal, so every menu reads EOF and backs out. */
function openChooser(sb, rel) {
  return bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS,
    'export RT_RELEASE_DIR="$REL"',
    'rt_manager_main </dev/null >"$RT_ROOT/../manager.log" 2>&1',
    'rt_reconfig_template </dev/null 2>&1'], { REL: rel, RT_ROOT: sb.rt, RT_BIN: sb.bin });
}

function assertChooserOffersAll(r, label) {
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /No templates are installed/, `${label}: the chooser is not empty`);
  for (const name of DESIGN_NAMES) {
    assert.match(r.out, new RegExp(`^\\s*\\d+\\s+${name}$`, 'm'), `${label}: ${name} is offered`);
  }
}

test('after one row-template update from v1.1.0, the next manager run offers every design', () => {
  const { out, payload } = sharedPayload();
  const sb = sandbox();
  try {
    upgradedByV110(sb, out, payload);
    assert.equal(existsSync(join(sb.rt, 'dist', 'templates')), false,
      'the v1.1.0 updater leaves no store: this is the state operators are in');
    const backups = readdirSync(join(sb.rt, 'backups')).sort();

    const r = openChooser(sb, out);
    assertChooserOffersAll(r, 'first manager run');
    assert.match(readFileSync(join(sb.base, 'manager.log'), 'utf8'), new RegExp(`Installation completed: ${availableTemplateIds().length} design`),
      'the manager says what it completed');
    const s = assertComplete(sb, 'completed on first run');
    assert.match(s.out, /name=Test VPN/, 'branding survived');
    assert.equal(existsSync(join(sb.rt, 'templates')), false, 'no store outside dist/templates');
    assert.deepEqual(readdirSync(join(sb.rt, 'backups')).sort(), backups, 'every backup is kept');

    /* rollback still works on the completed install */
    const rb = bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS, 'rt_cmd_rollback'],
      { RT_ROOT: sb.rt, RT_BIN: sb.bin });
    assert.equal(rb.code, 0, 'rollback after the completed upgrade\n' + rb.err);
    assert.match(rb.out, /Rollback complete/);
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

test('after one row-template update from v1.1.0, row-template verify completes the install and passes', () => {
  const { out, payload } = sharedPayload();
  const sb = sandbox();
  try {
    upgradedByV110(sb, out, payload);
    const v = bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS,
      'RT_RELEASE_DIR="$REL" rt_cmd_verify'], { REL: out, RT_ROOT: sb.rt, RT_BIN: sb.bin });
    assert.equal(v.code, 0, 'verify passes on the first run after the update\n' + v.err);
    assert.match(v.out, new RegExp(`Installation completed: ${availableTemplateIds().length} design`));
    assertComplete(sb, 'completed by verify');
    assertChooserOffersAll(openChooser(sb, out), 'after verify');
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

/* The layout from the report: the payload's templates/ landed at the install
   root, beside dist/ instead of inside it. */
function misplaceStore(sb, payload) {
  const dest = join(sb.rt, 'templates');
  for (const id of availableTemplateIds()) {
    mkdirSync(join(dest, id), { recursive: true });
    for (const f of ['template.html', 'template.html.sha256']) {
      copyFileSync(join(payload, 'templates', id, f), join(dest, id, f));
    }
  }
}

test('a store left at the install root is moved into dist/templates by update', () => {
  const { out, payload } = sharedPayload();
  const sb = sandbox();
  try {
    upgradedByV110(sb, out, payload);
    misplaceStore(sb, payload);
    const r = bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS,
      'RT_RELEASE_DIR="$REL" rt_cmd_update'], { REL: out, RT_ROOT: sb.rt, RT_BIN: sb.bin });
    assert.equal(r.code, 0, r.err);
    assertComplete(sb, 'update over a misplaced store');
    assert.equal(existsSync(join(sb.rt, 'templates')), false, 'the misplaced copy is retired');
    assertChooserOffersAll(openChooser(sb, out), 'after update');
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});

test('a store left at the install root is moved home by verify, from the host alone', () => {
  const { out, payload } = sharedPayload();
  const sb = sandbox();
  try {
    upgradedByV110(sb, out, payload);
    misplaceStore(sb, payload);
    /* No release source is reachable, so every design must come from the host.
       (verify still TRIES a download here, for the installer files v1.1.0's
       updater never installs -- it fails, and that is reported separately.) */
    const v = bashRun(['. "$RT_ROOT/lib/row-template.sh"', PANEL_STUBS,
      'rt_fetch_release(){ return 1; }',
      '( rt_cmd_verify ) 2>&1 || true'], { RT_ROOT: sb.rt, RT_BIN: sb.bin });
    assert.equal(v.code, 0, v.err);
    assert.match(v.out, new RegExp(`moved ${availableTemplateIds().length} design`), 'verify moves the store home');
    assert.match(v.out, new RegExp(`Template store verified \\(${availableTemplateIds().length} design`),
      'and the store is complete without any download');
    assert.doesNotMatch(v.out, /template store is incomplete/);
    assert.match(v.out, /installer components are missing/, 'the one gap left is named');
    assert.deepEqual(readdirSync(join(sb.rt, 'dist', 'templates')).sort(), availableTemplateIds().sort());
    assert.equal(existsSync(join(sb.rt, 'templates')), false);
  } finally {
    rmSync(sb.base, { recursive: true, force: true });
  }
});
