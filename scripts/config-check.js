const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const debugPasswordPath = path.join(root, 'data', 'debug-password.json');
const failures = [];
const warnings = [];

loadEnvFile();

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    process.env[match[1]] = unquote(match[2]);
  }
}

function unquote(value) {
  const source = String(value || '').trim();
  if (source.length >= 2 && ((source[0] === '"' && source.at(-1) === '"') || (source[0] === "'" && source.at(-1) === "'"))) {
    return source.slice(1, -1);
  }
  return source;
}

function firstValue(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function debugPassword() {
  const fromEnv = String(process.env.DEBUG_PASSWORD || '');
  if (fromEnv) return { value: fromEnv, source: '.env/environment' };
  try {
    const stored = JSON.parse(fs.readFileSync(debugPasswordPath, 'utf8'));
    return { value: String(stored.password || ''), source: 'data/debug-password.json' };
  } catch (_error) {
    return { value: '', source: 'missing' };
  }
}

function passwordPolicyError(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 128) return 'must contain 8 to 128 characters';
  if (!/[A-Z]/.test(password)) return 'must contain an uppercase letter';
  if (!/[0-9]/.test(password)) return 'must contain a number';
  if (!/[^A-Za-z0-9\s]/.test(password)) return 'must contain a special character';
  return '';
}

const amapKey = firstValue(['AMAP_JS_KEY', 'AMAP_API_KEY', 'AMAP_KEY', 'AMAP_TOKEN', 'GAODE_MAPS_API_KEY']);
const amapSecurityCode = firstValue(['AMAP_SECURITY_JSCODE', 'AMAP_JSCODE', 'GAODE_SECURITY_JSCODE']);
if (Boolean(amapKey) !== Boolean(amapSecurityCode)) {
  failures.push('AMap Web JS key and security code must be configured together');
} else if (!amapKey) {
  warnings.push('AMap is not configured and will be unavailable');
}

const optionalMaps = {
  yandex: firstValue(['YANDEX_MAPS_API_KEY', 'YANDEX_MAPS_JS_KEY']),
  google: firstValue(['GOOGLE_MAPS_JS_KEY', 'GOOGLE_MAPS_API_KEY']),
  tianditu: firstValue(['TIANDITU_TOKEN', 'TIANDITU_TK']),
  esri: firstValue(['ESRI_API_KEY'])
};
if (!optionalMaps.yandex) warnings.push('Yandex Maps is not configured and will be unavailable');
if (!optionalMaps.google) warnings.push('Google Maps JS key is not configured; the official share embed fallback will be used');
if (!optionalMaps.tianditu) warnings.push('Tianditu server token is not configured; users can still enter a token in the browser');
if (!optionalMaps.esri) warnings.push('Esri API key is not configured; the public ArcGIS basemap will be used');
if (!amapKey && Object.values(optionalMaps).every(value => !value)) {
  warnings.push('No keyed commercial map source is configured; keyless Google, Esri, and OpenStreetMap fallbacks remain available');
}

const publicOrigin = String(process.env.PUBLIC_ORIGIN || '').trim();
const secureOrigin = /^https:\/\/[^\s/]+(?:\/.*)?$/i.test(publicOrigin);
if (!secureOrigin) failures.push('PUBLIC_ORIGIN must be an https:// URL');

const password = debugPassword();
const passwordError = passwordPolicyError(password.value);
if (passwordError) failures.push(`Debug password ${passwordError}`);

if (!firstValue(['CWA_API_KEY'])) warnings.push('CWA_API_KEY is not configured; the Taiwan CWA source may be unavailable');

const vapidPublic = firstValue(['VAPID_PUBLIC_KEY']);
const vapidPrivate = firstValue(['VAPID_PRIVATE_KEY']);
const webPushSetting = String(process.env.WEB_PUSH_ENABLED || '').trim();
if (webPushSetting && !/^(?:1|0|true|false|yes|no|on|off)$/i.test(webPushSetting)) {
  failures.push('WEB_PUSH_ENABLED must be true or false');
}
const webPushEnabled = /^(?:1|true|yes|on)$/i.test(webPushSetting) || Boolean(vapidPublic || vapidPrivate);
if (webPushEnabled) {
  if (!vapidPublic || !vapidPrivate) failures.push('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required when Web Push is enabled');
  const subject = String(process.env.VAPID_SUBJECT || '').trim();
  if (!/^mailto:[^\s@]+@[^\s@]+$/i.test(subject) && !/^https:\/\/[^\s/]+(?:\/.*)?$/i.test(subject)) {
    failures.push('VAPID_SUBJECT must be a mailto: address or HTTPS URL when Web Push is enabled');
  }
}

const pushRelayUrl = String(process.env.PUSH_RELAY_URL || '').trim();
const pushRelaySecret = String(process.env.PUSH_RELAY_SECRET || '').trim();
const pushProxyUrl = String(process.env.PUSH_PROXY_URL || '').trim();
if (Boolean(pushRelayUrl) !== Boolean(pushRelaySecret)) {
  failures.push('PUSH_RELAY_URL and PUSH_RELAY_SECRET must be configured together');
} else if (pushRelayUrl) {
  try {
    const url = new URL(pushRelayUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hash) throw new Error('invalid');
  } catch (_error) {
    failures.push('PUSH_RELAY_URL must be a public HTTPS URL without embedded credentials');
  }
  if (pushRelaySecret.length < 32 || pushRelaySecret.length > 256) failures.push('PUSH_RELAY_SECRET must contain 32 to 256 characters');
}
if (pushProxyUrl) {
  try {
    const url = new URL(pushProxyUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hash) throw new Error('invalid');
  } catch (_error) {
    failures.push('PUSH_PROXY_URL must be a valid HTTP or HTTPS proxy URL');
  }
}
if (pushRelayUrl && pushProxyUrl) warnings.push('PUSH_RELAY_URL takes precedence over PUSH_PROXY_URL');

const pushAckTimeoutText = String(process.env.PUSH_TEST_DEVICE_ACK_TIMEOUT_MS || '').trim();
if (pushAckTimeoutText) {
  const pushAckTimeout = Number(pushAckTimeoutText);
  if (!Number.isInteger(pushAckTimeout) || pushAckTimeout < 10000 || pushAckTimeout > 45000) {
    failures.push('PUSH_TEST_DEVICE_ACK_TIMEOUT_MS must be an integer from 10000 to 45000');
  }
}

const obsSetting = String(process.env.OBS_ENABLED || '').trim();
if (obsSetting && !/^(?:1|0|true|false|yes|no|on|off)$/i.test(obsSetting)) {
  failures.push('OBS_ENABLED must be true or false');
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) failures.push('PORT must be an integer from 1 to 65535');

if (process.platform !== 'win32' && fs.existsSync(envPath)) {
  const mode = fs.statSync(envPath).mode & 0o777;
  if (mode & 0o077) warnings.push('.env is readable or writable by group/others; run chmod 600 .env');
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Production configuration check passed.');
}
