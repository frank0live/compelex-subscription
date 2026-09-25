/* The management layer is shell, but its pure helpers decide whether a real
   panel gets a safe template or a broken one, so they are tested exactly like
   the browser code. Each case runs the SHIPPED installer/lib/row-template.sh in
   a real bash process — there is no second, drifting reimplementation here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, tmpdir } from 'node:os';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { build } from '../tools/build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Every case sources the library into a throwaway RT_ROOT and cleans up on
   exit, so tests never touch a real install and never depend on each other. */
const PREAMBLE = [
  'set -Eeuo pipefail',
  'export RT_ROOT="$(mktemp -d)/rt"',
  'mkdir -p "$RT_ROOT" "$RT_ROOT/dist"',
  'source installer/lib/row-template.sh',
  'cleanup(){ rm -rf "$(dirname "$RT_ROOT")"; }',
  'trap cleanup EXIT',
  '',
].join('\n');

/* Run a bash snippet against the library. Returns {code, out, err}. cwd is the
   repo root so the lib and artifact are reached by stable relative paths. */
function sh(body) {
  const r = spawnSync('bash', ['-c', PREAMBLE + body], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/* True when the snippet exits zero. */
function ok(body) {
  return sh(body).code === 0;
}

test('version comparison orders releases and tolerates suffixes', () => {
  assert.ok(ok('rt_semver_ge 3.7.0 3.6.0'));
  assert.ok(ok('rt_semver_ge 3.6.0 3.6.0'), 'equal is >=');
  assert.ok(!ok('rt_semver_ge 3.5.9 3.6.0'));
  assert.ok(ok('rt_semver_ge 3.6.1 3.6.0'));
  assert.ok(!ok('rt_semver_ge 3.6.0 3.10.0'), '3.6 < 3.10, not string-compared');
  assert.ok(ok('rt_semver_ge v3.7.0-dev 3.6.0'), 'leading v and -suffix ignored');
  assert.ok(ok('rt_semver_ge 3.7 3.6.0'), 'missing patch defaults to 0');
  assert.equal(sh('rt_normalize_semver 3.7').out, '3.7.0');
  assert.equal(sh('rt_normalize_semver v3.6.0-fork.2').out, '3.6.0');
});

test('json escape neutralises a </script> breakout without touching data', () => {
  assert.equal(sh('rt_json_escape "plain text"').out, 'plain text');
  assert.equal(sh('rt_json_escape "a\\"b"').out, 'a\\"b', 'double quote escaped');
  assert.equal(sh('rt_json_escape "a\\\\b"').out, 'a\\\\b', 'backslash doubled');
  assert.equal(sh('rt_json_escape "</script>"').out, '\\u003c/script>', '< escaped');
  /* & and > are inert inside a <script> string; only < can end the element. */
  assert.equal(sh('rt_json_escape "a & b > c"').out, 'a & b > c');
});

test('support URL validation accepts only frontend-renderable schemes', () => {
  for (const u of ['https://t.me/x', 'http://a.b', 'tg://resolve?domain=x', 'mailto:a@b.c']) {
    assert.ok(ok(`rt_validate_support_url ${JSON.stringify(u)}`), u);
  }
  for (const u of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://a', 'about:blank']) {
    assert.ok(!ok(`rt_validate_support_url ${JSON.stringify(u)}`), u);
  }
  assert.ok(ok('rt_validate_support_url ""'), 'empty is allowed (no link)');
  assert.ok(ok('rt_validate_support_url "   "'), 'whitespace-only trims to empty');
  assert.ok(ok('rt_validate_support_url "HTTPS://T.ME/x"'), 'scheme is case-insensitive');
  assert.ok(!ok('rt_validate_support_url "https://"'), 'scheme alone is not a URL');
});

test('service name validation rejects control chars and over-length', () => {
  assert.ok(ok('rt_validate_service_name "Katze-VPN"'));
  assert.ok(ok('rt_validate_service_name ""'), 'empty is allowed (white-label)');
  assert.ok(ok('rt_validate_service_name "极速网络"'), 'unicode allowed');
  assert.ok(!ok('rt_validate_service_name "$(printf "a\\tb")"'), 'tab rejected');
  assert.ok(!ok('rt_validate_service_name "$(printf "a\\nb")"'), 'newline rejected');
  assert.ok(!ok('rt_validate_service_name "$(printf "%0.sX" {1..200})"'), 'too long');
});

/* Feed values in as base64 so JS/shell quoting can never corrupt the fixture —
   the point is that config.env survives arbitrary data, including quotes and
   markup, and comes back byte-identical because it is parsed, never executed. */
function cfgRoundtrip(name, url) {
  const nb = Buffer.from(name, 'utf8').toString('base64');
  const ub = Buffer.from(url, 'utf8').toString('base64');
  const r = sh(
    `N="$(printf %s ${nb} | base64 -d)"; U="$(printf %s ${ub} | base64 -d)";` +
    `rt_config_write "$N" "$U" "" ""; ` +
    `printf 'NAME=%s\\n' "$(rt_config_get_text SERVICE_NAME_B64)"; ` +
    `printf 'URL=%s\\n' "$(rt_config_get_text SUPPORT_URL_B64)"`,
  );
  const name2 = /^NAME=(.*)$/m.exec(r.out)?.[1] ?? null;
  const url2 = /^URL=(.*)$/m.exec(r.out)?.[1] ?? null;
  return { name: name2, url: url2 };
}

test('config serialize/parse round-trips arbitrary data as data', () => {
  const cases = [
    ['Katze-VPN', 'https://t.me/support'],
    ['Café Røör & Co', 'mailto:help@example.com'],
    ['极速网络', 'tg://resolve?domain=x'],
    ['a"b\'c$(whoami)`id`;rm -rf /', 'https://a.b/?x=1&y=2'],
    ['</script><img src=x>', 'http://ex.io'],
  ];
  for (const [n, u] of cases) {
    const got = cfgRoundtrip(n, u);
    assert.equal(got.name, n, `name: ${n}`);
    assert.equal(got.url, u, `url: ${u}`);
  }
});

test('config value assignment never executes shell', () => {
  /* If config.env were sourced, this would write the marker file. */
  const r = sh(
    'MARKER="$RT_ROOT/pwned"; ' +
    'rt_config_write "x\\$(touch \'"$MARKER"\')" "" "" ""; ' +
    'rt_config_get_text SERVICE_NAME_B64 >/dev/null; ' +
    '[ -e "$MARKER" ] && echo EXECUTED || echo SAFE',
  );
  assert.equal(r.out, 'SAFE');
});

test('config get returns the last assignment (append-wins)', () => {
  const r = sh(
    'printf "SERVICE_NAME_B64=%s\\n" "$(printf first | rt_b64_encode)" > "$RT_CONFIG"; ' +
    'printf "SERVICE_NAME_B64=%s\\n" "$(printf second | rt_b64_encode)" >> "$RT_CONFIG"; ' +
    'rt_config_get_text SERVICE_NAME_B64',
  );
  assert.equal(r.out, 'second');
});

test('rt_cleanup returns success even with nothing to clean (EXIT-trap safety)', () => {
  /* Regression: the entry scripts and the CLI run rt_cleanup from an EXIT trap.
     A non-zero return there becomes the process exit status, which made a
     perfectly good `help`/`version`/passing-`verify` exit 1. With an empty
     RT_TMP_TO_CLEAN the cleanup loop's final test leaked its non-zero status. */
  assert.ok(ok('rt_cleanup'), 'exits 0 with the default (unset/empty) list');
  assert.ok(ok('RT_TMP_TO_CLEAN=(); rt_cleanup'), 'exits 0 with an explicit empty array');
  assert.ok(ok('d="$(mktemp -d)"; RT_TMP_TO_CLEAN=("$d"); rt_cleanup; test ! -d "$d"'),
    'still removes a registered temp dir and returns 0');
});

test('logo validation trusts content signatures, not extensions', () => {
  const mk = (bytes) =>
    `printf '${bytes}' > "$RT_ROOT/l"; head -c 4096 /dev/zero >> "$RT_ROOT/l"; `;
  assert.equal(sh(mk('\\x89PNG\\r\\n\\x1a\\n') + 'rt_logo_validate "$RT_ROOT/l"').out, 'image/png');
  assert.equal(sh(mk('\\xff\\xd8\\xff\\xe0') + 'rt_logo_validate "$RT_ROOT/l"').out, 'image/jpeg');
  assert.equal(sh(mk('RIFF\\x00\\x00\\x00\\x00WEBP') + 'rt_logo_validate "$RT_ROOT/l"').out, 'image/webp');
  /* An SVG is XML/executable markup, not a raster image — rejected. */
  assert.ok(!ok(mk('<svg xmlns=\\x27a\\x27>') + 'rt_logo_validate "$RT_ROOT/l"'));
  assert.ok(!ok(mk('GIF89a') + 'rt_logo_validate "$RT_ROOT/l"'), 'gif not in allow-list');
  assert.ok(!ok(mk('#!/bin/sh\\n') + 'rt_logo_validate "$RT_ROOT/l"'), 'script rejected');
});

test('logo validation enforces the size cap and rejects empty/missing', () => {
  assert.ok(!ok(
    'printf "\\x89PNG\\r\\n\\x1a\\n" > "$RT_ROOT/big"; ' +
    'head -c 300000 /dev/zero >> "$RT_ROOT/big"; ' +
    'rt_logo_validate "$RT_ROOT/big"',
  ), 'over 256 KiB rejected');
  assert.ok(!ok(': > "$RT_ROOT/empty"; rt_logo_validate "$RT_ROOT/empty"'), 'empty rejected');
  assert.ok(!ok('rt_logo_validate "$RT_ROOT/does-not-exist"'), 'missing rejected');
});

test('sha256 verification has no override and rejects any mismatch', () => {
  assert.ok(ok(
    'printf payload > "$RT_ROOT/f"; ' +
    'rt_verify_sha256 "$RT_ROOT/f" "$(rt_sha256 "$RT_ROOT/f")"',
  ), 'correct checksum matches');
  assert.ok(!ok(
    'printf payload > "$RT_ROOT/f"; rt_verify_sha256 "$RT_ROOT/f" "$(printf %064d 0)"',
  ), 'wrong checksum rejected');
  assert.ok(!ok('printf x > "$RT_ROOT/f"; rt_verify_sha256 "$RT_ROOT/f" "deadbeef"'),
    'short/garbage checksum rejected');
  assert.ok(!ok('rt_verify_sha256 "$RT_ROOT/nope" "$(printf %064d 0)"'),
    'missing file rejected');
});

test('SHA256SUMS lookup finds the entry for a basename', () => {
  const body =
    'S="$RT_ROOT/SHA256SUMS"; ' +
    'printf "%s  a.tar.gz\\n" "$(printf %064d 1)" > "$S"; ' +
    'printf "%s  b.tar.gz\\n" "$(printf %064d 2)" >> "$S"; ';
  assert.equal(sh(body + 'rt_sums_lookup b.tar.gz "$S"').out, '0'.repeat(63) + '2');
  assert.equal(sh(body + 'rt_sums_lookup missing.tar.gz "$S"').out, '');
});

test('manifest parsing reads values as data, last wins', () => {
  const body =
    'M="$RT_ROOT/manifest.txt"; ' +
    'printf "version=0.9.0-dev\\n" > "$M"; ' +
    'printf "artifact=row-template-0.9.0-dev.tar.gz\\n" >> "$M"; ' +
    'printf "note=a=b=c\\n" >> "$M"; ' +
    'printf "version=1.0.0\\n" >> "$M"; ';
  assert.equal(sh(body + 'rt_manifest_get artifact "$M"').out, 'row-template-0.9.0-dev.tar.gz');
  assert.equal(sh(body + 'rt_manifest_get note "$M"').out, 'a=b=c', 'value keeps its = signs');
  assert.equal(sh(body + 'rt_manifest_get version "$M"').out, '1.0.0', 'last wins');
});

/* Generation needs the real artifact; splice branding into a copy of it. */
const GEN_SETUP = 'cp template/index.html "$RT_DIST"; ';

test('generation injects branding and always passes the structural gate', () => {
  const r = sh(
    GEN_SETUP +
    'rt_config_write "Nova Proxy" "https://t.me/nova" "" ""; ' +
    'OUT="$RT_ROOT/out.html"; rt_generate "$RT_DIST" "$OUT"; ' +
    'echo CODE=$?; ' +
    'grep -c "Nova Proxy" "$OUT"; ' +
    'awk "/row:branding \\*\\//{f=1} f{print} /row:branding end/{exit}" "$OUT" | grep -c "supportUrl"',
  );
  assert.equal(r.code, 0);
  assert.match(r.out, /CODE=0/);
});

test('generation escapes a </script> payload in the service name', () => {
  const nb = Buffer.from('</script><script>alert(1)</script>', 'utf8').toString('base64');
  const r = sh(
    GEN_SETUP +
    `N="$(printf %s ${nb} | base64 -d)"; rt_config_write "$N" "" "" ""; ` +
    'OUT="$RT_ROOT/out.html"; rt_generate "$RT_DIST" "$OUT"; ' +
    'BLK="$(awk "/row:branding \\*\\//{f=1} f{print} /row:branding end/{exit}" "$OUT")"; ' +
    'printf %s "$BLK" | grep -o "u003c/script>" | wc -l; ' +
    'printf "RAW=%s\\n" "$(printf %s "$BLK" | grep -c "</script>")"',
  );
  /* the branding block contains the escaped form twice and no raw closing tag. */
  assert.match(r.out, /^\s*2$/m, 'both </script> in the payload were escaped');
  assert.match(r.out, /RAW=0/, 'no unescaped </script> inside the block');
});

test('the structural gate rejects a template it cannot trust', () => {
  assert.ok(!ok('printf "<html>tiny</html>" > "$RT_ROOT/t"; rt_validate_template "$RT_ROOT/t"'),
    'too small / not a full doc');
  assert.ok(!ok(
    GEN_SETUP +
    'printf "\\n" >> "$RT_DIST"; ' +   // artifact still fine, but strip markers below
    'sed "s#/\\* row:branding \\*/##" "$RT_DIST" > "$RT_ROOT/nomark"; ' +
    'rt_generate "$RT_ROOT/nomark" "$RT_ROOT/out.html"',
  ), 'generation refuses an artifact missing its markers');
});

/* Fabricate valid backups with deterministic, sortable names so ordering and
   pruning are tested without sleeping on the clock. */
const MKB =
  'mkb(){ local d="$RT_BACKUPS/$1"; mkdir -p "$d"; ' +
  'printf "%s" "$1" > "$d/template.html"; ' +
  'rt_sha256 "$d/template.html" > "$d/template.html.sha256"; }; ';

test('backup create captures a validatable snapshot', () => {
  const r = sh(
    GEN_SETUP +
    'printf "0.9.0-dev\\n" > "$RT_VERSION_FILE"; ' +
    'rt_config_write "X" "" "" ""; ' +
    'D="$(rt_backup_create)"; ' +
    'rt_backup_validate "$D" && echo VALID; ' +
    'test -f "$D/template.html.sha256" && echo HASSUM; ' +
    'test -f "$D/config.env" && echo HASCFG; ' +
    'test -f "$D/VERSION" && echo HASVER',
  );
  assert.match(r.out, /VALID/);
  assert.match(r.out, /HASSUM/);
  assert.match(r.out, /HASCFG/);
  assert.match(r.out, /HASVER/);
});

test('backup selection returns newest first and prune keeps the N newest', () => {
  const names = [
    '20260101T000000Z__0.7.0',
    '20260201T000000Z__0.8.0',
    '20260301T000000Z__0.9.0',
    '20260401T000000Z__1.0.0',
  ];
  const setup = MKB + names.map((n) => `mkb ${n}; `).join('');
  const list = sh(setup + 'rt_backups_list | sed "s#.*/##"').out.split('\n');
  assert.deepEqual(list, [...names].reverse(), 'newest first');
  assert.equal(sh(setup + 'basename "$(rt_backup_latest)"').out, names[3]);

  const afterPrune = sh(setup + 'rt_backups_prune 2; rt_backups_list | sed "s#.*/##"').out.split('\n');
  assert.deepEqual(afterPrune, [names[3], names[2]], 'kept the two newest');
});

test('a corrupt backup is excluded and never counted or pruned', () => {
  const r = sh(
    MKB +
    'mkb 20260101T000000Z__good; ' +
    'bd="$RT_BACKUPS/20260201T000000Z__bad"; mkdir -p "$bd"; ' +
    'printf real > "$bd/template.html"; ' +
    'printf "%s  template.html\\n" "$(printf %064d 0)" > "$bd/template.html.sha256"; ' +
    'rt_backups_list | sed "s#.*/##"',
  );
  assert.equal(r.out, '20260101T000000Z__good', 'only the valid backup is listed');
});

test('recursive delete is refused outside the backups tree', () => {
  assert.ok(!ok('rt_safe_rmdir "$RT_ROOT"'), 'RT_ROOT itself is not a backup');
  assert.ok(!ok('rt_safe_rmdir /tmp'), 'system path refused');
  assert.ok(!ok('rt_safe_rmdir ""'), 'empty refused');
  assert.ok(ok(
    'd="$RT_BACKUPS/20260101T000000Z__x"; mkdir -p "$d"; ' +
    'rt_safe_rmdir "$d"; test ! -e "$d"',
  ), 'a real backup dir is removed');
});

test('containment check resolves traversal before comparing', () => {
  assert.ok(ok('rt_is_within "$RT_BACKUPS" "$RT_BACKUPS/a/b"'));
  assert.ok(!ok('rt_is_within "$RT_BACKUPS" "$RT_BACKUPS/../evil"'), '.. escapes the base');
  assert.ok(!ok('rt_is_within "$RT_BACKUPS" "/etc/passwd"'));
});

test('symlinked targets are refused for write and delete', { skip: platform() !== 'linux' }, () => {
  assert.ok(!ok('ln -s /etc/hosts "$RT_ROOT/link"; rt_assert_not_symlink "$RT_ROOT/link"'));
  assert.ok(!ok(
    'mkdir -p "$RT_BACKUPS"; ln -s /tmp "$RT_BACKUPS/evil"; rt_safe_rmdir "$RT_BACKUPS/evil"',
  ), 'a symlinked backup entry is not followed');
});

/* Stage a minimal but real release under RT_ROOT/rel: the pristine artifact,
   VERSION, lib and a stub CLI, packed into a versioned tarball with a manifest
   and a SHA256SUMS the loader must honour. Exercises the download-free
   (RT_RELEASE_DIR) acquisition path end to end. */
const STAGE = [
  'stage_release(){',
  '  local rel="$1"; mkdir -p "$rel";',
  '  local pay="$RT_ROOT/pay/row-template-0.9.0-dev"; rm -rf "$RT_ROOT/pay"; mkdir -p "$pay/lib" "$pay/bin";',
  '  cp template/index.html "$pay/template.html";',
  '  cp VERSION "$pay/VERSION";',
  '  cp installer/lib/row-template.sh "$pay/lib/row-template.sh";',
  '  : > "$pay/bin/row-template";',
  '  tar -C "$RT_ROOT/pay" -czf "$rel/row-template-0.9.0-dev.tar.gz" row-template-0.9.0-dev;',
  '  printf "artifact=row-template-0.9.0-dev.tar.gz\\nversion=0.9.0-dev\\n" > "$rel/manifest.txt";',
  '  printf "%s  row-template-0.9.0-dev.tar.gz\\n" "$(rt_sha256 "$rel/row-template-0.9.0-dev.tar.gz")" > "$rel/SHA256SUMS";',
  '}',
  '',
].join('\n');

test('release fetch verifies the checksum and extracts a usable payload', () => {
  const r = sh(STAGE +
    'stage_release "$RT_ROOT/rel"; export RT_RELEASE_DIR="$RT_ROOT/rel"; ' +
    'P="$(rt_fetch_release "$(mktemp -d)")"; ' +
    'test -f "$P/template.html" && echo HAS_TEMPLATE; ' +
    'test -f "$P/lib/row-template.sh" && echo HAS_LIB; ' +
    'rt_validate_template "$P/template.html" >/dev/null 2>&1 && echo VALID; ' +
    'basename "$P"');
  assert.match(r.out, /HAS_TEMPLATE/);
  assert.match(r.out, /HAS_LIB/);
  assert.match(r.out, /VALID/);
  assert.match(r.out, /row-template-0\.9\.0-dev/, 'descended into the single top-level dir');
});

test('single-top detects exactly one child directory', () => {
  assert.equal(sh('d="$RT_ROOT/s"; mkdir -p "$d/only"; rt_single_top "$d" | sed "s#.*/##"').out, 'only');
  assert.ok(!ok('d="$RT_ROOT/s2"; mkdir -p "$d/a" "$d/b"; rt_single_top "$d"'), 'two children => none');
  assert.ok(!ok('d="$RT_ROOT/s3"; mkdir -p "$d"; printf x > "$d/f"; rt_single_top "$d"'), 'a lone file is not a top dir');
});

test('release fetch aborts on a bad, missing, or unsafe checksum/manifest', () => {
  const base = STAGE + 'stage_release "$RT_ROOT/rel"; ';
  /* corrupt the artifact after its checksum was recorded */
  assert.ok(!ok(base +
    'printf x >> "$RT_ROOT/rel/row-template-0.9.0-dev.tar.gz"; ' +
    'RT_RELEASE_DIR="$RT_ROOT/rel" rt_fetch_release "$(mktemp -d)"'),
    'corrupt artifact rejected');
  /* an empty SHA256SUMS has no entry for the artifact — there is no override */
  assert.ok(!ok(base +
    ': > "$RT_ROOT/rel/SHA256SUMS"; ' +
    'RT_RELEASE_DIR="$RT_ROOT/rel" rt_fetch_release "$(mktemp -d)"'),
    'missing checksum rejected');
  /* a traversal artifact name in the manifest is refused before any fetch */
  assert.ok(!ok(base +
    'printf "artifact=../evil.tar.gz\\n" > "$RT_ROOT/rel/manifest.txt"; ' +
    'RT_RELEASE_DIR="$RT_ROOT/rel" rt_fetch_release "$(mktemp -d)"'),
    'unsafe artifact name rejected');
});

test('archive extraction rejects traversal paths but allows clean ones', () => {
  const mkEvil =
    'd="$RT_ROOT/mk"; mkdir -p "$d/sub"; printf hi > "$d/sub/f"; ' +
    'tar -C "$d" -czf "$RT_ROOT/evil.tgz" --transform "s,^,../," sub 2>/dev/null; ';
  assert.ok(!ok(mkEvil + 'rt_tar_extract_safe "$RT_ROOT/evil.tgz" "$(mktemp -d)"'),
    'traversal path refused');
  const mkOk =
    'd="$RT_ROOT/ok"; mkdir -p "$d/sub"; printf hi > "$d/sub/f"; ' +
    'tar -C "$d" -czf "$RT_ROOT/ok.tgz" sub; ';
  assert.ok(ok(mkOk + 'o="$(mktemp -d)"; rt_tar_extract_safe "$RT_ROOT/ok.tgz" "$o"; test -f "$o/sub/f"'),
    'a clean archive extracts');
});

test('restore-from-backup reinstates artifact + VERSION but keeps current config', () => {
  /* A rollback must bring back the old template and version, yet preserve the
     admin's CURRENT branding — restoring stale config would silently undo a
     rename the admin made after the backup. The template identity is now
     re-derived from the artifact against the store, so a store entry for the
     backed-up design is part of the fixture; without a matching entry the
     restore falls back to the meta's template= or Row (see next test). */
  const r = sh(GEN_SETUP +
    'printf "0.8.0\\n" > "$RT_VERSION_FILE"; rt_config_write "OldName" "" "" ""; ' +
    'rt_set_dist "$RT_DIST" >/dev/null; ' +
    'B="$(rt_backup_create)"; ' +
    'mkdir -p "$RT_TEMPLATE_STORE/row"; ' +
    'cp "$B/template.html" "$RT_TEMPLATE_STORE/row/template.html"; ' +
    'rt_sha256 "$B/template.html" > "$RT_TEMPLATE_STORE/row/template.html.sha256"; ' +
    'printf "0.9.0\\n" > "$RT_VERSION_FILE"; rt_config_write "NewName" "https://t.me/x" "" ""; ' +
    'rt_restore_from_backup "$B" >/dev/null && echo RESTORED; ' +
    'printf "VER=%s\\n" "$(cat "$RT_VERSION_FILE")"; ' +
    'printf "NAME=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"');
  assert.match(r.out, /RESTORED/);
  assert.match(r.out, /VER=0\.8\.0/, 'the backed-up version is reinstated');
  assert.match(r.out, /NAME=NewName/, 'the current admin config is preserved, not reverted');
});

test('restore-from-backup falls back to Row when no store match and no meta template', () => {
  /* A v1.1.0-generated backup has no template= in its meta and its artifact
     may not match any entry in the current store. The restore must not refuse —
     it defaults to Row so the artifact and the persisted selection always agree.
     This is the path that previously hard-failed and blocked rollback from a
     fresh install. */
  const r = sh(GEN_SETUP +
    'printf "0.8.0\\n" > "$RT_VERSION_FILE"; rt_config_write "OldName" "" "" ""; ' +
    'rt_set_dist "$RT_DIST" >/dev/null; ' +
    'B="$(rt_backup_create)"; ' +
    'printf "0.9.0\\n" > "$RT_VERSION_FILE"; rt_config_write "NewName" "https://t.me/x" "" ""; ' +
    'rt_restore_from_backup "$B" >/dev/null && echo RESTORED; ' +
    'printf "VER=%s\\n" "$(cat "$RT_VERSION_FILE")"; ' +
    'printf "NAME=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"; ' +
    'printf "TPL=%s\\n" "$(rt_config_get_raw TEMPLATE)"; ' +
    'cmp -s "$RT_DIST" "$B/template.html" && echo "artifact-matches-source"');
  assert.match(r.out, /RESTORED/, 'no store match falls back to Row');
  assert.match(r.out, /VER=0\.8\.0/, 'the backed-up version is reinstated');
  assert.match(r.out, /NAME=NewName/, 'the current admin config is preserved, not reverted');
  assert.match(r.out, /TPL=row/, 'the selection defaults to Row');
  assert.match(r.out, /artifact-matches-source/, 'the restored artifact is the backed-up bytes');
});

test('restore-from-backup ignores an unknown template= in meta and defaults to Row', () => {
  /* If the backup's meta records a template id the current release does not
     recognise (e.g. a design removed or renamed since the backup was taken),
     restoring that id would produce a stale selection. The restore falls back
     to Row instead, keeping the artifact and the selection in agreement. */
  const r = sh(GEN_SETUP +
    'printf "0.8.0\\n" > "$RT_VERSION_FILE"; rt_config_write "OldName" "" "" ""; ' +
    'rt_set_dist "$RT_DIST" >/dev/null; ' +
    'B="$(rt_backup_create)"; ' +
    'printf "template=ghost\\n" >> "$B/meta"; ' +
    'printf "0.9.0\\n" > "$RT_VERSION_FILE"; rt_config_write "NewName" "https://t.me/x" "" ""; ' +
    'rt_restore_from_backup "$B" >/dev/null && echo RESTORED; ' +
    'printf "TPL=%s\\n" "$(rt_config_get_raw TEMPLATE)"');
  assert.match(r.out, /RESTORED/, 'unknown meta template does not block restore');
  assert.match(r.out, /TPL=row/, 'an unknown recorded template falls back to Row');
});

test('archive extraction rejects a symlink member even when its name is clean',
  { skip: platform() !== 'linux' }, () => {
  /* The name "link" is traversal-free, so it clears the path screen; it must be
     caught by the member-type screen because a symlink could redirect a later
     write outside the extraction dir when tar follows it. */
  const mk =
    'd="$RT_ROOT/lk"; mkdir -p "$d"; ln -s /etc/hosts "$d/link"; printf hi > "$d/reg"; ' +
    'tar -C "$d" -czf "$RT_ROOT/lk.tgz" link reg; ';
  assert.ok(!ok(mk + 'rt_tar_extract_safe "$RT_ROOT/lk.tgz" "$(mktemp -d)"'),
    'a symlink member is refused');
});

test('release fetch requires https for a URL source (no silent http downgrade)', () => {
  const httpBad = sh('RT_RELEASE_URL="http://example.invalid/rel" rt_fetch_release "$(mktemp -d)"');
  assert.notEqual(httpBad.code, 0, 'http:// is refused by default');
  assert.match(httpBad.err, /https/i, 'the refusal names the https requirement');
  const ftpBad = sh('RT_RELEASE_URL="ftp://example.invalid/rel" rt_fetch_release "$(mktemp -d)"');
  assert.notEqual(ftpBad.code, 0, 'a non-http(s) scheme is refused');
});

test('the default release source is the public GitHub stable channel over https', () => {
  /* With no RT_RELEASE_DIR / RT_RELEASE_URL, a normal user must reach the public
     stable channel with zero configuration: releases/latest/download resolves to
     the newest published, non-prerelease release over https, no API token. */
  const r = sh('unset RT_RELEASE_DIR RT_RELEASE_URL; rt_release_source; ' +
    'printf "KIND=%s\\nBASE=%s\\n" "$RT_SRC_KIND" "$RT_SRC_BASE"');
  assert.match(r.out, /KIND=url/, 'no env => a url source');
  assert.match(r.out,
    /BASE=https:\/\/github\.com\/frank0live\/Row-Template\/releases\/latest\/download/,
    'defaults to the GitHub releases/latest/download channel');
});

test('remote version reads the manifest without downloading the artifact', () => {
  const r = sh(STAGE +
    'stage_release "$RT_ROOT/rel"; ' +
    'v="$(RT_RELEASE_DIR="$RT_ROOT/rel" rt_remote_version)"; printf "V=%s\\n" "$v"');
  assert.match(r.out, /V=0\.9\.0-dev/, 'the advertised manifest version is returned');
});

test('manager update reports "up to date" when installed matches available', () => {
  const r = sh(STAGE +
    'stage_release "$RT_ROOT/rel"; printf "0.9.0-dev\\n" > "$RT_VERSION_FILE"; ' +
    'RT_RELEASE_DIR="$RT_ROOT/rel" rt_manager_update </dev/null');
  assert.match(r.out, /Installed/, 'shows the installed version');
  assert.match(r.out, /Available/, 'shows the available version');
  assert.match(r.out + r.err, /up to date/i, 'equal versions read as up to date');
});

test('manager update reports "unable to check" when the source is unreachable', () => {
  /* A missing/unreachable source must never masquerade as a damaged install. */
  const r = sh('RT_RELEASE_DIR="$RT_ROOT/does-not-exist" rt_manager_update </dev/null');
  assert.match(r.out + r.err, /Unable to check/i, 'a failed check is reported, not a failure');
});

test('render smoke classifies a large served page as pass, not a SIGPIPE miss',
  { skip: platform() !== 'linux' }, () => {
  /* Regression: the classifier used `printf %s "$body" | grep -q PAT`. Under
     `set -o pipefail` grep -q exits on the first hit, printf dies with SIGPIPE
     (141) writing the long tail, and pipefail promotes 141 to the pipeline
     status — so the real ~160 KB Row-Template page (early `id="sub-data"`
     match) was misread as 'fallback'. Drive the SHIPPED function through a
     file:// URL with a >64 KB body whose marker is at the very top. */
  const big =
    'f="$(mktemp)"; { printf "%s" \'<!doctype html><div id="sub-data">\'; ' +
    'head -c 300000 /dev/zero | tr "\\0" x; printf "</div>"; } > "$f"; ';
  const hit = sh(big + 'RT_SMOKE_URL="file://$f" rt_render_smoke; rm -f "$f"');
  assert.equal(hit.out, 'pass', 'a large page containing the marker is served (pass)');

  /* A large page WITHOUT the marker must still classify as fallback. */
  const miss = sh(
    'f="$(mktemp)"; head -c 300000 /dev/zero | tr "\\0" x > "$f"; ' +
    'RT_SMOKE_URL="file://$f" rt_render_smoke; rm -f "$f"');
  assert.equal(miss.out, 'fallback', 'a large page missing the marker is a fallback');
});

test('systemd unit detection survives pipefail when the unit list is long',
  { skip: platform() !== 'linux' }, () => {
  /* Regression: rt_detect_xui matched the unit with `systemctl list-unit-files
     | grep -q '^x-ui\.service'`. Under `set -o pipefail` grep -q closes the pipe
     on the first hit, systemctl dies of SIGPIPE (141) writing the long tail, and
     pipefail promotes 141 to the pipeline status — so the `if` read false and
     RT_XUI_UNIT was left empty on a real box, surfacing as "Service: not
     detected" while the version (which needs no pipe) still showed. Stub a
     systemctl whose list is far bigger than the pipe buffer, x-ui.service on top. */
  const stub =
    'mkdir -p "$RT_ROOT/fakebin"; ' +
    'cat > "$RT_ROOT/fakebin/systemctl" <<\'EOF\'\n' +
    '#!/usr/bin/env bash\n' +
    'if [ "$1" = list-unit-files ]; then\n' +
    '  echo "x-ui.service enabled"\n' +
    '  for i in $(seq 1 6000); do echo "filler-$i.service enabled"; done\n' +
    'fi\n' +
    'exit 0\n' +
    'EOF\n' +
    'chmod +x "$RT_ROOT/fakebin/systemctl"; ' +
    'export PATH="$RT_ROOT/fakebin:$PATH"; ';
  const r = sh(stub + 'rt_detect_xui; echo "rc=$? UNIT=${RT_XUI_UNIT:-<empty>}"');
  assert.match(r.out, /UNIT=x-ui\.service/, 'the unit is detected despite the long list');
  assert.match(r.out, /rc=0/, 'detection reports success when the unit is present');
});

/* ---- interactive installer & manager UX ----------------------------------
   These exercise the presentation layer through the SHIPPED library. spawnSync
   gives the snippet a piped (non-TTY) stdout, so rt_ui_is_interactive() is false
   and RT_C_* colour is empty — exactly the automation/CI/curl|bash path. Prompts
   are driven by feeding stdin (or /dev/null for EOF) so nothing can hang. */

test('rt_ui_confirm takes the default on EOF and honours explicit input', () => {
  assert.equal(sh('rt_ui_confirm "Q" yes </dev/null && echo Y || echo N').out, 'Y', 'EOF + default yes');
  assert.equal(sh('rt_ui_confirm "Q" no  </dev/null && echo Y || echo N').out, 'N', 'EOF + default no');
  assert.equal(sh('printf "y\\n" | { rt_ui_confirm "Q" no  && echo Y || echo N; }').out, 'Y', 'explicit yes beats default no');
  assert.equal(sh('printf "n\\n" | { rt_ui_confirm "Q" yes && echo Y || echo N; }').out, 'N', 'explicit no beats default yes');
  assert.equal(sh('printf "\\n"  | { rt_ui_confirm "Q" yes && echo Y || echo N; }').out, 'Y', 'a blank line takes the default');
});

test('rt_ui_menu_select validates, re-prompts on junk, and never spins on EOF', () => {
  assert.equal(sh('printf "x\\n9\\n2\\n" | rt_ui_menu_select 3').out, '2', 'junk + out-of-range rejected, 2 accepted');
  assert.equal(sh('rt_ui_menu_select 5 </dev/null').out, '0', 'EOF returns 0 (Exit) so a non-TTY caller cannot spin');
  assert.equal(sh('printf "0\\n" | rt_ui_menu_select 5').out, '0', '0 is a valid selection');
  assert.equal(sh('printf "7\\n" | rt_ui_menu_select 7').out, '7', 'the maximum is inclusive');
});

test('rt_status_theme reports evidence-based tokens, not mere file presence', () => {
  assert.equal(sh('rt_status_theme').out, 'notinstalled', 'no VERSION file => not installed');
  assert.equal(sh('printf "0.9.0-dev\\n" > "$RT_VERSION_FILE"; rt_status_theme').out, 'damaged',
    'version present but template missing => damaged');
  const unknown = sh(GEN_SETUP + 'cp template/index.html "$RT_LIVE"; ' +
    'printf "0.9.0-dev\\n" > "$RT_VERSION_FILE"; rt_status_theme');
  assert.equal(unknown.out, 'unknown', 'installed but unverifiable without sqlite3/DB => unknown, never a bare "active"');
});

test('rt_status labels map every token to a human string', () => {
  assert.match(sh('rt_status_label active').out, /Active/);
  assert.match(sh('rt_status_label inactive').out, /Not active/);
  assert.match(sh('rt_status_label unknown').out, /unverified/i);
  assert.match(sh('rt_status_label damaged').out, /damaged/i);
  assert.match(sh('rt_status_label notinstalled').out, /Not installed/);
  assert.match(sh('rt_status_theme_label active').out, /Row-Template \(active\)/);
});
test('the UI header carries the project identity and emits no ANSI when not a TTY', () => {
  const h = sh('rt_ui_header');
  assert.match(h.out, /Row-Template/, 'project name shown');
  assert.match(h.out, /frank0live/, 'developer shown');
  assert.ok(!/\x1b\[/.test(h.out), 'no ANSI escapes on a non-terminal stdout');
  assert.ok(!/\x1b\[/.test(sh('NO_COLOR=1 rt_ui_header').out), 'NO_COLOR also yields plain text');
});

test('help advertises the identity, the interactive manager and the menu command', () => {
  const h = sh('rt_print_help');
  assert.match(h.out, /github\.com\/frank0live\/Row-Template/, 'GitHub URL present');
  assert.match(h.out, /by frank0live/, 'developer credited');
  assert.match(h.out, /^\s*menu\b/m, 'the explicit menu command is documented');
  assert.match(h.out, /interactive manager/i, 'the no-arg interactive behaviour is documented');
});

test('the CLI dispatcher routes no-arg non-TTY to help and never blocks', () => {
  const bin = 'RT_LIB_OVERRIDE="$PWD/installer/lib/row-template.sh" bash installer/bin/row-template';
  const noargs = sh(`${bin} </dev/null`);
  assert.equal(noargs.code, 0, 'a no-arg non-interactive run exits cleanly instead of opening a blocking menu');
  assert.match(noargs.out + noargs.err, /Usage/, 'it printed help');
  const help = sh(`${bin} help </dev/null`);
  assert.equal(help.code, 0);
  assert.match(help.out, /frank0live/);
  assert.equal(sh(`${bin} not-a-command </dev/null`).code, 2, 'an unknown command exits 2');
});

test('the existing-install re-run menu maps each choice to one stable token', () => {
  const setup = 'printf "0.9.0-dev\\n" > "$RT_VERSION_FILE"; ';
  assert.equal(sh(setup + 'rt_existing_install_menu </dev/null').out, 'exit', 'EOF => exit (no changes)');
  assert.equal(sh(setup + 'printf "1\\n" | rt_existing_install_menu').out, 'manager');
  assert.equal(sh(setup + 'printf "2\\n" | rt_existing_install_menu').out, 'reconfigure');
  assert.equal(sh(setup + 'printf "3\\n" | rt_existing_install_menu').out, 'update');
  assert.equal(sh(setup + 'printf "4\\n" | rt_existing_install_menu').out, 'repair');
});
test('the pre-commit summary reflects the branding, defaults to yes, and never prints the URL', () => {
  const setup = 'rt_config_write "Nova Proxy" "https://t.me/nova" "" ""; ';
  assert.equal(sh(setup + 'rt_install_summary_confirm </dev/null >/dev/null 2>&1 && echo GO || echo STOP').out,
    'GO', 'EOF takes the default (yes) so the confirm never hangs');
  const shown = sh(setup + 'rt_install_summary_confirm </dev/null 2>/dev/null');
  assert.match(shown.out, /Nova Proxy/, 'the service name is echoed back');
  assert.match(shown.out, /Support URL\s+configured/, 'the support URL is shown as configured');
  assert.ok(!/t\.me\/nova/.test(shown.out), 'the support URL itself is never printed (redaction-by-construction)');
});

test('the install success screen only claims Active when activation was verified', () => {
  const setup = 'printf "0.9.0-dev\\n" > "$RT_VERSION_FILE"; rt_config_write "Nova" "" "" ""; ';
  const auto = sh(setup + 'rt_install_success_screen auto');
  assert.match(auto.out, /Theme\s+Active/, 'a verified auto activation is reported as Active');
  for (const oc of ['manual', 'skipped']) {
    const r = sh(setup + `rt_install_success_screen ${oc}`);
    assert.ok(!/Theme\s+Active/.test(r.out), `${oc} never shows "Theme Active"`);
    assert.match(r.out, /Manual activation required/, `${oc} => manual activation required`);
    assert.match(r.out, /Sub Theme Directory/i, `${oc} shows the exact panel step`);
    /* the guidance shows the RESOLVED install dir ($RT_ROOT), not a hardcoded
       literal — in production that is /etc/3x-ui/sub_templates/row-template. */
    assert.match(r.out, /Enter exactly\s+\S+\/rt\b/, `${oc} tells the operator the exact directory to enter`);
  }
});

test('activation degrades honestly to manual guidance when sqlite3/DB is unavailable', () => {
  const r = sh('printf "0.9.0-dev\\n" > "$RT_VERSION_FILE"; RT_XUI_DB="" rt_manager_activate </dev/null');
  assert.equal(r.code, 0, 'it returns to the caller instead of crashing');
  const all = r.out + '\n' + r.err;
  assert.match(all, /Sub Theme Directory/i, 'it explains the manual panel step');
  assert.match(all, /Enter exactly\s+\S+\/rt\b/, 'and gives the exact directory to enter');
});

/* --- template selection lifecycle -----------------------------------------
   These cases drive the whole store/switch/rollback/update machinery against
   real artifacts. The artifacts are written from Node (they are ~200 KB each;
   argv could never carry them) into a prepared install root that the snippet
   then sources the library against. */

const ROW_HTML = build(true).html;
const EDITORIAL_HTML = build(true, 'editorial').html;
const CANVAS_HTML = build(true, 'canvas').html;
const PRISM_HTML = build(true, 'prism').html;
const TERMINAL_HTML = build(true, 'terminal').html;
const PULSE_HTML = build(true, 'pulse').html;
const BRUTAL_HTML = build(true, 'brutal').html;
const ARCADE_HTML = build(true, 'arcade').html;
const SKETCH_HTML = build(true, 'sketch').html;
const SIGNATURE_HTML = build(true, 'signature').html;
const SAFFRON_HTML = build(true, 'saffron').html;
const ROW_SHA = createHash('sha256').update(ROW_HTML).digest('hex');
const EDI_SHA = createHash('sha256').update(EDITORIAL_HTML).digest('hex');
const CANVAS_SHA = createHash('sha256').update(CANVAS_HTML).digest('hex');
const PRISM_SHA = createHash('sha256').update(PRISM_HTML).digest('hex');
const TERMINAL_SHA = createHash('sha256').update(TERMINAL_HTML).digest('hex');
const PULSE_SHA = createHash('sha256').update(PULSE_HTML).digest('hex');
const BRUTAL_SHA = createHash('sha256').update(BRUTAL_HTML).digest('hex');
const ARCADE_SHA = createHash('sha256').update(ARCADE_HTML).digest('hex');
const SKETCH_SHA = createHash('sha256').update(SKETCH_HTML).digest('hex');
const SIGNATURE_SHA = createHash('sha256').update(SIGNATURE_HTML).digest('hex');
const SAFFRON_SHA = createHash('sha256').update(SAFFRON_HTML).digest('hex');

function writeArtifact(dir, html, sha) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'template.html'), html);
  writeFileSync(join(dir, 'template.html.sha256'), sha + '  template.html\n');
}

/* Run a snippet against a Node-prepared install root. `prepare` receives the
   POSIX-style root path before bash starts. No release source is reachable:
   the manager, config and verify complete an incomplete install by
   downloading, and a test must never reach the network. A test that needs a
   payload redefines rt_fetch_release in its body. */
function shRoot(body, { input, prepare, env } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'row-t-')).replace(/\\/g, '/');
  try {
    if (prepare) prepare(root);
    const r = spawnSync(
      'bash',
      ['-c', 'set -Eeuo pipefail\nexport RT_ROOT="' + root + '"\nsource installer/lib/row-template.sh\n' +
        'rt_fetch_release(){ return 1; }\n' + body],
      { cwd: ROOT, encoding: 'utf8', input, env: env ? { ...process.env, ...env } : undefined },
    );
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/* A complete installed state: both store designs, Row canonical + sidecar, a
   live file, VERSION and a Row config with branding set. */
function prepareInstall(root) {
  const store = join(root, 'dist', 'templates');
  writeArtifact(join(store, 'row'), ROW_HTML, ROW_SHA);
  writeArtifact(join(store, 'editorial'), EDITORIAL_HTML, EDI_SHA);
  writeArtifact(join(store, 'canvas'), CANVAS_HTML, CANVAS_SHA);
  writeArtifact(join(store, 'prism'), PRISM_HTML, PRISM_SHA);
  writeArtifact(join(store, 'terminal'), TERMINAL_HTML, TERMINAL_SHA);
  writeArtifact(join(store, 'pulse'), PULSE_HTML, PULSE_SHA);
  writeArtifact(join(store, 'brutal'), BRUTAL_HTML, BRUTAL_SHA);
  writeArtifact(join(store, 'arcade'), ARCADE_HTML, ARCADE_SHA);
  writeArtifact(join(store, 'sketch'), SKETCH_HTML, SKETCH_SHA);
  writeArtifact(join(store, 'signature'), SIGNATURE_HTML, SIGNATURE_SHA);
  writeArtifact(join(store, 'saffron'), SAFFRON_HTML, SAFFRON_SHA);
  writeArtifact(join(root, 'dist'), ROW_HTML, ROW_SHA);
  writeFileSync(join(root, 'sub.html'), ROW_HTML);
  writeFileSync(join(root, 'VERSION'), '1.1.0\n');
  writeFileSync(join(root, 'config.env'), [
    'RT_CONFIG_VERSION=1',
    'TEMPLATE=row',
    'SERVICE_NAME_B64=' + Buffer.from('Test VPN', 'utf8').toString('base64'),
    'SUPPORT_URL_B64=' + Buffer.from('https://t.me/x', 'utf8').toString('base64'),
    'LOGO_MIME=',
    'LOGO_DATA_B64=',
    '',
  ].join('\n'));
}

/* A release payload as make-release.sh produces it (artifact + VERSION; the
   management lib and CLI are optional and omitted). */
function writePayload(root, { withStore = true } = {}) {
  const p = join(root, 'payload');
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, 'template.html'), ROW_HTML);
  writeFileSync(join(p, 'VERSION'), '1.2.0\n');
  if (withStore) {
    writeArtifact(join(p, 'templates', 'row'), ROW_HTML, ROW_SHA);
    writeArtifact(join(p, 'templates', 'editorial'), EDITORIAL_HTML, EDI_SHA);
    writeArtifact(join(p, 'templates', 'canvas'), CANVAS_HTML, CANVAS_SHA);
    writeArtifact(join(p, 'templates', 'prism'), PRISM_HTML, PRISM_SHA);
    writeArtifact(join(p, 'templates', 'terminal'), TERMINAL_HTML, TERMINAL_SHA);
    writeArtifact(join(p, 'templates', 'pulse'), PULSE_HTML, PULSE_SHA);
    writeArtifact(join(p, 'templates', 'brutal'), BRUTAL_HTML, BRUTAL_SHA);
    writeArtifact(join(p, 'templates', 'arcade'), ARCADE_HTML, ARCADE_SHA);
    writeArtifact(join(p, 'templates', 'sketch'), SKETCH_HTML, SKETCH_SHA);
    writeArtifact(join(p, 'templates', 'signature'), SIGNATURE_HTML, SIGNATURE_SHA);
    writeArtifact(join(p, 'templates', 'saffron'), SAFFRON_HTML, SAFFRON_SHA);
  }
}

