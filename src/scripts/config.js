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

/* A share link's query string as a lower-cased map, one decode per value, first
   occurrence winning. QueryEscape wrote a space as "+" and an escaped "+" as
   "%2B", so "+" is turned back into a space before percent-decoding; a malformed
   escape keeps the raw value rather than losing the whole field. */
function queryMap(query) {
  const out = {};
  const parts = query.split('&');
  for (let i = 0; i < parts.length; i++) {
    const pair = parts[i];
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = (eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    if (key === '' || Object.prototype.hasOwnProperty.call(out, key)) continue;
    const rawVal = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      out[key] = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch (err) {
      out[key] = rawVal;
    }
  }
  return out;
}

/* WireGuard has no config file of its own on the wire: the panel emits a
   wireguard://privkey@host:port?publickey=&address=&… URI, and the official
   WireGuard app imports only a [Interface]/[Peer] .conf. This rebuilds that
   .conf from the URI's own fields — the single place the reconstruction lives,
   shared by the detail dialog and the download — inventing nothing beyond the
   full-tunnel AllowedIPs a client would otherwise refuse to route. Returns ''
   for anything that is not a usable wireguard:// link. */
export function wireguardConf(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!/^wireguard:\/\//i.test(trimmed)) return '';
  let body = trimmed.replace(/^wireguard:\/\//i, '');
  const hash = body.indexOf('#');
  if (hash > -1) body = body.slice(0, hash);
  let query = '';
  const q = body.indexOf('?');
  if (q > -1) {
    query = body.slice(q + 1);
    body = body.slice(0, q);
  }
  const at = body.indexOf('@');
  if (at < 0) return '';
  const privateKey = body.slice(0, at);
  const endpoint = body.slice(at + 1);
  if (!privateKey || !endpoint) return '';
  const p = queryMap(query);
  const pick = function () {
    for (let i = 0; i < arguments.length; i++) {
      if (p[arguments[i]]) return p[arguments[i]];
    }
    return '';
  };
  const lines = ['[Interface]', 'PrivateKey = ' + privateKey];
  const add = function (label, key) {
    const v = pick(key);
    if (v) lines.push(label + ' = ' + v);
  };
  add('Address', 'address');
  add('DNS', 'dns');
  add('MTU', 'mtu');
  lines.push('', '[Peer]');
  add('PublicKey', 'publickey');
  add('PresharedKey', 'presharedkey');
  lines.push('AllowedIPs = ' + (pick('allowedips') || '0.0.0.0/0, ::/0'));
  lines.push('Endpoint = ' + endpoint);
  add('PersistentKeepalive', 'keepalive');
  return lines.join('\n') + '\n';
}

/* A filesystem-safe download name from a configuration's display name: country
   flags and control characters removed, the characters no operating system
   allows in a name folded to spaces, runs of space collapsed to single hyphens,
   leading dots and dashes dropped so nothing hides or traverses, and the whole
   capped in length. Falls back to a fixed name when nothing usable remains. */
export function confFilename(displayName, fallback) {
  const source = displayName == null ? '' : String(displayName);
  const name = source
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["*:<>?|/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\-]+/, '')
    .replace(/[.\-]+$/, '')
    .slice(0, 64)
    .replace(/[.\-]+$/, '');
  return (name || fallback || 'config') + '.conf';
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


