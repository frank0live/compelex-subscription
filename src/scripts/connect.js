/* The Connect card: one tab per platform, and under it the applications whose
 * import route was verified for this project. Nothing here is generated from a
 * pattern — an application appears because a real scheme exists for it, and it
 * appears without an Import button when it has none. */

import { PLATFORMS, clientsFor } from './clients.js';
import { setText, setAttr, empty, subLink } from './render.js';

export function urlsFor(model, win) {
  return {
    sub: subLink(model, win),
    json: model.subJsonUrl,
    clash: model.subClashUrl,
  };
}

function tabId(platform) {
  return 'tab-' + platform;
}

function buildTabs(el, i18n, platform) {
  const doc = el.doc;
  const list = el.tabs;
  if (!list) return;

  if (!list.firstElementChild) {
    for (let i = 0; i < PLATFORMS.length; i++) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'tab';
      button.id = tabId(PLATFORMS[i]);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'client-list');
      button.setAttribute('data-platform', PLATFORMS[i]);
      list.appendChild(button);
    }
  }

  for (let i = 0; i < PLATFORMS.length; i++) {
    const name = PLATFORMS[i];
    const button = doc.getElementById(tabId(name));
    if (!button) continue;
    const on = name === platform;
    setAttr(button, 'aria-selected', on ? 'true' : 'false');
    /* One stop in the tab order for the whole strip; the arrow keys move
       between the tabs from there. */
    setAttr(button, 'tabindex', on ? '0' : '-1');
    setText(button, i18n.t('platform.' + name));
  }
  setAttr(el.clients, 'aria-labelledby', tabId(platform));
}

/* Rows are rebuilt only when the platform or the set of available addresses
   changes, so translating the page does not throw away the list. */
function buildClients(el, i18n, urls, platform) {
  const doc = el.doc;
  const host = el.clients;
  if (!host) return;

  const sig = platform + '|' + urls.sub + '|' + urls.json + '|' + urls.clash;
  if (host._rowSig !== sig) {
    empty(host);
    const found = clientsFor(platform, urls);
    for (let i = 0; i < found.length; i++) {
      host.appendChild(clientRow(doc, found[i]));
    }
    host._rowSig = sig;
    host._rowClients = found;
  }

  const found = host._rowClients || [];
  for (let i = 0; i < found.length; i++) {
    const row = doc.getElementById('client-' + found[i].id);
    if (!row) continue;
    const tag = row.querySelector('.client-tag');
    if (tag) setText(tag, i18n.t('client.paid'));
    const buttons = row.querySelectorAll('button');
    for (let k = 0; k < buttons.length; k++) {
      /* Three rows offer the same two words, so the name each button reads out
         on its own has to carry the application it belongs to. */
      if (buttons[k].getAttribute('data-act') === 'import') {
        setText(buttons[k], i18n.t('action.import'));
        setAttr(buttons[k], 'aria-label', i18n.t('client.import_for', { name: found[i].name }));
        continue;
      }
      setAttr(buttons[k], 'aria-label', i18n.t('client.copy_for', { name: found[i].name }));
      /* Both words are written, never just the visible one: a button relabelled
         while it is confirming a copy must keep confirming it. */
      const swap = buttons[k].firstElementChild;
      if (!swap) continue;
      setText(swap.firstElementChild, i18n.t('action.copy_short'));
      setText(swap.lastElementChild, i18n.t('action.copied'));
    }
  }

  setText(el.connectTitle, i18n.t('connect.title'));
  setText(el.connectHint, i18n.t(found.length ? 'connect.hint' : 'connect.none'));
}

function clientRow(doc, client) {
  const row = doc.createElement('div');
  row.className = 'client';
  row.id = 'client-' + client.id;

  const head = doc.createElement('div');
  head.className = 'client-head';
  const name = doc.createElement('span');
  name.className = 'client-name ltr';
  name.textContent = client.name;
  head.appendChild(name);
  if (client.paid) {
    const tag = doc.createElement('span');
    tag.className = 'client-tag';
    head.appendChild(tag);
  }
  row.appendChild(head);

  const actions = doc.createElement('div');
  actions.className = 'client-actions';
  if (client.importable) {
    actions.appendChild(clientButton(doc, client.id, 'import', 'btn-primary'));
  }
  /* Beside an Import button the copy is the quieter of two; on its own it is the
     only thing the row offers, and an outline keeps it from looking unfinished. */
  actions.appendChild(clientButton(doc, client.id, 'copy', client.importable ? 'btn-quiet' : 'btn-outline'));
  row.appendChild(actions);
  return row;
}

function clientButton(doc, id, act, variant) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm ' + variant;
  button.setAttribute('data-client', id);
  button.setAttribute('data-act', act);
  if (act === 'copy') button.appendChild(labelSwap(doc));
  return button;
}

/* A copy button holds its label and its confirmation together; the stylesheet
   sizes the pair and shows one at a time. */
function labelSwap(doc) {
  const swap = doc.createElement('span');
  swap.className = 'btn-swap';
  const live = doc.createElement('span');
  live.className = 'swap-live';
  swap.appendChild(live);
  const done = doc.createElement('span');
  done.className = 'swap-done';
  swap.appendChild(done);
  return swap;
}

export function renderConnect(el, i18n, urls, platform) {
  buildTabs(el, i18n, platform);
  buildClients(el, i18n, urls, platform);
}

/* Arrow keys move along the strip, and in a right-to-left page the visual
   direction of the arrows is what the reader expects, not the array order. */
export function nextTab(current, key, rtl) {
  const at = PLATFORMS.indexOf(current);
  if (at < 0) return current;
  let step = 0;
  if (key === 'ArrowRight') step = rtl ? -1 : 1;
  else if (key === 'ArrowLeft') step = rtl ? 1 : -1;
  else if (key === 'Home') return PLATFORMS[0];
  else if (key === 'End') return PLATFORMS[PLATFORMS.length - 1];
  else return current;
  const next = (at + step + PLATFORMS.length) % PLATFORMS.length;
  return PLATFORMS[next];
}

