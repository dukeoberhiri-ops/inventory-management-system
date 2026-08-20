import { guardRoute } from "../auth.js";
import { initLayout } from "../layout.js";
import { Icons } from "../icons.js";
import { watchProducts, watchSales } from "../store.js";
import { formatMoney, formatNumber, escapeHtml, stockGaugeHtml } from "../utils.js";
import { makeLineChart, makeBarChart, makeDoughnutChart } from "../charts.js";

await guardRoute();
await initLayout({ activePage: "reports.html", pageTitle: "Reports" });
document.getElementById("app-shell").style.display = "flex";
document.getElementById("page-loader").style.display = "none";
document.getElementById("icon-printer").innerHTML = Icons.svg("printer");

document.getElementById("print-report-btn").addEventListener("click", () => window.print());

let products = [];
let sales = [];
let period = "monthly";
let periodChart = null, topRevenueChart = null, categoryValueChart = null;

/* ------------------------------------------------------------- Tabs */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("tab-sales").style.display = tab === "sales" ? "" : "none";
    document.getElementById("tab-inventory").style.display = tab === "inventory" ? "" : "none";
    if (tab === "inventory") renderInventoryReport();
  });
});
document.getElementById("period-select").addEventListener("change", (e) => { period = e.target.value; renderSalesReport(); });

/* ---------------------------------------------------------- Bucketing */
function bucketConfig() {
  if (period === "daily") return { count: 14, label: "day", fmt: (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
  if (period === "weekly") return { count: 12, label: "week", fmt: (d) => `Wk of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` };
  return { count: 12, label: "month", fmt: (d) => d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) };
}

function bucketStart(date, unit, offsetFromNow) {
  const d = new Date();
  if (unit === "day") { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offsetFromNow); return d; }
  if (unit === "week") { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay() - offsetFromNow * 7); return d; }
  d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - offsetFromNow); return d;
}

