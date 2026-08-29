/* Catalogue lookup and every Intl assumption the page makes.
 *
 * The Intl half is the verification the specification asks for: the calendar and
 * the numbering system are read back from the formatter that was actually built,
 * so a runtime without Persian calendar data fails here rather than silently
 * showing every reader a different date. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCatalogues, createI18n } from '../src/scripts/i18n.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'fa', 'ar', 'ru', 'zh'];

const CATALOGUES = {};
for (const code of LANGS) {
  CATALOGUES[code] = JSON.parse(readFileSync(join(ROOT, 'src', 'locales', `${code}.json`), 'utf8'));
}

/* Mid-January 2026: 25 Dey 1404 in the Persian calendar. Both years are looked
   for in the formatted output, which is how the calendar is verified. */
const AT = Date.UTC(2026, 0, 15, 12, 0, 0);

/* Latin digits in every language, because a byte figure and a date are values a
   reader compares with what their client application shows. */
function digitsAreLatin(text) {
  for (const ch of text) {
    if (/\p{Nd}/u.test(ch) && !(ch >= '0' && ch <= '9')) return false;
  }
  return true;
}

test('the five catalogues agree on their keys and carry no empty strings', () => {
  const base = Object.keys(CATALOGUES.en).sort();
  assert.ok(base.length > 50, `only ${base.length} keys`);
  for (const code of LANGS) {
    assert.deepEqual(Object.keys(CATALOGUES[code]).sort(), base, `${code} key set`);
    for (const key of base) {
      const value = CATALOGUES[code][key];
      assert.equal(typeof value, 'string', `${code}.${key}`);
      assert.ok(value.trim() !== '', `${code}.${key} is empty`);
    }
  }
});

test('a missing phrase falls back to English, and a missing key to itself', () => {
  const cats = { en: { greeting: 'Hello', plan: 'Plan {name}' }, fa: { greeting: 'سلام' } };

  const fa = createI18n(cats, 'fa', false);
  assert.equal(fa.t('greeting'), 'سلام');
  assert.equal(fa.t('plan', { name: 'A' }), 'Plan A', 'English carries what fa does not');
  assert.equal(fa.t('nothing.at.all'), 'nothing.at.all', 'the key itself, never blank');

  const unknown = createI18n(cats, 'de', false);
  assert.equal(unknown.lang, 'de');
  assert.equal(unknown.t('greeting'), 'Hello', 'an unknown language reads English');

  assert.equal(createI18n({}, 'en', false).t('greeting'), 'greeting', 'no catalogues at all');
});

test('placeholders are replaced, and only the ones supplied', () => {
  const t = createI18n({ en: { a: '{x} of {y}', b: 'plain' } }, 'en', false).t;
  assert.equal(t('a', { x: '1', y: '2' }), '1 of 2');
  assert.equal(t('a', { x: '1' }), '1 of {y}', 'an unsupplied placeholder is left alone');
  assert.equal(t('a'), '{x} of {y}');
  assert.equal(t('b', { x: '1' }), 'plain');
  assert.equal(t('a', { x: 0, y: false }), '0 of false', 'values are stringified, not tested');
  assert.equal(t('a', Object.create({ x: 'inherited' })), '{x} of {y}', 'own properties only');
});

test('the real catalogues answer for every language', () => {
  for (const code of LANGS) {
    const i18n = createI18n(CATALOGUES, code, false);
    for (const key of ['status.active', 'traffic.used', 'expiry.never', 'action.copy']) {
      const value = i18n.t(key);
      assert.notEqual(value, key, `${code}.${key} is missing`);
      assert.ok(value.trim() !== '');
    }
    assert.equal(i18n.t('traffic.used_of', { total: '100 GB' }).includes('100 GB'), true);
  }
});

test('every language resolves to Latin digits and the Gregorian calendar', () => {
  for (const code of LANGS) {
    const { fmt } = createI18n(CATALOGUES, code, false);
    assert.equal(fmt.resolved.calendar, 'gregory', `${code} calendar`);
    assert.equal(fmt.resolved.numbering, 'latn', `${code} numbering`);
    assert.equal(fmt.resolved.units, true, `${code} unit formatting`);

    const date = fmt.date(AT);
    assert.ok(date.includes('2026'), `${code}: ${date}`);
    assert.ok(digitsAreLatin(date), `${code}: ${date}`);

    const figure = fmt.number(38.4, 1);
    assert.ok(digitsAreLatin(figure), `${code}: ${figure}`);
    assert.ok(/38[.,]4/.test(figure), `${code}: ${figure}`);
    assert.equal(fmt.number(0, 0), '0', `${code} zero`);

    const days = fmt.days(30);
    assert.ok(days.includes('30'), `${code}: ${days}`);
    assert.ok(fmt.days(1).trim() !== '');
    assert.notEqual(fmt.days(1), days, `${code} distinguishes one day from thirty`);

    const relative = fmt.relative(-3, 'day');
    assert.ok(typeof relative === 'string' && relative.trim() !== '', `${code}: ${relative}`);
    assert.ok(digitsAreLatin(relative), `${code}: ${relative}`);
  }
});

/* The panel's datepicker setting decides the calendar. The language never does:
   a Persian speaker on a Gregorian panel must see the operator's dates. */
test('Jalali follows the panel setting, in every language', () => {
  for (const code of LANGS) {
    const jalali = createI18n(CATALOGUES, code, true);
    assert.equal(jalali.fmt.resolved.calendar, 'persian', `${code} calendar`);
    assert.equal(jalali.fmt.resolved.numbering, 'latn', `${code} numbering`);

    const date = jalali.fmt.date(AT);
    assert.ok(date.includes('1404'), `${code}: ${date}`);
    assert.ok(digitsAreLatin(date), `${code}: ${date}`);
  }
  assert.ok(createI18n(CATALOGUES, 'fa', false).fmt.date(AT).includes('2026'));
  assert.ok(createI18n(CATALOGUES, 'en', true).fmt.date(AT).includes('1404'));
});

test('Intl.Segmenter is available for grapheme splitting', () => {
  assert.equal(typeof Intl.Segmenter, 'function');
  assert.equal(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).resolvedOptions().granularity, 'grapheme');
});

/* The island is the only channel between the build and the running page, and a
   damaged one must leave the page in English rather than throwing during boot. */
test('the catalogue island is read defensively', () => {
  const doc = (node) => ({ getElementById: (id) => (id === 'i18n-data' ? node : null) });
  assert.deepEqual(readCatalogues(doc({ textContent: '{"en":{"a":"A"}}' })), { en: { a: 'A' } });
  assert.deepEqual(readCatalogues(doc(null)), {}, 'no island at all');
  assert.deepEqual(readCatalogues(doc({ textContent: '{"en":' })), {}, 'a truncated island');
  assert.deepEqual(readCatalogues(doc({ textContent: '' })), {});
});
