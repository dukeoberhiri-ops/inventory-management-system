import { guardRoute } from "../auth.js";
import { initLayout } from "../layout.js";
import { Icons } from "../icons.js";
import { toast } from "../toast.js";
import { openModal, closeModal, confirmDialog } from "../modal.js";
import {
  watchProducts, watchCategories, watchSuppliers,
  createProduct, updateProduct, deleteProduct, createCategory, deleteCategory, createSupplier,
} from "../store.js";
import {
  formatMoney, generateSKU, debounce, escapeHtml, stockGaugeHtml, stockStatus, qparam, validate,
} from "../utils.js";

await guardRoute();
await initLayout({ activePage: "products.html", pageTitle: "Products" });
document.getElementById("app-shell").style.display = "flex";
document.getElementById("page-loader").style.display = "none";

document.getElementById("icon-plus").innerHTML = Icons.svg("plus");
document.getElementById("icon-tag").innerHTML = Icons.svg("tag");
document.getElementById("icon-search").innerHTML = Icons.svg("search");

let products = [];
let categories = [];
let suppliers = [];
let currentPage = 1;
const PAGE_SIZE = 8;

const state = {
  search: "",
  category: "",
  status: qparam("filter") === "low" ? "low" : "",
  sort: "name-asc",
};
if (state.status) document.getElementById("status-filter").value = "low";

/* ------------------------------------------------------------- Filters */
document.getElementById("search-input").addEventListener("input", debounce((e) => {
  state.search = e.target.value.trim().toLowerCase();
  currentPage = 1;
  render();
}, 250));
document.getElementById("category-filter").addEventListener("change", (e) => { state.category = e.target.value; currentPage = 1; render(); });
document.getElementById("status-filter").addEventListener("change", (e) => { state.status = e.target.value; currentPage = 1; render(); });
document.getElementById("sort-select").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

