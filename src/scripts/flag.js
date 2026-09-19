/* Country-flag detection for a configuration's display name.
 *
 * A flag badge is drawn only for a real country: a pair of Unicode regional
 * indicator symbols whose two letters form an assigned ISO 3166-1 alpha-2 code.
 * Everything else is refused and gets no badge — a lone indicator, an
 * unassigned pair, a plain emoji such as the fire sign, the white flag or the
 * black flag — because an invented flag or an empty circle is worse than none.
 * The detection is local Unicode arithmetic; nothing is ever inferred from a
 * host name or an address. */

/* Regional indicator symbols occupy one contiguous block; "A" is the first. */
const RI_FIRST = 0x1f1e6;
const RI_LAST = 0x1f1ff;

/* ISO 3166-1 alpha-2 (assigned), plus the exceptionally reserved codes that
   have a widely rendered flag emoji (EU, UN, UK and the CP/DG/EA/IC/AC/TA
   dependencies). A regional-indicator pair outside this set is a flag no reader
   would recognise, so it is treated as no flag at all.

   Held as a bitmap over the 26x26 letter grid rather than a list, because the
   list cost 907 bytes of every artifact and this costs a fraction of that. Bit
   (a*26 + b) is set when that pair is assigned, and the grid is 676 bits: 84.5
   bytes, so the array is 85. Reading it as 676/8 would truncate to 84 and
   silently drop ZW.

   The readable list this was generated from is not lost — it lives in
   tests/flag.test.mjs, which decodes this bitmap and compares the two, so the
   mapping stays reviewable and a wrong bit fails a test rather than a reader. */
const BITS = atob('fFnf7u+93d4vP5QVgNUAHgBcCbCf+xUAjQYceA9AQAMAHSv0QYFP/fz/1yVLCAABQDyPUwEAAEAAUfH953q7n5pBNARXhUAAAkAAAAAAEAAIBEAAAQ==');
const CODES = { has(code) { const i = (code.charCodeAt(0) - 65) * 26 + code.charCodeAt(1) - 65; return (BITS.charCodeAt(i >> 3) >> (i & 7) & 1) > 0; } };

function isIndicator(cp) {
  return cp >= RI_FIRST && cp <= RI_LAST;
}

function letter(cp) {
  return String.fromCharCode(65 + (cp - RI_FIRST));
}

/* The first country flag in a string, as its two indicator characters, or ''.
   Indicators pair left to right in twos the way a renderer draws them, so an
   unassigned pair is consumed as a unit rather than realigning the scan onto a
   spurious code — "🇿🇿🇺🇸" reads past the tofu pair and finds US, it does not
   read the middle two as ZU. A lone trailing indicator matches nothing. */
export function flagOf(text) {
  const points = Array.from(String(text === null || text === undefined ? '' : text), (ch) => ch.codePointAt(0));
  let i = 0;
  while (i < points.length) {
    if (isIndicator(points[i]) && i + 1 < points.length && isIndicator(points[i + 1])) {
      const code = letter(points[i]) + letter(points[i + 1]);
      if (CODES.has(code)) return String.fromCodePoint(points[i], points[i + 1]);
      i += 2;
      continue;
    }
    i += 1;
  }
  return '';
}

/* The same name with every regional indicator removed, so the flag is shown
   once as a badge and not a second time inside the label. Indicators only ever
   mean flags, so all of them go, valid or not; the whitespace and separators
   left behind at the ends are then tidied away. */
export function cleanName(text) {
  let out = '';
  for (const ch of String(text === null || text === undefined ? '' : text)) {
    if (!isIndicator(ch.codePointAt(0))) out += ch;
  }
  return out.replace(/\s+/g, ' ').replace(/^[\s|/_+\-]+/, '').replace(/[\s|/_+\-]+$/, '').trim();
}

