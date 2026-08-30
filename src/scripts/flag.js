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
   would recognise, so it is treated as no flag at all. */
const CODES = new Set((
  'AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CP CR CU CV CW CX CY CZ ' +
  'DE DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET EU ' +
  'FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
  'HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT ' +
  'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ ' +
  'LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM ' +
  'PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG UK UM UN US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' '));

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

