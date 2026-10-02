/* The template store's self-healing.
 *
 * The library reads every selectable design from ONE place,
 * $RT_ROOT/dist/templates/<id>/. A store anywhere else is invisible to it, and
 * the manager then reports "No templates are installed" while the files sit one
 * directory away. Two states reach that on real hosts:
 *
 *   - the store is ABSENT: v1.1.0's updater installs a v1.2.0 library but copies
 *     only four files, so no design arrives with it;
 *   - the store is MISPLACED: a release payload lays its designs out at
 *     templates/<id>/, and a payload copied or extracted over the install root
 *     leaves them at $RT_ROOT/templates, one level above their home.
 *
 * rt_repair_template_store heals both from what the host already has (a verified
 * payload, a misplaced store), and rt_complete_install finishes an install that
 * is still short afterwards from a verified download of the INSTALLED version.
 * Every case below runs against a throwaway RT_ROOT, never a real install.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../tools/build.mjs';
import { availableTemplateIds, TEMPLATES } from '../tools/templates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = availableTemplateIds();
const VERSION = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();

/* Every selectable design, built once. Row is the committed artifact. */
const HTML = Object.fromEntries(IDS.map((id) => [id,
  id === 'row' ? readFileSync(join(ROOT, 'template', 'index.html'), 'utf8') : build(true, id).html]));
const sha = (s) => createHash('sha256').update(s).digest('hex');

/* One design directory, with its sidecar written the way make-release.sh
   writes it (the digest, two spaces, the payload-relative path). */
function writeDesign(dir, id, html = HTML[id]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'template.html'), html);
  writeFileSync(join(dir, 'template.html.sha256'), `${sha(HTML[id])}  templates/${id}/template.html\n`);
}

function writeStore(dir, ids = IDS) {
  for (const id of ids) writeDesign(join(dir, id), id);
}

/* An installed v1.2.0 with NO store: what v1.1.0's updater leaves behind. The
   canonical artifact is Row, the live page exists, branding is set and there
   is one format-1 backup from before the update. */
function prepareInstalled(root) {
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'template.html'), HTML.row);
  writeFileSync(join(root, 'dist', 'template.html.sha256'), sha(HTML.row) + '  template.html\n');
  writeFileSync(join(root, 'sub.html'), HTML.row);
  writeFileSync(join(root, 'VERSION'), VERSION + '\n');
  writeFileSync(join(root, 'config.env'), [
    'RT_CONFIG_VERSION=1',
    'SERVICE_NAME_B64=' + Buffer.from('Test VPN', 'utf8').toString('base64'),
    'SUPPORT_URL_B64=',
    'LOGO_MIME=',
    'LOGO_DATA_B64=',
    '',
  ].join('\n'));
  const bk = join(root, 'backups', '20260101T000000Z__1.1.0');
  mkdirSync(bk, { recursive: true });
  writeFileSync(join(bk, 'template.html'), HTML.row);
  writeFileSync(join(bk, 'template.html.sha256'), sha(HTML.row) + '\n');
  writeFileSync(join(bk, 'VERSION'), '1.1.0\n');
}

/* A release payload of VERSION with every design and the library's companions,
   as tools/make-release.sh lays it out. */
function writePayload(dir, { version = VERSION, ids = IDS } = {}) {
  mkdirSync(join(dir, 'lib'), { recursive: true });
  mkdirSync(join(dir, 'panels'), { recursive: true });
  writeFileSync(join(dir, 'template.html'), HTML.row);
  writeFileSync(join(dir, 'VERSION'), version + '\n');
  copyFileSync(join(ROOT, 'installer', 'lib', 'row-template.sh'), join(dir, 'lib', 'row-template.sh'));
  copyFileSync(join(ROOT, 'installer', 'lib', 'transaction.sh'), join(dir, 'lib', 'transaction.sh'));
  for (const f of readdirSync(join(ROOT, 'installer', 'panels'))) {
    copyFileSync(join(ROOT, 'installer', 'panels', f), join(dir, 'panels', f));
  }
  writeStore(join(dir, 'templates'), ids);
}

/* No release source is reachable unless a test provides one, so nothing here
   can reach the network; a test that needs a download redefines
   rt_fetch_release after these. */
