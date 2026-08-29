/* The single normalisation point. Both sources of truth — the server-rendered
   data-* attributes and the ?format=info payload — are read into the same raw
   shape (the panel's own field names) and then normalised once, so the rest of
   the application never sees a string where it expects a number. */

/* Outside this range the value is not a plausible subscription date, so it is
   reported as unavailable rather than rendered as 1970 or the year 5138. */
const EXPIRE_MIN = -3.2e9;
const EXPIRE_MAX = 4.1e9;

function truthy(value) {
  return value === true || value === 1 || value === '1';
}

function integer(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/* A negative byte counter is not zero, it is a counter we cannot trust. */
function counter(value) {
  const n = integer(value);
  return n === null || n < 0 ? null : n;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

/* The subscriber's own address is deliberately not read. The panel offers it in
   both sources, the page has no use for it, and keeping it out of the model
   keeps it out of the document and out of memory. */
export function readDocument(doc) {
  const el = doc.getElementById('sub-data');
  const d = el ? el.dataset : {};
  const note = doc.getElementById('announce-source');

  return {
    enabled: d.enabled,
    isOnline: d.online,
    downloadByte: d.downloadByte,
    uploadByte: d.uploadByte,
    totalByte: d.totalByte,
    expire: d.expire,
    lastOnline: d.lastOnline,
    subUrl: d.subUrl,
    subJsonUrl: d.subJsonUrl,
    subClashUrl: d.subClashUrl,
    subTitle: d.subTitle,
    subSupportUrl: d.supportUrl,
    announce: note ? note.textContent : '',
    datepicker: d.datepicker,
  };
}

export function normalize(raw) {
  const src = raw || {};
  const download = counter(src.downloadByte);
  const upload = counter(src.uploadByte);

  let expire = integer(src.expire);
  if (expire !== null && (expire < EXPIRE_MIN || expire > EXPIRE_MAX)) expire = null;

  return {
    enabled: truthy(src.enabled),
    online: truthy(src.isOnline),
    download: download,
    upload: upload,
    used: download === null || upload === null ? null : download + upload,
    total: counter(src.totalByte),
    expire: expire,
    lastOnline: counter(src.lastOnline),
    subUrl: text(src.subUrl).trim(),
    subJsonUrl: text(src.subJsonUrl).trim(),
    subClashUrl: text(src.subClashUrl).trim(),
    title: text(src.subTitle).trim(),
    supportUrl: text(src.subSupportUrl).trim(),
    announce: text(src.announce),
    jalali: src.datepicker === 'jalali',
  };
}

/* Health, in the one order the product defines. Reachability is deliberately
   not part of it: a disabled, expired or exhausted subscription must never
   look healthy because the node happens to still report traffic. */
export function health(m, now) {
  if (!m.enabled) return 'disabled';
  if (m.expire !== null && m.expire > 0 && m.expire * 1000 <= now) return 'expired';
  if (m.total > 0 && m.used !== null && m.used >= m.total) return 'limited';
  return 'active';
}

export function isOnline(m, state) {
  return state === 'active' && m.online;
}

/* A percentage is returned only when one can honestly be computed. Anything
   else leaves pct null, and the progress bar is then left out of the document
   entirely rather than shown at an invented value. */
export function traffic(m) {
  if (m.used === null) return { kind: 'usage-unknown', pct: null };
  if (m.total === null) return { kind: 'limit-unknown', pct: null, used: m.used };
  if (m.total === 0) return { kind: 'unlimited', pct: null, used: m.used };

  return {
    kind: m.used >= m.total ? 'reached' : m.used === 0 ? 'empty' : 'inuse',
    pct: (m.used / m.total) * 100,
    used: m.used,
    total: m.total,
    remaining: Math.max(0, m.total - m.used),
  };
}

/* Whole days in the device's own timezone, so that "expires today" means the
   calendar day the reader is living in and not a 24-hour window. */
export function dayIndex(ms) {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function expiry(m, now) {
  if (m.expire === null) return { kind: 'unknown' };
  if (m.expire === 0) return { kind: 'never' };
  /* A negative value is a duration: the clock starts on the first connection. */
  if (m.expire < 0) return { kind: 'pending', days: Math.max(1, Math.round(-m.expire / 86400)) };

  const at = m.expire * 1000;
  if (at <= now) return { kind: 'expired', at: at };

  const days = dayIndex(at) - dayIndex(now);
  if (days <= 0) return { kind: 'today', at: at, days: 0 };
  if (days === 1) return { kind: 'tomorrow', at: at, days: 1 };
  return { kind: 'future', at: at, days: days };
}
