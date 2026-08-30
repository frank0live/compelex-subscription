/* Wiring.
 *
 * Everything with a side effect lives here: the two menus, the theme, the
 * clipboard, the dialog, the client buttons and the poller. The rendering
 * functions stay pure and are called from paint(); this file decides when. */

import { readDocument, normalize } from './model.js';
import { readCatalogues, createI18n } from './i18n.js';
import { collect, render, renderUpdated, summary, setText, setAttr, empty, subLink, svgUse } from './render.js';
import { renderConnect, urlsFor, nextTab } from './connect.js';
import { detectPlatform, sourceUrl, deepLink } from './clients.js';
import { monogram, displayName } from './brand.js';
import { copyText, selectField } from './clipboard.js';
import { drawQr } from './qr.js';
import { createPoller } from './live.js';
import { imageSrc } from './url.js';
import { collectExplorer, readConfigs, renderExplorer, filterConfigs, configName } from './explorer.js';
import { mtprotoWebUrl, amneziaConf } from './config.js';

/* Each language is offered under its own name, which is the same string in
   every catalogue and therefore not a translatable key. */
const LANG_NAMES = { en: 'English', fa: 'فارسی', ar: 'العربية', ru: 'Русский', zh: '中文' };
const THEME_MODES = ['system', 'light', 'dark'];
const THEME_ICON = { system: 'i-auto', light: 'i-sun', dark: 'i-moon' };
const TOAST_MS = 2600;
const TOAST_FADE = 220;
const FLASH_MS = 1400;
const TICK_MS = 10000;

const win = window;
const doc = document;
const row = win.__row || {};
const el = collect(doc);
Object.assign(el, collectExplorer(doc));
const catalogues = readCatalogues(doc);

/* The share links the panel emitted, read once from the DOM and classified.
   They never change after load, so the list is parsed a single time here. */
const configs = readConfigs(doc);

let model = normalize(readDocument(doc));
let lang = row.lang || 'en';
let mode = row.themeMode || 'system';
let i18n = createI18n(catalogues, lang, model.jalali);
let platform = detectPlatform(win.navigator);
let urls = urlsFor(model, win);
let serviceName = '';
let state = '';
let spoken = '';
let lastAt = Date.now();
let stopped = false;
let restoreFocus = null;
let toastTimer = null;
let fadeTimer = null;
let flashNode = null;
let flashIcon = '';
let flashTimer = null;

const media = (function () {
  try {
    return win.matchMedia('(prefers-color-scheme: light)');
  } catch (err) {
    return null;
  }
})();

const canDialog = !!(el.dialog && typeof el.dialog.showModal === 'function');

/* Both dropdowns are the same control: a radio group in a menu, built once and
   relabelled afterwards, so the reader's place in it survives a language
   change. */
function fillMenu(panel, items, current) {
  if (!panel) return;
  if (!panel.firstElementChild) {
    for (let i = 0; i < items.length; i++) {
      const item = doc.createElement('button');
      item.type = 'button';
      item.className = 'menu-item';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('data-value', items[i].value);
      const text = doc.createElement('span');
      text.className = 'menu-label';
      item.appendChild(text);
      const mark = svgUse(doc, 'i-check');
      mark.setAttribute('class', 'icon icon-check');
      item.appendChild(mark);
      panel.appendChild(item);
    }
  }
  const nodes = panel.children;
  for (let i = 0; i < nodes.length && i < items.length; i++) {
    setAttr(nodes[i], 'aria-checked', items[i].value === current ? 'true' : 'false');
    setText(nodes[i].firstElementChild, items[i].label);
  }
}

function createMenu(trigger, panel, onPick) {
  if (!trigger || !panel) return;
  let open = false;

  function setOpen(next) {
    open = next;
    panel.hidden = !next;
    setAttr(trigger, 'aria-expanded', next ? 'true' : 'false');
    if (!next) return;
    const first = panel.querySelector('[aria-checked="true"]') || panel.firstElementChild;
    if (first) first.focus();
  }

  trigger.addEventListener('click', function () {
    setOpen(!open);
  });

  panel.addEventListener('click', function (event) {
    const item = event.target.closest('[data-value]');
    if (!item) return;
    setOpen(false);
    trigger.focus();
    onPick(item.getAttribute('data-value'));
  });

  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const list = Array.prototype.slice.call(panel.children);
    const at = list.indexOf(doc.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = list[(at + step + list.length) % list.length];
    if (next) next.focus();
  });

  /* A tap anywhere else closes it, which is what a menu on a phone has to do. */
  doc.addEventListener('pointerdown', function (event) {
    if (!open || panel.contains(event.target) || trigger.contains(event.target)) return;
    setOpen(false);
  });
}

