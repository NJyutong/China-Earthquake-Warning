'use strict';

const PUSH_WORKER_VERSION = 'r1.1';
const PUSH_TEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

self.__QUAKE_PUSH_WORKER_VERSION__ = PUSH_WORKER_VERSION;

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_error) {
    data = {};
  }
  event.waitUntil(showPushNotification(data));
});

self.addEventListener('pushsubscriptionchange', event => {
  const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint || '';
  event.waitUntil(resubscribe(oldEndpoint));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data && event.notification.data.url || '/', self.location.origin);
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : `${self.location.origin}/`;
  event.waitUntil(openNotificationTarget(targetUrl));
});

async function showPushNotification(data) {
  const title = data.title || '地震提醒';
  const testId = PUSH_TEST_ID_PATTERN.test(String(data.testId || '')) ? String(data.testId) : '';
  const presentationProfile = data.presentationProfile === 'mobile' || data.presentationProfile === 'desktop'
    ? data.presentationProfile
    : presentationProfileForRegistration();
  const options = {
    body: data.body || '收到新的地震信息。',
    icon: data.icon || '/app-icon.png',
    tag: data.tag || 'quake-alert',
    renotify: true,
    silent: false,
    requireInteraction: data.requireInteraction === true,
    timestamp: Number.isFinite(Date.parse(data.timestamp)) ? Date.parse(data.timestamp) : Date.now(),
    data: {
      url: data.url || '/',
      testId,
      presentationProfile
    }
  };
  if (presentationProfile === 'mobile') {
    options.badge = data.badge || data.icon || '/app-icon.png';
    options.vibrate = Array.isArray(data.vibrate) && data.vibrate.length
      ? data.vibrate.slice(0, 9).map(value => Math.max(0, Math.min(2000, Number(value) || 0)))
      : [280, 120, 280];
  }
  await self.registration.showNotification(title, options);
  if (testId) {
    const verification = await verifyNotificationCreated(options.tag);
    await acknowledgePushTest(testId, options.tag, presentationProfile, verification);
  }
}

async function verifyNotificationCreated(tag) {
  if (typeof self.registration.getNotifications !== 'function') {
    return { notificationPresent: true, presentationVerification: 'show-promise' };
  }
  const notifications = await self.registration.getNotifications({ tag });
  return {
    notificationPresent: notifications.some(notification => notification.tag === tag),
    presentationVerification: 'get-notifications',
    notificationCount: notifications.length
  };
}

async function acknowledgePushTest(testId, notificationTag, presentationProfile, verification) {
  if (!verification.notificationPresent) throw new Error('Created test notification could not be found');
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription || !subscription.endpoint) throw new Error('Push subscription is unavailable for device acknowledgement');
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch('/push/test-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          testId,
          endpoint: subscription.endpoint,
          notificationTag,
          notificationPresent: verification.notificationPresent,
          presentationVerification: verification.presentationVerification,
          workerVersion: PUSH_WORKER_VERSION,
          workerScope: registrationScopePath(),
          presentationProfile,
          notificationCount: Number(verification.notificationCount) || 1
        })
      });
      if (response.ok) return;
      lastError = new Error(`Push acknowledgement returned HTTP ${response.status}`);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    await wait(400 * (attempt + 1));
  }
  throw lastError || new Error('Push acknowledgement failed');
}

async function resubscribe(oldEndpoint) {
  const response = await fetch('/push/public-key', { cache: 'no-store', credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok || !data.supported || !data.publicKey) throw new Error('Push service is unavailable');
  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey)
  });
  const syncResponse = await fetch('/push/resubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      oldEndpoint,
      subscription: subscription.toJSON ? subscription.toJSON() : subscription,
      clientPath: clientPathForRegistration()
    })
  });
  if (!syncResponse.ok) throw new Error(`Push resubscribe returned HTTP ${syncResponse.status}`);
}

async function openNotificationTarget(targetUrl) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if (!client.url.startsWith(self.location.origin) || !('focus' in client)) continue;
    if ('navigate' in client) await client.navigate(targetUrl);
    return client.focus();
  }
  return self.clients.openWindow(targetUrl);
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function registrationScopePath() {
  try {
    return new URL(self.registration.scope, self.location.origin).pathname;
  } catch (_error) {
    return '';
  }
}

function presentationProfileForRegistration() {
  return registrationScopePath() === '/desktop-push/' ? 'desktop' : 'mobile';
}

function clientPathForRegistration() {
  return presentationProfileForRegistration() === 'mobile' ? '/mobile.html' : '/';
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}
