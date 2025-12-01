// sw.js — StreetWearX (VERSIÓN FINAL OPTIMIZADA)
const CACHE_NAME = 'streetwearx-v7';

// Archivos estáticos a cachear obligatoriamente
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
   INSTALL — Guarda en caché los assets estáticos
--------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.error("Error al guardar assets:", err))
  );
  self.skipWaiting();
});

/* ---------------------------------------------------------
   ACTIVATE — Limpia cachés antiguas
--------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---------------------------------------------------------
   FETCH — Estrategia híbrida avanzada
--------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Evitar manejar métodos que no sean GET
  if (req.method !== 'GET') return;

  /* ----- HTML (Navegación) ----- */
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Guardar copia en cache
          caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => {
          // Fallback según la página
          if (req.url.includes('tienda')) return caches.match('./tienda.html');
          if (req.url.includes('admin')) return caches.match('./admin.html');
          return caches.match('./index.html');
        })
    );
    return;
  }

  /* ----- Recursos estáticos (JS/CSS/img) ----- */
  event.respondWith(
    caches.match(req).then(cacheRes => {

      // Si está en caché → úsalo
      if (cacheRes) return cacheRes;

      // Si no, buscar en red
      return fetch(req)
        .then(networkRes => {
          // Si la respuesta no sirve, regresarla como está
          if (!networkRes || networkRes.status !== 200) return networkRes;

          // Detectar si es imagen para cachearla
          const isImage =
            req.destination === 'image' ||
            /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(req.url) ||
            req.url.includes('cloudinary');

          if (isImage) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(req, networkRes.clone());
            });
          }

          return networkRes;
        })
        .catch(() => {
          // Sin conexión → retornar lo que haya en cache si existe
          return cacheRes || new Response("Offline", { status: 200 });
        });
    })
  );
});

/* ---------------------------------------------------------
   Background Sync (sincronización diferida)
--------------------------------------------------------- */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-products') {
    event.waitUntil(processQueue());
  }
});

/* ---------------------------------------------------------
   Mensajes desde las páginas
--------------------------------------------------------- */
self.addEventListener('message', (event) => {
  if (event.data?.type === "PROCESS_QUEUE") {
    processQueue();
  }
});

/* ---------------------------------------------------------
   Función usada por el Sync y mensajes
--------------------------------------------------------- */
async function processQueue() {
  const clientsList = await self.clients.matchAll({
    includeUncontrolled: true
  });

  clientsList.forEach(client => {
    client.postMessage({ type: "PROCESS_QUEUE" });
  });
}
