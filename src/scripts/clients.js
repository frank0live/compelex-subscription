/* Client applications and their import links.
 *
 * Every scheme here was read out of the application's own source or its
 * published documentation. Where a project has no verified import route, the
 * entry is copy-only: a link that silently does nothing is worse than asking
 * the reader to paste. */

export const PLATFORMS = ['android', 'ios', 'windows', 'macos'];

function enc(value) {
  return encodeURIComponent(value);
}

const REGISTRY = {
  v2rayng: {
    name: 'v2rayNG',
    source: 'sub',
    link: function (url) {
      return 'v2rayng://install-config?url=' + enc(url);
    },
  },
  happ: {
    name: 'Happ',
    source: 'sub',
    /* Appended unencoded, which is what the application's own handler expects. */
    link: function (url) {
      return 'happ://add/' + url;
    },
  },
  singbox: {
    name: 'sing-box',
    source: 'json',
    link: function (url, name) {
      return 'sing-box://import-remote-profile?url=' + enc(url) + '#' + enc(name);
    },
  },
  streisand: {
    name: 'Streisand',
    source: 'sub',
    link: function (url) {
      return 'streisand://import/' + enc(url);
    },
  },
  v2box: {
    name: 'V2Box',
    source: 'sub',
    link: function (url, name) {
      return 'v2box://install-sub?url=' + enc(url) + '&name=' + enc(name);
    },
  },
  shadowrocket: {
    name: 'Shadowrocket',
    source: 'sub',
    paid: true,
    link: function (url, name, win) {
      const inner = win.btoa(url + '&flag=shadowrocket');
      return 'shadowrocket://add/sub://' + inner + '?remark=' + enc(name);
    },
  },
  clashverge: {
    name: 'Clash Verge Rev',
    source: 'clash',
    /* Nothing may follow the url parameter: the handler consumes the rest of
       the query as part of the address. */
    link: function (url) {
      return 'clash-verge://install-config?url=' + enc(url);
    },
  },
  mihomoparty: {
    name: 'Mihomo Party',
    source: 'clash',
    link: function (url) {
      return 'mihomo://install-config?url=' + enc(url);
    },
  },
  v2rayn: {
    name: 'v2rayN',
    source: 'sub',
  },
};

const LISTS = {
  android: ['v2rayng', 'happ', 'singbox'],
  ios: ['streisand', 'v2box', 'shadowrocket'],
  windows: ['clashverge', 'mihomoparty', 'v2rayn'],
  macos: ['clashverge', 'streisand', 'v2box'],
};

/* iPadOS reports itself as a Mac, so touch points are what separate the two. */
export function detectPlatform(nav) {
  const ua = String(nav.userAgent || '');
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Mac/i.test(ua)) return (nav.maxTouchPoints || 0) > 1 ? 'ios' : 'macos';
  return 'windows';
}

/* A client is listed only when the subscription format it needs actually has an
   address. Everything else would be a button that cannot work. */
export function clientsFor(platform, urls) {
  const ids = LISTS[platform] || LISTS.windows;
  const out = [];

  for (let i = 0; i < ids.length; i++) {
    const entry = REGISTRY[ids[i]];
    if (!entry || !urls[entry.source]) continue;
    out.push({
      id: ids[i],
      name: entry.name,
      source: entry.source,
      paid: !!entry.paid,
      importable: typeof entry.link === 'function',
    });
  }
  return out;
}

export function sourceUrl(id, urls) {
  const entry = REGISTRY[id];
  return entry && urls[entry.source] ? urls[entry.source] : '';
}

/* Built at the moment of the click, never written into the document, so a link
   that cannot be constructed simply falls back to copying. */
export function deepLink(id, urls, name, win) {
  const entry = REGISTRY[id];
  if (!entry || typeof entry.link !== 'function') return null;

  const url = urls[entry.source];
  if (!url) return null;

  try {
    const built = entry.link(url, name, win);
    return typeof built === 'string' && built !== '' ? built : null;
  } catch (err) {
    return null;
  }
}
