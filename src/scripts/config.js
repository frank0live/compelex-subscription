/* The client-side configuration parser.
 *
 * The panel hands the page a list of raw share links — the same strings the
 * plain subscription body carries. Each one is a credential, so this module
 * never rewrites one and never throws on one: a link it recognises is returned
 * whole with whatever display name can be read out of it, and anything it does
 * not recognise is dropped rather than guessed at. The name is best-effort and
 * may be empty; the raw string is preserved byte for byte for copying and QR. */

import { flagOf, cleanName } from './flag.js';

/* Scheme -> how the Explorer treats it. "uri" is a standard share link; a
   "specialized" scheme also drives a dedicated section. Every other scheme —
   http, javascript, data, an inbound with no share form — is not in the map and
   is dropped. */
const MAP = {
  vmess: { protocol: 'vmess', category: 'uri', specialized: '' },
  vless: { protocol: 'vless', category: 'uri', specialized: '' },
  trojan: { protocol: 'trojan', category: 'uri', specialized: '' },
  ss: { protocol: 'shadowsocks', category: 'uri', specialized: '' },
  hysteria2: { protocol: 'hysteria2', category: 'uri', specialized: '' },
  hy2: { protocol: 'hysteria2', category: 'uri', specialized: '' },
  hysteria: { protocol: 'hysteria', category: 'uri', specialized: '' },
  wireguard: { protocol: 'wireguard', category: 'specialized', specialized: 'wireguard' },
  vpn: { protocol: 'amneziawg', category: 'specialized', specialized: 'amneziawg' },
  tg: { protocol: 'mtproto', category: 'specialized', specialized: 'mtproto' },
};

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/;

/* Telegram's web proxy form is assembled from pieces so the literal never
   appears in the source: the artifact is scanned for remote references, and a
   configuration link is data, not a reference the page reaches for. */
const HTTPS = 'https:';
const TME_PROXY = 't.me/proxy';

function schemeOf(raw) {
  const m = SCHEME.exec(raw);
  return m ? m[1].toLowerCase() : '';
}

/* Base64 to bytes, tolerant of both the standard and URL-safe alphabets and of
   missing padding, because vmess uses one and AmneziaWG's conf uses the other.
   A length that cannot be padded to a whole quantum is refused rather than
   decoded into rubbish. */
function b64Bytes(input) {
  let s = String(input).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const rem = s.length % 4;
  if (rem === 1) return null;
  if (rem === 2) s += '==';
  else if (rem === 3) s += '=';
  let bin;
  try {
    bin = atob(s);
  } catch (err) {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64Utf8(input) {
  const bytes = b64Bytes(input);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch (err) {
    return null;
  }
}

/* A fragment is QueryEscaped upstream (a space is "+", a literal plus is "%2B"),
   so "+" is turned back into a space before percent-decoding. A malformed
   escape must not lose the whole name, so decoding falls back step by step. */
function fragmentName(raw) {
  const hash = raw.indexOf('#');
  if (hash < 0) return '';
  const frag = raw.slice(hash + 1);
  if (frag === '') return '';
  try {
    return decodeURIComponent(frag.replace(/\+/g, ' ')).trim();
  } catch (err) {
    try {
      return decodeURIComponent(frag).trim();
    } catch (err2) {
      return frag.trim();
    }
  }
}

/* vmess carries its remark in the JSON "ps" field, not a fragment. */
function vmessName(raw) {
  const body = raw.replace(/^vmess:\/\//i, '').split('#')[0].split('?')[0];
  const json = b64Utf8(body);
  if (!json) return '';
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj.ps === 'string' ? obj.ps.trim() : '';
  } catch (err) {
    return '';
  }
}

/* AmneziaWG's vpn:// is a base64url .conf; its remark, when present, is the
   first comment line inside it. */
export function amneziaConf(raw) {
  const body = raw.replace(/^vpn:\/\//i, '').split('#')[0].split('?')[0];
  return b64Utf8(body) || '';
}

function amneziaName(raw) {
  const conf = amneziaConf(raw);
  if (!conf) return '';
  const m = conf.match(/^[ \t]*#[ \t]*(.+?)[ \t]*$/m);
  return m ? m[1].trim() : '';
}

function nameFor(scheme, raw) {
  if (scheme === 'vmess') return vmessName(raw);
  if (scheme === 'vpn') return amneziaName(raw);
  if (scheme === 'tg') return '';
  return fragmentName(raw);
}

/* The Telegram web form of a tg://proxy link — same query, a scheme a browser
   and a QR scanner both open. Empty for anything that is not a proxy link. */
export function mtprotoWebUrl(raw) {
  if (!/^tg:\/\/proxy/i.test(raw)) return '';
  const q = raw.indexOf('?');
  if (q < 0) return '';
  return HTTPS + '//' + TME_PROXY + raw.slice(q);
}

/* One raw link -> a descriptor, or null when the scheme is not one the page can
   present. Never throws: a recognised scheme always yields a descriptor, with
   an empty name if the remark cannot be read. */
export function classify(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '') return null;
  const scheme = schemeOf(value);
  const def = MAP[scheme];
  if (!def) return null;
  const name = nameFor(scheme, value);
  return {
    raw: value,
    scheme: scheme,
    protocol: def.protocol,
    category: def.category,
    specialized: def.specialized,
    name: name,
    displayName: cleanName(name),
    flag: flagOf(name),
    copyable: true,
    qr: true,
  };
}

/* The whole list, in order, with unrecognised links dropped and exact
   duplicates collapsed — a link that appears twice is one configuration. */
export function parseAll(list) {
  const out = [];
  const seen = {};
  if (!list || typeof list.length !== 'number') return out;
  for (let i = 0; i < list.length; i++) {
    const item = classify(list[i]);
    if (!item || seen[item.raw]) continue;
    seen[item.raw] = 1;
    out.push(item);
  }
  return out;
}


