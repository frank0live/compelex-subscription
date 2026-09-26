/* The PasarGuard and Rebecca pages, rendered by the REAL template engines.
 *
 * Every other panel test renders the shells with a test-only stand-in. This
 * file renders the SHIPPED shells -- prelude, autoescape block and all -- with
 * real Jinja2 configured the way PasarGuard configures it, and real pongo2
 * v6.1.0 configured the way Rebecca configures it (tools/engines.mjs), from the
 * page context each panel really builds. It is the evidence behind "Supported":
 *
 *   - every design parses and renders on both engines;
 *   - the island a subscriber receives carries exactly the figures the panel
 *     holds, for every fixture, including the states that were refused before
 *     (on_hold) and the ones the old fixtures never used (limited, expired);
 *   - the time conversions are exact and timezone-independent, including
 *     Rebecca's zoneless online_at, converted in pongo2 integer arithmetic;
 *   - hostile panel data (a username, a link remark, an announcement) never
 *     becomes markup or template code on the page. On PasarGuard this is the
 *     shell's own doing: its Jinja2 environment does not autoescape.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleShell, wrapForPanel, TEMPLATE_DELIMITER } from '../tools/shell.mjs';
import { extractIsland, toModel } from '../tools/contract.mjs';
import { templateIds } from '../tools/templates.mjs';
import {
  renderPasarGuard, renderRebecca, pasarguardContext, rebeccaContext,
} from '../tools/engines.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fixtures(panel) {
  const dir = join(ROOT, 'tests', 'fixtures', 'panels', panel);
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

const PG = fixtures('pasarguard');
const RB = fixtures('rebecca');
const SHELL = {
  pasarguard: assembleShell('pasarguard', 'row').html,
  rebecca: assembleShell('rebecca', 'row').html,
};

const LINKS = [
  'vless://11111111-1111-1111-1111-111111111111@203.0.113.10:443?security=reality&type=tcp#DE',
  'trojan://secret@203.0.113.11:443?sni=example.com#NL',
];

const HOSTILE = '"><script>alert(1)</script><img src=x onerror=alert(2)>{{ 7*7 }}{% raw %}{# c #}\'';

/* The page model a fixture should produce. The panels' page contexts carry
   less than their /info payloads, and the adapters' header-derived fields are
   replaced by what the page can actually see. */
function pgExpected(doc, links) {
  return {
    ...doc.expected.model,
    title: '',          // not in PasarGuard's page context
    subUrl: '',         // not a database column: the page uses its own URL
    subClashUrl: '',
    links,
  };
}

function rbExpected(doc, links) {
  const subUrl = doc.native.info.subscription_url || '';
  return {
    ...doc.expected.model,
    title: '',          // not in Rebecca's page context
    announce: '',       // Rebecca has no announcement
    subUrl,
    subClashUrl: subUrl ? `${subUrl}/clash-meta` : '',
    links,
  };
}

/* --- every design renders on both engines ----------------------------------- */

test('every design renders on PasarGuard\'s Jinja2 to a contract-valid island', () => {
  const doc = PG.find((d) => d.case === '00-showcase');
  const ids = templateIds();
  const pages = renderPasarGuard(ids.map((id) => ({
    html: assembleShell('pasarguard', id).html,
    context: pasarguardContext(doc, { links: LINKS }),
  })));
  pages.forEach((html, i) => {
    const m = toModel(extractIsland(html));
    assert.deepEqual(m, pgExpected(doc, LINKS), `${ids[i]}: the island carries the panel's figures`);
    assert.ok(html.startsWith('<!doctype html>'), `${ids[i]}: the page starts with the doctype`);
    assert.ok(html.trimEnd().endsWith('</html>'), `${ids[i]}: and ends with </html>`);
    assert.equal(TEMPLATE_DELIMITER.test(html.replace(/\{\{ 7\*7 \}\}/g, '')), false,
      `${ids[i]}: no template syntax is left in the served page`);
  });
});

