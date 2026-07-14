const CACHE_NAME = 'solncanet-v73-target-style';
const APP_SHELL = [
  '/',
  '/index.html',
  '/zapis.html',
  '/admin.html',
  '/assets/site.css',
  '/assets/admin.css',
  '/assets/site.js',
  '/assets/admin.js',
  '/assets/pwa.js',
  '/assets/logo-solncanet.png',
  '/assets/icons/icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const apiPrefixes = [
    '/list-', '/create-', '/update-', '/delete-', '/batch-',
    '/send-', '/sms-', '/calendar-', '/google-drive-', '/health'
  ];
  if (apiPrefixes.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => null);
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});
