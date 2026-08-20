import { guardRoute } from "../auth.js";
import { initLayout } from "../layout.js";
import { Icons } from "../icons.js";
import { toast } from "../toast.js";
import { openModal } from "../modal.js";
import { watchProducts, watchMovements, adjustStock } from "../store.js";
import {
  formatNumber, formatDateTime, debounce, escapeHtml, stockStatus, statusBadgeHtml, validate,
} from "../utils.js";

await guardRoute();
await initLayout({ activePage: "inventory.html", pageTitle: "Stock & Movements" });
document.getElementById("app-shell").style.display = "flex";
document.getElementById("page-loader").style.display = "none";
document.getElementById("icon-search").innerHTML = Icons.svg("search");

let products = [];
let movements = [];
const invState = { search: "", status: "" };
const histState = { type: "" };

/* ------------------------------------------------------------ Tabs */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("tab-overview").style.display = tab === "overview" ? "" : "none";
    document.getElementById("tab-history").style.display = tab === "history" ? "" : "none";
  });
});

/* --------------------------------------------------------- Stats bar */
function renderStats() {
  const low = products.filter(p => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= (p.reorderLevel ?? 5)).length;
  const out = products.filter(p => (p.quantity ?? 0) <= 0).length;
  const totalUnits = products.reduce((s, p) => s + (p.quantity ?? 0), 0);
  document.getElementById("inv-stats").innerHTML = `
    <div class="stat-card"><div class="stat-top"><div class="stat-icon tone-primary">${Icons.svg("layers")}</div></div><div class="stat-value">${formatNumber(totalUnits)}</div><div class="stat-label">Total Units in Stock</div></div>
    <div class="stat-card"><div class="stat-top"><div class="stat-icon tone-accent">${Icons.svg("alertTriangle")}</div></div><div class="stat-value">${formatNumber(low)}</div><div class="stat-label">Low Stock Alerts</div></div>
    <div class="stat-card"><div class="stat-top"><div class="stat-icon tone-danger">${Icons.svg("alertCircle")}</div></div><div class="stat-value">${formatNumber(out)}</div><div class="stat-label">Out-of-Stock Alerts</div></div>
  `;
}

/* ------------------------------------------------------ Overview tab */
document.getElementById("inv-search").addEventListener("input", debounce((e) => { invState.search = e.target.value.trim().toLowerCase(); renderOverview(); }, 250));
document.getElementById("inv-status-filter").addEventListener("change", (e) => { invState.status = e.target.value; renderOverview(); });

