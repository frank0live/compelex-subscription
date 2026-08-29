/* Copying the link is the one action this page must not fail at, and it has to
   work on plain HTTP, where navigator.clipboard does not exist at all. Three
   tiers, in order of how little they ask of the browser; the last one asks the
   reader to press the shortcut and is still a defined outcome, not a dead end. */

export function copyText(value, doc, win) {
  if (typeof value !== 'string' || value === '') return Promise.resolve('manual');

  const nav = win.navigator;
  if (win.isSecureContext && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    return nav.clipboard.writeText(value).then(
      function () {
        return 'clipboard';
      },
      function () {
        return legacyCopy(value, doc);
      },
    );
  }
  return Promise.resolve(legacyCopy(value, doc));
}

/* A visible-but-transparent textarea: execCommand refuses to copy from an
   element the browser considers hidden. */
function legacyCopy(value, doc) {
  const area = doc.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.setAttribute('tabindex', '-1');
  area.style.position = 'fixed';
  area.style.insetBlockStart = '0';
  area.style.insetInlineStart = '0';
  area.style.opacity = '0';
  area.style.blockSize = '1em';
  doc.body.appendChild(area);

  let copied = false;
  try {
    selectField(area);
    copied = doc.execCommand('copy');
  } catch (err) {
    copied = false;
  }
  area.remove();
  return copied ? 'legacy' : 'manual';
}

export function selectField(input) {
  try {
    input.focus({ preventScroll: true });
    input.setSelectionRange(0, String(input.value).length);
  } catch (err) {
    /* A field that cannot be selected leaves the reader with the visible URL. */
  }
}
