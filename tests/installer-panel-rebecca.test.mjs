/* The Rebecca panel adapter (1.3.0) and the installer flows that drive it.
 *
 * Every case runs the SHIPPING code against a fake host laid out like the
 * official Rebecca installer's (tests/helpers/panel-hosts.mjs). Rebecca's
 * database is a REAL SQLite file with Rebecca's own table layout, and every
 * statement the adapter runs is executed on it (sqlite3 is doubled by Python's
 * sqlite3 module only because this host has no sqlite3 binary).
 *
 * What is proven: detection needs two signals; only a sqlite: database is ever
 * touched, and a MySQL URL is never read out loud; activation changes exactly
 * two columns of exactly the row Rebecca reads; NULL, '' and a value are
 * restored exactly, by rollback and by uninstall; an operator's own directory
 * and page are respected; without database access activation is honestly
 * manual; SQL built from panel data cannot be broken by a quote; a foreign
 * page, a bad restore record, a page for another panel and a backup from
 * another panel are all refused; secrets never leave .env; and the full life
 * cycle works end to end without Rebecca ever being restarted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bashRun, makePayload, rebeccaHost, rebeccaRow, HOST_PREAMBLE, posix,
} from './helpers/panel-hosts.mjs';

const PAYLOAD_DIR = mkdtempSync(join(tmpdir(), 'row-rb-payload-'));
const PAYLOAD = makePayload(PAYLOAD_DIR, { ids: ['row', 'editorial'] });
process.on('exit', () => rmSync(PAYLOAD_DIR, { recursive: true, force: true }));

const SETUP = [
  'RT_ACTIVE_PANEL=rebecca',
  'rt_layout_ensure',
  'rt_repair_template_store "$PAYLOAD" >/dev/null || [ $? -eq 2 ]',
  'rt_set_dist "$RT_TEMPLATE_STORE/row/template.html"',
  'rt_config_write "Test VPN" "" "" ""',
  'rt_activate',
].join('\n');

function withHost(opts, fn) {
  const base = mkdtempSync(join(tmpdir(), 'row-rb-'));
  try {
    const host = rebeccaHost(base, opts);
    const rt = join(base, 'rt');
    const run = (lines, env = {}) => bashRun([HOST_PREAMBLE, ...[].concat(lines)],
      { paths: { ...host.paths, RT_ROOT: rt, RT_BIN: join(base, 'row-template'), PAYLOAD }, env });
    return fn({ base, host, rt, run });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const page = (dir) => join(dir, 'row-template', 'index.html');
const last = (host) => rebeccaRow(host.db).at(-1);

/* --- detection and the database ------------------------------------------- */

test('detection needs two independent signals', () => {
  const cases = [
    [{}, 0, 'the official layout'],
    [{ compose: false, cli: false }, 0, '.env and the data directory'],
  ];
  for (const [opts, want, label] of cases) {
    withHost(opts, ({ run }) => {
      const r = run('rc=0; rt_panel_detect rebecca || rc=$?; echo "rc=$rc"');
      assert.match(r.out, new RegExp(`rc=${want}`), `${label}\n${r.err}`);
    });
  }
  withHost({ compose: false, cli: false }, ({ host, run }) => {
    rmSync(host.envFile);
    const r = run('rc=0; rt_panel_detect rebecca || rc=$?; echo "rc=$rc"');
    assert.match(r.out, /rc=1/, 'the data directory alone is one signal: FAILURE');
  });
});

test('capabilities are exactly what the adapter implements', () => {
  withHost({}, ({ run }) => {
    const r = run('rt_panel_capabilities rebecca');
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, ['db_activation', 'file_placement', 'selection_read', 'selection_write', 'static_verify'].join('\n'));
  });
});

test('only a sqlite: database inside the shared data directory is ever used', () => {
  withHost({}, ({ host, run }) => {
    let r = run('rt_panel_rebecca_db');
    assert.equal(r.out, posix(host.db), 'the official sqlite URL resolves to the database');
    const setUrl = (url) => writeFileSync(host.envFile, `SUDO_PASSWORD = "x"\nSQLALCHEMY_DATABASE_URL = "${url}"\n`);
    for (const url of ['mysql+pymysql://rebecca:Sup3rS3cret@127.0.0.1:3306/rebecca',
      'sqlite:///db.sqlite3', 'sqlite:////etc/elsewhere/db.sqlite3']) {
      setUrl(url);
      r = run('rc=0; rt_panel_rebecca_db || rc=$?; echo "rc=$rc"; rc=0; rt_panel_status rebecca; echo');
      assert.match(r.out, /rc=1/, `${url} must not be used`);
      assert.match(r.out, /manual/, 'activation becomes manual');
      assert.equal(r.out.includes('Sup3rS3cret') || r.err.includes('Sup3rS3cret'), false, 'a password is never printed');
    }
  });
});

