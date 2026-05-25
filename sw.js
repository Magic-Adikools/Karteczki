// ─────────────────────────────────────────────────────────────
//  sw.js  –  Nasza Tablica  |  Firebase Cloud Messaging
// ─────────────────────────────────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config Firebase – uzupełnij swoimi danymi
firebase.initializeApp({
  apiKey:    "AIzaSyCazP8eaEu66_q05CJM_ay70r0g0YDnZaY",
  authDomain:"karteczki-883d8.firebaseapp.com",
  projectId: "karteczki-883d8",
  messagingSenderId: "558209472773",
  appId:     "1:558209472773:web:be7abb30669a1fdf71bf6c",
});

const messaging = firebase.messaging();

// Obsługa powiadomień gdy apka jest w tle / zamknięta
messaging.onBackgroundMessage((payload) => {
  console.log('[SW FCM] background message:', payload);
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || '💌 Nasza Tablica', {
    body:     body || '',
    icon:     '/Karteczki/icon-192.png',
    badge:    '/Karteczki/icon-192.png',
    tag:      'tablica-note',
    renotify: true,
    data:     { url: 'https://magic-adikools.github.io/Karteczki/' },
  });
});

// Kliknięcie powiadomienia otwiera aplikację
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || 'https://magic-adikools.github.io/Karteczki/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.startsWith('https://magic-adikools.github.io/Karteczki/'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// Cache
const CACHE = 'tablica-v6';
const ASSETS = [
  '/Karteczki/',
  '/Karteczki/index.html',
  '/Karteczki/app.js',
  '/Karteczki/manifest.json',
  '/Karteczki/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
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
      url.includes('gstatic')   || url.includes('tailwindcss')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
