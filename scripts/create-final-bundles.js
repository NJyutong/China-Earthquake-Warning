'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const workspace = path.resolve(__dirname, '..');
const githubRoot = path.join(workspace, 'github-release');

const bundles = [
  {
    label: 'local-private',
    source: workspace,
    output: path.join(workspace, 'Earthquake-Live-Monitoring-System-r20-local-private-final.zip'),
    entries: [
      '.github', 'cloudflare', 'data', 'docs', 'public', 'scripts',
      '.env', '.env.example', '.gitignore', '.npmrc', 'LICENSE', 'package-lock.json',
      'package.json', 'README.md', 'README_CN.md', 'release.json', 'SECURITY.md', 'server.js'
    ]
  },
  {
    label: 'github-upload',
    source: githubRoot,
    output: path.join(workspace, 'Earthquake-Live-Monitoring-System-r1.1-github-upload-final2.zip'),
    entries: [
      '.github', 'cloudflare', 'data/.gitkeep', 'docs', 'public', 'scripts',
      '.env.example', '.gitignore', '.npmrc', 'LICENSE', 'package-lock.json', 'package.json',
      'README.md', 'README_CN.md', 'release.json', 'SECURITY.md', 'server.js'
    ]
  }
];

async function createBundle(bundle) {
  fs.rmSync(bundle.output, { force: true });
  const output = fs.createWriteStream(bundle.output, { mode: 0o600 });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
  });
  archive.pipe(output);
  for (const entry of bundle.entries) {
    const source = path.join(bundle.source, entry);
    if (!fs.existsSync(source)) continue;
    const stats = fs.statSync(source);
    if (stats.isDirectory()) archive.directory(source, entry);
    else archive.file(source, { name: entry });
  }
  await archive.finalize();
  await completed;
  const bytes = fs.readFileSync(bundle.output);
  return {
    label: bundle.label,
    path: bundle.output,
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
  };
}

async function main() {
  if (!fs.existsSync(path.join(workspace, '.env'))) throw new Error('Local .env is missing.');
  if (fs.existsSync(path.join(githubRoot, '.env'))) throw new Error('github-release must not contain .env.');
  for (const bundle of bundles) console.log(JSON.stringify(await createBundle(bundle)));
  console.warn('The local-private archive contains secrets and runtime data. Never upload it to GitHub.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
