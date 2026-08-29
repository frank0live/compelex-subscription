/* Import links. Each expected string here was taken from the scheme the client
   application itself documents, so a change to one of these assertions is a
   claim about a third-party application and needs the same evidence the entry
   did. A client with no verified scheme stays copy-only. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLATFORMS, detectPlatform, clientsFor, sourceUrl, deepLink,
} from '../src/scripts/clients.js';

const URLS = {
  sub: 'https://sub.example.com/sub/e3b0c44?token=a b',
  json: 'https://sub.example.com/json/e3b0c44',
  clash: 'https://sub.example.com/clash/e3b0c44',
};
const NAME = 'Katze VPN';
const enc = encodeURIComponent;

/* The page hands the poller and the encoder the real window; here it is only
   needed for base64. */
const win = { btoa: (s) => Buffer.from(s, 'latin1').toString('base64') };

function ids(platform, urls) {
  return clientsFor(platform, urls || URLS).map((c) => c.id);
}

test('the platform is guessed from the user agent, and iPadOS is iOS', () => {
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome' }), 'android');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }), 'ios');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' }), 'ios');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)' }), 'macos');
  assert.equal(
    detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 5 }),
    'ios',
    'an iPad reports itself as a Mac',
  );
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64)' }), 'windows');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), 'windows');
  assert.equal(detectPlatform({}), 'windows');
});

test('a client is listed only when the format it needs has an address', () => {
  assert.deepEqual(ids('android'), ['v2rayng', 'happ', 'singbox']);
  assert.deepEqual(ids('ios'), ['streisand', 'v2box', 'shadowrocket']);
  assert.deepEqual(ids('windows'), ['clashverge', 'mihomoparty', 'v2rayn']);
  assert.deepEqual(ids('macos'), ['clashverge', 'streisand', 'v2box']);

  assert.deepEqual(ids('android', { sub: URLS.sub }), ['v2rayng', 'happ'], 'sing-box needs json');
  assert.deepEqual(ids('windows', { sub: URLS.sub }), ['v2rayn'], 'the clash clients need clash');
  assert.deepEqual(ids('android', {}), []);
  assert.deepEqual(ids('nonsense'), ids('windows'), 'an unknown platform is treated as desktop');
});

test('each entry carries what the card has to say about it', () => {
  const ios = clientsFor('ios', URLS);
  assert.deepEqual(ios.find((c) => c.id === 'shadowrocket'), {
    id: 'shadowrocket', name: 'Shadowrocket', source: 'sub', paid: true, importable: true,
  });
  assert.deepEqual(clientsFor('windows', URLS).find((c) => c.id === 'v2rayn'), {
    id: 'v2rayn', name: 'v2rayN', source: 'sub', paid: false, importable: false,
  });
  assert.equal(clientsFor('android', URLS).find((c) => c.id === 'singbox').source, 'json');
});

test('the copy button is given the address that client actually reads', () => {
  assert.equal(sourceUrl('v2rayng', URLS), URLS.sub);
  assert.equal(sourceUrl('singbox', URLS), URLS.json);
  assert.equal(sourceUrl('clashverge', URLS), URLS.clash);
  assert.equal(sourceUrl('singbox', { sub: URLS.sub }), '');
  assert.equal(sourceUrl('nonsense', URLS), '');
});

test('every import link is the one its application documents', () => {
  const link = (id) => deepLink(id, URLS, NAME, win);
  assert.equal(link('v2rayng'), 'v2rayng://install-config?url=' + enc(URLS.sub));
  assert.equal(link('happ'), 'happ://add/' + URLS.sub, 'Happ takes the address unencoded');
  assert.equal(link('singbox'), 'sing-box://import-remote-profile?url=' + enc(URLS.json) + '#' + enc(NAME));
  assert.equal(link('streisand'), 'streisand://import/' + enc(URLS.sub));
  assert.equal(link('v2box'), 'v2box://install-sub?url=' + enc(URLS.sub) + '&name=' + enc(NAME));
  assert.equal(link('mihomoparty'), 'mihomo://install-config?url=' + enc(URLS.clash));
  assert.equal(
    link('shadowrocket'),
    'shadowrocket://add/sub://' + win.btoa(URLS.sub + '&flag=shadowrocket') + '?remark=' + enc(NAME),
  );
});

/* The handler reads everything after url= as part of the address, so anything
   appended silently corrupts the subscription it imports. */
test('nothing follows the Clash Verge Rev url parameter', () => {
  const link = deepLink('clashverge', URLS, NAME, win);
  assert.equal(link, 'clash-verge://install-config?url=' + enc(URLS.clash));
  assert.equal(link.indexOf('&'), -1);
  assert.equal(link.indexOf('#'), -1);
  assert.ok(link.endsWith(enc(URLS.clash)));
});

test('a link that cannot be built falls back to copying', () => {
  assert.equal(deepLink('v2rayn', URLS, NAME, win), null, 'v2rayN is copy-only');
  assert.equal(deepLink('nonsense', URLS, NAME, win), null);
  assert.equal(deepLink('singbox', { sub: URLS.sub }, NAME, win), null, 'no json address');
  assert.equal(deepLink('v2rayng', {}, NAME, win), null);
  assert.equal(
    deepLink('shadowrocket', URLS, NAME, { btoa: () => { throw new Error('no base64'); } }),
    null,
    'an encoder that fails is not a broken link',
  );
});

/* The whole table in one place: a client added to a platform list has to arrive
   with a scheme that was verified, or arrive copy-only. */
const VERIFIED = {
  v2rayng: 'v2rayng://',
  happ: 'happ://',
  singbox: 'sing-box://',
  streisand: 'streisand://',
  v2box: 'v2box://',
  shadowrocket: 'shadowrocket://',
  clashverge: 'clash-verge://',
  mihomoparty: 'mihomo://',
  v2rayn: null,
};

test('no platform offers a client with an unverified scheme', () => {
  const seen = new Set();
  for (const platform of PLATFORMS) {
    for (const client of clientsFor(platform, URLS)) {
      seen.add(client.id);
      assert.ok(client.id in VERIFIED, `${client.id} is not in the verified table`);
      const link = deepLink(client.id, URLS, NAME, win);
      const prefix = VERIFIED[client.id];
      if (prefix === null) {
        assert.equal(link, null, `${client.id} must stay copy-only`);
        assert.equal(client.importable, false);
      } else {
        assert.ok(link && link.startsWith(prefix), `${client.id}: ${link}`);
        assert.equal(client.importable, true);
      }
    }
  }
  assert.equal(seen.size, Object.keys(VERIFIED).length, 'every listed client is reachable');
  assert.deepEqual(PLATFORMS, ['android', 'ios', 'windows', 'macos']);
});