/* The head script hands these over. Defaults are repeated rather than assumed,
   because a page whose boot script was stripped by a proxy must still work. */
const LANG_ORDER = row.langs || ['en', 'fa', 'ar', 'ru', 'zh'];
const RTL_LANGS = row.rtl || { fa: 1, ar: 1 };

function remember(key, value) {
  if (typeof row.store === 'function') row.store(key, value);
}

function themeFor(next) {
  const light = media ? media.matches : false;
  if (typeof row.resolveTheme === 'function') return row.resolveTheme(next, light);
  return next === 'light' || next === 'dark' ? next : light ? 'light' : 'dark';
}

function langItems() {
  const out = [];
  for (let i = 0; i < LANG_ORDER.length; i++) {
    out.push({ value: LANG_ORDER[i], label: LANG_NAMES[LANG_ORDER[i]] || LANG_ORDER[i] });
  }
  return out;
}

function themeItems() {
  const out = [];
  for (let i = 0; i < THEME_MODES.length; i++) {
    out.push({ value: THEME_MODES[i], label: i18n.t('theme.' + THEME_MODES[i]) });
  }
  return out;
}

/* The mark is the operator's logo when there is one and a monogram when there
   is not, and it is never both. */
function applyBrand() {
  const word = i18n.t('app.subscription');
  serviceName = displayName(row.branding || {}, model, word);
  setText(el.brandName, serviceName);
  setAttr(el.brandName, 'title', serviceName);
  doc.title = serviceName;

  const mark = el.brandMark;
  if (!mark) return;
  const src = imageSrc(row.branding && row.branding.logo);
  if (src) {
    let img = mark.firstElementChild;
    if (!img) {
      img = doc.createElement('img');
      img.className = 'brand-logo';
      img.alt = '';
      empty(mark);
      mark.appendChild(img);
    }
    setAttr(img, 'src', src);
  } else {
    setText(mark, monogram(serviceName, model.title, word));
  }
}

/* Everything whose text comes from the catalogue rather than from the model.
   Called once at startup and again after a language change. */
function applyLabels() {
  const t = i18n.t;
  setText(el.langCode, lang.toUpperCase());
  labelPickers();
  setText(el.copyLabel, t('action.copy'));
  setText(el.copyDone, t('action.copied'));
  setText(el.qrLabel, t('action.qr'));
  setText(el.dialogTitle, t('qr.title'));
  setText(el.qrCopyLabel, t('action.copy_link'));
  setText(el.qrCopyDone, t('action.copied'));
  setAttr(el.qrClose, 'aria-label', t('action.close'));
  setAttr(el.qrCanvas, 'aria-label', t('qr.alt'));
  setAttr(el.qrUrl, 'aria-label', t('qr.field'));
  if (el.qrCanvas && !el.qrCanvas.hidden) setText(el.qrHint, t('qr.hint'));
  fillMenu(el.langMenu, langItems(), lang);
  fillMenu(el.themeMenu, themeItems(), mode);
  applyBrand();
  renderExplorer(el, i18n, configs);
}

/* Both triggers are value pickers and the theme one is icon-only, so the value
   currently chosen belongs in the name and not only inside the open menu. */
function labelPickers() {
  setAttr(el.langTrigger, 'aria-label', i18n.t('lang.label') + ': ' + (LANG_NAMES[lang] || lang));
  setAttr(el.themeTrigger, 'aria-label', i18n.t('theme.label') + ': ' + i18n.t('theme.' + mode));
}

function applyTheme(next) {
  mode = THEME_MODES.indexOf(next) > -1 ? next : 'system';
  remember('row.theme', mode);
  const theme = themeFor(mode);
  doc.documentElement.setAttribute('data-theme', theme);
  const meta = doc.getElementById('meta-theme-color');
  const colors = row.themeColor || {};
  if (meta && colors[theme]) meta.setAttribute('content', colors[theme]);
  const icon = el.themeIcon && el.themeIcon.firstElementChild;
  if (icon) icon.setAttribute('href', '#' + THEME_ICON[mode]);
  fillMenu(el.themeMenu, themeItems(), mode);
  labelPickers();
}

