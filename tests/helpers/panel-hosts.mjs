/* Fake PasarGuard and Rebecca hosts, for the installer suites.
 *
 * Each host is the panel's OFFICIAL layout (docs/design/*-INSTALLER-AUDIT.md),
 * relocated under a temporary directory:
 *
 *   PasarGuard  opt/pasarguard/{.env,docker-compose.yml}, var/lib/pasarguard/,
 *               usr/local/bin/pasarguard
 *   Rebecca     opt/rebecca/{.env,docker-compose.yml}, var/lib/rebecca/db.sqlite3,
 *               usr/local/bin/rebecca
 *
 * and the adapters are pointed at it through their RT_PG_* / RT_RB_* location
 * variables -- the same knobs a non-default APP_NAME would use, so no adapter
 * code is bypassed.
 *
 * WHAT IS DOUBLED, AND WHY. Two external programs the adapters talk to:
 *
 *   docker   a shim that keeps "is the panel container running" in a state
 *            directory, and on `compose up` loads the .env the way Docker
 *            Compose does (last assignment wins), so `docker exec printenv`
 *            answers with what a REAL recreated container would hold. It knows
 *            nothing about Row-Template.
 *   sqlite3  forwards to Python's sqlite3 module (as the 3X-UI suite does), so
 *            Rebecca's database is a real SQLite file and every statement the
 *            adapter runs is executed for real.
 *
 * Everything else -- the adapters, the transaction engine, the library -- is
 * the shipping code.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../../tools/build.mjs';
import { assembleShell } from '../../tools/shell.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export const sq = (s) => `'${String(s).split("'").join("'\\''")}'`;

function workingProgram(candidates, args = ['--version']) {
  for (const c of candidates) {
    const r = spawnSync(c, args, { encoding: 'utf8' });
    if (!r.error && r.status === 0) return c;
  }
  throw new Error(`none of these programs is usable: ${candidates.join(', ')}`);
}
export const PYTHON = workingProgram(process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']);

/* Run bash with `set -Eeuo pipefail`. PATHS entries are exported as POSIX
   paths (cygpath on Windows); ENV entries are exported as given. */
export function bashRun(lines, { paths = {}, env = {} } = {}) {
  const head = Object.entries(paths).map(([k, v]) =>
    `${k}="$(cygpath -u ${sq(v)} 2>/dev/null || printf '%s' ${sq(v)})"; export ${k}`);
  const script = ['set -Eeuo pipefail',
    'unset RT_TEMPLATE RT_RELEASE_URL RT_RELEASE_DIR RT_ASSUME_YES RT_PANEL RT_SMOKE_URL XUI_DB_FOLDER',
    ...head, ...lines].join('\n');
  const r = spawnSync('bash', ['-c', script], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env },
  });
  if (r.error) throw r.error;
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/* The POSIX form of a Windows path, as the shell sees it. */
export function posix(p) {
  const r = spawnSync('bash', ['-c', `cygpath -u ${sq(p)} 2>/dev/null || printf '%s' ${sq(p)}`], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

/* --- a release payload, laid out exactly as tools/make-release.sh does -------- */

export function makePayload(dir, { ids = ['row', 'editorial'], panels = ['3xui', 'pasarguard', 'rebecca'], version } = {}) {
  const put = (rel, content, mode) => {
    const f = join(dir, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, content);
    if (mode) chmodSync(f, mode);
  };
  const cp = (rel, src, mode) => put(rel, readFileSync(src), mode);
  cp('template.html', join(ROOT, 'template', 'index.html'));
  put('VERSION', `${version || readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()}\n`);
  cp('install.sh', join(ROOT, 'installer', 'install.sh'), 0o755);
  cp('bin/row-template', join(ROOT, 'installer', 'bin', 'row-template'), 0o755);
  cp('lib/row-template.sh', join(ROOT, 'installer', 'lib', 'row-template.sh'));
  cp('lib/transaction.sh', join(ROOT, 'installer', 'lib', 'transaction.sh'));
  for (const f of readdirSync(join(ROOT, 'installer', 'panels'))) {
    cp(`panels/${f}`, join(ROOT, 'installer', 'panels', f));
  }
  for (const id of ids) {
    const html = id === 'row' ? readFileSync(join(ROOT, 'template', 'index.html')) : Buffer.from(build(true, id).html);
    put(`templates/${id}/template.html`, html);
    put(`templates/${id}/template.html.sha256`, `${sha256(html)}  templates/${id}/template.html\n`);
  }
  for (const panel of panels) {
    for (const id of ids) {
      const html = Buffer.from(assembleShell(panel, id).html);
      put(`shells/${panel}/${id}/shell.html`, html);
      put(`shells/${panel}/${id}/shell.html.sha256`, `${sha256(html)}  shells/${panel}/${id}/shell.html\n`);
    }
  }
  const sums = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (r !== 'SHA256SUMS') sums.push(`${sha256(readFileSync(join(dir, r)))}  ${r}`);
    }
  };
  walk('');
  put('SHA256SUMS', `${sums.sort().join('\n')}\n`);
  return dir;
}