/* No release source is reachable unless a test provides one: verify, config
   and the manager complete an incomplete install by downloading, and a test
   must never reach the network. A test that needs a payload redefines
   rt_fetch_release after these stubs. */
const FLOW_STUBS = [
  'rt_require_root(){ :; }',
  'rt_detect_xui(){ return 1; }',
  'rt_detect_xui_version(){ return 1; }',
  'rt_detect_xui_db(){ return 1; }',
  'rt_fetch_release(){ return 1; }',
  '',
].join('\n');

/* Bash snippets are single-quoted JS strings. This helper shells a value as a
   literal single-quoted bash word, so hostile fixture values survive intact. */
function bq(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

test('rt_template_effective: missing means Row, corrupt warns and falls back', () => {
  const r = sh(
    'printf "effective=%s\\n" "$(rt_template_effective)"; ' +
    'rt_config_write "" "" "" ""; ' +
    'printf "fresh=%s\\n" "$(rt_template_effective)"; ' +
    'printf "TEMPLATE=bogus\\n" >> "$RT_CONFIG"; ' +
    'printf "corrupt=%s\\n" "$(rt_template_effective)"',
  );
  assert.equal(r.code, 0);
  assert.match(r.out, /effective=row/, 'a legacy config with no TEMPLATE line is Row, silently');
  assert.match(r.out, /fresh=row/);
  assert.match(r.out, /corrupt=row/, 'a corrupt stored id still resolves, to Row');
  assert.match(r.err, /unknown template id \(bogus\)/, 'the operator is warned');
});

test('hostile identifiers are refused as selections and never reach a path', () => {
  const ids = [
    '../../etc/passwd', '../row', 'row/../../x', 'editorial;rm', 'editorial && whoami',
    '$(command)', '/absolute/path', 'ROW<script>', '%2e%2e/', 'C:\\Windows', '   ',
  ];
  const body = ids.map((id) =>
    'for id in ' + bq(id) + '; do\n' +
    '  if rt_template_allowed "$id"; then echo "ALLOWED"; fi\n' +
    '  if rt_template_store_has "$id"; then echo "STORE-HAS"; fi\n' +
    '  if rt_config_set_template "$id" 2>/dev/null; then echo "PERSISTED"; fi\n' +
    'done\n').join('') + 'echo done';
  const r = sh(body);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'done', 'no hostile id may be allowed, stored, or persisted');
});

