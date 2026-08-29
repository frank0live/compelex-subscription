/* Byte figures, percentages and the bar. These are the numbers a reader
   compares against their client application, so the ladder and the rounding are
   pinned rather than described. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NBSP, scaleBytes, bytesText, percentText, barWidth, barLevel, relativeParts,
} from '../src/scripts/format.js';

/* Deliberately not Intl: these tests are about the arithmetic, and the locale
   formatting is verified in i18n.test.mjs. */
const fmt = { number: (value, digits) => value.toFixed(digits) };

function size(n) {
  return bytesText(n, fmt);
}

test('the ladder is base 1024 and stops at PB', () => {
  assert.deepEqual(scaleBytes(0), { value: 0, digits: 0, unit: 'B' });
  assert.deepEqual(scaleBytes(512), { value: 512, digits: 0, unit: 'B' });
  assert.deepEqual(scaleBytes(1024), { value: 1, digits: 0, unit: 'KB' });
  assert.equal(scaleBytes(1024 ** 2).unit, 'MB');
  assert.equal(scaleBytes(1024 ** 3).unit, 'GB');
  assert.equal(scaleBytes(1024 ** 4).unit, 'TB');
  assert.equal(scaleBytes(1024 ** 5).unit, 'PB');
  assert.equal(scaleBytes(1024 ** 6).unit, 'PB', 'an exabyte subscription is still PB');
  assert.equal(scaleBytes(1024 ** 6).value, 1024);
});

test('precision drops as the figure grows, and bytes are never fractional', () => {
  assert.equal(size(0), '0' + NBSP + 'B');
  assert.equal(size(1536), '2' + NBSP + 'KB');
  assert.equal(size(1.5 * 1024 ** 2), '1.50' + NBSP + 'MB');
  assert.equal(size(10 * 1024 ** 2), '10.0' + NBSP + 'MB');
  assert.equal(size(100 * 1024 ** 2), '100' + NBSP + 'MB');
  assert.equal(size(38.4 * 1024 ** 3), '38.4' + NBSP + 'GB');
});

test('a figure that would round to 1024 of its unit is promoted', () => {
  assert.equal(size(1024 ** 2 - 1), '1.00' + NBSP + 'MB');
  assert.equal(size(1024 ** 3 - 1), '1.00' + NBSP + 'GB');
  assert.equal(size(1023.6 * 1024 ** 2), '1.00' + NBSP + 'GB');
});

test('an unusable figure produces nothing at all', () => {
  for (const bad of [-1, -1024, NaN, Infinity, -Infinity, null, undefined, '38GB']) {
    assert.equal(scaleBytes(bad), null, `scaleBytes(${String(bad)})`);
    assert.equal(bytesText(bad, fmt), null, `bytesText(${String(bad)})`);
  }
});

test('percentages tell the truth at both ends of the scale', () => {
  assert.equal(percentText(0, fmt), '0%');
  assert.equal(percentText(0.4, fmt), '<1%', 'used, but not yet one per cent');
  assert.equal(percentText(1, fmt), '1%');
  assert.equal(percentText(42.4, fmt), '42%');
  assert.equal(percentText(99.5, fmt), '>99%', 'not yet finished');
  assert.equal(percentText(100, fmt), '100%');
  assert.equal(percentText(125, fmt), '125%', 'over the limit is reported, not hidden');
  for (const bad of [-1, NaN, Infinity, null]) {
    assert.equal(percentText(bad, fmt), null, `percentText(${String(bad)})`);
  }
});

test('the bar is drawable for every value the model can produce', () => {
  assert.equal(barWidth(0), 0);
  assert.equal(barWidth(42.5), 42.5);
  assert.equal(barWidth(100), 100);
  assert.equal(barWidth(125), 100, 'no overflowing fill');
  for (const bad of [-5, NaN, Infinity, null, undefined]) {
    assert.equal(barWidth(bad), 0, `barWidth(${String(bad)})`);
    assert.ok(Number.isFinite(barWidth(bad)), 'a CSS length is always a number');
  }

  assert.equal(barLevel(0), 'ok');
  assert.equal(barLevel(89.9), 'ok');
  assert.equal(barLevel(90), 'warn');
  assert.equal(barLevel(99.9), 'warn');
  assert.equal(barLevel(100), 'over');
  assert.equal(barLevel(125), 'over');
  assert.equal(barLevel(NaN), 'ok');
});

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('relative parts describe an age in the past', () => {
  assert.deepEqual(relativeParts(30 * SECOND, true), { value: -30, unit: 'second' });
  assert.equal(relativeParts(30 * SECOND, false), null, 'too recent to be worth a phrase');
  assert.deepEqual(relativeParts(50 * SECOND, false), { value: -1, unit: 'minute' });
  assert.deepEqual(relativeParts(100 * SECOND, false), { value: -2, unit: 'minute' });
  assert.deepEqual(relativeParts(90 * MINUTE, false), { value: -2, unit: 'hour' });
  assert.deepEqual(relativeParts(2 * DAY, false), { value: -2, unit: 'day' });
  assert.deepEqual(relativeParts(40 * DAY, false), { value: -1, unit: 'month' });
  assert.deepEqual(relativeParts(400 * DAY, false), { value: -1, unit: 'year' });
});

/* The page passes now - then, and a device clock running ahead of the server
   would make that negative. It must read as "just now", never as the future. */
test('a clock skewed into the future is clamped, not inverted', () => {
  const parts = relativeParts(-5 * DAY, true);
  assert.equal(parts.unit, 'second');
  assert.equal(Math.abs(parts.value), 0);
  assert.equal(relativeParts(-5 * DAY, false), null);
});
