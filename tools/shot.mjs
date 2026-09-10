#!/usr/bin/env node
/* Local visual-evidence tool for template work. It drives a headless Chromium
 * over the DevTools protocol — node built-ins only, the native WebSocket is
 * the one client — and captures the fixture server's rendered pages as PNGs.
 *
 * This is development tooling: nothing here is reachable from the shipped
 * artifact, whose production form has no template query override.
 *
 *   1. serve fixtures:   go -C tools/fixtures run . -serve 127.0.0.1:8787
 *   2. capture evidence: node tools/shot.mjs [outDir] [baseURL] [template]
 *
 * The captured set covers the review matrix: desktop light/dark, mobile 390,
 * Persian RTL, the explorer expanded, both dialogs, and the long-content
 * torture case. Output is untracked (build/preview by default).
 */

import { spawn } from 'node:child_process';
import { accessSync, constants, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? join('build', 'preview');
const BASE = process.argv[3] ?? 'http://127.0.0.1:8787';
const TEMPLATE = process.argv[4] ?? 'editorial';

const CANDIDATES = [
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const BIN = CANDIDATES.find((p) => {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
});
if (!BIN) {
  process.stderr.write('shot: no Chromium found; set CHROME_BIN\n');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'row-shot-'));
const proc = spawn(BIN, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1440,900',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buffer = '';
  const timer = setTimeout(() => reject(new Error('chrome did not expose a DevTools port')), 15000);
  proc.stderr.on('data', (chunk) => {
    buffer += String(chunk);
    const hit = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (hit) {
      clearTimeout(timer);
      resolve(hit[1]);
    }
  });
  proc.on('exit', () => reject(new Error('chrome exited during startup')));
});

/* A CDP session over one page target: send() with id matching, and a small
   event waiter for load. */
const browserHttp = wsUrl.replace(/^ws:\/\/([^/]+)\/.*$/, 'http://$1');
const target = await (await fetch(`${browserHttp}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error('could not attach to the page target'));
});

let nextId = 0;
const pending = new Map();
const events = [];
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
    return;
  }
  if (data.method) events.push(data);
};

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function waitEvent(method, timeoutMs = 20000) {
  const at = events.length;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = events.slice(at).find((e) => e.method === method);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${method}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
}

async function settle(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/* One capture against the FIXTURE server. width/height set the viewport at 2x
   for crisp evidence; `act` may click or restyle before the frame is taken. */
async function shot(name, { width = 1440, height = 900, mobile = false, page = '00-showcase', theme = 'dark', lang = null, act = null, wait = 900 } = {}) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile,
  });
  const query = new URLSearchParams({ template: TEMPLATE });
  if (lang) query.set('lang', lang);
  const url = `${BASE}/f/${page}?${query}`;
  await navigateShot(name, url, { theme, act, wait });
}

/* One capture against a REAL served page (VPS validation, directive section
   13): an actual subscription page URL, typically through an SSH tunnel, at
   every validated width and language in both themes.

     node tools/shot.mjs build/preview-vps unused --page-url "http://127.0.0.1:8799/sub/…" */
async function pageShot(name, url, { width = 1440, height = 900, mobile = false, theme = 'dark', lang = null, act = null, wait = 900 } = {}) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile,
  });
  const sep = url.includes('?') ? '&' : '?';
  await navigateShot(name, `${url}${sep}lang=${lang ?? 'en'}`, { theme, act, wait });
}

async function navigateShot(name, url, { theme, act, wait }) {
  await send('Page.navigate', { url });
  await waitEvent('Page.loadEventFired');
  /* The theme choice lives in localStorage and would bleed from one capture
     into the next, so every shot states its theme explicitly. */
  await evaluate(`localStorage.setItem('row.theme', ${JSON.stringify(theme)}); location.reload();`);
  await waitEvent('Page.loadEventFired');
  if (act) await evaluate(act);
  await settle(wait);
  const png = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(png.data, 'base64'));
  process.stdout.write(`  ${name}.png\n`);
}

try {
  mkdirSync(OUT, { recursive: true });
  await send('Page.enable');
  await send('Runtime.enable');

  if (process.argv.includes('--page-url')) {
    const url = process.argv[process.argv.indexOf('--page-url') + 1];
    if (!url) throw new Error('--page-url needs a subscription page URL');
    for (const width of [320, 360, 390, 430]) {
      await pageShot(`vps-mobile-${width}-dark`, url, { width, height: 844, mobile: true });
      await pageShot(`vps-mobile-${width}-light`, url, { width, height: 844, mobile: true, theme: 'light' });
    }
    for (const width of [768, 1024, 1440]) {
      await pageShot(`vps-desktop-${width}-dark`, url, { width, height: 900 });
      await pageShot(`vps-desktop-${width}-light`, url, { width, height: 900, theme: 'light' });
    }
    for (const lang of ['fa', 'ar', 'ru', 'zh']) {
      await pageShot(`vps-${lang}-390`, url, { width: 390, height: 844, mobile: true, lang });
      await pageShot(`vps-${lang}-1440`, url, { width: 1440, height: 900, lang });
    }
    await pageShot('vps-config-dialog', url, { act: "document.querySelector('.cfg [data-act=view]')?.click()" });
    await pageShot('vps-explorer-expanded', url, { act: "document.getElementById('config-toggle')?.click(); document.getElementById('explorer')?.scrollIntoView();" });
  } else {
    await shot('editorial-desktop-dark');
    await shot('editorial-desktop-light', { theme: 'light' });
    await shot('editorial-mobile-390', { width: 390, height: 844, mobile: true });
    await shot('editorial-mobile-390-light', { width: 390, height: 844, mobile: true, theme: 'light' });
    await shot('editorial-persian-rtl-390', { width: 390, height: 844, mobile: true, page: '14-persian', lang: 'fa' });
    await shot('editorial-arabic-rtl-390', { width: 390, height: 844, mobile: true, page: '15-arabic', lang: 'ar' });
    await shot('editorial-explorer-expanded', { page: '27-explorer-fifty', act: "document.getElementById('config-toggle').click(); document.getElementById('explorer').scrollIntoView();" });
    await shot('editorial-config-dialog', { page: '21-explorer-all-protocols', act: "document.querySelector('.cfg [data-act=view]').click()" });
    await shot('editorial-qr-dialog', { act: "document.getElementById('qr-btn').click()" });
    await shot('editorial-long-content-390', { width: 390, height: 844, mobile: true, page: '13-long-service-name' });
    await shot('editorial-explorer-long-390', { width: 390, height: 844, mobile: true, page: '29-explorer-long-names', act: "document.getElementById('explorer').scrollIntoView()" });
  }
  process.stdout.write(`captured into ${OUT}\n`);
} finally {
  ws.close();
  proc.kill();
  await settle(300);
  rmSync(profile, { recursive: true, force: true });
}

