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

/* Flags this renderer can draw as a CSS gradient, keyed by alpha-2 code.
   Membership here is deliberately much narrower than CODES, and the two sets
   answer different questions. CODES decides whether a pair is a real country
   at all — it is the gate between an emoji and a monogram. FLAGS decides
   whether that country can be drawn faithfully without an image, and a code
   absent from it is not a failure: the badge keeps the emoji the platform
   already renders, which is the unchanged path.

   A country is listed only when the gradient IS the flag rather than a
   likeness of it, so no emblem is ever faked. The flags that are absent are
   absent for a reason, not by omission: the Union Jack's counterchanged
   saltire, Canada's maple leaf, Hong Kong's bauhinia, Korea's taegeuk, the
   five-star groups of China and Singapore, the crescents of Singapore and
   Turkey and Iran's central emblem are all identities that no gradient
   primitive draws, and at a badge 16 px tall they are sub-pixel besides.
   Drawing bands-only versions of them would ship a different flag.

   Two approximations are accepted deliberately and were approved as such: SE
   carries a 15% cross rather than the true 18.75% / 20%, and US carries the
   canton and the thirteen stripes but omits the fifty stars.

   The entries below are deliberately unindented and unspaced. This is the one
   place in the sources where formatting is load-bearing: the artifact carries
   every one of these bytes, the size ceiling is fixed, and the wider layout
   costs 18 bytes that the tightest template does not have. Re-indenting them is
   not a tidy-up. Comments are stripped at build time, so this note is free. */
const FLAGS = {
DE:'linear-gradient(#000 33.3%,#d00 33.3% 66.6%,#fc0 66.6%)',
FR:'linear-gradient(90deg,#039 33.3%,#fff 33.3% 66.6%,#e33 66.6%)',
NL:'linear-gradient(#a11 33.3%,#fff 33.3% 66.6%,#249 66.6%)',
JP:'radial-gradient(circle closest-side,#b02 0 60%,#fff 60%)',
SE:'linear-gradient(90deg,#0000 30%,#fc0 30% 45%,#0000 45%),linear-gradient(#0000 40%,#fc0 40% 55%,#0000 55%),#06a',
US:'linear-gradient(#3c3b6e,#3c3b6e) 0 0/40% 54% no-repeat,repeating-linear-gradient(#b22 0 7.7%,#fff 7.7% 15.4%)',
};

/* Paints a covered flag onto its badge, or leaves the badge exactly as it is.
   The text node is never touched: it is what gives the badge its size, so
   hiding it with colour keeps the geometry identical to the emoji it stands in
   for — clearing textContent would collapse the badge to nothing, and
   replacing the node would lose the emoji a reader may still be relying on.

   Forced colours wins, and so does a host that cannot be asked. The system
   only overrides colours when the user has asked it to, so the emoji stays
   visible rather than becoming an empty box on a gradient. globalThis rather
   than window, so a host without matchMedia falls through to the emoji path
   instead of throwing. */
export function paintFlag(badge, flag) {
  if (!badge || !flag || typeof globalThis.matchMedia !== 'function') return;
  if (globalThis.matchMedia('(forced-colors: active)').matches) return;
  const g = FLAGS[letter(flag.codePointAt(0)) + letter(flag.codePointAt(2))];
  if (!g) return;
  badge.style.background = g;
  badge.style.color = 'transparent';
}

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

