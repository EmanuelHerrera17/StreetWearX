/*****************************************
 *   ADMIN PANEL – StreetWearX
 *   Cloudinary + Firestore + Offline Queue
 *   + Compresión de imágenes
 *   + Borrado de productos (Firestore) + hook para borrar en Cloudinary via backend
 *****************************************/

/* ---------------------------
   IMPORTS FIREBASE (modular v10+)
--------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

/* ---------------------------
   FIREBASE CONFIG
--------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAFGCGCekNrohTD54KEGqUfw7PiN1I74LI",
  authDomain: "streetwearx-f6013.firebaseapp.com",
  projectId: "streetwearx-f6013",
  storageBucket: "streetwearx-f6013.appspot.com",
  messagingSenderId: "86646846974",
  appId: "1:86646846974:web:32aff3d36dd3a44cdcfcaf",
  measurementId: "G-1PQM2B493N"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const productosRef = collection(db, "productos");

/* ---------------------------
   HABILITAR OFFLINE Firestore
--------------------------- */
enableIndexedDbPersistence(db).catch((err) => {
  // Esto suele fallar si tienes otra pestaña abierta con la misma app
  console.warn("IndexedDB persistence unavailable (OK if another tab has it):", err);
});

/* ---------------------------
   DOM ELEMENTS (cached, tolerant)
--------------------------- */
const productoForm = document.getElementById("productoForm");
const productoModal = document.getElementById("productoModal");
const nombreProducto = document.getElementById("nombreProducto");
const claveProducto = document.getElementById("claveProducto");
const categoriaEl = document.getElementById("categoria");
const subcategoriaEl = document.getElementById("subcategoria");
const precioProducto = document.getElementById("precioProducto");
const stockEl = document.getElementById("stock");
const descripcionEl = document.getElementById("descripcion");
const inputImagenes = document.getElementById("imagenesProducto");
const preview = document.getElementById("previewImagenes");
const submitBtn = document.getElementById("submitBtn");
const submitSpinner = document.getElementById("submitSpinner");
const productsContainer = document.getElementById("productsContainer");

/* ---------------------------
   CLOUDINARY CONFIG
--------------------------- */
const CLOUD_NAME = "dexxdi5fs"; // ⚠️ VERIFICA ESTE VALOR EN TU DASHBOARD
const UPLOAD_PRESET = "streetwearx_unsigned"; // ⚠️ CREA ESTE PRESET SI NO EXISTE
// Ruta recomendada por Cloudinary: /upload (image es el resource_type por defecto)
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

console.log("🔧 Cloudinary Config:", { CLOUD_NAME, UPLOAD_PRESET, CLOUDINARY_URL });

/* =====================================================
   UTIL: comprimirImagen(file) -> File (JPEG)
===================================================== */
async function comprimirImagen(file, maxWidth = 1080, quality = 0.75) {
  if (!file || !file.type?.startsWith?.("image/")) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const ratio = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              return reject(new Error("No se pudo crear blob al comprimir"));
            }
            const baseName = file.name
              ? file.name.replace(/\.[^/.]+$/, "")
              : `${Date.now()}`;
            const newFile = new File([blob], `${baseName}.jpg`, {
              type: "image/jpeg"
            });
            resolve(newFile);
          },
          "image/jpeg",
          quality
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Error cargando imagen para comprimir: " + e));
    };

    img.src = objectUrl;
  });
}