test('every design renders on Rebecca\'s pongo2 to a contract-valid island', () => {
  const doc = RB.find((d) => d.case === '00-showcase');
  const ids = templateIds();
  const pages = renderRebecca(ids.map((id) => ({
    html: assembleShell('rebecca', id).html,
    context: rebeccaContext(doc, { links: LINKS }),
  })));
  pages.forEach((html, i) => {
    const m = toModel(extractIsland(html));
    assert.deepEqual(m, rbExpected(doc, LINKS), `${ids[i]}: the island carries the panel's figures`);
    assert.ok(html.startsWith('<!doctype html>'), `${ids[i]}: the page starts with the doctype`);
    assert.equal(TEMPLATE_DELIMITER.test(html), false, `${ids[i]}: no template syntax is left in the served page`);
  });
});

/* --- every fixture ---------------------------------------------------------- */

test('PasarGuard: every fixture renders exactly the model its adapter produces', () => {
  const docs = PG.filter((d) => d.expected.model !== null);
  const pages = renderPasarGuard(docs.map((d) => ({ html: SHELL.pasarguard, context: pasarguardContext(d) })));
  pages.forEach((html, i) => {
    assert.deepEqual(toModel(extractIsland(html)), pgExpected(docs[i], []), docs[i].case);
  });
  assert.ok(docs.some((d) => d.case === '08-on-hold'), 'on_hold is among them, no longer refused');
});

test('Rebecca: every fixture renders exactly the model its adapter produces', () => {
  const docs = RB.filter((d) => d.expected.model !== null);
  const pages = renderRebecca(docs.map((d) => ({ html: SHELL.rebecca, context: rebeccaContext(d) })));
  pages.forEach((html, i) => {
    assert.deepEqual(toModel(extractIsland(html)), rbExpected(docs[i], []), docs[i].case);
  });
  assert.ok(docs.some((d) => d.case === '08-on-hold'), 'on_hold is among them, no longer refused');
});

/* --- the states that matter ------------------------------------------------- */

test('PasarGuard on_hold: enabled, and the clock starts on first connection for the hold duration', () => {
  const doc = PG.find((d) => d.case === '08-on-hold');
  const [html] = renderPasarGuard([{ html: SHELL.pasarguard, context: pasarguardContext(doc) }]);
  const m = toModel(extractIsland(html));
  assert.equal(m.enabled, true);
  assert.equal(m.expire, -doc.native.info.on_hold_expire_duration, 'expire is the negative hold duration');
  assert.match(html, /Starts on first connection/, 'and the no-script text says so');
});

test('on_hold without a known duration is unknown, never "never expires"', () => {
  const pg = PG.find((d) => d.case === '22-on-hold-no-duration');
  const rb = RB.find((d) => d.case === '08-on-hold');
  const [pgHtml] = renderPasarGuard([{ html: SHELL.pasarguard, context: pasarguardContext(pg) }]);
  const [rbHtml] = renderRebecca([{ html: SHELL.rebecca, context: rebeccaContext(rb) }]);
  for (const [name, html] of [['PasarGuard', pgHtml], ['Rebecca', rbHtml]]) {
    const m = toModel(extractIsland(html));
    assert.equal(m.enabled, true, `${name}: on_hold is enabled`);
    assert.equal(m.expire, null, `${name}: the expiry is unknown`);
    assert.doesNotMatch(html, /id="expiry-value">Never expires/, `${name}: and is never shown as "never"`);
  }
});

test('PasarGuard: the limited and expired statuses stay enabled and keep their figures', () => {
  const docs = PG.filter((d) => ['20-status-limited', '21-status-expired'].includes(d.case));
  const pages = renderPasarGuard(docs.map((d) => ({ html: SHELL.pasarguard, context: pasarguardContext(d) })));
  pages.forEach((html, i) => {
    const m = toModel(extractIsland(html));
    assert.equal(m.enabled, true, `${docs[i].case}: enabled`);
    assert.deepEqual(m, pgExpected(docs[i], []), docs[i].case);
  });
});

test('Rebecca: a status the panel does not know renders disabled, as Rebecca classes it', () => {
  const doc = RB.find((d) => d.case === '17-unknown-status');
  const [html] = renderRebecca([{ html: SHELL.rebecca, context: rebeccaContext(doc) }]);
  const m = toModel(extractIsland(html));
  assert.equal(m.enabled, false);
  assert.equal(m.online, false, 'and a disabled subscription is never online');
});

/* --- time ------------------------------------------------------------------- */

