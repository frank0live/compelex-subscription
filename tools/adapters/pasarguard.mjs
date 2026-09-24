/* The PasarGuard adapter.
 *
 * PasarGuard is the first NON-reference panel, so this is the first adapter that
 * actually translates. 3X-UI's island already arrives in the normalized shape;
 * PasarGuard's does not, and everything below exists to make that translation
 * faithful and to refuse it where it cannot be.
 *
 * THE ONE DECISION THAT MAKES THE TRAFFIC MAPPING HONEST
 *
 * PasarGuard tracks a single combined counter. Its own `subscription-userinfo`
 * header says so (app/operation/subscription.py:181):
 *
 *     user_info = {"upload": 0, "download": user.used_traffic, ...}
 *
 * So the panel itself reports upload=0 and puts the combined counter in
 * download. Row computes `used = download + upload`, which with those values is
 * `used_traffic` exactly. **No split is ever invented**, and Row's UI shows only
 * the combined figure, so nothing is fabricated and nothing is lost. A test
 * asserts the header and `used_traffic` agree, so a future version that starts
 * reporting a real split fails loudly instead of silently changing the UI.
 *
 * THE ONE DECISION THAT IS DELIBERATELY ABSENT
 *
 * `on_hold` is a real third state with its own countdown. Row's `expire`
 * encoding (0 = never, negative = duration) has no slot for it, so this adapter
 * THROWS rather than guessing. Mapping it to expired, disabled, active or
 * "never" would each be a different lie. The state is recorded in
 * tests/fixtures/panels/pasarguard/08-on-hold.json with a null expectation, so
 * the gap is visible until a product decision closes it.
 *
 * WHAT IS NOT READ
 *
 * The subscriber's address. PasarGuard puts `ip` in the /info payload; the page
 * has no use for it, the contract has no field for it, and it is dropped here
 * rather than carried into the document. A test asserts it never arrives.
 */

import { assertModel, MODEL_FIELDS } from '../contract.mjs';

export const id = 'pasarguard';
export const emitter = 'jinja2';

/* A subscription is "online" when the panel reported a last-seen timestamp
   inside this window. PasarGuard does not publish its own threshold; 120 s is
   the value recorded in PANEL-COMPATIBILITY-AUDIT.md §5 and is the only place
   the number appears. */
const ONLINE_WINDOW_MS = 120 * 1000;

const STATUSES = ['active', 'disabled', 'on_hold'];

/* PasarGuard's encode_title() emits `base64:<b64>` — the prefix is a
   client-side convention (subscription clients look for it) and nothing in the
   panel strips it. A value without the prefix is plain text, not base64: only
   the prefixed form is ever encoded. */
function decodeHeader(value) {
  if (typeof value !== 'string' || value === '') return '';
  if (!value.startsWith('base64:')) return value;
  const body = value.slice('base64:'.length);
  try {
    return Buffer.from(body, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function asCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asText(value) {
  return typeof value === 'string' ? value : '';
}

/* PasarGuard sends datetimes as ISO strings. Row wants epoch SECONDS for
   `expire` and epoch MILLISECONDS for `lastOnline` — different units for the
   same kind of value, which is the single likeliest silent bug in this file.
   Both conversions are named so neither can be used by accident. */
function secondsFromIso(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function millisFromIso(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/* PasarGuard native payload -> Row's normalized model.
 *
 * `native` is { info, headers }, optionally with `now` in milliseconds so a
 * caller can pin the clock — which is exactly what the fixtures do, since the
 * online window is relative. Without `now` the wall clock is used, which is the
 * production path. */
export function island(native) {
  if (native === null || typeof native !== 'object' || Array.isArray(native)) {
    throw new Error('pasarguard: native payload must be an object');
  }
  const info = native.info;
  const headers = native.headers || {};
  if (info === null || typeof info !== 'object' || Array.isArray(info)) {
    throw new Error('pasarguard: native.info must be an object');
  }

  const status = info.status;
  if (!STATUSES.includes(status)) {
    throw new Error(`pasarguard: unknown status ${JSON.stringify(status)}`);
  }

  /* The deliberate refusal. Not expired, not disabled, not active — refused. */
  if (status === 'on_hold') {
    throw new Error('unsupported on_hold state');
  }

  const now = Number.isFinite(native.now) ? native.now : Date.now();

  /* Traffic. The combined counter, exactly as the panel reports it. */
  const download = asCount(info.used_traffic) ?? 0;
  const upload = 0;
  const used = download + upload;

  /* Total. `null` and `0` both mean unlimited, and Row encodes that as 0. */
  const rawLimit = asCount(info.data_limit);
  const total = rawLimit === null || rawLimit === 0 ? 0 : rawLimit;

  /* Expiry. `null` means never, which Row encodes as 0. */
  const expire = info.expire === null || info.expire === undefined
    ? 0
    : (secondsFromIso(info.expire) ?? 0);

  /* Online. Only ever true on a reported timestamp inside the window. */
  const onlineAt = info.online_at;
  const lastOnline = (onlineAt === null || onlineAt === undefined)
    ? null
    : millisFromIso(onlineAt);
  const online = lastOnline !== null && (now - lastOnline) <= ONLINE_WINDOW_MS && now >= lastOnline;

  /* The subscription URL. `subscription_url` is exclude=True on the /info
     response model, so the header is the reliable source. */
  const subUrl = asText(headers['profile-web-page-url']) || asText(info.subscription_url);

  const model = {
    enabled: status !== 'disabled',
    online,
    download,
    upload,
    used,
    total,
    expire,
    lastOnline,
    subUrl,
    /* PasarGuard has no JSON-subscription equivalent; the button is omitted. */
    subJsonUrl: '',
    subClashUrl: subUrl ? `${subUrl}/clash-meta` : '',
    title: decodeHeader(headers['profile-title']),
    supportUrl: asText(headers['support-url']),
    announce: decodeHeader(headers['announce']),
    /* The panel computes both calendars and its template has its own toggle;
       Row's `jalali` is a client-side setting this adapter must not drive. */
    jalali: false,
    /* The /info payload carries no share links — those come from the config
       generator, which this adapter does not call. */
    links: [],
  };

  /* Anything the panel sent that the contract has no field for is dropped, not
     carried. `ip` is the one that matters, and the model simply has no slot. */
  const known = new Set(MODEL_FIELDS.map((f) => f.key));
  for (const key of Object.keys(model)) {
    if (!known.has(key)) throw new Error(`pasarguard: model gained an unknown field ${key}`);
  }

  return assertModel(model);
}

/* The info endpoint. PasarGuard serves it on a PATH SUFFIX, not a query
   parameter — `/{token}/info`. This is the one place where the runtime is not
   panel-agnostic, and it is why live polling needs a separately-approved
   runtime change. This adapter only reports the path; it does not wire it up. */
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
