/* Every figure on the page is written from here, and from nowhere else.
 *
 * The function is called once on load and again after each successful poll, so
 * it has to be idempotent: same model, same document. It touches only what the
 * model describes. Language, theme, branding, the client list, which tab is
 * selected, the dialog and the scroll position all belong to the shell and are
 * left alone. Every write goes through setText/setAttr, which compare first, so
 * a poll that changes nothing does not disturb the accessibility tree. */

import { health, isOnline, traffic, expiry } from './model.js';
import { bytesText, percentText, barWidth, barLevel, relativeParts } from './format.js';
import { safe, runs, SUPPORT_SCHEMES } from './url.js';

/* Bidi isolates, written as code points because the characters themselves are
   invisible in an editor. Technical values — byte counts, percentages, dates in
   Latin digits — are wrapped in these before being placed inside a translated
   sentence, so an RTL sentence cannot reorder them. */
const ISO_START = String.fromCharCode(0x2066);
const FSI_START = String.fromCharCode(0x2068);
const ISO_END = String.fromCharCode(0x2069);
const DASH = String.fromCharCode(0x2014);

const STATE_KEY = {
  active: 'status.active',
  disabled: 'status.disabled',
  expired: 'status.expired',
  limited: 'status.limited',
};

export function collect(doc) {
  const id = function (name) {
    return doc.getElementById(name);
  };
  return {
    doc: doc,
    brandMark: id('brand-mark'),
    brandName: id('brand-name'),
    langCode: id('lang-code'),
    langMenu: id('lang-menu'),
    langTrigger: id('lang-trigger'),
    themeMenu: id('theme-menu'),
    themeTrigger: id('theme-trigger'),
    themeIcon: id('theme-icon'),
    planSlot: id('plan-slot'),
    statePill: id('state-pill'),
    stateLabel: id('state-label'),
    liveState: id('live-state'),
    statusHeading: id('status-heading'),
    trafficValue: id('traffic-value'),
    trafficCaption: id('traffic-caption'),
    trafficTrailing: id('traffic-trailing'),
    barSlot: id('bar-slot'),
    expiryValue: id('expiry-value'),
    expiryCaption: id('expiry-caption'),
    copyBtn: id('copy-btn'),
    copyLabel: id('copy-btn-label'),
    copyDone: id('copy-btn-done'),
    qrBtn: id('qr-btn'),
    qrLabel: id('qr-btn-label'),
    connect: id('connect'),
    connectTitle: id('connect-title'),
    connectHint: id('connect-hint'),
    tabs: id('platform-tabs'),
    clients: id('client-list'),
    announceSlot: id('announce-slot'),
    supportSlot: id('support-slot'),
    liveRegion: id('live-region'),
    updatedSlot: id('updated-slot'),
    dialog: id('qr-dialog'),
    dialogTitle: id('qr-title'),
    qrClose: id('qr-close'),
    qrCanvas: id('qr-canvas'),
    qrFrame: id('qr-frame'),
    qrHint: id('qr-hint'),
    qrUrl: id('qr-url'),
    qrCopy: id('qr-copy'),
    qrCopyLabel: id('qr-copy-label'),
    qrCopyDone: id('qr-copy-done'),
    toast: id('toast'),
  };
}

export function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

export function setAttr(node, name, value) {
  if (!node) return;
  if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
    return;
  }
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

export function empty(node) {
  if (node && node.firstChild) node.textContent = '';
}

/* A technical value about to be dropped into a translated sentence. */
export function iso(value) {
  return ISO_START + value + ISO_END;
}

/* A *localised* value about to be dropped into a translated sentence: a day
   count or a formatted date carries the language's own words, so its direction
   is the direction of its first letter and not left-to-right. Forcing LTR on
   "45 روز" or on a Jalali date puts the number on the wrong side of the word it
   counts; a first-strong isolate keeps the value whole without deciding for it.
   Use iso() for figures that are Latin in every language, this for the rest. */
export function auto(value) {
  return FSI_START + value + ISO_END;
}

/* A value that fills its own element and must not be reordered: the isolation
   lives on an inline child rather than on the block, so the block keeps the
   paragraph's alignment while the run inside it reads left to right. setText on
   the block would delete that child, so writes come through here instead. */
function isolated(el, host) {
  if (!host) return null;
  let node = host.firstElementChild;
  if (!node) {
    node = el.doc.createElement('span');
    node.className = 'ltr';
    empty(host);
    host.appendChild(node);
  }
  return node;
}

