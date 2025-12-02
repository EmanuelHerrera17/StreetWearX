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
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

/**
 * Fetch handler — clonar la Response inmediatamente para evitar
 * "Response body is already used" al consumir el body en múltiples lugares.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo cachear GET; dejar pasar otros métodos
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((networkRes) => {
        // Clonar inmediatamente antes de consumir la Response en cualquier otro lugar
        const resForCache = networkRes.clone();
        const resForReturn = networkRes;

        // Cachear asíncronamente. Proteger contra errores al cachear responses opacas.
        event.waitUntil(
          caches.open(CACHE_NAME).then(async (cache) => {
            try {
              // Algunos recursos cross-origin pueden ser 'opaque'; aún así intentamos cachear,
              // pero envolvemos en try/catch para evitar fallos que rompan la respuesta.
              await cache.put(req, resForCache);
            } catch (e) {
              // ignore cache failure for this request
            }
          })
        );

        return resForReturn;
      }).catch(() => {
        // Fallback: si es navegación, devolver offline.html; si no, intentar cached fallback.
        if (req.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return caches.match(req) || caches.match('/offline.html');
      });
    })
  );
});

/**
 * Background sync: cuando la etiqueta 'sync-products' se dispara,
 * notificar a todos los clientes (página) para que procesen la cola.
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
 * Mensajes desde el cliente -> reenvío a todos los clientes si corresponde.
 * Soporta petición manual desde la página para procesar la cola.
 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'PROCESS_QUEUE') {
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      .then(clients => clients.forEach(c => c.postMessage({ type: 'PROCESS_QUEUE' })));
  }
});
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
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

/**
 * Fetch handler — clonar la Response inmediatamente para evitar
 * "Response body is already used" al consumir el body en múltiples lugares.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo cachear GET; dejar pasar otros métodos
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((networkRes) => {
        // Clonar inmediatamente antes de consumir la Response en cualquier otro lugar
        const resForCache = networkRes.clone();
        const resForReturn = networkRes;

        // Cachear asíncronamente. Proteger contra errores al cachear responses opacas.
        event.waitUntil(
          caches.open(CACHE_NAME).then(async (cache) => {
            try {
              // Algunos recursos cross-origin pueden ser 'opaque'; aún así intentamos cachear,
              // pero envolvemos en try/catch para evitar fallos que rompan la respuesta.
              await cache.put(req, resForCache);
            } catch (e) {
              // ignore cache failure for this request
            }
          })
        );

        return resForReturn;
      }).catch(() => {
        // Fallback: si es navegación, devolver offline.html; si no, intentar cached fallback.
        if (req.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return caches.match(req) || caches.match('/offline.html');
      });
    })
  );
});

/**
 * Background sync: cuando la etiqueta 'sync-products' se dispara,
 * notificar a todos los clientes (página) para que procesen la cola.
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
 * Mensajes desde el cliente -> reenvío a todos los clientes si corresponde.
 * Soporta petición manual desde la página para procesar la cola.
 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'PROCESS_QUEUE') {
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      .then(clients => clients.forEach(c => c.postMessage({ type: 'PROCESS_QUEUE' })));
  }
});
