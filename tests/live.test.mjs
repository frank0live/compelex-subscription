/* The poller, driven by hand.
 *
 * Every timer and every request is a stub, so the tests are about the rules the
 * page depends on: one request at a time, the server-rendered figures survive a
 * failure, an endpoint that will never work is abandoned rather than retried
 * forever, and the address polled is the page's own. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPoller } from '../src/scripts/live.js';

const ACTIVE = 15000;
const IDLE = 60000;
const PATH = '/sub/e3b0c44298fc1c14';

/* Jitter is +/- 10 per cent of the interval. */
function near(ms, target) {
  return ms >= Math.floor(target * 0.9) - 1 && ms <= Math.ceil(target * 1.1) + 1;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function env(active) {
  const timers = new Map();
  const listeners = new Map();
  const calls = [];
  const waiting = [];
  const seen = { data: [], trouble: [], stop: [] };
  let seq = 0;

  const win = {
    location: { pathname: PATH },
    setTimeout(fn, ms) {
      seq += 1;
      timers.set(seq, { fn, ms });
      return seq;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    fetch(url, init) {
      calls.push({ url, init });
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
  };

  const doc = {
    hidden: false,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const at = list.indexOf(fn);
      if (at > -1) list.splice(at, 1);
    },
  };

  const poller = createPoller({
    win: win,
    doc: doc,
    isActive: () => active !== false,
    onData: (data, at) => seen.data.push({ data, at }),
    onTrouble: (failures, at) => seen.trouble.push({ failures, at }),
    onStop: (reason, at) => seen.stop.push({ reason, at }),
  });

  return {
    poller, doc, calls, seen, timers,

    /* The poller keeps at most one timer, and the tests assert that too. */
    scheduled() {
      assert.ok(timers.size <= 1, `${timers.size} timers are pending`);
      const [entry] = [...timers.values()];
      return entry ? entry.ms : null;
    },

    fire() {
      assert.equal(timers.size, 1, 'exactly one timer should be pending');
      const [id] = [...timers.keys()];
      const entry = timers.get(id);
      timers.delete(id);
      entry.fn();
      return flush();
    },

    visibility() {
      for (const fn of listeners.get('visibilitychange') || []) fn();
      return flush();
    },

    listenerCount() {
      return (listeners.get('visibilitychange') || []).length;
    },

    answer(response) {
      const next = waiting.shift();
      assert.ok(next, 'no request is in flight');
      next.resolve(response);
      return flush();
    },

    reject(err) {
      const next = waiting.shift();
      assert.ok(next, 'no request is in flight');
      next.reject(err);
      return flush();
    },
  };
}

/* A complete island payload, matching what the shell actually emits: all
   thirteen `data-*` attributes, in the raw names the runtime's normalize()
   reads. It used to carry only three keys, which was not a faithful payload and
   is no longer enough to pass looksLikeInfo(). */
const ISLAND = {
  enabled: '1',
  isOnline: '1',
  downloadByte: 0,
  uploadByte: 0,
  totalByte: 0,
  expire: 0,
  lastOnline: 0,
  subUrl: 'https://sub.example.com/sub/token',
  subJsonUrl: '',
  subClashUrl: '',
  subTitle: 'Subscription',
  subSupportUrl: '',
  datepicker: 'gregorian',
};

const info = (over) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(Object.assign({}, ISLAND, over)),
});

const status = (code) => ({ ok: false, status: code, json: () => Promise.resolve({}) });

const body = (value) => ({ ok: true, status: 200, json: () => Promise.resolve(value) });

const notJson = () => ({
  ok: true,
  status: 200,
  json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
});

test('the first poll is one interval away, because the server just rendered the page', async () => {
  const e = env();
  e.poller.start();
  assert.equal(e.calls.length, 0);
  assert.ok(near(e.scheduled(), ACTIVE), `${e.scheduled()}ms`);
  assert.equal(e.listenerCount(), 1);
});

test('a poll asks this page for its own figures and nothing else', async () => {
  const e = env();
  e.poller.start();
  await e.fire();

  assert.equal(e.calls.length, 1);
  assert.equal(e.calls[0].url, PATH + '?format=info', 'never an address from the model');
  assert.equal(e.calls[0].init.credentials, 'omit');
  assert.equal(e.calls[0].init.cache, 'no-store');
  assert.equal(e.calls[0].init.headers.Accept, 'application/json');

  await e.answer(info({ totalByte: 42 }));
  assert.equal(e.seen.data.length, 1);
  assert.equal(e.seen.data[0].data.totalByte, 42);
  assert.ok(e.poller.lastSuccess() > 0);
  assert.ok(near(e.scheduled(), ACTIVE), `${e.scheduled()}ms`);
  assert.deepEqual(e.seen.trouble, []);
  assert.deepEqual(e.seen.stop, []);
});

test('a page nobody is looking at polls once a minute', async () => {
  const e = env(false);
  e.poller.start();
  assert.ok(near(e.scheduled(), IDLE), `${e.scheduled()}ms`);
  await e.fire();
  await e.answer(info());
  assert.ok(near(e.scheduled(), IDLE), `${e.scheduled()}ms`);
});