function renderStatus(el, model, state, i18n) {
  const t = i18n.t;
  setAttr(el.statePill, 'data-state', state);
  setText(el.stateLabel, t(STATE_KEY[state] || STATE_KEY.active));
  setText(el.statusHeading, t('status.heading'));

  /* The plan label is the only place the operator's own wording appears in the
     card, so an all-whitespace title has to leave nothing behind. An unbranded
     install borrows the plan title for the heading (there is nothing else to
     put there), and printing the same words again two lines below reads as a
     bug rather than as two facts. */
  const heading = el.brandName ? el.brandName.textContent.trim() : '';
  const title = model.title;
  if (!title || title === heading) {
    empty(el.planSlot);
  } else {
    let node = el.planSlot && el.planSlot.firstElementChild;
    if (!node) {
      node = el.doc.createElement('span');
      node.className = 'plan-label';
      const inner = el.doc.createElement('bdi');
      node.appendChild(inner);
      empty(el.planSlot);
      if (el.planSlot) el.planSlot.appendChild(node);
    }
    setText(node.firstElementChild || node, title);
  }
}

/* Online is a live reading and deliberately weaker than health: a disabled or
   expired subscription with an open connection still reads as disabled, and the
   second line simply says when the account was last seen. The dot is drawn only
   for a live connection, so green cannot appear beside anything but Active, and
   a stopped account that has never connected says nothing at all rather than
   reporting an absence. */
function renderLive(el, model, state, i18n, now) {
  const node = el.liveState;
  if (!node) return;
  const t = i18n.t;
  const online = isOnline(model, state);
  const never = model.lastOnline === null || model.lastOnline <= 0;

  if (!node.firstElementChild) {
    const mark = el.doc.createElement('span');
    mark.className = 'dot';
    mark.setAttribute('aria-hidden', 'true');
    empty(node);
    node.appendChild(mark);
    node.appendChild(el.doc.createElement('span'));
  }
  const dot = node.firstElementChild;
  const label = node.lastElementChild;

  setAttr(node, 'data-online', online ? '1' : '0');
  dot.hidden = !online;
  node.hidden = never && state !== 'active';
  if (node.hidden) {
    setText(label, '');
    return;
  }

  if (online) {
    setText(label, t('online.now'));
    return;
  }
  if (never) {
    setText(label, t('online.never'));
    return;
  }
  /* A clock skewed into the future must not read "in three days". */
  const parts = relativeParts(Math.max(0, now - model.lastOnline), true);
  const when = parts ? i18n.fmt.relative(parts.value, parts.unit) : null;
  setText(label, t('online.seen', { when: when || t('time.just_now') }));
}

/* The bar exists only for the three states that have a real denominator. For
   unlimited or unknown figures it is removed from the document rather than
   drawn empty, so no reader is offered a progress control that means nothing. */
function renderBar(el, info, i18n) {
  const slot = el.barSlot;
  if (!slot) return;
  if (info.pct === null) {
    empty(slot);
    return;
  }

  let row = slot.firstElementChild;
  if (!row) {
    row = el.doc.createElement('div');
    row.className = 'bar-row';
    const track = el.doc.createElement('div');
    track.className = 'bar';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = el.doc.createElement('span');
    fill.className = 'bar-fill';
    track.appendChild(fill);
    const pct = el.doc.createElement('span');
    pct.className = 'bar-pct ltr';
    row.appendChild(track);
    row.appendChild(pct);
    slot.appendChild(row);
  }

  const track = row.firstElementChild;
  const fill = track.firstElementChild;
  const text = percentText(info.pct, i18n.fmt);
  const width = barWidth(info.pct) + '%';

  setAttr(track, 'data-level', barLevel(info.pct));
  setAttr(track, 'aria-label', i18n.t('traffic.bar'));
  setAttr(track, 'aria-valuenow', String(Math.round(barWidth(info.pct))));
  /* A bar announced as "38" says nothing about what was measured, so the value
     text carries the whole sentence. Isolates rather than markup, because this
     is an attribute. */
  setAttr(track, 'aria-valuetext', i18n.t('traffic.progress', {
    pct: iso(text),
    used: iso(bytesText(info.used, i18n.fmt)),
    total: iso(bytesText(info.total, i18n.fmt)),
  }));

  /* The real width is written straight away and the stylesheet grows the fill
     from nothing once, so a document that never gets a frame — a background tab,
     a print — still shows the figure rather than an empty channel. */
  if (fill.style.inlineSize !== width) fill.style.inlineSize = width;
  setText(row.lastElementChild, text);
}