function renderOverview() {
  const list = products.filter(p => {
    if (invState.search && !(`${p.name} ${p.sku}`.toLowerCase().includes(invState.search))) return false;
    if (invState.status && stockStatus(p.quantity ?? 0, p.reorderLevel ?? 5) !== invState.status) return false;
    return true;
  }).sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));

  const tbody = document.getElementById("inv-tbody");
  const emptyEl = document.getElementById("inv-empty");

  if (products.length === 0) {
    tbody.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${Icons.svg("layers")}</div><h4>No products to track</h4><p>Add products first, then manage their stock levels here.</p></div>`;
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${Icons.svg("search")}</div><h4>No matches</h4><p>Try a different search or filter.</p></div>`;
    return;
  }
  emptyEl.style.display = "none";

  tbody.innerHTML = list.map(p => {
    const status = stockStatus(p.quantity ?? 0, p.reorderLevel ?? 5);
    return `
    <tr>
      <td><div class="table-product-cell"><img class="table-thumb" src="${p.imageUrl || ""}" onerror="this.src=''"><span class="name">${escapeHtml(p.name)}</span></div></td>
      <td><span class="sku-tag">${escapeHtml(p.sku || "—")}</span></td>
      <td class="mono" style="font-weight:700;">${p.quantity ?? 0}</td>
      <td class="mono text-muted">${p.reorderLevel ?? 0}</td>
      <td>${statusBadgeHtml(status)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm adjust-btn" data-id="${p.id}">${Icons.svg("refresh")} Adjust</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".adjust-btn").forEach(btn => btn.addEventListener("click", () => {
    openAdjustModal(products.find(p => p.id === btn.dataset.id));
  }));
}

function openAdjustModal(product) {
  const modal = openModal({
    title: `Adjust Stock — ${product.name}`,
    bodyHtml: `
      <p class="text-sm text-muted" style="margin-bottom:16px;">Current quantity: <strong class="mono">${product.quantity ?? 0}</strong></p>
      <div class="field">
        <label>Adjustment type</label>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-secondary btn-block" id="adj-type-in" data-type="in">${Icons.svg("arrowDownLeft")} Stock In</button>
          <button type="button" class="btn btn-secondary btn-block" id="adj-type-out" data-type="out">${Icons.svg("arrowUpRight")} Stock Out</button>
        </div>
      </div>
      <div class="field">
        <label for="adj-qty">Quantity</label>
        <input class="input" id="adj-qty" type="number" min="1" step="1" placeholder="e.g. 20">
        <div class="error-msg" id="adj-err"></div>
      </div>
      <div class="field">
        <label for="adj-reason">Reason</label>
        <input class="input" id="adj-reason" placeholder="e.g. Restock delivery, damaged goods, stock count correction">
      </div>
    `,
    footerHtml: `
      <button class="btn btn-secondary" id="adj-cancel">Cancel</button>
      <button class="btn btn-primary" id="adj-save">Save adjustment</button>
    `,
  });

  let type = "in";
  const inBtn = modal.querySelector("#adj-type-in");
  const outBtn = modal.querySelector("#adj-type-out");
  function setType(t) {
    type = t;
    inBtn.classList.toggle("btn-primary", t === "in");
    inBtn.classList.toggle("btn-secondary", t !== "in");
    outBtn.classList.toggle("btn-danger", t === "out");
    outBtn.classList.toggle("btn-secondary", t !== "out");
  }
  setType("in");
  inBtn.addEventListener("click", () => setType("in"));
  outBtn.addEventListener("click", () => setType("out"));

  modal.querySelector("#adj-cancel").addEventListener("click", () => modal.close());
  modal.querySelector("#adj-save").addEventListener("click", async () => {
    const qty = Number(modal.querySelector("#adj-qty").value);
    const reason = modal.querySelector("#adj-reason").value.trim();
    if (!validate.positiveNumber(qty) || qty <= 0) {
      modal.querySelector("#adj-err").textContent = "Enter a quantity greater than zero.";
      return;
    }
    const saveBtn = modal.querySelector("#adj-save");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner" style="border-color:rgba(255,255,255,0.4);border-top-color:#fff;"></span>`;
    try {
      await adjustStock(product, type === "in" ? qty : -qty, reason);
      toast.success("Stock updated", `${product.name} adjusted by ${type === "in" ? "+" : "-"}${qty}.`);
      modal.close();
    } catch (err) {
      toast.error("Couldn't adjust stock", err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save adjustment";
    }
  });
}

/* -------------------------------------------------------- History tab */
document.getElementById("hist-type-filter").addEventListener("change", (e) => { histState.type = e.target.value; renderHistory(); });

const TYPE_LABEL = { in: "Stock In", out: "Stock Out", sale: "Sale", adjustment: "Adjustment" };
const TYPE_BADGE = { in: "badge-success", out: "badge-warning", sale: "badge-info", adjustment: "badge-neutral" };

function renderHistory() {
  const list = movements.filter(m => !histState.type || m.type === histState.type);
  const tbody = document.getElementById("hist-tbody");
  const emptyEl = document.getElementById("hist-empty");

  if (list.length === 0) {
    tbody.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${Icons.svg("history")}</div><h4>No movements recorded</h4><p>Stock adjustments and sales will show up here as they happen.</p></div>`;
    return;
  }
  emptyEl.style.display = "none";
  tbody.innerHTML = list.map(m => `
    <tr>
      <td class="text-sm text-muted">${formatDateTime(m.createdAt)}</td>
      <td><span style="font-weight:600;">${escapeHtml(m.productName || "—")}</span> <span class="text-xs text-muted mono">${escapeHtml(m.sku || "")}</span></td>
      <td><span class="badge ${TYPE_BADGE[m.type] || "badge-neutral"}">${TYPE_LABEL[m.type] || m.type}</span></td>
      <td class="mono" style="font-weight:700;color:${m.quantityChange >= 0 ? "var(--color-success-700)" : "var(--color-danger-700)"}">${m.quantityChange >= 0 ? "+" : ""}${m.quantityChange}</td>
      <td class="mono text-muted">${m.balanceAfter ?? "—"}</td>
      <td class="text-sm">${escapeHtml(m.reason || "—")}</td>
      <td class="text-xs text-muted">${escapeHtml(m.createdBy || "—")}</td>
    </tr>
  `).join("");
}

/* --------------------------------------------------------------- Init */
watchProducts((items) => { products = items; renderStats(); renderOverview(); }, (err) => toast.error("Couldn't load products", err.message));
watchMovements((items) => { movements = items; renderHistory(); }, (err) => toast.error("Couldn't load stock history", err.message));
