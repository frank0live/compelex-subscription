/* The Rebecca adapter.
 *
 * The third and last panel. Rebecca is the closest of the two new panels to
 * 3X-UI in spirit — its `expire` is already epoch seconds and its
 * `subscription-userinfo` header is the same shape as PasarGuard's — but it
 * differs in two ways that are easy to get silently wrong, and both are handled
 * explicitly below.
 *
 * THE ZONELESS TIMESTAMP
 *
 * Rebecca sends `online_at` as `"2026-07-01 10:20:30"`: space-separated, and
 * with NO timezone. `Date.parse` on that form reads it as LOCAL time. The panel
 * is UTC-based throughout (`time.Now().UTC()` in its own template context), so
 * reading it as local would shift the instant by the reader's offset — 3.5
 * hours at GMT+3:30 — and the result would still be a finite positive number,
 * passing every structural check.
 *
 * The rule (REBECCA-ADAPTER-DECISIONS.md §1): a value that already carries a
 * zone parses as-is; a zoneless value is UTC, and gets BOTH a `T` and a `Z`.
 *
 * THE STATUS TABLE
 *
 * Rebecca has five statuses. Only `disabled` means off — `limited` and
 * `expired` stay ENABLED, because Row's `health()` derives those two labels
 * from `expire` / `used` / `total` and needs the facts intact. `on_hold` is
 * refused, not guessed, and so is anything outside the table.
 */

import { assertModel, MODEL_FIELDS } from '../contract.mjs';

export const id = 'rebecca';
export const emitter = 'pongo2';

/* The frozen status table. `enabled` is the ONLY thing the adapter reads from
   the status; everything else is derived downstream. */
const STATUS_ENABLED = {
  active: true,
  limited: true,
  expired: true,
  disabled: false,
};

/* A subscription is "online" when the panel reported a last-seen timestamp
   inside this window. Neither new panel publishes a threshold, so this is an
   adapter decision, not a panel fact — the same 120 s PasarGuard uses. */
const ONLINE_WINDOW_MS = 120 * 1000;

/* Rebecca's `encode_title` equivalent: the header value is `base64:<b64>`. The
   prefix is a client-side convention and nothing in the panel strips it. A
   value WITHOUT the prefix is plain text, not base64. */
function decodeHeader(value) {
  if (typeof value !== 'string' || value === '') return '';
  if (!value.startsWith('base64:')) return value;
  try {
    return Buffer.from(value.slice('base64:'.length), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/* Rebecca's `online_at` -> epoch milliseconds.
 *
 * A zoneless value is UTC. Both the space->`T` normalisation and the `Z` are
 * required: the space alone is not valid ISO, and the `Z` alone does not
 * survive the space form on every engine. Doing both makes the intent explicit
 * and the result engine-independent. */
export function onlineAtToMillis(value) {
  if (typeof value !== 'string' || value === '') return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const ms = Date.parse(zoned ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function asCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asText(value) {
  return typeof value === 'string' ? value : '';
}

/* Rebecca native payload -> Row's normalized model.
 *
 * `native` is { info, headers }, optionally with `now` in milliseconds so a
 * caller can pin the clock — which is what the fixtures do, since the online
 * window is relative. Without `now` the wall clock is used, which is the
 * production path. */
export function island(native) {
  if (native === null || typeof native !== 'object' || Array.isArray(native)) {
    throw new Error('rebecca: native payload must be an object');
  }
  const info = native.info;
  const headers = native.headers || {};
  if (info === null || typeof info !== 'object' || Array.isArray(info)) {
    throw new Error('rebecca: native.info must be an object');
  }

  const status = info.status;

  /* The deliberate refusal. Not expired, not disabled, not active — refused. */
  if (status === 'on_hold') {
    throw new Error('unsupported on_hold state');
  }
  /* Anything outside the table is refused too. An `else` branch here would
     silently absorb a sixth state a future version might add. */
  if (!Object.prototype.hasOwnProperty.call(STATUS_ENABLED, status)) {
    throw new Error(`rebecca: unknown status ${JSON.stringify(status)}`);
  }

  const now = Number.isFinite(native.now) ? native.now : Date.now();

  /* Traffic. The combined counter, exactly as the panel reports it. */
  const download = asCount(info.used_traffic) ?? 0;
  const upload = 0;
  const used = download + upload;

  /* Total. `null` and `<= 0` both mean unlimited, which Row encodes as 0. */
  const rawLimit = asCount(info.data_limit);
  const total = rawLimit === null || rawLimit <= 0 ? 0 : rawLimit;

  /* Expiry. Rebecca's `expire` is ALREADY epoch seconds — no conversion. A
     null or non-positive value means never, which Row encodes as 0. */
  const rawExpire = asCount(info.expire);
  const expire = rawExpire === null || rawExpire <= 0 ? 0 : rawExpire;

  /* Online. Only ever true on a reported timestamp inside the window — AND
     only while the subscription is enabled. A disabled account whose last
     timestamp happens to be recent is not "online": the frozen status table
     (REBECCA-ADAPTER-DECISIONS.md §2) gives `disabled` online:false, and a
     model that said otherwise would carry a claim the panel does not make. */
  const enabled = STATUS_ENABLED[status];
  const lastOnline = onlineAtToMillis(info.online_at);
  const withinWindow = lastOnline !== null && (now - lastOnline) <= ONLINE_WINDOW_MS && now >= lastOnline;
  const online = enabled && withinWindow;

  /* The subscription URL. Rebecca exposes `subscription_url` directly, and the
     header carries the request URL as a fallback. */
  const subUrl = asText(info.subscription_url) || asText(headers['profile-web-page-url']);

  const model = {
    enabled,
    online,
    download,
    upload,
    used,
    total,
    expire,
    lastOnline,
    subUrl,
    /* Rebecca has no JSON-subscription equivalent; the button is omitted. */
    subJsonUrl: '',
    subClashUrl: subUrl ? `${subUrl}/clash-meta` : '',
    title: decodeHeader(headers['profile-title']),
    supportUrl: asText(headers['support-url']),
    /* Rebecca has NO announce concept anywhere in its source — not in settings,
       not in headers, not in the render context. A clean omission. */
    announce: '',
    /* The panel computes both calendars and its template has its own toggle;
       Row's `jalali` is a client-side setting this adapter must not drive. */
    jalali: false,
    /* The /info payload carries no share links. */
    links: [],
  };

  const known = new Set(MODEL_FIELDS.map((f) => f.key));
  for (const key of Object.keys(model)) {
    if (!known.has(key)) throw new Error(`rebecca: model gained an unknown field ${key}`);
  }

  return assertModel(model);
}

/* The info endpoint. Rebecca serves it on a PATH SUFFIX, not a query parameter
   — `/{token}/info` — the same shape as PasarGuard and unlike 3X-UI's
   `?format=info`. This adapter only reports the path; it does not wire it up. */
export function livePath(pathname) {
  const base = String(pathname === null || pathname === undefined ? '' : pathname);
  return base.replace(/\/+$/, '') + '/info';
}

export const adapter = {
  id,
  emitter,
  island,
  livePath,
};