function renderTraffic(el, model, i18n) {
  const t = i18n.t;
  const fmt = i18n.fmt;
  const info = traffic(model);
  const value = isolated(el, el.trafficValue);
  const size = function (bytes) {
    return bytesText(bytes, fmt);
  };

  if (info.kind === 'usage-unknown') {
    setText(value, DASH);
    setText(el.trafficCaption, t('traffic.usage_unknown'));
    setText(el.trafficTrailing, '');
    renderBar(el, info, i18n);
    return;
  }

  setText(value, size(info.used));

  if (info.kind === 'limit-unknown') {
    setText(el.trafficCaption, t('traffic.used'));
    setText(el.trafficTrailing, t('traffic.limit_unknown'));
  } else if (info.kind === 'unlimited') {
    setText(el.trafficCaption, t('traffic.used'));
    setText(el.trafficTrailing, t('traffic.unlimited'));
  } else {
    setText(el.trafficCaption, t('traffic.used_of', { total: iso(size(info.total)) }));
    if (info.kind === 'reached') {
      const over = info.used - info.total;
      setText(el.trafficTrailing, over > 0
        ? t('traffic.over', { size: iso(size(over)) })
        : t('traffic.none_left'));
    } else {
      setText(el.trafficTrailing, t('traffic.remaining', { size: iso(size(info.remaining)) }));
    }
  }
  renderBar(el, info, i18n);
}

/* Six outcomes, and none of them is a date arithmetic accident: an unusable
   timestamp says so in words instead of resolving to 1970. */
function renderExpiry(el, model, i18n, now) {
  const t = i18n.t;
  const fmt = i18n.fmt;
  const info = expiry(model, now);
  const date = info.at ? fmt.date(info.at) : '';
  let level = 'ok';
  let value = DASH;
  let caption = '';

  if (info.kind === 'unknown' || (info.at && !date)) {
    caption = t('expiry.unknown');
  } else if (info.kind === 'never') {
    value = t('expiry.never');
  } else if (info.kind === 'pending') {
    value = t('expiry.pending');
    caption = t('expiry.pending_note', { days: auto(fmt.days(info.days)) });
  } else if (info.kind === 'expired') {
    level = 'over';
    value = t('expiry.expired');
    /* A date alone does not say how long ago, and "3 days ago" alone does not
       say which day; the caption carries both. Under a minute there is no
       relative phrase worth printing, so the date stands on its own. */
    const parts = relativeParts(Math.max(0, now - info.at), false);
    const ago = parts ? fmt.relative(parts.value, parts.unit) : null;
    caption = ago
      ? t('expiry.expired_note', { date: auto(date), ago: auto(ago) })
      : auto(date);
  } else if (info.kind === 'today' || info.kind === 'tomorrow') {
    /* The last day and the one before it: the day is the headline and the
       clock time is what the reader still needs, because "today" says nothing
       about whether that is in twenty minutes or twenty hours. */
    level = 'warn';
    value = t(info.kind === 'today' ? 'expiry.today' : 'expiry.tomorrow');
    const clock = fmt.time(info.at);
    caption = clock ? t('expiry.at', { time: iso(clock) }) : '';
  } else {
    level = info.days <= 3 ? 'warn' : 'ok';
    value = t('expiry.on', { date: auto(date) });
    caption = t('expiry.remaining', { days: auto(fmt.days(info.days)) });
  }

  setAttr(el.expiryValue, 'data-level', level);
  setText(el.expiryValue, value);
  setText(el.expiryCaption, caption);
}

export function svgUse(doc, symbol) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + symbol);
  svg.appendChild(use);
  return svg;
}

/* The operator's announcement is text. It is inserted as text nodes, and the
   only elements ever created around it are anchors for addresses this code
   found itself and checked, so there is no path from the panel field to markup.
   The card is rebuilt only when the text itself changes, which keeps an opened
   "show more" open across a poll. */
function renderAnnounce(el, model, i18n) {
  const slot = el.announceSlot;
  if (!slot) return;
  const doc = el.doc;
  const text = model.announce;

  if (!text) {
    if (slot.firstChild) empty(slot);
    slot._rowText = '';
    slot._rowMore = null;
    slot._rowMeasure = null;
    return;
  }

  if (slot._rowText !== text) {
    empty(slot);
    const card = doc.createElement('section');
    card.className = 'announce';

    const head = doc.createElement('div');
    head.className = 'announce-head';
    head.appendChild(svgUse(doc, 'i-info'));
    const title = doc.createElement('h2');
    title.className = 'section-title';
    head.appendChild(title);
    card.appendChild(head);

    const body = doc.createElement('p');
    body.className = 'announce-text';
    body.setAttribute('dir', 'auto');
    const parts = runs(text);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].href) {
        const link = doc.createElement('a');
        link.setAttribute('href', parts[i].href);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer nofollow');
        link.className = 'ltr';
        link.appendChild(doc.createTextNode(parts[i].text));
        body.appendChild(link);
      } else {
        body.appendChild(doc.createTextNode(parts[i].text));
      }
    }
    card.appendChild(body);

    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'text-link announce-more';
    more.setAttribute('aria-expanded', 'false');
    more.hidden = true;
    more.addEventListener('click', function () {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
      card.setAttribute('data-open', open ? '1' : '0');
      setText(more, i18n.t(open ? 'action.show_less' : 'action.show_more'));
    });
    card.appendChild(more);

    slot.appendChild(card);
    slot._rowText = text;
    slot._rowMore = more;

    /* Whether the text is long enough to need the toggle is a question only
       layout can answer, so it is asked with the card already in the document,
       which is enough for the clamp to have been applied. */
    const measure = function () {
      more.hidden = body.scrollHeight <= body.clientHeight + 2;
    };
    slot._rowMeasure = measure;
    measure();
  }

  const more = slot._rowMore;
  if (more) {
    const open = more.getAttribute('aria-expanded') === 'true';
    setText(more, i18n.t(open ? 'action.show_less' : 'action.show_more'));
    /* Asked again on later paints, because a rotation or a font swap changes the
       answer while the text itself has not. Never while expanded: the clamp is
       lifted there, so the same measurement would hide "Show less". */
    if (!open && slot._rowMeasure) slot._rowMeasure();
  }
  const head = slot.querySelector('.announce-head .section-title');
  setText(head, i18n.t('announce.title'));
}

