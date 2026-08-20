import { guardRoute } from "../auth.js";
import { initLayout } from "../layout.js";
import { Icons } from "../icons.js";
import { toast } from "../toast.js";
import { openModal } from "../modal.js";
import { watchProducts, watchSales, recordSale } from "../store.js";
import { formatMoney, formatDateTime, debounce, escapeHtml, businessSettings } from "../utils.js";

await guardRoute();
await initLayout({ activePage: "sales.html", pageTitle: "Sales" });
document.getElementById("app-shell").style.display = "flex";
document.getElementById("page-loader").style.display = "none";
document.getElementById("icon-search").innerHTML = Icons.svg("search");
document.getElementById("icon-search-2").innerHTML = Icons.svg("search");

let products = [];
let sales = [];
let cart = []; // { productId, name, sku, price, qty, maxQty }
let posSearch = "";

/* ------------------------------------------------------------- Tabs */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("tab-new").style.display = tab === "new" ? "" : "none";
    document.getElementById("tab-history").style.display = tab === "history" ? "" : "none";
  });
});

/* ------------------------------------------------------------ POS grid */
document.getElementById("pos-search").addEventListener("input", debounce((e) => { posSearch = e.target.value.trim().toLowerCase(); renderPosGrid(); }, 200));

function renderPosGrid() {
  const grid = document.getElementById("pos-grid");
  const list = products.filter(p => (p.quantity ?? 0) > 0 && `${p.name} ${p.sku}`.toLowerCase().includes(posSearch));

  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">${Icons.svg("box")}</div><h4>No products yet</h4><p>Add products in the Products tab before recording a sale.</p></div>`;
    return;
  }
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">${Icons.svg("search")}</div><h4>No in-stock matches</h4><p>Try a different search term.</p></div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <button class="product-card" style="text-align:left;border:1px solid var(--color-border);cursor:pointer;" data-id="${p.id}">
      <div class="thumb">${p.imageUrl ? `<img src="${p.imageUrl}">` : Icons.svg("box")}</div>
      <div class="body">
        <div class="cat">${escapeHtml(p.category || "General")}</div>
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="price-row">
          <span class="price">${formatMoney(p.sellingPrice)}</span>
          <span class="text-xs text-muted">${p.quantity} left</span>
        </div>
      </div>
    </button>
  `).join("");
  grid.querySelectorAll(".product-card").forEach(card => card.addEventListener("click", () => addToCart(card.dataset.id)));
}

function addToCart(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  const existing = cart.find(l => l.productId === productId);
  if (existing) {
    if (existing.qty >= p.quantity) { toast.warning("Limited stock", `Only ${p.quantity} of ${p.name} available.`); return; }
    existing.qty++;
  } else {
    cart.push({ productId, name: p.name, sku: p.sku, price: p.sellingPrice, cost: p.costPrice, qty: 1, maxQty: p.quantity });
  }
  renderCart();
}

function renderCart() {
  const linesEl = document.getElementById("cart-lines");
  const emptyEl = document.getElementById("cart-empty");
  const btn = document.getElementById("complete-sale-btn");

  if (cart.length === 0) {
    linesEl.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `<div class="empty-state" style="padding:24px 8px;"><div class="empty-icon">${Icons.svg("cart")}</div><h4>Cart is empty</h4><p>Add products from the left to start a sale.</p></div>`;
    btn.disabled = true;
  } else {
    emptyEl.style.display = "none";
    linesEl.innerHTML = cart.map((l, i) => `
      <div class="cart-line">
        <span class="name">${escapeHtml(l.name)}</span>
        <div class="qty-ctrl">
          <button data-i="${i}" data-act="dec" aria-label="Decrease quantity">${Icons.svg("minus")}</button>
          <span class="mono text-sm" style="min-width:20px;text-align:center;">${l.qty}</span>
          <button data-i="${i}" data-act="inc" aria-label="Increase quantity">${Icons.svg("plus")}</button>
        </div>
        <span class="line-total mono">${formatMoney(l.price * l.qty)}</span>
        <button class="icon-btn danger btn-sm" data-i="${i}" data-act="remove" aria-label="Remove">${Icons.svg("x")}</button>
      </div>
    `).join("");
    btn.disabled = false;

    linesEl.querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      const act = b.dataset.act;
      if (act === "inc") { if (cart[i].qty < cart[i].maxQty) cart[i].qty++; else toast.warning("Limited stock", "No more units available."); }
      if (act === "dec") { cart[i].qty--; if (cart[i].qty <= 0) cart.splice(i, 1); }
      if (act === "remove") cart.splice(i, 1);
      renderCart();
    }));
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const taxPct = businessSettings.taxPercent || 0;
  const tax = subtotal * (taxPct / 100);
  const total = subtotal + tax;
  document.getElementById("cart-subtotal").textContent = formatMoney(subtotal);
  document.getElementById("cart-tax-label").textContent = `Tax (${taxPct}%)`;
  document.getElementById("cart-tax").textContent = formatMoney(tax);
  document.getElementById("cart-total").textContent = formatMoney(total);
}

document.getElementById("complete-sale-btn").addEventListener("click", async () => {
  if (cart.length === 0) return;
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const taxPct = businessSettings.taxPercent || 0;
  const tax = subtotal * (taxPct / 100);
  const total = subtotal + tax;
  const customerName = document.getElementById("customer-name").value.trim() || "Walk-in Customer";
  const paymentMethod = document.getElementById("payment-method").value;

  const btn = document.getElementById("complete-sale-btn");
  btn.disabled = true;
  document.getElementById("complete-sale-text").innerHTML = `<span class="spinner" style="border-color:rgba(255,255,255,0.4);border-top-color:#fff;"></span>`;

  try {
    const items = cart.map(l => ({ productId: l.productId, name: l.name, sku: l.sku, price: l.price, cost: l.cost || 0, qty: l.qty }));
    const { receiptNo, id } = await recordSale({ items, subtotal, tax, total, customerName, paymentMethod });
    toast.success("Sale completed", `Receipt ${receiptNo} — ${formatMoney(total)}`);
    const savedSale = { receiptNo, items, subtotal, tax, total, customerName, paymentMethod, createdAt: new Date() };
    cart = [];
    document.getElementById("customer-name").value = "";
    renderCart();
    showReceiptModal(savedSale, true);
  } catch (err) {
    toast.error("Couldn't complete sale", err.message);
  } finally {
    btn.disabled = cart.length === 0;
    document.getElementById("complete-sale-text").textContent = "Complete Sale";
  }
});

/* --------------------------------------------------------- Sales history */
let salesSearch = "";
document.getElementById("sales-search").addEventListener("input", debounce((e) => { salesSearch = e.target.value.trim().toLowerCase(); renderHistory(); }, 200));

function renderHistory() {
  const list = sales.filter(s => !salesSearch || `${s.receiptNo} ${s.customerName}`.toLowerCase().includes(salesSearch));
  const tbody = document.getElementById("sales-tbody");
  const emptyEl = document.getElementById("sales-empty");

  if (list.length === 0) {
    tbody.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${Icons.svg("receipt")}</div><h4>No sales recorded</h4><p>Completed sales will appear here.</p></div>`;
    return;
  }
  emptyEl.style.display = "none";
  tbody.innerHTML = list.map(s => `
    <tr>
      <td><span class="sku-tag">${escapeHtml(s.receiptNo)}</span></td>
      <td class="text-sm text-muted">${formatDateTime(s.createdAt)}</td>
      <td class="text-sm">${escapeHtml(s.customerName)}</td>
      <td class="text-sm text-muted">${(s.items || []).length} item${(s.items || []).length === 1 ? "" : "s"}</td>
      <td><span class="badge badge-info">${escapeHtml(s.paymentMethod)}</span></td>
      <td class="mono" style="font-weight:700;">${formatMoney(s.total)}</td>
      <td><button class="btn btn-ghost btn-sm view-receipt-btn" data-id="${s.id}">${Icons.svg("receipt")} Receipt</button></td>
    </tr>
  `).join("");
  tbody.querySelectorAll(".view-receipt-btn").forEach(b => b.addEventListener("click", () => {
    showReceiptModal(sales.find(s => s.id === b.dataset.id), false);
  }));
}

