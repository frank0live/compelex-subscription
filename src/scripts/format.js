/* Presentation helpers. Everything here is pure and takes its number and date
   formatting from an injected fmt object, so the same functions serve the page
   and the tests without pulling Intl decisions into the call sites. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/* The figure and its unit are one unbreakable run: splitting "38.4 GB" across
   a line, or reordering it in an RTL paragraph, both misread as a different
   number. */
export const NBSP = '\u00A0';

function digitsFor(step, value) {
  if (step <= 1) return 0; /* bytes and kilobytes are never fractional */
  if (value < 10) return 2;
  return value < 100 ? 1 : 0;
}

/* Base 1024 with the same ladder the panel uses, so a reader comparing the two
   pages sees the same magnitude. */
export function scaleBytes(n) {
  if (!Number.isFinite(n) || n < 0) return null;

  let step = 0;
  let value = n;
  while (value >= 1024 && step < UNITS.length - 1) {
    value /= 1024;
    step += 1;
  }

  let digits = digitsFor(step, value);
  /* 1048575 bytes rounds to 1024 KB at this precision, which is not a number
     anyone writes. Promote it instead. */
  if (Number(value.toFixed(digits)) >= 1024 && step < UNITS.length - 1) {
    value /= 1024;
    step += 1;
    digits = digitsFor(step, value);
  }

  return { value: value, digits: digits, unit: UNITS[step] };
}

export function bytesText(n, fmt) {
  const scaled = scaleBytes(n);
  return scaled === null ? null : fmt.number(scaled.value, scaled.digits) + NBSP + scaled.unit;
}

/* The per-cent sign stays ASCII in every language: the figure sits in an
   isolated left-to-right run beside a Latin unit ladder, and a localised sign
   would be reordered around the "<" and ">" prefixes. */
export function percentText(pct, fmt) {
  if (!Number.isFinite(pct) || pct < 0) return null;
  if (pct === 0) return fmt.number(0, 0) + '%';
  if (pct < 1) return '<' + fmt.number(1, 0) + '%';
  if (pct > 99 && pct < 100) return '>' + fmt.number(99, 0) + '%';
  return fmt.number(Math.round(pct), 0) + '%';
}

/* How much of the bar may be drawn, kept apart from the percentage the reader
   is shown: usage over the limit is reported truthfully but never overflows. */
export function barWidth(pct) {
  return Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0;
}

export function barLevel(pct) {
  if (!Number.isFinite(pct)) return 'ok';
  if (pct >= 100) return 'over';
  return pct >= 90 ? 'warn' : 'ok';
}

/* Coarse "n units ago" parts. The values are negative because that is what
   Intl.RelativeTimeFormat expects for the past; a timestamp in the future is
   clamped by the caller, which owns the clock. Seconds are offered only to the
   footer, where the reader is watching a value tick. */
export function relativeParts(deltaMs, allowSeconds) {
  const s = Math.round(Math.max(0, deltaMs) / 1000);
  if (allowSeconds && s < 60) return { value: -s, unit: 'second' };
  if (s < 45) return null;
  if (s < 90) return { value: -1, unit: 'minute' };

  const min = Math.round(s / 60);
  if (min < 60) return { value: -min, unit: 'minute' };

  const hours = Math.round(min / 60);
  if (hours < 24) return { value: -hours, unit: 'hour' };

  const days = Math.round(hours / 24);
  if (days < 30) return { value: -days, unit: 'day' };

  const months = Math.round(days / 30);
  if (months < 12) return { value: -months, unit: 'month' };
  return { value: -Math.round(months / 12), unit: 'year' };
}