/* --- the docker shim ------------------------------------------------------------ */

const DOCKER_SHIM = `#!/usr/bin/env bash
# Test double for docker. State lives in $RT_TEST_DOCKER; nothing here knows
# about Row-Template.
set -u
st="\${RT_TEST_DOCKER:?}"
printf '%s\\n' "$*" >> "$st/calls"
envget() {  # KEY FILE: the last assignment, as compose reads it
  awk -v k="$1" '
    { l=$0; sub(/\\r$/,"",l); s=l; sub(/^[ \\t]+/,"",s)
      if (s=="" || substr(s,1,1)=="#") next
      if (substr(s,1,7)=="export ") s=substr(s,8)
      e=index(s,"="); if (!e) next
      kk=substr(s,1,e-1); sub(/[ \\t]+$/,"",kk); if (kk!=k) next
      v=substr(s,e+1); sub(/^[ \\t]+/,"",v); q=substr(v,1,1)
      if (q=="\\"" || q=="\\047") { r=substr(v,2); i=index(r,q); v=(i?substr(r,1,i-1):r) }
      else { c=index(v," #"); if (c) v=substr(v,1,c-1); sub(/[ \\t]+$/,"",v) }
      val=v; f=1 }
    END { if (f) printf "%s", val }' "$2"
}
case "\${1:-}" in
  ps)
    [ -f "$st/running" ] || exit 0
    img="$(cat "$st/image")"
    case "$*" in
      *'{{.Names}} {{.Image}}'*) printf '%s %s\\n' "$(cat "$st/name")" "$img" ;;
      *) printf '%s\\n' "$img" ;;
    esac ;;
  compose)
    shift; file=""
    while [ "$#" -gt 0 ]; do
      case "$1" in -f) file="$2"; shift 2 ;; -p) shift 2 ;; *) break ;; esac
    done
    case "\${1:-}" in
      up)
        [ -f "$st/fail_up" ] && { echo "compose: injected failure" >&2; exit 1; }
        envf="$(dirname "$file")/.env"
        : > "$st/container.env"
        for k in SUBSCRIPTION_PAGE_TEMPLATE CUSTOM_TEMPLATES_DIRECTORY; do
          printf '%s=%s\\n' "$k" "$(envget "$k" "$envf")" >> "$st/container.env"
        done
        touch "$st/running"
        echo up >> "$st/restarts" ;;
      *) : ;;
    esac ;;
  exec)
    shift; shift
    case "\${1:-}" in
      printenv) v="$(grep "^$2=" "$st/container.env" 2>/dev/null | tail -n1 | cut -d= -f2-)"; [ -n "$v" ] || exit 1; printf '%s\\n' "$v" ;;
      test) shift; test "$@" ;;
      *) exit 1 ;;
    esac ;;
  version) echo "Docker version 99 (test double)" ;;
  *) exit 0 ;;
esac
`;

const SQLITE_SHIM = `#!/usr/bin/env bash
# Test double for the sqlite3 CLI: runs the statement with Python's real
# sqlite3 module. Accepts the adapter's "-cmd .timeout N" prefix.
set -u
while [ "$#" -gt 2 ]; do
  case "$1" in -cmd) shift 2 ;; *) shift ;; esac
done
[ -n "\${RT_TEST_SQL_LOG:-}" ] && printf '%s\\n' "$2" >> "$RT_TEST_SQL_LOG"
db="$(cygpath -w "$1" 2>/dev/null || printf '%s' "$1")"
"$RT_TEST_PYTHON" - "$db" "$2" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
try:
    cur = con.execute(sys.argv[2])
    rows = cur.fetchall()
    con.commit()
    for r in rows:
        print("|".join("" if v is None else str(v) for v in r))
finally:
    con.close()
PYEOF
`;

