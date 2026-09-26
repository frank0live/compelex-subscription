/* Real template engines, for the test suite.
 *
 * The shells Row-Template ships for PasarGuard and Rebecca are rendered on
 * those panels by Jinja2 and pongo2. A test that renders them with anything
 * else proves only that the shell agrees with the test's idea of the engine.
 * This module runs the REAL engines, configured the way each panel configures
 * them:
 *
 *   PasarGuard  Python + the installed Jinja2 package, through
 *               tools/engines/jinja2_pasarguard.py
 *   Rebecca     Go + github.com/flosch/pongo2/v6 v6.1.0 (Rebecca's pinned
 *               version), through tools/engines/pongo2
 *
 * Both are test tooling and never ship. Both are REQUIRED by the suite: a
 * missing engine is reported as a failure with the command to fix it, never
 * as a silent skip, because "the page renders on the panel" is exactly the
 * claim these tests exist to make.
 *
 * Rendering is batched: each call writes every job to a temporary directory
 * and starts the engine once.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PONGO2_SRC = join(ROOT, 'tools', 'engines', 'pongo2');
const JINJA2_SCRIPT = join(ROOT, 'tools', 'engines', 'jinja2_pasarguard.py');

let pongo2Bin = null;
let pongo2Dir = null;
let python = null;

/* Build the pongo2 harness once per process. */
export function pongo2Binary() {
  if (pongo2Bin && existsSync(pongo2Bin)) return pongo2Bin;
  const go = spawnSync('go', ['version'], { encoding: 'utf8' });
  if (go.error || go.status !== 0) {
    throw new Error('Go is required to render the Rebecca shells with pongo2, and `go` was not found on PATH.');
  }
  pongo2Dir = mkdtempSync(join(tmpdir(), 'row-pongo2-'));
  const out = join(pongo2Dir, process.platform === 'win32' ? 'pongo2.exe' : 'pongo2');
  const r = spawnSync('go', ['build', '-o', out, '.'], {
    cwd: PONGO2_SRC,
    encoding: 'utf8',
    env: { ...process.env, GOFLAGS: '-mod=mod' },
  });
  if (r.error || r.status !== 0) {
    throw new Error(`could not build the pongo2 harness:\n${r.stderr || r.error}`);
  }
  pongo2Bin = out;
  return out;
}

/* The first Python that can import jinja2. */
export function pythonWithJinja2() {
  if (python) return python;
  const candidates = process.platform === 'win32'
    ? [['python'], ['py', '-3'], ['python3']]
    : [['python3'], ['python']];
  for (const [cmd, ...pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '-c', 'import jinja2,sys;print(jinja2.__version__)'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) {
      python = { cmd, pre, jinja2: r.stdout.trim() };
      return python;
    }
  }
  throw new Error('Python 3 with Jinja2 is required to render the PasarGuard shells '
    + '(install it with `pip install jinja2` or your distribution\'s python3-jinja2).');
}

function batch(engine, jobs, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), `row-${engine}-`));
  try {
    const spec = jobs.map((j, i) => {
      const template = join(dir, `t${i}.html`);
      writeFileSync(template, j.html, 'utf8');
      return { template, out: join(dir, `o${i}.html`), context: j.context };
    });
    const jobsFile = join(dir, 'jobs.json');
    writeFileSync(jobsFile, JSON.stringify(spec));
    let r;
    if (engine === 'pongo2') {
      r = spawnSync(pongo2Binary(), ['-batch', jobsFile], { encoding: 'utf8', env: { ...process.env, ...env } });
    } else {
      const py = pythonWithJinja2();
      r = spawnSync(py.cmd, [...py.pre, JINJA2_SCRIPT, jobsFile], {
        encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...env },
      });
    }
    if (r.error || r.status !== 0) {
      const err = new Error(`${engine} render failed: ${(r.stderr || String(r.error)).trim()}`);
      err.engineStderr = r.stderr;
      throw err;
    }
    return spec.map((s) => readFileSync(s.out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* Render jobs [{ html, context }] with PasarGuard's Jinja2 configuration. */
export function renderPasarGuard(jobs, env) {
  return batch('jinja2', jobs, env);
}

/* Render jobs [{ html, context }] with Rebecca's pongo2 configuration. */
export function renderRebecca(jobs, env) {
  return batch('pongo2', jobs, env);
}

/* The page context each panel builds for a subscriber, from a fixture's
   native /info record. These mirror what the panels pass to their templates
   (see the file headers of the two harnesses), so a fixture can be rendered
   the way the panel would render it. */

export function pasarguardContext(doc, { links = [], now } = {}) {
  const info = doc.native.info;
  const headers = doc.native.headers || {};
  const b64 = (v) => (typeof v === 'string' && v.startsWith('base64:')
    ? Buffer.from(v.slice(7), 'base64').toString('utf8') : (v || ''));
  const clock = now ?? doc.source.clock;
  return {
    now: new Date(clock * 1000).toISOString(),
    user: {
      username: info.username,
      status: info.status,
      used_traffic: info.used_traffic,
      data_limit: info.data_limit,
      expire: info.expire,
      online_at: info.online_at,
      on_hold_expire_duration: info.on_hold_expire_duration ?? null,
      on_hold_timeout: info.on_hold_timeout ?? null,
      // not a database column: the page context always carries the default
      subscription_url: '',
      admin: headers['support-url'] ? { support_url: headers['support-url'] } : null,
      ip: info.ip ?? null,
    },
    links,
    announce: b64(headers.announce),
    announce_url: headers['announce-url'] || '',
  };
}

export function rebeccaContext(doc, { links = [], now } = {}) {
  const info = doc.native.info;
  const headers = doc.native.headers || {};
  const clock = now ?? doc.source.clock;
  return {
    user: {
      username: info.username,
      status: info.status,
      // Rebecca's own classification: on_hold renders as active, and a status
      // it does not know renders as disabled
      status_class: ({ active: 'active', limited: 'limited', expired: 'expired', disabled: 'disabled', on_hold: 'active' })[info.status] || 'disabled',
      data_limit: info.data_limit,
      used_traffic: info.used_traffic,
      expire: info.expire,
      online_at: info.online_at,
      subscription_url: info.subscription_url || '',
      service_name: info.service_name ?? null,
      links,
    },
    links,
    support_url: headers['support-url'] || '',
    token: 'fixture-token',
    current_timestamp: clock,
    remaining_days: 0,
  };
}