/* --- activation, rollback, uninstall ------------------------------------- */

test('activation sets two columns of the newest row and nothing else, with no restart', () => {
  withHost({ rows: 2 }, ({ host, run }) => {
    const before = rebeccaRow(host.db);
    const r = run([SETUP, 'rc=0; rt_transaction_run rebecca "$RT_LIVE" || rc=$?; echo "rc=$rc"',
      'rc=0; rt_panel_verify rebecca static || rc=$?; echo "static=$rc"']);
    assert.match(r.out, /rc=0/, r.err);
    assert.match(r.out, /static=0/, r.err);
    const after = rebeccaRow(host.db);
    assert.deepEqual(after[0], before[0], 'an older row is untouched');
    const want = [...before[1]];
    want[1] = 'row-template/index.html';
    want[2] = posix(join(host.dataDir, 'templates'));
    assert.deepEqual(after[1], want, 'exactly the page and directory columns of the row Rebecca reads');
    assert.equal(existsSync(page(join(host.dataDir, 'templates'))), true, 'the page is placed');
    const calls = existsSync(join(host.docker, 'calls')) ? readFileSync(join(host.docker, 'calls'), 'utf8').split(/\r?\n/) : [];
    assert.equal(calls.some((l) => l.startsWith('compose')), false, 'Rebecca is never restarted');
  });
});

test('rollback and uninstall restore NULL, empty and a value exactly', () => {
  for (const customDir of [null, '']) {
    withHost({ customDir }, ({ host, run }) => {
      const before = last(host);
      run([SETUP, 'rt_transaction_run rebecca "$RT_LIVE" 2>/dev/null',
        'printf "%s\\n" "$(basename "$RT_TXN_SNAPSHOT")" > "$RT_PANEL_ACTIVATION"']);
      assert.equal(last(host)[1], 'row-template/index.html');
      const r = run(['RT_ACTIVE_PANEL=rebecca', 'rt_panel_uninstall_template rebecca; echo "rc=$?"']);
      assert.match(r.out, /rc=0/, r.err);
      assert.deepEqual(last(host), before, `custom_templates_directory ${JSON.stringify(customDir)} is restored exactly`);
      assert.equal(existsSync(join(host.dataDir, 'templates')), false, 'the page and the directory it needed are removed');
    });
  }
  withHost({ customDir: '' }, ({ host, run }) => {
    const before = last(host);
    writeFileSync(join(host.docker, 'unused'), '');
    const r = run([SETUP, 'rc=0',
      // a failure after the change: the placed page is sabotaged so the
      // post-change static verification fails and the engine rolls back
      'rt_panel_rebecca_place_orig="$(declare -f rt_panel_rebecca_place)"',
      'rt_panel_rebecca_place() { eval "${rt_panel_rebecca_place_orig/rt_panel_rebecca_place/rt_orig_place}"; rt_orig_place "$@" && printf "tampered" >> "$2/row-template/index.html"; }',
      'out="$(rt_panel_activate)" || rc=$?; echo "rc=$rc out=$out"']);
    assert.match(r.out, /rc=1 out=$/, r.err);
    assert.deepEqual(last(host), before, "rollback restores '' exactly, not NULL");
    assert.match(r.err, /Rebecca was restored exactly to its state before the attempt/,
      'the operator is told the truth: the restore was exact');
    assert.doesNotMatch(r.err, /rollback also failed/, "and not the engine's conservative post-check");
    assert.match(r.err, /placed page differs/, 'the real cause is shown');
  });
});

