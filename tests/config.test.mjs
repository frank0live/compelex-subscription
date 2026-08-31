/* Each value here is one the panel can hand the page in its link list, so the
   question is always: is this a configuration a subscriber can use, which
   protocol is it, and what should it be called. A link that is not usable is
   dropped; a usable link whose name cannot be read is still kept. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { classify, parseAll, mtprotoWebUrl, amneziaConf, wireguardConf, confFilename } from '../src/scripts/config.js';

const vmess = (obj) => 'vmess://' + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
const vpn = (conf) => 'vpn://' + Buffer.from(conf, 'utf8').toString('base64url');
const CONF = '# 🇷🇺 Moscow\n[Interface]\nPrivateKey = x\n[Peer]\nPublicKey = y';

test('each supported scheme is classified to its protocol', () => {
  assert.equal(classify('vless://u@h:443?type=ws#x').protocol, 'vless');
  assert.equal(classify('trojan://p@h:443#x').protocol, 'trojan');
  assert.equal(classify('ss://YWVzOnBhc3M=@h:8388#x').protocol, 'shadowsocks');
  assert.equal(classify('hysteria2://a@h:443#x').protocol, 'hysteria2');
  assert.equal(classify('hy2://a@h:443#x').protocol, 'hysteria2');
  assert.equal(classify('hysteria://a@h:443#x').protocol, 'hysteria');
  assert.equal(classify(vmess({ ps: 'x' })).protocol, 'vmess');
  assert.equal(classify('wireguard://k@h:51820?publickey=a#x').protocol, 'wireguard');
  assert.equal(classify(vpn(CONF)).protocol, 'amneziawg');
  assert.equal(classify('tg://proxy?server=1&port=2&secret=ee').protocol, 'mtproto');
});

test('the name and flag are read from the right place per protocol', () => {
  const vl = classify('vless://u@h:443#%F0%9F%87%BA%F0%9F%87%B8%20Los%20Angeles');
  assert.equal(vl.name, '🇺🇸 Los Angeles');
  assert.equal(vl.displayName, 'Los Angeles');
  assert.equal(vl.flag, '🇺🇸');

  assert.equal(classify('trojan://p@h:443#Trojan+Server').name, 'Trojan Server', 'a plus is a space');

  const vm = classify(vmess({ ps: '🇩🇪 Berlin', add: 'h', port: '443', id: 'u' }));
  assert.equal(vm.name, '🇩🇪 Berlin');
  assert.equal(vm.displayName, 'Berlin');
  assert.equal(vm.flag, '🇩🇪');

  const aw = classify(vpn(CONF));
  assert.equal(aw.name, '🇷🇺 Moscow');
  assert.equal(aw.flag, '🇷🇺');

  const mt = classify('tg://proxy?server=1.2.3.4&port=443&secret=eeabc');
  assert.equal(mt.name, '', 'mtproto carries no remark');
  assert.equal(mt.flag, '');
});

test('specialized schemes are marked and still listed as copyable configs', () => {
  const wg = classify('wireguard://k@h:51820?publickey=a#WG%20Home');
  assert.equal(wg.category, 'specialized');
  assert.equal(wg.specialized, 'wireguard');
  assert.equal(wg.copyable, true);
  assert.equal(wg.qr, true);
  assert.equal(wg.name, 'WG Home');
  assert.equal(classify(vpn(CONF)).specialized, 'amneziawg');
  assert.equal(classify('tg://proxy?secret=ee').specialized, 'mtproto');
});

test('the raw link is preserved byte for byte', () => {
  const raw = 'vless://u@h:443?type=ws&security=reality&pbk=AbC%2Fd#Node';
  assert.equal(classify(raw).raw, raw);
});

test('a recognised but unreadable link is kept, not dropped', () => {
  const bad = classify('vmess://this-is-not-valid-base64!!!');
  assert.notEqual(bad, null);
  assert.equal(bad.protocol, 'vmess');
  assert.equal(bad.name, '');
  assert.equal(bad.copyable, true);
  assert.equal(classify('vless://u@h:443').name, '', 'no fragment, no name');
});

test('anything that is not a usable config is dropped', () => {
  const dropped = [
    'http://example.com', 'https://example.com/sub', 'javascript:alert(1)',
    'data:text/html,x', 'ftp://h/x', 'socks://h', 'file:///x', 'about:blank',
    '', '   ', 'not a url', null, undefined, 42,
  ];
  for (const v of dropped) assert.equal(classify(v), null, JSON.stringify(v));
});

test('a tg proxy link has a Telegram web form; other schemes do not', () => {
  assert.equal(
    mtprotoWebUrl('tg://proxy?server=1.2.3.4&port=443&secret=eeabc'),
    'https://t.me/proxy?server=1.2.3.4&port=443&secret=eeabc',
  );
  assert.equal(mtprotoWebUrl('tg://resolve?domain=x'), '');
  assert.equal(mtprotoWebUrl('vless://u@h:443#x'), '');
});

test('amneziaConf decodes the embedded configuration', () => {
  assert.equal(amneziaConf(vpn(CONF)), CONF);
  assert.equal(amneziaConf('vpn://not!!base64'), '');
});

test('parseAll keeps order, drops unknowns and collapses duplicates', () => {
  const dup = 'vless://u@h:443#A';
  const list = [dup, 'http://x', dup, 'trojan://p@h:443#B', 'garbage', 'tg://proxy?secret=ee'];
  assert.deepEqual(parseAll(list).map((c) => c.protocol), ['vless', 'trojan', 'mtproto']);
  assert.equal(parseAll(null).length, 0);
  assert.equal(parseAll('nope').length, 0);
});

/* WireGuard's app imports a .conf, not the wireguard:// URI the panel emits, so
   the download rebuilds one from the URI's own fields — the same reconstruction
   the detail dialog shows, inventing nothing but the full-tunnel AllowedIPs. */