test('PasarGuard: expire from a zoneless database datetime matches the panel\'s own header', () => {
  /* PasarGuard's subscription-userinfo header is int(expire.timestamp()), and
     the panel runs in UTC. A naive datetime read under TZ=UTC must give the
     same second the header reports. */
  const doc = PG.find((d) => d.case === '01-active-online');
  const ctx = pasarguardContext(doc);
  ctx.user.expire = '2026-11-02T12:00:00';
  ctx.user.expire_naive = true;
  const [html] = renderPasarGuard([{ html: SHELL.pasarguard, context: ctx }], { TZ: 'UTC' });
  assert.equal(toModel(extractIsland(html)).expire, 1793620800);
});

test('PasarGuard: online is true inside 120 s of now() and false outside it', () => {
  const doc = PG.find((d) => d.case === '01-active-online');
  const seen = Date.parse(doc.native.info.online_at) / 1000;
  const cases = [[0, true], [120, true], [121, false], [-5, false]];
  const pages = renderPasarGuard(cases.map(([age]) => ({
    html: SHELL.pasarguard, context: pasarguardContext(doc, { now: seen + age }),
  })));
  pages.forEach((html, i) => {
    assert.equal(toModel(extractIsland(html)).online, cases[i][1], `age ${cases[i][0]} s`);
  });
});

/* Rebecca's online_at arrives without a zone and is UTC. pongo2 cannot parse a
   date, so the prelude converts the civil date with integer arithmetic. Every
   instant here goes through the SHIPPED prelude on the real engine. */
function rebeccaTimeProbe(onlineAt, now) {
  const body = '<!doctype html>\n<p>{{ lastOnline }}|{% if isOnline %}1{% else %}0{% endif %}</p>\n</html>\n';
  return {
    html: wrapForPanel('rebecca', 'pongo2', body),
    context: {
      user: { status: 'active', status_class: 'active', used_traffic: 0, online_at: onlineAt, subscription_url: '' },
      links: [], support_url: '', current_timestamp: now,
    },
  };
}

function probeResult(html) {
  const m = html.match(/<p>([^|]*)\|([01])<\/p>/);
  assert.ok(m, 'the probe rendered');
  return { lastOnline: m[1] === '' ? null : Number(m[1]), online: m[2] === '1' };
}

test('Rebecca: online_at converts to the exact UTC millisecond for every date form', () => {
  /* A deterministic spread: every month boundary, leap days, both centuries. */
  const instants = [];
  let seed = 20260918;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 400; i += 1) instants.push(Math.floor(rand() * 4102444800)); // 1970..2100
  for (const s of ['1970-01-01', '2000-02-29', '2024-02-29', '2024-03-01', '2100-02-28', '2026-12-31']) {
    instants.push(Date.parse(`${s}T23:59:59Z`) / 1000);
  }
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const forms = (sec) => {
    const d = new Date(sec * 1000);
    const civil = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    return [`${civil} ${clock}`, `${civil}T${clock}Z`, `${civil}T${clock}.123456789Z`, `${civil} ${clock}.5`];
  };
  const jobs = [];
  const want = [];
  for (const sec of instants) {
    for (const f of forms(sec)) {
      jobs.push(rebeccaTimeProbe(f, sec + 30));
      want.push(sec * 1000);
    }
  }
  const pages = renderRebecca(jobs, { TZ: 'Asia/Tehran' });
  pages.forEach((html, i) => {
    const r = probeResult(html);
    assert.equal(r.lastOnline, want[i], `instant ${want[i]}: ${jobs[i].context.user.online_at}`);
    assert.equal(r.online, true, 'thirty seconds ago is online');
  });
});

test('Rebecca: the online window and a value with a foreign offset', () => {
  const at = '2026-09-18 11:58:30';
  const sec = Date.parse('2026-09-18T11:58:30Z') / 1000;
  const cases = [
    [at, sec + 120, sec * 1000, true],
    [at, sec + 121, sec * 1000, false],
    [at, sec - 1, sec * 1000, false],                  // a clock behind the record is not "online"
    ['2026-09-18T11:58:30+03:30', sec, null, false],   // a non-UTC offset is not guessed
    ['garbage', sec, null, false],
    [null, sec, null, false],
  ];
  const pages = renderRebecca(cases.map(([v, now]) => rebeccaTimeProbe(v, now)));
  pages.forEach((html, i) => {
    const r = probeResult(html);
    assert.equal(r.lastOnline, cases[i][2], `lastOnline for ${cases[i][0]}`);
    assert.equal(r.online, cases[i][3], `online for ${cases[i][0]} at +${cases[i][1] - sec}s`);
  });
});

