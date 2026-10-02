/* What the one panel's support status really is, and that the documentation
 * says exactly that.
 *
 * This edition registers a single panel — 3X-UI (MHSanaei) — and support means
 * the installer can find the panel, install onto it, activate, verify and roll
 * back. The status is read from the installer itself, and the README panel
 * table is checked against it:
 *
 *   - the panel registry (installer/panels/index.sh) is asked which panels have
 *     an implementation, and every panel operation is called on a host where
 *     the panel is NOT installed, where none may report success;
 *   - the install command is run on a host with NO detection signal and on a
 *     host with only ONE, to show it refuses in both cases and writes nothing
 *     (one signal is not identification);
 *   - the panel table in README.md must mark the panel supported only when
 *     this file, unchanged, finds all seven capabilities for it.
 *
 * The PasarGuard/Rebecca adapters left with those panels; the docs/ tree and
 * the translated READMEs left with them too, so the documentation check is the
 * single README this edition ships.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildablePanelIds } from '../tools/panels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function bash(body, env = {}) {
  const r = spawnSync('bash', ['-c', 'set -Eeuo pipefail\n' + body], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env },
  });
  if (r.error) throw r.error;
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/* --- what the installer can do, per panel ----------------------------------- */

/* The operations a column of the matrix stands for. Each is a public panel
   operation from installer/panels/interface.sh. */
const VERBS = {
  detection: ['detect'],
  install: ['install_template', '/nonexistent/src'],
  verification: ['verify', 'static'],
  backup: ['backup_state'],
  restore: ['restore_state', '/nonexistent/snap'],
  uninstall: ['uninstall_template'],
};

/* Activation is NOT one verb, so it is not checked by a return code. It is the
   panel-side act of SELECTING the page, and the frozen P3 vocabulary names the
   mechanisms that may perform it. A panel can be activated only when its
   adapter declares at least one of them, so "Activate" is a capability question
   and is asked as one. Claiming activation without a mechanism would be a
   matrix cell with nothing behind it. */
const ACTIVATION_TOKENS = ['selection_write', 'env_activation', 'db_activation'];

/* Ask the installer. For every panel id: the implementation the registry
   resolves to, and the return code of every operation above. */
