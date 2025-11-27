// admin.js (versión corregida para offline + cola de imágenes)
// Debe ser <script type="module" src="admin.js"></script> en admin.html

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

// --- Firebase config (usa la tuya)
const firebaseConfig = {
  apiKey : "AIzaSyAFGCGCekNrohTD54KEGqUfw7PiN1I74LI" ,
  authDomain: "streetwearx-f6013.firebaseapp.com",
  projectId: "streetwearx-f6013",
  storageBucket: "streetwearx-f6013.firebasestorage.app",
  messagingSenderId: "86646846974",
  appId : "1:86646846974:web:32aff3d36dd3a44cdcfcaf" ,
  measurementId: "G-1PQM2B493N"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const productosRef = collection(db, "productos");

// Habilitar persistencia IndexedDB para Firestore (offline)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("No se pudo habilitar persistencia IndexedDB:", err);
});

/* ---------------------------
   IndexedDB simple para cola
   ---------------------------
   - Guardamos imágenes y metadata cuando estamos offline.
   - DB: 'sw-queue', store 'uploads'
*/
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sw-queue", 1);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains("uploads")) {
        const os = db.createObjectStore("uploads", { keyPath: "id", autoIncrement: true });
        os.createIndex("byStatus", "status");
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
    tx.objectStore("uploads").add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueueItems() {
  const dbInst = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = dbInst.transaction("uploads", "readonly");
    const req = tx.objectStore("uploads").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueueItem(key) {
  const dbInst = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = dbInst.transaction("uploads", "readwrite");
    tx.objectStore("uploads").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------------------------
   UTILS: subir a Cloudinary
   --------------------------- */
async function subirACloudinaryFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "streetwearx_unsigned"); // tu preset unsigned

  const res = await fetch("https://api.cloudinary.com/v1_1/dexxdi5fs/image/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Cloudinary upload failed");
  const data = await res.json();
  return data.secure_url;
}

/* ---------------------------
   FORM: preview imágenes
   --------------------------- */
const inputImagenes = document.getElementById("imagenesProducto");
const preview = document.getElementById("previewImagenes");

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

/* ---------------------------
   AGREGAR PRODUCTO (submit)
   --------------------------- */
document.getElementById("productoForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = document.getElementById("submitBtn");
  const spinner = document.getElementById("submitSpinner");
  btn.disabled = true;
  spinner.classList.remove("d-none");

  try {
    const nombre = document.getElementById("nombreProducto").value;
    const clave = document.getElementById("claveProducto").value;
    const categoria = document.getElementById("categoria").value;
    const subcategoria = document.getElementById("subcategoria").value;
    const precio = parseFloat(document.getElementById("precioProducto").value);
    const stock = parseInt(document.getElementById("stock").value);
    const descripcion = document.getElementById("descripcion").value;

    // Primero creamos el documento en Firestore (esto funciona offline gracias a la persistencia)
    const docRef = await addDoc(productosRef, {
      nombre,
      clave,
      categoria,
      subcategoria,
      precio,
      stock,
      descripcion,
      imagen: "",            // se actualizará cuando subamos imagenes
      imagenes: [],          // se actualizará
      fecha: new Date().toISOString(),
      pendingImages: true    // marca que faltan subir imágenes
    });

    // Si no hay imágenes, finalizamos aquí y actualizamos pendingImages false
    if (!inputImagenes.files || inputImagenes.files.length === 0) {
      await updateDoc(doc(db, "productos", docRef.id), { pendingImages: false });
      alert("Producto guardado (sin imágenes).");
    } else {
      // Si estamos ONLINE intentamos subir de inmediato
      if (navigator.onLine) {
        const urls = await Promise.all(
  Array.from(inputImagenes.files).map(file => subirACloudinaryFile(file))
);

        // Actualizar documento con URLs
        await updateDoc(doc(db, "productos", docRef.id), {
          imagen: urls[0] || "",
          imagenes: urls,
          pendingImages: false
        });
        alert("Producto guardado con imágenes.");
      } else {
        // OFFLINE: guardamos en queue (IndexedDB) las imágenes + referencia al doc id
        // convertimos cada file a blob (puede ser el file mismo) y guardamos metadata
        const filesArr = [];
        for (let file of inputImagenes.files) {
          // guardamos el file tal cual (File es clonable)
          filesArr.push({
            name: file.name,
            type: file.type,
            blob: file // Many browsers allow storing File in IDB; if not, convierte a ArrayBuffer
          });
        }
        await addToQueue({
          type: "uploadImages",
          docId: docRef.id,
          files: filesArr,
          createdAt: Date.now(),
          status: "pending"
        });

        // Registramos sync para que el SW nos despierte (si está disponible)
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const reg = await navigator.serviceWorker.ready;
          try {
            await reg.sync.register('sync-products');
            console.log('Background sync registrado: sync-products');
          } catch (err) {
            console.warn('No se pudo registrar background sync', err);
          }
        }

        alert("Sin conexión: producto guardado localmente. Las imágenes se subirán cuando vuelva la conexión.");
      }
    }

    // reset form
    document.getElementById("productoForm").reset();
    preview.innerHTML = "";
    // cerrar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById("productoModal"));
    if (modal) modal.hide();

    // recargar vista (cargar desde Firestore, que ya tiene el doc)
    cargarProductos();

  } catch (error) {
    console.error("Error guardando producto:", error);
    alert("Error al guardar producto: " + (error.message || error));
  } finally {
    spinner.classList.add("d-none");
    btn.disabled = false;
  }
});

