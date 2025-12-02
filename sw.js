// ...existing code...
const CACHE_NAME = 'sw-cache-v1';
const PRECACHE_URLS = [
  '/', 
  '/index.html',
  '/offline.html',
  '/LogoStreetWearX.jpg',
  '/admin.js',
  '/styles.css'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

/**
 * Fetch handler — safe cloning of responses to avoid "body already used" errors.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests for caching; pass-through others
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((networkRes) => {
        // Clone immediately for cache — do not consume networkRes before cloning
        const resForCache = networkRes.clone();
        const resForReturn = networkRes;

        // Cache asynchronously and safely
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => {
            // ignore opaque responses that can't be cached in some browsers
            try {
              return cache.put(req, resForCache);
            } catch (e) {
              return Promise.resolve();
            }
          })
        );

        return resForReturn;
      }).catch(() => {
        // Fallback to offline page for navigations, or cached resource otherwise
        if (req.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return caches.match(req) || caches.match('/offline.html');
      });
    })
  );
});

/**
 * Background sync: when 'sync-products' fires, notify all clients to process queue.
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-products') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then((clients) => {
          clients.forEach(c => c.postMessage({ type: 'PROCESS_QUEUE' }));
        })
    );
  }
});

/**
 * Message handler: support direct messages from pages to trigger queue processing.
 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'PROCESS_QUEUE') {
    // forward to all clients (page will actually run the queue processing logic)
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      .then(clients => clients.forEach(c => c.postMessage({ type: 'PROCESS_QUEUE' })));
  }
});
// ...existing code...
```// filepath: c:\Users\emanu\OneDrive\Escritorio\StreetWearX\sw.js
// ...existing code...
const CACHE_NAME = 'sw-cache-v1';
const PRECACHE_URLS = [
  '/', 
  '/index.html',
  '/offline.html',
  '/LogoStreetWearX.jpg',
  '/admin.js',
  '/styles.css'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

/**
 * Fetch handler — safe cloning of responses to avoid "body already used" errors.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests for caching; pass-through others
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((networkRes) => {
        // Clone immediately for cache — do not consume networkRes before cloning
        const resForCache = networkRes.clone();
        const resForReturn = networkRes;

        // Cache asynchronously and safely
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => {
            // ignore opaque responses that can't be cached in some browsers
            try {
              return cache.put(req, resForCache);
            } catch (e) {
              return Promise.resolve();
            }
          })
        );

        return resForReturn;
      }).catch(() => {
        // Fallback to offline page for navigations, or cached resource otherwise
        if (req.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return caches.match(req) || caches.match('/offline.html');
      });
    })
  );
});

/**
 * Background sync: when 'sync-products' fires, notify all clients to process queue.
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-products') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then((clients) => {
          clients.forEach(c => c.postMessage({ type: 'PROCESS_QUEUE' }));
        })
    );
  }
});

/**
 * Message handler: support direct messages from pages to trigger queue processing.
 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'PROCESS_QUEUE') {
    // forward to all clients (page will actually run the queue processing logic)
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      .then(clients => clients.forEach(c => c.postMessage({ type: 'PROCESS_QUEUE' })));
  }
});
// ...existing code...
