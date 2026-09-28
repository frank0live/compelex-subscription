/* The panel's own name and support link (1.4.0).
 *
 * PasarGuard and Rebecca keep a subscription profile title and a support URL
 * in their settings. The installer reads them, read-only, and offers them as
 * this page's service name and support link: an interactive fresh install
 * asks, RT_PANEL_BRANDING=1 takes them in a script, RT_PANEL_BRANDING=0 never
 * offers them. What is proven here:
 *
 *   - the adapters read exactly the row the panel reads, and never write;
 *   - the panels' own defaults ("Subscription", "https://t.me/") are not
 *     offered, nor a PasarGuard title that still holds a per-user placeholder;
 *   - every value passes the same validators a typed value does;
 *   - a database Row-Template does not read (no sqlite3, MySQL/MariaDB) means
 *     nothing is offered, and nothing fails;
 *   - explicit RT_SERVICE_NAME / RT_SUPPORT_URL always win;
 *   - without RT_PANEL_BRANDING a scripted install is exactly what it was.
 *
 * The interactive question itself is exercised on the real panels (a pseudo
 * terminal is needed for `[ -t 0 ]`), in the release validation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bashRun, makePayload, pasarguardHost, rebeccaHost, HOST_PREAMBLE, PYTHON,
} from './helpers/panel-hosts.mjs';
import { spawnSync } from 'node:child_process';
import { availableTemplateIds } from '../tools/templates.mjs';

const PAYLOAD_DIR = mkdtempSync(join(tmpdir(), 'row-brand-payload-'));
const PAYLOAD = makePayload(PAYLOAD_DIR, { ids: availableTemplateIds() });
process.on('exit', () => rmSync(PAYLOAD_DIR, { recursive: true, force: true }));

function withHost(kind, opts, fn) {
  const base = mkdtempSync(join(tmpdir(), `row-brand-${kind}-`));
  try {
    const host = kind === 'pasarguard' ? pasarguardHost(base, opts) : rebeccaHost(base, opts);
    const rt = join(base, 'rt');
    const run = (lines, env = {}) => bashRun([HOST_PREAMBLE, ...[].concat(lines)],
      { paths: { ...host.paths, RT_ROOT: rt, RT_BIN: join(base, 'row-template'), PAYLOAD },
        env: { ...host.env, ...env } });
    return fn({ base, host, rt, run });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const dbSum = (db) => {
  const r = spawnSync(PYTHON, ['-c', 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())', db],
    { encoding: 'utf8' });
  return r.stdout.trim();
};

/* What rt_panel_branding_read offers, as "<name>|<url>|<rc>". */
const READ = [
  'rc=0; rt_panel_branding_read "$PANEL" || rc=$?',
  'printf "%s|%s|%s" "$RT_PB_NAME" "$RT_PB_URL" "$rc"',
];

function pgRead(subscription, extraOpts = {}) {
  return withHost('pasarguard', { db: { subscription }, ...extraOpts }, ({ host, run }) => {
    const before = dbSum(host.db);
    const r = run(['PANEL=pasarguard', ...READ]);
    assert.equal(r.code, 0, r.err);
    assert.equal(dbSum(host.db), before, 'reading never writes the database');
    return r.out;
  });
}

function rbRead(branding, extraOpts = {}) {
  return withHost('rebecca', { branding, ...extraOpts }, ({ host, run }) => {
    const before = dbSum(host.db);
    const r = run(['PANEL=rebecca', ...READ]);
    assert.equal(r.code, 0, r.err);
    assert.equal(dbSum(host.db), before, 'reading never writes the database');
    return r.out;
  });
}

test('PasarGuard: the subscription title and support URL the operator set are offered', () => {
  assert.equal(pgRead({ profile_title: 'Aurora VPN', support_url: 'https://t.me/aurora_support' }),
    'Aurora VPN|https://t.me/aurora_support|0');
  assert.equal(pgRead({ profile_title: '  Aurora VPN  ', support_url: 'tg://resolve?domain=aurora' }),
    'Aurora VPN|tg://resolve?domain=aurora|0', 'trimmed; tg:// is a support scheme');
  assert.equal(pgRead({ profile_title: 'آرورا', support_url: '' }), 'آرورا||0', 'a name on its own');
  assert.equal(pgRead({ profile_title: 'Subscription', support_url: 'mailto:help@aurora.example' }),
    '|mailto:help@aurora.example|0', 'a link on its own');
});

