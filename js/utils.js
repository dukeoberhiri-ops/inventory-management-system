/**
 * utils.js — shared, dependency-free helper functions used across pages.
 */

/** Business settings cache, hydrated by settings.js / layout.js on load. */
export const businessSettings = {
  name: "Stockpile Retail",
  logoUrl: "",
  currency: "USD",
  currencySymbol: "$",
  taxPercent: 0,
};

const CURRENCY_SYMBOLS = {
  USD: "$", EUR: "€", GBP: "£", NGN: "₦", KES: "KSh", ZAR: "R",
  INR: "₹", CAD: "CA$", AUD: "A$", JPY: "¥", GHS: "GH₵",
};

export function currencySymbolFor(code) {
  return CURRENCY_SYMBOLS[code] || code + " ";
}

/** Format a number as money using the current business currency settings. */
export function formatMoney(amount) {
  const n = Number(amount) || 0;
  const symbol = businessSettings.currencySymbol || "$";
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

export function formatDate(dateInput) {
  const d = toDate(dateInput);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(dateInput) {
  const d = toDate(dateInput);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function timeAgo(dateInput) {
  const d = toDate(dateInput);
  if (!d) return "—";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const steps = [
    [31536000, "y"], [2592000, "mo"], [604800, "w"],
    [86400, "d"], [3600, "h"], [60, "m"],
  ];
  for (const [secs, label] of steps) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val}${label} ago`;
  }
  return "just now";
}

function toDate(input) {
  if (!input) return null;
  if (input.toDate) return input.toDate(); // Firestore Timestamp
  if (input instanceof Date) return input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/** Generate a readable, unique-ish SKU, e.g. "APL-4821-TX9". */
export function generateSKU(categoryName = "GEN") {
  const prefix = categoryName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const mid = Math.floor(1000 + Math.random() * 9000);
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${mid}-${suffix}`;
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/** Stock level classification against a reorder threshold. */
export function stockStatus(qty, reorderLevel = 5) {
  if (qty <= 0) return "out";
  if (qty <= reorderLevel) return "low";
  return "ok";
}

export function stockStatusLabel(status) {
  return { ok: "In Stock", low: "Low Stock", out: "Out of Stock" }[status] || "Unknown";
}

/** Renders the signature "stock gauge" bar used throughout the app. */
export function stockGaugeHtml(qty, reorderLevel = 5, capacity = null) {
  const status = stockStatus(qty, reorderLevel);
  const max = capacity || Math.max(reorderLevel * 4, qty, 10);
  const pct = Math.max(4, Math.min(100, Math.round((qty / max) * 100)));
  return `
    <div class="stock-gauge ${status}" title="${qty} in stock, reorder at ${reorderLevel}">
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <span class="gauge-label">${qty}</span>
    </div>`;
}

export function statusBadgeHtml(status) {
  const map = {
    ok: ["badge-success", "In Stock"],
    low: ["badge-warning", "Low Stock"],
    out: ["badge-danger", "Out of Stock"],
  };
  const [cls, label] = map[status] || ["badge-neutral", "Unknown"];
  return `<span class="badge ${cls}">${label}</span>`;
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Simple query-param helper. */
export function qparam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Basic client-side validators. */
export const validate = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ""),
  required: (v) => v !== undefined && v !== null && String(v).trim().length > 0,
  positiveNumber: (v) => !isNaN(v) && Number(v) >= 0,
  minLength: (v, n) => (v || "").length >= n,
};

export function friendlyFirebaseError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "We couldn't find an account with that email.",
    "auth/wrong-password": "Incorrect password. Try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account already exists with that email.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "permission-denied": "You don't have permission to do that.",
    "unavailable": "Service temporarily unavailable. Please try again.",
  };
  return map[code] || err?.message || "Something went wrong. Please try again.";
}
