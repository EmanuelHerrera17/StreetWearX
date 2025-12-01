// sw.js — StreetWearX (FINAL CORREGIDO)
const CACHE_NAME = "streetwearx-v6";
const DB_NAME = "streetwearx-db";
const STORE_NAME = "uploadQueue";

// ---------------------------------------------------
// INSTALACIÓN
// ---------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "./",
        "./index.html",
        "./tienda.html",
        "./admin.html",
        "./admin.js",
        "./manifest.webmanifest",
        "./LogoStreetWearX.jpg",
        "./videoStreetWearX.mp4",
      ])
    )
  );
  self.skipWaiting();
});

// ---------------------------------------------------
// ACTIVATE
// ---------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---------------------------------------------------
// Fetch
// ---------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cacheRes) => {
      return (
        cacheRes ||
        fetch(req)
          .then((networkRes) => {
            if (req.destination === "image" || req.url.includes("cloudinary")) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes.clone()));
            }
            return networkRes;
          })
          .catch(() => cacheRes)
      );
    })
  );
});

// ---------------------------------------------------
// BACKGROUND SYNC
// ---------------------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-products") {
    event.waitUntil(processQueue());
  }
});

// ---------------------------------------------------
// Mensajes desde admin.js
// ---------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type === "PROCESS_QUEUE") processQueue();
});

// ---------------------------------------------------
// IndexedDB Helper
// ---------------------------------------------------
function getDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
  });
}

// ---------------------------------------------------
// Guardar en cola offline
// ---------------------------------------------------
async function enqueueUpload(producto) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add(producto);
  return tx.complete;
}

// ---------------------------------------------------
// Procesar cola
// ---------------------------------------------------
async function processQueue() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const all = await store.getAll();

  for (const item of all) {
    try {
      const formData = new FormData();
      formData.append("nombre", item.nombre);
      formData.append("clave", item.clave);
      formData.append("categoria", item.categoria);
      formData.append("subcategoria", item.subcategoria);
      formData.append("precio", item.precio);
      formData.append("stock", item.stock);
      formData.append("descripcion", item.descripcion);

      for (let i = 0; i < item.imagenes.length; i++) {
        formData.append("imagenes", item.imagenes[i], `img_${Date.now()}_${i}.jpg`);
      }

      const res = await fetch(
        "https://api.cloudinary.com/v1_1/dslk9djpt/image/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) throw new Error("Fallo subida");

      store.delete(item.id);
    } catch (err) {
      console.warn("Aún sin internet para subir imágenes...");
      break; // Detener si falla, para reintentar luego
    }
  }

  return tx.complete;
}