test('rt_config_write preserves the selection across branding changes, sanitizes a corrupt one, and stays strict on an explicit id', () => {
  const r = sh(
    'rt_config_write "A" "https://t.me/a" "" ""\n' +
    'rt_config_set_template editorial\n' +
    'rt_config_write "B" "https://t.me/b" "" ""\n' +
    'printf "kept=%s name=%s\\n" "$(rt_config_get_raw TEMPLATE)" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'printf "TEMPLATE=banana\\n" >> "$RT_CONFIG"\n' +
    'rt_config_write "C" "https://t.me/c" "" ""\n' +
    'printf "sanitized=%s name=%s\\n" "$(rt_config_get_raw TEMPLATE)" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'if rt_config_write "D" "https://t.me/d" "" "" does-not-exist 2>/dev/null; then echo "EXPLICIT-ACCEPTED"; else echo "EXPLICIT-REJECTED"; fi',
  );
  assert.equal(r.code, 0);
  assert.match(r.out, /kept=editorial name=B/, 'a branding change must not reset the selection');
  assert.match(r.out, /sanitized=row name=C/, 'a corrupt stored id is reset, not preserved');
  assert.match(r.err, /resetting the selection to Row/);
  assert.match(r.out, /EXPLICIT-REJECTED/, 'an explicit invalid id fails the write');
});

