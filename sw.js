// sw.js — StreetWearX (FINAL)
const CACHE_NAME = 'streetwearx-v4';

const STATIC_ASSETS = [
  './',
  './index.html',
  './tienda.html',
  './admin.html',
  './admin.js',
  './manifest.webmanifest',
  './LogoStreetWearX.jpg',
  './videoStreetWearX.mp4'
];

/* ---------------------------------------------------------
   INSTALL — Cache estático
--------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ---------------------------------------------------------
   ACTIVATE — Limpiar versiones antiguas
--------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---------------------------------------------------------
   FETCH — Estrategia híbrida
--------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  // HTML navigation
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return res;
        })
        .catch(() => {
          if (req.url.includes('tienda')) return caches.match('./tienda.html');
          if (req.url.includes('admin')) return caches.match('./admin.html');
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Other assets
  event.respondWith(
    caches.match(req).then(cacheRes => {
      if (cacheRes) return cacheRes;

      return fetch(req)
        .then(networkRes => {
          if (
            req.destination === 'image' ||
            req.url.includes('cloudinary') ||
            req.url.match(/\.(png|jpg|jpeg|webp)$/)
          ) {
            caches.open(CACHE_NAME).then(cache => cache.put(req, networkRes.clone()));
          }
          return networkRes;
        })
        .catch(() => cacheRes);
    })
  );
});

/* ---------------------------------------------------------
   BACKGROUND SYNC — Procesar cola offline
--------------------------------------------------------- */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-products') {
    event.waitUntil(sendProcessQueue());
  }
});

/* ---------------------------------------------------------
   MESSAGE — Solicitud desde cliente
--------------------------------------------------------- */
self.addEventListener('message', (event) => {
  console.log('Mensaje recibido en SW:', event.data);

  if (event.data?.type === "PROCESS_QUEUE") {
    sendProcessQueue();
  }
});

/* ---------------------------------------------------------
   Función para avisar a todos los clientes
--------------------------------------------------------- */
async function sendProcessQueue() {
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clientsList) {
    client.postMessage({ type: "PROCESS_QUEUE" });
  }
}
