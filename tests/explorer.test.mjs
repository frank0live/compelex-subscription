/* The Configurations explorer's DOM path. The other modules are pure logic and
   tested as such; this one reads a hidden list, builds a row per configuration,
   and filters them, so it is checked against a tiny hand-rolled document — the
   same zero-dependency shape as the rest of the suite. The claim it has to keep
   is that a configuration's name reaches the page as text and never as markup,
   however hostile the name. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  protoLabel, collectExplorer, readConfigs, configName,
  renderExplorer, filterConfigs, toggleExplorer,
} from '../src/scripts/explorer.js';
import { flagOf } from '../src/scripts/flag.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flagSource = readFileSync(join(ROOT, 'src', 'scripts', 'flag.js'), 'utf8');
const explorerSource = readFileSync(join(ROOT, 'src', 'scripts', 'explorer.js'), 'utf8');

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
    /* The flag renderer writes inline declarations onto the badge, so an
       element has to be able to hold them. A plain bag is enough: the renderer
       only ever assigns, and the tests only ever read back what it assigned. */
    this.style = {};
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
    'config-toggle', 'config-toggle-label',
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
  'explorer.show_more': 'Show {n} more',
  'explorer.search': 'Search configurations',
  'action.copy_short': 'Copy',
  'action.copied': 'Copied',
  'action.copy_link': 'Copy link',
  'action.show_less': 'Show less',
  'action.download': 'Download',
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

/* Build a document holding n vless configs named Srv1..Srvn, with any index in
   `overrides` (1-based) given a different remark, so a search target can be
   planted well past the collapse point. */
function nLinks(n, overrides) {
  const links = [];
  for (let i = 1; i <= n; i++) {
    const name = (overrides && overrides[i]) || ('Srv' + i);
    links.push('vless://u@h:443#' + encodeURIComponent(name));
  }
  return links;
}

function renderN(n, overrides) {
  const doc = makeDoc(nLinks(n, overrides));
  const el = makeEl(doc);
  renderExplorer(el, i18n, readConfigs(doc));
  return el;
}

test('a list at or under the threshold shows every row with no expand control', () => {
  const el = renderN(6);
  assert.equal(names(el).length, 6, 'all six are shown');
  assert.equal(el.configToggle.hidden, true, 'and there is nothing to expand');
});

test('a longer list collapses to six and labels the hidden remainder', () => {
  const cases = [
    [7, 'Show 1 more'],
    [10, 'Show 4 more'],
    [25, 'Show 19 more'],
    [50, 'Show 44 more'],
    [100, 'Show 94 more'],
  ];
  for (const [n, label] of cases) {
    const el = renderN(n);
    assert.equal(names(el).length, 6, n + ' collapses to six visible rows');
    assert.equal(el.configToggle.hidden, false, n + ' shows the control');
    assert.equal(el.configToggleLabel.textContent, label, n + ' labels the remainder');
    assert.equal(el.configToggle.getAttribute('aria-expanded'), 'false');
  }
});

test('expanding shows the whole list and offers to collapse again', () => {
  const el = renderN(10);
  assert.equal(names(el).length, 6);
  toggleExplorer(el);
  assert.equal(names(el).length, 10, 'every row is now shown');
  assert.equal(el.configToggleLabel.textContent, 'Show less');
  assert.equal(el.configToggle.getAttribute('aria-expanded'), 'true');
  toggleExplorer(el);
  assert.equal(names(el).length, 6, 'and it collapses back to six');
  assert.equal(el.configToggleLabel.textContent, 'Show 4 more');
  assert.equal(el.configToggle.getAttribute('aria-expanded'), 'false');
});

test('a search reaches matches past the collapse point and hides the control', () => {
  const el = renderN(10, { 9: 'Tokyo' });
  assert.equal(names(el).length, 6, 'collapsed, Tokyo (row 9) is not among the first six');
  filterConfigs(el, 'tokyo');
  assert.deepEqual(names(el), ['Tokyo'], 'the search still finds it beyond the collapse');
  assert.equal(el.configToggle.hidden, true, 'the expand control steps aside for a search');
  assert.equal(el.explorerEmpty.hidden, true, 'a match is not a miss');
});