test('wireguardConf rebuilds a usable [Interface]/[Peer] file from the URI', () => {
  const raw = 'wireguard://PRIVKEY123@wg.example.com:51820'
    + '?publickey=PUBKEY456&address=10.0.0.2%2F32&dns=1.1.1.1&mtu=1420'
    + '&presharedkey=PSK789&keepalive=25#%F0%9F%87%B3%F0%9F%87%B1%20Amsterdam';
  const conf = wireguardConf(raw);
  const lines = conf.split('\n');
  assert.equal(lines[0], '[Interface]');
  assert.ok(conf.includes('PrivateKey = PRIVKEY123'));
  assert.ok(conf.includes('Address = 10.0.0.2/32'), 'the %2F is decoded to a slash');
  assert.ok(conf.includes('DNS = 1.1.1.1'));
  assert.ok(conf.includes('MTU = 1420'));
  assert.ok(conf.includes('\n[Peer]'));
  assert.ok(conf.includes('PublicKey = PUBKEY456'));
  assert.ok(conf.includes('PresharedKey = PSK789'));
  assert.ok(conf.includes('Endpoint = wg.example.com:51820'));
  assert.ok(conf.includes('PersistentKeepalive = 25'));
  assert.ok(conf.endsWith('\n'), 'ends with a trailing newline');
  assert.ok(!conf.includes('Amsterdam'), 'the remark is not written into the file');
});

test('wireguardConf supplies a full-tunnel AllowedIPs only when the URI omits it', () => {
  const bare = wireguardConf('wireguard://k@h:51820?publickey=p');
  assert.ok(bare.includes('AllowedIPs = 0.0.0.0/0, ::/0'), 'a default is added');
  const explicit = wireguardConf('wireguard://k@h:51820?publickey=p&allowedips=10.0.0.0%2F24');
  assert.ok(explicit.includes('AllowedIPs = 10.0.0.0/24'), 'a given value is kept');
  assert.ok(!explicit.includes('0.0.0.0/0'), 'and not doubled with the default');
});

test('wireguardConf returns nothing for a link it cannot use', () => {
  assert.equal(wireguardConf('wireguard://no-endpoint-here'), '', 'no @ means no endpoint');
  assert.equal(wireguardConf('wireguard://@h:51820'), '', 'an empty key is refused');
  assert.equal(wireguardConf('wireguard://k@'), '', 'an empty endpoint is refused');
  assert.equal(wireguardConf('vless://u@h:443#x'), '', 'a non-wireguard scheme');
  assert.equal(wireguardConf(''), '');
  assert.equal(wireguardConf(null), '');
  assert.equal(wireguardConf(42), '');
});

/* The download name is derived from the remark, and a remark is attacker-set,
   so it must never carry a path separator, a reserved character, a control
   byte, a leading dot, or run unbounded — and when nothing usable is left the
   fixed fallback stands in. */
test('confFilename produces a safe, bounded name and never a path', () => {
  assert.equal(confFilename('🇳🇱 Amsterdam WG', 'wireguard'), 'Amsterdam-WG.conf');
  assert.equal(confFilename('Frankfurt', 'wireguard'), 'Frankfurt.conf');
  assert.equal(confFilename('a/b\\c', 'wireguard'), 'a-b-c.conf', 'separators fold to hyphens');
  assert.equal(confFilename('../../etc/passwd', 'wireguard'), 'etc-passwd.conf', 'no traversal');
  assert.equal(confFilename('a:b*c?d"e<f>g|h', 'wireguard'), 'a-b-c-d-e-f-g-h.conf', 'reserved chars go');
  assert.equal(confFilename('...hidden', 'wireguard'), 'hidden.conf', 'a leading dot is dropped');
  assert.equal(confFilename('name.', 'wireguard'), 'name.conf', 'a trailing dot is dropped');
  assert.equal(confFilename('中国 节点', 'wireguard'), '中国-节点.conf', 'non-Latin letters survive');
  const long = confFilename('x'.repeat(200), 'wireguard');
  assert.ok(long.length <= 64 + '.conf'.length, 'the name is capped');
});

test('confFilename falls back when the remark yields nothing usable', () => {
  assert.equal(confFilename('🇩🇪🇫🇷', 'wireguard'), 'wireguard.conf', 'only flags leaves nothing');
  assert.equal(confFilename('', 'amneziawg'), 'amneziawg.conf');
  assert.equal(confFilename('///', 'wireguard'), 'wireguard.conf');
  assert.equal(confFilename(null, 'wireguard'), 'wireguard.conf');
  assert.equal(confFilename('   ', 'wireguard'), 'wireguard.conf');
  assert.equal(confFilename('', ''), 'config.conf', 'a blank fallback has its own default');
  const control = confFilename('a\u0001\u0002\u001f\u007fb', 'wireguard');
  assert.equal(control, 'ab.conf', 'control bytes are stripped, not folded');
});