/* Support is a link the operator typed into the panel, so it is checked before
   it is made clickable, and the whole section is dropped when the scheme is not
   one a browser should be asked to open. The panel field wins over the value
   built into the artifact, because the operator can change it without a
   reinstall. */
function renderSupport(el, model, branding, i18n) {
  const slot = el.supportSlot;
  if (!slot) return;
  const doc = el.doc;
  const raw = model.supportUrl || (branding && branding.supportUrl) || '';
  const href = safe(raw, SUPPORT_SCHEMES);

  if (!href) {
    if (slot.firstChild) empty(slot);
    slot._rowHref = '';
    return;
  }

  if (slot._rowHref !== href) {
    empty(slot);
    const section = doc.createElement('section');
    section.className = 'support';
    const link = doc.createElement('a');
    link.className = 'btn btn-outline support-cta';
    link.id = 'support-link';
    link.setAttribute('href', href);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    const text = doc.createElement('span');
    text.id = 'support-label';
    link.appendChild(text);
    const arrow = svgUse(doc, 'i-external');
    arrow.setAttribute('class', 'icon icon-external');
    link.appendChild(arrow);
    section.appendChild(link);
    slot.appendChild(section);
    slot._rowHref = href;
  }

  /* The arrow glyph is decorative, so the new-tab cue a sighted reader gets from it
     has to be spelled out in the accessible name. It keeps the visible label as its
     prefix, which is what WCAG's label-in-name rule asks for. */
  setText(doc.getElementById('support-label'), i18n.t('support.contact'));
  setAttr(doc.getElementById('support-link'), 'aria-label', i18n.t('support.newtab'));
}

/* The subscription address. An operator can leave the panel field empty, and in
   that case this page's own address is the subscription: it is what the client
   application would be given anyway. */
export function subLink(model, win) {
  if (model.subUrl) return model.subUrl;
  const here = String(win.location.href || '');
  const cut = here.indexOf('#');
  return cut > -1 ? here.slice(0, cut) : here;
}

/* Ticked on its own timer, not by the poller, so "updated a moment ago" ages
   visibly even while the page sits idle. The line closes the status card, and
   stays empty until the first answer so the seam above it never draws. */
export function renderUpdated(el, i18n, at, now) {
  const slot = el.updatedSlot;
  if (!slot) return;
  if (!at || !isFinite(at)) {
    if (slot.firstChild) empty(slot);
    return;
  }
  let node = slot.firstElementChild;
  if (!node) {
    node = el.doc.createElement('time');
    empty(slot);
    slot.appendChild(node);
  }
  setAttr(node, 'datetime', new Date(at).toISOString());
  const parts = relativeParts(Math.max(0, now - at), true);
  const when = parts ? i18n.fmt.relative(parts.value, parts.unit) : null;
  setText(node, i18n.t('footer.updated', { when: when || i18n.t('time.just_now') }));
}

/* What a screen reader is told after a state change: the same words that are on
   screen, in the same order, rather than a second sentence written by hand. */
export function summary(el) {
  const parts = [
    el.stateLabel,
    el.liveState,
    el.trafficValue,
    el.trafficCaption,
    el.expiryValue,
  ];
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const value = parts[i] ? String(parts[i].textContent || '').trim() : '';
    if (value) out.push(value);
  }
  return out.join('. ');
}

export function render(el, model, i18n, now, branding) {
  const state = health(model, now);
  renderStatus(el, model, state, i18n);
  renderLive(el, model, state, i18n, now);
  renderTraffic(el, model, i18n);
  renderExpiry(el, model, i18n, now);
  renderAnnounce(el, model, i18n);
  renderSupport(el, model, branding, i18n);
  return state;
}

