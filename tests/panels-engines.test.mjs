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
import { extractIsland, toModel, validateIsland } from '../tools/contract.mjs';
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
    title: pgPageTitle(doc),
    subUrl: '',         // not a database column: the page uses its own URL
    subClashUrl: '',
    links,
  };
}

/* The page's title, as the shipped prelude derives it
   (src/panels/pasarguard/prelude.jinja2): the admin's configured profile title
   when there is one, otherwise the subscriber's own name. A profile title that
   still carries a `{` is refused, because PasarGuard formats those against
   variables the page cannot resolve, and a literal "{DATA_LIMIT}" on the page
   is worse than the subscriber's name. */
function pgPageTitle(doc) {
  const admin = doc.native.admin || null;
  const brand = admin && admin.profile_title ? String(admin.profile_title).trim() : '';
  if (brand !== '' && !brand.includes('{')) return brand;
  return String(doc.native.info.username ?? '').trim();
}

/* The page's title, as the shipped prelude derives it
   (src/panels/rebecca/prelude.pongo2). Rebecca's page context carries NO
   profile title: the panel-wide subscription_profile_title is written into the
   /info `profile-title` HEADER (subscriptionHeaders) and the page render path
   (renderSubscriptionHTML -> renderSubscriptionPageTemplate) never passes it,
   so the /info title the adapter reads is not visible to the page at all. The
   one identity the page does receive is user.username, which is therefore the
   page's name -- the same fallback the PasarGuard prelude takes when no
   profile title is configured. The model reads the title back through
   contract.mjs, which trims, so a whitespace-only name is no name here too. */
function rbPageTitle(doc) {
  return String(doc.native.info.username ?? '').trim();
}

