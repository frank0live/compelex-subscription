/* Live refresh on PasarGuard and Rebecca (1.4.0).
 *
 * Both panels serve the figures at /<token>/info, in their own vocabulary. The
 * runtime polls that address and translates the payload into the page's own
 * names; anything it does not recognise halts the poller as `unsupported`
 * rather than repainting the page with a guess (docs/design/LIVE-POLLING-AUDIT.md
 * §3 is the failure this guards). The payloads below are the shapes the panels'
 * current sources produce: PasarGuard's SubscriptionUserResponse, and Rebecca's
 * SubscriptionInfo map, which nests the account under `user`. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPoller, infoUrl, fromPanel } from '../src/scripts/live.js';
import { normalize, health, expiry } from '../src/scripts/model.js';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const SEC = 1000;

test('the info address: a path suffix on the panels, the query on 3X-UI', () => {
  assert.equal(infoUrl('', '/sub/abc'), '/sub/abc?format=info');
  assert.equal(infoUrl('pasarguard', '/sub/abc'), '/sub/abc/info');
  assert.equal(infoUrl('pasarguard', '/sub/abc/'), '/sub/abc/info');
  assert.equal(infoUrl('rebecca', '/prefix/sub/abc'), '/prefix/sub/abc/info');
});

const PG = {
  username: 'rtuser1', status: 'active', used_traffic: 5368709120, lifetime_used_traffic: 9e9,
  data_limit: 107374182400, expire: '2026-10-28T12:00:00Z', online_at: '2026-09-28T11:59:30Z',
  on_hold_expire_duration: null, ip: '203.0.113.9', hwid_limit: null,
};

test('PasarGuard: an active account', () => {
  const got = fromPanel('pasarguard', PG, NOW);
  assert.deepEqual(got, {
    enabled: '1', isOnline: '1', downloadByte: 5368709120, uploadByte: 0, totalByte: 107374182400,
    expire: Date.parse('2026-10-28T12:00:00Z') / SEC, lastOnline: Date.parse('2026-09-28T11:59:30Z'),
  });
  assert.equal(Object.values(got).includes('203.0.113.9'), false, 'the subscriber address is never carried');
  const m = normalize(got);
  assert.equal(health(m, NOW), 'active');
  assert.equal(m.used, 5368709120);
});

test('PasarGuard: unlimited, never expiring, offline, disabled, on hold', () => {
  const unlimited = fromPanel('pasarguard', { ...PG, data_limit: null, expire: null, online_at: null }, NOW);
  assert.equal(unlimited.totalByte, 0);
  assert.equal(unlimited.expire, 0);
  assert.equal(unlimited.isOnline, '0');
  assert.equal(unlimited.lastOnline, '');
  assert.equal(fromPanel('pasarguard', { ...PG, online_at: '2026-09-28T11:50:00Z' }, NOW).isOnline, '0', 'ten minutes ago');
  const off = fromPanel('pasarguard', { ...PG, status: 'disabled' }, NOW);
  assert.equal(off.enabled, '0');
  assert.equal(off.isOnline, '0', 'a disabled account is not online');
  const hold = fromPanel('pasarguard', { ...PG, status: 'on_hold', expire: null, on_hold_expire_duration: 30 * 86400 }, NOW);
  assert.equal(hold.expire, -30 * 86400, 'starts on first connection, valid 30 days');
  assert.equal(expiry(normalize(hold), NOW).kind, 'pending');
  const holdUnknown = fromPanel('pasarguard', { ...PG, status: 'on_hold', on_hold_expire_duration: null }, NOW);
  assert.equal(expiry(normalize(holdUnknown), NOW).kind, 'unknown');
  const limited = fromPanel('pasarguard', { ...PG, status: 'limited', used_traffic: 107374182400 }, NOW);
  assert.equal(health(normalize(limited), NOW), 'limited');
});

const RB = {
  user: {
    username: 'rbuser1', status: 'active', used_traffic: 1073741824, data_limit: 53687091200,
    expire: Math.floor(Date.parse('2026-11-01T00:00:00Z') / SEC), online_at: '2026-09-28 11:59:00',
    subscription_url: 'https://rb.example/sub/xyz', proxies: { vless: { id: 'secret' } },
  },
  openvpn: { enabled: false }, wireguard: { enabled: false },
};

test('Rebecca: the account nested under `user`, epoch expiry, zoneless UTC timestamp', () => {
  const got = fromPanel('rebecca', RB, NOW);
  assert.deepEqual(got, {
    enabled: '1', isOnline: '1', downloadByte: 1073741824, uploadByte: 0, totalByte: 53687091200,
    expire: RB.user.expire, lastOnline: Date.parse('2026-09-28T11:59:00Z'),
  });
});

test('Rebecca: the zoneless timestamp is UTC whatever the reader\'s timezone', () => {
  /* Read as local time it would be off by the reader's offset; the value must be
     the same instant as the explicit UTC form. */
  const zoneless = fromPanel('rebecca', { user: { ...RB.user, online_at: '2026-09-28 11:59:00' } }, NOW).lastOnline;
  const zoned = fromPanel('rebecca', { user: { ...RB.user, online_at: '2026-09-28T11:59:00Z' } }, NOW).lastOnline;
  assert.equal(zoneless, zoned);
});

