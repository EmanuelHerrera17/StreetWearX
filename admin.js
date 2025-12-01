// admin.js (FINAL CORREGIDO)

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dslk9djpt/image/upload";
const UPLOAD_PRESET = "streetwearx_preset";

let products = [];

// Cargar inicial
window.onload = () => loadProducts();

// ----------------------------------------------------------
// PREVIEW DE IMÁGENES
// ----------------------------------------------------------
document.getElementById("imagenesProducto").addEventListener("change", function () {
  const preview = document.getElementById("previewImagenes");
  preview.innerHTML = "";

  [...this.files].forEach((file) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
});

// ----------------------------------------------------------
// FORMULARIO NUEVO PRODUCTO
// ----------------------------------------------------------
document.getElementById("productoForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = document.getElementById("submitBtn");
  const spinner = document.getElementById("submitSpinner");

  btn.disabled = true;
  spinner.classList.remove("d-none");

  const nombre = nombreProducto.value;
  const clave = claveProducto.value;
  const categoria = categoria.value;
  const subcategoria = subcategoria.value;
  const precio = precioProducto.value;
  const stockVal = stock.value;
  const descripcionTxt = descripcion.value;

  const imagenes = [...document.getElementById("imagenesProducto").files];

  const producto = {
    id: Date.now(),
    nombre,
    clave,
    categoria,
    subcategoria,
    precio,
    stock: stockVal,
    descripcion: descripcionTxt,
    imagenesBlobs: imagenes,
  };

  try {
    // Intentar subida normal
    const urls = await uploadImagesCloudinary(imagenes);

    products.push({
      ...producto,
      imagenes: urls,
    });

    saveProductsLocal();
    renderProducts();
    bootstrap.Modal.getInstance(document.getElementById("productoModal")).hide();
  } catch (err) {
    // Guardar en cola offline
    await enqueueOffline(producto);
    alert("Sin internet. Guardado en cola offline.");

    // Notificar al service worker
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "PROCESS_QUEUE" });
    }
  }

  btn.disabled = false;
  spinner.classList.add("d-none");
  document.getElementById("productoForm").reset();
  document.getElementById("previewImagenes").innerHTML = "";
});

// ----------------------------------------------------------
// SUBIR IMÁGENES A CLOUDINARY
// ----------------------------------------------------------
async function uploadImagesCloudinary(files) {
  const urls = [];

  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const res = await fetch(CLOUDINARY_URL, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Error al subir imagen");

    const data = await res.json();
    urls.push(data.secure_url);
  }

  return urls;
}

// ----------------------------------------------------------
// COLA OFFLINE (PARA SERVICE WORKER)
// ----------------------------------------------------------
async function enqueueOffline(producto) {
  return new Promise((resolve) => {
    const req = indexedDB.open("streetwearx-db", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("uploadQueue", { keyPath: "id" });
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("uploadQueue", "readwrite");
      tx.objectStore("uploadQueue").add(producto);
      tx.oncomplete = resolve;
    };
  });
}

// ----------------------------------------------------------
// LOCAL STORAGE (PRODUCTOS MOSTRADOS)
// ----------------------------------------------------------
function saveProductsLocal() {
  localStorage.setItem("products", JSON.stringify(products));
}

function loadProducts() {
  const data = localStorage.getItem("products");
  if (data) products = JSON.parse(data);
  renderProducts();
}

// ----------------------------------------------------------
// MOSTRAR PRODUCTOS
// ----------------------------------------------------------
function renderProducts() {
  const container = document.getElementById("productsContainer");
  container.innerHTML = "";

  products.forEach((p) => {
    const col = document.createElement("div");
    col.className = "col-md-4 mb-3";

    col.innerHTML = `
      <div class="card p-2">
        <img src="${p.imagenes?.[0] || "LogoStreetWearX.jpg"}" class="card-img-top thumb">

        <div class="card-body">
          <h5 class="card-title">${p.nombre}</h5>
          <p class="card-text">${p.descripcion}</p>

          <button class="btn btn-danger w-100" onclick="deleteProduct(${p.id})">
            <i class="bi bi-trash"></i> Eliminar
          </button>
        </div>
      </div>
    `;

    container.appendChild(col);
  });
}

// ----------------------------------------------------------
// BORRAR PRODUCTO
// ----------------------------------------------------------
function deleteProduct(id) {
  products = products.filter((p) => p.id !== id);
  saveProductsLocal();
  renderProducts();
}
