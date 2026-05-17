// Service Worker for Pomodoro Judicial
const CACHE_NAME = 'pomodoro-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Don't fail the whole install if one fails
      return Promise.all(ASSETS.map(asset => {
        return cache.add(asset).catch(e => console.error('Failed to cache', asset, e));
      }));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (event.request.method === 'GET' && networkResponse.ok) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clonedResponse));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then(response => {
          return response || caches.match('/index.html');
        });
      })
  );
});