test('an operator directory is used and kept; only the page column changes', () => {
  withHost({}, ({ host, run }) => {
    const own = join(host.dataDir, 'my templates');
    mkdirSync(join(own, 'subscription'), { recursive: true });
    writeFileSync(join(own, 'subscription', 'index.html'), 'operator page');
    run(`python=1; true`);
    const ownPosix = posix(own);
    const r0 = run(`sqlite3 "$(cygpath -u '${host.db.split('\\').join('/')}' 2>/dev/null || printf '%s' '${host.db.split('\\').join('/')}')" "UPDATE subscription_settings SET custom_templates_directory = '${ownPosix}'"`,
      { RT_TEST_PYTHON: undefined });
    assert.equal(r0.code, 0, r0.err);
    const before = last(host);
    const r = run([SETUP, 'rc=0; rt_transaction_run rebecca "$RT_LIVE" 2>/dev/null || rc=$?; echo "rc=$rc"',
      'printf "%s\\n" "$(basename "$RT_TXN_SNAPSHOT")" > "$RT_PANEL_ACTIVATION"']);
    assert.match(r.out, /rc=0/, r.err);
    assert.equal(last(host)[2], ownPosix, 'the operator directory is kept');
    assert.equal(existsSync(page(own)), true, 'the page goes into it');
    assert.equal(readFileSync(join(own, 'subscription', 'index.html'), 'utf8'), 'operator page');
    run('rt_panel_uninstall_template rebecca');
    assert.deepEqual(last(host), before);
    assert.equal(existsSync(own), true, 'the operator directory stays');
    assert.equal(existsSync(join(own, 'row-template')), false);
  });
});