test('PasarGuard: the panel\'s defaults and per-user placeholders are not offered', () => {
  assert.equal(pgRead({ profile_title: 'Subscription', support_url: 'https://t.me/' }), '||1', 'the defaults');
  assert.equal(pgRead({}), '||1', 'nothing set at all');
  assert.equal(pgRead({ profile_title: '{USERNAME} VPN', support_url: 'https://t.me' }), '||1',
    'a title that is formatted per subscriber cannot be this page\'s name');
});

test('PasarGuard: a value a typed one would be refused for is not offered either', () => {
  assert.equal(pgRead({ profile_title: 'ok', support_url: 'javascript:alert(1)' }), 'ok||0');
  assert.equal(pgRead({ profile_title: 'ok', support_url: 'ftp://files.example' }), 'ok||0');
  assert.equal(pgRead({ profile_title: 'two\nlines', support_url: 'https://t.me/x\nhttps://evil' }), '||1',
    'a value holding a newline is dropped whole');
  assert.equal(pgRead({ profile_title: `bell${String.fromCharCode(7)}`, support_url: '' }), '||1', 'control characters');
  assert.equal(pgRead({ profile_title: 'x'.repeat(200), support_url: '' }), '||1', 'too long');
});

test('PasarGuard: no sqlite3, or no database Row-Template reads, means nothing is offered', () => {
  /* A host with no database in .env also has no sqlite3 on its PATH
     (tests/helpers/panel-hosts.mjs), so both gates are exercised. */
  assert.equal(withHost('pasarguard', {}, ({ run }) => run(['PANEL=pasarguard', ...READ]).out), '||1',
    'no database configured, and no sqlite3');
  assert.equal(withHost('pasarguard', { db: { subscription: { profile_title: 'Aurora' } } }, ({ host, run }) => {
    const env = readFileSync(host.envFile, 'utf8').replace(/^SQLALCHEMY_DATABASE_URL = .*$/m,
      'SQLALCHEMY_DATABASE_URL = "mysql+asyncmy://u:p@127.0.0.1/pasarguard"');
    writeFileSync(host.envFile, env);
    return run(['PANEL=pasarguard', ...READ]).out;
  }), '||1', 'a MySQL database is not read');
});

test('Rebecca: the title and support URL of the row Rebecca reads are offered', () => {
  assert.equal(rbRead({ title: 'Borealis', url: 'https://t.me/borealis' }), 'Borealis|https://t.me/borealis|0');
  assert.equal(rbRead({ title: 'Borealis', url: 'https://t.me/borealis' }, { rows: 3 }),
    'Borealis|https://t.me/borealis|0', 'the newest row, as the panel reads it');
  assert.equal(rbRead({ title: 'Subscription', url: 'https://t.me/' }), '||1', 'the defaults');
  assert.equal(rbRead({ title: '{USERNAME}', url: '' }), '{USERNAME}||0',
    'Rebecca never formats its title, so braces are just text');
});

test('Rebecca: no sqlite3, or a MySQL/MariaDB database, means nothing is offered', () => {
  assert.equal(rbRead({ title: 'Borealis', url: 'https://t.me/b' }, { sqlite: false }), '||1');
  assert.equal(rbRead({ title: 'Borealis', url: 'https://t.me/b' }, { url: 'mysql+asyncmy://u:p@127.0.0.1/rebecca' }), '||1');
});

test('3X-UI: nothing is read and nothing is offered', () => {
  withHost('pasarguard', {}, ({ run }) => {
    assert.equal(run(['PANEL=3xui', ...READ]).out, '||1');
  });
});

/* --- the install ----------------------------------------------------------------- */

