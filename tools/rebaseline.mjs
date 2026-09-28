#!/usr/bin/env node
/* Re-pin the artifact byte-locks in tests/build.test.mjs to the current build.
 *
 * The locks exist so that no change to a design reaches a subscriber by
 * accident: every artifact's size and SHA-256 is written into the test, and a
 * build that differs fails it. A change to the SHARED runtime or stylesheet
 * moves every artifact at once, deliberately, and the locks then have to be
 * re-pinned -- by hand that is seventeen sizes and seventeen hashes in two
 * different syntaxes, which is how a lock ends up pinned to the wrong build.
 *
 *   node tools/rebaseline.mjs          print what would change
 *   node tools/rebaseline.mjs --write  rewrite the locks in place
 *
 * It only ever rewrites numbers and hashes it finds already pinned; a template
 * without a lock, or a lock it cannot find, is an error, not a silent skip.
 * Review the diff: a lock that moved and should not have is the whole point of
 * having locks.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from './build.mjs';
import { templateIds } from './templates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'tests', 'build.test.mjs');
const write = process.argv.includes('--write');

/* The four templates locked by their own test, and the label each uses. */
const INDIVIDUAL = { row: 'Row', editorial: 'Editorial', canvas: 'Canvas', pulsenova: 'Pulse Nova' };

let src = readFileSync(FILE, 'utf8');
const changes = [];

for (const id of templateIds()) {
  const html = build(true, id).html;
  const bytes = Buffer.byteLength(html, 'utf8');
  const sha = createHash('sha256').update(html).digest('hex');

  if (INDIVIDUAL[id]) {
    const label = INDIVIDUAL[id];
    const sizeRe = new RegExp(`assert\\.equal\\(bytes, (\\d+), '${label} artifact changed size`);
    const m = src.match(sizeRe);
    if (!m) throw new Error(`${id}: its size lock was not found`);
    /* the hash is the first 64-hex string after the size lock */
    const at = src.indexOf(m[0]);
    const tail = src.slice(at);
    const h = tail.match(/'([0-9a-f]{64})'/);
    if (!h) throw new Error(`${id}: its hash lock was not found`);
    if (+m[1] !== bytes || h[1] !== sha) changes.push(`${id}: ${m[1]} -> ${bytes}, ${h[1].slice(0, 12)} -> ${sha.slice(0, 12)}`);
    const next = tail.replace(m[0], m[0].replace(m[1], String(bytes))).replace(h[1], sha);
    src = src.slice(0, at) + next;
  } else {
    const rowRe = new RegExp(`\\['${id}', (\\d+), '([0-9a-f]{64})'\\]`);
    const m = src.match(rowRe);
    if (!m) throw new Error(`${id}: no FROZEN_ARTIFACTS row`);
    if (+m[1] !== bytes || m[2] !== sha) changes.push(`${id}: ${m[1]} -> ${bytes}, ${m[2].slice(0, 12)} -> ${sha.slice(0, 12)}`);
    src = src.replace(m[0], `['${id}', ${bytes}, '${sha}']`);
  }
}

process.stdout.write(changes.length ? changes.join('\n') + '\n' : 'every lock already matches the build\n');
if (write && changes.length) {
  writeFileSync(FILE, src);
  process.stdout.write(`rewrote ${changes.length} lock(s) in tests/build.test.mjs\n`);
}