test('clearing a search restores the state the reader had, not a reset', () => {
  const el = renderN(10, { 9: 'Tokyo' });
  toggleExplorer(el);
  assert.equal(names(el).length, 10, 'expanded before searching');
  filterConfigs(el, 'tokyo');
  assert.deepEqual(names(el), ['Tokyo']);
  filterConfigs(el, '');
  assert.equal(names(el).length, 10, 'cleared: still expanded, collapse was never disturbed');
});

test('a language change keeps the collapsed state and relabels the control', () => {
  const doc = makeDoc(nLinks(10));
  const el = makeEl(doc);
  const cfgs = readConfigs(doc);
  renderExplorer(el, i18n, cfgs);
  toggleExplorer(el);
  assert.equal(names(el).length, 10, 'expanded');
  renderExplorer(el, i18n, cfgs);
  assert.equal(names(el).length, 10, 'still expanded after a relabel');
  assert.equal(el.configToggleLabel.textContent, 'Show less');
});

/* -------------------------------------------------------------------------
   The flag renderer. A covered country is painted as a CSS gradient over the
   badge; every other country keeps the emoji the platform already renders, and
   an unassigned pair keeps the monogram. The badge's text node is never
   touched, because it is what gives the badge its size.
   ------------------------------------------------------------------------- */

/* matchMedia does not exist under node:test, and that absence is itself one of
   the paths that has to stay safe. Each test stubs it and restores the exact
   previous state — including the absent state — so no stub can leak onwards. */
function withMatchMedia(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'matchMedia');
  const prev = globalThis.matchMedia;
  if (value === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = value;
  try {
    return fn();
  } finally {
    if (had) globalThis.matchMedia = prev;
    else delete globalThis.matchMedia;
  }
}

/* The ordinary desktop answer: nothing is forced. */
const noForcedColors = () => ({ matches: false });

/* A host that forces colours answers only that query, as a real one does. */
const forcedColors = (query) => ({ matches: query === '(forced-colors: active)' });

/* The two regional indicators for an alpha-2 code, built from the block
   arithmetic rather than typed, so the pair is always well formed. */
function pair(code) {
  const base = 0x1f1e6;
  return String.fromCodePoint(base + code.charCodeAt(0) - 65, base + code.charCodeAt(1) - 65);
}

/* One rendered row carrying the given flag, so its badge can be inspected. */
function badgeFor(flag) {
  const cfg = {
    raw: 'vless://u@h:443#x', protocol: 'vless', displayName: 'Server',
    flag, copyable: true, qr: true,
  };
  const el = makeEl(makeDoc([]));
  renderExplorer(el, i18n, [cfg]);
  return el.configList.querySelector('.cfg-flag');
}

const DE_GRADIENT = 'linear-gradient(#000 33.3%,#d00 33.3% 66.6%,#fc0 66.6%)';
const US_GRADIENT = 'linear-gradient(#3c3b6e,#3c3b6e) 0 0/40% 54% no-repeat,repeating-linear-gradient(#b22 0 7.7%,#fff 7.7% 15.4%)';

test('a covered flag paints its gradient and keeps the emoji text node', () => {
  withMatchMedia(noForcedColors, () => {
    const badge = badgeFor(pair('DE'));
    assert.equal(badge.textContent, pair('DE'), 'the RI pair is still the badge text');
    assert.equal(badge.kids.length, 1, 'the text node was never replaced');
    assert.equal(badge.style.background, DE_GRADIENT);
    assert.equal(badge.style.color, 'transparent', 'hidden by colour, not by removal');
    assert.equal(badge.getAttribute('data-mono'), null, 'a painted flag is not a monogram');
  });
});

test('a covered US flag paints its stripes and canton over the same text node', () => {
  withMatchMedia(noForcedColors, () => {
    const badge = badgeFor(pair('US'));
    assert.equal(badge.style.background, US_GRADIENT);
    assert.equal(badge.style.color, 'transparent');
    assert.equal(badge.textContent, pair('US'));
    assert.equal(badge.kids.length, 1);
  });
});

test('an uncovered but valid code keeps its emoji and never becomes a monogram', () => {
  withMatchMedia(noForcedColors, () => {
    for (const code of ['GB', 'HK', 'KR', 'CA', 'CN', 'SG', 'IR', 'TR']) {
      const badge = badgeFor(pair(code));
      assert.equal(flagOf(pair(code)), pair(code), code + ' is a real assigned code');
      assert.equal(badge.textContent, pair(code), code + ' keeps the platform emoji');
      assert.equal(badge.style.background, undefined, code + ' is not painted');
      assert.notEqual(badge.style.color, 'transparent', code + ' stays visible');
      assert.equal(badge.getAttribute('data-mono'), null, code + ' is not a monogram');
    }
  });
});

