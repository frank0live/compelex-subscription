/* Every value here is one an administrator can type into the panel, so the
   question each test answers is the same: can this become a link, and if so,
   which one. Anything unclassifiable must fail closed. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SUPPORT_SCHEMES, LINK_SCHEMES, safe, imageSrc, runs } from '../src/scripts/url.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

test('a support address is linked only for a scheme a browser should open', () => {
  assert.equal(safe('https://t.me/example', SUPPORT_SCHEMES), 'https://t.me/example');
  assert.equal(safe('http://help.example.com/x', SUPPORT_SCHEMES), 'http://help.example.com/x');
  assert.equal(safe('mailto:help@example.com', SUPPORT_SCHEMES), 'mailto:help@example.com');
  assert.equal(safe('tg://resolve?domain=example', SUPPORT_SCHEMES), 'tg://resolve?domain=example');
  assert.equal(safe('  https://t.me/example  ', SUPPORT_SCHEMES), 'https://t.me/example');
});

test('script-bearing and opaque schemes are refused', () => {
  const refused = [
    'javascript:alert(document.domain)',
    '  javascript:alert(1)',
    'JavaScript:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'about:blank',
    '//example.com/x',
    'example.com',
    '',
    '   ',
    null,
    undefined,
    42,
  ];
  for (const value of refused) {
    assert.equal(safe(value, SUPPORT_SCHEMES), null, `safe(${JSON.stringify(value)})`);
    assert.equal(safe(value, LINK_SCHEMES), null, `safe(${JSON.stringify(value)}, links)`);
  }
  assert.equal(safe('tg://resolve?domain=x', LINK_SCHEMES), null, 'an announcement is web-only');
});

test('a logo is an inlined image or a hosted one, and nothing else', () => {
  assert.equal(imageSrc(PNG), PNG);
  assert.equal(imageSrc('  ' + PNG + '  '), PNG);
  assert.equal(imageSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  assert.equal(imageSrc('https://cdn.example.com/logo.png'), 'https://cdn.example.com/logo.png');

  const refused = [
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png,notbase64',
    'data:image/png;base64,not base64 at all',
    'data:',
    'javascript:alert(1)',
    'logo.png',
    '',
    null,
    PNG.replace('base64', 'utf8'),
  ];
  for (const value of refused) {
    assert.equal(imageSrc(value), null, `imageSrc(${JSON.stringify(value)})`);
  }
});

test('announcement text is split into plain runs and linkable addresses', () => {
  assert.deepEqual(runs('Maintenance on Sunday.'), [{ text: 'Maintenance on Sunday.' }]);
  assert.deepEqual(runs(''), []);

  assert.deepEqual(runs('See https://status.example.com for details'), [
    { text: 'See ' },
    { text: 'https://status.example.com', href: 'https://status.example.com/' },
    { text: ' for details' },
  ]);

  const trailing = runs('Read https://example.com/notice.');
  assert.equal(trailing[1].text, 'https://example.com/notice', 'the full stop is not part of it');
  assert.equal(trailing[2].text, '.');

  const two = runs('a https://one.example.com b https://two.example.com c');
  assert.equal(two.filter((r) => r.href).length, 2);
  assert.equal(two.map((r) => r.text).join(''), 'a https://one.example.com b https://two.example.com c');
});

test('nothing in an announcement becomes markup or a non-web link', () => {
  const text = '<script>alert(1)</script> visit javascript:alert(1) or ftp://example.com/x';
  const parts = runs(text);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].href, undefined);
  assert.equal(parts[0].text, text, 'the text is preserved exactly, as text');
});

/* The scanner is a module-level global regex, so a leaked lastIndex would make
   the second announcement of a session render differently from the first. */
test('the scanner is reusable', () => {
  const text = 'See https://status.example.com for details';
  assert.deepEqual(runs(text), runs(text));
  assert.deepEqual(runs('no link here'), [{ text: 'no link here' }]);
  assert.deepEqual(runs(text), runs(text));
});