/* --- hostile data ----------------------------------------------------------- */

function hostileContexts() {
  const pgDoc = PG.find((d) => d.case === '01-active-online');
  const rbDoc = RB.find((d) => d.case === '01-active-online');
  const pg = pasarguardContext(pgDoc, { links: [`vless://x@h:1#${HOSTILE}`] });
  pg.user.username = HOSTILE;
  pg.user.admin = { support_url: `https://t.me/${HOSTILE}` };
  pg.announce = `Maintenance ${HOSTILE}`;
  const rb = rebeccaContext(rbDoc, { links: [`ss://x@h:1#${HOSTILE}`] });
  rb.user.username = HOSTILE;
  rb.user.subscription_url = `https://sub.example.com/sub/${HOSTILE}`;
  rb.support_url = `https://t.me/${HOSTILE}`;
  return { pg, rb };
}

test('hostile panel data never becomes markup or template code on either page', () => {
  const { pg, rb } = hostileContexts();
  const benignPg = pasarguardContext(PG.find((d) => d.case === '01-active-online'));
  const benignRb = rebeccaContext(RB.find((d) => d.case === '01-active-online'));
  const [pgBad, pgGood] = renderPasarGuard([
    { html: SHELL.pasarguard, context: pg }, { html: SHELL.pasarguard, context: benignPg }]);
  const [rbBad, rbGood] = renderRebecca([
    { html: SHELL.rebecca, context: rb }, { html: SHELL.rebecca, context: benignRb }]);
  const count = (html, re) => (html.match(re) || []).length;
  for (const [name, bad, good] of [['PasarGuard', pgBad, pgGood], ['Rebecca', rbBad, rbGood]]) {
    assert.equal(count(bad, /<script/gi), count(good, /<script/gi), `${name}: no script element was injected`);
    assert.equal(count(bad, /<img/gi), count(good, /<img/gi), `${name}: no element was injected`);
    assert.equal(bad.includes('<img src=x onerror'), false, `${name}: no attribute was injected`);
    assert.equal(bad.includes(HOSTILE), false, `${name}: the payload never appears unescaped`);
    assert.equal(bad.includes('"><script>'), false, `${name}: no attribute value was broken out of`);
    assert.equal(bad.includes('>49<') || bad.includes('"49"'), false, `${name}: {{ 7*7 }} was not evaluated`);
    const isl = extractIsland(bad);
    assert.ok(isl.links[0].endsWith(HOSTILE), `${name}: the link remark arrives intact, as text`);
  }
  assert.ok(extractIsland(pgBad).announce.endsWith(HOSTILE), 'PasarGuard: the announcement arrives intact, as text');
});

test('the shells never contain the phrases Rebecca rewrites before parsing', () => {
  /* Rebecca rewrites these spellings anywhere in a page template. A shell that
     used one would be silently changed on the server; none may appear. */
  const forbidden = ["user.status == 'active'", 'user.status == "active"', 'now().timestamp()',
    'user.status.value', '{{ user.links }}', '| int(', '| datetime(', '| bytesformat(', '| default('];
  for (const id of templateIds()) {
    const html = assembleShell('rebecca', id).html;
    for (const f of forbidden) assert.equal(html.includes(f), false, `${id}: contains ${f}`);
  }
});

test('the shipped PasarGuard shell escapes for itself: the body sits in an autoescape block', () => {
  for (const id of templateIds()) {
    const html = assembleShell('pasarguard', id).html;
    const open = html.indexOf('{%- autoescape true -%}');
    const island = html.indexOf('id="sub-data"');
    const close = html.lastIndexOf('{%- endautoescape %}');
    assert.ok(open > 0 && open < island && island < close, `${id}: the island is inside the autoescape block`);
    assert.equal(html.slice(close).includes('{{'), false, `${id}: nothing is interpolated after the block closes`);
  }
});
