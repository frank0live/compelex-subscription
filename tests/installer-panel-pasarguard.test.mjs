/* The PasarGuard panel adapter (1.3.0) and the installer flows that drive it.
 *
 * Every case runs the SHIPPING code -- installer/panels/pasarguard.sh behind
 * the frozen interface, the transaction engine, the library -- against a fake
 * host laid out like the official PasarGuard installer's (tests/helpers/
 * panel-hosts.mjs). Only `docker` is doubled, by a shim that loads .env the way
 * Docker Compose does, so "the running container uses our page" is a real
 * question with a real answer.
 *
 * What is proven, in order: detection needs two signals; .env is read the way
 * dotenv reads it; activation places exactly one file and appends exactly one
 * block; everything is restored BYTE-EXACT (uninstall and rollback alike); the
 * panel is restarted only when it was running and only when its environment
 * changed; operator files and lines are never touched; secrets never leave
 * .env; and the full install -> verify -> branding -> design switch -> rollback
 * -> uninstall life cycle works end to end.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bashRun, makePayload, pasarguardHost, HOST_PREAMBLE, sha256, PG_ENV,
} from './helpers/panel-hosts.mjs';

const PAYLOAD_DIR = mkdtempSync(join(tmpdir(), 'row-pg-payload-'));
const PAYLOAD = makePayload(PAYLOAD_DIR, { ids: ['row', 'editorial'] });
process.on('exit', () => rmSync(PAYLOAD_DIR, { recursive: true, force: true }));

/* A Row-Template install on a PasarGuard host, up to a generated page -- the
   state activation starts from. */
const SETUP = [
  'RT_ACTIVE_PANEL=pasarguard',
  'rt_layout_ensure',
  'rt_repair_template_store "$PAYLOAD" >/dev/null || [ $? -eq 2 ]',
  'rt_set_dist "$RT_TEMPLATE_STORE/row/template.html"',
  'rt_config_write "Test VPN" "" "" ""',
  'rt_activate',
].join('\n');

