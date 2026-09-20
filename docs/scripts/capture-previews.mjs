#!/usr/bin/env node
/**
 * Capture real preview screenshots for the fifteen core templates.
 *
 * ARCHITECTURE
 *   The previews come from the project's OWN fixture preview server — the one the
 *   root package.json already exposes as `npm run preview`. That server renders
 *   each template's frozen artifact with a real fixture's data, so what is
 *   captured is genuine product output, not a reconstruction.
 *
 *   The server is started with `go run`, which compiles into Go's build cache and
 *   a temp directory. Nothing is written anywhere inside the repository.
 *
 *   The browser is the installed Chrome, driven over the DevTools Protocol. That
 *   needs NO new dependency at all — no Playwright, no Puppeteer.
 *
 * HARNESS CHROME REMOVAL
 *   The fixture server injects a development-only control bar (`#row-dev`, a fixed
 *   strip at the bottom) plus a `body { padding-block-end: 46px !important }` rule
 *   that reserves room for it. Neither belongs in a documentation screenshot.
 *
 *   Both are undone at capture time, AFTER load, by appending one override style
 *   as the last stylesheet in the document. Order matters: the fixture's own rule
 *   also uses `!important`, so the override must come later to win. The capture is
 *   refused unless the bar is verifiably gone.
 *
 *   Nothing in tools/, in the fixtures, or in the product is modified.
 *
 * DETERMINISM
 *   `?format=info` polling is blocked, so live status can never change a capture
 *   mid-render. Reduced motion is emulated, so no transition is caught half-way.
 *   Readiness is DOM complete -> fonts settled -> two animation frames.
 *
 *   Both clocks are pinned to REFERENCE_UNIX. The fixture derives its expiry
 *   from the wall clock, and the page derives its expiry caption from the
 *   reader's clock, so without pinning both, every capture taken on a different
 *   day differs from the last one even though nothing in the product changed.
 *   See REFERENCE_UNIX below for how the instant was derived.
 *
 *   All fifteen artifacts are rebuilt before the browser starts, and each one is
 *   checked to be newer than src/. Row is served from template/index.html and the
 *   other fourteen from dist/templates/**, which `npm run build` does not write,
 *   so without this preflight a capture would photograph fourteen stale designs
 *   and report success.
 *
 * OUTPUT
 *   docs/public/previews/<id>-desktop.webp   1440 x 1000
 *   docs/public/previews/<id>-mobile.webp     390 x  844
 *   docs/public/previews/manifest.json       with a sha256 per entry
 *
 * USAGE
 *   cd docs && npm run previews
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, "..");
const ROOT = join(DOCS, "..");
const OUT = join(DOCS, "public", "previews");

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE = "00-showcase";
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

/* The instant the fixture is generated from, and the instant the browser is
 * told it is.
 *
 * Two clocks decide a preview, not one. The fixture renders `expire` as
 * `now + 45 days`; the page then renders that value as a calendar date AND as a
 * whole-days caption ("45 days remaining") computed from the *reader's* day —
 * `dayIndex(expire) - dayIndex(Date.now())`. A capture taken tomorrow therefore
 * differs from one taken today even with the product untouched: the whole
 * preview set appears to change for no reason and no baseline can be
 * reproduced. Both clocks are pinned to this instant — the fixture server
 * through ROW_FIXTURE_NOW, the browser through the clock shim installed below.
 *
 * Derived from the committed image, not guessed. `git show
 * HEAD:docs/public/previews/row-desktop.webp` reads "Expires Nov 2, 2026" and
 * "45 days remaining". The fixture's arithmetic is `expire = now + 45d`, and a
 * caption of exactly 45 days is only reachable when the page's own day and the
 * expiry day are 45 apart — so this instant has to be 2026-09-18 in the local
 * zone, which puts the expiry on 2026-11-02, the date the baseline shows.
 * (Both facts together also prove a fixture pin alone cannot be enough: on
 * 2026-09-20 an expiry of Nov 2 renders "43 days remaining" and 45 days forces
 * the expiry to Nov 4. Only pinning the reader's clock satisfies both.)
 *
 * 12:00 UTC, so that every offset from UTC-12 to UTC+11 renders the same
 * calendar date: the page formats dates with the runtime's local zone, and a
 * reference near a date boundary would make the committed screenshot depend on
 * the machine that took it. */
