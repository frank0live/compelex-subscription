/* The monogram is drawn whenever an operator configures a service name without
   a logo file, so it has to be right in every script the template ships, and it
   must never cut a character in half. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { graphemes, nameTokens, monogram, displayName } from '../src/scripts/brand.js';

/* Written as a code point: a zero-width non-joiner typed into a source file is
   invisible to review, and the build refuses one. */
const ZWNJ = String.fromCharCode(0x200c);
const ZWJ = String.fromCharCode(0x200d);
const ACUTE = String.fromCharCode(0x301);

const WORD = 'Subscription';

function mono(name) {
  return monogram(name, '', WORD);
}

test('the examples the specification names', () => {
  assert.equal(mono('Katze-VPN'), 'K-V');
  assert.equal(mono('Nova Proxy'), 'N-P');
  assert.equal(mono('BlueNet'), 'B', 'a compound word is one word');
  assert.equal(mono('Premium 100 GB'), 'P-G', 'a number is not a word');
});

test('two initials at most, from the first two meaningful words', () => {
  assert.equal(mono('acme  vpn  services'), 'A-V');
  assert.equal(mono('Northern Lights Secure Networking Cooperative'), 'N-L');
  assert.equal(mono('fast_secure'), 'F-S');
  assert.equal(mono('one|two'), 'O-T');
  assert.equal(mono('123 net'), 'N', 'a digit-only word carries no initial');
  assert.equal(mono('net 5G'), 'N-5', 'but a word with a letter still counts');
  assert.equal(mono('  spaced  '), 'S');
});

test('scripts that do not case, and letters that do not uppercase cleanly', () => {
  assert.equal(mono('کاتزه وی' + ZWNJ + 'پی' + ZWNJ + 'ان'), 'ک-و');
  assert.equal(mono('وی' + ZWNJ + 'پی' + ZWNJ + 'ان'), 'و', 'a joiner does not split a word');
  assert.equal(mono('شبكة الأمان'), 'ش-ا');
  assert.equal(mono('Сеть Надежда'), 'С-Н');
  assert.equal(mono('极速网络'), '极速', 'two ideographs, no hyphen');
  assert.equal(mono('보안 네트워크'), '보안');
  assert.equal(mono('ßeta VPN'), 'ß-V', 'uppercasing must not double the initial');
});

test('a character is never cut in half', () => {
  assert.equal(mono('𝒩ova'), '𝒩');
  assert.equal(Array.from(mono('𝒩ova')).length, 1, 'one character, two code units');
  assert.equal(mono('E' + ACUTE + 'clair'), 'É', 'a decomposed name is composed first');
  assert.equal(mono('Éclair'), 'É');
});

test('a name with nothing to abbreviate falls back in order', () => {
  assert.equal(mono('🚀 Rocket VPN'), 'R-V', 'an emoji is not an initial');
  assert.equal(mono('★★★'), '★', 'but a name made only of symbols is shown as it is');
  assert.equal(monogram('', 'Premium 100 GB', WORD), 'P', 'then the plan title');
  assert.equal(monogram('   ', 'Premium 100 GB', WORD), 'P');
  assert.equal(monogram('', '', WORD), 'S', 'then the localised word');
  assert.equal(monogram('', '', 'اشتراک'), 'ا');
  assert.equal(monogram(null, null, WORD), 'S');
  assert.equal(monogram(undefined, undefined, ''), '');
});

test('nameTokens keeps words together and drops what is not a word', () => {
  assert.deepEqual(nameTokens('Katze-VPN'), ['Katze', 'VPN']);
  assert.deepEqual(nameTokens('Nova   Proxy'), ['Nova', 'Proxy']);
  assert.deepEqual(nameTokens('Premium 100 GB'), ['Premium', 'GB'], 'a number is dropped');
  assert.deepEqual(nameTokens('★ VPN ★'), ['VPN']);
  assert.deepEqual(nameTokens(''), []);
  assert.deepEqual(nameTokens('   '), []);
  assert.deepEqual(nameTokens(null), []);
  assert.deepEqual(nameTokens('وی' + ZWNJ + 'پی'), ['وی' + ZWNJ + 'پی']);
});

test('graphemes counts what a reader would call a character', () => {
  assert.deepEqual(graphemes('abc'), ['a', 'b', 'c']);
  assert.equal(graphemes('🚀ab').length, 3);
  assert.equal(graphemes('🚀ab')[0], '🚀');
  assert.equal(graphemes('E' + ACUTE).length, 1, 'a combining mark stays attached');
  assert.equal(graphemes('👨' + ZWJ + '👩' + ZWJ + '👧').length, 1, 'a joined sequence is one');
  assert.deepEqual(graphemes(''), []);
});

test('the configured service name wins, then the plan title', () => {
  const model = { title: 'Premium 100 GB' };
  assert.equal(displayName({ serviceName: 'Katze-VPN' }, model, WORD), 'Katze-VPN');
  assert.equal(displayName({ serviceName: '  Katze-VPN  ' }, model, WORD), 'Katze-VPN');
  assert.equal(displayName({ serviceName: '' }, model, WORD), 'Premium 100 GB');
  assert.equal(displayName({ serviceName: '   ' }, model, WORD), 'Premium 100 GB');
  assert.equal(displayName(null, model, WORD), 'Premium 100 GB');
  assert.equal(displayName(null, { title: '' }, WORD), WORD);
});
