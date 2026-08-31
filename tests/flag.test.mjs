/* A configuration's name may carry a country flag, and the badge is drawn only
   for a flag that names a real country. Anything else — a plain emoji, a lone
   or unassigned indicator, the white or black flag — must leave no badge and
   never an empty circle. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { flagOf, cleanName } from '../src/scripts/flag.js';

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