function installerMatrix() {
  const lines = [
    'export RT_ROOT="$(mktemp -d)/rt"; trap \'rm -rf "$(dirname "$RT_ROOT")"\' EXIT',
    'mkdir -p "$RT_ROOT"',
    '. installer/lib/row-template.sh',
    'echo "ids=$RT_PANEL_IDS"',
    'for p in $RT_PANEL_IDS; do',
    '  echo "impl-$p=$(rt_panel_impl_for "$p")"',
  ];
  for (const [col, [verb, ...args]] of Object.entries(VERBS)) {
    lines.push(`  rc=0; rt_panel_${verb} "$p" ${args.join(' ')} >/dev/null 2>&1 || rc=$?; echo "${col}-$p=$rc"`);
  }
  lines.push('  echo "caps-$p=$(rt_panel_capabilities "$p" 2>/dev/null | tr \'\\n\' \' \')"');
  lines.push('done');
  const r = bash(lines.join('\n'));
  assert.equal(r.code, 0, r.err);
  const kv = Object.fromEntries(r.out.split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const ids = kv.ids.split(' ').filter(Boolean);
  return Object.fromEntries(ids.map((p) => [p, {
    implemented: kv[`impl-${p}`] !== '',
    caps: (kv[`caps-${p}`] || '').split(' ').filter(Boolean),
    rc: Object.fromEntries(Object.keys(VERBS).map((c) => [c, Number(kv[`${c}-${p}`])])),
  }]));
}

/* The seven capabilities the status column stands for, in matrix order. A panel
   is Supported only when every one of them is present -- which is what makes
   "Supported" a claim about behaviour rather than about a file existing. */
const CAPABILITY_COLUMNS = ['detection', 'install', 'activation', 'verification', 'backup', 'restore', 'uninstall'];

const MATRIX = installerMatrix();
const INSTALLABLE = Object.keys(MATRIX).filter((p) => MATRIX[p].implemented);

test('the installer implements exactly one panel: 3xui', () => {
  assert.deepEqual(Object.keys(MATRIX).sort(), ['3xui'], 'the closed panel set');
  assert.deepEqual(INSTALLABLE, ['3xui'],
    'the one panel in the registry has an installer implementation');
  assert.deepEqual(buildablePanelIds().sort(), ['3xui'],
    'and a page shell is built for it');
});

test('every implemented panel declares a way to activate', () => {
  for (const p of INSTALLABLE) {
    const mechanisms = MATRIX[p].caps.filter((c) => ACTIVATION_TOKENS.includes(c));
    assert.ok(mechanisms.length >= 1,
      `${p}: activation needs a declared mechanism (one of ${ACTIVATION_TOKENS.join(', ')}), `
      + `but the adapter declares [${MATRIX[p].caps.join(', ')}]`);
  }
});

/* Does the installer REALLY have all seven capabilities for PANEL? Activation
   is answered from the declared mechanism (there is no activation verb);
   everything else must have a real operation, which VERBS enumerates. */
function hasAllCapabilities(p) {
  if (!INSTALLABLE.includes(p)) return false;
  return CAPABILITY_COLUMNS.every((col) => (col === 'activation'
    ? MATRIX[p].caps.some((c) => ACTIVATION_TOKENS.includes(c))
    : Object.prototype.hasOwnProperty.call(MATRIX[p].rc, col)));
}

test('on a host without the panel, no operation reports success', () => {
  /* This test host runs no panel. An operation that answered SUCCESS here
     would be claiming work it could not have done. Detection must say the
     panel is not here (NOT_APPLICABLE); everything else must refuse. */
  const HAS = { '3xui': ['/usr/local/x-ui/x-ui', '/usr/local/bin/x-ui'] };
  for (const [p, paths] of Object.entries(HAS)) {
    if (paths.some((x) => existsSync(x))) continue;   // a real panel host: not this test's subject
    assert.equal(MATRIX[p].rc.detection, 3, `${p}: detection must be NOT_APPLICABLE (3)`);
    for (const [col, rc] of Object.entries(MATRIX[p].rc)) {
      assert.notEqual(rc, 0, `${p}: ${col} must not report SUCCESS on a host without the panel`);
    }
  }
});

/* --- install refusal, both empty and half-present hosts -------------------- */

/* A throwaway payload that looks complete enough that only detection can stop
   the install — so a refusal proves detection ran. */
function payloadAt(base) {
  const payload = join(base, 'payload');
  mkdirSync(join(payload, 'shells', '3xui', 'row'), { recursive: true });
  copyFileSync(join(ROOT, 'template', 'index.html'), join(payload, 'template.html'));
  writeFileSync(join(payload, 'VERSION'), read('VERSION'));
  writeFileSync(join(payload, 'shells', '3xui', 'row', 'shell.html'), '{{ .username }}\n');
  return payload;
}

const HAS_REAL_PANEL = ['/usr/local/x-ui/x-ui', '/usr/local/bin/x-ui'].some((p) => existsSync(p));

test('on a host where 3X-UI is only half there — one signal — install refuses and writes nothing', { skip: HAS_REAL_PANEL }, () => {
  /* The panel's systemd unit is registered, and nothing else: no binary, no
     database. One signal is not identification (installer/panels/3xui.sh:
     "two independent signals must agree"), so detection must answer FAILURE —
     not NOT_APPLICABLE, not SUCCESS — and install must refuse with its own
     reason, writing nothing. Detection runs for real, against a stand-in
     systemctl on PATH. */
  const base = mkdtempSync(join(tmpdir(), 'row-panel-'));
  try {
    const bin = join(base, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'systemctl'), `#!/bin/sh\nprintf '%s\\n' 'x-ui.service enabled enabled'\n`);
    chmodSync(join(bin, 'systemctl'), 0o755);
    const payload = payloadAt(base);

    const r = bash([
      `export PATH="${bin}:$PATH" RT_ROOT="${base}/rt" RT_BIN="${base}/row-template"`,
      '. installer/lib/row-template.sh',
      'rt_require_root(){ :; }',
      'rc=0; rt_panel_detect 3xui >/dev/null 2>&1 || rc=$?; echo "detect=$rc"',
      `RT_ASSUME_YES=1 rt_cmd_install "${payload}" </dev/null 2>&1`,
    ].join('\n'));
    assert.match(r.out, /detect=1/, 'one signal must be FAILURE (1), never a guess');
    /* rt_cmd_install ends the process on refusal; the status is the verdict. */
    assert.notEqual(r.code, 0, 'install must refuse');
    assert.match(r.out + r.err, /refusing to proceed/, 'and say why it refuses');
    assert.equal(existsSync(join(base, 'rt')), false, 'nothing is installed');
    assert.equal(existsSync(join(base, 'row-template')), false, 'no CLI is installed');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('on a host with no signal at all, install refuses with the closed message', { skip: HAS_REAL_PANEL }, () => {
  const base = mkdtempSync(join(tmpdir(), 'row-panel-'));
  try {
    const payload = payloadAt(base);
    const r = bash([
      `export RT_ROOT="${base}/rt" RT_BIN="${base}/row-template"`,
      '. installer/lib/row-template.sh',
      'rt_require_root(){ :; }',
      `RT_ASSUME_YES=1 rt_cmd_install "${payload}" </dev/null 2>&1`,
    ].join('\n'));
    assert.notEqual(r.code, 0, 'install must refuse');
    assert.match(r.out + r.err, /no supported panel was detected/,
      'and say that nothing can be installed');
    assert.match(r.out + r.err, /nothing was changed/, 'and that nothing was changed');
    assert.equal(existsSync(join(base, 'rt')), false, 'nothing is installed');
    assert.equal(existsSync(join(base, 'row-template')), false, 'no CLI is installed');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

/* --- what the documentation says ---------------------------------------------- */

/* A panel named in a docs table, whatever the language's decoration: bold,
   Arabic LTR marks, Persian digits, a README link. */
function panelIdOf(cell) {
  const name = cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\(MHSanaei\)/g, '')
    .replace(/[\u200e\u200f*\s]/g, '')
    .replace(/۳/g, '3')
    .toLowerCase();
  return { '3x-ui': '3xui' }[name];
}

function tableRows(md, width) {
  const rows = {};
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== width) continue;
    const id = panelIdOf(cells[0]);
    if (id) rows[id] = cells;
  }
  return rows;
}

test('the README marks the panel supported exactly when all seven capabilities exist', () => {
  /* The translated READMEs and docs/ left with the panels they described;
     README.md is this edition's single documentation surface. */
  const rows = tableRows(read('README.md'), 3);
  assert.deepEqual(Object.keys(rows).sort(), Object.keys(MATRIX).sort(),
    'README.md: one row per panel');
  for (const [p, cells] of Object.entries(rows)) {
    const supported = hasAllCapabilities(p);
    if (supported) {
      assert.ok(cells[1].includes('✅'), `README.md: ${p} is supported`);
    } else {
      assert.equal(cells[1].includes('✅'), false, `README.md: ${p} must not be marked supported`);
    }
    if (INSTALLABLE.includes(p)) {
      assert.ok(cells[1].includes('✅'), `README.md: ${p} is installable`);
    }
    assert.equal(cells[1].includes('✅'), buildablePanelIds().includes(p),
      `README.md: ${p} page shell status matches the build`);
  }
});

/* The changelog is history: every OLD release's section describes the panels
   as they were IN THAT RELEASE (1.3.0-1.4.0 shipped PasarGuard and Rebecca,
   and that stays on the record). What must never return is a claim, in THIS
   edition's section, that a removed panel is supported. */
test('the changelog keeps history and claims no removed panel in this edition', () => {
  const md = read('CHANGELOG.md');
  const editionAt = md.indexOf('## [3X-UI Edition]');
  assert.ok(editionAt >= 0, 'the edition section exists');
  const rest = md.slice(editionAt + '## [3X-UI Edition]'.length);
  const edition = rest.split(/\n## /)[0];
  assert.match(edition, /3X-UI/, 'the edition section names 3X-UI');
  for (const s of edition.replace(/\n\s*/g, ' ').split(/(?<=[.!?])\s+/)) {
    if (!/PasarGuard|Rebecca/i.test(s) || !/\bsupported\b/i.test(s)) continue;
    assert.match(s, /\bnot (?:yet )?supported\b|\bunsupported\b|removed/i,
      `the edition section must not present a removed panel as supported: "${s}"`);
  }
  /* Pre-1.3.0 history: no older section may have claimed them supported. */
  const sections = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const m = line.match(/^## \[?(\d+\.\d+\.\d+)\]?/);
    if (m) { cur = { version: m[1], text: '' }; sections.push(cur); continue; }
    if (cur) cur.text += `${line}\n`;
  }
  const semver = (v) => v.split('.').map(Number);
  for (const { version, text } of sections) {
    const [x, y] = [semver(version), semver('1.3.0')];
    const isBefore = (() => { for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i]; return false; })();
    if (!isBefore) continue;
    for (const s of text.replace(/\n\s*/g, ' ').split(/(?<=[.!?])\s+/)) {
      if (!/PasarGuard|Rebecca/.test(s) || !/\bsupported\b/i.test(s)) continue;
      assert.match(s, /\bnot (?:yet )?supported\b|\bunsupported\b|not supported panels/i,
        `${version}: an old section names PasarGuard/Rebecca as supported before 1.3.0: "${s}"`);
    }
  }
});