test('a hidden page does not poll, and resumes when it comes back', async () => {
  const e = env();
  e.poller.start();
  e.doc.hidden = true;

  await e.visibility();
  assert.equal(e.scheduled(), null, 'the pending tick is dropped');

  await e.visibility();
  assert.equal(e.calls.length, 0);

  e.doc.hidden = false;
  await e.visibility();
  assert.ok(near(e.scheduled(), ACTIVE), `${e.scheduled()}ms`);
  await e.fire();
  assert.equal(e.calls.length, 1);
});

test('a tick that arrives while the page is hidden is ignored', async () => {
  const e = env();
  e.poller.start();
  e.doc.hidden = true;
  await e.fire();
  assert.equal(e.calls.length, 0);
  assert.equal(e.scheduled(), null);
});

test('two requests are never in flight at once', async () => {
  const e = env();
  e.poller.start();
  await e.fire();
  assert.equal(e.calls.length, 1);

  /* Coming back into view while a request is still open must not start another. */
  await e.visibility();
  await e.fire();
  assert.equal(e.calls.length, 1, 'the second tick was refused');

  await e.answer(info());
  assert.equal(e.seen.data.length, 1);
  await e.fire();
  assert.equal(e.calls.length, 2, 'and the next one runs normally');
});

/* A panel too old to answer ?format=info, or a proxy that answers with its own
   login page, will not start working on a retry. */
test('an endpoint that cannot work is abandoned, once', async () => {
  for (const response of [status(404), status(400), status(403), notJson(), body([1, 2]),
    body({ login: true }), body('ok'), body(null)]) {
    const e = env();
    e.poller.start();
    await e.fire();
    await e.answer(response);

    assert.deepEqual(e.seen.stop.map((s) => s.reason), ['unsupported'], JSON.stringify(response.status));
    assert.deepEqual(e.seen.data, [], 'the rendered figures are left alone');
    assert.equal(e.scheduled(), null, 'nothing is retried');

    await e.visibility();
    assert.equal(e.scheduled(), null, 'and coming back into view does not restart it');
  }
});

test('a server error is retried with a growing delay, and gives up in the end', async () => {
  const e = env();
  e.poller.start();

  const expected = [ACTIVE, 30000, 60000, 120000, 120000];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await e.fire();
    await e.answer(status(503));
    assert.equal(e.seen.trouble.length, attempt);
    assert.equal(e.seen.trouble[attempt - 1].failures, attempt);
    assert.ok(near(e.scheduled(), expected[attempt - 1]), `attempt ${attempt}: ${e.scheduled()}ms`);
    assert.deepEqual(e.seen.stop, [], 'not yet');
  }

  await e.fire();
  await e.answer(status(503));
  assert.deepEqual(e.seen.stop.map((s) => s.reason), ['unreachable']);
  assert.equal(e.seen.trouble.length, 5, 'the sixth failure is a stop, not another warning');
  assert.equal(e.scheduled(), null);
  assert.deepEqual(e.seen.data, [], 'six failures never blanked the page');
});

test('a dropped connection is a retry, not a diagnosis', async () => {
  const e = env();
  e.poller.start();
  await e.fire();
  await e.reject(new TypeError('Failed to fetch'));

  assert.deepEqual(e.seen.stop, []);
  assert.equal(e.seen.trouble.length, 1);
  assert.ok(near(e.scheduled(), ACTIVE), `${e.scheduled()}ms`);
});

test('a successful poll forgets the failures before it', async () => {
  const e = env();
  e.poller.start();
  for (let i = 0; i < 3; i += 1) {
    await e.fire();
    await e.answer(status(503));
  }
  assert.equal(e.seen.trouble.length, 3);

  await e.fire();
  await e.answer(info());
  assert.ok(near(e.scheduled(), ACTIVE), `${e.scheduled()}ms`);

  await e.fire();
  await e.answer(status(503));
  assert.equal(e.seen.trouble.at(-1).failures, 1, 'counting starts again');
});

test('Refresh polls at once and clears the halt', async () => {
  const e = env();
  e.poller.start();
  for (let i = 0; i < 6; i += 1) {
    await e.fire();
    await e.answer(status(503));
  }
  assert.deepEqual(e.seen.stop.map((s) => s.reason), ['unreachable']);

  e.poller.resume();
  assert.equal(e.scheduled(), 0, 'the reader asked for it now');
  await e.fire();
  await e.answer(info({ totalByte: 7 }));
  assert.equal(e.seen.data.length, 1);
  assert.equal(e.seen.data[0].data.totalByte, 7);
  assert.ok(near(e.scheduled(), ACTIVE), `${e.scheduled()}ms`);
});

test('stop leaves nothing behind', async () => {
  const e = env();
  e.poller.start();
  assert.equal(e.listenerCount(), 1);

  e.poller.stop();
  assert.equal(e.scheduled(), null);
  assert.equal(e.listenerCount(), 0, 'the visibility listener is removed');

  await e.visibility();
  assert.equal(e.scheduled(), null);
  assert.equal(e.calls.length, 0);
});