function bucketEnd(start, unit) {
  const d = new Date(start);
  if (unit === "day") d.setDate(d.getDate() + 1);
  else if (unit === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function saleDate(s) {
  return s.createdAt?.toDate ? s.createdAt.toDate() : (s.createdAt ? new Date(s.createdAt) : null);
}

function renderSalesReport() {
  const cfg = bucketConfig();
  const buckets = [];
  for (let i = cfg.count - 1; i >= 0; i--) {
    const start = bucketStart(new Date(), cfg.label, i);
    const end = bucketEnd(start, cfg.label);
    buckets.push({ start, end, label: cfg.fmt(start), revenue: 0, units: 0, transactions: 0 });
  }
  sales.forEach((s) => {
    const d = saleDate(s);
    if (!d) return;
    const bucket = buckets.find(b => d >= b.start && d < b.end);
    if (!bucket) return;
    bucket.revenue += s.total || 0;
    bucket.transactions += 1;
    bucket.units += (s.items || []).reduce((sum, i) => sum + i.qty, 0);
  });

  document.getElementById("period-sub").textContent = { daily: "Last 14 days", weekly: "Last 12 weeks", monthly: "Last 12 months" }[period];
  document.getElementById("breakdown-sub").textContent = { daily: "By day", weekly: "By week", monthly: "By month" }[period];

  if (periodChart) periodChart.destroy();
  periodChart = makeLineChart(document.getElementById("periodChart"), buckets.map(b => b.label), buckets.map(b => Math.round(b.revenue * 100) / 100), "Revenue");

  document.getElementById("breakdown-tbody").innerHTML = buckets.slice().reverse().map(b => `
    <tr>
      <td class="text-sm" style="font-weight:600;">${b.label}</td>
      <td class="mono">${formatNumber(b.transactions)}</td>
      <td class="mono">${formatNumber(b.units)}</td>
      <td class="mono" style="font-weight:700;">${formatMoney(b.revenue)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="text-muted text-sm" style="padding:24px;text-align:center;">No sales in this range yet.</td></tr>`;

  // Range totals for stat cards
  const rangeStart = buckets[0]?.start;
  const inRange = sales.filter(s => { const d = saleDate(s); return d && rangeStart && d >= rangeStart; });
  const revenue = inRange.reduce((s, x) => s + (x.total || 0), 0);
  const cost = inRange.reduce((s, x) => s + (x.items || []).reduce((a, i) => a + (i.cost || 0) * i.qty, 0), 0);
  const profit = revenue - cost;
  const unitsSold = inRange.reduce((s, x) => s + (x.items || []).reduce((a, i) => a + i.qty, 0), 0);

  document.getElementById("report-stats").innerHTML = [
    { icon: "dollar", tone: "primary", value: formatMoney(revenue), label: "Total Revenue" },
    { icon: "trendUp", tone: "success", value: formatMoney(profit), label: "Estimated Profit" },
    { icon: "cart", tone: "accent", value: formatNumber(inRange.length), label: "Transactions" },
    { icon: "package", tone: "primary", value: formatNumber(unitsSold), label: "Units Sold" },
  ].map(c => `
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon tone-${c.tone}">${Icons.svg(c.icon)}</div></div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>`).join("");

  // Top products by revenue within range
  const totals = {};
  inRange.forEach(s => (s.items || []).forEach(i => { totals[i.name] = (totals[i.name] || 0) + i.price * i.qty; }));
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (topRevenueChart) topRevenueChart.destroy();
  const canvas = document.getElementById("topRevenueChart");
  if (sorted.length === 0) {
    canvas.parentElement.innerHTML = `<div class="empty-state" style="padding:32px 16px;"><div class="empty-icon">${Icons.svg("barChart")}</div><h4>No sales yet</h4><p>Top products will appear once you record sales.</p></div>`;
  } else {
    topRevenueChart = makeBarChart(canvas, sorted.map(s => s[0]), sorted.map(s => Math.round(s[1] * 100) / 100), "Revenue", "#2D3A6B");
  }
}

/* ------------------------------------------------------- Inventory tab */
function renderInventoryReport() {
  const totalUnits = products.reduce((s, p) => s + (p.quantity ?? 0), 0);
  const costValue = products.reduce((s, p) => s + (p.quantity ?? 0) * (p.costPrice ?? 0), 0);
  const retailValue = products.reduce((s, p) => s + (p.quantity ?? 0) * (p.sellingPrice ?? 0), 0);
  const flagged = products.filter(p => (p.quantity ?? 0) <= (p.reorderLevel ?? 5));

  document.getElementById("inventory-report-stats").innerHTML = [
    { icon: "box", tone: "primary", value: formatNumber(products.length), label: "Products" },
    { icon: "layers", tone: "primary", value: formatNumber(totalUnits), label: "Total Units" },
    { icon: "dollar", tone: "success", value: formatMoney(costValue), label: "Inventory Cost Value" },
    { icon: "trendUp", tone: "accent", value: formatMoney(retailValue), label: "Inventory Retail Value" },
  ].map(c => `
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon tone-${c.tone}">${Icons.svg(c.icon)}</div></div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>`).join("");

  const byCategory = {};
  products.forEach(p => {
    const cat = p.category || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + (p.quantity ?? 0) * (p.costPrice ?? 0);
  });
  const entries = Object.entries(byCategory).filter(([, v]) => v > 0);
  const canvas = document.getElementById("categoryValueChart");
  if (categoryValueChart) categoryValueChart.destroy();
  if (entries.length === 0) {
    canvas.parentElement.innerHTML = `<div class="empty-state" style="padding:32px 16px;"><div class="empty-icon">${Icons.svg("layers")}</div><h4>Nothing to show yet</h4><p>Add products with cost prices to see value by category.</p></div>`;
  } else {
    categoryValueChart = makeDoughnutChart(canvas, entries.map(e => e[0]), entries.map(e => Math.round(e[1] * 100) / 100));
  }

  const listEl = document.getElementById("low-stock-report-list");
  if (flagged.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:32px 16px;"><div class="empty-icon">${Icons.svg("check")}</div><h4>All good</h4><p>No products are currently low or out of stock.</p></div>`;
  } else {
    listEl.innerHTML = `<ul>` + flagged.sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0)).map(p => `
      <li style="display:flex;align-items:center;gap:12px;padding:14px 24px;border-bottom:1px solid var(--color-border);">
        <div style="flex:1;min-width:0;">
          <div class="text-sm" style="font-weight:600;">${escapeHtml(p.name)}</div>
          <div class="text-xs text-muted mono">${escapeHtml(p.sku || "")}</div>
        </div>
        ${stockGaugeHtml(p.quantity ?? 0, p.reorderLevel ?? 5)}
      </li>`).join("") + `</ul>`;
  }
}

watchProducts((items) => { products = items; if (document.getElementById("tab-inventory").style.display !== "none") renderInventoryReport(); });
watchSales((items) => { sales = items; renderSalesReport(); });
