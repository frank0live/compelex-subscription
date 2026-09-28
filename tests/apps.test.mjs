/* The panel's own applications (PasarGuard, 1.4.0) and the announcement's own
 * link.
 *
 * The list reaches the page as a hidden element the PasarGuard shell writes,
 * every value already escaped by the panel's autoescape block; these tests are
 * about what the runtime does with it: a name stays text however hostile, an
 * import link may not run script, a download link must be a web address, the
 * tabs are the platforms the list covers, and with no list the page is exactly
 * what it was. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_PLATFORMS, importLink, readApps, appPlatforms, appsFor, describe, downloadFor, pickPlatform,
} from '../src/scripts/apps.js';
import { renderConnect, platformsFor, nextTab } from '../src/scripts/connect.js';
import { PLATFORMS } from '../src/scripts/clients.js';
import { render } from '../src/scripts/render.js';
import { readPanel, normalize, readDocument } from '../src/scripts/model.js';
import { createI18n } from '../src/scripts/i18n.js';
import { Document } from './helpers/dom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogues = {};
for (const lang of ['en', 'fa', 'ar', 'ru', 'zh']) {
  catalogues[lang] = JSON.parse(readFileSync(join(ROOT, 'src', 'locales', `${lang}.json`), 'utf8'));
}
const i18n = (lang) => createI18n(catalogues, lang, false);

/* A document carrying the list exactly as the PasarGuard shell writes it. */
function docWith(apps) {
  const doc = new Document();
  const host = doc.add('div', 'apps-source');
  for (const a of apps) {
    const item = doc.createElement('i');
    for (const [k, v] of Object.entries(a)) if (k !== 'dl') item.setAttribute('data-' + k, v);
    for (const d of a.dl || []) {
      const b = doc.createElement('b');
      b.setAttribute('data-name', d.name || '');
      b.setAttribute('data-url', d.url || '');
      b.setAttribute('data-lang', d.lang || '');
      item.appendChild(b);
    }
    host.appendChild(item);
  }
  return doc;
}

const SUB = 'https://panel.example/sub/abc';
const SAMPLE = [
  { name: 'v2rayNG', platform: 'android', import: 'v2rayng://install-sub?url=' + encodeURIComponent(SUB), rec: '1',
    en: 'Fast and free', fa: 'سریع و رایگان',
    dl: [{ name: 'GitHub', url: 'https://github.com/2dust/v2rayNG/releases', lang: 'en' },
      { name: 'Mirror', url: 'https://mirror.example/v2rayng.apk', lang: 'fa' }] },
  { name: 'Happ', platform: 'android', import: 'happ://add/' + SUB, rec: '' },
  { name: 'Streisand', platform: 'ios', import: 'streisand://import/' + SUB, rec: '1' },
  { name: 'Hiddify', platform: 'linux', import: 'hiddify://import/' + SUB, rec: '' },
  { name: 'TV app', platform: 'androidtv', import: '', rec: '' },
];

test('import links keep every application scheme and refuse script', () => {
  for (const ok of ['v2rayng://install-sub?url=x', 'happ://add/https://h/s', 'sing-box://import-remote-profile?url=x',
    'https://apps.example/import?u=x', 'clash://install-config?url=x']) {
    assert.equal(importLink(ok), ok, ok);
  }
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:x',
    'vbscript:x', 'data:text/html,<b>x', 'file:///etc/passwd', 'blob:https://h/x', 'about:blank', '',
    'no-scheme-here', '//host/path']) {
    assert.equal(importLink(bad), '', JSON.stringify(bad));
  }
});

test('the list is read into applications, and junk entries are dropped', () => {
  const apps = readApps(docWith([
    ...SAMPLE,
    { name: '', platform: 'android' },
    { name: 'Nowhere', platform: 'playstation' },
    { name: 'Evil', platform: 'ios', import: 'javascript:alert(1)', dl: [{ name: 'x', url: 'javascript:alert(2)', lang: 'en' }] },
  ]));
  assert.deepEqual(apps.map((a) => a.name), ['v2rayNG', 'Happ', 'Streisand', 'Hiddify', 'TV app', 'Evil']);
  assert.equal(apps[0].recommended, true);
  assert.equal(apps[1].recommended, false);
  assert.equal(apps[0].desc.fa, 'سریع و رایگان');
  assert.equal(apps[0].downloads.length, 2);
  const evil = apps[5];
  assert.equal(evil.link, '', 'a script import link is dropped');
  assert.deepEqual(evil.downloads, [], 'a script download link is dropped');
  assert.deepEqual(readApps(new Document()), [], 'no list, no applications');
});

