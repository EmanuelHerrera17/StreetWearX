/*****************************************
 *   ADMIN PANEL – StreetWearX (CORREGIDO - ACTUALIZADO)
 *   Cloudinary + Firestore + Offline Queue
 *   + Compresión de imágenes
 *   + Borrado de productos
 *****************************************/

/* ---------------------------
   IMPORTS FIREBASE
--------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

/* ---------------------------
   FIREBASE CONFIG
   NOTE: storageBucket corrected -> appspot.com
--------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAFGCGCekNrohTD54KEGqUfw7PiN1I74LI",
  authDomain: "streetwearx-f6013.firebaseapp.com",
  projectId: "streetwearx-f6013",
  storageBucket: "streetwearx-f6013.appspot.com", // <-- CORREGIDO
  messagingSenderId: "86646846974",
  appId: "1:86646846974:web:32aff3d36dd3a44cdcfcaf",
  measurementId: "G-1PQM2B493N"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const productosRef = collection(db, "productos");

/* ---------------------------
   HABILITAR OFFLINE
--------------------------- */
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("IndexedDB no disponible o ya habilitado en otra pestaña:", err);
});

/* -------------------------------------------------------
   HELPERS UI - obtener elementos del DOM
-------------------------------------------------------- */
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

/* -------------------------------------------------------
   COMPRESIÓN REAL DE IMÁGENES
-------------------------------------------------------- */
async function comprimirImagen(file, maxWidth = 1080, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxWidth / img.width;
      const width = img.width > maxWidth ? maxWidth : img.width;
      const height = img.width > maxWidth ? img.height * scale : img.height;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("No blob creado al comprimir"));
        const baseName = file.name ? file.name.replace(/\.[^/.]+$/, "") : Date.now().toString();
        const newName = baseName + ".jpg";
        resolve(new File([blob], newName, { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    img.onerror = (e) => reject(e);
    img.src = URL.createObjectURL(file);
  });
}

/* -------------------------------------------------------
   SUBIR A CLOUDINARY
   - Usa preset unsigned configurado en tu cuenta
-------------------------------------------------------- */
async function subirACloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "streetwearx_unsigned");

  const res = await fetch("https://api.cloudinary.com/v1_1/dexxdi5fs/image/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    throw new Error("Cloudinary upload failed: " + res.status + " " + text);
  }
  const data = await res.json();
  return {
    url: data.secure_url,
    public_id: data.public_id // útil si quieres borrar / gestionar desde backend
  };
}

/* -------------------------------------------------------
   IndexedDB QUEUE (almacena buffers)
-------------------------------------------------------- */
function openIDB() {
  return new Promise((resolve, reject) => {
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
  return new Promise((resolve, reject) => {
    const tx = dbInst.transaction("uploads", "readwrite");
    const req = tx.objectStore("uploads").add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getQueueItems() {
  const dbInst = await openIDB();
  return new Promise((resolve) => {
    const tx = dbInst.transaction("uploads", "readonly");
    tx.objectStore("uploads").getAll().onsuccess = (e) => resolve(e.target.result || []);
  });
}
async function deleteQueueItem(id) {
  const dbInst = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = dbInst.transaction("uploads", "readwrite");
    const req = tx.objectStore("uploads").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* -------------------------------------------------------
   PROCESAR COLA (RECONSTRUIR FILE y subir)
   - compatible con navegadores que guardan arrayBuffer
-------------------------------------------------------- */
async function processQueue() {
  console.log("Procesando cola offline...");
  const items = await getQueueItems();
  if (!items.length) {
    console.log("Cola vacía");
    return;
  }

  for (const item of items) {
    if (item.type !== "uploadImages") continue;
    try {
      const urls = [];
      const public_ids = [];

      for (const f of item.files) {
        // f: { name, type, buffer: ArrayBuffer }
        const fileObj = new File([f.buffer], f.name, { type: f.type });
        const comprimida = await comprimirImagen(fileObj);
        const res = await subirACloudinary(comprimida);
        urls.push(res.url);
        if (res.public_id) public_ids.push(res.public_id);
      }

      await updateDoc(doc(db, "productos", item.docId), {
        imagen: urls[0] || "",
        imagenes: urls,
        public_ids: public_ids,
        pendingImages: false
      });

      await deleteQueueItem(item.id);
      console.log("Item procesado y eliminado de la cola:", item.id);
    } catch (err) {
      console.error("Error procesando item cola id=" + item.id, err);
      // No eliminar; se intentará después
    }
  }
}

/* -- intentar procesar cola al detectar online (listener global) -- */
window.addEventListener("online", () => {
  processQueue().catch(e => console.error(e));
});

/* -------------------------------------------------------
   PREVIEW DE IMÁGENES SIMPLE
-------------------------------------------------------- */
if (inputImagenes) {
  inputImagenes.addEventListener("change", () => {
    preview.innerHTML = "";
    for (let file of inputImagenes.files) {
      let img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.style.width = "90px";
      img.style.height = "90px";
      img.style.objectFit = "cover";
      img.style.marginRight = "8px";
      img.style.borderRadius = "8px";
      preview.appendChild(img);
    }
  });
}

/* -------------------------------------------------------
   GUARDAR PRODUCTO (con cola offline)
-------------------------------------------------------- */
if (productoForm) {
  productoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitSpinner.classList.remove("d-none");

    try {
      const nuevo = {
        nombre: nombreProducto.value.trim(),
        clave: claveProducto.value.trim(),
        categoria: categoriaEl.value,
        subcategoria: subcategoriaEl.value,
        precio: parseFloat(precioProducto.value) || 0,
        stock: parseInt(stockEl.value) || 0,
        descripcion: descripcionEl.value.trim(),
        imagen: "",
        imagenes: [],
        public_ids: [],
        pendingImages: true,
        fecha: new Date().toISOString()
      };

      const ref = await addDoc(productosRef, nuevo);

      // Si no hay imágenes
      if (!inputImagenes.files || inputImagenes.files.length === 0) {
        await updateDoc(doc(db, "productos", ref.id), { pendingImages: false });
        alert("Producto guardado sin imágenes.");
      } else {
        // ONLINE -> subir ahora
        if (navigator.onLine) {
          const results = await Promise.all(
            Array.from(inputImagenes.files).map(async (file) => {
              const comp = await comprimirImagen(file);
              return subirACloudinary(comp);
            })
          );

          const urls = results.map(r => r.url || r);
          const public_ids = results.map(r => r.public_id || null).filter(Boolean);

          await updateDoc(doc(db, "productos", ref.id), {
            imagen: urls[0] || "",
            imagenes: urls,
            public_ids: public_ids,
            pendingImages: false
          });

          alert("Producto guardado con imágenes.");
        } else {
          // OFFLINE -> guardar en cola con ArrayBuffer
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

          // pedir al SW que intente sync (si disponible)
          if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(reg => {
              if (reg.sync) reg.sync.register('sync-products').catch(()=>{});
              // enviar mensaje al sw por si no soporta sync
              if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: "PROCESS_QUEUE" });
              }
            });
          }

          alert("Guardado offline. Las imágenes se subirán al volver la conexión.");
        }
      }

      // Reset UI
      productoForm.reset();
      preview.innerHTML = "";
      const bsModal = bootstrap.Modal.getInstance(productoModal);
      if (bsModal) bsModal.hide();

    } catch (err) {
      console.error("Error guardando producto:", err);
      alert("Error al guardar producto: " + (err.message || err));
    } finally {
      submitSpinner.classList.add("d-none");
      submitBtn.disabled = false;
    }
  });
}