test('a quote in panel data cannot break the SQL', () => {
  withHost({ customDir: "/srv/it's here" }, ({ host, run }) => {
    const before = last(host);
    // the directory is outside the shared data dir, so activation is refused
    // -- but reading and restoring it goes through the quoting all the same
    const r = run([SETUP, 'rt_panel_rebecca_db_ready', 'rt_panel_rebecca_dir_get; echo',
      'rt_panel_rebecca_write "x\'); DROP TABLE admins; --" present "$(rt_panel_rebecca_dir_get | cut -d: -f2-)"',
      'rt_panel_rebecca_page_get; echo']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /present:\/srv\/it's here/);
    assert.match(r.out, /x'\); DROP TABLE admins; --/, 'the value is stored as data');
    assert.equal(last(host)[2], before[2], 'the quoted directory round-trips');
    const tables = run(`sqlite3 "$(cygpath -u '${host.db.split('\\').join('/')}' 2>/dev/null || printf '%s' '${host.db.split('\\').join('/')}')" "SELECT count(*) FROM admins"`);
    assert.equal(tables.code, 0, 'the admins table still exists');
  });
});

test('uninstall without an activation record returns Rebecca to its default page', () => {
  withHost({}, ({ host, run }) => {
    const before = last(host);
    run([SETUP, 'rt_transaction_run rebecca "$RT_LIVE" 2>/dev/null', 'rm -f "$RT_PANEL_ACTIVATION"']);
    const r = run('rt_panel_uninstall_template rebecca; echo "rc=$?"');
    assert.match(r.out, /rc=0/, r.err);
    assert.deepEqual(last(host), before, "the default page, and NULL for the directory Row-Template set");
  });
});

test('an operator who moved away from Row-Template keeps their choice on uninstall', () => {
  withHost({}, ({ host, run }) => {
    run([SETUP, 'rt_transaction_run rebecca "$RT_LIVE" 2>/dev/null']);
    const db = `"$(cygpath -u '${host.db.split('\\').join('/')}' 2>/dev/null || printf '%s' '${host.db.split('\\').join('/')}')"`;
    run(`sqlite3 ${db} "UPDATE subscription_settings SET subscription_page_template = 'mine/page.html'"`);
    const chosen = last(host);
    const r = run('rt_panel_uninstall_template rebecca; echo "rc=$?"');
    assert.match(r.out, /rc=0/, r.err);
    assert.deepEqual(last(host), chosen, 'the selection is theirs and is left alone');
    assert.equal(existsSync(page(join(host.dataDir, 'templates'))), false, 'our page is still removed');
  });
});

test('admins who override the page for their users are reported by verify', () => {
  withHost({ admins: ['{"subscription_page_template": "vip/index.html"}', '{}', '{"custom_templates_directory":"/x"}'] }, ({ run }) => {
    const r = run([SETUP, 'rt_transaction_run rebecca "$RT_LIVE" 2>/dev/null', 'rt_panel_verify rebecca static; echo "rc=$?"']);
    assert.match(r.out, /rc=0/);
    assert.match(r.err, /2 admin\(s\) override the subscription page/);
  });
});

/* --- refusals: a foreign page, a bad record, a tampered page -------------------- */

test('a page that is not Row-Template\'s is never overwritten, and the failed activation changes nothing', () => {
  withHost({}, ({ host, run }) => {
    const before = last(host);
    const tpl = join(host.dataDir, 'templates');
    mkdirSync(join(tpl, 'row-template'), { recursive: true });
    writeFileSync(page(tpl), '<p>someone else</p>');
    const r = run([SETUP, 'rc=0; rt_transaction_run rebecca "$RT_LIVE" || rc=$?; echo "rc=$rc"']);
    assert.match(r.out, /rc=1/, r.err);
    assert.match(r.err, /exists and is not Row-Template's/);
    assert.equal(readFileSync(page(tpl), 'utf8'), '<p>someone else</p>', 'the operator file is untouched');
    assert.deepEqual(last(host), before, 'the settings row is untouched');
  });
});

test('restore refuses a record that lists a file this adapter never places', () => {
  withHost({}, ({ run }) => {
    const r = run([SETUP,
      'rt_transaction_stage_reset', 'rt_panel_backup_state rebecca',
      'printf "../../etc/passwd\\n" > "$RT_PANEL_STAGE/rebecca/files"',
      'snap="$(rt_backup_create v2 rebecca 2>/dev/null)" || { echo "snapshot-refused"; exit 0; }',
      'rc=0; rt_panel_restore_state rebecca "$snap" || rc=$?; echo "rc=$rc"']);
    assert.match(r.out, /snapshot-refused|rc=1/, r.err);
  });
});

test('verify fails a placed page that was changed, and a selection that was moved away', () => {
  withHost({}, ({ host, run }) => {
    run([SETUP, 'rt_transaction_run rebecca "$RT_LIVE" 2>/dev/null']);
    const tpl = join(host.dataDir, 'templates');
    const good = readFileSync(page(tpl));
    writeFileSync(page(tpl), good.toString().replace('Test VPN', 'Tampered'));
    let r = run('rc=0; rt_panel_verify rebecca static || rc=$?; echo "rc=$rc"');
    assert.match(r.out, /rc=1/);
    assert.match(r.err, /placed page differs/);
    writeFileSync(page(tpl), good);
    const db = `"$(cygpath -u '${host.db.split('\\').join('/')}' 2>/dev/null || printf '%s' '${host.db.split('\\').join('/')}')"`;
    run(`sqlite3 ${db} "UPDATE subscription_settings SET subscription_page_template = 'subscription/index.html'"`);
    r = run('rc=0; rt_panel_verify rebecca static || rc=$?; echo "rc=$rc"');
    assert.match(r.out, /rc=1/);
    assert.match(r.err, /does not select the Row-Template page/);
  });
});

test('secrets in .env never reach output, logs or snapshots', () => {
  withHost({}, ({ rt, run }) => {
    const r = run([SETUP, 'rt_transaction_run rebecca "$RT_LIVE"', 'rt_panel_verify rebecca static',
      'rt_panel_verify rebecca live', 'rt_panel_status rebecca', 'rt_panel_uninstall_template rebecca']);
    const secret = 'rebecca-secret-do-not-leak';
    assert.equal(r.out.includes(secret) || r.err.includes(secret), false, 'not in output');
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of existsSync(rt) ? walk(rt) : []) {
      assert.equal(readFileSync(f).includes(secret), false, `not in ${f}`);
    }
  });
});

/* --- the artifact must fit the panel ---------------------------------------- */

test('a 3X-UI artifact, a PasarGuard page, or a shell from before 1.3.0, is refused on Rebecca', () => {
  withHost({}, ({ base, run }) => {
    const old = join(base, 'old-shell.html');
    const shell = readFileSync(join(PAYLOAD, 'shells', 'rebecca', 'row', 'shell.html'), 'utf8');
    // a 1.2.x shell: the same layout without the context prelude and escaping
    writeFileSync(old, shell.replace('Row-Template, Rebecca page context', '')
      .replace('{%- autoescape on -%}', '').replace('{%- endautoescape %}', ''));
    const u = (p) => `"$(cygpath -u ${JSON.stringify(p.split('\\').join('/'))} 2>/dev/null || printf '%s' ${JSON.stringify(p.split('\\').join('/'))})"`;
    const r = run([SETUP,
      'rc=0; rt_set_dist "$PAYLOAD/template.html" 2>/dev/null || rc=$?; echo "xui=$rc"',
      'rc=0; rt_set_dist "$PAYLOAD/shells/pasarguard/row/shell.html" 2>/dev/null || rc=$?; echo "pg=$rc"',
      `rc=0; rt_set_dist ${u(old)} 2>/dev/null || rc=$?; echo "old=$rc"`,
      'rc=0; rt_set_dist "$RT_TEMPLATE_STORE/editorial/template.html" || rc=$?; echo "ok=$rc"']);
    assert.match(r.out, /xui=1/, 'the 3X-UI artifact is refused');
    assert.match(r.out, /pg=1/, 'a PasarGuard page is refused');
    assert.match(r.out, /old=1/, 'a shell without the prelude and escaping is refused');
    assert.match(r.out, /ok=0/, `a 1.3.0 Rebecca page is accepted\n${r.err}`);
  });
});

test('a backup made for another panel is never restored onto Rebecca', () => {
  withHost({}, ({ run }) => {
    const r = run([SETUP,
      'B="$(rt_backup_create)"',
      'sed -i "s/^panel=rebecca$/panel=pasarguard/" "$B/meta"',
      'rc=0; rt_restore_from_backup "$B" 2>/dev/null || rc=$?; echo "rc=$rc"',
      'B2="$(rt_backup_create)"; grep -c "^panel=rebecca$" "$B2/meta"']);
    assert.match(r.out, /rc=1/, 'refused');
    assert.match(r.out, /\n1$/, 'and a Rebecca backup records its panel');
  });
});

/* --- manual activation --------------------------------------------------------- */

test('without sqlite3, activation places the page and says exactly what to set', () => {
  withHost({ sqlite: false }, ({ host, run }) => {
    const before = last(host);
    const r = run([SETUP, 'rt_panel_status rebecca; echo', 'out="$(rt_panel_activate)"; echo "outcome=$out"', 'rt_panel_manual_steps']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^manual/m);
    assert.match(r.out, /outcome=manual/);
    assert.match(r.out, /Subscription page template:\s+row-template\/index.html/);
    assert.equal(existsSync(page(join(host.dataDir, 'templates'))), true, 'the page is in place for the operator to select');
    assert.deepEqual(last(host), before, 'and the database was not touched');
  });
});

/* --- the whole life cycle ------------------------------------------------------ */

test('install, verify, rebrand, switch design, roll back and uninstall on a Rebecca host', () => {
  withHost({}, ({ base, host, rt, run }) => {
    const rowBefore = last(host);
    const tpl = join(host.dataDir, 'templates');
    let r = run(['export RT_ASSUME_NONINTERACTIVE=1 RT_SERVICE_NAME="Aurora Net" RT_SUPPORT_URL="" RT_LOGO_REMOVE=1',
      'rt_cmd_install "$PAYLOAD" </dev/null']);
    assert.equal(r.code, 0, `install\n${r.out}\n${r.err}`);
    assert.match(r.out, /Rebecca now serves the Row-Template page/);
    assert.equal(readFileSync(join(rt, 'PANEL'), 'utf8'), 'rebecca\n');
    assert.ok(readFileSync(page(tpl), 'utf8').includes('Aurora Net'));
    assert.equal(last(host)[1], 'row-template/index.html');

    r = run('rt_cmd_verify');
    assert.equal(r.code, 0, `verify\n${r.out}\n${r.err}`);
    assert.match(r.out, /Rebecca selects the Row-Template page, and the placed page is current/);

    r = run(['export RT_ASSUME_NONINTERACTIVE=1 RT_SERVICE_NAME="Borealis"', 'rt_cmd_config </dev/null']);
    assert.equal(r.code, 0, `config\n${r.err}`);
    assert.ok(readFileSync(page(tpl), 'utf8').includes('Borealis'));

    r = run('rt_switch_template editorial');
    assert.equal(r.code, 0, `switch\n${r.err}`);
    assert.match(readFileSync(page(tpl), 'utf8'), /data-template="editorial"/);

    r = run('rt_cmd_rollback --auto');
    assert.equal(r.code, 0, `rollback\n${r.err}`);
    assert.doesNotMatch(readFileSync(page(tpl), 'utf8'), /data-template="editorial"/);

    r = run('RT_ASSUME_YES=1 rt_cmd_uninstall');
    assert.equal(r.code, 0, `uninstall\n${r.out}\n${r.err}`);
    assert.match(r.out, /Rebecca is back on the subscription page it had before Row-Template/);
    assert.deepEqual(last(host), rowBefore, 'the settings row is exactly as it was');
    assert.equal(existsSync(tpl), false);
    assert.equal(existsSync(rt), false);
    assert.equal(existsSync(join(base, 'row-template')), false);
    assert.ok(readdirSync(host.dataDir).includes('db.sqlite3'), 'the database is still there');
  });
});