function applyLang(next) {
  lang = LANG_ORDER.indexOf(next) > -1 ? next : 'en';
  remember('row.lang', lang);
  doc.documentElement.setAttribute('lang', lang);
  doc.documentElement.setAttribute('dir', RTL_LANGS[lang] ? 'rtl' : 'ltr');
  i18n = createI18n(catalogues, lang, model.jalali);
  spoken = '';
  applyLabels();
  paint();
}

/* One announcement per real change. Repeating the same sentence after every
   poll would make the page unusable with a screen reader. */
function say(text) {
  if (!text || text === spoken) return;
  spoken = text;
  setText(el.liveRegion, text);
}

function tick() {
  if (stopped) return;
  renderUpdated(el, i18n, lastAt, Date.now());
}

function paint(now) {
  const at = now || Date.now();
  const before = state;
  state = render(el, model, i18n, at, row.branding);
  urls = urlsFor(model, win);
  renderConnect(el, i18n, urls, platform);
  if (el.qrUrl && el.qrUrl.value !== urls.sub) el.qrUrl.value = urls.sub;
  tick();
  /* The first paint is the page loading, which is not news. */
  if (before && before !== state) say(summary(el));
}

/* When the poller gives up, the figures stay: they were rendered by the server
   and are still the last thing known. Only the footer changes, and it offers a
   retry when retrying could plausibly help. */
function showStopped(reason) {
  stopped = true;
  const slot = el.updatedSlot;
  if (!slot) return;
  empty(slot);
  setAttr(slot, 'data-stale', null);
  slot.appendChild(doc.createTextNode(i18n.t(reason === 'unsupported' ? 'footer.static' : 'footer.stopped')));

  if (reason !== 'unsupported') {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'text-link';
    button.textContent = i18n.t('action.refresh');
    button.addEventListener('click', function () {
      stopped = false;
      empty(slot);
      poller.resume();
    });
    slot.appendChild(doc.createTextNode(' '));
    slot.appendChild(button);
  }
}

/* Success is reported on the control that was pressed. Its label and its
   confirmation share a grid cell, so the button was already laid out at the
   width of the longer word and nothing beside it moves; a filled button also
   swaps its icon for a tick, which the flat ones say with colour instead. */
function flash(button) {
  if (!button || !button.querySelector('.btn-swap')) return false;
  endFlash();
  const use = button.querySelector('use');
  if (use) {
    flashIcon = use.getAttribute('href') || '';
    use.setAttribute('href', '#i-check');
  }
  button.setAttribute('data-flash', '1');
  flashNode = button;
  flashTimer = win.setTimeout(endFlash, FLASH_MS);
  return true;
}

function endFlash() {
  if (flashTimer) win.clearTimeout(flashTimer);
  flashTimer = null;
  const button = flashNode;
  flashNode = null;
  if (!button) return;
  button.removeAttribute('data-flash');
  const use = button.querySelector('use');
  if (use && flashIcon) use.setAttribute('href', flashIcon);
  flashIcon = '';
}

function toast(text) {
  const node = el.toast;
  if (!node) return;
  if (fadeTimer) win.clearTimeout(fadeTimer);
  if (toastTimer) win.clearTimeout(toastTimer);
  setText(node, text);
  node.hidden = false;
  /* The element was display:none a moment ago, so the closed state needs a frame
     of its own before the open one has anything to move from. */
  if (typeof win.requestAnimationFrame === 'function') {
    win.requestAnimationFrame(function () {
      node.setAttribute('data-show', '1');
    });
  } else {
    node.setAttribute('data-show', '1');
  }
  toastTimer = win.setTimeout(function () {
    node.removeAttribute('data-show');
    fadeTimer = win.setTimeout(function () {
      node.hidden = true;
    }, TOAST_FADE);
  }, TOAST_MS);
  say(text);
}

/* Three outcomes. "manual" means the browser refused, so the address is put in
   front of the reader already selected — in the dialog the caller names through
   onManual, or the subscription dialog when there is none. */
