// ─────────────────────────────────────────────────────────────
//  sw.js  –  Nasza Tablica  |  Webpushr Service Worker
// ─────────────────────────────────────────────────────────────
importScripts('https://cdn.webpushr.com/sw-server.min.js');

const CACHE = 'tablica-v5';
const ASSETS = ['./', './index.html', './app.js', './manifest.json', './icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('firestore') || url.includes('googleapis') ||
      url.includes('gstatic')   || url.includes('tailwindcss') ||
      url.includes('webpushr'))  return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.startsWith(self.registration.scope));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
