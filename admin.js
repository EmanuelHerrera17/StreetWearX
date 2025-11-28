/*****************************************
 *   ADMIN PANEL – StreetWearX (FINAL)
 *   Cloudinary + Firestore + Offline Queue
 *   + Compresión real funcionando
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
   HABILITAR OFFLINE
--------------------------- */
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("IndexedDB no disponible:", err);
});

/* -------------------------------------------------------
   COMPRESIÓN REAL DE IMÁGENES
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
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
  });
}

/* -------------------------------------------------------
   SUBIR A CLOUDINARY
-------------------------------------------------------- */
async function subirACloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "streetwearx_unsigned");

  const res = await fetch("https://api.cloudinary.com/v1_1/dexxdi5fs/image/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Error al subir imagen");
  const data = await res.json();
  return data.secure_url;
}

/* -------------------------------------------------------
   IndexedDB QUEUE
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
  const tx = dbInst.transaction("uploads", "readwrite");
  tx.objectStore("uploads").add(item);
}

async function getQueueItems() {
  const dbInst = await openIDB();
  const tx = dbInst.transaction("uploads", "readonly");
  return new Promise((resolve) => {
    tx.objectStore("uploads").getAll().onsuccess = (e) => {
      resolve(e.target.result || []);
    };
  });
}

async function deleteQueueItem(id) {
  const dbInst = await openIDB();
  const tx = dbInst.transaction("uploads", "readwrite");
  tx.objectStore("uploads").delete(id);
}

/* -------------------------------------------------------
   PROCESAR COLA (CORREGIDO)
-------------------------------------------------------- */
async function processQueue() {
  const items = await getQueueItems();

  for (const item of items) {
    if (item.type === "uploadImages") {
      try {
        const urls = await Promise.all(
          item.files.map(async (file) => {
            const fileObj = new File([file.buffer], file.name, { type: file.type });
            const comprimida = await comprimirImagen(fileObj);
            return subirACloudinary(comprimida);
          })
        );

        await updateDoc(doc(db, "productos", item.docId), {
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
   PREVIEW
-------------------------------------------------------- */
const inputImagenes = document.getElementById("imagenesProducto");
const preview = document.getElementById("previewImagenes");

inputImagenes.addEventListener("change", () => {
  preview.innerHTML = "";
  for (let file of inputImagenes.files) {
    const img = document.createElement("img");
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
   GUARDAR PRODUCTO (CORREGIDO)
-------------------------------------------------------- */
document.getElementById("productoForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  submitBtn.disabled = true;
  submitSpinner.classList.remove("d-none");

  try {
    const nuevo = {
      nombre: nombreProducto.value,
      clave: claveProducto.value,
      categoria: categoria.value,
      subcategoria: subcategoria.value,
      precio: parseFloat(precioProducto.value),
      stock: parseInt(stock.value),
      descripcion: descripcion.value,
      imagen: "",
      imagenes: [],
      pendingImages: true,
      fecha: new Date().toISOString()
    };

    const ref = await addDoc(productosRef, nuevo);

    // No hay imágenes
    if (inputImagenes.files.length === 0) {
      await updateDoc(doc(db, "productos", ref.id), { pendingImages: false });
      alert("Producto guardado sin imágenes.");
    } else {
      // ONLINE
      if (navigator.onLine) {
        const urls = await Promise.all(
          Array.from(inputImagenes.files).map(async (file) => {
            const comp = await comprimirImagen(file);
            return subirACloudinary(comp);
          })
        );

        await updateDoc(doc(db, "productos", ref.id), {
          imagen: urls[0] || "",
          imagenes: urls,
          pendingImages: false
        });

        alert("Producto guardado con imágenes.");
      }
      // OFFLINE
      else {
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

        alert("Guardado offline. Las imágenes se subirán al volver la conexión.");
      }
    }

    productoForm.reset();
    preview.innerHTML = "";
    bootstrap.Modal.getInstance(productoModal).hide();
  } catch (err) {
    console.error(err);
    alert("Error al guardar producto");
  }

  submitSpinner.classList.add("d-none");
  submitBtn.disabled = false;
});

/* -------------------------------------------------------
   REALTIME FIRESTORE
-------------------------------------------------------- */
function cargarProductos() {
  const cont = document.getElementById("productsContainer");

  onSnapshot(productosRef, (snap) => {
    cont.innerHTML = "";

    snap.forEach((d) => {
      const p = d.data();
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
   MENSAJE DEL SW
-------------------------------------------------------- */
navigator.serviceWorker?.addEventListener("message", (ev) => {
  if (ev.data?.type === "PROCESS_QUEUE") {
    processQueue();
  }
});
