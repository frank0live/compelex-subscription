/* Pure decisions used by the pre-paint boot script. They take their inputs as
   arguments instead of reading the environment, so the same code runs in the
   page and under node:test. */

export const LANGS = ['en', 'fa', 'ar', 'ru', 'zh'];
export const RTL = { fa: 1, ar: 1 };
export const THEME_COLOR = { dark: '#0B0C0E', light: '#F6F7F9' };

/* Language tags are matched on the primary subtag only: pt-BR and pt both mean
   Portuguese, which we do not have, while fa-IR and fa_AF both mean Persian. */
export function matchLang(tag) {
  if (!tag) return null;
  var code = String(tag).toLowerCase().split(/[-_]/)[0];
  return LANGS.indexOf(code) > -1 ? code : null;
}

/* Order: an explicit stored choice, then ?lang= for a shared link, then what
   the browser offers, then English. Only the stored choice is authoritative,
   which is what stops a later automatic decision from overriding the user. */
export function pickLang(saved, asked, offered) {
  var hit = matchLang(saved);
  if (hit) return { lang: hit, explicit: true };

  hit = matchLang(asked);
  if (hit) return { lang: hit, explicit: false };

  var list = offered || [];
  for (var i = 0; i < list.length; i++) {
    hit = matchLang(list[i]);
    if (hit) return { lang: hit, explicit: false };
  }
  return { lang: 'en', explicit: false };
}

export function normalizeMode(value) {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(mode, prefersLight) {
  if (mode === 'light' || mode === 'dark') return mode;
  return prefersLight ? 'light' : 'dark';
}