/* =====================================================
   UTIL: subirACloudinary(file) -> { url, public_id }
===================================================== */
async function subirACloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(CLOUDINARY_URL, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed: ${res.status} ${bodyText}`);
  }

  const data = await res.json();
  return {
    url: data.secure_url,
    public_id: data.public_id
  };
}

/* =====================================================
   IndexedDB Queue helpers (store ArrayBuffers)
===================================================== */
function openIDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      console.warn("IndexedDB no soportado en este navegador.");
      resolve(null);
      return;
    }

    const req = indexedDB.open("sw-queue", 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("uploads")) {
        db.createObjectStore("uploads", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToQueue(item) {
  const dbInst = await openIDB();
  if (!dbInst) return;
  return new Promise((resolve, reject) => {
    const tx = dbInst.transaction("uploads", "readwrite");
    const req = tx.objectStore("uploads").add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueueItems() {
  const dbInst = await openIDB();
  if (!dbInst) return [];
  return new Promise((resolve) => {
    const tx = dbInst.transaction("uploads", "readonly");
    const req = tx.objectStore("uploads").getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = () => resolve([]);
  });
}

async function deleteQueueItem(id) {
  const dbInst = await openIDB();
  if (!dbInst) return;
  return new Promise((resolve, reject) => {
    const tx = dbInst.transaction("uploads", "readwrite");
    const req = tx.objectStore("uploads").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* =====================================================
   PROCESS QUEUE (guardado contra concurrencia)
===================================================== */
let processingQueue = false;
async function processQueue() {
  if (processingQueue) return;
  processingQueue = true;
  console.log("[SW-QUEUE] Procesando cola offline...");

  try {
    const items = await getQueueItems();
    if (!items || !items.length) {
      console.log("[SW-QUEUE] Cola vacía");
      return;
    }

    for (const item of items) {
      if (!item || item.type !== "uploadImages" || !Array.isArray(item.files)) {
        continue;
      }

      try {
        const urls = [];
        const public_ids = [];

        for (const f of item.files) {
          // reconstruct File from ArrayBuffer
          const buffer = f.buffer instanceof ArrayBuffer ? f.buffer : null;
          if (!buffer) continue;

          const fileObj = new File([buffer], f.name, {
            type: f.type || "application/octet-stream"
          });

          // compress
          const comprimida = await comprimirImagen(fileObj);

          // upload
          const res = await subirACloudinary(comprimida);
          if (res?.url) {
            urls.push(res.url);
          }
          if (res?.public_id) {
            public_ids.push(res.public_id);
          }
        }

        // update Firestore doc
        await updateDoc(doc(db, "productos", item.docId), {
          imagen: urls[0] || "",
          imagenes: urls,
          public_ids,
          pendingImages: false
        });

        // delete queue item
        await deleteQueueItem(item.id);
        console.log(`[SW-QUEUE] Item procesado y eliminado id=${item.id}`);
      } catch (err) {
        console.error(`[SW-QUEUE] Error procesando item id=${item.id}`, err);
        // si falla, mantener item para reintento futuro
      }
    }
  } finally {
    processingQueue = false;
  }
}

/* -------------------------------------------------------
   Ejecutar cola cuando volvemos online (global)
-------------------------------------------------------- */
window.addEventListener("online", () => {
  processQueue().catch((e) => console.error(e));
});

/* =====================================================
   PREVIEW - thumbnails + revoke object URLs (robusto)
===================================================== */
const currentlyObjectURLs = new Set();

function clearPreviewAndRevoke() {
  if (!preview) return;
  preview.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("data-blob-url");
    if (src) {
      try {
        URL.revokeObjectURL(src);
      } catch (e) {
        // ignore
      }
      currentlyObjectURLs.delete(src);
    }
  });
  preview.innerHTML = "";
}

if (inputImagenes) {
  inputImagenes.addEventListener("change", () => {
    clearPreviewAndRevoke();
    for (const file of inputImagenes.files) {
      const blobUrl = URL.createObjectURL(file);
      currentlyObjectURLs.add(blobUrl);

      const img = document.createElement("img");
      img.src = blobUrl;
      img.setAttribute("data-blob-url", blobUrl);
      img.width = 90;
      img.height = 90;
      img.style.objectFit = "cover";
      img.style.marginRight = "8px";
      img.style.borderRadius = "8px";
      preview.appendChild(img);
    }
  });
}

/* =====================================================
   GUARDAR PRODUCTO (con soporte offline queue)
===================================================== */
if (productoForm) {
  productoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn) submitBtn.disabled = true;
    if (submitSpinner) submitSpinner.classList.remove("d-none");

    try {
      const nombre = nombreProducto?.value.trim();
      if (!nombre) throw new Error("Nombre requerido");

      const clave = claveProducto?.value.trim() || "";
      const categoria = categoriaEl?.value || "";
      const subcategoria = subcategoriaEl?.value || "";
      const precio = parseFloat(precioProducto?.value) || 0;
      const stockVal = parseInt(stockEl?.value) || 0;
      const descripcion = descripcionEl?.value.trim() || "";

      const nuevo = {
        nombre,
        clave,
        categoria,
        subcategoria,
        precio,
        stock: stockVal,
        descripcion,
        imagen: "",
        imagenes: [],
        public_ids: [],
        pendingImages: true,
        fecha: new Date().toISOString()
      };

      // create doc first (no images)
      const ref = await addDoc(productosRef, nuevo);

      // no images -> mark done
      if (!inputImagenes || !inputImagenes.files || inputImagenes.files.length === 0) {
        await updateDoc(doc(db, "productos", ref.id), { pendingImages: false });
        alert("Producto guardado (sin imágenes).");
      } else {
        if (navigator.onLine) {
          // upload sequentially (avoid throttling)
          const results = [];
          for (const f of inputImagenes.files) {
            const comp = await comprimirImagen(f);
            results.push(await subirACloudinary(comp));
          }

          const urls = results.map((r) => r.url).filter(Boolean);
          const public_ids = results
            .map((r) => r.public_id)
            .filter(Boolean);

          await updateDoc(doc(db, "productos", ref.id), {
            imagen: urls[0] || "",
            imagenes: urls,
            public_ids,
            pendingImages: false
          });

          alert("Producto guardado con imágenes.");
        } else {
          // offline -> store arrayBuffers in IDB queue
          const filesArr = await Promise.all(
            Array.from(inputImagenes.files).map(async (f) => ({
              name: f.name,
              type: f.type,
              buffer: await f.arrayBuffer()
            }))
          );

          await addToQueue({
            type: "uploadImages",
            docId: ref.id,
            files: filesArr,
            createdAt: Date.now()
          });

          // try to register background sync and notify SW
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready
              .then((reg) => {
                if (reg.sync) {
                  reg.sync.register("sync-products").catch(() => {});
                }
                if (navigator.serviceWorker.controller) {
                  navigator.serviceWorker.controller.postMessage({
                    type: "PROCESS_QUEUE"
                  });
                }
              })
              .catch(() => {});
          }

          alert("Guardado offline. Las imágenes se subirán cuando haya conexión.");
        }
      }

      // reset UI
      productoForm.reset();
      clearPreviewAndRevoke();
      const bsModal = window.bootstrap?.Modal.getInstance(productoModal);
      if (bsModal) bsModal.hide();
    } catch (err) {
      console.error("Error guardando producto:", err);
      alert("Error al guardar producto: " + (err.message || err));
    } finally {
      if (submitSpinner) submitSpinner.classList.add("d-none");
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* =====================================================
   RENDER: cargar productos (Realtime) + borrar (delegación)
===================================================== */
function createProductCardElement(p, id) {
  const col = document.createElement("div");
  col.className = "col-md-4 mb-3";

  const card = document.createElement("div");
  card.className = "card p-2";

  // image (set src via property)
  const img = document.createElement("img");
  img.className = "thumb mb-2";
  img.alt = p.nombre || "";

  if (p.imagen) {
    img.src = p.imagen;
  } else if (Array.isArray(p.imagenes) && p.imagenes.length) {
    img.src = p.imagenes[0];
  } else {
    img.src = "LogoStreetWearX.jpg"; // placeholder
  }

  const h5 = document.createElement("h5");
  h5.textContent = p.nombre || "";

  const claveP = document.createElement("p");
  claveP.innerHTML = `<strong>Clave:</strong> ${escapeHtml(p.clave || "")}`;

  const catP = document.createElement("p");
  catP.innerHTML = `<strong>Categoría:</strong> ${escapeHtml(
    p.categoria || ""
  )} / ${escapeHtml(p.subcategoria || "")}`;

  const precioP = document.createElement("p");
  precioP.innerHTML = `<strong>Precio:</strong> $${Number(
    p.precio || 0
  ).toFixed(2)}`;

  const stockP = document.createElement("p");
  stockP.innerHTML = `<strong>Stock:</strong> ${Number(p.stock || 0)}`;

  const pendingNote = document.createElement("div");
  if (p.pendingImages) {
    const note = document.createElement("p");
    note.className = "text-warning";
    note.textContent = "Imágenes pendientes...";
    pendingNote.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "d-flex gap-2 mt-2";

  const btnDelete = document.createElement("button");
  btnDelete.className = "btn btn-sm btn-danger btn-delete";
  btnDelete.setAttribute("data-id", id);
  btnDelete.innerHTML = `<i class="bi bi-trash"></i> Borrar`;

  actions.appendChild(btnDelete);

  card.appendChild(img);
  card.appendChild(h5);
  card.appendChild(claveP);
  card.appendChild(catP);
  card.appendChild(precioP);
  card.appendChild(stockP);
  if (p.pendingImages) card.appendChild(pendingNote);
  card.appendChild(actions);

  col.appendChild(card);
  return col;
}

function renderProductsList(snapshot) {
  if (!productsContainer) return;
  productsContainer.innerHTML = "";

  snapshot.forEach((d) => {
    const p = d.data();
    const id = d.id;
    const el = createProductCardElement(p, id);
    productsContainer.appendChild(el);
  });
}

// Event delegation for delete buttons
if (productsContainer) {
  productsContainer.addEventListener("click", async (ev) => {
    const btn =
      typeof ev.target.closest === "function"
        ? ev.target.closest(".btn-delete")
        : null;
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    if (!id) return;

    if (
      !confirm(
        "¿Confirmas eliminar este producto? Esta acción es irreversible."
      )
    )
      return;

    try {
      const docRef = doc(db, "productos", id);
      const snap = await getDoc(docRef);
      const publicIds = snap.exists() ? snap.data().public_ids || [] : [];

      await deleteDoc(doc(db, "productos", id));
      alert("Producto eliminado.");

      // Si tienes backend seguro para borrar en Cloudinary:
      // if (publicIds.length) {
      //   await fetch('/api/delete-cloudinary-images', {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify({ public_ids: publicIds })
      //   });
      // }
    } catch (err) {
      console.error("Error borrando producto:", err);
      alert("No se pudo eliminar el producto.");
    }
  });
}

function cargarProductos() {
  onSnapshot(
    productosRef,
    (snap) => renderProductsList(snap),
    (err) => {
      console.error("onSnapshot error:", err);
      // fallback: one-time load
      getDocs(productosRef)
        .then((snap) => renderProductsList(snap))
        .catch((e) => console.error(e));
    }
  );
}

cargarProductos();

/* =====================================================
   SERVICE WORKER messages
===================================================== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (ev) => {
    if (ev.data?.type === "PROCESS_QUEUE") {
      if (navigator.onLine) {
        processQueue().catch((e) => console.error(e));
      } else {
        console.log("SW requested queue processing but client is offline.");
      }
    }
  });
}

/* =====================================================
   Try processing queue on start if online
===================================================== */
(async function tryProcessOnStart() {
  if (navigator.onLine) {
    try {
      await processQueue();
    } catch (e) {
      console.error("Error processing queue at start:", e);
    }
  }
})();

/* =====================================================
   Helper: escapeHtml (small output sanitization)
===================================================== */
function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =====================================================
   NOTES:
   - Para borrar imágenes en Cloudinary de forma segura, hazlo desde un backend
     (Cloud Function / pequeño API en Node) usando los public_ids.
===================================================== */