test('Rebecca: on hold is enabled with an unknown expiry, as the shell renders it', () => {
  const got = fromPanel('rebecca', { user: { ...RB.user, status: 'on_hold' } }, NOW);
  assert.equal(got.enabled, '1');
  assert.equal(expiry(normalize(got), NOW).kind, 'unknown');
  assert.equal(fromPanel('rebecca', { user: { ...RB.user, expire: null } }, NOW).expire, 0, 'null: never');
  assert.equal(fromPanel('rebecca', { user: { ...RB.user, expire: 0 } }, NOW).expire, 0);
});

test('a payload that is not the expected one is refused, never guessed', () => {
  for (const bad of [
    null, [], 'text', 42, {},
    { status: 'active' },
    { ...PG, status: 'deleted' },
    { ...PG, used_traffic: -1 },
    { ...PG, used_traffic: 'lots' },
    { ...PG, expire: 'not a date' },
    { user: { status: 'weird', used_traffic: 1 } },
    /* the 3X-UI island itself, sent to a panel page: not this panel's payload */
    { enabled: true, totalByte: 1, downloadByte: 1, expire: 0 },
  ]) {
    assert.equal(fromPanel('pasarguard', bad, NOW), null, JSON.stringify(bad));
    assert.equal(fromPanel('rebecca', bad, NOW), null, JSON.stringify(bad));
  }
});

/* --- the poller, on a panel page ------------------------------------------------ */

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function panelEnv(panel) {
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

test('a PasarGuard page polls /<token>/info and repaints from the translated payload', async () => {
  const e = panelEnv('pasarguard');
  e.poller.start();
  await e.fire();
  assert.equal(e.calls[0].url, '/sub/tok123/info');
  assert.equal(e.calls[0].init.credentials, 'omit');
  await e.answer({ ...PG, used_traffic: 42 });
  await flush();
  assert.equal(e.seen.data.length, 1);
  assert.equal(e.seen.data[0].downloadByte, 42);
  assert.deepEqual(e.seen.stop, []);
});

test('a Rebecca page halts as unsupported on a payload it does not recognise', async () => {
  const e = panelEnv('rebecca');
  e.poller.start();
  await e.fire();
  assert.equal(e.calls[0].url, '/sub/tok123/info');
  await e.answer({ something: 'else' });
  await flush();
  assert.deepEqual(e.seen.data, [], 'nothing is repainted');
  assert.deepEqual(e.seen.stop, ['unsupported']);
});

test('a 3X-UI page is untouched: ?format=info, and its own island shape', async () => {
  const e = panelEnv('');
  e.poller.start();
  await e.fire();
  assert.equal(e.calls[0].url, '/sub/tok123?format=info');
  await e.answer({ enabled: true, isOnline: false, totalByte: 10, downloadByte: 5, uploadByte: 1, expire: 0 });
  await flush();
  assert.equal(e.seen.data[0].totalByte, 10, 'passed through as it came');
});
