/* The state machine, in the order the product defines it. Every case here is a
   subscription an operator can actually have, and the ones that matter most are
   the three where reachability contradicts health. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalize, health, isOnline, traffic, expiry, dayIndex } from '../src/scripts/model.js';

const GB = 1024 * 1024 * 1024;

/* The panel hands every figure over as a string, so the fixtures are strings. */
function raw(over) {
  return Object.assign({
    enabled: '1',
    isOnline: '1',
    downloadByte: String(32 * GB),
    uploadByte: String(6 * GB),
    totalByte: String(100 * GB),
    expire: '1800000000',
    lastOnline: '1700000000000',
    subUrl: '  https://sub.example.com/sub/abc  ',
    subJsonUrl: '',
    subClashUrl: '',
    subTitle: '  Premium 100 GB  ',
    subSupportUrl: 'https://t.me/example',
    announce: 'Maintenance on Sunday.',
    /* The panel sends this; the page has no use for it and must not carry it. */
    emails: ['', '   ', '  alice@example.com  '],
    datepicker: 'gregorian',
  }, over || {});
}

function model(over) {
  return normalize(raw(over));
}

test('normalize turns the panel view model into numbers exactly once', () => {
  const m = model();
  assert.equal(m.enabled, true);
  assert.equal(m.online, true);
  assert.equal(m.download, 32 * GB);
  assert.equal(m.upload, 6 * GB);
  assert.equal(m.used, 38 * GB);
  assert.equal(m.total, 100 * GB);
  assert.equal(m.expire, 1800000000);
  assert.equal(m.lastOnline, 1700000000000);
  assert.equal(m.subUrl, 'https://sub.example.com/sub/abc');
  assert.equal(m.title, 'Premium 100 GB');
});

/* The subscriber's own address is the one field of the panel view model the page
   refuses to hold, so it must not survive normalisation either. */
test('the subscriber address is not carried into the model', () => {
  assert.equal(model().emails, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(model(), 'emails'), false);
});

test('an untrustworthy counter is null, never zero', () => {
  assert.equal(model({ downloadByte: '-1' }).download, null);
  assert.equal(model({ downloadByte: '-1' }).used, null, 'a partial sum is not a sum');
  assert.equal(model({ totalByte: '-5' }).total, null);
  assert.equal(model({ lastOnline: '-1' }).lastOnline, null);
  assert.equal(model({ uploadByte: '' }).used, null);
  assert.equal(model({ uploadByte: 'nonsense' }).used, null);
  assert.equal(model({ totalByte: '0' }).total, 0, 'zero is a real limit: unlimited');
});

test('only the panel datepicker selects Jalali', () => {
  assert.equal(model({ datepicker: 'jalali' }).jalali, true);
  assert.equal(model({ datepicker: 'gregorian' }).jalali, false);
  assert.equal(model({ datepicker: 'not-a-calendar' }).jalali, false);
  assert.equal(model({ datepicker: undefined }).jalali, false);
});

test('enabled accepts what the panel writes and nothing else', () => {
  assert.equal(model({ enabled: '0' }).enabled, false);
  assert.equal(model({ enabled: true }).enabled, true);
  assert.equal(model({ enabled: 1 }).enabled, true);
  assert.equal(model({ enabled: undefined }).enabled, false);
  assert.equal(model({ enabled: 'yes' }).enabled, false);
});

test('an implausible expiry date is unavailable, not 1970', () => {
  assert.equal(model({ expire: '99999999999999' }).expire, null);
  assert.equal(model({ expire: '-99999999999' }).expire, null);
  assert.equal(model({ expire: '' }).expire, null);
  assert.equal(model({ expire: '0' }).expire, 0);
  assert.equal(model({ expire: '-2592000' }).expire, -2592000);
});

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const PAST = '1700000000'; /* November 2023 */

test('health follows disabled, expired, limited, active', () => {
  assert.equal(health(model(), NOW), 'active');
  assert.equal(health(model({ enabled: '0' }), NOW), 'disabled');
  assert.equal(health(model({ expire: PAST }), NOW), 'expired');
  assert.equal(health(model({ downloadByte: String(100 * GB), uploadByte: '0' }), NOW), 'limited');
  assert.equal(
    health(model({ enabled: '0', expire: PAST, downloadByte: String(200 * GB) }), NOW),
    'disabled',
    'the strongest reason is the one shown',
  );
  assert.equal(
    health(model({ expire: PAST, downloadByte: String(200 * GB) }), NOW),
    'expired',
  );
});

/* The three cases the specification calls out: a node still reporting traffic
   must not make an unusable subscription look healthy. */
