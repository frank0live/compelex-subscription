/* The release payload. tools/make-release.sh must ship the committed Row
   artifact as the top-level template.html — the file an OLDER installed
   library updates against, so it must stay Row — plus every selectable design
   of the release under templates/ with its checksum sidecar, and every panel's
   assembled shell under shells/ with its own sidecar. Nothing else: a design
   that is not selectable must not ship, and neither must a panel that is not
   buildable.

   The shells are PACKAGED, not installed. Nothing here places one on a target
   host or configures a panel to use one — that is the installer's business and
   it is deliberately untouched.

   BUILD COST. A release build rebuilds 15 artifacts and 45 shells and gzips a
   multi-megabyte payload; under the sandbox that costs minutes, not seconds.
   Every test that only INSPECTS the payload therefore shares ONE build, so added
   coverage does not add build time. Only the determinism test builds again, and
   it must — comparing two independent runs is the whole point. */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../tools/build.mjs';
import { availableTemplateIds, TEMPLATES } from '../tools/templates.mjs';
import { assembleShell } from '../tools/shell.mjs';
import { buildablePanelIds, emitterFor } from '../tools/panels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ROW = readFileSync(join(ROOT, 'template', 'index.html'));
const EDITORIAL = Buffer.from(build(true, 'editorial').html);
const CANVAS = Buffer.from(build(true, 'canvas').html);
const PRISM = Buffer.from(build(true, 'prism').html);
const TERMINAL = Buffer.from(build(true, 'terminal').html);
const PULSE = Buffer.from(build(true, 'pulse').html);
const BRUTAL = Buffer.from(build(true, 'brutal').html);
const ARCADE = Buffer.from(build(true, 'arcade').html);
const SKETCH = Buffer.from(build(true, 'sketch').html);
const SIGNATURE = Buffer.from(build(true, 'signature').html);
const SAFFRON = Buffer.from(build(true, 'saffron').html);
const RESERVED = Object.keys(TEMPLATES).filter((id) => !TEMPLATES[id].available);

function makeRelease(out) {
  // cygpath converts the Windows temp path to an MSYS one; on a native POSIX
  // host cygpath is absent and the path is already usable as-is.
  return spawnSync(
    'bash',
    ['-c', 'out="$(cygpath -u "$1" 2>/dev/null || printf "%s" "$1")"; tools/make-release.sh "$out"',
      'make-release', out],
    { cwd: ROOT, encoding: 'utf8' },
  );
}

function extractPayload(out) {
  const version = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
  const name = `row-template-${version}`;
  // through bash with cygpath: a direct tar argv would hand GNU tar a
  // "D:\..." path it reads as a remote host
  const r = spawnSync(
    'bash',
    ['-c', 't="$(cygpath -u "$1" 2>/dev/null || printf "%s" "$1")"; d="$(cygpath -u "$2" 2>/dev/null || printf "%s" "$2")"; tar -xzf "$t" -C "$d"',
      'extract', join(out, `${name}.tar.gz`), out],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, 'the tarball extracts');
  return join(out, name);
}

/* A release build is EXPENSIVE here — it rebuilds 15 artifacts and 45 shells and
   gzips a multi-megabyte payload, and under the sandbox that costs minutes, not
   seconds. Every test that only inspects the payload shares ONE build, so adding
   coverage does not add build time. Only the determinism test builds again, and
   it must: comparing two runs is the whole point. */
let shared = null;
function sharedPayload() {
  if (shared === null) {
    const out = mkdtempSync(join(tmpdir(), 'row-rel-shared-'));
    const r = makeRelease(out);
    assert.equal(r.status, 0, r.stderr);
    shared = { out, payload: extractPayload(out) };
  }
  return shared;
}

after(() => {
  if (shared !== null) rmSync(shared.out, { recursive: true, force: true });
});

