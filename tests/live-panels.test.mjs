/* Live refresh — 3X-UI edition (MHSanaei).
 *
 * The page polls its own subscription address with `?format=info` — the 3X-UI
 * query form; PasarGuard/Rebecca's `/<token>/info` suffix left with those
 * panels — with credentials omitted, and repaints only from the island payload
 * it recognises ({ totalByte, downloadByte, ... }). A body that is not that
 * payload halts the poller as `unsupported` rather than repainting the page
 * with a guess.
 *
 * The payload translator (fromPanel) stays in the runtime as the frozen
 * user-shaped reading path. In this edition PANELS is empty, so ctx.panel is
 * always '' on a real page and the translator is exercised here as the pure
 * function it is; its first argument is vestigial. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPoller, infoUrl, fromPanel } from '../src/scripts/live.js';
import { normalize, health, expiry } from '../src/scripts/model.js';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const SEC = 1000;

test('the info address is the query form on every build', () => {
  assert.equal(infoUrl('', '/sub/abc'), '/sub/abc?format=info');
  assert.equal(infoUrl('3xui', '/sub/abc'), '/sub/abc?format=info');
  assert.equal(infoUrl('', '/sub/abc/'), '/sub/abc/?format=info');
  assert.equal(infoUrl('', '/prefix/sub/abc'), '/prefix/sub/abc?format=info');
});

/* A user-shaped /info payload, in the vocabulary the translator reads. */
const ACCOUNT = {
  username: 'rtuser1', status: 'active', used_traffic: 5368709120, lifetime_used_traffic: 9e9,
  data_limit: 107374182400, expire: '2026-10-28T12:00:00Z', online_at: '2026-09-28T11:59:30Z',
  on_hold_expire_duration: null, ip: '203.0.113.9', hwid_limit: null,
};

test('an active account translates into the page vocabulary', () => {
  const got = fromPanel('', ACCOUNT, NOW);
  assert.deepEqual(got, {
    enabled: '1', isOnline: '1', downloadByte: 5368709120, uploadByte: 0, totalByte: 107374182400,
    expire: Date.parse('2026-10-28T12:00:00Z') / SEC, lastOnline: Date.parse('2026-09-28T11:59:30Z'),
  });
  assert.equal(Object.values(got).includes('203.0.113.9'), false, 'the subscriber address is never carried');
  const m = normalize(got);
  assert.equal(health(m, NOW), 'active');
  assert.equal(m.used, 5368709120);
});

test('unlimited, never expiring, offline, disabled, limited, on hold', () => {
  const unlimited = fromPanel('', { ...ACCOUNT, data_limit: null, expire: null, online_at: null }, NOW);
  assert.equal(unlimited.totalByte, 0);
  assert.equal(unlimited.expire, 0);
  assert.equal(unlimited.isOnline, '0');
  assert.equal(unlimited.lastOnline, '');
  assert.equal(fromPanel('', { ...ACCOUNT, online_at: '2026-09-28T11:50:00Z' }, NOW).isOnline, '0', 'ten minutes ago');
  const off = fromPanel('', { ...ACCOUNT, status: 'disabled' }, NOW);
  assert.equal(off.enabled, '0');
  assert.equal(off.isOnline, '0', 'a disabled account is not online');
  /* 3X-UI reports no on-hold duration: the expiry reads as unknown — the same
     value the shells render for it. */
  const hold = fromPanel('', { ...ACCOUNT, status: 'on_hold', expire: null }, NOW);
  assert.equal(hold.enabled, '1');
  assert.equal(expiry(normalize(hold), NOW).kind, 'unknown');
  const limited = fromPanel('', { ...ACCOUNT, status: 'limited', used_traffic: 107374182400 }, NOW);
  assert.equal(health(normalize(limited), NOW), 'limited');
});

