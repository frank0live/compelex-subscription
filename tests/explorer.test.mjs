/* The Configurations explorer's DOM path. The other modules are pure logic and
   tested as such; this one reads a hidden list, builds a row per configuration,
   and filters them, so it is checked against a tiny hand-rolled document — the
   same zero-dependency shape as the rest of the suite. The claim it has to keep
   is that a configuration's name reaches the page as text and never as markup,
   however hostile the name. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  protoLabel, collectExplorer, readConfigs, configName,
  renderExplorer, filterConfigs,
} from '../src/scripts/explorer.js';

/* A document just large enough for the explorer: text is text, elements are
   elements, and getElementById finds what was registered under an id. Nothing
   here parses a string as HTML — textContent is stored and read back verbatim,
   which is the whole point of the security test. */
class TextNode {
  constructor(text) { this.data = String(text); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toLowerCase();
    this.kids = [];
    this.attrs = new Map();
    this.className = '';
    this.hidden = false;
  }
  get textContent() { return this.kids.map((k) => k.textContent).join(''); }
  set textContent(v) { this.kids = [new TextNode(v)]; }
  appendChild(node) { this.kids.push(node); return node; }
  get children() { return this.kids.filter((k) => k instanceof El); }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  matches(sel) {
    if (sel[0] === '.') return this.className.split(/\s+/).indexOf(sel.slice(1)) > -1;
    return this.tagName === sel.toLowerCase();
  }
  find(sel, all, out) {
    for (const k of this.children) {
      if (k.matches(sel)) { out.push(k); if (!all) return out; }
      k.find(sel, all, out);
      if (!all && out.length) return out;
    }
    return out;
  }
  querySelector(sel) { return this.find(sel, false, [])[0] || null; }
  querySelectorAll(sel) { return this.find(sel, true, []); }
}

function makeDoc(links) {
  const byId = new Map();
  const doc = {
    createElement(tag) { return new El(tag); },
    getElementById(id) { return byId.get(id) || null; },
  };
  const register = (id) => { const el = new El('div'); byId.set(id, el); return el; };
  for (const id of [
    'explorer', 'explorer-title', 'explorer-count', 'explorer-hint',
    'explorer-search-wrap', 'explorer-search', 'config-list', 'explorer-empty',
  ]) register(id);
  if (links) {
    const src = register('links-source');
    for (const raw of links) {
      const span = new El('span');
      span.textContent = raw;
      src.appendChild(span);
    }
  }
  return doc;
}

function makeEl(doc) {
  const el = collectExplorer(doc);
  el.doc = doc;
  return el;
}

/* Only the keys the explorer actually asks for; a {token} is substituted so a
   numbered fallback and an aria-label can be read back. */
const CATALOG = {
  'explorer.title': 'Configurations',
  'explorer.hint': 'Import one server, or copy it to add by hand.',
  'explorer.empty': 'Nothing matches your search.',
  'explorer.unnamed': 'Configuration {n}',
  'explorer.view': 'View',
  'explorer.view_for': 'View {name}',
  'explorer.copy_for': 'Copy {name}',
  'explorer.search': 'Search configurations',
  'action.copy_short': 'Copy',
  'action.copied': 'Copied',
  'action.copy_link': 'Copy link',
  'config.open': 'Open in Telegram',
  'config.conf_label': 'Configuration file',
  'action.close': 'Close',
  'config.alt': 'QR code for this configuration',
  'config.link_label': 'Configuration link',
};

const i18n = {
  t(key, params) {
    let s = CATALOG[key] || key;
    if (params) for (const k of Object.keys(params)) s = s.split('{' + k + '}').join(String(params[k]));
    return s;
  },
  fmt: { number: (n) => String(n) },
};

const names = (el) => el.configList.children
  .filter((r) => !r.hidden)
  .map((r) => r.querySelector('.cfg-name').textContent);

test('a protocol label is a proper noun, or the bare id when unknown', () => {
  assert.equal(protoLabel('vless'), 'VLESS');
  assert.equal(protoLabel('shadowsocks'), 'Shadowsocks');
  assert.equal(protoLabel('mtproto'), 'MTProto');
  assert.equal(protoLabel('something-new'), 'something-new');
});

test('a row is named after the configuration, or numbered when it has none', () => {
  assert.equal(configName({ displayName: 'Berlin' }, 0, i18n), 'Berlin');
  assert.equal(configName({ displayName: '' }, 2, i18n), 'Configuration 3');
  assert.equal(configName({}, 8, i18n), 'Configuration 9');
});

