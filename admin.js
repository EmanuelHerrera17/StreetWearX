// =====================
//  CONFIGURACIÓN FIREBASE
// =====================

const db = firebase.firestore();


// =====================
//  ELEMENTOS DEL DOM
// =====================

const productContainer = document.getElementById("product-container");
const categoryFilter = document.getElementById("category-filter");
const subcategoryFilter = document.getElementById("subcategory-filter");


// =====================
//  CARGAR PRODUCTOS
// =====================

async function loadProducts(category = "", subcategory = "") {
    productContainer.innerHTML = "<p>Cargando productos...</p>";

    let query = db.collection("products");

    // Filtro por categoría
    if (category !== "") {
        query = query.where("category", "==", category);
    }

    // Filtro por subcategoría
    if (subcategory !== "") {
        query = query.where("subcategory", "==", subcategory);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();

    productContainer.innerHTML = "";

    if (snapshot.empty) {
        productContainer.innerHTML = "<p>No hay productos que coincidan con los filtros.</p>";
        return;
    }

    snapshot.forEach(doc => {
        const p = doc.data();

        const item = document.createElement("div");
        item.classList.add("product-card");

        item.innerHTML = `
            <img src="${p.image}" alt="${p.name}">
            <h3>${p.name}</h3>
            <p class="price">$${p.price}</p>
            <p class="cat">Categoría: ${p.category}</p>
            <p class="subcat">Subcategoría: ${p.subcategory}</p>
        `;

        productContainer.appendChild(item);
    });
}



// =====================
//  LLENAR SELECT DE SUBCATEGORÍAS AUTOMÁTICAMENTE
// =====================

function updateSubcategories() {
    const category = categoryFilter.value;

    const subcats = {
        "Hombre": ["Playeras", "Sudaderas", "Pantalones", "Accesorios"],
        "Mujer": ["Playeras", "Sudaderas", "Pantalones", "Accesorios"],
        "Niño": ["Playeras", "Sudaderas", "Pantalones", "Accesorios"],
        "Accesorios": ["Gorras", "Mochilas", "Cadenas", "Otros"]
    };

    subcategoryFilter.innerHTML = `<option value="">Todas</option>`;

    if (subcats[category]) {
        subcats[category].forEach(s => {
            const op = document.createElement("option");
            op.value = s;
            op.textContent = s;
            subcategoryFilter.appendChild(op);
        });
    }
}


// =====================
//  EVENTOS DE LOS FILTROS
// =====================

categoryFilter.addEventListener("change", () => {
    updateSubcategories();
    loadProducts(categoryFilter.value, "");
});

subcategoryFilter.addEventListener("change", () => {
    loadProducts(categoryFilter.value, subcategoryFilter.value);
});


// =====================
//  INICIAR
// =====================

updateSubcategories();
loadProducts();