function withHost(opts, fn) {
  const base = mkdtempSync(join(tmpdir(), 'row-pg-'));
  try {
    const host = pasarguardHost(base, opts);
    const rt = join(base, 'rt');
    const run = (lines) => bashRun([HOST_PREAMBLE, ...[].concat(lines)],
      { paths: { ...host.paths, RT_ROOT: rt, RT_BIN: join(base, 'row-template'), PAYLOAD } });
    return fn({ base, host, rt, run });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const page = (host, root = join(host.dataDir, 'templates')) => join(root, 'row-template', 'index.html');
const restarts = (host) => (existsSync(join(host.docker, 'restarts'))
  ? readFileSync(join(host.docker, 'restarts'), 'utf8').split('\n').filter(Boolean).length : 0);
const containerEnv = (host) => (existsSync(join(host.docker, 'container.env'))
  ? readFileSync(join(host.docker, 'container.env'), 'utf8') : '');

/* --- detection ----------------------------------------------------------------- */

test('detection needs two independent signals', () => {
  const cases = [
    [{}, 0, 'the official layout'],
    [{ compose: false, cli: false }, 0, '.env and the data directory'],
    [{ compose: false, cli: false, data: false }, 1, '.env alone is one signal: FAILURE, not a guess'],
    [{ env: null, compose: false, cli: false }, 1, 'the data directory alone'],
    [{ env: null, compose: false, cli: false, data: false }, 3, 'nothing: NOT_APPLICABLE'],
  ];
  for (const [opts, want, label] of cases) {
    withHost(opts, ({ run }) => {
      const r = run('rc=0; rt_panel_detect pasarguard || rc=$?; echo "rc=$rc"');
      assert.match(r.out, new RegExp(`rc=${want}`), `${label}\n${r.err}`);
    });
  }
});

test('capabilities are exactly what the adapter implements', () => {
  withHost({}, ({ run }) => {
    const r = run('rt_panel_capabilities pasarguard');
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, ['env_activation', 'file_placement', 'live_verify', 'selection_read',
      'selection_write', 'service_control', 'static_verify'].join('\n'));
  });
});

/* --- .env, read as dotenv reads it ------------------------------------------ */

test('rt_dotenv_get reads a value the way dotenv does, and never evaluates it', () => {
  withHost({}, ({ base, run }) => {
    const f = join(base, 'sample.env');
    writeFileSync(f, [
      'A=plain', 'B = "spaced and quoted"', "C='single'", 'export D=exported',
      'E=unquoted # a comment', 'F="kept # inside quotes"', 'G=first', 'G=last',
      '# H=commented', 'I=', 'J=$(touch /tmp/row-pwned)', 'K=a\r', '',
    ].join('\n'));
    const r = run([
      `F=${JSON.stringify(f.split('\\').join('/'))}; F="$(cygpath -u "$F" 2>/dev/null || printf '%s' "$F")"`,
      'for k in A B C D E F G H I J K Z; do rc=0; v="$(rt_dotenv_get "$F" "$k")" || rc=$?; printf "%s=[%s] rc=%s\\n" "$k" "$v" "$rc"; done',
    ]);
    assert.equal(r.code, 0, r.err);
    for (const line of ['A=[plain] rc=0', 'B=[spaced and quoted] rc=0', 'C=[single] rc=0', 'D=[exported] rc=0',
      'E=[unquoted] rc=0', 'F=[kept # inside quotes] rc=0', 'G=[last] rc=0', 'H=[] rc=3', 'I=[] rc=0',
      'J=[$(touch /tmp/row-pwned)] rc=0', 'K=[a] rc=0', 'Z=[] rc=3']) {
      assert.ok(r.out.includes(line), `expected ${line}\n${r.out}`);
    }
  });
});

/* --- activation, and its exact inverse --------------------------------------- */

test('activation places one page, appends one block, restarts once; uninstall restores .env byte for byte', () => {
  withHost({}, ({ host, run }) => {
    const before = readFileSync(host.envFile);
    const r = run([SETUP, 'rt_transaction_run pasarguard "$RT_LIVE" 2>&1 | grep -v "^transaction:" || true',
      'echo "state=$RT_TXN_STATE"',
      'rc=0; rt_panel_verify pasarguard static || rc=$?; echo "static=$rc"',
      'rc=0; rt_panel_verify pasarguard live || rc=$?; echo "live=$rc"']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /static=0/, r.err);
    assert.match(r.out, /live=0/, `the recreated container reads the new page\n${r.err}`);

    const env = readFileSync(host.envFile, 'utf8');
    assert.ok(env.startsWith(before.toString()), 'every original byte is kept, in place');
    const block = env.slice(before.length);
    assert.match(block, /^# >>> row-template \(managed by Row-Template; do not edit\) nl=0 >>>\n/);
    assert.match(block, new RegExp(`CUSTOM_TEMPLATES_DIRECTORY = ".*/var/lib/pasarguard/templates"\\n`));
    assert.match(block, /SUBSCRIPTION_PAGE_TEMPLATE = "row-template\/index.html"\n# <<< row-template <<<\n$/);
    assert.equal(existsSync(page(host)), true, 'the page is placed');
    assert.equal(readdirSync(join(host.dataDir, 'templates')).join(','), 'row-template', 'and nothing else');
    assert.equal(restarts(host), 1, 'the running panel is restarted exactly once');
    assert.match(containerEnv(host), /SUBSCRIPTION_PAGE_TEMPLATE=row-template\/index.html/);

    const u = run(['RT_ACTIVE_PANEL=pasarguard', 'rt_panel_uninstall_template pasarguard; echo "rc=$?"']);
    assert.match(u.out, /rc=0/, u.err);
    assert.equal(sha256(readFileSync(host.envFile)), sha256(before), '.env is back byte for byte');
    assert.equal(existsSync(join(host.dataDir, 'templates')), false, 'the directories Row-Template created are gone');
    assert.equal(restarts(host), 2, 'and the panel restarted onto its own page');
    assert.doesNotMatch(containerEnv(host), /row-template/);
  });
});

test('an operator CUSTOM_TEMPLATES_DIRECTORY is used, not overridden', () => {
  withHost({}, ({ host, run }) => {
    const own = join(host.dataDir, 'my-templates');
    mkdirSync(join(own, 'subscription'), { recursive: true });
    writeFileSync(join(own, 'subscription', 'index.html'), 'operator page');
    const ownPosix = run(`printf '%s' "$(cygpath -u '${own.split('\\').join('/')}' 2>/dev/null || printf '%s' '${own.split('\\').join('/')}')"`).out;
    writeFileSync(host.envFile, `${PG_ENV}CUSTOM_TEMPLATES_DIRECTORY = "${ownPosix}/"\n`);
    const before = readFileSync(host.envFile);
    const r = run([SETUP, 'rc=0; rt_transaction_run pasarguard "$RT_LIVE" 2>/dev/null || rc=$?; echo "rc=$rc"']);
    assert.match(r.out, /rc=0/, r.err);
    const block = readFileSync(host.envFile, 'utf8').slice(before.length);
    assert.doesNotMatch(block, /CUSTOM_TEMPLATES_DIRECTORY/, 'the operator directory is not overridden');
    assert.equal(existsSync(page(host, own)), true, 'the page goes into the operator directory');
    assert.equal(readFileSync(join(own, 'subscription', 'index.html'), 'utf8'), 'operator page', 'their page is untouched');
    const u = run('rt_panel_uninstall_template pasarguard; echo "rc=$?"');
    assert.match(u.out, /rc=0/, u.err);
    assert.equal(sha256(readFileSync(host.envFile)), sha256(before));
    assert.equal(existsSync(join(own, 'row-template')), false, 'our directory is removed');
    assert.equal(existsSync(own), true, 'the operator directory is not');
  });
});

test('a templates directory the container cannot share with the host is refused before anything changes', () => {
  withHost({}, ({ host, run }) => {
    writeFileSync(host.envFile, `${PG_ENV}CUSTOM_TEMPLATES_DIRECTORY = "/srv/elsewhere"\n`);
    const before = readFileSync(host.envFile);
    const r = run([SETUP, 'rc=0; rt_transaction_run pasarguard "$RT_LIVE" || rc=$?; echo "rc=$rc mutated=$RT_TXN_MUTATED"']);
    assert.match(r.out, /rc=1 mutated=0/, r.err);
    assert.match(r.err, /outside .*pasarguard, the directory the container shares with the host/);
    assert.equal(sha256(readFileSync(host.envFile)), sha256(before), '.env is untouched');
    assert.equal(restarts(host), 0);
  });
});

test('a page that is not Row-Template\'s is never overwritten, and the failed activation is rolled back', () => {
  withHost({}, ({ host, run }) => {
    const before = readFileSync(host.envFile);
    mkdirSync(join(host.dataDir, 'templates', 'row-template'), { recursive: true });
    writeFileSync(page(host), '<p>someone else</p>');
    const r = run([SETUP, 'rc=0; rt_transaction_run pasarguard "$RT_LIVE" || rc=$?; echo "rc=$rc state=$RT_TXN_STATE"']);
    assert.match(r.out, /rc=1/, r.err);
    assert.match(r.err, /exists and is not Row-Template's/);
    assert.equal(readFileSync(page(host), 'utf8'), '<p>someone else</p>', 'the operator file is untouched');
    assert.equal(sha256(readFileSync(host.envFile)), sha256(before));
  });
});

test('a failure after the change is made is rolled back to the exact previous state', () => {
  withHost({}, ({ host, run }) => {
    writeFileSync(join(host.docker, 'fail_up'), '');
    const before = readFileSync(host.envFile);
    const r = run([SETUP, 'rc=0; rt_transaction_run pasarguard "$RT_LIVE" || rc=$?; echo "rc=$rc state=$RT_TXN_STATE"']);
    assert.match(r.out, /rc=1 state=(ROLLED_BACK|FAILED)/, r.err);
    assert.equal(sha256(readFileSync(host.envFile)), sha256(before), '.env is restored byte for byte');
    assert.equal(existsSync(join(host.dataDir, 'templates')), false, 'the page and its directories are removed');
  });
});

test('a stopped panel is not started; its next start picks the change up', () => {
  withHost({ running: false }, ({ host, run }) => {
    const r = run([SETUP, 'rc=0; rt_transaction_run pasarguard "$RT_LIVE" 2>/dev/null || rc=$?; echo "rc=$rc"',
      'rc=0; rt_panel_verify pasarguard live || rc=$?; echo "live=$rc"']);
    assert.match(r.out, /rc=0/, r.err);
    assert.match(r.out, /live=2/, 'live verification is UNAVAILABLE, not a failure');
    assert.equal(restarts(host), 0, 'never started');
    assert.equal(existsSync(join(host.docker, 'running')), false);
  });
});

test('re-applying is idempotent: no second block, no second restart', () => {
  withHost({}, ({ host, run }) => {
    const r = run([SETUP, 'rt_transaction_run pasarguard "$RT_LIVE" 2>/dev/null',
      'rt_panel_install_template pasarguard "$RT_LIVE"; echo "rc=$?"']);
    assert.match(r.out, /rc=0/, r.err);
    assert.equal((readFileSync(host.envFile, 'utf8').match(/# >>> row-template/g) || []).length, 1);
    assert.equal(restarts(host), 1);
  });
});

test('a .env without a final newline is restored without one', () => {
  withHost({ env: PG_ENV.trimEnd() }, ({ host, run }) => {
    const before = readFileSync(host.envFile);
    run([SETUP, 'rt_transaction_run pasarguard "$RT_LIVE" 2>/dev/null']);
    assert.match(readFileSync(host.envFile, 'utf8'), /nl=1 >>>/, 'the block records the newline it added');
    run('rt_panel_uninstall_template pasarguard');
    assert.equal(sha256(readFileSync(host.envFile)), sha256(before));
  });
});

test('a line the operator adds after the block survives uninstall', () => {
  withHost({}, ({ host, run }) => {
    run([SETUP, 'rt_transaction_run pasarguard "$RT_LIVE" 2>/dev/null']);
    writeFileSync(host.envFile, `${readFileSync(host.envFile, 'utf8')}DEBUG = true\n`);
    run('rt_panel_uninstall_template pasarguard');
    assert.equal(readFileSync(host.envFile, 'utf8'), `${PG_ENV}DEBUG = true\n`);
  });
});

test('a damaged block is refused rather than interpreted', () => {
  withHost({}, ({ host, run }) => {
    writeFileSync(host.envFile, `${PG_ENV}# >>> row-template (managed by Row-Template; do not edit) nl=0 >>>\nX=1\n`);
    const before = readFileSync(host.envFile);
    const r = run([SETUP, 'rc=0; rt_panel_uninstall_template pasarguard || rc=$?; echo "rc=$rc"',
      'rc=0; rt_transaction_run pasarguard "$RT_LIVE" || rc=$?; echo "txn=$rc"']);
    assert.match(r.out, /rc=1/);
    assert.match(r.out, /txn=1/);
    assert.equal(sha256(readFileSync(host.envFile)), sha256(before));
  });
});

test('restore refuses a record that lists a file this adapter never places', () => {
  withHost({}, ({ run }) => {
    const r = run([SETUP,
      'rt_transaction_stage_reset', 'rt_panel_backup_state pasarguard',
      'printf "../../etc/passwd\\n" > "$RT_PANEL_STAGE/pasarguard/files"',
      'snap="$(rt_backup_create v2 pasarguard 2>/dev/null)" || { echo "snapshot-refused"; exit 0; }',
      'rc=0; rt_panel_restore_state pasarguard "$snap" || rc=$?; echo "rc=$rc"']);
    assert.match(r.out, /snapshot-refused|rc=1/, r.err);
  });
});

test('verify fails a placed page that was changed, and a selection that was removed', () => {
  withHost({}, ({ host, run }) => {
    run([SETUP, 'rt_transaction_run pasarguard "$RT_LIVE" 2>/dev/null']);
    const good = readFileSync(page(host));
    writeFileSync(page(host), good.toString().replace('Test VPN', 'Tampered'));
    let r = run('rc=0; rt_panel_verify pasarguard static || rc=$?; echo "rc=$rc"');
    assert.match(r.out, /rc=1/);
    assert.match(r.err, /placed page differs/);
    writeFileSync(page(host), good);
    const env = readFileSync(host.envFile, 'utf8');
    writeFileSync(host.envFile, env.replace(/SUBSCRIPTION_PAGE_TEMPLATE = "row-template\/index.html"/, 'SUBSCRIPTION_PAGE_TEMPLATE = "subscription/index.html"'));
    r = run('rc=0; rt_panel_verify pasarguard static || rc=$?; echo "rc=$rc"');
    assert.match(r.out, /rc=1/);
    assert.match(r.err, /does not select the Row-Template page/);
  });
});

test('secrets in .env never reach output, logs or snapshots', () => {
  withHost({}, ({ rt, run }) => {
    const r = run([SETUP, 'rt_transaction_run pasarguard "$RT_LIVE"', 'rt_panel_verify pasarguard static',
      'rt_panel_verify pasarguard live', 'rt_panel_uninstall_template pasarguard']);
    for (const secret of ['s3cr3t-Pa55w0rd-do-not-leak', 'jwt-secret-do-not-leak']) {
      assert.equal(r.out.includes(secret) || r.err.includes(secret), false, 'not in output');
      const snaps = join(rt, 'backups.v2');
      const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
      for (const f of existsSync(snaps) ? walk(snaps) : []) {
        assert.equal(readFileSync(f).includes(secret), false, `not in ${f}`);
      }
    }
  });
});

/* --- the artifact must fit the panel ---------------------------------------- */

test('a 3X-UI artifact, or a shell from before 1.3.0, is refused on PasarGuard', () => {
  withHost({}, ({ base, run }) => {
    const old = join(base, 'old-shell.html');
    const shell = readFileSync(join(PAYLOAD, 'shells', 'pasarguard', 'row', 'shell.html'), 'utf8');
    // a 1.2.x shell: the same layout without the context prelude and escaping
    writeFileSync(old, shell.replace(/\{#-[\s\S]*?-#\}\n/, '').replace(/\{%-? ?set [^%]*%\}\n?/g, '')
      .replace('{%- autoescape true -%}\n', '').replace('{%- endautoescape %}', ''));
    const r = run([SETUP,
      'rc=0; rt_set_dist "$PAYLOAD/template.html" 2>/dev/null || rc=$?; echo "xui=$rc"',
      `O=${JSON.stringify(old.split('\\').join('/'))}; O="$(cygpath -u "$O" 2>/dev/null || printf '%s' "$O")"`,
      'rc=0; rt_set_dist "$O" 2>/dev/null || rc=$?; echo "old=$rc"',
      'rc=0; rt_set_dist "$RT_TEMPLATE_STORE/editorial/template.html" || rc=$?; echo "ok=$rc"']);
    assert.match(r.out, /xui=1/, 'the 3X-UI artifact is refused');
    assert.match(r.out, /old=1/, 'a shell without the prelude and escaping is refused');
    assert.match(r.out, /ok=0/, 'a 1.3.0 PasarGuard page is accepted');
  });
});

test('a backup made for another panel is never restored onto PasarGuard', () => {
  withHost({}, ({ run }) => {
    const r = run([SETUP,
      'B="$(rt_backup_create)"',
      'sed -i "s/^panel=pasarguard$/panel=3xui/" "$B/meta"',
      'rc=0; rt_restore_from_backup "$B" 2>/dev/null || rc=$?; echo "rc=$rc"',
      'B2="$(rt_backup_create)"; grep -c "^panel=pasarguard$" "$B2/meta"']);
    assert.match(r.out, /rc=1/, 'refused');
    assert.match(r.out, /\n1$/, 'and a PasarGuard backup records its panel');
  });
});

/* --- the whole life cycle ---------------------------------------------------- */

test('install, verify, rebrand, switch design, roll back and uninstall on a PasarGuard host', () => {
  withHost({}, ({ base, host, rt, run }) => {
    const envBefore = readFileSync(host.envFile);
    const ENV = 'export RT_ASSUME_NONINTERACTIVE=1 RT_SERVICE_NAME="Aurora Net" RT_SUPPORT_URL="" RT_LOGO_REMOVE=1';
    let r = run([ENV, 'rt_cmd_install "$PAYLOAD" </dev/null']);
    assert.equal(r.code, 0, `install\n${r.out}\n${r.err}`);
    assert.match(r.out, /Panel:\s+PasarGuard/);
    assert.match(r.out, /PasarGuard now serves the Row-Template page/);
    assert.equal(readFileSync(join(rt, 'PANEL'), 'utf8'), 'pasarguard\n');
    assert.ok(readFileSync(page(host), 'utf8').includes('Aurora Net'), 'the placed page carries the branding');
    assert.equal(restarts(host), 1);

    r = run('rt_cmd_verify');
    assert.equal(r.code, 0, `verify\n${r.out}\n${r.err}`);
    assert.match(r.out, /PasarGuard selects the Row-Template page, and the placed page is current/);
    assert.match(r.out, /the running PasarGuard uses the Row-Template page/);

    r = run(['export RT_ASSUME_NONINTERACTIVE=1 RT_SERVICE_NAME="Borealis" RT_SUPPORT_URL="https://t.me/help"', 'rt_cmd_config </dev/null']);
    assert.equal(r.code, 0, `config\n${r.err}`);
    assert.ok(readFileSync(page(host), 'utf8').includes('Borealis'), 'rebranding refreshes the placed page');
    assert.equal(restarts(host), 1, 'without restarting the panel');

    r = run('rt_switch_template editorial');
    assert.equal(r.code, 0, `switch\n${r.err}`);
    const editorial = readFileSync(page(host), 'utf8');
    assert.match(editorial, /data-template="editorial"/, 'the placed page is the new design');
    assert.ok(editorial.includes('Borealis'), 'with the branding carried over');

    r = run('rt_cmd_rollback --auto');
    assert.equal(r.code, 0, `rollback\n${r.err}`);
    assert.doesNotMatch(readFileSync(page(host), 'utf8'), /data-template="editorial"/, 'rolled back to Row');
    r = run('rt_cmd_verify');
    assert.equal(r.code, 0, `verify after rollback\n${r.out}\n${r.err}`);

    r = run('RT_ASSUME_YES=1 rt_cmd_uninstall');
    assert.equal(r.code, 0, `uninstall\n${r.out}\n${r.err}`);
    assert.match(r.out, /PasarGuard is back on the subscription page it had before Row-Template/);
    assert.equal(sha256(readFileSync(host.envFile)), sha256(envBefore), '.env is back byte for byte');
    assert.equal(existsSync(join(host.dataDir, 'templates')), false);
    assert.equal(existsSync(rt), false, 'the install root is gone');
    assert.equal(existsSync(join(base, 'row-template')), false, 'and the CLI');
    assert.equal(existsSync(host.cliPath), true, 'PasarGuard itself is untouched');
  });
});