function rbExpected(doc, links) {
  const subUrl = doc.native.info.subscription_url || '';
  return {
    ...doc.expected.model,
    title: rbPageTitle(doc),  // the header title is not in Rebecca's page context
    announce: '',             // Rebecca has no announcement
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

/* --- the subscriber and the service name ------------------------------------
   The page context carries the subscriber (user.username) and the admin's own
   columns (user.admin.profile_title, user.admin.support_url). It does NOT carry
   the panel-wide subscription settings, so those cannot reach the page at all.
   The prelude resolves the page's name in the panel's own order — the admin's
   configured profile title, then the subscriber — and refuses a profile title
   that still carries one of the panel's format placeholders. Every case below
   runs through the SHIPPED prelude on the real Jinja2. */

/* The page context a real install builds for one subscriber, with the two
   values this section is about supplied explicitly. */
function pgPage({ username, profileTitle = null, supportUrl = null, withAdmin = true }) {
  const doc = PG.find((d) => d.case === '01-active-online');
  const context = pasarguardContext(doc);
  context.user.username = username;
  context.user.admin = withAdmin
    ? { support_url: supportUrl, profile_title: profileTitle }
    : null;
  const [html] = renderPasarGuard([{ html: SHELL.pasarguard, context }]);
  return { html, model: toModel(extractIsland(html)) };
}

test('PasarGuard: with no configured profile title the page names the subscriber', () => {
  /* The reported defect: the page titled itself with the generic word. */
  const { html, model } = pgPage({ username: 'alice' });
  assert.equal(model.title, 'alice', 'the subscriber reaches the page model');
  assert.ok(html.includes('<title>alice</title>'), 'and names the browser title');
  assert.equal(html.includes('<title>Subscription</title>'), false, 'never the generic word');
});

test('PasarGuard: the admin\'s configured profile title names the page, over the subscriber', () => {
  const { html, model } = pgPage({ username: 'alice', profileTitle: 'Premium 100 GB' });
  assert.equal(model.title, 'Premium 100 GB', 'the configured service name wins');
  assert.ok(html.includes('Premium 100 GB'), 'and reaches the page');
});

test('PasarGuard: a profile title carrying a format placeholder is refused, not shown literally', () => {
  /* PasarGuard formats these against variables the page cannot resolve
     (setup_format_variables). A literal "{DATA_LIMIT}" on the page would be a
     worse defect than the subscriber's own name. */
  const titles = ['MyNet {USERNAME}', '{DATA_LIMIT} left', '{EXPIRE_DATE}', '{SERVER_IP}'];
  const pages = renderPasarGuard(titles.map((t) => {
    const doc = PG.find((d) => d.case === '01-active-online');
    const context = pasarguardContext(doc);
    context.user.username = 'alice';
    context.user.admin = { support_url: null, profile_title: t };
    return { html: SHELL.pasarguard, context };
  }));
  pages.forEach((html, i) => {
    assert.equal(toModel(extractIsland(html)).title, 'alice', `${titles[i]}: falls through to the subscriber`);
    assert.equal(html.includes(titles[i]), false, `${titles[i]}: never reaches the page`);
    /* The placeholder must not survive in any form: the island's title is the
       subscriber, and no rendered attribute carries a brace pair. */
    assert.equal(html.includes('data-sub-title="alice"'), true, `${titles[i]}: the island names the subscriber`);
    assert.equal(/data-sub-title="[^"]*\{/.test(html), false, `${titles[i]}: no placeholder in the island title`);
    for (const v of ['{USERNAME}', '{DATA_LIMIT}', '{EXPIRE_DATE}', '{SERVER_IP}']) {
      assert.equal(html.includes(v), false, `${titles[i]}: ${v} is not on the page`);
    }
  });
});

test('PasarGuard: a missing subscriber name keeps the generic fallback', () => {
  for (const value of [null, undefined, '', '   ']) {
    const { html, model } = pgPage({ username: value });
    const label = JSON.stringify(value);
    assert.equal(model.title, '', `${label}: no name is invented`);
    assert.ok(html.includes('<title>Subscription</title>'), `${label}: the generic fallback stands`);
  }
});

test('PasarGuard: a subscriber with no admin at all is still named', () => {
  const { model } = pgPage({ username: 'alice', withAdmin: false });
  assert.equal(model.title, 'alice');
});

test('PasarGuard: the subscriber name is escaped and never becomes markup', () => {
  const { html, model } = pgPage({ username: HOSTILE, profileTitle: HOSTILE });
  assert.equal(model.title, HOSTILE, 'the name arrives whole, as text');
  assert.equal(html.includes(HOSTILE), false, 'and never appears unescaped');
  assert.equal(html.includes('"><script>'), false, 'no attribute value is broken out of');
  assert.equal(html.includes('<img src=x onerror'), false, 'no element is injected');
  const scripts = (text) => (text.match(/<script/gi) || []).length;
  assert.equal(scripts(html), scripts(SHELL.pasarguard), 'no script element is added');
  assert.equal(html.includes('>49<') || html.includes('"49"'), false, '{{ 7*7 }} is not evaluated');
});

test('PasarGuard: a non-Latin subscriber name is carried as text', () => {
  /* PasarGuard's own validator restricts usernames to [a-zA-Z0-9-_@.], 3..128
     characters (app/models/validators.py UserValidator.validate_username), so
     this is a value the panel cannot produce today. The page must still carry
     it as text rather than corrupt it, which is what makes the boundary safe
     if that rule ever widens. */
  const name = '\u06a9\u0627\u0631\u0628\u0631-\u0622\u0632\u0645\u0627\u06cc\u0634\u06cc';
  const { html, model } = pgPage({ username: name });
  assert.equal(model.title, name, 'the name survives intact');
  assert.ok(html.includes(name), 'and is written as text');
});

test('PasarGuard: a long subscriber name is carried whole, not truncated', () => {
  /* 128 characters is the panel's own ceiling for a username. */
  const name = 'a'.repeat(128);
  const { html, model } = pgPage({ username: name });
  assert.equal(model.title, name);
  assert.equal(html.includes(`data-sub-title="${name}"`), true);
});

test('PasarGuard: the panel-wide subscription settings are not in the page context', () => {
  /* The page context is exactly {user, links, announce, announce_url, apps}
     (_build_subscription_body_payload), and the Jinja2 environment adds only
     now(). A shell that reached for the panel-wide settings would render an
     empty value on the panel and never say so, so the page must not depend on
     them: a context WITHOUT them still renders a whole document. */
  const doc = PG.find((d) => d.case === '00-showcase');
  const context = pasarguardContext(doc);
  assert.deepEqual(Object.keys(context).sort(), ['announce', 'announce_url', 'links', 'now', 'user']);
  assert.equal(Object.prototype.hasOwnProperty.call(context, 'sub_settings'), false);
  const [html] = renderPasarGuard([{ html: SHELL.pasarguard, context }]);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.deepEqual(validateIsland(extractIsland(html)), []);
});

/* --- Rebecca: the subscriber names the page ---------------------------------
   Rebecca's page context carries NO profile title. The panel-wide
   subscription_profile_title is written into the /info `profile-title` HEADER
   (subscriptionHeaders) and the page render path -- renderSubscriptionHTML ->
   renderSubscriptionPageTemplate -- never passes it into the render context,
   which is exactly {user, links, links_text, usage_url, support_url, token,
   current_timestamp, remaining_days}. The one identity the page does receive is
   user.username, so that is the page's name: the same fallback the PasarGuard
   prelude takes when no profile title is configured. Every case below runs
   through the SHIPPED prelude on the real pongo2. */

/* The page context a real install builds for one subscriber, with the value
   this section is about supplied explicitly. */
function rbPage({ username }) {
  const doc = RB.find((d) => d.case === '01-active-online');
  const context = rebeccaContext(doc);
  context.user.username = username;
  const [html] = renderRebecca([{ html: SHELL.rebecca, context }]);
  return { html, model: toModel(extractIsland(html)) };
}

test('Rebecca: the page names the subscriber, not the generic word', () => {
  /* The reported defect: the page titled itself with the generic word. */
  const { html, model } = rbPage({ username: 'alice' });
  assert.equal(model.title, 'alice', 'the subscriber reaches the page model');
  assert.ok(html.includes('<title>alice</title>'), 'and names the browser title');
  assert.equal(html.includes('<title>Subscription</title>'), false, 'never the generic word');
  assert.ok(html.includes('data-sub-title="alice"'), 'and labels the page');
});

test('Rebecca: the /info header title does not reach the page', () => {
  /* The adapter reads `profile-title` from the /info headers and the fixtures
     pin it, but the page never receives the headers. The subscriber's own name
     must win, and the header value must not appear on the page at all. */
  const doc = RB.find((d) => d.case === '12-base64-title');
  assert.equal(doc.expected.model.title, 'گزارش وضعیت', 'the fixture really pins a header title');
  const context = rebeccaContext(doc);
  const [html] = renderRebecca([{ html: SHELL.rebecca, context }]);
  assert.equal(toModel(extractIsland(html)).title, 'alice', 'the subscriber names the page');
  assert.equal(html.includes('گزارش وضعیت'), false, 'the header title is not on the page');
  assert.equal(html.includes('base64:'), false, 'and neither is its encoding');
});

test('Rebecca: a missing subscriber name keeps the generic fallback', () => {
  for (const value of [null, undefined, '', '   ']) {
    const { html, model } = rbPage({ username: value });
    const label = JSON.stringify(value);
    assert.equal(model.title, '', `${label}: no name is invented`);
    assert.equal(html.includes('data-sub-title=""'), true, `${label}: the island title is empty`);
    assert.ok(html.includes('<title>Subscription</title>'), `${label}: the generic fallback stands`);
  }
});

test('Rebecca: a non-Latin subscriber name is carried as text', () => {
  /* Rebecca's own validator restricts a username to [A-Za-z0-9._@-], 3..32
     characters (internal/app/user/validation.go), so this is a value the panel
     cannot produce today. The page must still carry it as text rather than
     corrupt it, which is what makes the boundary safe if that rule widens. */
  const name = '\u06a9\u0627\u0631\u0628\u0631-\u0622\u0632\u0645\u0627\u06cc\u0634\u06cc';
  const { html, model } = rbPage({ username: name });
  assert.equal(model.title, name, 'the name survives intact');
  assert.ok(html.includes(name), 'and is written as text');
});

test('Rebecca: the subscriber name is escaped and never becomes markup', () => {
  const { html, model } = rbPage({ username: HOSTILE });
  assert.equal(model.title, HOSTILE, 'the name arrives whole, as text');
  assert.equal(html.includes(HOSTILE), false, 'and never appears unescaped');
  assert.equal(html.includes('"><script>'), false, 'no attribute value is broken out of');
  assert.equal(html.includes('<img src=x onerror'), false, 'no element is injected');
  const scripts = (text) => (text.match(/<script/gi) || []).length;
  assert.equal(scripts(html), scripts(SHELL.rebecca), 'no script element is added');
  assert.equal(html.includes('>49<') || html.includes('"49"'), false, '{{ 7*7 }} is not evaluated');
});

test('Rebecca: a long subscriber name is carried whole, not truncated', () => {
  /* 32 characters is the panel's own ceiling for a username. */
  const name = 'a'.repeat(32);
  const { html, model } = rbPage({ username: name });
  assert.equal(model.title, name);
  assert.equal(html.includes(`data-sub-title="${name}"`), true);
});

test('Rebecca: the panel-wide profile title is not in the page context', () => {
  /* The page context is exactly the map subscriptionTemplateContext builds
     (internal/app/user/subscription.go). The panel-wide
     subscription_profile_title goes to the `profile-title` HEADER and nowhere
     else, so a shell that reached for it would render an empty title and never
     say so: a context WITHOUT it still renders a whole document. */
  const doc = RB.find((d) => d.case === '00-showcase');
  const context = rebeccaContext(doc);
  assert.deepEqual(Object.keys(context).sort(),
    ['current_timestamp', 'links', 'remaining_days', 'support_url', 'token', 'user']);
  assert.equal(Object.prototype.hasOwnProperty.call(context, 'profile_title'), false);
  const [html] = renderRebecca([{ html: SHELL.rebecca, context }]);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.deepEqual(validateIsland(extractIsland(html)), []);
});

