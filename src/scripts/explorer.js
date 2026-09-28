/* The Configurations explorer.
 *
 * The panel hands the page a list of raw share links in a hidden container; this
 * module reads them once at load, classifies each one, and renders a premium
 * list — a flag or monogram badge, the server's name, its protocol — with a
 * View and a Copy per row. It never draws the credential in the list: the raw
 * link is revealed only inside the detail dialog the reader opens for it, and
 * nothing here reaches the network or the console.
 *
 * The list is built once from a fixed list of configurations, so buildList runs
 * a single time; relabel runs on every language change and rewrites only the
 * words. This mirrors how connect.js keeps its client rows stable. */

import { setText, setAttr } from './render.js';
import { parseAll } from './config.js';

/* Protocol names are Latin proper nouns — the same in every language — so they
   are not catalogue keys. Anything the parser produces but this table misses
   falls back to the bare protocol id rather than an empty badge. */
const PROTO_LABEL = {
  vmess: 'VMess',
  vless: 'VLESS',
  trojan: 'Trojan',
  shadowsocks: 'Shadowsocks',
  hysteria: 'Hysteria',
  hysteria2: 'Hysteria2',
  wireguard: 'WireGuard',
  amneziawg: 'AmneziaWG',
  mtproto: 'MTProto',
};

/* A short list needs no filter; the search field appears only past this. */
const SEARCH_THRESHOLD = 5;

/* A list this long or shorter shows every row at once with no expand control;
   past it the list collapses to its first COLLAPSE_THRESHOLD rows until the
   reader asks for the rest. Search always overrides the collapse (see applyRows). */
const COLLAPSE_THRESHOLD = 6;

export function protoLabel(protocol) {
  return PROTO_LABEL[protocol] || protocol;
}

/* The id-map for the explorer and its dialog, merged into the shell's `el` so
   the wiring reads one object. Kept out of render.js's collect() because none of
   these belong to the pure per-poll render path. */
export function collectExplorer(doc) {
  const id = function (name) {
    return doc.getElementById(name);
  };
  return {
    explorer: id('explorer'),
    explorerTitle: id('explorer-title'),
    explorerCount: id('explorer-count'),
    explorerHint: id('explorer-hint'),
    searchWrap: id('explorer-search-wrap'),
    search: id('explorer-search'),
    configList: id('config-list'),
    explorerEmpty: id('explorer-empty'),
    configDialog: id('config-dialog'),
    configTitle: id('config-title'),
    configClose: id('config-close'),
    configFrame: id('config-frame'),
    configCanvas: id('config-canvas'),
    configHint: id('config-hint'),
    configUrl: id('config-url'),
    configCopy: id('config-copy'),
    configCopyLabel: id('config-copy-label'),
    configCopyDone: id('config-copy-done'),
    configOpen: id('config-open'),
    configOpenLabel: id('config-open-label'),
    configConf: id('config-conf'),
    configConfLabel: id('config-conf-label'),
    configConfText: id('config-conf-text'),
    configConfCopy: id('config-conf-copy'),
    configConfDownload: id('config-conf-download'),
    configConfDownloadLabel: id('config-conf-download-label'),
    configToggle: id('config-toggle'),
    configToggleLabel: id('config-toggle-label'),
  };
}

/* The raw links live in #links-source as one <span> per link, HTML-escaped by
   the server template; textContent round-trips each one byte for byte. parseAll
   drops anything unusable and collapses exact duplicates. */
export function readConfigs(doc) {
  const src = doc.getElementById('links-source');
  if (!src) return [];
  const raw = [];
  const nodes = src.children;
  for (let i = 0; i < nodes.length; i++) raw.push(nodes[i].textContent || '');
  return parseAll(raw);
}

/* The label a row shows: the cleaned name, or a numbered fallback so an unnamed
   configuration is still addressable. */
export function configName(cfg, index, i18n) {
  return cfg.displayName || i18n.t('explorer.unnamed', { n: index + 1 });
}