test('the release payload ships Row on top and every selectable design with checksums', () => {
  const { payload } = sharedPayload();

  // the top-level file an older library updates against is the Row artifact,
  // byte for byte
  assert.equal(readFileSync(join(payload, 'template.html')).equals(ROW), true,
    'top-level template.html must be the committed Row artifact');

  // the store holds exactly the selectable set — no reserved placeholder ids
  assert.deepEqual(readdirSync(join(payload, 'templates')).sort(), availableTemplateIds().sort(),
    'templates/ must contain exactly the available ids');
  for (const reserved of RESERVED) {
    assert.ok(!readdirSync(join(payload, 'templates')).includes(reserved),
      `reserved design ${reserved} must not ship`);
  }

  // every store artifact matches its sidecar and the bytes it claims
  for (const id of availableTemplateIds()) {
    const file = readFileSync(join(payload, 'templates', id, 'template.html'));
    const sha = createHash('sha256').update(file).digest('hex');
    const sidecar = readFileSync(join(payload, 'templates', id, 'template.html.sha256'), 'utf8');
    assert.ok(sidecar.startsWith(sha), `${id} sidecar matches its artifact`);
    if (id === 'row') {
      assert.equal(file.equals(ROW), true, 'row store artifact equals the top-level file');
    }
    if (id === 'editorial') {
      assert.equal(file.equals(EDITORIAL), true, 'editorial store artifact is the current build');
      assert.ok(file.length <= 200 * 1024, 'editorial stays inside the hard ceiling');
    }
      if (id === 'canvas') {
        assert.equal(file.equals(CANVAS), true, 'canvas store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'canvas stays inside its own budget line');
      }
      if (id === 'prism') {
        assert.equal(file.equals(PRISM), true, 'prism store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'prism stays inside its own budget line');
      }
      if (id === 'terminal') {
        assert.equal(file.equals(TERMINAL), true, 'terminal store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'terminal stays inside its own budget line');
      }
      if (id === 'pulse') {
        assert.equal(file.equals(PULSE), true, 'pulse store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'pulse stays inside its own budget line');
      }
      if (id === 'brutal') {
        assert.equal(file.equals(BRUTAL), true, 'brutal store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'brutal stays inside its own budget line');
      }
      if (id === 'arcade') {
        assert.equal(file.equals(ARCADE), true, 'arcade store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'arcade stays inside its own budget line');
      }
      if (id === 'sketch') {
        assert.equal(file.equals(SKETCH), true, 'sketch store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'sketch stays inside its own budget line');
      }
      if (id === 'signature') {
        assert.equal(file.equals(SIGNATURE), true, 'signature store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'signature stays inside its own budget line');
      }
      if (id === 'saffron') {
        assert.equal(file.equals(SAFFRON), true, 'saffron store artifact is the current build');
        assert.ok(file.length <= 203 * 1024, 'saffron stays inside its own budget line');
      }
    }

    // the inner SHA256SUMS covers every payload file, correctly. The star is
    // sha256sum's binary-mode marker on some platforms; strip it like the
    // installer library does.
    const sums = readFileSync(join(payload, 'SHA256SUMS'), 'utf8').trim().split('\n');
    const listed = new Set();
    for (const line of sums) {
      const [hex, raw] = line.split(/\s+/).filter(Boolean);
      const file = raw.replace(/^\*/, '').replace(/^\.\//, '');
      const bytes = readFileSync(join(payload, file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hex, file);
      listed.add(file);
    }
    const actual = readdirSync(payload, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name !== 'SHA256SUMS')
      .map((e) => join(e.parentPath ?? e.path, e.name).slice(payload.length + 1).replace(/\\/g, '/'));
    for (const f of actual) {
      assert.ok(listed.has(f), `inner SHA256SUMS lists ${f}`);
    }
});

/* The shell tree. The release carries every panel's assembled shell for every
   selectable design — packaged, not installed. Nothing here places a shell on a
   target host or configures a panel to use one; that is the installer's business
   and it is deliberately untouched by this phase. */
test('the release payload ships every panel shell for every design, with checksums', () => {
  const { payload } = sharedPayload();
  const shellRoot = join(payload, 'shells');

  // all three families, and nothing else
  assert.deepEqual(readdirSync(shellRoot).sort(), buildablePanelIds().sort(),
    'shells/ must contain exactly the buildable panels');
  assert.deepEqual(buildablePanelIds().sort(), ['3xui', 'pasarguard', 'rebecca'],
    'the three supported panels');

  // every design, under every panel
  for (const panel of buildablePanelIds()) {
    assert.deepEqual(readdirSync(join(shellRoot, panel)).sort(), availableTemplateIds().sort(),
      `${panel} must carry exactly the selectable designs`);
  }

  // every shell is the assembled shell, byte for byte, and its sidecar matches
  for (const panel of buildablePanelIds()) {
    for (const id of availableTemplateIds()) {
      const file = readFileSync(join(shellRoot, panel, id, 'shell.html'));
      const text = file.toString('utf8');
      const expected = Buffer.from(assembleShell(panel, id).html);
      assert.equal(file.equals(expected), true,
        `${panel}/${id} must be the current assembled shell`);

      const sha = createHash('sha256').update(file).digest('hex');
      const sidecar = readFileSync(join(shellRoot, panel, id, 'shell.html.sha256'), 'utf8');
      assert.ok(sidecar.startsWith(sha), `${panel}/${id} sidecar matches its shell`);

      // complete, and in that panel's own dialect. The reference panel's emitter
      // IS Go, so its shell correctly carries Go syntax — the "no Go" assertions
      // apply only to the dialects that must have been rewritten.
      assert.equal(text.includes('/*__STYLES__*/'), false, `${panel}/${id} has no unfilled token`);
      if (emitterFor(panel) === 'go') {
        assert.ok(text.includes('{{'), `${panel}/${id} is a Go shell and keeps Go syntax`);
      } else {
        assert.equal(/\{\{\s*\.[A-Za-z]/.test(text), false, `${panel}/${id} carries no Go field syntax`);
        assert.equal(/\{\{\s*(?:if|else|end|range)\b/.test(text), false, `${panel}/${id} carries no Go tag`);
        assert.ok(text.includes('{% if '), `${panel}/${id} carries block syntax`);
        assert.equal(text.includes('data-template="__TEMPLATE_ID__"'), false,
          `${panel}/${id} has no unfilled template id`);
      }
    }
  }
});

test('the release tarball is byte-deterministic', () => {
  /* Compared against the SHARED build rather than making two more: the shared
     one is already on disk, so this costs one extra build instead of two. The
     comparison is identical — two independent runs, byte for byte. */
  const { out: sharedOut } = sharedPayload();
  const b = mkdtempSync(join(tmpdir(), 'row-rel-b-'));
  try {
    assert.equal(makeRelease(b).status, 0);
    const version = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
    const ta = readFileSync(join(sharedOut, `row-template-${version}.tar.gz`));
    const tb = readFileSync(join(b, `row-template-${version}.tar.gz`));
    assert.equal(ta.equals(tb), true, 'two release runs must produce identical tarballs');
  } finally {
    rmSync(b, { recursive: true, force: true });
  }
});
