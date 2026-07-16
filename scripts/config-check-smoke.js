'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const clearedNames = [
  'AMAP_JS_KEY', 'AMAP_API_KEY', 'AMAP_KEY', 'AMAP_TOKEN', 'GAODE_MAPS_API_KEY',
  'AMAP_SECURITY_JSCODE', 'AMAP_JSCODE', 'GAODE_SECURITY_JSCODE',
  'YANDEX_MAPS_API_KEY', 'YANDEX_MAPS_JS_KEY', 'GOOGLE_MAPS_JS_KEY', 'GOOGLE_MAPS_API_KEY',
  'TIANDITU_TOKEN', 'TIANDITU_TK', 'ESRI_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT', 'PUSH_RELAY_URL', 'PUSH_RELAY_SECRET', 'PUSH_PROXY_URL',
  'PUSH_TEST_DEVICE_ACK_TIMEOUT_MS'
];

function check(overrides = {}) {
  const env = { ...process.env };
  for (const name of clearedNames) env[name] = '';
  Object.assign(env, {
    PUBLIC_ORIGIN: 'https://example.com',
    DEBUG_PASSWORD: 'ConfigSmoke1!',
    WEB_PUSH_ENABLED: 'false',
    OBS_ENABLED: 'true'
  }, overrides);
  return spawnSync(process.execPath, ['scripts/config-check.js'], { cwd: root, env, encoding: 'utf8' });
}

const keylessMaps = check();
if (keylessMaps.status !== 0 || !keylessMaps.stderr.includes('keyless Google, Esri, and OpenStreetMap fallbacks remain available')) {
  throw new Error('Keyless map configuration should pass with accurate fallback warnings');
}
if (check({ AMAP_JS_KEY: 'key-without-security-code' }).status === 0) {
  throw new Error('Partial AMap configuration should fail');
}
if (check({ WEB_PUSH_ENABLED: 'true' }).status === 0) {
  throw new Error('Enabled Web Push without VAPID settings should fail');
}
if (check({ PUSH_TEST_DEVICE_ACK_TIMEOUT_MS: '9999' }).status === 0) {
  throw new Error('Push device acknowledgement timeout below the safe range should fail');
}
if (check({ PUSH_TEST_DEVICE_ACK_TIMEOUT_MS: '20000' }).status !== 0) {
  throw new Error('Valid push device acknowledgement timeout should pass');
}
if (check({
  WEB_PUSH_ENABLED: 'true',
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:admin@example.com'
}).status !== 0) {
  throw new Error('Complete Web Push configuration should pass');
}

console.log('Configuration checks passed.');
