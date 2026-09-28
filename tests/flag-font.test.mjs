/* The embedded flag face (src/fonts/twemoji-country-flags.woff2).
 *
 * The runtime decides WHICH flag a node carries (src/scripts/flag.js); the face
 * decides whether it is drawn as a flag or as two letters. These tests open the
 * committed font itself — a small WOFF2 reader over node's own Brotli — and
 * prove, for every code the registry accepts, that the face turns its two
 * regional indicators into one glyph and that the glyph is drawn in colour.
 * A registry code the face cannot draw would print as letters on Windows, which
 * is the exact failure the face exists to remove, so it fails here instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flagOf } from '../src/scripts/flag.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_PATH = join(ROOT, 'src', 'fonts', 'twemoji-country-flags.woff2');
const FONT = readFileSync(FONT_PATH);
const RI_FIRST = 0x1f1e6;

/* --- a minimal WOFF2 reader ------------------------------------------------
   Only what the assertions need: the table directory, the Brotli stream, and
   the three tables that are stored untransformed (cmap, GSUB, COLR). */

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt',
  'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

function readWoff2(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'wOF2', 'a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i += 1) {
      const b = buf[at++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('bad UIntBase128');
  };
  const dir = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[at++];
    const index = flags & 0x3f;
    const version = flags >> 6;
    let tag;
    if (index === 63) { tag = buf.toString('latin1', at, at + 4); at += 4; } else tag = KNOWN_TAGS[index];
    const origLength = base128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    dir.push({ tag, length });
  }
  const stream = brotliDecompressSync(buf.subarray(at, at + compressedSize));
  const tables = {};
  let off = 0;
  for (const { tag, length } of dir) {
    tables[tag] = stream.subarray(off, off + length);
    off += length;
  }
  return tables;
}

/* cmap: code point -> glyph id, from the format 12 (or 4) subtable. */
function readCmap(t) {
  const map = new Map();
  const n = t.readUInt16BE(2);
  for (let i = 0; i < n; i += 1) {
    const off = t.readUInt32BE(4 + i * 8 + 4);
    const format = t.readUInt16BE(off);
    if (format === 12) {
      const groups = t.readUInt32BE(off + 12);
      for (let g = 0; g < groups; g += 1) {
        const p = off + 16 + g * 12;
        const start = t.readUInt32BE(p);
        const end = t.readUInt32BE(p + 4);
        const glyph = t.readUInt32BE(p + 8);
        for (let c = start; c <= end; c += 1) map.set(c, glyph + (c - start));
      }
      return map;
    }
  }
  throw new Error('no format 12 cmap: the regional indicators live above the BMP');
}

/* Coverage table -> the glyph ids it covers, in coverage-index order. */
function coverage(t, off) {
  const format = t.readUInt16BE(off);
  const out = [];
  if (format === 1) {
    const n = t.readUInt16BE(off + 2);
    for (let i = 0; i < n; i += 1) out.push(t.readUInt16BE(off + 4 + i * 2));
  } else {
    const n = t.readUInt16BE(off + 2);
    for (let i = 0; i < n; i += 1) {
      const p = off + 4 + i * 6;
      for (let g = t.readUInt16BE(p); g <= t.readUInt16BE(p + 2); g += 1) out.push(g);
    }
  }
  return out;
}

/* GSUB type 4: "first,second" -> ligature glyph id, for two-glyph ligatures. */
function readLigatures(t) {
  const out = new Map();
  const lookupList = t.readUInt16BE(8);
  const count = t.readUInt16BE(lookupList);
  for (let l = 0; l < count; l += 1) {
    const lookup = lookupList + t.readUInt16BE(lookupList + 2 + l * 2);
    let type = t.readUInt16BE(lookup);
    const subCount = t.readUInt16BE(lookup + 4);
    for (let s = 0; s < subCount; s += 1) {
      let sub = lookup + t.readUInt16BE(lookup + 6 + s * 2);
      if (type === 7) { type = t.readUInt16BE(sub + 2); sub += t.readUInt32BE(sub + 4); }
      if (type !== 4) continue;
      const firsts = coverage(t, sub + t.readUInt16BE(sub + 2));
      const setCount = t.readUInt16BE(sub + 4);
      for (let i = 0; i < setCount; i += 1) {
        const set = sub + t.readUInt16BE(sub + 6 + i * 2);
        const ligCount = t.readUInt16BE(set);
        for (let k = 0; k < ligCount; k += 1) {
          const lig = set + t.readUInt16BE(set + 2 + k * 2);
          const glyph = t.readUInt16BE(lig);
          const comps = t.readUInt16BE(lig + 2);
          if (comps === 2) out.set(`${firsts[i]},${t.readUInt16BE(lig + 4)}`, glyph);
        }
      }
    }
  }
  return out;
}

/* COLR v0: base glyph id -> number of colour layers. */
function readColr(t) {
  const out = new Map();
  const n = t.readUInt16BE(2);
  const off = t.readUInt32BE(4);
  for (let i = 0; i < n; i += 1) {
    const p = off + i * 6;
    out.set(t.readUInt16BE(p), t.readUInt16BE(p + 4));
  }
  return out;
}

const tables = readWoff2(FONT);
const cmap = readCmap(tables.cmap);
const ligatures = readLigatures(tables.GSUB);
const colr = readColr(tables.COLR);