/* -------------------------------------------------------
   CARGAR PRODUCTOS (Realtime) + BORRAR
-------------------------------------------------------- */
function renderProductsList(snapshot) {
  productsContainer.innerHTML = "";
  snapshot.forEach((d) => {
    const p = d.data();
    const id = d.id;

    const card = document.createElement("div");
    card.className = "col-md-4 mb-3";
    card.innerHTML = `
      <div class="card p-2">
        <img src="${p.imagen || (p.imagenes && p.imagenes[0]) || ''}" class="thumb mb-2" alt="${p.nombre}">
        <h5>${p.nombre}</h5>
        <p><strong>Clave:</strong> ${p.clave}</p>
        <p><strong>Categoría:</strong> ${p.categoria} / ${p.subcategoria}</p>
        <p><strong>Precio:</strong> $${p.precio}</p>
        <p><strong>Stock:</strong> ${p.stock}</p>
        ${p.pendingImages ? "<p class='text-warning'>Imágenes pendientes...</p>" : ""}
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-danger btn-delete" data-id="${id}"><i class="bi bi-trash"></i> Borrar</button>
        </div>
      </div>
    `;
    productsContainer.appendChild(card);
  });

  // attach delete handlers
  document.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      const id = btn.getAttribute("data-id");
      if (!confirm("¿Confirmas eliminar este producto? Esta acción es irreversible.")) return;
      try {
        // Opcional: si quieres borrar también imágenes en Cloudinary, necesitarás un endpoint seguro en servidor
        // que reciba los public_ids (almacenados en public_ids) y haga la llamada al API de Cloudinary.
        // Aquí solo eliminamos el documento de Firestore.
        await deleteDoc(doc(db, "productos", id));
        alert("Producto eliminado.");
      } catch (err) {
        console.error("Error borrando producto:", err);
        alert("No se pudo eliminar el producto.");
      }
    });
  });
}

function cargarProductos() {
  onSnapshot(productosRef, (snap) => renderProductsList(snap), (err) => {
    console.error("onSnapshot error:", err);
    // fallback: una sola carga
    getDocs(productosRef).then(snap => renderProductsList(snap));
  });
}

cargarProductos();

/* -------------------------------------------------------
   MENSAJES DESDE SERVICE WORKER
-------------------------------------------------------- */
navigator.serviceWorker?.addEventListener("message", (ev) => {
  if (ev.data?.type === "PROCESS_QUEUE") {
    // El SW pide que procesemos cola — hacerlo si estamos online
    if (navigator.onLine) {
      processQueue().catch(e => console.error(e));
    } else {
      console.log("SW solicitó procesar cola pero estamos offline.");
    }
  }
});

/* -------------------------------------------------------
   Intentar procesar la cola al inicio si estamos online
-------------------------------------------------------- */
(async function tryProcessOnStart() {
  if (navigator.onLine) {
    try {
      await processQueue();
    } catch (e) {
      console.error("Error intentando procesar la cola al iniciar:", e);
    }
  }
})();

/* -------------------------------------------------------
   Para debug: botón flotante ya en admin.html invoca:
   navigator.serviceWorker.controller.postMessage({ type: 'PROCESS_QUEUE' })
-------------------------------------------------------- */