const STUBS = [
  'rt_require_root(){ :; }',
  'rt_detect_xui(){ return 1; }',
  'rt_detect_xui_version(){ return 1; }',
  'rt_detect_xui_db(){ return 1; }',
  'rt_fetch_release(){ return 1; }',
  'trap "rt_cleanup" EXIT',
  '',
].join('\n');

/* Run BODY with the INSTALLED library layout: the library is copied into the
   sandbox's lib/ and sourced from there, so the companion loader looks where a
   real install keeps its companions -- and finds them only if they are there. */
function run(body, { prepare, env } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'row-store-')).replace(/\\/g, '/');
  const root = `${base}/rt`;
  try {
    mkdirSync(join(root, 'lib'), { recursive: true });
    copyFileSync(join(ROOT, 'installer', 'lib', 'row-template.sh'), join(root, 'lib', 'row-template.sh'));
    if (prepare) prepare(root, base);
    const script = [
      'set -Eeuo pipefail',
      'unset RT_TEMPLATE RT_RELEASE_URL RT_RELEASE_DIR RT_ASSUME_YES XUI_DB_FOLDER',
      `export RT_ROOT="${root}" RT_BIN="${base}/row-template"`,
      'BASE="' + base + '"',
      '. "$RT_ROOT/lib/row-template.sh"',
      STUBS,
      body,
    ].join('\n');
    const r = spawnSync('bash', ['-c', script], {
      cwd: ROOT, encoding: 'utf8', env: env ? { ...process.env, ...env } : undefined,
    });
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/* The store's contents as the library itself reads them, plus whether the
   misplaced directory still exists. Printed by the bash side, because the
   sandbox is gone once run() returns. */
const REPORT = [
  'printf "store=%s\\n" "$(rt_template_store_ids | tr "\\n" "," )"',
  'printf "offered=%s\\n" "$(rt_template_offered | wc -l | tr -d " ")"',
  'if rt_template_verify_store; then echo "verified=yes"; else echo "verified=no"; fi',
  '[ -e "$RT_ROOT/templates" ] && echo "misplaced=present" || echo "misplaced=gone"',
].join('\n');

const ALL = IDS.slice().sort().join(',') + ',';
const field = (out, key) => (out.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1];

/* --- the misplaced store ----------------------------------------------------- */

test('a store misplaced at $RT_ROOT/templates is moved into dist/templates and verified', () => {
  const r = run([
    'rc=0; rt_repair_template_store || rc=$?',
    'echo "rc=$rc"',
    REPORT,
    'for id in ' + IDS.join(' ') + '; do',
    '  cmp -s "$RT_TEMPLATE_STORE/$id/template.html" "$BASE/expect/$id/template.html" || echo "differs=$id"',
    'done',
  ].join('\n'), {
    prepare: (root, base) => {
      prepareInstalled(root);
      writeStore(join(root, 'templates'));
      writeStore(join(base, 'expect'));
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'rc'), '0', 'a complete store after repair reports success');
  assert.equal(field(r.out, 'store'), ALL, 'every design is in the canonical store');
  assert.equal(field(r.out, 'offered'), String(IDS.length), 'and the chooser offers every one');
  assert.equal(field(r.out, 'verified'), 'yes');
  assert.equal(field(r.out, 'misplaced'), 'gone', 'the misplaced copy is retired once covered');
  assert.doesNotMatch(r.out, /differs=/, 'the designs are moved byte for byte');
  assert.match(r.out, new RegExp(`moved ${IDS.length} design`), 'the repair says what it did');
});

test('a mixed install is repaired as far as the host allows, then completed from a payload', () => {
  /* The broken layout from the report: two designs at the root, only the
     canonical artifact under dist/. With nothing else on the host the repair
     recovers those two and names the rest; with a payload it completes. */
  const local = run([
    'rc=0; rt_repair_template_store || rc=$?',
    'echo "rc=$rc"',
    'printf "missing=%s\\n" "$(rt_template_store_missing | tr "\\n" ",")"',
    REPORT,
  ].join('\n'), {
    prepare: (root) => { prepareInstalled(root); writeStore(join(root, 'templates'), ['row', 'prism']); },
  });
  assert.equal(local.code, 0, local.err);
  assert.equal(field(local.out, 'rc'), '2', 'an incomplete store is reported as incomplete, not as success');
  assert.equal(field(local.out, 'store'), 'prism,row,');
  assert.equal(field(local.out, 'missing'), IDS.filter((id) => !['row', 'prism'].includes(id)).join(',') + ',',
    'every design still missing is named, in catalogue order');
  assert.equal(field(local.out, 'misplaced'), 'gone');

  const payload = run([
    'rc=0; rt_repair_template_store "$BASE/payload" || rc=$?',
    'echo "rc=$rc"',
    REPORT,
  ].join('\n'), {
    prepare: (root, base) => {
      prepareInstalled(root);
      writeStore(join(root, 'templates'), ['row', 'prism']);
      writePayload(join(base, 'payload'));
    },
  });
  assert.equal(payload.code, 0, payload.err);
  assert.equal(field(payload.out, 'rc'), '0');
  assert.equal(field(payload.out, 'store'), ALL);
  assert.equal(field(payload.out, 'misplaced'), 'gone');
});

test('a corrupt design is detected, replaced from a good copy, and never migrated when it is the copy', () => {
  const r = run([
    'rc=0; rt_repair_template_store 2>"$BASE/err" || rc=$?',
    'echo "rc=$rc"',
    'cat "$BASE/err"',
    REPORT,
    'printf "missing=%s\\n" "$(rt_template_store_missing | tr "\\n" ",")"',
    'cmp -s "$RT_TEMPLATE_STORE/editorial/template.html" "$BASE/good-editorial.html" && echo "editorial=replaced"',
    '[ -e "$RT_TEMPLATE_STORE/prism" ] && echo "prism=staged" || echo "prism=refused"',
  ].join('\n'), {
    prepare: (root, base) => {
      prepareInstalled(root);
      // the canonical store is complete except that editorial was tampered with
      // and prism is missing
      writeStore(join(root, 'dist', 'templates'), IDS.filter((id) => id !== 'prism'));
      writeFileSync(join(root, 'dist', 'templates', 'editorial', 'template.html'), HTML.editorial + 'x');
      // the misplaced store has a good editorial and a corrupt prism
      writeDesign(join(root, 'templates', 'editorial'), 'editorial');
      writeDesign(join(root, 'templates', 'prism'), 'prism', HTML.prism.replace('</html>', '</html><!-- x -->'));
      writeFileSync(join(base, 'good-editorial.html'), HTML.editorial);
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /editorial=replaced/, 'a damaged design is replaced from a copy that verifies');
  assert.match(r.out, /prism=refused/, 'a copy that fails its own checksum is never migrated');
  assert.match(r.out, /prism[^\n]*(checksum|verification)/, 'and the refusal names the design');
  assert.equal(field(r.out, 'rc'), '2');
  assert.equal(field(r.out, 'missing'), 'prism,');
  assert.equal(field(r.out, 'verified'), 'yes', 'what is in the store afterwards all verifies');
});

test('the repair never follows a symlink out of the install root', { skip: platform() !== 'linux' }, () => {
  const r = run([
    'rc=0; rt_repair_template_store 2>/dev/null || rc=$?',
    'echo "rc=$rc"',
    REPORT,
    '[ -f "$BASE/outside/row/template.html" ] && echo "outside=intact"',
  ].join('\n'), {
    prepare: (root, base) => {
      prepareInstalled(root);
      writeStore(join(base, 'outside'), ['row']);
      symlinkSync(join(base, 'outside'), join(root, 'templates'));
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'store'), '', 'nothing is taken through the link');
  assert.match(r.out, /outside=intact/, 'and nothing it points at is removed');
});

test('files the repair does not recognise are left where they are', () => {
  const r = run([
    'rt_repair_template_store >/dev/null 2>&1 || true',
    REPORT,
    '[ -f "$RT_ROOT/templates/notes.txt" ] && echo "notes=kept"',
    '[ -f "$RT_ROOT/templates/Custom/template.html" ] && echo "custom=kept"',
  ].join('\n'), {
    prepare: (root) => {
      prepareInstalled(root);
      writeStore(join(root, 'templates'));
      writeFileSync(join(root, 'templates', 'notes.txt'), 'mine\n');
      mkdirSync(join(root, 'templates', 'Custom'));
      writeFileSync(join(root, 'templates', 'Custom', 'template.html'), 'x');
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'store'), ALL);
  assert.match(r.out, /notes=kept/);
  assert.match(r.out, /custom=kept/);
  assert.equal(field(r.out, 'misplaced'), 'present', 'a directory still holding foreign files stays');
});

/* --- the entry points: install, update, verify ------------------------------- */

test('verify moves a misplaced store and then reports it healthy', () => {
  const r = run('rt_cmd_verify', {
    prepare: (root) => { prepareInstalled(root); writeStore(join(root, 'templates')); },
  });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`moved ${IDS.length} design`));
  assert.match(r.out, new RegExp(`Template store verified \\(${IDS.length} design`));
  assert.doesNotMatch(r.err, /template store missing or empty/);
});

test('verify completes an install the v1.1.0 updater left short, then passes', () => {
  /* The installation guide's own sequence: update, then verify. verify must not
     fail on a state the next step of the same update resolves. */
  const r = run([
    'rt_fetch_release(){ printf "%s" "$BASE/payload"; }',
    'rt_cmd_verify',
  ].join('\n'), {
    prepare: (root, base) => { prepareInstalled(root); writePayload(join(base, 'payload')); },
  });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`Installation completed: ${IDS.length} design`));
  assert.match(r.out, new RegExp(`Template store verified \\(${IDS.length} design`));
  assert.match(r.out, /Installer components present/);
  assert.doesNotMatch(r.err, /template store missing or empty|installer components are missing/);
});

test('verify without a reachable release reports the gap and the remedy', () => {
  const r = run('rt_cmd_verify', { prepare: prepareInstalled });
  assert.equal(r.code, 1, 'an empty store is still a hard failure');
  assert.match(r.err, /could not download/);
  assert.match(r.err, /template store missing or empty; run 'row-template update'/);
});

test('verify names missing and corrupt designs', () => {
  const partial = run('rt_cmd_verify', {
    prepare: (root) => { prepareInstalled(root); writeStore(join(root, 'dist', 'templates'), IDS.slice(0, -2)); },
  });
  assert.equal(partial.code, 0, 'a partial store is a warning: every installed design still works\n' + partial.err);
  assert.match(partial.err, new RegExp(`template store is incomplete[^\\n]*${IDS.at(-2)}[^\\n]*${IDS.at(-1)}`),
    'the missing designs are named');

  const corrupt = run('rt_cmd_verify', {
    prepare: (root) => {
      prepareInstalled(root);
      writeStore(join(root, 'dist', 'templates'));
      writeFileSync(join(root, 'dist', 'templates', 'canvas', 'template.html'), HTML.canvas + 'x');
    },
  });
  assert.equal(corrupt.code, 1, 'a design that fails its checksum is a hard failure');
  assert.match(corrupt.err, /does not match its checksum[^\n]*canvas/, 'and the design is named');
});

test('update moves a misplaced store and keeps every backup it found', () => {
  const r = run([
    'rt_fetch_release(){ printf "%s" "$BASE/payload"; }',
    'rt_cmd_update >/dev/null',
    REPORT,
    '[ -d "$RT_BACKUPS/20260101T000000Z__1.1.0" ] && echo "old-backup=kept"',
  ].join('\n'), {
    prepare: (root, base) => {
      prepareInstalled(root);
      writeStore(join(root, 'templates'));
      writePayload(join(base, 'payload'));
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'store'), ALL);
  assert.equal(field(r.out, 'misplaced'), 'gone');
  assert.match(r.out, /old-backup=kept/);
});

test('install (repair of an existing root) moves a misplaced store', () => {
  const r = run([
    'rt_detect_xui(){ RT_XUI_UNIT="x-ui.service"; return 0; }',
    'rt_detect_xui_version(){ RT_XUI_VERSION="3.7.0"; printf "3.7.0"; }',
    'rt_service_active(){ return 1; }; rt_service_start(){ :; }; rt_service_stop(){ :; }',
    'RT_ASSUME_YES=1 rt_cmd_install "$BASE/payload" </dev/null >/dev/null',
    REPORT,
  ].join('\n'), {
    prepare: (root, base) => {
      prepareInstalled(root);
      writeStore(join(root, 'templates'), ['row', 'canvas']);
      writePayload(join(base, 'payload'));
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'store'), ALL);
  assert.equal(field(r.out, 'misplaced'), 'gone');
});

test('a fresh install never creates a store outside dist/templates', () => {
  const r = run([
    'rt_detect_xui(){ RT_XUI_UNIT="x-ui.service"; return 0; }',
    'rt_detect_xui_version(){ RT_XUI_VERSION="3.7.0"; printf "3.7.0"; }',
    'rt_service_active(){ return 1; }; rt_service_start(){ :; }; rt_service_stop(){ :; }',
    'RT_SERVICE_NAME="Fresh" rt_cmd_install "$BASE/payload" </dev/null >/dev/null',
    REPORT,
  ].join('\n'), {
    prepare: (root, base) => { writePayload(join(base, 'payload')); },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'store'), ALL);
  assert.equal(field(r.out, 'verified'), 'yes');
  assert.equal(field(r.out, 'misplaced'), 'gone');
});

/* --- completing an install the v1.1.0 updater left short ---------------------- */

test('the first run of the new code completes the install from the installed version', () => {
  const r = run([
    'rt_fetch_release(){ echo "fetched $RT_RELEASE_URL" >> "$BASE/fetch.log"; printf "%s" "$BASE/payload"; }',
    'rc=0; rt_complete_install || rc=$?',
    'echo "rc=$rc"',
    REPORT,
    'echo "panels=${RT_PANELS_LOADED:-} txn=${RT_TRANSACTION_LOADED:-}"',
    'rt_installer_complete && echo "complete=yes" || echo "complete=no"',
    'for f in lib/transaction.sh panels/index.sh panels/interface.sh panels/3xui.sh; do',
    '  [ -f "$RT_ROOT/$f" ] || echo "absent=$f"',
    'done',
    'cat "$BASE/fetch.log"',
    'cmp -s "$RT_DIST" "$BASE/payload/template.html" && echo "dist=untouched"',
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"',
  ].join('\n'), {
    prepare: (root, base) => { prepareInstalled(root); writePayload(join(base, 'payload')); },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'rc'), '0');
  assert.equal(field(r.out, 'store'), ALL, 'every design is installed');
  assert.equal(field(r.out, 'offered'), String(IDS.length));
  assert.match(r.out, /panels=1 txn=1/, 'the installer components load in the same run');
  assert.equal(field(r.out, 'complete'), 'yes');
  assert.doesNotMatch(r.out, /absent=/);
  assert.match(r.out, new RegExp(`fetched https://github\\.com/frank0live/row-template/releases/download/v${VERSION.replace(/\./g, '\\.')}$`, 'm'),
    'the download is pinned to the INSTALLED version, never "latest"');
  assert.match(r.out, /dist=untouched/, 'the live design is not changed');
  assert.equal(field(r.out, 'name'), 'Test VPN', 'branding is not touched');
});

test('completion honours an explicit release source and refuses a different version', () => {
  const r = run([
    'export RT_RELEASE_DIR="$BASE/other"',
    'rt_fetch_release(){ echo "source=dir:${RT_RELEASE_DIR:-} url:${RT_RELEASE_URL:-}" >> "$BASE/fetch.log"; return 1; }',
    'rc=0; rt_complete_install 2>"$BASE/err" || rc=$?',
    'echo "rc=$rc"',
    'cat "$BASE/fetch.log"',
    'unset RT_RELEASE_DIR',
    'rt_fetch_release(){ printf "%s" "$BASE/payload"; }',
    'rc=0; rt_complete_install 2>>"$BASE/err" || rc=$?',
    'echo "rc2=$rc"',
    'cat "$BASE/err"',
    REPORT,
  ].join('\n'), {
    prepare: (root, base) => { prepareInstalled(root); writePayload(join(base, 'payload'), { version: '9.9.9' }); },
  });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^source=dir:\S*\/other url:$/m, 'RT_RELEASE_DIR is used as given, not replaced by a pinned URL');
  assert.equal(field(r.out, 'rc'), '1', 'an unreachable source leaves the install incomplete, reported');
  assert.equal(field(r.out, 'rc2'), '1');
  assert.match(r.out, /9\.9\.9/, 'a payload of another version is refused, and says so');
  assert.equal(field(r.out, 'store'), '', 'nothing is staged from it');
});

test('completion does nothing, and downloads nothing, on a complete install', () => {
  const r = run([
    'rt_fetch_release(){ echo "FETCHED"; return 1; }',
    'rc=0; rt_complete_install || rc=$?',
    'echo "rc=$rc"',
  ].join('\n'), {
    prepare: (root) => {
      prepareInstalled(root);
      writeStore(join(root, 'dist', 'templates'));
      mkdirSync(join(root, 'panels'), { recursive: true });
      copyFileSync(join(ROOT, 'installer', 'lib', 'transaction.sh'), join(root, 'lib', 'transaction.sh'));
      for (const f of readdirSync(join(ROOT, 'installer', 'panels'))) {
        copyFileSync(join(ROOT, 'installer', 'panels', f), join(root, 'panels', f));
      }
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'rc'), '0');
  assert.doesNotMatch(r.out, /FETCHED/);
  assert.equal(r.err, '', 'and prints nothing');
});

test('completion from a misplaced store needs no download', () => {
  const r = run([
    'rt_fetch_release(){ echo "FETCHED"; printf "%s" "$BASE/payload"; }',
    'rt_complete_install >/dev/null 2>&1 || true',
    REPORT,
  ].join('\n'), {
    prepare: (root, base) => {
      prepareInstalled(root);
      writeStore(join(root, 'templates'));
      // the companions are present, so the store is the only gap
      mkdirSync(join(root, 'panels'), { recursive: true });
      copyFileSync(join(ROOT, 'installer', 'lib', 'transaction.sh'), join(root, 'lib', 'transaction.sh'));
      for (const f of readdirSync(join(ROOT, 'installer', 'panels'))) {
        copyFileSync(join(ROOT, 'installer', 'panels', f), join(root, 'panels', f));
      }
      writePayload(join(base, 'payload'));
    },
  });
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /FETCHED/, 'the host already had every design');
  assert.equal(field(r.out, 'store'), ALL);
});

/* --- what the operator sees ------------------------------------------------- */

test('Reconfigure branding -> Template offers every design after a v1.1.0 update', () => {
  /* The report, reproduced: the store is absent, the chooser is opened. It must
     complete the install and list every design -- not tell the operator to
     re-run the installer. */
  const r = run([
    'rt_fetch_release(){ printf "%s" "$BASE/payload"; }',
    'rt_reconfig_template </dev/null 2>&1',
  ].join('\n'), {
    prepare: (root, base) => { prepareInstalled(root); writePayload(join(base, 'payload')); },
  });
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /No templates are installed/);
  for (const id of IDS) {
    assert.match(r.out, new RegExp(`^\\s*\\d+\\s+${TEMPLATES[id].name}$`, 'm'), `${TEMPLATES[id].name} is offered`);
  }
});

test('the manager completes the install when it opens, before the operator picks anything', () => {
  const r = run([
    'rt_fetch_release(){ printf "%s" "$BASE/payload"; }',
    'rt_manager_main </dev/null >/dev/null 2>&1',
    REPORT,
    'rt_installer_complete && echo "complete=yes" || echo "complete=no"',
  ].join('\n'), {
    prepare: (root, base) => { prepareInstalled(root); writePayload(join(base, 'payload')); },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'store'), ALL);
  assert.equal(field(r.out, 'complete'), 'yes');
});

test('a branding change works on an install the v1.1.0 updater left short', () => {
  /* Without a store the branding write cannot reconcile the selection (Row) and
     is refused. `row-template config` completes the install first. */
  const r = run([
    'rt_fetch_release(){ printf "%s" "$BASE/payload"; }',
    'RT_ASSUME_NONINTERACTIVE=1 RT_SERVICE_NAME="Renamed" rt_cmd_config </dev/null >/dev/null',
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"',
    REPORT,
  ].join('\n'), {
    prepare: (root, base) => { prepareInstalled(root); writePayload(join(base, 'payload')); },
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'name'), 'Renamed');
  assert.equal(field(r.out, 'store'), ALL);
});

test('the library never creates dist/templates just by loading', () => {
  const r = run('[ -e "$RT_TEMPLATE_STORE" ] && echo "store=created" || echo "store=absent"', {
    prepare: prepareInstalled,
  });
  assert.equal(r.code, 0, r.err);
  assert.equal(field(r.out, 'store'), 'absent');
});