/* ---------------------------
   FUNCIONES DE PROCESAR LA COLA
   - Se llama:
     - al cargar la página (por si ya hay items)
     - al recibir mensaje desde el Service Worker (sync fired)
     - al volver online (window 'online')
*/
async function processQueue() {
  const items = await getQueueItems();
  for (const item of items) {
    if (item.type === "uploadImages" && item.status === "pending") {
      try {
        // subir cada file a Cloudinary
        const urls = [];
        for (const f of item.files) {
          // f.blob puede ser File o un object con arrayBuffer; asumimos File
          const fileToUpload = f.blob;
          const url = await subirACloudinaryFile(fileToUpload);
          urls.push(url);
        }
        // actualizar Firestore doc con las urls
        const docRef = doc(db, "productos", item.docId);
        await updateDoc(docRef, {
          imagen: urls[0] || "",
          imagenes: urls,
          pendingImages: false
        });

        // eliminar de la cola
        await deleteQueueItem(item.id);
        console.log("Item procesado y eliminado de cola:", item.id);
      } catch (err) {
        console.error("Error procesando item de cola", item, err);
        // no eliminamos, intentaremos más tarde
      }
    }
  }
}

// Cuando la página carga, intentamos procesar la cola (por si ya hay internet)
window.addEventListener('load', () => {
  processQueue();
});

// Cuando volvamos online, procesamos la cola
window.addEventListener('online', () => {
  console.log('Volvimos online — procesando cola');
  processQueue();
});

// Recibir mensajes del service worker (ej. sync event)
navigator.serviceWorker?.addEventListener?.('message', (ev) => {
  if (ev.data && ev.data.type === 'PROCESS_QUEUE') {
    processQueue();
  }
});

/* ---------------------------
   CARGAR PRODUCTOS (igual que antes, pero usando getDocs)
   --------------------------- */
async function cargarProductos() {
  const cont = document.getElementById("productsContainer");
  cont.innerHTML = "";

  try {
    const snap = await getDocs(productosRef);
    snap.forEach((docu) => {
      const p = docu.data();
      cont.innerHTML += `
        <div class="col-md-4 mb-3">
          <div class="card p-2">
            <img src="${p.imagen}" class="thumb mb-2">
            <h5>${p.nombre}</h5>
            <p><strong>Clave:</strong> ${p.clave}</p>
            <p><strong>Categoría:</strong> ${p.categoria} / ${p.subcategoria}</p>
            <p><strong>$${p.precio}</strong></p>
            <p><strong>Stock:</strong> ${p.stock}</p>
            ${p.pendingImages ? '<p class="text-warning">Imágenes pendientes de subida</p>' : ''}
          </div>
        </div>
      `;
    });
  } catch (err) {
    console.error("Error cargando productos:", err);
    cont.innerHTML = `<div class="text-center p-4"><h4>Error cargando productos</h4></div>`;
  }
}

cargarProductos();


