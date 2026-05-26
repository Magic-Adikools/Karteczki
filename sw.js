// ─────────────────────────────────────────────────────────────
//  sw.js  –  Nasza Tablica  |  Firebase Cloud Messaging
// ─────────────────────────────────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config Firebase – uzupełnij swoimi danymi
firebase.initializeApp({
  apiKey:    "AIzaSyCazP8eaEu66_q05CJM_ay70rOg0YDnZaY", // <-- POPRAWIONO: litera O zamiast zera
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
  e.waitUntil(\n    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {\n      const existing = cs.find(c => c.url.startsWith('https://magic-adikools.github.io/Karteczki/'));\n      if (existing) return existing.focus();\n      return clients.openWindow(url);\n    })\n  );\n});\n\n// Cache\nconst CACHE = 'tablica-v6';\nconst ASSETS = [\n  '/Karteczki/',\n  '/Karteczki/index.html',\n  '/Karteczki/app.js',\n  '/Karteczki/manifest.json',\n  '/Karteczki/icon-192.png',\n];\n\nself.addEventListener('install', e => {\n  e.waitUntil(\n    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())\n  );\n});\n\nself.addEventListener('activate', e => {\n  e.waitUntil(\n    caches.keys()\n      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))\n      .then(() => self.clients.claim())\n  );\n});\n\nself.addEventListener('fetch', e => {\n  if (e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('fcm.googleapis.com')) return;\n  e.respondWith(\n    caches.match(e.request).then(res => res || fetch(e.request))\n  );\n});\n```

Plik `sw.js` mamy z głowy! Jeśli chcesz, podeślij teraz `index.html` lub `manifest.json`, żeby upewnić się, że tam też wszystko gra.
