// ─────────────────────────────────────────────────────────────
//  sw.js  –  Service Worker  |  Nasza Tablica v3
//  Obsługuje cache + push notifications w tle (ntfy przez fetch)
// ─────────────────────────────────────────────────────────────
const CACHE = 'tablica-v3';
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
  // Nie cache'uj Firebase, CDN, ntfy
  const url = e.request.url;
  if (url.includes('firestore') || url.includes('googleapis') ||
      url.includes('gstatic')   || url.includes('tailwindcss') ||
      url.includes('ntfy.sh'))  return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── Push z ntfy przez EventSource (Server-Sent Events) ───────
// SW subskrybuje kanał ntfy w tle i pokazuje natywne powiadomienie
let ntfyController = null;
let ntfyTopic      = null;

self.addEventListener('message', e => {
  if (e.data?.type === 'NTFY_SUBSCRIBE' && e.data.topic) {
    if (ntfyTopic === e.data.topic) return; // już subskrybuje
    ntfyTopic = e.data.topic;
    subscribeNtfy(ntfyTopic);
  }
});

async function subscribeNtfy(topic) {
  if (ntfyController) ntfyController.abort();
  ntfyController = new AbortController();

  try {
    const res = await fetch(`https://ntfy.sh/${topic}/json`, {
      signal: ntfyController.signal,
      headers: { 'Accept': 'application/x-ndjson' },
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.event === 'message') {
            await self.registration.showNotification(msg.title || '💌 Nasza Tablica', {
              body:    msg.message || '',
              icon:    '/icon-192.png',
              badge:   '/icon-192.png',
              tag:     'tablica-' + msg.id,
              renotify: true,
              data:    { url: self.registration.scope },
            });
          }
        } catch {}
      }
    }
  } catch(e) {
    if (e.name !== 'AbortError') {
      // Reconnect po 10s jeśli nie anulowane
      setTimeout(() => { if (ntfyTopic) subscribeNtfy(ntfyTopic); }, 10000);
    }
  }
}

// Otwórz aplikację po kliknięciu powiadomienia
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.registration.scope));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