test('rt_stage_template_store stages verified artifacts, skips hostile names, and refuses a tampered one', () => {
  const good = shRoot(
    'rt_stage_template_store "$RT_ROOT/payload"\n' +
    'printf "ids=%s\\n" "$(rt_template_store_ids | tr "\\n" ",")"\n' +
    'cmp -s "$RT_TEMPLATE_STORE/editorial/template.html" "$RT_ROOT/payload/templates/editorial/template.html" && echo "byte-exact"',
    { prepare: (root) => writePayload(root) },
  );
  assert.equal(good.code, 0, good.err);
  assert.equal(good.out, 'ids=arcade,brutal,canvas,editorial,prism,pulse,row,saffron,signature,sketch,terminal,\nbyte-exact');

  const tampered = shRoot(
    'if rt_stage_template_store "$RT_ROOT/payload" 2>/dev/null; then echo "TAMPER-STAGED"; else echo "TAMPER-REFUSED"; fi\n' +
    '[ -d "$RT_TEMPLATE_STORE/editorial" ] || echo "editorial-not-staged"',
    { prepare: (root) => {
      writePayload(root);
      writeFileSync(join(root, 'payload', 'templates', 'editorial', 'template.html'), EDITORIAL_HTML + 'x');
    } },
  );
  assert.match(tampered.out, /TAMPER-REFUSED/);
  assert.match(tampered.out, /editorial-not-staged/, 'a failing artifact stages nothing for that id');

  const hostile = shRoot(
    'rt_stage_template_store "$RT_ROOT/payload"\n' +
    'printf "ids=%s\\n" "$(rt_template_store_ids | tr "\\n" ",")"',
    { prepare: (root) => {
      writePayload(root);
      mkdirSync(join(root, 'payload', 'templates', 'Evil'), { recursive: true });
      mkdirSync(join(root, 'payload', 'templates', 'Evil'), { recursive: true });
      writeFileSync(join(root, 'payload', 'templates', 'Evil', 'template.html'), 'x');
    } },
  );
  assert.equal(hostile.out, 'ids=arcade,brutal,canvas,editorial,prism,pulse,row,saffron,signature,sketch,terminal,', 'a non-lowercase directory name is skipped');
});

