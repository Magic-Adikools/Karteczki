// ─────────────────────────────────────────────────────────────
//  sw.js  –  Nasza Tablica v4  |  ntfy WebSocket w tle
// ─────────────────────────────────────────────────────────────
const CACHE = 'tablica-v4';
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
      url.includes('ntfy.sh'))  return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── ntfy WebSocket listener ───────────────────────────────────
let ws = null;
let wsTopic = null;
let wsReconnectTimer = null;

self.addEventListener('message', e => {
  if (e.data?.type === 'NTFY_SUBSCRIBE' && e.data.topic) {
    if (wsTopic === e.data.topic && ws?.readyState === WebSocket.OPEN) return;
    wsTopic = e.data.topic;
    connectWebSocket(wsTopic);
  }
});

function connectWebSocket(topic) {
  if (ws) { try { ws.close(); } catch {} }
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }

  const url = `wss://ntfy.sh/${topic}/ws`;
  console.log('[SW ntfy] connecting to', url);

  try {
    ws = new WebSocket(url);
  } catch(e) {
    console.error('[SW ntfy] WebSocket create error:', e);
    scheduleReconnect(topic);
    return;
  }

  ws.onopen = () => {
    console.log('[SW ntfy] connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.event === 'message') {
        self.registration.showNotification(msg.title || '💌 Nasza Tablica', {
          body:     msg.message || '',
          icon:     '/icon-192.png',
          badge:    '/icon-192.png',
          tag:      'tablica-' + (msg.id || Date.now()),
          renotify: true,
          data:     { url: self.registration.scope },
        });
      }
    } catch(e) {
      console.error('[SW ntfy] parse error:', e);
    }
  };

  ws.onerror = (e) => {
    console.error('[SW ntfy] ws error:', e);
  };

  ws.onclose = (e) => {
    console.log('[SW ntfy] closed, code:', e.code);
    if (wsTopic) scheduleReconnect(wsTopic);
  };
}

function scheduleReconnect(topic) {
  wsReconnectTimer = setTimeout(() => {
    console.log('[SW ntfy] reconnecting...');
    connectWebSocket(topic);
  }, 15000);
}

// Otwórz aplikację po kliknięciu powiadomienia
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
