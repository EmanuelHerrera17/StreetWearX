// sw.js (mejorado)
const CACHE_NAME = 'streetwearx-v1';
const ASSETS = [
  './',
  './index.html',
  './tienda.html',
  './admin.html',
  './styles.css',
  './admin.js',
  './tienda.html',
  './index.html',
  './manifest.webmanifest',
  // agrega aquí otros assets que necesites: LogoStreetWearX.jpg, videoStreetWearX.mp4, bootstrap CDN no se cachea por CORS a menos que lo sirvas local
];

// Instalación - cachea assets
self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activación - limpiar caches viejos
self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch - estrategia cache-first para assets, fallback a network; para navegación usamos index.html
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  // Solo tratar GET
  if (req.method !== 'GET') return;

  ev.respondWith(
    caches.match(req).then(cacheRes => {
      return cacheRes || fetch(req).then(networkRes => {
        // opcional: cachear respuestas dinámicas (cuidado con API calls)
        return networkRes;
      }).catch(() => {
        // fallback
        if (req.mode === 'navigate') return caches.match('./index.html');
        return cacheRes;
      });
    })
  );
});

// Background Sync - cuando se dispare 'sync-products' avisamos a las páginas para procesar cola
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-products') {
    event.waitUntil(
      (async () => {
        const allClients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of allClients) {
          client.postMessage({ type: 'PROCESS_QUEUE' });
        }
      })()
    );
  }
});

// Opcional: mensaje desde cliente
self.addEventListener('message', (ev) => {
  // por si quieres recibir comandos de la página
  console.log('SW recibe message:', ev.data);
});
