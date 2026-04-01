const CACHE = 'ukoly-1.4.1';
const ASSETS = ['/index.html', '/manifest.json', '/app.css', '/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first s fallbackem na cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Google API a Worker requesty nekešujeme
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('accounts.google.com') || e.request.url.includes('workers.dev')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'CHECK_UPDATE') {
    fetch('/index.html', { cache: 'no-cache' })
      .then(res => res.text())
      .then(async fresh => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match('/index.html');
        const old = cached ? await cached.text() : null;
        if (old !== fresh) {
          cache.put('/index.html', new Response(fresh, { headers: { 'Content-Type': 'text/html' } }));
          self.clients.matchAll().then(clients =>
            clients.forEach(c => c.postMessage('UPDATE_READY'))
          );
        } else {
          self.clients.matchAll().then(clients =>
            clients.forEach(c => c.postMessage('UP_TO_DATE'))
          );
        }
      })
      .catch(() => {
        self.clients.matchAll().then(clients =>
          clients.forEach(c => c.postMessage('OFFLINE'))
        );
      });
  }

  if (e.data && e.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, delay } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200], tag: 'ukol-reminder'
      });
    }, delay);
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/index.html'));
});
