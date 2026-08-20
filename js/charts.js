/**
 * charts.js — thin wrapper around Chart.js (loaded from CDN in each HTML
 * page) so charts share consistent styling across the app.
 *
 * NOTE: Chart.js defaults are configured lazily, inside configureDefaults(),
 * rather than at module top-level. If this ran at the top of the file, it
 * would reference the global `Chart` object at *import time* — and since
 * ES module imports are evaluated before the importing script's own code
 * runs, a slow or blocked Chart.js CDN load would throw here silently,
 * before the page's own script (e.g. dashboard.js) ever gets a chance to
 * run — with no visible error. Deferring this until a chart is actually
 * created avoids that entirely.
 */
const PALETTE = {
  primary: "#2D3A6B",
  primaryFill: "rgba(45, 58, 107, 0.10)",
  accent: "#EF9433",
  accentFill: "rgba(239, 148, 51, 0.15)",
  success: "#1E9E63",
  danger: "#D6403F",
  grid: "#E2E5EC",
  text: "#5C6A87",
};

let defaultsConfigured = false;
function configureDefaults() {
  if (defaultsConfigured) return;
  if (typeof Chart === "undefined") {
    console.error("Chart.js failed to load from the CDN — charts will not render.");
    return;
  }
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = PALETTE.text;
  defaultsConfigured = true;
}

export function makeLineChart(ctx, labels, dataPoints, label = "Revenue") {
  configureDefaults();
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data: dataPoints,
        borderColor: PALETTE.primary,
        backgroundColor: PALETTE.primaryFill,
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: PALETTE.primary,
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0 } },
        y: { grid: { color: PALETTE.grid }, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

export function makeBarChart(ctx, labels, dataPoints, label = "Units Sold", color = PALETTE.accent) {
  configureDefaults();
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label, data: dataPoints, backgroundColor: color, borderRadius: 6, maxBarThickness: 34 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: PALETTE.grid }, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

export function makeDoughnutChart(ctx, labels, dataPoints) {
  configureDefaults();
  const colors = [PALETTE.primary, PALETTE.accent, PALETTE.success, "#2E86C1", "#8590A8", "#D6403F"];
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: dataPoints, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, padding: 14, usePointStyle: true, pointStyle: "circle" } } },
    },
  });
}
