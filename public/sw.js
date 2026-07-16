importScripts('/push-worker-runtime.js?v=r1.1');

const CACHE_NAME = 'quake-mobile-r1.1';
const CORE_ASSETS = [
  '/mobile.css?v=r1.1',
  '/mobile.js?v=r1.1',
  '/vendor/pinyin-pro/index.js?v=3.18.2',
  '/i18n.js?v=r1.1',
  '/shared.js?v=r1.1',
  '/secure-storage.js?v=r1.1',
  '/voice-alert.js?v=r1.1',
  '/push-client.js?v=r1.1',
  '/push-worker-runtime.js?v=r1.1',
  '/china-admin.js',
  '/official-map.js?v=r1.1',
  '/app-icon.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(CORE_ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  if (/^\/(?:config|sources|history|ip-location|reverse-location|arrival|geocode|api\/|push\/|map\/|debug\/)/.test(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(match => {
        if (match) return match;
        if (event.request.mode === 'navigate' && url.pathname.startsWith('/mobile')) {
          return caches.match('/mobile');
        }
        return Response.error();
      }))
  );
});
