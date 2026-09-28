/* The Connect card: one tab per platform, and under it the applications whose
 * import route was verified for this project. Nothing here is generated from a
 * pattern — an application appears because a real scheme exists for it, and it
 * appears without an Import button when it has none.
 *
 * When the panel sends its own application list (PasarGuard, apps.js), the tabs
 * are the platforms that list covers and the rows are its applications. */

import { PLATFORMS, clientsFor } from './clients.js';
import { appPlatforms, appsFor, describe, downloadFor } from './apps.js';
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

/* The platforms the card offers: the panel's list decides when there is one. */
export function platformsFor(apps) {
  return apps && apps.length ? appPlatforms(apps) : PLATFORMS;
}

function buildTabs(el, i18n, platform, platforms) {
  const doc = el.doc;
  const list = el.tabs;
  if (!list) return;

  if (!list.firstElementChild) {
    for (let i = 0; i < platforms.length; i++) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'tab';
      button.id = tabId(platforms[i]);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'client-list');
      button.setAttribute('data-platform', platforms[i]);
      list.appendChild(button);
    }
  }

  for (let i = 0; i < platforms.length; i++) {
    const name = platforms[i];
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

/* The panel's own applications for one platform. Rows are rebuilt when the
   platform or the language changes, because the description and the download
   link are chosen for the reader's language. */
function buildApps(el, i18n, platform, apps) {
  const doc = el.doc;
  const host = el.clients;
  if (!host) return;

  const sig = 'apps|' + platform + '|' + i18n.lang;
  if (host._rowSig !== sig) {
    empty(host);
    const found = appsFor(platform, apps);
    for (let i = 0; i < found.length; i++) {
      host.appendChild(appRow(doc, i18n, found[i].app, found[i].index));
    }
    host._rowSig = sig;
    host._rowClients = found;
  }

  const found = host._rowClients || [];
  for (let i = 0; i < found.length; i++) {
    const row = doc.getElementById('app-' + found[i].index);
    if (!row) continue;
    const name = found[i].app.name;
    const tag = row.querySelector('.client-tag');
    if (tag) setText(tag, i18n.t('client.recommended'));
    const actions = row.querySelectorAll('[data-act]');
    for (let k = 0; k < actions.length; k++) {
      const act = actions[k].getAttribute('data-act');
      if (act === 'import') {
        setText(actions[k], i18n.t('action.import'));
        setAttr(actions[k], 'aria-label', i18n.t('client.import_for', { name: name }));
      } else if (act === 'download') {
        setText(actions[k], i18n.t('action.download'));
        setAttr(actions[k], 'aria-label', i18n.t('client.download_for', { name: name }));
      } else {
        setAttr(actions[k], 'aria-label', i18n.t('client.copy_for', { name: name }));
        const swap = actions[k].firstElementChild;
        if (!swap) continue;
        setText(swap.firstElementChild, i18n.t('action.copy_short'));
        setText(swap.lastElementChild, i18n.t('action.copied'));
      }
    }
  }

  setText(el.connectTitle, i18n.t('connect.title'));
  setText(el.connectHint, i18n.t(found.length ? 'connect.hint' : 'connect.none'));
}

/* The same row the built-in catalogue draws -- the name, and Import and Copy
   -- plus the operator's description and a download link under the name. The
   download is a text link rather than a third button: every template sizes
   its rows for two, and it is a plain link to a web page, opened in a new tab.
   The icon the panel names is never loaded. */
function appRow(doc, i18n, app, index) {
  const row = doc.createElement('div');
  row.className = 'client';
  row.id = 'app-' + index;

  const head = doc.createElement('div');
  head.className = 'client-head';
  /* The operator's own words, in any script: each is isolated in a <bdi>, so a
     Latin name keeps its own direction on a Persian page while the row still
     lines up with the reading side, as the description under it does. */
  const name = doc.createElement('span');
  name.className = 'client-name';
  name.appendChild(appText(doc, app.name));
  head.appendChild(name);
  if (app.recommended) {
    const tag = doc.createElement('span');
    tag.className = 'client-tag';
    head.appendChild(tag);
  }
  const text = describe(app, i18n.lang);
  if (text) {
    const desc = doc.createElement('span');
    desc.className = 'client-desc';
    desc.appendChild(appText(doc, text));
    head.appendChild(desc);
  }
  const dl = downloadFor(app, i18n.lang);
  if (dl) {
    const a = doc.createElement('a');
    a.className = 'text-link client-dl';
    a.setAttribute('href', dl.url);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer nofollow');
    a.setAttribute('data-act', 'download');
    if (dl.name) a.setAttribute('title', dl.name);
    head.appendChild(a);
  }
  row.appendChild(head);

  const actions = doc.createElement('div');
  actions.className = 'client-actions';
  if (app.link) actions.appendChild(appButton(doc, index, 'import', 'btn-primary'));
  const copy = appButton(doc, index, 'copy', app.link ? 'btn-quiet' : 'btn-outline');
  copy.appendChild(labelSwap(doc));
  actions.appendChild(copy);
  row.appendChild(actions);
  return row;
}

function appText(doc, text) {
  const bdi = doc.createElement('bdi');
  bdi.textContent = text;
  return bdi;
}

function appButton(doc, index, act, variant) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm ' + variant;
  button.setAttribute('data-app', String(index));
  button.setAttribute('data-act', act);
  return button;
}

export function renderConnect(el, i18n, urls, platform, apps) {
  const platforms = platformsFor(apps);
  buildTabs(el, i18n, platform, platforms);
  if (apps && apps.length) buildApps(el, i18n, platform, apps);
  else buildClients(el, i18n, urls, platform);
}

/* Arrow keys move along the strip, and in a right-to-left page the visual
   direction of the arrows is what the reader expects, not the array order. */
export function nextTab(current, key, rtl, platforms) {
  const list = platforms || PLATFORMS;
  const at = list.indexOf(current);
  if (at < 0) return current;
  let step = 0;
  if (key === 'ArrowRight') step = rtl ? -1 : 1;
  else if (key === 'ArrowLeft') step = rtl ? 1 : -1;
  else if (key === 'Home') return list[0];
  else if (key === 'End') return list[list.length - 1];
  else return current;
  const next = (at + step + list.length) % list.length;
  return list[next];
}

