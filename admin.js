/*****************************************
 *   ADMIN PANEL – StreetWearX (FINAL)
 *   Cloudinary + Firestore + Offline Queue
 *****************************************/

/* FIREBASE */
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

enableIndexedDbPersistence(db).catch(() => {
  console.warn("IndexedDB Persistence no disponible.");
});

/* ---------------------------
   CLOUDINARY CORRECTO
--------------------------- */
const CLOUD_NAME = "dexxdi5fs";
const UPLOAD_PRESET = "pwa_streetwearx";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/dexxdi5fs/image/upload`;

console.log("Cloudinary conectado con preset:", UPLOAD_PRESET);

/* ---------------------------
   COMPRESIÓN DE IMÁGENES
--------------------------- */
async function comprimirImagen(file, maxWidth = 1080, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          const newFile = new File([blob], file.name.replace(/\..+$/, ".jpg"), {
            type: "image/jpeg",
          });
          resolve(newFile);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = reject;
    img.src = url;
  });
}

/* ---------------------------
   SUBIR A CLOUDINARY
--------------------------- */
async function subirACloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
  const data = await res.json();

  if (!data.secure_url) {
    console.error("Cloudinary error:", data);
    throw new Error("Cloudinary upload failed: " + (data.error?.message || ""));
  }

  return { url: data.secure_url, id: data.public_id };
}

/* ---------------------------
   INDEXEDDB QUEUE
--------------------------- */
function openIDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("sw-queue", 2);

    req.onupgradeneeded = () => {
      req.result.createObjectStore("uploads", { keyPath: "id", autoIncrement: true });
    };

    req.onsuccess = () => resolve(req.result);
  });
}

async function addQueue(item) {
  const db = await openIDB();
  return new Promise((resolve) => {
    db.transaction("uploads", "readwrite")
      .objectStore("uploads")
      .add(item).onsuccess = resolve;
  });
}

/* ---------------------------
   GUARDAR PRODUCTO
--------------------------- */
document.getElementById("productoForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = nombreProducto.value;
  const clave = claveProducto.value;
  const categoria = categoriaEl.value;
  const subcategoria = subcategoriaEl.value;
  const precio = parseFloat(precioProducto.value);
  const stock = parseInt(stockEl.value);
  const descripcion = descripcionEl.value;

  const nuevo = {
    nombre,
    clave,
    categoria,
    subcategoria,
    precio,
    stock,
    descripcion,
    imagen: "",
    imagenes: [],
    public_ids: [],
    pendingImages: true,
    fecha: new Date().toISOString(),
  };

  const ref = await addDoc(productosRef, nuevo);

  const files = Array.from(imagenesProducto.files);

  // Sin imágenes
  if (files.length === 0) {
    await updateDoc(ref, { pendingImages: false });
    alert("Producto guardado sin imágenes");
    return;
  }

  // Si hay Internet
  if (navigator.onLine) {
    const urls = [];
    const ids = [];

    for (const f of files) {
      const comp = await comprimirImagen(f);
      const res = await subirACloudinary(comp);
      urls.push(res.url);
      ids.push(res.id);
    }

    await updateDoc(ref, {
      imagen: urls[0],
      imagenes: urls,
      public_ids: ids,
      pendingImages: false,
    });

    alert("Producto guardado correctamente.");
  }

  // SIN Internet → guardar en cola
  else {
    const bufferFiles = [];

    for (const f of files) {
      bufferFiles.push({
        name: f.name,
        type: f.type,
        buffer: await f.arrayBuffer(),
      });
    }

    await addQueue({
      type: "uploadImages",
      docId: ref.id,
      files: bufferFiles,
    });

    alert("Guardado offline. Las imágenes se subirán cuando vuelva Internet.");
  }

  e.target.reset();
});

/* ---------------------------
   RENDER DE PRODUCTOS
--------------------------- */
onSnapshot(productosRef, (snapshot) => {
  const cont = document.getElementById("productsContainer");
  cont.innerHTML = "";

  snapshot.forEach((d) => {
    const p = d.data();

    cont.innerHTML += `
      <div class="col-md-4">
        <div class="card p-2">
          <img src="${p.imagen || "LogoStreetWearX.jpg"}" class="thumb mb-2"/>
          <h5>${p.nombre}</h5>
          <p><strong>Clave:</strong> ${p.clave}</p>
          <p><strong>Categoría:</strong> ${p.categoria} / ${p.subcategoria}</p>
          <p><strong>Precio:</strong> $${p.precio}</p>
          <p><strong>Stock:</strong> ${p.stock}</p>

          <button class="btn btn-danger btn-sm" onclick="borrarProducto('${d.id}')">
            <i class="bi bi-trash"></i> Borrar
          </button>
        </div>
      </div>
    `;
  });
});

/* ---------------------------
   BORRAR PRODUCTO
--------------------------- */
window.borrarProducto = async function (id) {
  if (!confirm("¿Seguro que deseas eliminarlo?")) return;

  await deleteDoc(doc(db, "productos", id));
  alert("Producto eliminado.");
};

