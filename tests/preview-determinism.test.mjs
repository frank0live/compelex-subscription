/* Preview-capture determinism.
 *
 * The documentation screenshots are committed, so they are only meaningful if
 * they can be reproduced. Two defects made that impossible, and both are pinned
 * here rather than left to a comment:
 *
 *   1. the fixture derives its expiry from the wall clock, so the same product
 *      renders a different date on a different day;
 *   2. the page derives its expiry caption from the *reader's* clock, so even a
 *      fixture pinned to a fixed instant renders one day less on a later day;
 *   3. the preview server serves sixteen of the seventeen designs out of
 *      dist/templates/**, which `npm run build` does not write, so a capture
 *      could photograph stale artifacts and still report success.
 *
 * The fixture override that fixes (1) must not be reachable from the product,
 * the shim that fixes (2) must be installed before the page's own scripts run,
 * and the preflight that fixes (3) must run before the browser does. All three
 * are asserted below, together with a real all-template build so the freshness
 * invariant is executed rather than described.
 *
 * A reproducible capture is still only useful if the committed set is the one it
 * produced, so the manifest is also held to the files on disk: every entry must
 * exist, at the size and sha256 it claims, at the dimensions of its mode, and
 * the declared totals must be the real ones.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

const CAPTURE = read('docs', 'scripts', 'capture-previews.mjs');
const DATA_GO = read('tools', 'fixtures', 'data.go');

const ENV_NAME = 'ROW_FIXTURE_NOW';
const DAY_MS = 86400 * 1000;

/* --- the override is the fixture's alone --------------------------------- */

test('the fixture clock override is named and defined in exactly one place', () => {
  const defines = DATA_GO.includes(`"${ENV_NAME}"`);
  assert.ok(defines, `tools/fixtures/data.go should define ${ENV_NAME}`);

  /* Nothing the product ships may know the name exists. If it appeared in src/
     it would reach the artifact and the panel. The capture-only clock shim is
     held to the same rule. */
  const offenders = [];
  const harness = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const text = readFileSync(p, 'utf8');
        if (text.includes(ENV_NAME)) offenders.push(p);
        if (text.includes('FixedDate') || text.includes('addScriptToEvaluateOnNewDocument')) harness.push(p);
      }
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(offenders, [], `production sources must not mention ${ENV_NAME}`);
  assert.deepEqual(harness, [], 'production sources must not carry capture-harness code');
});

test('the built Row artifact carries no trace of the fixture clock', () => {
  const html = read('template', 'index.html');
  assert.ok(!html.includes(ENV_NAME), 'the artifact must not mention the fixture clock');
  assert.ok(!html.includes('ROW_FIXTURE'), 'the artifact must not mention any fixture variable');
  /* The browser-clock shim is a capture concern; it must not have leaked into
     anything that ships. */
  assert.ok(!html.includes('addScriptToEvaluateOnNewDocument'),
    'the artifact must not mention the capture harness');
  assert.ok(!html.includes('FixedDate'), 'the artifact must not carry the clock shim');
});

/* --- the capture command builds everything first ------------------------- */

test('the capture script rebuilds all templates before it starts the server', () => {
  const buildAt = CAPTURE.indexOf('tools", "build.mjs"');
  const serverAt = CAPTURE.indexOf('"fixtures"), "run"');

  assert.ok(buildAt > -1, 'the capture script must invoke tools/build.mjs');
  assert.ok(serverAt > -1, 'the capture script must start the fixture server');
  assert.ok(buildAt < serverAt,
    'the all-template build must run before the fixture server is spawned');

  /* --all is the point: `npm run build` builds Row only. */
  const buildCall = CAPTURE.slice(buildAt - 80, buildAt + 160);
  assert.ok(buildCall.includes('"--all"'),
    `the build must pass --all, saw: ${buildCall.replace(/\s+/g, ' ')}`);
});

test('the capture script pins the fixture clock for the server it spawns', () => {
  assert.ok(CAPTURE.includes(`ROW_FIXTURE_NOW: String(REFERENCE_UNIX)`),
    'the spawned fixture server must receive the pinned clock');
  assert.ok(/const REFERENCE_UNIX = \d+;/.test(CAPTURE),
    'the reference instant must be a named constant');
});

test('the capture script refuses to photograph artifacts older than the sources', () => {
  assert.ok(CAPTURE.includes('refusing to capture stale artifacts'),
    'a stale tree must be a refusal, not a warning');
  assert.ok(CAPTURE.includes('older than src/'),
    'the staleness check must compare artifacts against src/');
});