test('an unassigned pair still reaches the monogram path untouched', () => {
  withMatchMedia(noForcedColors, () => {
    assert.equal(flagOf(pair('ZZ')), '', 'ZZ is not an assigned code');
    const badge = badgeFor('');
    assert.equal(badge.getAttribute('data-mono'), '1', 'still the monogram branch');
    assert.equal(badge.textContent, 'S', 'and it is never empty');
    assert.equal(badge.style.background, undefined);
    assert.notEqual(badge.style.color, 'transparent');
  });
});

test('forced colours keeps the emoji instead of painting an empty box', () => {
  withMatchMedia(forcedColors, () => {
    const badge = badgeFor(pair('DE'));
    assert.equal(badge.textContent, pair('DE'), 'the emoji is still the badge');
    assert.equal(badge.style.background, undefined, 'nothing was painted');
    assert.notEqual(badge.style.color, 'transparent', 'the emoji is not hidden');
  });
});

test('a host without matchMedia falls back to the emoji without throwing', () => {
  withMatchMedia(undefined, () => {
    assert.equal(typeof globalThis.matchMedia, 'undefined', 'the path is really absent');
    let badge;
    assert.doesNotThrow(() => { badge = badgeFor(pair('DE')); });
    assert.equal(badge.textContent, pair('DE'));
    assert.equal(badge.style.background, undefined);
    assert.notEqual(badge.style.color, 'transparent');
  });
});

test('exactly the six approved codes paint, and every painted key is assigned', () => {
  withMatchMedia(noForcedColors, () => {
    const painted = [];
    for (let a = 0; a < 26; a++) {
      for (let b = 0; b < 26; b++) {
        const code = String.fromCharCode(65 + a) + String.fromCharCode(65 + b);
        const badge = badgeFor(pair(code));
        if (badge.style.background !== undefined) {
          painted.push(code);
          assert.equal(flagOf(pair(code)), pair(code), code + ' is painted, so it must be assigned');
          assert.equal(badge.style.color, 'transparent');
        }
      }
    }
    /* The scan is alphabetical, so compare as a set: the claim is which codes
       paint, not the order they were found in. */
    assert.deepEqual(painted.slice().sort(), ['DE', 'FR', 'JP', 'NL', 'SE', 'US'],
      'the registry holds exactly the approved six, and no other code');
  });
});

test('the renderer references no image, remote asset or URL', () => {
  const sources = { 'flag.js': flagSource, 'explorer.js': explorerSource };
  for (const [name, src] of Object.entries(sources)) {
    for (const token of ['url(', 'http:', 'https:', 'data:', 'src=', 'fetch(']) {
      assert.equal(src.includes(token), false, name + ' must not contain ' + token);
    }
  }
});

test('the renderer introduces no markup-parsing API', () => {
  const sources = { 'flag.js': flagSource, 'explorer.js': explorerSource };
  for (const [name, src] of Object.entries(sources)) {
    for (const token of ['innerHTML', 'outerHTML', 'insertAdjacentHTML']) {
      assert.equal(src.includes(token), false, name + ' must not contain ' + token);
    }
  }
});

/* -------------------------------------------------------------------------
   Renderer coverage. The renderer is a coverage model, not a catalogue: FLAGS
   names the six flags a gradient can BE rather than merely resemble, and every
   other assigned code keeps the emoji its platform already renders. These
   tests are the permanent proof of that model.

   They read the registry out of the SHIPPED source rather than restating it, so
   an edit that silently dropped a country from the bitmap or from FLAGS fails
   here rather than reaching a reader. Nothing is imported that the module does
   not already export; the source text is the artefact under test.
   ------------------------------------------------------------------------- */

