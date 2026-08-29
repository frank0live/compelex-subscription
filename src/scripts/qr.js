/* The code is encoded and drawn on the device. Handing a subscription link to a
   QR web service would hand a stranger the credentials it contains, so the
   encoder is bundled instead. */

/* Byte mode with an explicit array: the encoder accepts a plain array only, and
   choosing the mode ourselves keeps the result independent of what the URL
   happens to contain. */
function toBytes(text, win) {
  if (typeof win.TextEncoder === 'function') {
    return Array.from(new win.TextEncoder().encode(text));
  }
  return text; /* The encoder segments the string itself. */
}

export function encodeQr(text, win) {
  try {
    return uqr.encode(toBytes(text, win), { ecc: 'M', boostEcc: false, border: 4 });
  } catch (err) {
    return null;
  }
}

/* Modules are painted at a whole number of device pixels. A fractional module
   edge is the usual reason a code on a high-density screen will not scan. */
export function drawQr(canvas, text, win) {
  const code = encodeQr(text, win);
  if (!code) return false;

  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) return false;

  const ratio = Math.min(3, Math.max(1, Math.round(win.devicePixelRatio || 1)));
  const target = (canvas.clientWidth || 256) * ratio;
  const scale = Math.max(1, Math.floor(target / code.size));
  const side = scale * code.size;

  canvas.width = side;
  canvas.height = side;

  /* Always dark on white, in both themes: a scanner reads contrast, and an
     inverted code is rejected by many client applications. */
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = '#000000';

  for (let row = 0; row < code.size; row++) {
    for (let col = 0; col < code.size; col++) {
      if (code.data[row][col]) ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  return true;
}
