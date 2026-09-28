/* Applications the panel itself configured.
 *
 * PasarGuard lets an operator list the applications subscribers should use —
 * Settings, Subscription, Applications — and hands that list to the page with
 * each import link already built for this subscriber. When the panel sends a
 * list, the Connect card shows it instead of the built-in catalogue in
 * clients.js: the operator knows their users, and the panel already filtered
 * the list for a device-bound subscription. With no list (3X-UI, Rebecca, or a
 * PasarGuard with none configured) the page is exactly what it was.
 *
 * The list arrives as a hidden element the PasarGuard shell writes
 * (src/panels/pasarguard/extension.jinja2), every value escaped by the panel's
 * autoescape block. Everything is still checked here: a name is text, an import
 * link may not run script, a download link must be a web address, and an icon
 * is never loaded, because the page makes no request to another site. */

import { safe, LINK_SCHEMES } from './url.js';

/* Every platform PasarGuard defines, in the order the tabs show them. */
export const APP_PLATFORMS = ['android', 'ios', 'windows', 'macos', 'linux', 'androidtv', 'appletv'];

/* The description languages PasarGuard defines. Arabic has none, so an Arabic
   reader gets the English description. */
const DESC_LANGS = ['en', 'fa', 'ru', 'zh'];

/* A scheme that runs script or reaches local data is never a link. Controls and
   spaces are dropped before the test, as a URL parser drops them, so
   "java\tscript:" cannot slip past as something else. */
const BLOCKED = /^(?:javascript|vbscript|data|file|blob|about):/i;
const APP_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function attr(node, name) {
  const v = node.getAttribute(name);
  return typeof v === 'string' ? v.trim() : '';
}

/* An application's own import link: any scheme an application registers, and
   nothing that runs script. */
export function importLink(raw) {
  const value = String(raw || '').trim();
  const probe = value.replace(/[\u0000- \u007f]/g, '');
  return APP_SCHEME.test(probe) && !BLOCKED.test(probe) ? value : '';
}

/* A download link opens a web page and nothing else. */
function webLink(raw) {
  return safe(raw, LINK_SCHEMES) || '';
}

/* The list, read once. Entries without a name or on a platform PasarGuard does
   not define are dropped rather than guessed at. */
export function readApps(doc) {
  const host = doc.getElementById('apps-source');
  if (!host) return [];
  const out = [];
  const items = host.children;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = attr(item, 'data-name').slice(0, 64);
    const platform = attr(item, 'data-platform').toLowerCase();
    if (!name || APP_PLATFORMS.indexOf(platform) < 0) continue;

    const desc = {};
    for (let k = 0; k < DESC_LANGS.length; k++) {
      desc[DESC_LANGS[k]] = attr(item, 'data-' + DESC_LANGS[k]);
    }

    const downloads = [];
    const links = item.children;
    for (let k = 0; k < links.length; k++) {
      const url = webLink(attr(links[k], 'data-url'));
      if (url) downloads.push({ name: attr(links[k], 'data-name'), url: url, lang: attr(links[k], 'data-lang') });
    }

    out.push({
      name: name,
      platform: platform,
      link: importLink(attr(item, 'data-import')),
      recommended: attr(item, 'data-rec') === '1',
      desc: desc,
      downloads: downloads,
    });
  }
  return out;
}

/* The platforms the list covers, in tab order. */
export function appPlatforms(apps) {
  const out = [];
  for (let i = 0; i < APP_PLATFORMS.length; i++) {
    for (let k = 0; k < apps.length; k++) {
      if (apps[k].platform === APP_PLATFORMS[i]) {
        out.push(APP_PLATFORMS[i]);
        break;
      }
    }
  }
  return out;
}

/* One platform's applications, the recommended one first and the rest in the
   operator's own order. Each keeps its index into the full list, which is what
   the buttons carry. */
export function appsFor(platform, apps) {
  const first = [];
  const rest = [];
  for (let i = 0; i < apps.length; i++) {
    if (apps[i].platform !== platform) continue;
    (apps[i].recommended ? first : rest).push({ app: apps[i], index: i });
  }
  return first.concat(rest);
}

/* The description in the reader's language, then English, then any. */
export function describe(app, lang) {
  if (app.desc[lang]) return app.desc[lang];
  if (app.desc.en) return app.desc.en;
  for (let i = 0; i < DESC_LANGS.length; i++) {
    if (app.desc[DESC_LANGS[i]]) return app.desc[DESC_LANGS[i]];
  }
  return '';
}

/* One download link: the reader's language, then English, then the first. */
export function downloadFor(app, lang) {
  const list = app.downloads;
  for (let i = 0; i < list.length; i++) if (list[i].lang === lang) return list[i];
  for (let i = 0; i < list.length; i++) if (list[i].lang === 'en') return list[i];
  return list.length ? list[0] : null;
}

/* The tab to open on: the reader's own platform when the list covers it. A
   Linux desktop reports itself as Linux, which the built-in catalogue has no
   tab for; an Android TV reports Android. */
export function pickPlatform(detected, platforms, ua) {
  let want = detected;
  if (want === 'windows' && /Linux/i.test(String(ua || '')) && !/Android/i.test(String(ua || ''))) want = 'linux';
  if (platforms.indexOf(want) > -1) return want;
  if (want === 'android' && platforms.indexOf('androidtv') > -1) return 'androidtv';
  return platforms.length ? platforms[0] : detected;
}