const RAW = [
  'vless://u@h:443#A', 'http://x', 'vless://u@h:443#A',
  'trojan://p@h:443#B', 'garbage', 'tg://proxy?secret=ee',
];

test('the links are read from the hidden source, classified and de-duplicated', () => {
  const cfgs = readConfigs(makeDoc(RAW));
  assert.deepEqual(cfgs.map((c) => c.protocol), ['vless', 'trojan', 'mtproto']);
  assert.equal(readConfigs(makeDoc()).length, 0, 'no source, no configs');
});

test('the section builds its rows once, counts them, and hides search when short', () => {
  const doc = makeDoc(RAW);
  const el = makeEl(doc);
  const cfgs = readConfigs(doc);
  renderExplorer(el, i18n, cfgs);
  renderExplorer(el, i18n, cfgs);
  assert.equal(el.configList.children.length, 3, 'rendered twice, still three rows');
  assert.equal(el.explorer.hidden, false);
  assert.equal(el.explorerCount.textContent, '3');
  assert.equal(el.explorerTitle.textContent, 'Configurations');
  assert.equal(el.searchWrap.hidden, true, 'three is at or under the threshold');
});

test('an empty configuration list hides the whole section', () => {
  const doc = makeDoc([]);
  const el = makeEl(doc);
  renderExplorer(el, i18n, []);
  assert.equal(el.explorer.hidden, true);
  assert.equal(el.configList.children.length, 0);
});

test('each row carries a flag or a monogram, a name and a protocol', () => {
  const doc = makeDoc([
    'vless://u@h:443#%F0%9F%87%A9%F0%9F%87%AA%20Berlin',
    'tg://proxy?server=1.2.3.4&port=443&secret=ee',
  ]);
  const el = makeEl(doc);
  renderExplorer(el, i18n, readConfigs(doc));
  const rows = el.configList.children;

  const flagged = rows[0];
  assert.equal(flagged.querySelector('.cfg-flag').textContent, '🇩🇪');
  assert.equal(flagged.querySelector('.cfg-flag').getAttribute('data-mono'), null);
  assert.equal(flagged.querySelector('.cfg-name').textContent, 'Berlin');
  assert.equal(flagged.querySelector('.cfg-proto').textContent, 'VLESS');
  assert.equal(flagged.getAttribute('data-search'), 'berlin vless');

  const nameless = rows[1];
  const badge = nameless.querySelector('.cfg-flag');
  assert.equal(badge.getAttribute('data-mono'), '1', 'no flag, so a monogram');
  assert.equal(badge.textContent, 'M', 'and it is never empty');
  assert.equal(nameless.querySelector('.cfg-name').textContent, 'Configuration 2');
  assert.equal(nameless.querySelector('.cfg-proto').textContent, 'MTProto');
});

test('a hostile configuration name is written as text, never as markup', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const cfg = {
    raw: 'vless://u@h:443#x', protocol: 'vless', displayName: hostile,
    flag: '', copyable: true, qr: true,
  };
  const el = makeEl(makeDoc([]));
  renderExplorer(el, i18n, [cfg]);
  const name = el.configList.querySelector('.cfg-name');
  assert.equal(name.textContent, hostile, 'the bytes survive');
  assert.equal(name.children.length, 0, 'no element was parsed out of the name');
  assert.equal(el.configList.querySelectorAll('img').length, 0);
  assert.equal(el.configList.querySelectorAll('script').length, 0);
});

test('the filter matches row text and shows the empty note only on a real miss', () => {
  const doc = makeDoc([
    'vless://u@h:443#Berlin', 'trojan://p@h:443#Frankfurt', 'vless://u@h:443#Tokyo',
    'vless://u@h:443#Paris', 'vless://u@h:443#Oslo', 'vless://u@h:443#Madrid',
  ]);
  const el = makeEl(doc);
  renderExplorer(el, i18n, readConfigs(doc));
  assert.equal(el.searchWrap.hidden, false, 'six is past the threshold');

  filterConfigs(el, 'frank');
  assert.deepEqual(names(el), ['Frankfurt']);
  assert.equal(el.explorerEmpty.hidden, true, 'a match hides the empty note');

  filterConfigs(el, 'trojan');
  assert.deepEqual(names(el), ['Frankfurt'], 'the protocol is searchable too');

  filterConfigs(el, 'zzz');
  assert.deepEqual(names(el), []);
  assert.equal(el.explorerEmpty.hidden, false, 'a miss shows it');

  filterConfigs(el, '');
  assert.equal(names(el).length, 6);
  assert.equal(el.explorerEmpty.hidden, true, 'an empty query is not a miss');
});
