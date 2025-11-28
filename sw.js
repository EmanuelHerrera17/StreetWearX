// sw.js — StreetWearX (FINAL)
const CACHE_NAME = 'streetwearx-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './tienda.html',
  './admin.html',
  './admin.js',
  './tienda.html',
  './manifest.webmanifest',
  './LogoStreetWearX.jpg',
  './videoStreetWearX.mp4'
];

// INSTALAR — Cache estático
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATE — Limpiar versiones antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// FETCH — Estrategia híbrida:
// 1) Primero revisa cache
// 2) Si no está, busca en network
// 3) Cache dinámico para imágenes y recursos externos
// 4) Fallback individual por página
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== 'GET') return;

  // Navegación entre páginas (HTML)
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Network ok → return original y actualiza en cache
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => {
          // OFFLINE → fallback correcto según URL
          if (req.url.includes('tienda')) return caches.match('./tienda.html');
          if (req.url.includes('admin')) return caches.match('./admin.html');
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Otros tipos de archivos (CSS, JS, imágenes, Cloudinary)
  event.respondWith(
    caches.match(req).then(cacheRes => {
      if (cacheRes) return cacheRes; // encontrado en cache

      return fetch(req)
        .then(networkRes => {
          // Cachear dinámicamente solo imágenes y contenido permitido
          if (
            req.url.includes('.jpg') ||
            req.url.includes('.jpeg') ||
            req.url.includes('.png') ||
            req.url.includes('cloudinary') ||
            req.destination === 'image'
          ) {
            caches.open(CACHE_NAME).then(cache => cache.put(req, networkRes.clone()));
          }

          return networkRes;
        })
        .catch(() => cacheRes); // offline → devolver cache si existe
    })
  );
});

// BACKGROUND SYNC — Para la cola offline del admin
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-products') {
    event.waitUntil(
      (async () => {
        const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clientsList) {
          client.postMessage({ type: 'PROCESS_QUEUE' });
        }
      })()
    );
  }
});

// Comunicación cliente → SW
self.addEventListener('message', (event) => {
  console.log('Mensaje recibido en SW:', event.data);
});