const configOf = (rt) => readFileSync(join(rt, 'config.env'), 'utf8');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('RT_PANEL_BRANDING=1: a scripted fresh install takes the panel\'s name and support link', () => {
  withHost('pasarguard', { db: { subscription: { profile_title: 'Aurora VPN', support_url: 'https://t.me/aurora' } } },
    ({ host, rt, run }) => {
      const r = run(['export RT_ASSUME_NONINTERACTIVE=1 RT_PANEL_BRANDING=1 RT_LOGO_REMOVE=1',
        'unset RT_SERVICE_NAME RT_SUPPORT_URL', 'rt_cmd_install "$PAYLOAD" </dev/null']);
      assert.equal(r.code, 0, `install\n${r.out}\n${r.err}`);
      const cfg = configOf(rt);
      assert.ok(cfg.includes(b64('Aurora VPN')), 'the service name is the panel\'s');
      assert.ok(cfg.includes(b64('https://t.me/aurora')), 'the support link is the panel\'s');
      const page = readFileSync(join(host.dataDir, 'templates', 'row-template', 'index.html'), 'utf8');
      assert.ok(page.includes('Aurora VPN'), 'and the placed page carries it');
    });
});

test('explicit RT_SERVICE_NAME and RT_SUPPORT_URL win over the panel\'s values', () => {
  withHost('rebecca', { branding: { title: 'Borealis', url: 'https://t.me/borealis' } }, ({ rt, run }) => {
    const r = run(['export RT_ASSUME_NONINTERACTIVE=1 RT_PANEL_BRANDING=1 RT_LOGO_REMOVE=1',
      'export RT_SERVICE_NAME="Mine"', 'unset RT_SUPPORT_URL', 'rt_cmd_install "$PAYLOAD" </dev/null']);
    assert.equal(r.code, 0, `install\n${r.out}\n${r.err}`);
    const cfg = configOf(rt);
    assert.ok(cfg.includes(b64('Mine')), 'the explicit name');
    assert.ok(!cfg.includes(b64('Borealis')), 'not the panel\'s');
    assert.ok(cfg.includes(b64('https://t.me/borealis')), 'the panel\'s link fills what was not given');
  });
});

test('without RT_PANEL_BRANDING, or with it 0, a scripted install ignores the panel\'s values', () => {
  for (const flag of ['', 'RT_PANEL_BRANDING=0']) {
    withHost('pasarguard', { db: { subscription: { profile_title: 'Aurora VPN', support_url: 'https://t.me/aurora' } } },
      ({ rt, run }) => {
        const r = run([`export RT_ASSUME_NONINTERACTIVE=1 RT_LOGO_REMOVE=1 ${flag}`.trim(),
          'unset RT_SERVICE_NAME RT_SUPPORT_URL', 'rt_cmd_install "$PAYLOAD" </dev/null']);
        assert.equal(r.code, 0, `install ${flag}\n${r.out}\n${r.err}`);
        const cfg = configOf(rt);
        assert.ok(!cfg.includes(b64('Aurora VPN')), `${flag || 'unset'}: not taken`);
        assert.ok(!cfg.includes(b64('https://t.me/aurora')), `${flag || 'unset'}: not taken`);
      });
  }
});

test('row-template config with RT_PANEL_BRANDING=1 takes them on an existing install', () => {
  withHost('rebecca', { branding: { title: 'Borealis', url: 'https://t.me/borealis' } }, ({ rt, run }) => {
    let r = run(['export RT_ASSUME_NONINTERACTIVE=1 RT_SERVICE_NAME="Before" RT_SUPPORT_URL="" RT_LOGO_REMOVE=1',
      'rt_cmd_install "$PAYLOAD" </dev/null']);
    assert.equal(r.code, 0, `install\n${r.out}\n${r.err}`);
    assert.ok(configOf(rt).includes(b64('Before')));
    r = run(['export RT_ASSUME_NONINTERACTIVE=1 RT_PANEL_BRANDING=1', 'unset RT_SERVICE_NAME RT_SUPPORT_URL',
      'rt_cmd_config </dev/null']);
    assert.equal(r.code, 0, `config\n${r.out}\n${r.err}`);
    const cfg = configOf(rt);
    assert.ok(cfg.includes(b64('Borealis')) && cfg.includes(b64('https://t.me/borealis')));
  });
});
