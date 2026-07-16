'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const checkScript = String(process.argv[2] || '').trim();
const obsDisabled = process.argv.includes('--obs-disabled');
if (!checkScript) throw new Error('Usage: node scripts/with-server.js <check-script>');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function run(script, env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script], { cwd: root, env, stdio: 'inherit' });
    child.once('exit', code => resolve(code === null ? 1 : code));
  });
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => child.once('exit', resolve));
}

async function waitUntilReady(url, server, errors) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(errors.join('').trim() || `Server exited with code ${server.exitCode}`);
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch (_error) {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local test server');
}

async function main() {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quake-smoke-'));
  const password = `Smoke-${crypto.randomBytes(18).toString('base64url')}!A1`;
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    PUBLIC_ORIGIN: 'https://example.com',
    DEBUG_PASSWORD: password,
    DATA_DIR: dataDir,
    SKIP_LOCAL_ENV: 'true',
    OBS_ENABLED: obsDisabled ? 'false' : 'true',
    SMOKE_BASE_URL: baseUrl,
    UI_TEST_BASE_URL: baseUrl,
    UI_TEST_PASSWORD: password
  };
  const errors = [];
  const server = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', chunk => errors.push(String(chunk)));
  try {
    await waitUntilReady(baseUrl, server, errors);
    process.exitCode = await run(checkScript, env);
  } finally {
    if (server.exitCode === null) server.kill();
    await waitForExit(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
