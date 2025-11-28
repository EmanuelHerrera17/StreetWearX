/*****************************************
 *   ADMIN PANEL – StreetWearX (FINAL)
 *   Cloudinary + Firestore + Offline
 *   + Compresión de imágenes (rápido)
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
  storageBucket: "streetwearx-f6013.firebasestorage.app",
  messagingSenderId: "86646846974",
  appId: "1:86646846974:web:32aff3d36dd3a44cdcfcaf",
  measurementId: "G-1PQM2B493N"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const productosRef = collection(db, "productos");

/* ---------------------------
   HABILITAR MODO OFFLINE
--------------------------- */
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("IndexedDB no disponible:", err);
});

/* -------------------------------------------------------
   COMPRESIÓN DE IMÁGENES
-------------------------------------------------------- */
async function comprimirImagen(file, maxWidth = 1080, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxWidth / img.width;
      const width = img.width > maxWidth ? maxWidth : img.width;
      const height = img.width > maxWidth ? img.height * scale : img.height;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
  });
}

/* ---------------------------
   SUBIR IMAGEN A CLOUDINARY
--------------------------- */
async function subirACloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "streetwearx_unsigned");

  const res = await fetch("https://api.cloudinary.com/v1_1/dexxdi5fs/image/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Error al subir imagen a Cloudinary");
  const data = await res.json();
  return data.secure_url;
}

/* ---------------------------
   IndexedDB: Cola offline imágenes
--------------------------- */
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sw-queue", 1);
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
  const tx = dbInst.transaction("uploads", "readwrite");
  tx.objectStore("uploads").add(item);
}

async function getQueueItems() {
  const dbInst = await openIDB();
  const tx = dbInst.transaction("uploads", "readonly");
  const req = tx.objectStore("uploads").getAll();
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function deleteQueueItem(id) {
  const dbInst = await openIDB();
  const tx = dbInst.transaction("uploads", "readwrite");
  tx.objectStore("uploads").delete(id);
}

/* -------------------------------------------------------
   PROCESAR COLA OFFLINE
-------------------------------------------------------- */
async function processQueue() {
  const items = await getQueueItems();

  for (const item of items) {
    if (item.type === "uploadImages") {
      try {
        const urls = await Promise.all(
          item.files.map(async (f) => {
            const comprimida = await comprimirImagen(new Blob([f.blob], { type: f.type }));
            return subirACloudinary(comprimida);
          })
        );

        const ref = doc(db, "productos", item.docId);

        await updateDoc(ref, {
          imagen: urls[0] || "",
          imagenes: urls,
          pendingImages: false
        });

        await deleteQueueItem(item.id);

      } catch (err) {
        console.error("Error procesando cola:", err);
      }
    }
  }
}

window.addEventListener("online", processQueue);

/* -------------------------------------------------------
   PREVIEW DE IMÁGENES
-------------------------------------------------------- */
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

/* -------------------------------------------------------
   GUARDAR PRODUCTO
-------------------------------------------------------- */
document.getElementById("productoForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = submitBtn;
  const spinner = submitSpinner;

  btn.disabled = true;
  spinner.classList.remove("d-none");

  try {
    const nombre = nombreProducto.value;
    const clave = claveProducto.value;
    const categoriaP = categoria.value;  // ← corregido
    const subcategoriaP = subcategoria.value; // ← corregido
    const precio = parseFloat(precioProducto.value);
    const stockP = parseInt(stock.value);
    const descripcionP = descripcion.value;

    // Crear producto en Firestore
    const docRef = await addDoc(productosRef, {
      nombre,
      clave,
      categoria: categoriaP,
      subcategoria: subcategoriaP,
      precio,
      stock: stockP,
      descripcion: descripcionP,
      imagen: "",
      imagenes: [],
      pendingImages: true,
      fecha: new Date().toISOString()
    });

    // No hay imágenes
    if (inputImagenes.files.length === 0) {
      await updateDoc(doc(db, "productos", docRef.id), {
        pendingImages: false
      });

      alert("Producto guardado sin imágenes.");
    } 
    else {
      // ONLINE → SUBIR RÁPIDO (con compresión)
      if (navigator.onLine) {
        const urls = await Promise.all(
          Array.from(inputImagenes.files).map(async (file) => {
            const comprimida = await comprimirImagen(file);
            return subirACloudinary(comprimida);
          })
        );

        await updateDoc(doc(db, "productos", docRef.id), {
          imagen: urls[0] || "",
          imagenes: urls,
          pendingImages: false
        });

        alert("Producto guardado con imágenes.");
      } 
      else {
        // OFFLINE → Guardar archivos en cola
        const filesArr = await Promise.all(
          Array.from(inputImagenes.files).map(async (f) => ({
            name: f.name,
            type: f.type,
            blob: await f.arrayBuffer()  // ← corrección importante
          }))
        );

        await addToQueue({
          type: "uploadImages",
          docId: docRef.id,
          files: filesArr,
          createdAt: Date.now()
        });

        alert("Producto guardado sin conexión. Las imágenes se subirán automáticamente.");
      }
    }

    // Reset UI
    productoForm.reset();
    preview.innerHTML = "";
    bootstrap.Modal.getInstance(productoModal).hide();

    cargarProductos();

  } catch (err) {
    console.error(err);
    alert("Error al guardar producto.");
  }

  spinner.classList.add("d-none");
  btn.disabled = false;
});

/* -------------------------------------------------------
   CARGAR PRODUCTOS (Realtime)
-------------------------------------------------------- */
function cargarProductos() {
  const cont = document.getElementById("productsContainer");

  onSnapshot(productosRef, (snap) => {
    cont.innerHTML = "";

    snap.forEach((docu) => {
      const p = docu.data();

      cont.innerHTML += `
        <div class="col-md-4 mb-3">
          <div class="card p-2">
            <img src="${p.imagen}" class="thumb mb-2">
            <h5>${p.nombre}</h5>
            <p><strong>Clave:</strong> ${p.clave}</p>
            <p><strong>Categoría:</strong> ${p.categoria} / ${p.subcategoria}</p>
            <p><strong>Precio:</strong> $${p.precio}</p>
            <p><strong>Stock:</strong> ${p.stock}</p>
            ${p.pendingImages ? "<p class='text-warning'>Imágenes pendientes...</p>" : ""}
          </div>
        </div>
      `;
    });
  });
}

cargarProductos();

/* -------------------------------------------------------
   MENSAJES DESDE SERVICE WORKER
-------------------------------------------------------- */
navigator.serviceWorker?.addEventListener("message", (ev) => {
  if (ev.data?.type === "PROCESS_QUEUE") {
    processQueue();
  }
});