function copyValue(value, button, onManual) {
  copyText(value, doc, win).then(function (how) {
    if (how !== 'manual') {
      /* The toast is left for what a button cannot say in place. */
      if (flash(button)) say(i18n.t('copy.done'));
      else toast(i18n.t('copy.done'));
      return;
    }
    if (typeof onManual === 'function') {
      onManual();
      toast(i18n.t('copy.manual'));
      return;
    }
    if (canDialog) {
      openQr(true);
      toast(i18n.t('copy.manual'));
      return;
    }
    toast(i18n.t('copy.failed'));
  });
}

/* The code is drawn after the dialog is open, because its size is decided by
   the width the layout gives it. */
function openQr(select) {
  if (!canDialog) return;
  restoreFocus = doc.activeElement;
  const link = subLink(model, win);
  if (el.qrUrl && el.qrUrl.value !== link) el.qrUrl.value = link;
  el.dialog.showModal();
  const ok = drawQr(el.qrCanvas, link, win);
  if (el.qrCanvas) el.qrCanvas.hidden = !ok;
  setText(el.qrHint, i18n.t(ok ? 'qr.hint' : 'qr.failed'));
  if (select) selectField(el.qrUrl);
}

/* The detail dialog for one configuration. Its raw link is written into the
   read-only field and drawn as a QR only now, when the reader has asked to see
   it; the list itself never exposes the credential. A Telegram proxy gets its
   one-tap web form as the QR and an "Open in Telegram" link; AmneziaWG reveals
   its decoded .conf so a WireGuard client can use it too. */
const CONFIG_HINT = {
  mtproto: 'config.telegram_hint',
  amneziawg: 'config.awg_hint',
  wireguard: 'config.wg_hint',
};

function openConfig(cfg, index) {
  if (!canDialog || !el.configDialog || !cfg) return;
  restoreFocus = doc.activeElement;

  setText(el.configTitle, configName(cfg, index, i18n));
  if (el.configUrl) el.configUrl.value = cfg.raw;

  const web = cfg.protocol === 'mtproto' ? mtprotoWebUrl(cfg.raw) : '';
  if (el.configOpen) {
    setAttr(el.configOpen, 'href', web || null);
    el.configOpen.hidden = !web;
  }

  if (el.configConf) {
    const conf = cfg.protocol === 'amneziawg' ? amneziaConf(cfg.raw) : '';
    if (el.configConfText) el.configConfText.value = conf;
    el.configConf.hidden = !conf;
  }

  el.configDialog.showModal();
  const ok = drawQr(el.configCanvas, web || cfg.raw, win);
  if (el.configCanvas) el.configCanvas.hidden = !ok;
  setText(el.configHint, i18n.t(ok ? (CONFIG_HINT[cfg.protocol] || 'config.hint') : 'qr.failed'));
}

function selectPlatform(next) {
  platform = next;
  renderConnect(el, i18n, urls, platform);
}

const poller = createPoller({
  win: win,
  doc: doc,
  isActive: function () {
    return state === 'active';
  },
  onData: function (data, at) {
    const next = normalize(data);
    const calendar = next.jalali !== model.jalali;
    model = next;
    if (calendar) i18n = createI18n(catalogues, lang, model.jalali);
    lastAt = at;
    stopped = false;
    setAttr(el.updatedSlot, 'data-stale', null);
    paint(at);
  },
  /* One missed reading is normal on a mobile connection; two is worth showing,
     quietly, without touching the figures. */
  onTrouble: function (failures) {
    if (failures >= 2) setAttr(el.updatedSlot, 'data-stale', '1');
  },
  onStop: function (reason) {
    showStopped(reason);
  },
});

