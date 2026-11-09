/*
 * Minimal service worker for device notifications and app-shell caching.
 * Periodic market polling still belongs in the page or a server push job;
 * browsers do not permit an arbitrary static page to run forever in background.
 */
const CACHE_NAME = 'stocktracking-shell-v14';
const SHELL = ['./', './index.html', './styles.css', './market-data.js', './analysis.js', './storage-service.js', './tracking-service.js', './notification-service.js', './app.js', './manifest.webmanifest', './icon.svg'];

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
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== 'GET'
    || requestUrl.origin !== self.location.origin
    || requestUrl.pathname.includes('/api/')
  ) return;

  // Prefer current site assets; use the installed shell only when offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cacheKey = event.request.mode === 'navigate' ? './index.html' : event.request;
        await cache.put(cacheKey, response.clone());
      }
      return response;
    } catch (error) {
      const cachedResponse = await caches.match(event.request)
        || (event.request.mode === 'navigate' ? await caches.match('./index.html') : null);
      if (cachedResponse) return cachedResponse;
      throw error;
    }
  })());
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