function showReceiptModal(sale, justCompleted) {
  const html = receiptHtml(sale);
  const modal = openModal({
    title: justCompleted ? "Sale complete" : "Receipt",
    bodyHtml: `<div class="receipt" id="receipt-content">${html}</div>`,
    footerHtml: `
      <button class="btn btn-secondary" id="receipt-close">Close</button>
      <button class="btn btn-primary" id="receipt-print">${Icons.svg("printer")} Print receipt</button>
    `,
  });
  modal.querySelector("#receipt-close").addEventListener("click", () => modal.close());
  modal.querySelector("#receipt-print").addEventListener("click", () => printReceipt(html));
}

function receiptHtml(sale) {
  const dateStr = sale.createdAt?.toDate ? formatDateTime(sale.createdAt) : formatDateTime(sale.createdAt || new Date());
  return `
    <div class="receipt-center">
      <strong style="font-size:var(--fs-md);">${escapeHtml(businessSettings.name)}</strong><br>
      <span class="text-xs text-muted">Sales Receipt</span>
    </div>
    <hr>
    <div class="r-row"><span>Receipt</span><span>${escapeHtml(sale.receiptNo)}</span></div>
    <div class="r-row"><span>Date</span><span>${dateStr}</span></div>
    <div class="r-row"><span>Customer</span><span>${escapeHtml(sale.customerName)}</span></div>
    <div class="r-row"><span>Payment</span><span>${escapeHtml(sale.paymentMethod)}</span></div>
    <hr>
    ${sale.items.map(i => `
      <div class="r-row"><span>${escapeHtml(i.name)} × ${i.qty}</span><span>${formatMoney(i.price * i.qty)}</span></div>
    `).join("")}
    <hr>
    <div class="r-row"><span>Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div>
    <div class="r-row"><span>Tax</span><span>${formatMoney(sale.tax)}</span></div>
    <div class="r-row r-total"><span>Total</span><span>${formatMoney(sale.total)}</span></div>
    <hr>
    <div class="receipt-center text-xs text-muted">Thank you for your business!</div>
  `;
}

function printReceipt(innerHtml) {
  const win = window.open("", "_blank", "width=420,height=640");
  win.document.write(`
    <html><head><title>Receipt</title>
    <style>
      body{font-family:'JetBrains Mono',monospace;padding:24px;color:#131A2E;}
      .r-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;}
      hr{border:none;border-top:1px dashed #ccc;margin:10px 0;}
      .r-total{font-weight:700;font-size:14px;}
      .receipt-center{text-align:center;}
    </style></head>
    <body>${innerHtml}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

/* ------------------------------------------------------------------ Init */
watchProducts((items) => { products = items; renderPosGrid(); }, (err) => toast.error("Couldn't load products", err.message));
watchSales((items) => { sales = items; renderHistory(); }, (err) => toast.error("Couldn't load sales", err.message));
renderCart();
