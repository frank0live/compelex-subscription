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
 *     an implementation, and every panel operation is called on a host where
 *     the panel is NOT installed, where none may report success;
 *   - the install command is run on a host where a panel is only half there
 *     (one detection signal), with real detection, to show it refuses;
 *   - the capability matrix in docs/.../compatibility.mdx (English, Persian,
 *     Arabic) and the panel table in all five READMEs must match those results.
 *
 * Since 1.3.0 all three panels have an implementation, so all three are
 * Supported; the full install/activate/verify/rollback/uninstall behaviour of
 * PasarGuard and Rebecca is exercised in tests/installer-panel-pasarguard.test.mjs
 * and tests/installer-panel-rebecca.test.mjs.
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

test('the installer implements all three panels', () => {
  assert.deepEqual(Object.keys(MATRIX).sort(), ['3xui', 'pasarguard', 'rebecca'], 'the closed panel set');
  assert.deepEqual(INSTALLABLE.sort(), ['3xui', 'pasarguard', 'rebecca'],
    'every panel in the registry has an installer implementation');
  assert.deepEqual(buildablePanelIds().sort(), ['3xui', 'pasarguard', 'rebecca'],
    'and a page shell is built for each');
});

test('on a host without the panel, no operation reports success', () => {
  /* This test host runs none of the panels. An operation that answered
     SUCCESS here would be claiming work it could not have done. Detection must
     say the panel is not here (NOT_APPLICABLE); everything else must refuse. */
  const HAS = { '3xui': ['/usr/local/x-ui/x-ui', '/usr/local/bin/x-ui'],
    pasarguard: ['/opt/pasarguard/.env'], rebecca: ['/opt/rebecca/.env'] };
  for (const [p, paths] of Object.entries(HAS)) {
    if (paths.some((x) => existsSync(x))) continue;   // a real panel host: not this test's subject
    assert.equal(MATRIX[p].rc.detection, 3, `${p}: detection must be NOT_APPLICABLE (3)`);
    for (const [col, rc] of Object.entries(MATRIX[p].rc)) {
      assert.notEqual(rc, 0, `${p}: ${col} must not report SUCCESS on a host without the panel`);
    }
  }
});

/* A host where PasarGuard or Rebecca is only HALF there: the panel's systemd
   unit is registered, and nothing else (no .env, no data directory, no CLI).
   One signal is not identification (installer/panels/interface.sh), so install
   must refuse, write nothing, and say why. Detection runs for real, against a
   stand-in systemctl on PATH. Skipped where a real panel is installed, since
   the library looks at fixed system paths. */
const HAS_REAL_PANEL = ['/usr/local/x-ui/x-ui', '/usr/local/bin/x-ui', '/opt/pasarguard', '/opt/rebecca',
  '/var/lib/pasarguard', '/var/lib/rebecca'].some((p) => existsSync(p));

test('on a host where PasarGuard or Rebecca is only half there, install refuses and writes nothing', { skip: HAS_REAL_PANEL }, () => {
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
      assert.match(r.err, /looks partly installed/, `${unit}: and say the panel is only half there`);
      assert.match(r.err, /no supported panel was detected/, `${unit}: and that nothing can be installed`);
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

/* The changelog is history: every release's section must describe the panels
   as they were IN THAT RELEASE. Before 1.3.0 no release supported PasarGuard or
   Rebecca, so no older section may call them supported; from the release that
   implements a panel on, its section may -- and only because the installer,
   asked above, really implements it. */
function changelogSections() {
  const out = [];
  let cur = null;
  for (const line of read('CHANGELOG.md').split('\n')) {
    const m = line.match(/^## \[?(\d+\.\d+\.\d+)\]?/);
    if (m) { cur = { version: m[1], text: '' }; out.push(cur); continue; }
    if (cur) cur.text += `${line}\n`;
  }
  return out;
}

const semver = (v) => v.split('.').map(Number);
const before = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

test('the changelog calls PasarGuard or Rebecca supported only from the release that implements them', () => {
  const sections = changelogSections();
  assert.ok(sections.some((s) => s.version === '1.3.0'), 'the 1.3.0 section exists');
  for (const { version, text } of sections) {
    const sentences = text.replace(/\n\s*/g, ' ').split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      if (!/PasarGuard|Rebecca/.test(s) || !/\bsupported\b/i.test(s)) continue;
      if (before(version, '1.3.0')) {
        assert.match(s, /\bnot (?:yet )?supported\b|\bunsupported\b|not supported panels/i,
          `${version}: a changelog sentence names PasarGuard/Rebecca as supported before 1.3.0: "${s}"`);
      } else {
        for (const p of ['pasarguard', 'rebecca']) {
          if (new RegExp(p, 'i').test(s) && !/\bnot (?:yet )?supported\b|\bunsupported\b/i.test(s)) {
            assert.ok(INSTALLABLE.includes(p), `${version}: claims ${p} is supported, but the installer does not implement it`);
          }
        }
      }
    }
  }
  const current = sections.find((s) => s.version === '1.3.0').text;
  assert.match(current, /PasarGuard/, 'the 1.3.0 section names PasarGuard');
  assert.match(current, /Rebecca/, 'the 1.3.0 section names Rebecca');
});