test('a hostile name is kept as text and capped', () => {
  const name = '<img src=x onerror=alert(1)>' + 'x'.repeat(100);
  const [app] = readApps(docWith([{ name, platform: 'windows' }]));
  assert.equal(app.name, name.slice(0, 64));
});

test('the tabs are the platforms the list covers, in a fixed order', () => {
  const apps = readApps(docWith(SAMPLE));
  assert.deepEqual(appPlatforms(apps), ['android', 'ios', 'linux', 'androidtv']);
  assert.deepEqual(platformsFor(apps), ['android', 'ios', 'linux', 'androidtv']);
  assert.deepEqual(platformsFor([]), PLATFORMS, 'no list: the built-in four');
  for (const p of appPlatforms(apps)) assert.ok(APP_PLATFORMS.includes(p));
  const tabs = appPlatforms(apps);
  assert.equal(nextTab('android', 'ArrowRight', false, tabs), 'ios');
  assert.equal(nextTab('android', 'ArrowLeft', false, tabs), 'androidtv');
  assert.equal(nextTab('ios', 'ArrowRight', true, tabs), 'android', 'right-to-left');
  assert.equal(nextTab('linux', 'End', false, tabs), 'androidtv');
});

test('the recommended application comes first, the rest keep the operator order', () => {
  const apps = readApps(docWith([
    { name: 'A', platform: 'android' }, { name: 'B', platform: 'android', rec: '1' }, { name: 'C', platform: 'android' },
  ]));
  assert.deepEqual(appsFor('android', apps).map((x) => [x.app.name, x.index]), [['B', 1], ['A', 0], ['C', 2]]);
});

test('the description and the download follow the reader, then English', () => {
  const [app] = readApps(docWith(SAMPLE));
  assert.equal(describe(app, 'fa'), 'سریع و رایگان');
  assert.equal(describe(app, 'ar'), 'Fast and free', 'no Arabic in PasarGuard: English');
  assert.equal(downloadFor(app, 'fa').name, 'Mirror');
  assert.equal(downloadFor(app, 'ru').name, 'GitHub');
  const [bare] = readApps(docWith([{ name: 'X', platform: 'ios' }]));
  assert.equal(describe(bare, 'en'), '');
  assert.equal(downloadFor(bare, 'en'), null);
});

