import { guardRoute } from "../auth.js";
import { initLayout } from "../layout.js";
import { Icons } from "../icons.js";
import { watchProducts, watchSales, watchMovements } from "../store.js";
import { formatMoney, formatNumber, timeAgo, stockGaugeHtml, escapeHtml } from "../utils.js";
import { makeLineChart, makeBarChart } from "../charts.js";
import { isDemoAdmin, isDemoUser, consumeWelcomePending } from "../demo.js";

const { user } = await (async () => {
  await guardRoute();
  return initLayout({ activePage: "dashboard.html", pageTitle: "Dashboard" });
})();
document.getElementById("app-shell").style.display = "flex";
document.getElementById("page-loader").style.display = "none";

if (isDemoUser(user) && consumeWelcomePending()) {
  const role = isDemoAdmin(user) ? "Demo Admin" : "Demo User";
  document.getElementById("demo-welcome-mount").innerHTML = `
    <div class="demo-banner" id="demo-banner">
      <div class="demo-icon">${Icons.svg("sparkle")}</div>
      <div class="demo-body">
        <div class="demo-title">Welcome to the demo — you're signed in as ${role}<span class="demo-role-badge">Live Demo</span></div>
        <div class="demo-msg">Feel free to explore all features of the application using this demonstration account. Any changes you make are for testing purposes only and may be reset at any time.</div>
      </div>
      <button class="icon-btn demo-close" id="demo-banner-close" aria-label="Dismiss">${Icons.svg("x")}</button>
    </div>`;
  document.getElementById("demo-banner-close").addEventListener("click", () => {
    document.getElementById("demo-banner").remove();
  });
}

document.getElementById("icon-cart").innerHTML = Icons.svg("cart");
document.getElementById("icon-plus").innerHTML = Icons.svg("plus");

const hour = new Date().getHours();
const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
document.getElementById("greeting").textContent = `${greeting} 👋`;
document.getElementById("today-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

let products = [];
let sales = [];
let movements = [];

let revenueChartInstance = null;
let topProductsChartInstance = null;

function renderStats() {
  const totalProducts = products.length;
  const lowStock = products.filter(p => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= (p.reorderLevel ?? 5)).length;
  const outOfStock = products.filter(p => (p.quantity ?? 0) <= 0).length;
  const totalSalesCount = sales.length;
  const revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);

  const cards = [
    { icon: "box", tone: "primary", value: formatNumber(totalProducts), label: "Total Products" },
    { icon: "alertTriangle", tone: "accent", value: formatNumber(lowStock), label: "Low Stock Items" },
    { icon: "alertCircle", tone: "danger", value: formatNumber(outOfStock), label: "Out of Stock Items" },
    { icon: "cart", tone: "success", value: formatNumber(totalSalesCount), label: "Total Sales" },
    { icon: "dollar", tone: "primary", value: formatMoney(revenue), label: "Revenue" },
  ];

  document.getElementById("stat-grid").innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-top">
        <div class="stat-icon tone-${c.tone}">${Icons.svg(c.icon)}</div>
      </div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join("");
}

function renderRevenueChart() {
  const days = [];
  const totals = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
    totals[key] = 0;
  }
  sales.forEach(s => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : null;
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    if (key in totals) totals[key] += (s.total || 0);
  });
  const labels = days.map(d => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  const values = days.map(d => Math.round(totals[d] * 100) / 100);

  if (revenueChartInstance) revenueChartInstance.destroy();
  revenueChartInstance = makeLineChart(document.getElementById("revenueChart"), labels, values, "Revenue");
}

function renderTopProductsChart() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const totals = {};
  sales.forEach(s => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : null;
    if (!d || d.getTime() < cutoff) return;
    (s.items || []).forEach(line => {
      totals[line.name] = (totals[line.name] || 0) + line.qty;
    });
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);

  if (topProductsChartInstance) topProductsChartInstance.destroy();
  const canvas = document.getElementById("topProductsChart");
  if (sorted.length === 0) {
    canvas.parentElement.innerHTML = `
      <div class="empty-state" style="padding:32px 16px;">
        <div class="empty-icon">${Icons.svg("barChart")}</div>
        <h4>No sales yet</h4>
        <p>Record a sale to see your best sellers here.</p>
      </div>`;
    return;
  }
  topProductsChartInstance = makeBarChart(canvas, sorted.map(s => s[0]), sorted.map(s => s[1]), "Units sold");
}

function renderActivity() {
  const el = document.getElementById("activity-list");
  if (movements.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:32px 16px;">
        <div class="empty-icon">${Icons.svg("activity")}</div>
        <h4>No activity yet</h4>
        <p>Stock adjustments and sales will appear here.</p>
      </div>`;
    return;
  }
  const iconFor = { in: "arrowDownLeft", out: "arrowUpRight", sale: "cart", adjustment: "refresh" };
  const toneFor = { in: "success", out: "danger", sale: "primary", adjustment: "accent" };
  el.innerHTML = `<ul>` + movements.slice(0, 6).map(m => `
    <li style="display:flex;align-items:center;gap:12px;padding:14px 24px;border-bottom:1px solid var(--color-border);">
      <span class="stat-icon tone-${toneFor[m.type] || "primary"}" style="width:36px;height:36px;">${Icons.svg(iconFor[m.type] || "activity")}</span>
      <div style="flex:1;min-width:0;">
        <div class="text-sm" style="font-weight:600;color:var(--color-ink-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.productName || "Product")}</div>
        <div class="text-xs text-muted">${escapeHtml(m.reason || "")}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="mono text-sm" style="font-weight:700;color:${m.quantityChange >= 0 ? "var(--color-success-700)" : "var(--color-danger-700)"}">${m.quantityChange >= 0 ? "+" : ""}${m.quantityChange}</div>
        <div class="text-xs text-muted">${timeAgo(m.createdAt)}</div>
      </div>
    </li>
  `).join("") + `</ul>`;
}

function renderAttention() {
  const el = document.getElementById("attention-list");
  const flagged = products
    .filter(p => (p.quantity ?? 0) <= (p.reorderLevel ?? 5))
    .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));

  if (flagged.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:32px 16px;">
        <div class="empty-icon">${Icons.svg("check")}</div>
        <h4>All stocked up</h4>
        <p>No products are below their reorder level right now.</p>
      </div>`;
    return;
  }
  el.innerHTML = `<ul>` + flagged.slice(0, 6).map(p => `
    <li style="display:flex;align-items:center;gap:12px;padding:14px 24px;border-bottom:1px solid var(--color-border);">
      <img src="${p.imageUrl || ""}" onerror="this.style.display='none'" class="table-thumb" alt="">
      <div style="flex:1;min-width:0;">
        <div class="text-sm" style="font-weight:600;color:var(--color-ink-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</div>
        <div class="text-xs text-muted mono">${escapeHtml(p.sku || "")}</div>
      </div>
      ${stockGaugeHtml(p.quantity ?? 0, p.reorderLevel ?? 5)}
    </li>
  `).join("") + `</ul>`;
}

watchProducts((items) => { products = items; renderStats(); renderAttention(); });
watchSales((items) => { sales = items; renderStats(); renderRevenueChart(); renderTopProductsChart(); });
watchMovements((items) => { movements = items; renderActivity(); }, console.error, 30);