const REFERENCE_UNIX = 1789732800; // 2026-09-18T12:00:00Z → expire 2026-11-02

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { templateIds } = await import(pathToFileURL(join(ROOT, "tools", "templates.mjs")).href);
const IDS = templateIds();
if (IDS.length !== 15) { console.error(`expected 15 templates, registry reports ${IDS.length}`); process.exit(1); }

// ── preflight: build every artifact, then prove the tree is fresh ───────────
//
// The preview server serves Row from the committed template/index.html and the
// other fourteen from dist/templates/**, but `npm run build` builds Row alone.
// Capturing without an all-template build therefore photographs fourteen stale
// designs and reports success. The official command does the build itself, so
// the prerequisite cannot be forgotten by whoever runs it.
console.log("building all 15 artifacts …");
const built = spawnSync("node", [join("tools", "build.mjs"), "--all", "--quiet"], {
  cwd: ROOT, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32",
});
if (built.error) { console.error(`could not run tools/build.mjs: ${built.error.message}`); process.exit(1); }
if (built.status !== 0) { console.error(`tools/build.mjs --all exited ${built.status}`); process.exit(1); }

/* Building is not the same as having built. Compare every artifact we are about
   to photograph against the newest source file: anything older than the sources
   is a screenshot of a previous revision, and that is a refusal rather than a
   warning. */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

const artifactPath = (id) => (id === "row"
  ? join(ROOT, "template", "index.html")
  : join(ROOT, "dist", "templates", id, "template.html"));

const sourcesNewest = newestMtime(join(ROOT, "src"));
const stale = [];
for (const id of IDS) {
  const p = artifactPath(id);
  if (!existsSync(p)) stale.push(`${id}: missing ${p}`);
  else if (statSync(p).mtimeMs < sourcesNewest) stale.push(`${id}: older than src/`);
}
if (stale.length) {
  console.error(`refusing to capture stale artifacts:\n  ${stale.join("\n  ")}`);
  process.exit(1);
}
console.log(`  ${IDS.length} artifacts built and newer than src/`);

// ── fixture preview server ──────────────────────────────────────────────────
console.log(`starting the fixture preview server on ${BASE} …`);
console.log(`  fixture clock pinned to ${new Date(REFERENCE_UNIX * 1000).toISOString()} (ROW_FIXTURE_NOW=${REFERENCE_UNIX})`);
const server = spawn("go", ["-C", join("tools", "fixtures"), "run", ".", "-serve", `127.0.0.1:${PORT}`], {
  cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
  /* The one thing that makes the fixture data reproducible. The server reads it
     once at start-up; nothing else in the project sets it. */
  env: { ...process.env, ROW_FIXTURE_NOW: String(REFERENCE_UNIX) },
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += String(d); });
server.stderr.on("data", (d) => { serverLog += String(d); });

let up = false;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  if (/\(\d+ fixtures, \d+ templates\)/.test(serverLog)) { up = true; break; }
  try { const r = await fetch(`${BASE}/f/${FIXTURE}`); if (r.ok) { up = true; break; } } catch {}
}
if (!up) { console.error("the fixture server did not come up.\n" + serverLog); server.kill(); process.exit(1); }
const m = serverLog.match(/\((\d+) fixtures, (\d+) templates\)/);
console.log(`  server up — ${m ? m[1] + " fixtures, " + m[2] + " templates" : "responding"}`);

// ── chrome ──────────────────────────────────────────────────────────────────
const bin = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!bin) { console.error("no Chrome/Chromium found"); server.kill(); process.exit(1); }
const profile = mkdtempSync(join(tmpdir(), "row-previews-"));
console.log(`browser: ${bin}`);

