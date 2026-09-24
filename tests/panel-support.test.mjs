/* What each panel's support status really is, and that the documentation says
 * exactly that.
 *
 * The release packages a page shell for every panel in the registry (3X-UI,
 * PasarGuard, Rebecca), and RT_PANEL_IDS names all three. Neither makes a panel
 * supported. Support means the installer can find the panel, install onto it,
 * activate, verify and roll back -- so the status is read from the installer
 * itself, and every README and compatibility page is checked against it:
 *
 *   - the panel registry (installer/panels/index.sh) is asked which panels have
 *     an implementation, and every panel operation is called for the others;
 *   - the install command is run on a host that has PasarGuard or Rebecca and no
 *     3X-UI, with real detection, to show there is no other install path;
 *   - the capability matrix in docs/.../compatibility.mdx (English, Persian,
 *     Arabic) and the panel table in all five READMEs must match those results.
 *
 * A panel becomes "Supported" in the docs only when this file, unchanged, finds
 * an implementation for it. Nothing here is satisfied by an adapter file merely
 * existing.
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
};

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
  lines.push('done');
  const r = bash(lines.join('\n'));
  assert.equal(r.code, 0, r.err);
  const kv = Object.fromEntries(r.out.split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const ids = kv.ids.split(' ').filter(Boolean);
  return Object.fromEntries(ids.map((p) => [p, {
    implemented: kv[`impl-${p}`] !== '',
    rc: Object.fromEntries(Object.keys(VERBS).map((c) => [c, Number(kv[`${c}-${p}`])])),
  }]));
}

const MATRIX = installerMatrix();
const INSTALLABLE = Object.keys(MATRIX).filter((p) => MATRIX[p].implemented);
const UNAVAILABLE = 2;

test('the installer implements 3X-UI and no other panel', () => {
  assert.deepEqual(Object.keys(MATRIX).sort(), ['3xui', 'pasarguard', 'rebecca'], 'the closed panel set');
  assert.deepEqual(INSTALLABLE, ['3xui'], 'only 3X-UI has an installer implementation');
  assert.deepEqual(buildablePanelIds().sort(), ['3xui', 'pasarguard', 'rebecca'],
    'while a page shell is still BUILT for all three -- which is not support');
});

test('every installer operation on PasarGuard and Rebecca is UNAVAILABLE', () => {
  for (const p of ['pasarguard', 'rebecca']) {
    for (const [col, rc] of Object.entries(MATRIX[p].rc)) {
      assert.equal(rc, UNAVAILABLE, `${p}: ${col} must be UNAVAILABLE (2), got ${rc}`);
    }
  }
});

/* A PasarGuard or Rebecca host: the panel's systemd unit is present, there is
   no x-ui binary or unit. Detection runs for real, against a stand-in
   systemctl on PATH. Skipped where a real 3X-UI binary is installed, since the
   library looks for it at fixed system paths. */
const HAS_REAL_XUI = ['/usr/local/x-ui/x-ui', '/usr/local/bin/x-ui'].some((p) => existsSync(p));