/* The registry, decoded from the shipped source exactly as the runtime reads it. */
const FLAG_SOURCE = readFileSync(join(ROOT, 'src', 'scripts', 'flag.js'), 'utf8');
const BITS = atob(FLAG_SOURCE.match(/atob\('([^']*)'\)/)[1]);
const REGISTRY = [];
for (let a = 0; a < 26; a += 1) {
  for (let b = 0; b < 26; b += 1) {
    const i = a * 26 + b;
    if ((BITS.charCodeAt(i >> 3) >> (i & 7)) & 1) REGISTRY.push(String.fromCharCode(65 + a, 65 + b));
  }
}

/* The glyph the face draws for a flag string of two regional indicators. */
function glyphFor(flag) {
  const cps = Array.from(flag, (ch) => ch.codePointAt(0));
  assert.equal(cps.length, 2);
  const key = `${cmap.get(cps[0])},${cmap.get(cps[1])}`;
  return ligatures.get(key);
}

test('the committed face is the one INTEGRITY records', () => {
  const sha = createHash('sha256').update(FONT).digest('hex');
  const integrity = readFileSync(join(ROOT, 'src', 'fonts', 'INTEGRITY'), 'utf8');
  assert.ok(integrity.includes(sha), 'src/fonts/INTEGRITY must record the sha256 of the committed face');
  assert.ok(integrity.includes(`woff2 bytes      ${FONT.length}`), 'and its size');
});

test('the face maps all 26 regional indicators and nothing else', () => {
  const cps = [...cmap.keys()].sort((x, y) => x - y);
  assert.equal(cps.length, 26);
  assert.equal(cps[0], RI_FIRST);
  assert.equal(cps[25], RI_FIRST + 25);
});

test('every code the registry accepts is drawn by the face as a colour flag', () => {
  assert.equal(REGISTRY.length, 259);
  const missing = [];
  for (const code of REGISTRY) {
    const flag = flagOf(`Node ${code}`);
    assert.notEqual(flag, '', code + ' resolves to a flag');
    const glyph = glyphFor(flag);
    if (glyph === undefined) { missing.push(code + ':no-ligature'); continue; }
    if (!(colr.get(glyph) > 0)) missing.push(code + ':no-colour');
  }
  assert.deepEqual(missing, [], 'every registry code must have a colour glyph');
});

test('the face draws 258 flags, and the registry reaches every one of them', () => {
  assert.equal(ligatures.size, 258);
  const reached = new Set(REGISTRY.map((code) => glyphFor(flagOf(`Node ${code}`))));
  for (const glyph of ligatures.values()) {
    assert.ok(reached.has(glyph), `a flag in the face that no registry code reaches: glyph ${glyph}`);
  }
});

/* --- where the face goes in the page ------------------------------------------
   The face is 68,748 bytes of base64. In the <head> it would have to be read
   before the page could paint; placed just before the locale island it is read
   after the page's markup (so the page paints without it) and before the
   script that creates the badges (so no badge is ever drawn without it). */

const { build } = await import('../tools/build.mjs');
const { assembleShell } = await import('../tools/shell.mjs');
const { templateIds } = await import('../tools/templates.mjs');

function facePlacement(html, label) {
  const styles = [...html.matchAll(/<style>/g)].map((m) => m.index);
  assert.equal(styles.length, 2, `${label}: the head stylesheet and the flag face`);
  const head = html.slice(styles[0], html.indexOf('</style>', styles[0]));
  assert.equal(head.includes('@font-face {\nfont-family: "Row Flags"'), false, `${label}: the face is not in the head`);
  assert.ok(head.includes('.cfg-flag:not([data-mono])'), `${label}: the badge rule is`);
  const face = html.slice(styles[1], html.indexOf('</style>', styles[1]));
  assert.ok(face.includes('font-family: "Row Flags"'), `${label}: the second <style> is the face`);
  assert.ok(face.includes(FONT.toString('base64')), `${label}: carrying exactly the committed font`);
  assert.ok(face.includes('Twemoji (c) Twitter, Inc and contributors, CC-BY 4.0'), `${label}: with its attribution`);
  assert.ok(styles[1] > html.indexOf('</main>'), `${label}: after the page's markup`);
  assert.ok(styles[1] < html.indexOf('id="i18n-data"'), `${label}: before the locale island`);
  assert.ok(styles[1] < html.lastIndexOf('<script>'), `${label}: before the app script`);
  assert.equal(html.split('font/woff2;base64,' + FONT.toString('base64')).length, 2, `${label}: once`);
}

test('the face is its own <style>, after the markup and before the badges exist, in every artifact', () => {
  for (const id of templateIds()) facePlacement(build(true, id).html, id);
});

test('the PasarGuard and Rebecca shells place it the same way', () => {
  for (const panel of ['pasarguard', 'rebecca']) {
    for (const id of templateIds()) facePlacement(assembleShell(panel, id).html, `${panel}/${id}`);
  }
});

test('a system-fonts build carries no face at all', () => {
  const html = build(false).html;
  assert.equal(html.includes('Row Flags"') && html.includes('@font-face'), false);
  assert.equal([...html.matchAll(/<style>/g)].length, 1);
});