function getFilteredSorted() {
  let list = products.filter((p) => {
    if (state.search && !(`${p.name} ${p.sku}`.toLowerCase().includes(state.search))) return false;
    if (state.category && p.category !== state.category) return false;
    if (state.status && stockStatus(p.quantity ?? 0, p.reorderLevel ?? 5) !== state.status) return false;
    return true;
  });
  const [field, dir] = state.sort.split("-");
  list.sort((a, b) => {
    let av, bv;
    if (field === "name") { av = (a.name || "").toLowerCase(); bv = (b.name || "").toLowerCase(); }
    else if (field === "qty") { av = a.quantity ?? 0; bv = b.quantity ?? 0; }
    else { av = a.sellingPrice ?? 0; bv = b.sellingPrice ?? 0; }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return list;
}

/* ------------------------------------------------------------- Render */
function render() {
  const filtered = getFilteredSorted();
  document.getElementById("product-count-sub").textContent =
    `${filtered.length} product${filtered.length === 1 ? "" : "s"}${state.search || state.category || state.status ? " matching filters" : " in inventory"}`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const tbody = document.getElementById("products-tbody");
  const emptyEl = document.getElementById("products-empty");

  if (products.length === 0) {
    tbody.innerHTML = "";
    document.getElementById("products-table").style.display = "none";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${Icons.svg("package")}</div>
        <h4>No products yet</h4>
        <p>Add your first product to start tracking stock and sales.</p>
        <button class="btn btn-primary" id="empty-add-btn" style="margin-top:12px;">${Icons.svg("plus")} Add Product</button>
      </div>`;
    document.getElementById("empty-add-btn").addEventListener("click", openProductModal);
    renderPagination(0, 0);
    return;
  }

  document.getElementById("products-table").style.display = "";
  emptyEl.style.display = filtered.length === 0 ? "block" : "none";
  if (filtered.length === 0) {
    emptyEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${Icons.svg("search")}</div>
        <h4>No matches</h4>
        <p>Try a different search term or clear your filters.</p>
      </div>`;
  }

  tbody.innerHTML = pageItems.map((p) => {
    const status = stockStatus(p.quantity ?? 0, p.reorderLevel ?? 5);
    return `
    <tr data-id="${p.id}">
      <td>
        <div class="table-product-cell">
          <img class="table-thumb" src="${p.imageUrl || ""}" onerror="this.style.background='var(--color-bg-subtle)';this.src='';" alt="">
          <span class="name">${escapeHtml(p.name)}</span>
        </div>
      </td>
      <td><span class="sku-tag">${escapeHtml(p.sku || "—")}</span></td>
      <td>${escapeHtml(p.category || "—")}</td>
      <td class="mono">${formatMoney(p.costPrice)} <span class="text-muted">/</span> ${formatMoney(p.sellingPrice)}</td>
      <td>${stockGaugeHtml(p.quantity ?? 0, p.reorderLevel ?? 5)}</td>
      <td>${escapeHtml(p.supplier || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn edit-btn" aria-label="Edit ${escapeHtml(p.name)}">${Icons.svg("edit")}</button>
          <button class="icon-btn danger delete-btn" aria-label="Delete ${escapeHtml(p.name)}">${Icons.svg("trash")}</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".edit-btn").forEach(btn => btn.addEventListener("click", (e) => {
    const id = e.target.closest("tr").dataset.id;
    openProductModal(products.find(p => p.id === id));
  }));
  tbody.querySelectorAll(".delete-btn").forEach(btn => btn.addEventListener("click", (e) => {
    const id = e.target.closest("tr").dataset.id;
    handleDelete(products.find(p => p.id === id));
  }));

  renderPagination(filtered.length, totalPages);
}

function renderPagination(total, totalPages) {
  const el = document.getElementById("pagination");
  if (total === 0) { el.innerHTML = ""; return; }
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);
  let btns = "";
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) btns += `<span class="text-muted" style="padding:0 4px;">…</span>`;
      continue;
    }
    btns += `<button class="${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
  }
  el.innerHTML = `
    <span class="page-info">Showing ${start}–${end} of ${total}</span>
    <div class="page-controls">
      <button data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="Previous page">${Icons.svg("chevronLeft")}</button>
      ${btns}
      <button data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="Next page">${Icons.svg("chevronRight")}</button>
    </div>`;
  el.querySelectorAll("button[data-page]").forEach(b => b.addEventListener("click", () => {
    currentPage = Number(b.dataset.page);
    render();
    document.querySelector(".page-content").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function refreshCategoryFilter() {
  const sel = document.getElementById("category-filter");
  const current = sel.value;
  sel.innerHTML = `<option value="">All categories</option>` + categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
  sel.value = current;
}

/* --------------------------------------------------------- Add / Edit */
function openProductModal(product = null) {
  const isEdit = !!product;
  const categoryOptions = categories.map(c => `<option value="${escapeHtml(c.name)}" ${product?.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const supplierOptions = suppliers.map(s => `<option value="${escapeHtml(s.name)}" ${product?.supplier === s.name ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");

  const modal = openModal({
    title: isEdit ? "Edit Product" : "Add Product",
    size: "lg",
    bodyHtml: `
      <form id="product-form" novalidate>
        <div class="img-upload" style="margin-bottom:20px;">
          <div class="preview" id="img-preview">${product?.imageUrl ? `<img src="${product.imageUrl}">` : Icons.svg("image")}</div>
          <div>
            <label class="btn btn-secondary btn-sm" for="image-input" style="cursor:pointer;">${Icons.svg("upload")} Upload image</label>
            <input type="file" id="image-input" accept="image/*" style="display:none;">
            <p class="text-xs text-muted" style="margin-top:6px;">PNG or JPG, up to 5MB.</p>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="p-name">Product name</label>
            <input class="input" id="p-name" value="${escapeHtml(product?.name || "")}" placeholder="e.g. Espresso Beans 1kg" required>
            <div class="error-msg" id="err-name"></div>
          </div>
          <div class="field">
            <label for="p-category">Category</label>
            <select class="input" id="p-category">
              <option value="">Uncategorized</option>
              ${categoryOptions}
            </select>
          </div>
        </div>

        <div class="field">
          <label for="p-sku">SKU</label>
          <div class="input-group">
            <input class="input" id="p-sku" style="padding-left:14px;" value="${escapeHtml(product?.sku || "")}" placeholder="e.g. ESP-4821-TX9" required>
            <button type="button" class="btn btn-secondary btn-sm input-suffix-btn" id="gen-sku-btn">Generate</button>
          </div>
          <div class="error-msg" id="err-sku"></div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="p-cost">Cost price</label>
            <input class="input" id="p-cost" type="number" min="0" step="0.01" value="${product?.costPrice ?? ""}" placeholder="0.00" required>
            <div class="error-msg" id="err-cost"></div>
          </div>
          <div class="field">
            <label for="p-price">Selling price</label>
            <input class="input" id="p-price" type="number" min="0" step="0.01" value="${product?.sellingPrice ?? ""}" placeholder="0.00" required>
            <div class="error-msg" id="err-price"></div>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="p-qty">Quantity in stock</label>
            <input class="input" id="p-qty" type="number" min="0" step="1" value="${product?.quantity ?? 0}" required ${isEdit ? "disabled" : ""}>
            <div class="hint">${isEdit ? "Use Stock & Movements to adjust quantity." : ""}</div>
          </div>
          <div class="field">
            <label for="p-reorder">Reorder level</label>
            <input class="input" id="p-reorder" type="number" min="0" step="1" value="${product?.reorderLevel ?? 5}">
            <div class="hint">Flagged low stock at or below this number.</div>
          </div>
        </div>

        <div class="field">
          <label for="p-supplier">Supplier</label>
          <input class="input" id="p-supplier" list="supplier-list" value="${escapeHtml(product?.supplier || "")}" placeholder="e.g. Northgate Distributors">
          <datalist id="supplier-list">${suppliers.map(s => `<option value="${escapeHtml(s.name)}">`).join("")}</datalist>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? "Save changes" : "Add product"}</button>
    `,
  });

  let imageFile = null;
  document.getElementById("image-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image too large", "Please choose a file under 5MB."); return; }
    imageFile = file;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById("img-preview").innerHTML = `<img src="${reader.result}">`; };
    reader.readAsDataURL(file);
  });

  document.getElementById("gen-sku-btn").addEventListener("click", () => {
    const cat = document.getElementById("p-category").value || document.getElementById("p-name").value || "GEN";
    document.getElementById("p-sku").value = generateSKU(cat);
  });

  modal.querySelector("#modal-cancel").addEventListener("click", () => modal.close());

  modal.querySelector("#modal-save").addEventListener("click", async () => {
    const data = {
      name: document.getElementById("p-name").value.trim(),
      category: document.getElementById("p-category").value,
      sku: document.getElementById("p-sku").value.trim().toUpperCase(),
      costPrice: Number(document.getElementById("p-cost").value),
      sellingPrice: Number(document.getElementById("p-price").value),
      quantity: isEdit ? product.quantity : Number(document.getElementById("p-qty").value),
      reorderLevel: Number(document.getElementById("p-reorder").value) || 0,
      supplier: document.getElementById("p-supplier").value.trim(),
    };

    let valid = true;
    ["name", "sku", "cost", "price"].forEach(f => { const el = document.getElementById(`err-${f}`); if (el) el.textContent = ""; });
    if (!validate.required(data.name)) { document.getElementById("err-name").textContent = "Product name is required."; valid = false; }
    if (!validate.required(data.sku)) { document.getElementById("err-sku").textContent = "SKU is required."; valid = false; }
    if (!validate.positiveNumber(data.costPrice)) { document.getElementById("err-cost").textContent = "Enter a valid cost price."; valid = false; }
    if (!validate.positiveNumber(data.sellingPrice)) { document.getElementById("err-price").textContent = "Enter a valid selling price."; valid = false; }
    if (!valid) return;

    const saveBtn = document.getElementById("modal-save");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner" style="border-color:rgba(255,255,255,0.4);border-top-color:#fff;"></span>`;

    try {
      if (isEdit) {
        await updateProduct(product.id, data, imageFile);
        toast.success("Product updated", `${data.name} has been saved.`);
      } else {
        await createProduct(data, imageFile);
        toast.success("Product added", `${data.name} is now in your inventory.`);
      }
      modal.close();
    } catch (err) {
      toast.error("Couldn't save product", err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? "Save changes" : "Add product";
    }
  });
}

async function handleDelete(product) {
  const ok = await confirmDialog({
    title: "Delete this product?",
    message: `"${product.name}" and its image will be permanently removed. This can't be undone.`,
    confirmText: "Delete product",
  });
  if (!ok) return;
  try {
    await deleteProduct(product.id);
    toast.success("Product deleted", `${product.name} was removed.`);
  } catch (err) {
    toast.error("Couldn't delete product", err.message);
  }
}

document.getElementById("add-product-btn").addEventListener("click", () => openProductModal());

/* ----------------------------------------------------------- Categories */
document.getElementById("manage-categories-btn").addEventListener("click", () => {
  const modal = openModal({
    title: "Manage Categories",
    bodyHtml: `
      <div class="field" style="margin-bottom:12px;">
        <div class="input-group">
          <input class="input" id="new-cat-input" style="padding-left:14px;" placeholder="New category name">
          <button class="btn btn-primary btn-sm input-suffix-btn" id="add-cat-btn">Add</button>
        </div>
      </div>
      <div id="cat-list"></div>
    `,
    footerHtml: `<button class="btn btn-secondary" id="modal-close-cats">Done</button>`,
  });

  function renderCatList() {
    const el = modal.querySelector("#cat-list");
    if (categories.length === 0) {
      el.innerHTML = `<p class="text-sm text-muted" style="padding:12px 0;">No categories yet. Add one above.</p>`;
      return;
    }
    el.innerHTML = categories.map(c => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--color-border);">
        <span class="text-sm">${escapeHtml(c.name)}</span>
        <button class="icon-btn danger btn-sm cat-del" data-id="${c.id}" data-name="${escapeHtml(c.name)}">${Icons.svg("trash")}</button>
      </div>`).join("");
    el.querySelectorAll(".cat-del").forEach(btn => btn.addEventListener("click", async () => {
      const inUse = products.some(p => p.category === btn.dataset.name);
      if (inUse) { toast.warning("Category in use", "Reassign products before deleting this category."); return; }
      await deleteCategory(btn.dataset.id);
      toast.success("Category removed");
    }));
  }
  renderCatList();
  const unsub = watchCategories((items) => { categories = items; refreshCategoryFilter(); renderCatList(); });

  modal.querySelector("#add-cat-btn").addEventListener("click", async () => {
    const input = modal.querySelector("#new-cat-input");
    const name = input.value.trim();
    if (!name) return;
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast.warning("Already exists", "That category is already in your list."); return; }
    await createCategory(name);
    input.value = "";
    toast.success("Category added", name);
  });
  modal.querySelector("#modal-close-cats").addEventListener("click", () => { unsub(); modal.close(); });
});

/* ---------------------------------------------------------------- Init */
watchProducts((items) => { products = items; render(); }, (err) => toast.error("Couldn't load products", err.message));
watchCategories((items) => { categories = items; refreshCategoryFilter(); });
watchSuppliers((items) => { suppliers = items; });
