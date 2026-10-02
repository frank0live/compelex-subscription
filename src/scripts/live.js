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
 * every payload carries `expire`, in a different type — epoch seconds,
 * an ISO datetime, an int64. A foreign payload therefore
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

/* 3X-UI serves the figures in the page's own vocabulary, at ?format=info.
   The panel is named by the shell the page was built for, never guessed from
   a response; this build only ever builds 3X-UI shells. */
export function infoUrl(panel, pathname) {
  const path = String(pathname || '');
  return path + '?format=info';
}

/* The statuses the poller understands. Anything else is a payload this page
   does not understand, and the poller stops rather than guess. */
const STATUSES = ['active', 'disabled', 'limited', 'expired', 'on_hold'];
const ONLINE_WINDOW = 120000;
/* An on-hold subscription whose duration the panel does not give: outside the
   plausible range, which the page reads as "unknown" -- the same value the
   shells render for it. */
const HOLD_UNKNOWN = 9999999999;

/* A datetime string in epoch milliseconds. A zoneless value is read as UTC,
   so the reader's local offset can never shift a timestamp. */
function instant(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value * 1000 : null;
  if (typeof value !== 'string' || value === '') return null;
  const zoned = /(?:Z|[+-]\d\d:?\d\d)$/.test(value) ? value : value.replace(' ', 'T') + 'Z';
  const ms = Date.parse(zoned);
  return Number.isFinite(ms) ? ms : null;
}

/* A panel's /info payload -> the page's own field names, or null when it is
   not the payload this page expects. Only the figures that change are read;
   the name, the support link and the addresses stay as the page was rendered. */
export function fromPanel(panel, data, now) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const u = data.user !== null && typeof data.user === 'object' && !Array.isArray(data.user) ? data.user : data;
  if (STATUSES.indexOf(u.status) < 0) return null;
  const used = Number(u.used_traffic);
  if (!Number.isFinite(used) || used < 0) return null;

  const enabled = u.status !== 'disabled';
  const limit = Number(u.data_limit);
  let expire = 0;
  if (u.status === 'on_hold') {
    // 3X-UI reports no on-hold duration: read it as unknown, the same value
    // the shells render for it.
    expire = HOLD_UNKNOWN;
  } else if (u.expire !== null && u.expire !== undefined && u.expire !== '' && u.expire !== 0) {
    const at = instant(u.expire);
    if (at === null) return null;
    expire = at > 0 ? Math.floor(at / 1000) : 0;
  }
  const seen = instant(u.online_at);
  const age = seen === null ? -1 : now - seen;

  return {
    enabled: enabled ? '1' : '0',
    isOnline: enabled && age >= 0 && age <= ONLINE_WINDOW ? '1' : '0',
    downloadByte: Math.trunc(used),
    uploadByte: 0,
    totalByte: limit > 0 ? Math.trunc(limit) : 0,
    expire: expire,
    lastOnline: seen === null ? '' : seen,
  };
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
    return win.fetch(infoUrl(ctx.panel, win.location.pathname), init);
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
        const info = ctx.panel ? fromPanel(ctx.panel, data, Date.now()) : data;
        if (!looksLikeInfo(info)) throw failure(true);
        failures = 0;
        lastOk = Date.now();
        ctx.onData(info, lastOk);
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