test('the account nested under `user`, epoch expiry, zoneless UTC timestamp', () => {
  const NESTED = {
    user: {
      username: 'sub1', status: 'active', used_traffic: 1073741824, data_limit: 53687091200,
      expire: Math.floor(Date.parse('2026-11-01T00:00:00Z') / SEC), online_at: '2026-09-28 11:59:00',
      subscription_url: 'https://example/sub/xyz',
    },
  };
  const got = fromPanel('', NESTED, NOW);
  assert.deepEqual(got, {
    enabled: '1', isOnline: '1', downloadByte: 1073741824, uploadByte: 0, totalByte: 53687091200,
    expire: NESTED.user.expire, lastOnline: Date.parse('2026-09-28T11:59:00Z'),
  });
  /* Read as local time it would be off by the reader's offset; the value must be
     the same instant as the explicit UTC form. */
  const zoneless = fromPanel('', { user: { ...NESTED.user, online_at: '2026-09-28 11:59:00' } }, NOW).lastOnline;
  const zoned = fromPanel('', { user: { ...NESTED.user, online_at: '2026-09-28T11:59:00Z' } }, NOW).lastOnline;
  assert.equal(zoneless, zoned);
  assert.equal(fromPanel('', { user: { ...NESTED.user, expire: null } }, NOW).expire, 0, 'null: never');
  assert.equal(fromPanel('', { user: { ...NESTED.user, expire: 0 } }, NOW).expire, 0);
});

test('a payload that is not the expected one is refused, never guessed', () => {
  for (const bad of [
    null, [], 'text', 42, {},
    { status: 'active' },
    { ...ACCOUNT, status: 'deleted' },
    { ...ACCOUNT, used_traffic: -1 },
    { ...ACCOUNT, used_traffic: 'lots' },
    { ...ACCOUNT, expire: 'not a date' },
    { user: { status: 'weird', used_traffic: 1 } },
    /* the island itself sent to the translator: no status vocabulary, refused */
    { enabled: true, totalByte: 1, downloadByte: 1, expire: 0 },
  ]) {
    assert.equal(fromPanel('', bad, NOW), null, JSON.stringify(bad));
  }
});

/* --- the poller, on a 3X-UI page ------------------------------------------ */

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function pageEnv(panel) {
  const timers = new Map();
  const calls = [];
  const waiting = [];
  const seen = { data: [], stop: [] };
  let seq = 0;
  const win = {
    location: { pathname: '/sub/tok123' },
    setTimeout(fn, ms) { seq += 1; timers.set(seq, { fn, ms }); return seq; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, init) { calls.push({ url, init }); return new Promise((resolve, reject) => waiting.push({ resolve, reject })); },
  };
  const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const poller = createPoller({
    win, doc, panel,
    isActive: () => true,
    onData: (data) => seen.data.push(data),
    onTrouble: () => {},
    onStop: (reason) => seen.stop.push(reason),
  });
  return {
    poller, calls, seen,
    fire() { const [id] = [...timers.keys()]; const t = timers.get(id); timers.delete(id); t.fn(); return flush(); },
    answer(body) {
      waiting.shift().resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      return flush();
    },
  };
}

test('the page polls ?format=info with credentials omitted and repaints from its island', async () => {
  const e = pageEnv('');
  e.poller.start();
  await e.fire();
  assert.equal(e.calls[0].url, '/sub/tok123?format=info');
  assert.equal(e.calls[0].init.credentials, 'omit');
  await e.answer({ enabled: true, isOnline: false, totalByte: 10, downloadByte: 5, uploadByte: 1, expire: 0 });
  await flush();
  assert.equal(e.seen.data.length, 1);
  assert.equal(e.seen.data[0].totalByte, 10, 'passed through as it came');
  assert.deepEqual(e.seen.stop, []);
});

test('a payload that is not the island halts as unsupported, never repaints', async () => {
  const e = pageEnv('');
  e.poller.start();
  await e.fire();
  assert.equal(e.calls[0].url, '/sub/tok123?format=info');
  await e.answer({ something: 'else' });
  await flush();
  assert.deepEqual(e.seen.data, [], 'nothing is repainted');
  assert.deepEqual(e.seen.stop, ['unsupported']);
});
