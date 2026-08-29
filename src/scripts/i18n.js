/* Catalogue lookup and every Intl decision in one place.
 *
 * Two rules shape this file. Digits are Latin in all five languages, because a
 * subscription link, a byte figure and a date are technical values a reader has
 * to be able to compare with what their client application shows. And the
 * calendar follows the panel's own datepicker setting, never the language: a
 * Persian-speaking customer on a Gregorian panel must not be shown Jalali
 * dates the operator never configured. */
import { NBSP } from './format.js';

const PLACEHOLDER = /\{(\w+)\}/g;

export function readCatalogues(doc) {
  const el = doc.getElementById('i18n-data');
  if (!el) return {};
  try {
    return JSON.parse(el.textContent);
  } catch (err) {
    return {};
  }
}

function build(make, locales, options) {
  for (let i = 0; i < locales.length; i++) {
    try {
      return make(locales[i], options);
    } catch (err) {
      /* Unsupported tag, extension or option: try the next candidate. */
    }
  }
  return null;
}

function numberFormat(locale, options) {
  return new Intl.NumberFormat(locale, options);
}

function dateTimeFormat(locale, options) {
  return new Intl.DateTimeFormat(locale, options);
}

function relativeTimeFormat(locale, options) {
  return new Intl.RelativeTimeFormat(locale, options);
}

export function createI18n(catalogues, lang, jalali) {
  const base = catalogues.en || {};
  const active = catalogues[lang] || base;

  const numeric = [lang + '-u-nu-latn', lang, 'en'];
  const cal = jalali ? 'persian' : 'gregory';
  const dated = [
    lang + '-u-ca-' + cal + '-nu-latn',
    lang + '-u-ca-' + cal,
    'en-u-ca-' + cal,
    'en',
  ];

  const dateFmt = build(dateTimeFormat, dated, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeFmt = build(dateTimeFormat, numeric, { hour: '2-digit', minute: '2-digit' });
  const relFmt = build(relativeTimeFormat, numeric, { numeric: 'always' });
  const dayFmt = build(numberFormat, numeric, { style: 'unit', unit: 'day', unitDisplay: 'long' });
  const numbers = {};

  function t(key, params) {
    let s = active[key];
    if (typeof s !== 'string') s = base[key];
    if (typeof s !== 'string') return key;
    if (!params) return s;
    return s.replace(PLACEHOLDER, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole;
    });
  }

  const fmt = {
    number: function (value, digits) {
      const key = 'd' + digits;
      if (!numbers[key]) {
        numbers[key] = build(numberFormat, numeric, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
      }
      return numbers[key] ? numbers[key].format(value) : value.toFixed(digits);
    },

    date: function (ms) {
      return dateFmt ? dateFmt.format(new Date(ms)) : '';
    },

    /* Clock time only, and no calendar extension: an hour and a minute mean the
       same thing in every calendar, and a date already precedes it on the page
       whenever both are shown. */
    time: function (ms) {
      return timeFmt ? timeFmt.format(new Date(ms)) : '';
    },

    /* Intl's own unit formatting, so the plural form is the language's rather
       than a rule duplicated across five catalogues. */
    days: function (count) {
      return dayFmt ? dayFmt.format(count) : fmt.number(count, 0) + NBSP + t('unit.day');
    },

    relative: function (value, unit) {
      return relFmt ? relFmt.format(value, unit) : null;
    },

    /* Reported by the startup check so a missing calendar or numbering system
       is visible in development instead of silently changing every date. */
    resolved: {
      calendar: dateFmt ? dateFmt.resolvedOptions().calendar : null,
      numbering: dateFmt ? dateFmt.resolvedOptions().numberingSystem : null,
      units: !!dayFmt,
    },
  };

  return { lang: lang, t: t, fmt: fmt };
}