const chrome = spawn(bin, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "--font-render-hinting=none",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((res, rej) => {
  let buf = ""; const t = setTimeout(() => rej(new Error("chrome did not report a devtools port")), 30000);
  chrome.stderr.on("data", (c) => {
    buf += String(c);
    const mm = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (mm) { clearTimeout(t); res(mm[1]); }
  });
});

const httpBase = wsUrl.replace(/^ws:\/\/([^/]+)\/.*$/, "http://$1");
const target = await (await fetch(`${httpBase}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to chrome")); });

let msgId = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) {
    const { res, rej } = pending.get(d.id); pending.delete(d.id);
    d.error ? rej(new Error(d.error.message)) : res(d.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};

await send("Page.enable");
await send("Network.enable");
await send("Runtime.enable");

// Determinism: the live-status poll can never complete, so status cannot change
// between readiness and capture.
await send("Network.setBlockedURLs", { urls: ["*format=info*"] });

/* ── pin the browser clock ───────────────────────────────────────────────────
 *
 * Pinning the fixture is only half of it. The page computes its expiry caption
 * as `dayIndex(expire) - dayIndex(Date.now())`, so "45 days remaining" depends
 * on the *reader's* calendar day rather than the server's: on any later day the
 * same fixture reads one day less no matter which instant the fixture was
 * generated from. The expiry date beside it is formatted from the same clock,
 * in the runtime's local zone.
 *
 * So the capture browser is told the instant the fixture was generated from.
 * `addScriptToEvaluateOnNewDocument` installs this before any page script runs,
 * on every navigation in this session. It is a harness concern only: the shim
 * lives here, reaches no product source, no artifact and no installer, and the
 * shipped page keeps reading the real clock. The read-back below refuses the
 * capture if it ever fails to take.
 *
 * The function form (rather than a Date subclass) keeps `Date()` callable
 * without `new`, and returning a real Date instance keeps every Date method,
 * `Date.parse` and `Date.UTC` behaving exactly as before — only "now" moves. */
const CLOCK_SHIM = `(() => {
  var FIXED = ${REFERENCE_UNIX * 1000};
  var Real = Date;
  function FixedDate(...args) {
    if (!new.target) return new Real(FIXED).toString();
    return args.length === 0 ? new Real(FIXED) : new Real(...args);
  }
  FixedDate.now = function () { return FIXED; };
  FixedDate.parse = Real.parse;
  FixedDate.UTC = Real.UTC;
  FixedDate.prototype = Real.prototype;
  globalThis.Date = FixedDate;
})()`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK_SHIM });

// ── capture ─────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const entries = [];
let failed = 0;

for (const id of IDS) {
  for (const [mode, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
    const url = `${BASE}/f/${FIXTURE}?template=${encodeURIComponent(id)}`;
    const file = join(OUT, `${id}-${mode}.webp`);

    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: mode === "mobile",
    });
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });

    await send("Page.navigate", { url });

    try {
      await evaluate(`new Promise((res) => {
        if (document.readyState === 'complete') return res(1);
        addEventListener('load', () => res(1), { once: true });
      })`);

      // Undo the fixture server's development chrome.
      //
      // The fixture injects its control bar AND its `body { padding-block-end: 46px
      // !important }` rule as a <style> at the END OF <body>. A style appended to
      // <head> would therefore come EARLIER in document order and lose the cascade
      // tie-break, even though both use !important. Appending to <body> instead puts
      // the override last, which is what makes it win.
      await evaluate(`(() => {
        const s = document.createElement('style');
        s.setAttribute('data-capture', 'previews');
        s.textContent = '#row-dev{display:none !important}'
                      + 'body{padding-block-end:0 !important}';
        document.body.appendChild(s);
        return 1;
      })()`);

      await evaluate(`document.fonts ? document.fonts.ready.then(() => 1) : 1`);
      await evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`);
    } catch (e) {
      console.error(`  ${id} ${mode}: readiness failed — ${e.message}`);
      failed++; continue;
    }

    // Prove the source before capturing: the page must report the requested template.
    const seen = await evaluate(`document.documentElement.getAttribute('data-template') || 'row'`);
    if (seen !== id) {
      console.error(`  ${id} ${mode}: page reports data-template="${seen}" — refusing to capture`);
      failed++; continue;
    }

    // Prove the harness chrome is gone before capturing, and that the product UI is not.
    const chromeCheck = await evaluate(`(() => {
      const bar = document.getElementById('row-dev');
      const barVisible = bar ? (() => {
        const cs = getComputedStyle(bar);
        const r = bar.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0 && r.bottom > 0;
      })() : false;
      const bodyPad = getComputedStyle(document.body).paddingBlockEnd;
      // Product UI that must still be present and visible.
      const main = document.querySelector('main, .wrap, [data-template] > *');
      const heading = document.querySelector('h1, [class*=title], [class*=brand]');
      return {
        barVisible,
        bodyPad,
        /* The pinned clock, read back from inside the page. */
        clock: Date.now(),
        productPresent: !!main,
        headingVisible: heading ? heading.getBoundingClientRect().height > 0 : false,
        docHeight: document.documentElement.scrollHeight,
      };
    })()`);

    if (chromeCheck.barVisible) {
      console.error(`  ${id} ${mode}: fixture toolbar still visible — refusing to capture`);
      failed++; continue;
    }
    if (chromeCheck.bodyPad !== "0px") {
      console.error(`  ${id} ${mode}: fixture body padding still ${chromeCheck.bodyPad} — refusing to capture`);
      failed++; continue;
    }
    if (!chromeCheck.productPresent) {
      console.error(`  ${id} ${mode}: product UI not found — refusing to capture`);
      failed++; continue;
    }
    if (!chromeCheck.headingVisible) {
      console.error(`  ${id} ${mode}: no visible product heading — refusing to capture`);
      failed++; continue;
    }
    /* The clock shim is the whole reason a capture is reproducible across days,
       so a capture taken without it is refused rather than quietly committed. */
    if (chromeCheck.clock !== REFERENCE_UNIX * 1000) {
      console.error(`  ${id} ${mode}: browser clock reads ${chromeCheck.clock}, `
        + `expected ${REFERENCE_UNIX * 1000} — refusing to capture`);
      failed++; continue;
    }

    const shot = await send("Page.captureScreenshot", {
      format: "webp", quality: 92, captureBeyondViewport: false, fromSurface: true,
    });
    const buf = Buffer.from(shot.data, "base64");
    writeFileSync(file, buf);

    const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
    entries.push({
      id, mode,
      file: `previews/${id}-${mode}.webp`,
      width: vp.width, height: vp.height,
      bytes: buf.length,
      sha256,
    });
    console.log(`  ${id.padEnd(13)} ${mode.padEnd(8)} ${String(vp.width).padStart(4)}x${vp.height}  ${String(buf.length).padStart(7)} bytes  ${sha256.slice(0, 12)}…`);
  }
}

// ── manifest ────────────────────────────────────────────────────────────────
const total = entries.reduce((a, e) => a + e.bytes, 0);
const uniqueHashes = new Set(entries.map((e) => e.sha256)).size;

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  fixture: FIXTURE,
  generator: "docs/scripts/capture-previews.mjs",
  source: "the project's own fixture preview server, rendering each frozen artifact",
  format: "webp",
  quality: 92,
  desktop: { width: DESKTOP.width, height: DESKTOP.height },
  mobile: { width: MOBILE.width, height: MOBILE.height },
  total: entries.length,
  totalBytes: total,
  uniqueHashes,
  entries,
}, null, 2) + "\n", "utf8");

ws.close();
chrome.kill();
server.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch {}

console.log(`\n${entries.length} screenshot(s) written to docs/public/previews/`);
console.log(`total ${total} bytes (${(total / 1024 / 1024).toFixed(2)} MB) · ${uniqueHashes} unique sha256`);
if (failed) { console.error(`${failed} capture(s) failed`); process.exit(1); }
if (entries.length !== 30) { console.error(`expected 30 captures, got ${entries.length}`); process.exit(1); }
if (uniqueHashes !== 30) { console.error(`expected 30 unique hashes, got ${uniqueHashes}`); process.exit(1); }
