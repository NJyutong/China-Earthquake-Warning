'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ZipArchive } = require('archiver');

const root = path.resolve(__dirname, '..');
const archivePath = path.join(root, 'web.zip');
const entries = [
  'server.js', 'release.json', 'package.json', 'package-lock.json', 'README.md',
  '.env', '.env.example', '.gitignore', 'cloudflare', 'lib', 'public', 'scripts'
];

function run(script) {
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${script} failed`);
}

async function main() {
  if (!fs.existsSync(path.join(root, '.env'))) {
    throw new Error('Cannot create a production package because .env is missing.');
  }
  run('scripts/config-check.js');
  run('scripts/feature-smoke.js');
  fs.rmSync(archivePath, { force: true });
  const output = fs.createWriteStream(archivePath, { mode: 0o600 });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
  });
  archive.pipe(output);
  for (const entry of entries) {
    const source = path.join(root, entry);
    if (!fs.existsSync(source)) continue;
    if (fs.statSync(source).isDirectory()) archive.directory(source, entry);
    else archive.file(source, { name: entry });
  }
  await archive.finalize();
  await completed;
  const bytes = fs.readFileSync(archivePath);
  console.log(`Created ${archivePath}`);
  console.log(`Size: ${bytes.length} bytes`);
  console.log(`SHA-256: ${crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()}`);
  console.warn('web.zip contains production secrets from .env. Keep it private and delete it after deployment.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