test('rt_switch_template moves Row -> Editorial -> Row with branding intact, and refuses bad moves', () => {
  const r = shRoot(
    'rt_switch_template editorial || { echo "SWITCH-FAILED"; exit 1; }\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'grep -q ' + bq('data-template="editorial"') + ' "$RT_LIVE" && echo "live=editorial"\n' +
    'cmp -s "$RT_DIST" "$RT_TEMPLATE_STORE/editorial/template.html" && echo "canonical=editorial"\n' +
    'rt_switch_template row\n' +
    'printf "tpl2=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'grep -q "data-template" "$RT_LIVE" && echo "marker-leaked" || echo "live=row"\n' +
    'if rt_switch_template does-not-exist 2>/dev/null; then echo "UNAVAILABLE-ACCEPTED"; else echo "unknown-refused"; fi\n' +
    'printf "tpl3=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'if rt_switch_template ' + bq('../row') + ' 2>/dev/null; then echo "TRAVERSAL-ACCEPTED"; else echo "traversal-refused"; fi\n' +
    'printf "tpl4=%s\\n" "$(rt_config_get_raw TEMPLATE)"',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /tpl=editorial/, 'the switch persists the new selection');
  assert.match(r.out, /name=Test VPN/, 'branding survives the switch');
  assert.match(r.out, /live=editorial/, 'the live page is the new design');
  assert.match(r.out, /canonical=editorial/, 'the canonical artifact is the new design');
  assert.match(r.out, /tpl2=row/, 'and the switch back works');
  assert.match(r.out, /live=row/, 'Row carries no data-template attribute');
  assert.match(r.out, /unknown-refused/);
  assert.match(r.out, /tpl3=row/, 'a refused switch leaves the selection alone');
  assert.match(r.out, /traversal-refused/);
  assert.match(r.out, /tpl4=row/);
});

