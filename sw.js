/*
 * Minimal service worker for device notifications and app-shell caching.
 * Periodic market polling still belongs in the page or a server push job;
 * browsers do not permit an arbitrary static page to run forever in background.
 */
const CACHE_NAME = 'stocktracking-shell-v2';
const SHELL = ['./', './index.html', './styles.css', './market-data.js', './analysis.js', './storage-service.js', './tracking-service.js', './portfolio-service.js', './notification-service.js', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(cacheNames
        .filter((cacheName) => cacheName.startsWith('stocktracking-shell-') && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SHOW_STOCK_NOTIFICATION') return;
  const { title, body, tag, url = './' } = event.data;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: './icon.svg',
    badge: './icon.svg',
    data: { url }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((window) => 'focus' in window);
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url || './');
  }));
});
