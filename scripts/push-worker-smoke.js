'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { assetVersion } = require('./version');

async function main() {
  const handlers = new Map();
  const shown = [];
  const acknowledgements = [];
  const endpoint = 'https://notify.example.test/subscription';
  const desktopTestId = '12345678-1234-4123-8123-123456789abc';
  const mobileTestId = '22345678-1234-4123-8123-123456789abc';
  const desktopTag = `quake-test-${desktopTestId}`;
  const mobileTag = `quake-test-${mobileTestId}`;
  const registration = {
    scope: 'https://www.cnquake.xyz/desktop-push/',
    async showNotification(title, options) {
      shown.push({ title, options });
    },
    async getNotifications(filter) {
      return shown
        .filter(item => !filter || !filter.tag || item.options.tag === filter.tag)
        .map(item => ({ tag: item.options.tag }));
    },
    pushManager: {
      async getSubscription() {
        return { endpoint };
      }
    }
  };
  const worker = {
    registration,
    location: { origin: 'https://www.cnquake.xyz' },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    clients: {
      async matchAll() { return []; },
      async openWindow() { return null; }
    }
  };
  const runtimePath = path.join(__dirname, '..', 'public', 'push-worker-runtime.js');
  const source = fs.readFileSync(runtimePath, 'utf8');
  const context = vm.createContext({
    self: worker,
    URL,
    Uint8Array,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: async (url, options = {}) => {
      if (url === '/push/test-ack') acknowledgements.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });
  vm.runInContext(source, context, { filename: runtimePath });

  async function dispatchPush(payload) {
    let pending = null;
    handlers.get('push')({
      data: { json: () => payload },
      waitUntil(promise) { pending = promise; }
    });
    await pending;
  }

  await dispatchPush({
    title: '桌面测试地震',
    body: '桌面设备通知测试',
    tag: desktopTag,
    testId: desktopTestId,
    presentationProfile: 'desktop',
    requireInteraction: true,
    timestamp: new Date().toISOString()
  });

  registration.scope = 'https://www.cnquake.xyz/';
  await dispatchPush({
    title: '手机测试地震',
    body: '手机设备通知测试',
    tag: mobileTag,
    testId: mobileTestId,
    presentationProfile: 'mobile',
    requireInteraction: true,
    timestamp: new Date().toISOString()
  });

  assert.strictEqual(shown.length, 2, 'Service Worker did not create both platform notifications');
  assert.strictEqual(shown[0].options.tag, desktopTag, 'Desktop notification tag is not unique');
  assert.strictEqual(shown[0].options.renotify, true, 'Test notification does not request renotify');
  assert.strictEqual(shown[0].options.requireInteraction, true, 'Test notification is not persistent');
  assert.strictEqual(shown[0].options.vibrate, undefined, 'Desktop notification unexpectedly uses mobile vibration');
  assert.deepStrictEqual(Array.from(shown[1].options.vibrate), [280, 120, 280], 'Mobile notification lacks attention vibration');
  assert.deepStrictEqual(acknowledgements[0], {
    testId: desktopTestId,
    endpoint,
    notificationTag: desktopTag,
    notificationPresent: true,
    presentationVerification: 'get-notifications',
    workerVersion: assetVersion,
    workerScope: '/desktop-push/',
    presentationProfile: 'desktop',
    notificationCount: 1
  });
  assert.deepStrictEqual(acknowledgements[1], {
    testId: mobileTestId,
    endpoint,
    notificationTag: mobileTag,
    notificationPresent: true,
    presentationVerification: 'get-notifications',
    workerVersion: assetVersion,
    workerScope: '/',
    presentationProfile: 'mobile',
    notificationCount: 1
  });
  console.log(JSON.stringify({ ok: true, workerVersion: assetVersion, desktopVerified: true, mobileVerified: true }));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
