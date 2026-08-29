/* The brand mark. When no logo file is configured the page draws a monogram
   instead, and it has to be right in every script we ship: two initials for
   Latin, Cyrillic, Arabic and Persian names, two ideographs for Chinese, and
   never a mojibake fragment of a multi-code-point character. */

/* Word separators. Note what is absent: the zero-width non-joiner and joiner,
   which are letter-internal in Persian and Arabic and must not split a name. */
const SEPARATOR = /[\s_|/+\-\u2010-\u2015\u00B7\u2022\u30FB\uFF65]+/;

/* A meaningful token has a letter in it. A segment that is only digits or
   punctuation \u2014 the "100" in "Premium 100 GB" \u2014 is not an initial a reader
   would recognise, so it is dropped before the first two words are taken. */
const LETTER = /\p{L}/u;
const CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;
const EXTEND = /^[\p{M}\u200C\u200D\uFE0F]$/u;
const ZWJ = '\u200D';

/* Deterministic grapheme splitting for engines without Intl.Segmenter. It keeps
   combining marks, variation selectors and joiner sequences attached to their
   base character, which is all the monogram needs. */
function clusters(value) {
  const points = Array.from(value);
  const out = [];

  for (let i = 0; i < points.length; i++) {
    let cluster = points[i];
    while (i + 1 < points.length && EXTEND.test(points[i + 1])) {
      cluster += points[i + 1];
      i += 1;
    }
    while (i + 2 < points.length && points[i + 1] === ZWJ) {
      cluster += points[i + 1] + points[i + 2];
      i += 2;
      while (i + 1 < points.length && EXTEND.test(points[i + 1])) {
        cluster += points[i + 1];
        i += 1;
      }
    }
    out.push(cluster);
  }
  return out;
}

export function graphemes(value) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const parts = [];
      const iter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value);
      for (const part of iter) parts.push(part.segment);
      return parts;
    } catch (err) {
      /* Fall through to the local implementation. */
    }
  }
  return clusters(value);
}

function firstGrapheme(value) {
  const list = graphemes(value);
  return list.length > 0 ? list[0] : '';
}

/* Uppercasing does nothing in Arabic, Persian and Chinese, and the few letters
   that expand — the German sharp s among them — would produce a two-character
   initial, so those are left as written. */
function upperFirst(grapheme) {
  const upper = grapheme.toUpperCase();
  return upper.length > grapheme.length ? grapheme : upper;
}

export function nameTokens(name) {
  const value = String(name === null || name === undefined ? '' : name).normalize('NFC').trim();
  if (value === '') return [];
  return value.split(SEPARATOR).filter((token) => token !== '' && LETTER.test(token));
}

/* Two meaningful initials at most, and no hyphen in scripts that do not write
   one. Compound Latin words are not split: BlueNet is B, not B-N. */
export function monogram(name, title, word) {
  const parts = nameTokens(name);

  if (parts.length > 0) {
    const joined = parts.join('');
    if (CJK.test(joined)) return graphemes(joined).slice(0, 2).join('');

    const initial = upperFirst(firstGrapheme(parts[0]));
    if (parts.length === 1) return initial;
    return initial + '-' + upperFirst(firstGrapheme(parts[1]));
  }

  /* Nothing alphanumeric survived, so a symbol-only name is shown as it is. */
  const raw = String(name === null || name === undefined ? '' : name).normalize('NFC').trim();
  if (raw !== '') return firstGrapheme(raw);

  const fromTitle = nameTokens(title);
  if (fromTitle.length > 0) return upperFirst(firstGrapheme(fromTitle[0]));

  return upperFirst(firstGrapheme(String(word || '')));
}

/* The configured service name wins, then the plan title the panel supplies,
   then the localised word for a subscription. */
export function displayName(branding, model, word) {
  const configured = branding && branding.serviceName ? String(branding.serviceName).trim() : '';
  if (configured !== '') return configured;
  return model.title !== '' ? model.title : word;
}