test('the opening tab is the reader\'s platform when the list covers it', () => {
  const tabs = ['android', 'ios', 'linux', 'androidtv'];
  assert.equal(pickPlatform('ios', tabs, 'iPhone'), 'ios');
  assert.equal(pickPlatform('windows', tabs, 'Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
  assert.equal(pickPlatform('windows', tabs, 'Windows NT 10.0'), 'android', 'not covered: the first tab');
  assert.equal(pickPlatform('android', ['ios', 'androidtv'], 'Android'), 'androidtv');
  assert.equal(pickPlatform('macos', ['macos'], 'Macintosh'), 'macos');
});

/* --- the Connect card -------------------------------------------------------- */

function card(apps, lang = 'en', platform) {
  const doc = new Document();
  const el = {
    doc,
    tabs: doc.add('div', 'platform-tabs'),
    clients: doc.add('div', 'client-list'),
    connectTitle: doc.add('h2', 'connect-title'),
    connectHint: doc.add('p', 'connect-hint'),
  };
  const urls = { sub: SUB, json: '', clash: '' };
  const tabs = platformsFor(apps);
  renderConnect(el, i18n(lang), urls, platform || tabs[0], apps);
  return el;
}

test('with a list, the card shows the panel\'s applications and its platforms', () => {
  const apps = readApps(docWith(SAMPLE));
  const el = card(apps);
  assert.deepEqual(el.tabs.children.map((t) => t.getAttribute('data-platform')), ['android', 'ios', 'linux', 'androidtv']);
  assert.deepEqual(el.tabs.children.map((t) => t.textContent), ['Android', 'iOS', 'Linux', 'Android TV']);
  const rows = el.clients.children;
  assert.deepEqual(rows.map((r) => r.querySelector('.client-name').textContent), ['v2rayNG', 'Happ']);
  const first = rows[0];
  assert.equal(first.querySelector('.client-tag').textContent, 'Recommended');
  assert.equal(first.querySelector('.client-desc').textContent, 'Fast and free');
  const acts = first.querySelectorAll('[data-act]').map((b) => b.getAttribute('data-act'));
  assert.deepEqual(acts, ['download', 'import', 'copy'], 'the download link under the name, then the two buttons');
  assert.deepEqual(first.querySelector('.client-actions').querySelectorAll('[data-act]').map((b) => b.getAttribute('data-act')),
    ['import', 'copy'], 'two buttons, as every template sizes its rows for');
  const dl = first.querySelector('.client-dl');
  assert.equal(dl.parent, first.querySelector('.client-head'));
  assert.equal(dl.tagName, 'A');
  assert.equal(dl.className, 'text-link client-dl');
  assert.equal(dl.getAttribute('href'), 'https://github.com/2dust/v2rayNG/releases');
  assert.equal(dl.getAttribute('target'), '_blank');
  assert.equal(dl.getAttribute('rel'), 'noopener noreferrer nofollow');
  assert.equal(dl.textContent, 'Download');
  assert.equal(dl.getAttribute('aria-label'), 'Download v2rayNG');
  assert.equal(first.querySelector('.client-actions [data-act]').getAttribute('aria-label'), 'Import into v2rayNG');
  assert.equal(rows[1].querySelector('.client-tag'), null, 'not recommended: no tag');
  assert.equal(el.connectHint.textContent, catalogues.en['connect.hint']);
});

test('an application without an import link offers Copy on its own', () => {
  const apps = readApps(docWith(SAMPLE));
  const el = card(apps, 'en', 'androidtv');
  const acts = el.clients.children[0].querySelectorAll('[data-act]').map((b) => b.getAttribute('data-act'));
  assert.deepEqual(acts, ['copy']);
  assert.equal(el.clients.children[0].querySelector('[data-act]').className, 'btn btn-sm btn-outline');
});

test('the card speaks the reader\'s language, and the rows follow it', () => {
  const apps = readApps(docWith(SAMPLE));
  const el = card(apps, 'fa');
  const first = el.clients.children[0];
  assert.equal(first.querySelector('.client-tag').textContent, 'پیشنهادی');
  assert.equal(first.querySelector('.client-desc').textContent, 'سریع و رایگان');
  assert.equal(first.querySelector('.client-dl').getAttribute('href'), 'https://mirror.example/v2rayng.apk');
  assert.equal(el.tabs.children[2].textContent, 'لینوکس');
});

test('without a list, the card is the built-in catalogue exactly as before', () => {
  const el = card([]);
  assert.deepEqual(el.tabs.children.map((t) => t.getAttribute('data-platform')), PLATFORMS);
  assert.ok(el.clients.children.every((r) => r.id.startsWith('client-')), 'built-in rows');
  assert.ok(el.clients.querySelector('[data-app]') === null);
});

test('no icon the panel names is ever loaded', () => {
  const src = readFileSync(join(ROOT, 'src', 'scripts', 'apps.js'), 'utf8') + readFileSync(join(ROOT, 'src', 'scripts', 'connect.js'), 'utf8');
  for (const token of ["'img'", 'icon_url', '.src', 'fetch(', 'innerHTML', 'insertAdjacentHTML']) {
    assert.equal(src.includes(token), false, token);
  }
  const ext = readFileSync(join(ROOT, 'src', 'panels', 'pasarguard', 'extension.jinja2'), 'utf8');
  const markup = ext.slice(ext.indexOf('-#}') + 3);
  assert.equal(/icon/.test(markup), false, 'the shell does not even write the icon address');
});

/* --- the panel marker and the announcement link -------------------------------- */

function panelDoc(attrs) {
  const doc = new Document();
  const el = doc.add('div', 'panel-data');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return doc;
}

test('the panel marker names only the two panels the shells write', () => {
  assert.deepEqual(readPanel(new Document()), { id: '', announceUrl: '' }, 'a 3X-UI page has none');
  assert.equal(readPanel(panelDoc({ 'data-panel': 'pasarguard' })).id, 'pasarguard');
  assert.equal(readPanel(panelDoc({ 'data-panel': 'rebecca' })).id, 'rebecca');
  assert.equal(readPanel(panelDoc({ 'data-panel': 'evil' })).id, '');
  assert.equal(readPanel(panelDoc({ 'data-panel': 'pasarguard', 'data-announce-url': ' https://t.me/news ' })).announceUrl,
    'https://t.me/news');
});

function notice(text, url) {
  const doc = new Document();
  const slot = doc.add('div', 'announce-slot');
  const el = { doc, announceSlot: slot };
  const model = normalize({ ...readDocument(doc), announce: text, enabled: '1' });
  render(Object.assign(el, { statePill: null }), model, i18n('en'), Date.now(), {}, url);
  return slot;
}

test('the announcement gains one "Open link" when the panel gives it a web address', () => {
  const slot = notice('Maintenance tonight', 'https://status.example/today');
  const link = slot.querySelector('.announce-link');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), 'https://status.example/today');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer nofollow');
  assert.equal(link.textContent, 'Open link');
});

test('an announcement address that is not a web address is never a link', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'tg://resolve?domain=x', '', 'not a url']) {
    assert.equal(notice('Maintenance tonight', url).querySelector('.announce-link'), null, url);
  }
  assert.equal(notice('', 'https://status.example').firstChild, null, 'no text, no card, no link');
});