function wire() {
  createMenu(el.langTrigger, el.langMenu, applyLang);
  createMenu(el.themeTrigger, el.themeMenu, applyTheme);

  if (media && typeof media.addEventListener === 'function') {
    media.addEventListener('change', function () {
      if (mode === 'system') applyTheme('system');
    });
  }

  if (el.copyBtn) {
    el.copyBtn.addEventListener('click', function () {
      copyValue(subLink(model, win), el.copyBtn);
    });
  }
  if (el.qrBtn) {
    if (!canDialog) el.qrBtn.hidden = true;
    el.qrBtn.addEventListener('click', function () {
      openQr(false);
    });
  }
  if (el.qrClose) {
    el.qrClose.addEventListener('click', function () {
      el.dialog.close();
    });
  }
  if (el.qrCopy) {
    el.qrCopy.addEventListener('click', function () {
      copyValue(el.qrUrl ? el.qrUrl.value : subLink(model, win), el.qrCopy);
    });
  }
  if (el.qrUrl) {
    el.qrUrl.addEventListener('focus', function () {
      selectField(el.qrUrl);
    });
  }
  if (canDialog) {
    /* Escape and the backdrop both close it, and focus goes back to whatever
       opened it. */
    el.dialog.addEventListener('click', function (event) {
      if (event.target === el.dialog) el.dialog.close();
    });
    el.dialog.addEventListener('close', function () {
      if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus();
      restoreFocus = null;
    });
  }

  if (el.tabs) {
    el.tabs.addEventListener('click', function (event) {
      const tab = event.target.closest ? event.target.closest('[data-platform]') : null;
      if (!tab) return;
      selectPlatform(tab.getAttribute('data-platform'));
    });
    el.tabs.addEventListener('keydown', function (event) {
      const next = nextTab(platform, event.key, !!RTL_LANGS[lang]);
      if (next === platform) return;
      event.preventDefault();
      selectPlatform(next);
      const tab = doc.getElementById('tab-' + next);
      if (tab) tab.focus();
    });
  }

  if (el.clients) {
    el.clients.addEventListener('click', onClientClick);
  }

  if (el.configList) {
    el.configList.addEventListener('click', onConfigClick);
  }
  if (el.search) {
    el.search.addEventListener('input', function () {
      filterConfigs(el, el.search.value);
    });
  }
  if (el.configClose) {
    el.configClose.addEventListener('click', function () {
      el.configDialog.close();
    });
  }
  if (el.configCopy) {
    el.configCopy.addEventListener('click', function () {
      copyValue(el.configUrl ? el.configUrl.value : '', el.configCopy, function () {
        selectField(el.configUrl);
      });
    });
  }
  if (el.configConfCopy) {
    el.configConfCopy.addEventListener('click', function () {
      copyValue(el.configConfText ? el.configConfText.value : '', el.configConfCopy, function () {
        selectField(el.configConfText);
      });
    });
  }
  if (el.configUrl) {
    el.configUrl.addEventListener('focus', function () {
      selectField(el.configUrl);
    });
  }
  if (canDialog && el.configDialog) {
    el.configDialog.addEventListener('click', function (event) {
      if (event.target === el.configDialog) el.configDialog.close();
    });
    el.configDialog.addEventListener('close', function () {
      if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus();
      restoreFocus = null;
    });
  }
}

/* View opens the detail dialog; Copy puts the raw link on the clipboard, and if
   the browser refuses it falls back to the dialog with the link selected. */
function onConfigClick(event) {
  const button = event.target.closest ? event.target.closest('[data-act]') : null;
  if (!button) return;
  const index = Number(button.getAttribute('data-index'));
  const cfg = configs[index];
  if (!cfg) return;
  if (button.getAttribute('data-act') === 'view') {
    openConfig(cfg, index);
    return;
  }
  copyValue(cfg.raw, button, function () {
    openConfig(cfg, index);
    selectField(el.configUrl);
  });
}

/* Import is attempted, and copying is what happens when it cannot be. The
   address is built at the moment of the click and never written into the
   document, so a client with no verified scheme simply copies instead. */
function onClientClick(event) {
  const button = event.target.closest ? event.target.closest('[data-client]') : null;
  if (!button) return;
  const id = button.getAttribute('data-client');
  const link = button.getAttribute('data-act') === 'import'
    ? deepLink(id, urls, serviceName, win)
    : null;

  if (!link) {
    copyValue(sourceUrl(id, urls) || subLink(model, win), button);
    return;
  }
  /* A scheme with no application registered for it does nothing visible, so the
     reader is told what was expected to happen. */
  try {
    win.location.href = link;
    toast(i18n.t('client.opening'));
  } catch (err) {
    copyValue(sourceUrl(id, urls) || subLink(model, win), button);
  }
}

applyTheme(mode);
applyLabels();
paint();
wire();
poller.start();
win.setInterval(tick, TICK_MS);

