/* A configuration's name may carry a country flag, and the badge is drawn only
   for a flag that names a real country. Anything else — a plain emoji, a lone
   or unassigned indicator, the white or black flag — must leave no badge and
   never an empty circle. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flagOf, cleanName } from '../src/scripts/flag.js';

/* Used by the bitmap tests at the end of this file, which read the shipped
   source rather than importing anything private from it. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the first real country flag is found wherever it sits', () => {
  assert.equal(flagOf('🇩🇪 Frankfurt'), '🇩🇪');
  assert.equal(flagOf('Germany 🇩🇪'), '🇩🇪');
  assert.equal(flagOf('Node 🇯🇵 Tokyo'), '🇯🇵');
  assert.equal(flagOf('🇺🇸'), '🇺🇸');
});

test('only the first flag of several is taken', () => {
  assert.equal(flagOf('🇺🇸🇬🇧 Multi'), '🇺🇸');
  assert.equal(flagOf('🇫🇷 / 🇩🇪'), '🇫🇷');
});

test('nothing that is not a real country flag becomes a badge', () => {
  assert.equal(flagOf('No flag here'), '');
  assert.equal(flagOf('🔥 Fast'), '', 'a plain emoji is not a flag');
  assert.equal(flagOf('🏳️ white'), '', 'the white flag is not a country');
  assert.equal(flagOf('🏴 black'), '', 'the black flag is not a country');
  assert.equal(flagOf('🇿🇿 unknown'), '', 'an unassigned pair is refused');
  assert.equal(flagOf('A🇺 lone'), '', 'a single indicator is not a flag');
  assert.equal(flagOf(''), '');
  assert.equal(flagOf(null), '');
  assert.equal(flagOf(undefined), '');
  assert.equal(flagOf(42), '');
});

test('an unassigned pair does not knock the scan out of alignment', () => {
  assert.equal(flagOf('🇿🇿🇺🇸'), '🇺🇸', 'the tofu pair is consumed, US is found');
});

test('the display name drops the flag so it is not shown twice', () => {
  assert.equal(cleanName('🇩🇪 Frankfurt'), 'Frankfurt');
  assert.equal(cleanName('Germany 🇩🇪'), 'Germany');
  assert.equal(cleanName('🇺🇸🇬🇧 Multi'), 'Multi');
  assert.equal(cleanName('🇩🇪-Frankfurt'), 'Frankfurt', 'a leftover separator is trimmed');
  assert.equal(cleanName('🇯🇵  Tokyo  Node'), 'Tokyo Node', 'inner whitespace collapses');
  assert.equal(cleanName('🇿🇿 Server'), 'Server', 'even an unassigned indicator goes');
});

test('a name with no flag is left as it is', () => {
  assert.equal(cleanName('Plain Name'), 'Plain Name');
  assert.equal(cleanName('🔥 Fast'), '🔥 Fast', 'a non-flag emoji stays in the name');
  assert.equal(cleanName(''), '');
  assert.equal(cleanName(null), '');
});

/* The full slate of names the refinement calls out: a flag leads, trails or
   sits mid-name; the label is Latin, Persian, Turkish, Chinese, Cyrillic; and
   the generic emoji that are not countries draw no badge and are left in place. */
test('every named flag case resolves to the right badge and clean label', () => {
  const cases = [
    ['🇩🇪 Frankfurt', '🇩🇪', 'Frankfurt'],
    ['Frankfurt 🇩🇪', '🇩🇪', 'Frankfurt'],
    ['Premium 🇩🇪 Frankfurt', '🇩🇪', 'Premium Frankfurt'],
    ['🇩🇪 Frankfurt 🇫🇮 Backup', '🇩🇪', 'Frankfurt Backup'],
    ['🇮🇷 ایران', '🇮🇷', 'ایران'],
    ['🇹🇷 Türkiye', '🇹🇷', 'Türkiye'],
    ['🇨🇳 中国', '🇨🇳', '中国'],
    ['🇷🇺 Россия', '🇷🇺', 'Россия'],
    ['🇦🇪 Dubai', '🇦🇪', 'Dubai'],
  ];
  for (const [raw, flag, clean] of cases) {
    assert.equal(flagOf(raw), flag, 'flag of ' + JSON.stringify(raw));
    assert.equal(cleanName(raw), clean, 'clean of ' + JSON.stringify(raw));
  }
});

test('a generic emoji is never read as a flag and stays in the label', () => {
  const cases = [
    ['🔥 Premium', '🔥 Premium'],
    ['⭐ VIP', '⭐ VIP'],
    ['🚀 Fast', '🚀 Fast'],
    ['💎 Diamond', '💎 Diamond'],
    ['🏳️ Test', '🏳️ Test'],
    ['🏴 Test', '🏴 Test'],
    ['No Flag', 'No Flag'],
  ];
  for (const [raw, clean] of cases) {
    assert.equal(flagOf(raw), '', 'no flag for ' + JSON.stringify(raw));
    assert.equal(cleanName(raw), clean, 'label kept for ' + JSON.stringify(raw));
  }
});