/* One uppercase letter for a nameless-but-unflagged row, taken from the name if
   there is one and otherwise from the protocol, so the badge is never empty. */
function monoLetter(cfg) {
  const base = (cfg.displayName || protoLabel(cfg.protocol)).trim();
  const first = base ? Array.from(base)[0] : '';
  return (first || '#').toUpperCase();
}

function actionButton(doc, index, act, variant, swap) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm ' + variant;
  button.setAttribute('data-index', String(index));
  button.setAttribute('data-act', act);
  if (swap) {
    const wrap = doc.createElement('span');
    wrap.className = 'btn-swap';
    const live = doc.createElement('span');
    live.className = 'swap-live';
    const done = doc.createElement('span');
    done.className = 'swap-done';
    wrap.appendChild(live);
    wrap.appendChild(done);
    button.appendChild(wrap);
  }
  return button;
}

function configRow(doc, cfg, index) {
  const row = doc.createElement('div');
  row.className = 'cfg';

  const badge = doc.createElement('span');
  badge.className = 'cfg-flag';
  badge.setAttribute('aria-hidden', 'true');
  if (cfg.flag) {
    badge.textContent = cfg.flag;
  } else {
    badge.setAttribute('data-mono', '1');
    badge.textContent = monoLetter(cfg);
  }
  row.appendChild(badge);

  const body = doc.createElement('div');
  body.className = 'cfg-body';
  const name = doc.createElement('span');
  name.className = 'cfg-name';
  name.setAttribute('dir', 'auto');
  body.appendChild(name);
  const proto = doc.createElement('span');
  proto.className = 'cfg-proto';
  proto.textContent = protoLabel(cfg.protocol);
  body.appendChild(proto);
  row.appendChild(body);

  const actions = doc.createElement('div');
  actions.className = 'cfg-actions';
  actions.appendChild(actionButton(doc, index, 'view', 'btn-outline', false));
  actions.appendChild(actionButton(doc, index, 'copy', 'btn-quiet', true));
  row.appendChild(actions);
  return row;
}

/* Built once: same configurations, same rows. Later paints only relabel. */
function buildList(el, configs) {
  const host = el.configList;
  if (!host || host.firstElementChild) return;
  const doc = el.doc;
  for (let i = 0; i < configs.length; i++) host.appendChild(configRow(doc, configs[i], i));
}

/* Every word the explorer shows, rewritten from the current catalogue. Includes
   the dialog's static labels, so a language change while it is open is caught. */
function relabel(el, i18n, configs) {
  const t = i18n.t;
  setText(el.explorerTitle, t('explorer.title'));
  setText(el.explorerHint, t('explorer.hint'));
  if (el.explorerCount) setText(el.explorerCount, i18n.fmt.number(configs.length, 0));
  setText(el.explorerEmpty, t('explorer.empty'));

  const rows = el.configList ? el.configList.children : [];
  for (let i = 0; i < rows.length && i < configs.length; i++) {
    const cfg = configs[i];
    const name = configName(cfg, i, i18n);
    const nameNode = rows[i].querySelector('.cfg-name');
    setText(nameNode, name);
    /* The row's own searchable text, so the filter never reaches into the DOM. */
    setAttr(rows[i], 'data-search', (name + ' ' + protoLabel(cfg.protocol)).toLowerCase());
    const buttons = rows[i].querySelectorAll('button');
    for (let k = 0; k < buttons.length; k++) {
      if (buttons[k].getAttribute('data-act') === 'view') {
        setText(buttons[k], t('explorer.view'));
        setAttr(buttons[k], 'aria-label', t('explorer.view_for', { name: name }));
      } else {
        setAttr(buttons[k], 'aria-label', t('explorer.copy_for', { name: name }));
        const wrap = buttons[k].firstElementChild;
        if (wrap) {
          setText(wrap.firstElementChild, t('action.copy_short'));
          setText(wrap.lastElementChild, t('action.copied'));
        }
      }
    }
  }

  if (el.search) {
    setAttr(el.search, 'placeholder', t('explorer.search'));
    setAttr(el.search, 'aria-label', t('explorer.search'));
  }

  setText(el.configCopyLabel, t('action.copy_link'));
  setText(el.configCopyDone, t('action.copied'));
  setText(el.configOpenLabel, t('config.open'));
  setText(el.configConfLabel, t('config.conf_label'));
  setText(el.configConfCopy, t('action.copy_short'));
  setText(el.configConfDownloadLabel, t('action.download'));
  setAttr(el.configClose, 'aria-label', t('action.close'));
  setAttr(el.configCanvas, 'aria-label', t('config.alt'));
  setAttr(el.configUrl, 'aria-label', t('config.link_label'));
}