test('on a host with PasarGuard or Rebecca and no 3X-UI, install refuses and writes nothing', { skip: HAS_REAL_XUI }, () => {
  for (const unit of ['pasarguard.service', 'rebecca.service']) {
    const base = mkdtempSync(join(tmpdir(), 'row-panel-'));
    try {
      const bin = join(base, 'bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'systemctl'), `#!/bin/sh\nprintf '%s\\n' '${unit} enabled enabled'\n`);
      chmodSync(join(bin, 'systemctl'), 0o755);
      const payload = join(base, 'payload');
      mkdirSync(join(payload, 'shells', 'pasarguard', 'row'), { recursive: true });
      mkdirSync(join(payload, 'shells', 'rebecca', 'row'), { recursive: true });
      copyFileSync(join(ROOT, 'template', 'index.html'), join(payload, 'template.html'));
      writeFileSync(join(payload, 'VERSION'), read('VERSION'));
      writeFileSync(join(payload, 'shells', 'pasarguard', 'row', 'shell.html'), '{{ user.username }}\n');
      writeFileSync(join(payload, 'shells', 'rebecca', 'row', 'shell.html'), '{{ user.username }}\n');

      const r = bash([
        `export PATH="${bin}:$PATH" RT_ROOT="${base}/rt" RT_BIN="${base}/row-template"`,
        '. installer/lib/row-template.sh',
        'rt_require_root(){ :; }',
        `RT_ASSUME_YES=1 rt_cmd_install "${payload}" </dev/null`,
      ].join('\n'));
      assert.notEqual(r.code, 0, `${unit}: install must refuse`);
      assert.match(r.err, /no 3x-ui installation was detected/, `${unit}: and say why`);
      assert.equal(existsSync(join(base, 'rt')), false, `${unit}: nothing is installed`);
      assert.equal(existsSync(join(base, 'row-template')), false, `${unit}: no CLI is installed`);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
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
  return { '3x-ui': '3xui', pasarguard: 'pasarguard', rebecca: 'rebecca' }[name];
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

/* The capability matrix. Columns 1-5 are installer capabilities, 6 is the
   page shell, 7 the status -- in every language. */
const COMPAT = {
  en: { file: 'docs/src/content/docs/compatibility.mdx', research: 'Research' },
  fa: { file: 'docs/src/content/docs/fa/compatibility.mdx', research: 'پژوهش' },
  ar: { file: 'docs/src/content/docs/ar/compatibility.mdx', research: 'بحث' },
};
const INSTALLER_COLUMNS = ['detection', 'install', 'activation', 'verification', 'backup'];

for (const [lang, { file, research }] of Object.entries(COMPAT)) {
  test(`the ${lang} compatibility matrix matches what the installer can do`, () => {
    const rows = tableRows(read(file), 8);
    assert.deepEqual(Object.keys(rows).sort(), Object.keys(MATRIX).sort(), `${file}: one matrix row per panel`);
    for (const [p, cells] of Object.entries(rows)) {
      const installable = INSTALLABLE.includes(p);
      INSTALLER_COLUMNS.forEach((col, i) => {
        assert.equal(cells[i + 1], installable ? '✅' : '❌',
          `${file}: ${p} ${col} must be ${installable ? '✅' : '❌'} -- the installer ${installable ? 'implements' : 'does not implement'} it`);
      });
      assert.equal(cells[6], buildablePanelIds().includes(p) ? '✅' : '❌', `${file}: ${p} page shell`);
      if (installable) {
        assert.ok(cells[7].startsWith('**'), `${file}: ${p} is marked supported`);
      } else {
        assert.equal(cells[7].includes('**'), false, `${file}: ${p} must not be marked supported`);
        assert.ok(cells[7].includes(research), `${file}: ${p} is marked as research`);
      }
    }
  });
}

const READMES = ['README.md', 'README.fa.md', 'README.ar.md', 'README.ru.md', 'README.zh-CN.md'];

test('every README marks only installable panels as supported', () => {
  for (const file of READMES) {
    const rows = tableRows(read(file), 3);
    assert.deepEqual(Object.keys(rows).sort(), Object.keys(MATRIX).sort(), `${file}: one row per panel`);
    for (const [p, cells] of Object.entries(rows)) {
      if (INSTALLABLE.includes(p)) {
        assert.ok(cells[1].includes('✅'), `${file}: ${p} is supported`);
      } else {
        assert.equal(cells[1].includes('✅'), false, `${file}: ${p} must not be marked supported`);
        assert.ok(cells[1].includes('🔬'), `${file}: ${p} is marked as research`);
      }
    }
  }
});

test('the changelog never calls PasarGuard or Rebecca supported', () => {
  const sentences = read('CHANGELOG.md').replace(/\n\s*/g, ' ').split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if (!/PasarGuard|Rebecca/.test(s) || !/\bsupported\b/i.test(s)) continue;
    assert.match(s, /\bnot (?:yet )?supported\b|\bunsupported\b|not supported panels/i,
      `a changelog sentence names PasarGuard/Rebecca as supported: "${s}"`);
  }
});
