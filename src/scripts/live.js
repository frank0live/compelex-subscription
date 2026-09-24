/* Live refresh.
 *
 * The rules that matter: only while the page is visible, never two requests at
 * once, never an older response overwriting a newer one, and a failure must
 * leave the server-rendered figures standing rather than blanking the page. The
 * address is built from the current path, never from the subscription URL in the
 * model, so a link the operator rewrote cannot redirect the poll. */

const ACTIVE_INTERVAL = 15000;
const IDLE_INTERVAL = 60000;
const TIMEOUT = 8000;
const BACKOFF = [15000, 30000, 60000, 120000];
const MAX_FAILURES = 6;

function jitter(ms) {
  if (ms <= 0) return 0;
  const spread = ms * 0.1;
  return Math.round(ms - spread + Math.random() * spread * 2);
}

/* A shape check, not a key-presence check.
 *
 * This must accept OUR island payload and nothing else. The previous version
 * accepted `enabled` OR `totalByte` OR `expire`, and `expire` is the problem:
 * every panel sends it, in a different type — epoch seconds for 3X-UI, an ISO
 * datetime for PasarGuard, an int64 for Rebecca. A foreign payload therefore
 * passed the guard, reached normalize(), and was coerced to
 * `enabled:false, online:false, all traffic null` — a silently wrong page that
 * looked healthy, repainting every 15 seconds.
 *
 * `totalByte` and `downloadByte` are island-only names: they appear in the
 * `data-*` attributes this product emits and in no panel's own payload. Two of
 * them, because one is a weaker claim than two. A payload that fails this halts
 * as `unsupported`, which is the honest outcome — the server-rendered figures
 * stand rather than being overwritten with a guess. */
function looksLikeInfo(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return 'totalByte' in value && 'downloadByte' in value;
}

function failure(structural) {
  const err = new Error('subscription info request failed');
  err.structural = structural;
  return err;
}

export function createPoller(ctx) {
  const win = ctx.win;
  const doc = ctx.doc;

  let timer = null;
  let inFlight = false;
  let ticket = 0;
  let failures = 0;
  let halted = false;
  let lastOk = 0;

  function clear() {
    if (timer !== null) {
      win.clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(ms) {
    clear();
    if (halted) return;
    timer = win.setTimeout(run, jitter(Math.max(0, ms)));
  }

  function interval() {
    return ctx.isActive() ? ACTIVE_INTERVAL : IDLE_INTERVAL;
  }

  function halt(reason) {
    halted = true;
    clear();
    ctx.onStop(reason, lastOk);
  }

  function request() {
    const init = {
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    };
    if (win.AbortSignal && typeof win.AbortSignal.timeout === 'function') {
      init.signal = win.AbortSignal.timeout(TIMEOUT);
    }
    return win.fetch(win.location.pathname + '?format=info', init);
  }

  function run() {
    clear();
    if (halted || inFlight || doc.hidden) return;

    inFlight = true;
    ticket += 1;
    const mine = ticket;

    request()
      .then(function (res) {
        /* A missing or refused endpoint will not start working on a retry; a
           server error might. */
        if (!res.ok) throw failure(res.status === 404 || res.status === 400 || res.status === 403);
        return res.json();
      })
      .then(function (data) {
        if (mine !== ticket) return;
        if (!looksLikeInfo(data)) throw failure(true);
        failures = 0;
        lastOk = Date.now();
        ctx.onData(data, lastOk);
        schedule(interval());
      })
      .catch(function (err) {
        if (mine !== ticket) return;
        /* A body that is not JSON means this is not the endpoint we expect. */
        if ((err && err.structural) || (err && err.name === 'SyntaxError')) {
          halt('unsupported');
          return;
        }
        failures += 1;
        if (failures >= MAX_FAILURES) {
          halt('unreachable');
          return;
        }
        ctx.onTrouble(failures, lastOk);
        schedule(BACKOFF[Math.min(failures - 1, BACKOFF.length - 1)]);
      })
      .then(function () {
        inFlight = false;
      });
  }

  function onVisibility() {
    if (doc.hidden) {
      clear();
      return;
    }
    /* Back in view: refresh at once if the figures are already a full cycle
       old, otherwise finish the cycle that was interrupted. */
    schedule(Date.now() - lastOk >= ACTIVE_INTERVAL ? 0 : interval());
  }

  return {
    start: function () {
      /* The page was rendered by the server a moment ago, so the first poll is
         one interval away, not immediate. */
      lastOk = Date.now();
      doc.addEventListener('visibilitychange', onVisibility);
      schedule(interval());
    },

    stop: function () {
      halted = true;
      clear();
      doc.removeEventListener('visibilitychange', onVisibility);
    },

    /* The Refresh button offered after the poller gives up. */
    resume: function () {
      halted = false;
      failures = 0;
      schedule(0);
    },

    lastSuccess: function () {
      return lastOk;
    },
  };
}