test('Canvas cycles with Row and Editorial, carrying branding and identity the whole way', () => {
  const r = shRoot(
    'rt_switch_template canvas\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'printf "dist=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'grep -q ' + bq('data-template="canvas"') + ' "$RT_LIVE" && echo "live=canvas"\n' +
    'rt_switch_template editorial\n' +
    'printf "dist2=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'grep -q ' + bq('data-template="editorial"') + ' "$RT_LIVE" && echo "live2=editorial"\n' +
    'rt_switch_template row\n' +
    'printf "tpl3=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "dist3=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'grep -q "data-template" "$RT_LIVE" && echo "marker-leaked" || echo "live3=row"',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /tpl=canvas/);
  assert.match(r.out, /name=Test VPN/, 'branding survives every leg');
  assert.match(r.out, new RegExp('dist=' + CANVAS_SHA));
  assert.match(r.out, /live=canvas/);
  assert.match(r.out, new RegExp('dist2=' + EDI_SHA));
  assert.match(r.out, /live2=editorial/);
  assert.match(r.out, /tpl3=row/);
  assert.match(r.out, new RegExp('dist3=' + ROW_SHA));
  assert.match(r.out, /live3=row/);
});

test('Prism cycles through every design with branding and identity intact', () => {
  const r = shRoot(
    'rt_switch_template prism\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'printf "dist=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'grep -q ' + bq('data-template="prism"') + ' "$RT_LIVE" && echo "live=prism"\n' +
    'rt_switch_template canvas\n' +
    'printf "dist2=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'rt_switch_template editorial\n' +
    'printf "dist3=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'rt_switch_template row\n' +
    'printf "tpl2=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "dist4=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'grep -q "data-template" "$RT_LIVE" && echo "marker-leaked" || echo "live=row"',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /tpl=prism/);
  assert.match(r.out, /name=Test VPN/, 'branding survives every leg');
  assert.match(r.out, new RegExp('dist=' + PRISM_SHA));
  assert.match(r.out, /live=prism/);
  assert.match(r.out, new RegExp('dist2=' + CANVAS_SHA));
  assert.match(r.out, new RegExp('dist3=' + EDI_SHA));
  assert.match(r.out, /tpl2=row/);
  assert.match(r.out, new RegExp('dist4=' + ROW_SHA));
  assert.match(r.out, /live=row/);
});

test('a switch refused on checksum grounds leaves the previous state fully live', () => {
  const r = shRoot(
    'printf "x" >> "$RT_TEMPLATE_STORE/editorial/template.html"\n' +
    'if rt_switch_template editorial 2>/dev/null; then echo "TAMPER-ACCEPTED"; else echo "refused"; fi\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'grep -q "data-template" "$RT_LIVE" && echo "marker-leaked" || echo "live-still-row"\n' +
    'cmp -s "$RT_DIST" "$RT_TEMPLATE_STORE/row/template.html" && echo "canonical-still-row"',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /refused/);
  assert.match(r.out, /tpl=row/);
  assert.match(r.out, /live-still-row/);
  assert.match(r.out, /canonical-still-row/);
});

test('rollback restores the artifact and re-derives its template identity', () => {
  const r = shRoot(
    'backup="$(rt_backup_create)"\n' +
    'rt_switch_template editorial\n' +
    'printf "after-switch=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'rt_restore_from_backup "$backup" && rt_activate\n' +
    'printf "after-restore=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'cmp -s "$RT_DIST" "$RT_TEMPLATE_STORE/row/template.html" && echo "canonical=row"\n' +
    'grep -q "data-template" "$RT_LIVE" && echo "marker-leaked" || echo "live=row"',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /after-switch=editorial/);
  assert.match(r.out, /after-restore=row/, 'the restored artifact decides the selection');
  assert.match(r.out, /name=Test VPN/, 'branding is preserved, not rolled back');
  assert.match(r.out, /canonical=row/);
  assert.match(r.out, /live=row/);
});

test('an Editorial backup rolls a Row install forward, and a legacy v1.1.0 backup rolls it back', () => {
  const r = shRoot(
    'rt_switch_template editorial\n' +
    'edi_backup="$(rt_backup_create)"\n' +
    'rt_switch_template row\n' +
    'rt_restore_from_backup "$edi_backup" && rt_activate\n' +
    'printf "edi-back=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'grep -q ' + bq('data-template="editorial"') + ' "$RT_LIVE" && echo "live=editorial"\n' +
    'legacy="$RT_BACKUPS/20260101T000000Z__1.1.0"\n' +
    'mkdir -p "$legacy"\n' +
    'cp "$RT_TEMPLATE_STORE/row/template.html" "$legacy/template.html"\n' +
    'rt_sha256 "$legacy/template.html" > "$legacy/template.html.sha256"\n' +
    'printf "version=1.1.0\\n" > "$legacy/meta"\n' +
    'rt_restore_from_backup "$legacy" && rt_activate\n' +
    'printf "legacy-back=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'grep -q "data-template" "$RT_LIVE" && echo "marker-leaked" || echo "live=row"',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /edi-back=editorial/, 'an editorial backup restores the editorial selection');
  assert.match(r.out, /live=editorial/);
  assert.match(r.out, /legacy-back=row/, 'a pre-store backup artifact is identified as Row by its bytes');
  assert.match(r.out, /live=row/);
});

test('a corrupt or mismatched backup is refused before anything is restored', () => {
  const r = shRoot(
    'rt_switch_template editorial\n' +
    'backup="$(rt_backup_create)"\n' +
    'printf "x" >> "$backup/template.html"\n' +
    'if rt_restore_from_backup "$backup" 2>/dev/null; then echo "CORRUPT-ACCEPTED"; else echo "corrupt-refused"; fi\n' +
    'cmp -s "$RT_DIST" "$RT_TEMPLATE_STORE/editorial/template.html" && echo "canonical-untouched"\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /corrupt-refused/);
  assert.match(r.out, /canonical-untouched/);
  assert.match(r.out, /tpl=editorial/);
});

test('an update keeps an available selection live across the release', () => {
  const r = shRoot(
    FLOW_STUBS +
    'trap "rt_cleanup" EXIT\n' +
    'rt_config_set_template editorial\n' +
    'rt_fetch_release(){ printf "%s" "$RT_ROOT/payload"; }\n' +
    'rt_cmd_update >/dev/null 2>&1\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'printf "ver=%s\\n" "$(cat "$RT_VERSION_FILE")"\n' +
    'grep -q ' + bq('data-template="editorial"') + ' "$RT_LIVE" && echo "live=editorial"\n' +
    'printf "store=%s\\n" "$(rt_template_store_ids | tr "\\n" ",")"',
    { prepare: (root) => { prepareInstall(root); writePayload(root); } },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /tpl=editorial/, 'an available selection survives the update');
  assert.match(r.out, /name=Test VPN/, 'branding survives the update');
  assert.match(r.out, /ver=1.2.0/);
  assert.match(r.out, /live=editorial/, 'the updated install serves the selected design');
  assert.match(r.out, /store=arcade,brutal,canvas,editorial,prism,pulse,row,saffron,signature,sketch,terminal/, 'the release store was staged');
});

test('an update against a payload without a store degrades to Row and keeps the invariant', () => {
  const r = shRoot(
    FLOW_STUBS +
    'trap "rt_cleanup" EXIT\n' +
    'rt_config_set_template editorial\n' +
    'rt_fetch_release(){ printf "%s" "$RT_ROOT/payload"; }\n' +
    'rt_cmd_update >/dev/null\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'grep -q "data-template" "$RT_LIVE" && echo "marker-leaked" || echo "live=row"',
    { prepare: (root) => {
      prepareInstall(root); writePayload(root, { withStore: false });
      rmSync(join(root, 'dist', 'templates'), { recursive: true, force: true });
    } },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /template 'editorial' is not in this release/, 'the fallback is announced');
  assert.match(r.out, /tpl=row/, 'the fallback is persisted, not just activated');
  assert.match(r.out, /name=Test VPN/, 'branding still survives');
  assert.match(r.out, /live=row/, 'config and artifact agree: both Row');
});

test('verify reports the selected template and fails a selection/artifact mismatch', () => {
  const good = shRoot(FLOW_STUBS + 'rt_cmd_verify', { prepare: prepareInstall });
  assert.equal(good.code, 0, good.err);
  assert.match(good.out, /Template: Row/);
  assert.match(good.out, /Canonical artifact matches the selected template\./);

  const bad = shRoot(
    FLOW_STUBS +
    'rt_config_set_template editorial\n' +
    'rt_cmd_verify\n',
    { prepare: prepareInstall },
  );
  assert.equal(bad.code, 1, 'a mismatch is a hard failure');
  assert.match(bad.out, /Template: Editorial/);
  assert.match(bad.err, /canonical artifact does not match the selected template/, 'the mismatch is reported on stderr');
});

test('the manager template editor switches on confirm, cancels cleanly, and reports the current design', () => {
  const switched = shRoot(
    'printf "2\\ny\\n" | rt_reconfig_template\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"',
    { prepare: prepareInstall },
  );
  assert.equal(switched.code, 0, switched.err);
  assert.match(switched.out, /Current template:\s+Row/, 'the current design is shown first');
  assert.match(switched.out, /Template changed successfully/);
  assert.match(switched.out, /Previous\s+Row/);
  assert.match(switched.out, /Current\s+Editorial/);
  assert.match(switched.out, /Verification\s+Passed/);
  assert.match(switched.out, /tpl=editorial/);

  const cancelled = shRoot(
    'printf "0\\n" | rt_reconfig_template\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"',
    { prepare: prepareInstall },
  );
  assert.match(cancelled.out, /tpl=row/, 'cancellation changes nothing');

  const same = shRoot('printf "1\\n" | rt_reconfig_template', { prepare: prepareInstall });
  assert.match(same.out, /Already the active template\./);
});

test('the fresh-install chooser defaults to Row and accepts a numbered pick', () => {
  const setup =
    'mkdir -p "$RT_TEMPLATE_STORE/row" "$RT_TEMPLATE_STORE/editorial"\n' +
    ': > "$RT_TEMPLATE_STORE/row/template.html"; : > "$RT_TEMPLATE_STORE/row/template.html.sha256"\n' +
    ': > "$RT_TEMPLATE_STORE/editorial/template.html"; : > "$RT_TEMPLATE_STORE/editorial/template.html.sha256"\n';
  const enter = shRoot(setup + 'printf "\\n" | rt_install_pick_template', { prepare: () => {} });
  assert.equal(enter.out, 'row', 'Enter takes the default');
  const pick = shRoot(setup + 'printf "2\\n" | rt_install_pick_template', { prepare: () => {} });
  assert.equal(pick.out, 'editorial', 'a number picks that design');
  const junk = shRoot(setup + 'printf "junk\\n9\\n2\\n" | rt_install_pick_template', { prepare: () => {} });
  assert.equal(junk.out, 'editorial', 'junk re-prompts instead of guessing');
  const eof = shRoot(setup + 'rt_install_pick_template </dev/null', { prepare: () => {} });
  assert.equal(eof.out, 'row', 'EOF can never hang the installer');
});

test('a fresh non-interactive install honors RT_TEMPLATE and refuses an invalid one', () => {
  const xuiStubs =
    'rt_detect_xui(){ RT_XUI_UNIT="x-ui.service"; return 0; }\n' +
    'rt_detect_xui_version(){ RT_XUI_VERSION="3.7.0"; printf "3.7.0"; }\n';
  const editorial = shRoot(
    FLOW_STUBS + xuiStubs +
    'rt_cmd_install "$RT_ROOT/payload" >/dev/null 2>&1\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'grep -q ' + bq('data-template="editorial"') + ' "$RT_LIVE" && echo "live=editorial"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"',
    { prepare: (root) => writePayload(root), env: { RT_TEMPLATE: 'editorial' } },
  );
  assert.equal(editorial.code, 0, editorial.err);
  assert.match(editorial.out, /tpl=editorial/);
  assert.match(editorial.out, /live=editorial/, 'the store artifact, not the top-level Row file, is served');

  const invalid = shRoot(
    FLOW_STUBS + xuiStubs +
    'if ( rt_cmd_install "$RT_ROOT/payload" ) >/dev/null; then echo "INVALID-ACCEPTED"; else echo "invalid-refused"; fi\n' +
    '[ -f "$RT_LIVE" ] || echo "live-untouched"',
    { prepare: (root) => writePayload(root), env: { RT_TEMPLATE: 'editorial;rm' } },
  );
  assert.match(invalid.out, /invalid-refused/, 'explicit invalid input fails the install');
  assert.match(invalid.err, /not a template this release offers/);
  assert.match(invalid.out, /live-untouched/, 'nothing was activated');
});

/* --- sanitizing fallback must reconcile the artifact (v1.2 regression) -----
   rt_config_write sanitizes an invalid stored selection to Row, but only the
   high-level branding boundaries (rt_cmd_config, rt_apply_branding) know a
   transition happened. Each of them must reconcile the canonical artifact and
   regenerate the live page before returning, or config and artifact disagree. */

function corruptAndReapply(flow) {
  return shRoot(
    FLOW_STUBS +
    flow +
    'name_before="$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'url_before="$(rt_config_get_text SUPPORT_URL_B64)"\n' +
    'printf "TEMPLATE=bogus\\n" >> "$RT_CONFIG"\n' +
    'rt_apply_branding "$name_before" "$url_before" "$(rt_config_get_raw LOGO_MIME)" "$(rt_config_get_raw LOGO_DATA_B64)" 2>"$RT_ROOT/recon.err"\n' +
    'printf "rc=%s\\n" "$?"\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "lines=%s\\n" "$(grep -c "^TEMPLATE=" "$RT_CONFIG")"\n' +
    'printf "dist=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'if grep -q "data-template" "$RT_LIVE"; then echo "live=design"; else echo "live=row"; fi\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'grep -q "unknown template id (bogus)" "$RT_ROOT/recon.err" && echo "warned"\n' +
    'rt_cmd_verify >/dev/null 2>&1 && echo "verify=ok"\n' +
    'printf "sum=%s\\n" "$(cat "$RT_DIST_SUM")"',
    { prepare: prepareInstall },
  );
}

test('a branding write sanitizes a corrupt stored selection to Row and reconciles the artifact', () => {
  const r = corruptAndReapply('rt_switch_template editorial\n');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /rc=0/, 'the branding operation succeeds');
  assert.match(r.out, /warned/, 'the corrupt value is announced');
  assert.match(r.out, /tpl=row/, 'the selection is persisted as Row');
  assert.match(r.out, /lines=1/, 'exactly one TEMPLATE line remains');
  assert.match(r.out, new RegExp('dist=' + ROW_SHA), 'the canonical artifact was reconciled to Row');
  assert.match(r.out, /live=row/, 'the live page no longer names Editorial');
  assert.match(r.out, new RegExp('name=Test VPN'), 'branding is unchanged');
  assert.match(r.out, new RegExp('sum=' + ROW_SHA), 'the sidecar matches the artifact');
  assert.match(r.out, /verify=ok/, 'verify passes');
});

test('a branding write on a corrupt config while Row is already active stays consistent', () => {
  const r = corruptAndReapply('');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /rc=0/);
  assert.match(r.out, /warned/);
  assert.match(r.out, /tpl=row/);
  assert.match(r.out, new RegExp('dist=' + ROW_SHA), 'no reconcile needed, artifact already Row');
  assert.match(r.out, /live=row/);
  assert.match(r.out, new RegExp('name=Test VPN'));
  assert.match(r.out, /verify=ok/);
});

test('rt_cmd_config reconciles a sanitized selection the same way', () => {
  const r = shRoot(
    FLOW_STUBS +
    'rt_switch_template editorial\n' +
    'printf "TEMPLATE=bogus\\n" >> "$RT_CONFIG"\n' +
    'RT_SERVICE_NAME="Test VPN" RT_SUPPORT_URL="https://t.me/x" rt_cmd_config >/dev/null 2>"$RT_ROOT/cfg.err"\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "dist=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'if grep -q "data-template" "$RT_LIVE"; then echo "live=design"; else echo "live=row"; fi\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'rt_cmd_verify >/dev/null 2>&1 && echo "verify=ok"\n',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /tpl=row/);
  assert.match(r.out, new RegExp('dist=' + ROW_SHA), 'the artifact followed the fallback');
  assert.match(r.out, /live=row/);
  assert.match(r.out, new RegExp('name=Test VPN'));
  assert.match(r.out, /verify=ok/);
});

test('a branding write fails safely when the fallback template is missing from the store', () => {
  const r = shRoot(
    FLOW_STUBS +
    'rt_switch_template editorial\n' +
    'printf "TEMPLATE=bogus\\n" >> "$RT_CONFIG"\n' +
    'rm -f "$RT_TEMPLATE_STORE/row/template.html"\n' +
    'if rt_apply_branding "Nova" "https://t.me/nova" "" "" 2>"$RT_ROOT/recon.err"; then echo "APPLIED"; else echo "REFUSED"; fi\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'printf "dist=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'grep -q ' + bq('data-template="editorial"') + ' "$RT_LIVE" && echo "live=editorial"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'grep -q "missing from the template store" "$RT_ROOT/recon.err" && echo "explained"\n',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /REFUSED/, 'the write is refused, not half-applied');
  assert.match(r.out, /explained/, 'the refusal names the missing store entry');
  assert.match(r.out, /tpl=bogus/, 'the pre-write config is restored untouched');
  assert.match(r.out, new RegExp('dist=' + EDI_SHA), 'the canonical artifact is untouched');
  assert.match(r.out, /live=editorial/, 'the known-good live page is preserved');
  assert.match(r.out, /name=Test VPN/, 'branding is preserved, not the attempted write');
});

test('a branding write refuses activation when the fallback store artifact fails its checksum', () => {
  const r = shRoot(
    FLOW_STUBS +
    'rt_switch_template editorial\n' +
    'printf "TEMPLATE=bogus\\n" >> "$RT_CONFIG"\n' +
    'printf "x" >> "$RT_TEMPLATE_STORE/row/template.html"\n' +
    'if rt_apply_branding "Nova" "https://t.me/nova" "" "" 2>"$RT_ROOT/recon.err"; then echo "APPLIED"; else echo "REFUSED"; fi\n' +
    'printf "dist=%s\\n" "$(rt_sha256 "$RT_DIST")"\n' +
    'grep -q ' + bq('data-template="editorial"') + ' "$RT_LIVE" && echo "live=editorial"\n' +
    'printf "name=%s\\n" "$(rt_config_get_text SERVICE_NAME_B64)"\n' +
    'grep -q "failed its store checksum" "$RT_ROOT/recon.err" && echo "explained"\n',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /REFUSED/, 'a tampered fallback artifact is never activated');
  assert.match(r.out, /explained/, 'the refusal names the checksum');
  assert.match(r.out, new RegExp('dist=' + EDI_SHA), 'the canonical artifact is untouched');
  assert.match(r.out, /live=editorial/, 'the known-good live page is preserved');
  assert.match(r.out, /name=Test VPN/, 'branding is preserved');
});

test('reconciliation never recurses: one write, one reconcile, one TEMPLATE line', () => {
  const r = shRoot(
    FLOW_STUBS +
    'rt_switch_template editorial\n' +
    'printf "TEMPLATE=bogus\\n" >> "$RT_CONFIG"\n' +
    'rt_config_set_template editorial\n' +
    'printf "lines=%s\\n" "$(grep -c "^TEMPLATE=" "$RT_CONFIG")"\n' +
    'printf "tpl=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n' +
    'rt_apply_branding "Test VPN" "https://t.me/x" "" ""\n' +
    'printf "lines2=%s\\n" "$(grep -c "^TEMPLATE=" "$RT_CONFIG")"\n' +
    'printf "tpl2=%s\\n" "$(rt_config_get_raw TEMPLATE)"\n',
    { prepare: prepareInstall },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /lines=1/);
  assert.match(r.out, /tpl=editorial/);
  assert.match(r.out, /lines2=1/, 'repeated writes never duplicate or loop the selection');
  assert.match(r.out, /tpl2=editorial/);
});

/* --- the library and its companions are one unit (1.2.0 packaging) -------
   lib/row-template.sh sources lib/transaction.sh and panels/ at load time. A
   release ships them together and an install puts them together, but the
   1.1.0 updater copies only the library and the CLI, so a host it updated has
   the library alone. tests/release.test.mjs drives that path with the real
   tarball and the real v1.1.0 updater; these pin the rules underneath it. */

const COMPANION_FILES = ['lib/transaction.sh', 'panels/3xui.sh', 'panels/index.sh', 'panels/interface.sh'];

/* The library plus the given companions, laid out as under RT_ROOT. */
function libraryTree(root, companions) {
  mkdirSync(join(root, 'lib'), { recursive: true });
  copyFileSync(join(ROOT, 'installer', 'lib', 'row-template.sh'), join(root, 'lib', 'row-template.sh'));
  for (const rel of companions) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    copyFileSync(join(ROOT, 'installer', rel), join(root, rel));
  }
}

/* Source a tree's library in a fresh bash and report how it loaded. */
function loadTree(prepare) {
  const root = mkdtempSync(join(tmpdir(), 'row-lib-')).replace(/\\/g, '/');
  try {
    prepare(root);
    const r = spawnSync('bash', ['-c', [
      'set -Eeuo pipefail',
      'export RT_ROOT="$1"',
      'if . "$RT_ROOT/lib/row-template.sh"; then',
      '  echo "loaded panels=${RT_PANELS_LOADED:-} txn=${RT_TRANSACTION_LOADED:-}"',
      '  if rt_installer_complete; then echo complete; else echo incomplete; fi',
      'else echo refused; fi',
    ].join('\n'), 'load-tree', root], { cwd: ROOT, encoding: 'utf8' });
    if (r.error) throw r.error;
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the library loads without the companions an older updater never installed, and says so', () => {
  const alone = loadTree((root) => libraryTree(root, []));
  assert.equal(alone.code, 0, alone.err);
  assert.match(alone.out, /loaded panels= txn=/, 'the library alone loads, with both layers absent');
  assert.match(alone.out, /incomplete/, 'and reports itself incomplete');
  assert.equal(alone.err, '', 'an absent layer is not an error at load time');

  const partial = loadTree((root) => libraryTree(root, ['lib/transaction.sh']));
  assert.match(partial.out, /loaded panels= txn=1/, 'each layer is loaded on its own');
  assert.match(partial.out, /incomplete/, 'one layer is not a complete install');

  const full = loadTree((root) => libraryTree(root, COMPANION_FILES));
  assert.match(full.out, /loaded panels=1 txn=1/);
  assert.match(full.out, /complete/);
  assert.doesNotMatch(full.out, /incomplete/);
});

test('a companion that is present but broken still stops the library from loading', () => {
  const cases = [
    ['a panel file that will not parse', (root) => {
      libraryTree(root, COMPANION_FILES);
      writeFileSync(join(root, 'panels', 'index.sh'), 'this is ( not bash\n');
    }],
    ['a panels/ directory missing its interface', (root) => {
      libraryTree(root, COMPANION_FILES.filter((f) => f !== 'panels/interface.sh'));
    }],
    ['a transaction engine that will not parse', (root) => {
      libraryTree(root, COMPANION_FILES);
      writeFileSync(join(root, 'lib', 'transaction.sh'), 'this is ( not bash\n');
    }],
  ];
  for (const [label, prepare] of cases) {
    const r = loadTree(prepare);
    assert.match(r.out, /refused/, `${label}: the library must refuse to load`);
    assert.doesNotMatch(r.out, /loaded/, `${label}: nothing may run half-loaded`);
  }
});

/* writePayload plus the management library, and the companions given. */
function payloadWithLibrary(root, companions, { sums = false } = {}) {
  writePayload(root);
  libraryTree(join(root, 'payload'), companions);
  if (sums) {
    const lines = companions.map((rel) =>
      `${createHash('sha256').update(readFileSync(join(root, 'payload', rel))).digest('hex')}  ${rel}`);
    writeFileSync(join(root, 'payload', 'SHA256SUMS'), lines.join('\n') + '\n');
  }
}

test('install refuses a payload that carries the library without its companions, before changing anything', () => {
  const r = shRoot(
    FLOW_STUBS +
    'if ( rt_cmd_install "$RT_ROOT/payload" ) >/dev/null; then echo "INCOMPLETE-ACCEPTED"; else echo "refused"; fi\n' +
    '[ -e "$RT_LIVE" ] || echo "live-untouched"\n' +
    '[ -e "$RT_LIB_DIR/row-template.sh" ] || echo "library-untouched"',
    { prepare: (root) => payloadWithLibrary(root, ['lib/transaction.sh']) },
  );
  assert.match(r.out, /refused/);
  assert.match(r.err, /the release payload is incomplete: panels\/3xui\.sh is missing/);
  assert.match(r.out, /live-untouched/, 'nothing was activated');
  assert.match(r.out, /library-untouched/, 'no half of the unit was installed');
});

test('update refuses a payload that carries the library without its companions, and the install stays as it was', () => {
  const r = shRoot(
    FLOW_STUBS +
    'trap "rt_cleanup" EXIT\n' +
    'before="$(rt_sha256 "$RT_LIVE")"\n' +
    'rt_fetch_release(){ printf "%s" "$RT_ROOT/payload"; }\n' +
    'if ( rt_cmd_update ) >/dev/null; then echo "INCOMPLETE-ACCEPTED"; else echo "refused"; fi\n' +
    '[ "$(rt_sha256 "$RT_LIVE")" = "$before" ] && echo "live-unchanged"\n' +
    'printf "ver=%s\\n" "$(cat "$RT_VERSION_FILE")"\n' +
    '[ -e "$RT_LIB_DIR/row-template.sh" ] || echo "library-untouched"',
    { prepare: (root) => { prepareInstall(root); payloadWithLibrary(root, []); } },
  );
  assert.match(r.out, /refused/);
  assert.match(r.err, /the release payload is incomplete: lib\/transaction\.sh is missing/);
  assert.match(r.out, /live-unchanged/, 'the running page is untouched');
  assert.match(r.out, /ver=1\.1\.0/, 'the installed version is untouched');
  assert.match(r.out, /library-untouched/);
});

test('a companion that does not match the payload checksum is refused', () => {
  const r = shRoot(
    FLOW_STUBS +
    'if ( rt_cmd_install "$RT_ROOT/payload" ) >/dev/null; then echo "TAMPERED-ACCEPTED"; else echo "refused"; fi\n' +
    '[ -e "$RT_LIVE" ] || echo "live-untouched"',
    { prepare: (root) => {
      payloadWithLibrary(root, COMPANION_FILES, { sums: true });
      writeFileSync(join(root, 'payload', 'panels', 'index.sh'), '# tampered\n');
    } },
  );
  assert.match(r.out, /refused/);
  assert.match(r.err, /payload checksum mismatch: panels\/index\.sh/);
  assert.match(r.out, /live-untouched/);
});

test('a payload whose own library declares no companions (v1.1.0) is still accepted', () => {
  /* The payload's library decides, not the running one: updating to the
     v1.1.0 release -- a deliberate downgrade -- must not be refused for lacking
     files that version never needed. */
  const r = shRoot(
    FLOW_STUBS +
    'trap "rt_cleanup" EXIT\n' +
    'rt_fetch_release(){ printf "%s" "$RT_ROOT/payload"; }\n' +
    'rt_cmd_update >/dev/null\n' +
    'cmp -s "$RT_ROOT/payload/lib/row-template.sh" "$RT_LIB_DIR/row-template.sh" && echo "library-installed"\n' +
    '[ -e "$RT_PANELS_DIR" ] || echo "no-companions-installed"',
    { prepare: (root) => {
      prepareInstall(root);
      writePayload(root);
      mkdirSync(join(root, 'payload', 'lib'), { recursive: true });
      copyFileSync(join(ROOT, 'tests', 'fixtures', 'installer-1.1.0', 'row-template.sh'),
        join(root, 'payload', 'lib', 'row-template.sh'));
    } },
  );
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /library-installed/);
  assert.match(r.out, /no-companions-installed/);
});

test('a payload library may declare companions only as plain files in lib/ or panels/', () => {
  const bad = ['lib/../../evil.sh', 'panels/../x.sh', 'etc/passwd.sh', 'panels/.hidden.sh',
    'lib/row-template.sh', 'panels/sub/x.sh', 'panels/x.txt', 'panels/a$b.sh', '/abs/x.sh'];
  /* One process for the whole table; the declaration is data, never sourced. */
  const r = shRoot(
    'mkdir -p "$RT_ROOT/p/lib"\n' +
    'check(){ printf "RT_INSTALLER_COMPANIONS=\\"%s\\"\\n" "$1" > "$RT_ROOT/p/lib/row-template.sh"\n' +
    '  if rt_payload_companions "$RT_ROOT/p" >/dev/null 2>&1; then echo "ACCEPTED:$1"; else echo "refused:$1"; fi; }\n' +
    bad.map((rel) => `check ${bq(rel)}\n`).join('') +
    `check ${bq('lib/transaction.sh panels/3xui.sh panels/index.sh panels/interface.sh')}\n`,
  );
  assert.equal(r.code, 0, r.err);
  for (const rel of bad) assert.match(r.out, new RegExp(`refused:${rel.replace(/[.$/]/g, '\\$&')}`), rel);
  assert.match(r.out, /ACCEPTED:lib\/transaction\.sh panels/, 'the real declaration is accepted');
});