/* Shows or hides the whole section, builds the rows once, relabels them, and
   reveals the search field only when there are enough rows to warrant it.
   Idempotent: safe to call at startup and after every language change. The
   expanded/collapsed and query state persist across relabels (page lifecycle
   only — never stored), so a language switch does not disturb the reader. */
export function renderExplorer(el, i18n, configs) {
  if (!el.configList) return;
  const has = configs.length > 0;
  if (el.explorer) el.explorer.hidden = !has;
  if (!has) return;
  el._configs = configs;
  el._i18n = i18n;
  el._expanded = el._expanded || false;
  el._query = el._query || '';
  buildList(el, configs);
  relabel(el, i18n, configs);
  if (el.searchWrap) el.searchWrap.hidden = configs.length <= SEARCH_THRESHOLD;
  applyRows(el);
}

/* The single place a row's visibility is decided, so search and collapse never
   contradict each other. A non-empty query wins outright: every matching row is
   shown wherever it sits in the list (so a match past the collapse point is
   never hidden), and the empty note appears only on a genuine miss. With no
   query the list shows its first rows until the reader expands it. The query
   does not change the remembered expanded/collapsed state, so clearing it
   restores whatever the reader had. */
function applyRows(el) {
  if (!el.configList) return;
  const rows = el.configList.children;
  const q = el._query || '';
  const searching = q !== '';
  let shown = 0;
  for (let i = 0; i < rows.length; i++) {
    let visible;
    if (searching) {
      visible = (rows[i].getAttribute('data-search') || '').indexOf(q) > -1;
    } else {
      visible = el._expanded || i < COLLAPSE_THRESHOLD;
    }
    rows[i].hidden = !visible;
    if (visible) shown++;
  }
  if (el.explorerEmpty) el.explorerEmpty.hidden = !(searching && shown === 0);

  /* The expand/collapse control, decided in the same pass: hidden while a search
     is active or the list is short enough to show whole, otherwise labelled with
     the number of rows still hidden (interpolated so the count reads naturally in
     every language). */
  const toggle = el.configToggle;
  if (!toggle) return;
  const show = !searching && rows.length > COLLAPSE_THRESHOLD;
  toggle.hidden = !show;
  const expanded = show && !!el._expanded;
  setAttr(toggle, 'aria-expanded', expanded ? 'true' : 'false');
  if (show && el._i18n) {
    setText(el.configToggleLabel, expanded
      ? el._i18n.t('action.show_less')
      : el._i18n.t('explorer.show_more', { n: el._i18n.fmt.number(rows.length - COLLAPSE_THRESHOLD, 0) }));
  }
}

/* Flips the collapsed/expanded state and repaints. Bound to the toggle's click
   in main.js; nothing is persisted, so a reload starts collapsed again. */
export function toggleExplorer(el) {
  el._expanded = !el._expanded;
  applyRows(el);
}

/* Case-insensitive substring filter over the rows' own search text, routed
   through applyRows so search takes precedence over the collapse. */
export function filterConfigs(el, query) {
  if (!el.configList) return;
  el._query = String(query || '').trim().toLowerCase();
  applyRows(el);
}