/* The six covered gradients. DE and US reuse the constants asserted above. */
const CSS_FLAGS = {
  DE: DE_GRADIENT,
  FR: 'linear-gradient(90deg,#039 33.3%,#fff 33.3% 66.6%,#e33 66.6%)',
  NL: 'linear-gradient(#a11 33.3%,#fff 33.3% 66.6%,#249 66.6%)',
  JP: 'radial-gradient(circle closest-side,#b02 0 60%,#fff 60%)',
  SE: 'linear-gradient(90deg,#0000 30%,#fc0 30% 45%,#0000 45%),linear-gradient(#0000 40%,#fc0 40% 55%,#0000 55%),#06a',
  US: US_GRADIENT,
};

/* The assigned codes, decoded from the shipped CODES bitmap — the same 85-byte
   source the runtime decodes, so the two can never disagree. */
const CODES_BITS = atob((flagSource.match(/atob\('([^']*)'\)/) || [])[1] || '');
const isAssigned = (code) => {
  const i = (code.charCodeAt(0) - 65) * 26 + (code.charCodeAt(1) - 65);
  return (CODES_BITS.charCodeAt(i >> 3) >> (i & 7)) & 1;
};
const ASSIGNED = (() => {
  const out = [];
  for (let a = 0; a < 26; a += 1) {
    for (let b = 0; b < 26; b += 1) {
      const code = String.fromCharCode(65 + a) + String.fromCharCode(65 + b);
      if (isAssigned(code)) out.push(code);
    }
  }
  return out;
})();

test('every covered flag paints its own gradient over an intact text node', () => {
  withMatchMedia(noForcedColors, () => {
    for (const [code, gradient] of Object.entries(CSS_FLAGS)) {
      const badge = badgeFor(pair(code));
      assert.equal(badge.style.background, gradient, code + ' paints its own gradient');
      assert.equal(badge.textContent, pair(code), code + ' keeps its RI pair as text');
      assert.equal(badge.kids.length, 1, code + ' text node was never replaced');
      assert.equal(badge.style.color, 'transparent', code + ' is hidden by colour, not removal');
      assert.equal(badge.getAttribute('data-mono'), null, code + ' is not a monogram');
    }
  });
});

test('a country without a gradient keeps a real flag badge and is never a monogram', () => {
  withMatchMedia(noForcedColors, () => {
    for (const code of ['TR', 'IR', 'GB', 'CA', 'AE', 'SG', 'KR', 'CN', 'IN', 'BR', 'HK']) {
      assert.equal(isAssigned(code), 1, code + ' is an assigned code');
      const flag = pair(code);
      assert.equal(flagOf(flag), flag, code + ' resolves to its flag pair');
      const badge = badgeFor(flag);
      assert.equal(badge.textContent, flag, code + ' keeps the platform emoji');
      assert.equal(badge.getAttribute('data-mono'), null, code + ' never falls to a monogram');
      assert.equal(badge.style.background, undefined, code + ' gets no gradient');
      assert.notEqual(badge.style.color, 'transparent', code + ' stays visible');
    }
  });
});

test('every assigned code in the registry renders a flag and never a monogram', () => {
  withMatchMedia(noForcedColors, () => {
    assert.equal(ASSIGNED.length, 258, 'the registry holds 258 assigned codes');
    const bad = [];
    for (const code of ASSIGNED) {
      const flag = pair(code);
      if (flagOf(flag) !== flag) { bad.push(code + ':flagOf'); continue; }
      const badge = badgeFor(flag);
      if (badge.getAttribute('data-mono') !== null) bad.push(code + ':monogram');
      if (badge.textContent !== flag) bad.push(code + ':text');
      if (badge.style.background !== undefined && CSS_FLAGS[code] === undefined) {
        bad.push(code + ':unexpected-gradient');
      }
    }
    assert.deepEqual(bad, [], 'no assigned code may lose its flag badge');
  });
});

test('an invalid code still falls to the monogram and never to a gradient', () => {
  withMatchMedia(noForcedColors, () => {
    for (const code of ['ZZ', 'XX', 'QQ']) {
      assert.equal(isAssigned(code), 0, code + ' is not an assigned code');
      const flag = flagOf(pair(code));
      assert.equal(flag, '', code + ' resolves to no flag at all');
      const badge = badgeFor(flag);
      assert.equal(badge.getAttribute('data-mono'), '1', code + ': still the monogram branch');
      assert.equal(badge.style.background, undefined, code + ': no gradient');
      assert.notEqual(badge.style.color, 'transparent', code + ': never hidden');
    }
  });
});
