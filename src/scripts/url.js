/* URL handling for the two places where a value chosen by the administrator can
   become clickable: the support link and any address inside the announcement.
   Both fail closed — an address we cannot classify is not linked at all. */

export const SUPPORT_SCHEMES = ['https:', 'http:', 'tg:', 'mailto:'];
export const LINK_SCHEMES = ['https:', 'http:'];

const CANDIDATE = /https?:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?)\]]+$/;

export function parse(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    return new URL(raw.trim());
  } catch (err) {
    return null;
  }
}

/* javascript:, data:, vbscript: and anything else unrecognised return null, so
   the caller drops the whole component instead of rendering a link that should
   never have been clickable. */
export function safe(raw, schemes) {
  const url = parse(raw);
  if (!url) return null;
  return schemes.indexOf(url.protocol) > -1 ? url.href : null;
}

/* The operator's logo. Installers embed it as a data URI, and a hosted address
   is accepted too, but nothing else: a bare "data:" would otherwise be a way to
   put arbitrary content into the page through a configuration file. An SVG
   cannot script inside <img>, so it stays on the list. */
const IMAGE_DATA = /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

export function imageSrc(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '') return null;
  if (IMAGE_DATA.test(value)) return value;
  return safe(value, LINK_SCHEMES);
}

/* Splits announcement text into plain runs and link runs. Only complete,
   parseable http(s) addresses become links; everything else stays text. */
export function runs(value) {
  const out = [];
  let last = 0;
  let match;

  CANDIDATE.lastIndex = 0;
  while ((match = CANDIDATE.exec(value)) !== null) {
    const candidate = match[0].replace(TRAILING, '');
    const href = safe(candidate, LINK_SCHEMES);
    if (!href) continue;
    if (match.index > last) out.push({ text: value.slice(last, match.index) });
    out.push({ text: candidate, href: href });
    last = match.index + candidate.length;
  }
  if (last < value.length) out.push({ text: value.slice(last) });
  return out;
}
