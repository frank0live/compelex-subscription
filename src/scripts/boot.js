/* Runs in <head> before the first paint. Its only job is to settle the three
   things that would otherwise flash: theme, language and direction. It also
   carries the branding block, which the installer rewrites in place. */
import { LANGS, RTL, THEME_COLOR, matchLang, pickLang, normalizeMode, resolveTheme } from './detect.js';

/* row:branding */
var BRANDING = {
  serviceName: '',
  supportUrl: '',
  logo: ''
};
/* row:branding end */

function stored(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    /* Private browsing or a full quota: the choice is simply not remembered. */
  }
}

function prefersLight() {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch (err) {
    return false; /* No matchMedia: dark is the documented default. */
  }
}

function askedLang() {
  try {
    return new URLSearchParams(location.search).get('lang');
  } catch (err) {
    return null;
  }
}

var offered = navigator.languages && navigator.languages.length
  ? navigator.languages
  : [navigator.language];

var mode = normalizeMode(stored('row.theme'));
var theme = resolveTheme(mode, prefersLight());
var picked = pickLang(stored('row.lang'), askedLang(), offered);

var root = document.documentElement;
root.setAttribute('data-theme', theme);
root.setAttribute('data-js', '1');
root.setAttribute('lang', picked.lang);
root.setAttribute('dir', RTL[picked.lang] ? 'rtl' : 'ltr');

var themeMeta = document.getElementById('meta-theme-color');
if (themeMeta) themeMeta.setAttribute('content', THEME_COLOR[theme]);

if (BRANDING.serviceName) document.title = BRANDING.serviceName;

/* The application script is a separate scope, so what it needs is handed over
   explicitly rather than recomputed there. */
window.__row = {
  branding: BRANDING,
  langs: LANGS,
  rtl: RTL,
  themeColor: THEME_COLOR,
  themeMode: mode,
  theme: theme,
  lang: picked.lang,
  langExplicit: picked.explicit,
  matchLang: matchLang,
  resolveTheme: resolveTheme,
  prefersLight: prefersLight,
  store: store
};