test('a reported connection never overrides health', () => {
  const cases = [
    ['disabled', { enabled: '0', isOnline: '1' }],
    ['expired', { expire: PAST, isOnline: '1' }],
    ['limited', { downloadByte: String(100 * GB), uploadByte: '0', isOnline: '1' }],
  ];
  for (const [expected, over] of cases) {
    const m = model(over);
    assert.equal(m.online, true, 'the reading itself is preserved');
    assert.equal(health(m, NOW), expected);
    assert.equal(isOnline(m, health(m, NOW)), false, `${expected} must not read as online`);
  }
  const ok = model();
  assert.equal(isOnline(ok, health(ok, NOW)), true);
  assert.equal(isOnline(model({ isOnline: '0' }), 'active'), false);
});

test('health does not invent a limit or a date it does not have', () => {
  assert.equal(health(model({ totalByte: '0', downloadByte: String(9 * GB) }), NOW), 'active');
  assert.equal(health(model({ totalByte: '-5', downloadByte: String(9 * GB) }), NOW), 'active');
  assert.equal(health(model({ downloadByte: '-1', uploadByte: '-1' }), NOW), 'active');
  assert.equal(health(model({ expire: '' }), NOW), 'active');
  assert.equal(health(model({ expire: '-2592000' }), NOW), 'active', 'a duration is not a date');
});

test('a percentage is offered only when there is a real denominator', () => {
  assert.deepEqual(traffic(model({ downloadByte: '-1' })), { kind: 'usage-unknown', pct: null });

  const noLimit = traffic(model({ totalByte: '-5' }));
  assert.equal(noLimit.kind, 'limit-unknown');
  assert.equal(noLimit.pct, null);
  assert.equal(noLimit.used, 38 * GB);

  const unlimited = traffic(model({ totalByte: '0' }));
  assert.equal(unlimited.kind, 'unlimited');
  assert.equal(unlimited.pct, null);
});

test('traffic arithmetic stays inside the figures it was given', () => {
  const half = traffic(model({ downloadByte: String(50 * GB), uploadByte: '0' }));
  assert.equal(half.kind, 'inuse');
  assert.equal(half.pct, 50);
  assert.equal(half.remaining, 50 * GB);

  const empty = traffic(model({ downloadByte: '0', uploadByte: '0' }));
  assert.equal(empty.kind, 'empty');
  assert.equal(empty.pct, 0);
  assert.equal(empty.remaining, 100 * GB);

  const exact = traffic(model({ downloadByte: String(100 * GB), uploadByte: '0' }));
  assert.equal(exact.kind, 'reached');
  assert.equal(exact.pct, 100);
  assert.equal(exact.remaining, 0);

  const over = traffic(model({ downloadByte: String(125 * GB), uploadByte: '0' }));
  assert.equal(over.kind, 'reached');
  assert.equal(over.pct, 125);
  assert.equal(over.remaining, 0, 'nothing left is not a negative amount left');
});

/* Calendar days in the reader's own timezone, so the fixtures are built from
   local dates rather than from UTC offsets. */
function local(y, mo, d, h) {
  return new Date(y, mo, d, h, 0, 0).getTime();
}

function expiryAt(ms, now) {
  return expiry(model({ expire: String(Math.floor(ms / 1000)) }), now);
}

test('expiry names the six outcomes and never a date it cannot trust', () => {
  const now = local(2026, 0, 15, 12);
  assert.deepEqual(expiry(model({ expire: '' }), now), { kind: 'unknown' });
  assert.deepEqual(expiry(model({ expire: '99999999999999' }), now), { kind: 'unknown' });
  assert.deepEqual(expiry(model({ expire: '0' }), now), { kind: 'never' });

  const pending = expiry(model({ expire: '-2592000' }), now);
  assert.equal(pending.kind, 'pending');
  assert.equal(pending.days, 30);
  assert.equal(expiry(model({ expire: '-1' }), now).days, 1, 'a short duration is still a day');

  const gone = expiryAt(local(2026, 0, 9, 12), now);
  assert.equal(gone.kind, 'expired');
  assert.equal(gone.at, local(2026, 0, 9, 12));
  assert.equal(expiryAt(now, now).kind, 'expired', 'the moment itself has passed');
});

test('today and tomorrow are calendar days, not twenty-four hour windows', () => {
  const evening = local(2026, 0, 15, 18);
  assert.equal(expiryAt(local(2026, 0, 15, 23), evening).kind, 'today');
  assert.equal(expiryAt(local(2026, 0, 15, 23), evening).days, 0);

  const soon = expiryAt(local(2026, 0, 16, 14), evening);
  assert.equal(soon.kind, 'tomorrow', 'twenty hours away, but the next calendar day');
  assert.equal(soon.days, 1);

  const later = expiryAt(local(2026, 0, 25, 9), evening);
  assert.equal(later.kind, 'future');
  assert.equal(later.days, 10);
});

test('dayIndex counts local calendar days', () => {
  assert.equal(dayIndex(local(2026, 0, 15, 0)), dayIndex(local(2026, 0, 15, 23)));
  assert.equal(dayIndex(local(2026, 0, 16, 3)) - dayIndex(local(2026, 0, 15, 22)), 1);
  assert.equal(dayIndex(local(2026, 2, 1, 12)) - dayIndex(local(2026, 1, 28, 12)), 1);
});
