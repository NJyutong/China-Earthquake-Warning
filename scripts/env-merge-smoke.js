const assert = require('assert');
const { mergeEnv } = require('./merge-env');

const current = [
  '# server-only settings stay in place',
  'AMAP_JS_KEY=old-key',
  'PUBLIC_ORIGIN=https://www.cnquake.xyz',
  'VAPID_PRIVATE_KEY=server-secret',
  'PUSH_RELAY_URL=https://push-relay.cnquake.xyz/',
  'PUSH_RELAY_SECRET=server-relay-secret-that-must-not-change',
  '',
].join('\n');
const incoming = [
  'AMAP_JS_KEY=new-key',
  'PUBLIC_ORIGIN="https://www.cnquake.xyz"',
  'YANDEX_DAILY_LIMIT=100',
  'DNS_RESULT_ORDER=ipv4first',
  '',
].join('\n');

const merged = mergeEnv(current, incoming);
assert.match(merged, /^AMAP_JS_KEY=new-key$/m);
assert.match(merged, /^PUBLIC_ORIGIN=https:\/\/www\.cnquake\.xyz$/m);
assert.match(merged, /^VAPID_PRIVATE_KEY=server-secret$/m);
assert.match(merged, /^PUSH_RELAY_URL=https:\/\/push-relay\.cnquake\.xyz\/$/m);
assert.match(merged, /^PUSH_RELAY_SECRET=server-relay-secret-that-must-not-change$/m);
assert.match(merged, /^YANDEX_DAILY_LIMIT=100$/m);
assert.match(merged, /^DNS_RESULT_ORDER=ipv4first$/m);
assert.strictEqual(mergeEnv(merged, incoming), merged);
assert.throws(() => mergeEnv('', 'A=1\nA=2\n'), /Duplicate environment variable/);

console.log('Environment merge smoke test passed.');