/* --- the bitmap representation -------------------------------------------
   CODES is held as a bitmap over the 26x26 letter grid rather than as a list,
   because the list cost 907 bytes of every artifact (see src/scripts/flag.js).
   These tests are what keeps that honest. The readable list lives here, and the
   SHIPPED bitmap is read back out of the source and compared against it, so a
   wrong bit fails a test instead of quietly reaching a reader. Nothing here
   imports CODES: it stays module-private, and the source text is the artefact
   under test. */

const EXPECTED_CODES = (
  'AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CP CR CU CV CW CX CY CZ ' +
  'DE DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET EU ' +
  'FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
  'HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT ' +
  'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ ' +
  'LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM ' +
  'PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG UK UM UN US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

/* The bitmap, read from the shipped source exactly as the runtime reads it. */
const FLAG_SOURCE = readFileSync(join(ROOT, 'src', 'scripts', 'flag.js'), 'utf8');
const BITMAP_BASE64 = (FLAG_SOURCE.match(/atob\('([^']*)'\)/) || [])[1];
const BITMAP = BITMAP_BASE64 === undefined ? '' : atob(BITMAP_BASE64);

const bitOf = (code) => {
  const i = (code.charCodeAt(0) - 65) * 26 + (code.charCodeAt(1) - 65);
  return (BITMAP.charCodeAt(i >> 3) >> (i & 7)) & 1;
};

test('the bitmap is present and decodes to exactly the assigned codes', () => {
  assert.ok(BITMAP_BASE64, 'flag.js must carry an atob(...) bitmap');
  const decoded = [];
  for (let a = 0; a < 26; a += 1) {
    for (let b = 0; b < 26; b += 1) {
      const code = String.fromCharCode(65 + a) + String.fromCharCode(65 + b);
      if (bitOf(code)) decoded.push(code);
    }
  }
  assert.deepEqual(decoded, EXPECTED_CODES, 'the decoded bitmap must equal the assigned list');
  assert.equal(decoded.length, 258, '258 assigned codes');
});

test('the bitmap holds exactly 258 set bits in 85 bytes', () => {
  assert.equal(BITMAP.length, 85, '676 bits is 84.5 bytes, so the array is 85');
  let set = 0;
  for (let i = 0; i < BITMAP.length; i += 1) {
    let v = BITMAP.charCodeAt(i);
    while (v) { set += v & 1; v >>= 1; }
  }
  assert.equal(set, 258, 'exactly one bit per assigned code, and no stray bits');
});

test('every reserved code is present', () => {
  /* EU, UN and UK, plus the CP/DG/EA/IC/AC/TA dependencies — the codes a plain
     ISO 3166-1 list would omit even though their flags are widely rendered. */
  for (const code of ['EU', 'UN', 'UK', 'CP', 'DG', 'EA', 'IC', 'AC', 'TA']) {
    assert.equal(bitOf(code), 1, code + ' must be assigned');
  }
});

test('ZW survives, which a truncated bitmap would silently drop', () => {
  /* ZW is the last code in the grid and its bit is the highest set: index 672,
     in byte 84. A bitmap sized 676/8 — which reads as 84 — loses it and the
     three bits before it without any error. */
  const index = ('Z'.charCodeAt(0) - 65) * 26 + ('W'.charCodeAt(0) - 65);
  assert.equal(index, 672, 'ZW is the last assigned code in the grid');
  assert.equal(index >> 3, 84, 'and it lives in the 85th byte');
  assert.equal(BITMAP.length, 85, 'so the bitmap must be 85 bytes, not 84');
  assert.equal(bitOf('ZW'), 1, 'ZW must be assigned');
  assert.equal(flagOf('🇿🇼 Harare'), '🇿🇼', 'and it must still resolve end to end');
});

test('all 676 letter pairs behave exactly as the previous list did', () => {
  /* The previous implementation was `new Set(<EXPECTED_CODES>)`. That set is
     rebuilt here and every possible pair is compared through the real flagOf,
     so this is an equivalence proof over the entire input space rather than a
     sample of it. */
  const previous = new Set(EXPECTED_CODES);
  let mismatches = 0;
  let firstMismatch = '';
  for (let a = 0; a < 26; a += 1) {
    for (let b = 0; b < 26; b += 1) {
      const code = String.fromCharCode(65 + a) + String.fromCharCode(65 + b);
      const pair = String.fromCodePoint(0x1f1e6 + a, 0x1f1e6 + b);
      const want = previous.has(code) ? pair : '';
      const got = flagOf('name ' + pair + ' tail');
      if (got !== want) {
        mismatches += 1;
        if (!firstMismatch) firstMismatch = code + ' want=' + JSON.stringify(want) + ' got=' + JSON.stringify(got);
      }
    }
  }
  assert.equal(mismatches, 0, 'every pair must match the list: ' + firstMismatch);
  assert.equal(previous.size, 258, 'the reference list itself is 258 codes');
});
