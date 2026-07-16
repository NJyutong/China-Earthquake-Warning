'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const deploy = fs.readFileSync(path.join(__dirname, 'deploy-linux.sh'), 'utf8');
const installIndex = deploy.indexOf('npm ci --omit=dev --ignore-scripts --no-audit --no-fund');
const safetyIndex = deploy.indexOf('prepare_safe_service_stop');
const stopIndex = deploy.indexOf('systemctl stop "${SERVICE_NAME}"');
const replaceIndex = deploy.indexOf('find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +');

assert(installIndex > 0, 'Production dependencies are not installed in the staging directory');
assert(safetyIndex > installIndex, 'Systemd safety setup must run only after staged installation succeeds');
assert(stopIndex > safetyIndex, 'The service must not stop before the temporary systemd safety override');
assert(replaceIndex > stopIndex, 'The live application must not be replaced before a verified safe stop');
assert.strictEqual(deploy.lastIndexOf('npm ci --omit=dev --ignore-scripts --no-audit --no-fund'), installIndex, 'npm ci must not run again after the live service stops');

for (const required of [
  'resource_preflight',
  'APP_DIR must not be a symbolic link',
  'Deployment refused before touching the running service',
  'zzzz-earthquake-deploy-safe-stop.conf',
  'ExecStop=',
  'ExecStopPost=',
  'OnSuccess=',
  'OnFailure=',
  'SuccessAction=none',
  'FailureAction=none',
  'Restart=no',
  'Verified safe systemd stop profile',
  'DEPLOY_SCRIPT_REVISION="r26-nonblocking-push-preflight-1"',
  'REQUIRE_PUSH_READY="${REQUIRE_PUSH_READY:-0}"',
  'continuing deployment because REQUIRE_PUSH_READY=0',
  '--dns-result-order=ipv4first'
]) {
  assert(deploy.includes(required), `Missing deployment safeguard: ${required}`);
}

assert(!/(?:^|\s)(?:shutdown|poweroff|reboot|halt|init\s+[06])(?:\s|$)/m.test(deploy), 'Deployment script contains an operating-system shutdown command');
assert(!/systemctl\s+(?:reboot|poweroff|halt|suspend|hibernate)/.test(deploy), 'Deployment script contains a systemd power-state command');

console.log(JSON.stringify({ ok: true, revision: 'r26-nonblocking-push-preflight-1', checks: 19 }));
