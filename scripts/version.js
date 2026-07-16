'use strict';

const { version: packageVersion } = require('../package.json');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion)) {
  throw new Error('package.json version must be valid SemVer');
}

const parts = packageVersion.split('-')[0].split('.').map(Number);
const stableVersion = parts[2] === 0
  ? parts[1] === 0 ? String(parts[0]) : `${parts[0]}.${parts[1]}`
  : parts.join('.');
const prerelease = packageVersion.includes('-') ? `-${packageVersion.split('-').slice(1).join('-')}` : '';
const assetVersion = `r${stableVersion}${prerelease}`;

module.exports = {
  packageVersion,
  assetVersion,
  cacheName: `quake-mobile-${assetVersion}`
};