/* The transaction engine locks with flock and refuses to run without it. Git
   Bash on Windows has none, so -- exactly as tests/installer-transaction.test.mjs
   does -- a minimal double provides flock's contract (an exclusive lock on the
   file behind a descriptor, by an atomic mkdir). A host with a real flock uses
   the real one. */
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
const HOST_HAS_FLOCK = spawnSync('bash', ['-c', 'command -v flock'], { encoding: 'utf8' }).status === 0;

function shims(base, { sqlite = true } = {}) {
  const bin = join(base, 'shimbin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'docker'), DOCKER_SHIM);
  chmodSync(join(bin, 'docker'), 0o755);
  if (!HOST_HAS_FLOCK) {
    writeFileSync(join(bin, 'flock'), FLOCK_SHIM);
    chmodSync(join(bin, 'flock'), 0o755);
  }
  if (sqlite) {
    writeFileSync(join(bin, 'sqlite3'), SQLITE_SHIM);
    chmodSync(join(bin, 'sqlite3'), 0o755);
  }
  return bin;
}

/* --- PasarGuard ------------------------------------------------------------- */

export const PG_ENV = [
  'UVICORN_HOST = "0.0.0.0"',
  'UVICORN_PORT = 8000',
  'SUDO_USERNAME = "admin"',
  'SUDO_PASSWORD = "s3cr3t-Pa55w0rd-do-not-leak"',
  '## Custom page templates.',
  '# CUSTOM_TEMPLATES_DIRECTORY = "/var/lib/pasarguard/templates/"',
  '# SUBSCRIPTION_PAGE_TEMPLATE = "subscription/index.html"',
  'SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:////var/lib/pasarguard/db.sqlite3"',
  'JWT_SECRET = "jwt-secret-do-not-leak"',
].join('\n') + '\n';

export function pasarguardHost(base, { running = true, env = PG_ENV, compose = true, cli = true, data = true } = {}) {
  const app = join(base, 'opt', 'pasarguard');
  const dataDir = join(base, 'var', 'lib', 'pasarguard');
  const cliPath = join(base, 'usr', 'local', 'bin', 'pasarguard');
  const docker = join(base, 'docker-state');
  mkdirSync(app, { recursive: true });
  mkdirSync(docker, { recursive: true });
  if (data) mkdirSync(dataDir, { recursive: true });
  if (env !== null) writeFileSync(join(app, '.env'), env);
  if (compose) {
    writeFileSync(join(app, 'docker-compose.yml'), [
      'services:', '  pasarguard:', '    image: pasarguard/panel:latest', '    restart: always',
      '    env_file: .env', '    network_mode: host', '    volumes:',
      `      - ${posix(dataDir)}:${posix(dataDir)}`, ''].join('\n'));
  }
  if (cli) {
    mkdirSync(dirname(cliPath), { recursive: true });
    writeFileSync(cliPath, '#!/usr/bin/env bash\n# pasarguard management script (test stand-in)\necho pasarguard "$@"\n');
    chmodSync(cliPath, 0o755);
  }
  writeFileSync(join(docker, 'image'), 'pasarguard/panel:latest');
  writeFileSync(join(docker, 'name'), 'pasarguard-pasarguard-1');
  if (running) writeFileSync(join(docker, 'running'), '');
  const bin = shims(base, { sqlite: false });
  return {
    app, dataDir, cliPath, docker, bin, envFile: join(app, '.env'),
    paths: { RT_PG_APP_DIR: app, RT_PG_DATA_DIR: dataDir, RT_PG_CLI: cliPath, RT_TEST_DOCKER: docker, RT_TEST_BIN: bin },
  };
}

/* --- Rebecca -------------------------------------------------------------------- */

export function rebeccaHost(base, { running = true, sqlite = true, url, customDir = null, pageTemplate = 'subscription/index.html',
  rows = 1, admins = [], compose = true, cli = true } = {}) {
  const app = join(base, 'opt', 'rebecca');
  const dataDir = join(base, 'var', 'lib', 'rebecca');
  const cliPath = join(base, 'usr', 'local', 'bin', 'rebecca');
  const docker = join(base, 'docker-state');
  const db = join(dataDir, 'db.sqlite3');
  mkdirSync(app, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(docker, { recursive: true });
  const dbUrl = url || `sqlite:///${posix(db)}`;
  writeFileSync(join(app, '.env'), [
    'UVICORN_PORT = 8000',
    'SUDO_PASSWORD = "rebecca-secret-do-not-leak"',
    `SQLALCHEMY_DATABASE_URL = "${dbUrl}"`,
    '',
  ].join('\n'));
  if (compose) {
    writeFileSync(join(app, 'docker-compose.yml'), [
      'services:', '  rebecca:', '    image: rebeccapanel/rebecca:latest', '    env_file: .env',
      '    network_mode: host', '    volumes:', `      - ${posix(dataDir)}:${posix(dataDir)}`, ''].join('\n'));
  }
  if (cli) {
    mkdirSync(dirname(cliPath), { recursive: true });
    writeFileSync(cliPath, '#!/usr/bin/env bash\n# rebecca management script (test stand-in)\necho rebecca "$@"\n');
    chmodSync(cliPath, 0o755);
  }
  writeFileSync(join(docker, 'image'), 'rebeccapanel/rebecca:latest');
  writeFileSync(join(docker, 'name'), 'rebecca-rebecca-1');
  if (running) writeFileSync(join(docker, 'running'), '');
  // Rebecca's own schema for the two tables the adapter reads, plus the
  // columns around them that must survive untouched.
  const statements = [
    `CREATE TABLE subscription_settings (id INTEGER PRIMARY KEY, subscription_url_prefix VARCHAR(512) NOT NULL DEFAULT '',
      subscription_support_url VARCHAR(512) NOT NULL DEFAULT 'https://t.me/', custom_templates_directory VARCHAR(512) NULL,
      clash_subscription_template VARCHAR(255) NOT NULL DEFAULT 'clash/default.yml',
      subscription_page_template VARCHAR(255) NOT NULL DEFAULT 'subscription/index.html',
      home_page_template VARCHAR(255) NOT NULL DEFAULT 'home/index.html')`,
    'CREATE TABLE admins (id INTEGER PRIMARY KEY, username TEXT, subscription_settings TEXT)',
  ];
  for (let i = 0; i < rows; i += 1) {
    const last = i === rows - 1;
    statements.push(`INSERT INTO subscription_settings (subscription_support_url, custom_templates_directory, subscription_page_template)
      VALUES ('https://t.me/row${i}', ${last && customDir !== null ? `'${customDir.split("'").join("''")}'` : 'NULL'},
      '${last ? pageTemplate : 'old/page.html'}')`);
  }
  admins.forEach((a, i) => statements.push(`INSERT INTO admins (username, subscription_settings) VALUES ('a${i}', '${a.split("'").join("''")}')`));
  const r = spawnSync(PYTHON, ['-c', [
    'import sqlite3,sys,json',
    'con=sqlite3.connect(sys.argv[1])',
    'for s in json.loads(sys.argv[2]): con.execute(s)',
    'con.commit(); con.close()',
  ].join('\n'), db, JSON.stringify(statements)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const bin = shims(base, { sqlite });
  return {
    app, dataDir, cliPath, docker, bin, db, envFile: join(app, '.env'),
    paths: { RT_RB_APP_DIR: app, RT_RB_DATA_DIR: dataDir, RT_RB_CLI: cliPath, RT_TEST_DOCKER: docker, RT_TEST_BIN: bin },
  };
}

/* Read Rebecca's selection row back, from Node, with NULL kept as null. */
export function rebeccaRow(db) {
  const r = spawnSync(PYTHON, ['-c', [
    'import sqlite3,sys,json',
    'con=sqlite3.connect(sys.argv[1])',
    'rows=con.execute("SELECT id,subscription_page_template,custom_templates_directory,subscription_support_url,clash_subscription_template,home_page_template FROM subscription_settings ORDER BY id").fetchall()',
    'print(json.dumps(rows))',
  ].join('\n'), db], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

/* The bash preamble that points the library at a fake host: the shims first
   on PATH, the host's paths exported, and root checks stubbed (the suite does
   not run as root). */
export const HOST_PREAMBLE = [
  'export PATH="$RT_TEST_BIN:$PATH"',
  `export RT_TEST_PYTHON=${sq(PYTHON)}`,
  '. installer/lib/row-template.sh',
  'rt_require_root(){ :; }',
  'rt_detect_xui(){ RT_XUI_BIN=""; RT_XUI_UNIT=""; return 1; }',
  'trap "rt_cleanup" EXIT',
].join('\n');

export function copyInto(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
