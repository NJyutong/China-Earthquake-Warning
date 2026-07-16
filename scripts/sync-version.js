'use strict';

const fs = require('fs');
const path = require('path');
const { assetVersion, cacheName } = require('./version');

const root = path.resolve(__dirname, '..');
const assetPattern = /((?:i18n|styles|mobile|obs|shared|secure-storage|voice-alert|push-client|push-worker-runtime|official-map|app)\.(?:css|js)\?v=)[^"'\s]+/g;

function update(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return;
  const previous = fs.readFileSync(filePath, 'utf8');
  const next = transform(previous);
  if (next !== previous) fs.writeFileSync(filePath, next, 'utf8');
}

for (const file of ['public/index.html', 'public/mobile.html', 'public/obs.html', 'public/push-sw.js', 'public/sw.js']) {
  update(file, source => source.replace(assetPattern, `$1${assetVersion}`));
}
update('public/sw.js', source => source.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = '${cacheName}';`));
update('public/push-worker-runtime.js', source => source.replace(/const PUSH_WORKER_VERSION = '[^']+';/, `const PUSH_WORKER_VERSION = '${assetVersion}';`));
update('cloudflare/push-relay-worker.mjs', source => source.replace(/const RELAY_VERSION = '[^']+';/, `const RELAY_VERSION = '${assetVersion}';`));
for (const file of ['README.md', 'README_CN.md']) {
  update(file, source => source
    .replace(/release-[^-"\s]+-10b981/g, `release-${assetVersion}-10b981`)
    .replace(/alt="Release [^"]+"/g, `alt="Release ${assetVersion}"`));
}
fs.writeFileSync(path.join(root, 'release.json'), `${JSON.stringify({ assetVersion }, null, 2)}\n`, 'utf8');
console.log(`Synchronized release assets to ${assetVersion}.`);