/* --- the reference instant ----------------------------------------------- */

test('the reference instant is mid-day UTC so no timezone shifts the date', () => {
  const m = CAPTURE.match(/const REFERENCE_UNIX = (\d+);/);
  assert.ok(m, 'REFERENCE_UNIX must be defined');
  const ref = Number(m[1]);

  const expire = (ref + 45 * 86400) * 1000;
  const midnightUtc = new Date(expire).setUTCHours(0, 0, 0, 0);

  /* Mid-day, so every offset from UTC-12 to UTC+11 renders the same calendar
     date. The page formats dates in the runtime's local zone, and a reference
     near a boundary would make the committed screenshot depend on the machine. */
  const hourUtc = (expire - midnightUtc) / 3600000;
  assert.equal(hourUtc, 12, `expiry should land at 12:00 UTC, landed at ${hourUtc}:00`);

  assert.equal(new Date(expire).toISOString().slice(0, 10), '2026-11-02',
    'the reference instant must reproduce the committed baseline date');
});

test('the pinned clock reproduces the baseline date in this machine’s timezone', () => {
  const ref = Number(CAPTURE.match(/const REFERENCE_UNIX = (\d+);/)[1]);
  const expire = new Date((ref + 45 * 86400) * 1000);

  /* The page renders with Intl.DateTimeFormat and no timeZone option, so the
     date it shows is the local one. This asserts the machine running the
     capture agrees with the committed baseline. */
  const fmt = new Intl.DateTimeFormat('en-u-ca-gregory-nu-latn', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  assert.equal(fmt.format(expire), 'Nov 2, 2026',
    `local rendering should read Nov 2, 2026 (offset ${-expire.getTimezoneOffset() / 60}h)`);
});

/* --- the reader's clock, which a fixture pin cannot reach ----------------- */

const shimSource = () => {
  const m = CAPTURE.match(/const CLOCK_SHIM = `([\s\S]*?)`;/);
  assert.ok(m, 'the capture script must define a browser clock shim');
  /* The shim interpolates the constant at build time; do the same here. */
  return m[1].replace('${REFERENCE_UNIX * 1000}', String(refValue() * 1000));
};

const refValue = () => Number(CAPTURE.match(/const REFERENCE_UNIX = (\d+);/)[1]);

test('the capture pins the reader’s clock, not only the fixture’s', () => {
  const shimAt = CAPTURE.indexOf('Page.addScriptToEvaluateOnNewDocument');
  /* The first navigation is what matters: the shim has to be registered before
     the page it is meant to govern is ever loaded. */
  const navigateAt = CAPTURE.indexOf('Page.navigate');
  const captureLoopAt = CAPTURE.indexOf('for (const [mode, vp] of');

  assert.ok(shimAt > -1, 'the browser clock must be overridden over the DevTools protocol');
  assert.ok(navigateAt > -1, 'the capture must navigate');
  assert.ok(captureLoopAt > -1, 'the capture loop must exist');
  assert.ok(shimAt < navigateAt,
    'the clock must be installed before the first navigation, or the page renders the real day');
  assert.ok(shimAt < captureLoopAt,
    'the clock must be installed before the capture loop, not inside it');

  /* Installing it before any page script runs is what makes it a pin rather
     than a correction applied after the first paint. */
  assert.ok(CAPTURE.includes('addScriptToEvaluateOnNewDocument'),
    'the shim must be registered as a new-document script');

  /* And a capture taken without the shim is refused rather than committed. */
  assert.ok(CAPTURE.includes('browser clock reads'),
    'the harness must read the pinned clock back out of the page');
});

test('the clock shim freezes now and leaves every other Date behaviour alone', () => {
  const ctx = vm.createContext({});
  vm.runInContext(shimSource(), ctx);

  const FIXED = refValue() * 1000;
  const probe = vm.runInContext(`({
    now: Date.now(),
    noArg: new Date().getTime(),
    asString: typeof Date(),
    withArg: new Date(0).toISOString(),
    withParts: new Date(2026, 0, 1).getFullYear(),
    parse: Date.parse('2026-09-18T12:00:00Z'),
    utc: Date.UTC(2026, 8, 18),
    isDate: new Date() instanceof Date,
  })`, ctx);

  assert.equal(probe.now, FIXED, 'Date.now() must return the pinned instant');
  assert.equal(probe.noArg, FIXED, 'new Date() must be the pinned instant');
  assert.equal(probe.asString, 'string', 'Date() without new must still return a string');
  assert.equal(probe.withArg, '1970-01-01T00:00:00.000Z', 'new Date(ms) must be untouched');
  assert.equal(probe.withParts, 2026, 'new Date(y, m, d) must be untouched');
  assert.equal(probe.parse, Date.parse('2026-09-18T12:00:00Z'), 'Date.parse must be untouched');
  assert.equal(probe.utc, Date.UTC(2026, 8, 18), 'Date.UTC must be untouched');
  assert.ok(probe.isDate, 'instances must still be Dates');
});

test('the pinned instant reproduces the baseline caption as well as the date', () => {
  /* This is the reason the browser clock has to be pinned at all. The page
     computes the caption as whole days between the expiry day and the reader's
     day, so on 2026-09-20 an expiry of Nov 2 reads "43 days remaining" — and
     forcing 45 days would move the expiry to Nov 4 and break the date. Only
     pinning the reader's clock satisfies both facts the baseline shows. */
  const ref = refValue();
  const expire = ref + 45 * 86400;
  const dayIndex = (ms) => {
    const d = new Date(ms);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  };

  assert.equal(dayIndex(expire * 1000) - dayIndex(ref * 1000), 45,
    'the pinned instant must render "45 days remaining", as the baseline does');

  /* With the reader's clock pinned, that difference is a property of the
     constant alone and cannot drift with the calendar. */
  const otherDay = ref + 9 * 86400;
  assert.equal(dayIndex(expire * 1000) - dayIndex(otherDay * 1000), 36,
    'a different reader day would give a different caption — hence the pin');
});

/* --- the freshness invariant, executed ----------------------------------- */

test('an all-template build produces seventeen fresh artifacts', () => {
  const ids = read('tools', 'templates.mjs').match(/^\s{2}(\w+):\s*\{/gm) || [];
  assert.ok(ids.length >= 17, 'expected at least 17 templates in the registry');

  const r = spawnSync('node', [join('tools', 'build.mjs'), '--all', '--quiet'], {
    cwd: ROOT, encoding: 'utf8',
  });
  assert.equal(r.status, 0, `tools/build.mjs --all failed: ${r.stderr || r.stdout}`);

  const newest = (dir) => {
    let n = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      n = Math.max(n, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
    }
    return n;
  };
  const srcNewest = newest(join(ROOT, 'src'));

  /* Every artifact the preview server can serve, which is Row plus each design
     under dist/templates/ — exactly what previewTemplates() resolves. */
  const served = [
    join(ROOT, 'template', 'index.html'),
    ...readdirSync(join(ROOT, 'dist', 'templates'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(ROOT, 'dist', 'templates', e.name, 'template.html')),
  ];

  assert.equal(served.length, 17, `the preview server should see 17 artifacts, saw ${served.length}`);
  for (const p of served) {
    assert.ok(existsSync(p), `${p} should exist after an --all build`);
    assert.ok(statSync(p).mtimeMs >= srcNewest,
      `${p} is older than src/ — the preflight would refuse this tree`);
  }
});

/* --- the fixture's own contract ----------------------------------------- */

test('the fixture clock is read once, so one server run cannot mix instants', () => {
  /* A package-level value resolved at start-up. Sampling per request would let
     two requests in the same run disagree, which is the drift this removes. */
  assert.ok(/var fixedNow = mustFixtureNow\(os\.Getenv\(fixtureNowEnv\)\)/.test(DATA_GO),
    'the pinned instant must be resolved once at package level');
  assert.ok(!/fixtureNow\(\)/.test(DATA_GO) || DATA_GO.includes('func fixtureClock()'),
    'the accessor must be fixtureClock()');
});

test('unset means the live clock is still used', () => {
  /* The default path has to remain time.Now(), or every interactive run and
     every existing fixture expectation changes behaviour. Comments are stripped
     first: the prose explaining the fallback names time.Now() too, and counting
     it there would make this assertion about the documentation rather than the
     code. */
  const code = DATA_GO
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  assert.ok(/func fixtureClock\(\) time\.Time \{[\s\S]*?return time\.Now\(\)/.test(code),
    'fixtureClock() must fall back to time.Now() when nothing is pinned');
  assert.equal((code.match(/time\.Now\(\)/g) || []).length, 1,
    'time.Now() should appear exactly once in code, in the accessor fallback');
});

/* --- the committed previews are the set the manifest describes ------------
 *
 * The manifest is what the docs site and any reviewer trust: it names each
 * preview, its dimensions, its byte count and its sha256. Nothing checked that
 * the files on disk still agreed with it, so a half-regenerated or hand-edited
 * preview set would have gone unnoticed — the capture would report success and
 * the committed evidence would be something else. These assertions are the
 * permanent form of the one-off check that closed the re-freeze.
 */

const PREVIEWS = join(ROOT, 'docs', 'public', 'previews');
const MANIFEST = JSON.parse(read('docs', 'public', 'previews', 'manifest.json'));

const MODES = ['desktop', 'mobile'];
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const entryName = (e) => `${e.id}-${e.mode}.webp`;

/* The registry is the source of truth for which ids exist; the manifest has to
   cover exactly it, not merely a plausible-looking 34 files. */
const { templateIds } = await import(pathToFileURL(join(ROOT, 'tools', 'templates.mjs')).href);
const REGISTRY = templateIds();

/* Every .webp actually on disk, hashed once. */
const ON_DISK = new Map(
  readdirSync(PREVIEWS)
    .filter((f) => f.endsWith('.webp'))
    .map((f) => [f, sha256(readFileSync(join(PREVIEWS, f)))]),
);

test('the preview registry and the manifest agree on size', () => {
  assert.equal(REGISTRY.length, 17,
    `the registry should list exactly 17 templates, listed ${REGISTRY.length}`);
  assert.equal(MANIFEST.total, 34, `manifest.total should be 34, is ${MANIFEST.total}`);
  assert.equal(MANIFEST.entries.length, 34,
    `the manifest should carry 34 entries, carries ${MANIFEST.entries.length}`);

  /* Exactly desktop + mobile for every id, and no pair described twice. */
  const pairs = MANIFEST.entries.map(entryName);
  assert.equal(new Set(pairs).size, pairs.length, 'an id/mode pair appears more than once');
  assert.deepEqual([...new Set(MANIFEST.entries.map((e) => e.mode))].sort(), [...MODES].sort(),
    'the only modes are desktop and mobile');

  for (const id of REGISTRY) {
    for (const mode of MODES) {
      assert.ok(pairs.includes(`${id}-${mode}.webp`),
        `the manifest describes no ${mode} preview for ${id}`);
    }
  }
});

test('every manifest entry has a file, and no preview is orphaned', () => {
  const claimed = MANIFEST.entries.map(entryName);
  assert.deepEqual(claimed.filter((f) => !ON_DISK.has(f)), [],
    'the manifest describes files that are not on disk');

  assert.deepEqual([...ON_DISK.keys()].filter((f) => !claimed.includes(f)), [],
    'preview files exist that the manifest does not describe');

  assert.equal(ON_DISK.size, 34, `expected 34 preview files on disk, found ${ON_DISK.size}`);
});

test('every manifest entry matches its file byte for byte', () => {
  for (const e of MANIFEST.entries) {
    const name = entryName(e);
    const buf = readFileSync(join(PREVIEWS, name));
    assert.equal(buf.length, e.bytes,
      `${name}: the manifest says ${e.bytes} bytes, the file is ${buf.length}`);
    assert.equal(sha256(buf), e.sha256, `${name}: sha256 disagrees with the manifest`);
    assert.equal(e.file, `previews/${name}`, `${name}: the manifest records the path ${e.file}`);
  }
});

test('every manifest entry carries the dimensions of its mode', () => {
  for (const e of MANIFEST.entries) {
    const want = e.mode === 'desktop' ? MANIFEST.desktop : MANIFEST.mobile;
    assert.ok(want && Number.isFinite(want.width) && Number.isFinite(want.height),
      `the manifest declares no ${e.mode} viewport`);
    assert.equal(e.width, want.width, `${entryName(e)}: width ${e.width}, expected ${want.width}`);
    assert.equal(e.height, want.height, `${entryName(e)}: height ${e.height}, expected ${want.height}`);
  }
});

test('the manifest totals are the real totals', () => {
  const sum = MANIFEST.entries.reduce((a, e) => a + e.bytes, 0);
  assert.equal(MANIFEST.totalBytes, sum,
    `totalBytes ${MANIFEST.totalBytes} is not the sum of the entries, ${sum}`);

  const unique = new Set(MANIFEST.entries.map((e) => e.sha256)).size;
  assert.equal(MANIFEST.uniqueHashes, unique,
    `uniqueHashes ${MANIFEST.uniqueHashes} is not the real count, ${unique}`);
  assert.equal(unique, 34, `34 previews should be 34 distinct images, found ${unique}`);

  /* And distinct on disk, not just distinct as the manifest repeats them: a
     duplicated capture would otherwise still satisfy every count above. */
  assert.equal(new Set(ON_DISK.values()).size, 34,
    'the preview files on disk are not 34 distinct images');
});
