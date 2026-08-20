/**
 * layout.js — builds the sidebar + topbar app shell shared by every
 * authenticated page, so markup lives in one place.
 */
import { auth, db } from "./firebase-config.js";
import { Icons } from "./icons.js";
import { logoutUser, getUserProfile } from "./auth.js";
import { initials, businessSettings, currencySymbolFor } from "./utils.js";
import { isDemoAdmin, isDemoUser } from "./demo.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const NAV = [
  { section: "Overview", links: [
    { href: "dashboard.html", icon: "grid", label: "Dashboard" },
  ]},
  { section: "Inventory", links: [
    { href: "products.html", icon: "box", label: "Products" },
    { href: "inventory.html", icon: "layers", label: "Stock & Movements", badgeId: "nav-low-stock-badge" },
  ]},
  { section: "Selling", links: [
    { href: "sales.html", icon: "cart", label: "Sales" },
    { href: "reports.html", icon: "barChart", label: "Reports" },
  ]},
  { section: "Account", links: [
    { href: "settings.html", icon: "settings", label: "Settings" },
  ]},
];

function sidebarHtml(activePage) {
  const navHtml = NAV.map(group => `
    <div class="sidebar-section-label">${group.section}</div>
    ${group.links.map(l => `
      <a href="${l.href}" class="sidebar-link ${activePage === l.href ? "active" : ""}">
        ${Icons.svg(l.icon)}
        <span>${l.label}</span>
        ${l.badgeId ? `<span class="badge-count" id="${l.badgeId}" style="display:none;">0</span>` : ""}
      </a>
    `).join("")}
  `).join("");

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <span class="mark" id="sidebar-logo-mark">S</span>
        <span id="sidebar-brand-name">Stockpile</span>
        <button class="icon-btn sidebar-close-btn" id="sidebar-close-btn" aria-label="Close menu" style="margin-left:auto;color:rgba(255,255,255,0.7)">${Icons.svg("x")}</button>
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user" id="sidebar-user-btn">
          <span class="avatar" id="sidebar-avatar">??</span>
          <div class="who">
            <div class="name" id="sidebar-user-name">Loading…</div>
            <div class="role" id="sidebar-user-role">Owner</div>
          </div>
          ${Icons.svg("logout")}
        </div>
      </div>
    </aside>
    <div class="overlay-scrim" id="overlay-scrim"></div>
  `;
}

function topbarHtml(pageTitle) {
  return `
    <header class="topbar">
      <div class="topbar-left">
        <button class="icon-btn mobile-sidebar-toggle" id="mobile-sidebar-toggle" aria-label="Open menu">${Icons.svg("menu")}</button>
        <h1 class="topbar-title">${pageTitle}</h1>
      </div>
      <div class="topbar-right">
        <button class="icon-btn" id="topbar-notif-btn" aria-label="Alerts" style="position:relative;">
          ${Icons.svg("bell")}
          <span id="topbar-alert-dot" style="display:none;position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--color-danger-500);border:1.5px solid #fff;"></span>
        </button>
        <button class="icon-btn" id="topbar-logout-btn" aria-label="Log out">${Icons.svg("logout")}</button>
      </div>
    </header>
  `;
}

/**
 * @param {Object} opts { activePage: 'dashboard.html', pageTitle: 'Dashboard' }
 * @returns {Promise<{user, profile}>}
 */
export async function initLayout({ activePage, pageTitle }) {
  const sidebarMount = document.getElementById("sidebar-mount");
  const topbarMount = document.getElementById("topbar-mount");
  sidebarMount.innerHTML = sidebarHtml(activePage);
  topbarMount.innerHTML = topbarHtml(pageTitle);

  // Mobile menu toggle
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("overlay-scrim");
  const openSidebar = () => { sidebar.classList.add("open"); scrim.classList.add("show"); };
  const closeSidebar = () => { sidebar.classList.remove("open"); scrim.classList.remove("show"); };
  document.getElementById("mobile-sidebar-toggle")?.addEventListener("click", openSidebar);
  document.getElementById("sidebar-close-btn")?.addEventListener("click", closeSidebar);
  scrim.addEventListener("click", closeSidebar);

  // Logout
  const doLogout = () => logoutUser();
  document.getElementById("sidebar-user-btn").addEventListener("click", doLogout);
  document.getElementById("topbar-logout-btn").addEventListener("click", doLogout);

  const user = auth.currentUser;
  let profile = null;
  if (user) {
    profile = await getUserProfile(user.uid);
    applyBusinessBranding(profile, user);
    watchLowStock(user.uid);
  }
  return { user, profile };
}

function applyBusinessBranding(profile, user) {
  const name = profile?.name || user.displayName || user.email;
  const businessName = profile?.businessName || "Stockpile";
  businessSettings.name = businessName;
  businessSettings.currency = profile?.currency || "USD";
  businessSettings.currencySymbol = currencySymbolFor(businessSettings.currency);
  businessSettings.taxPercent = profile?.taxPercent || 0;
  businessSettings.logoUrl = profile?.logoUrl || "";

  document.getElementById("sidebar-brand-name").textContent = businessName;
  document.getElementById("sidebar-user-name").textContent = name;
  const avatarEl = document.getElementById("sidebar-avatar");
  avatarEl.textContent = initials(name);

  if (isDemoUser(user)) {
    document.getElementById("sidebar-user-role").textContent = isDemoAdmin(user) ? "Demo Admin" : "Demo User (Staff)";
  }

  const logoMark = document.getElementById("sidebar-logo-mark");
  if (profile?.logoUrl) {
    logoMark.innerHTML = `<img src="${profile.logoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`;
  } else {
    logoMark.textContent = businessName.charAt(0).toUpperCase();
  }
}

/** Live-updates the low-stock badge in the sidebar + topbar alert dot. */
function watchLowStock(uid) {
  const q = query(collection(db, "products"), where("ownerId", "==", uid));
  onSnapshot(q, (snap) => {
    let lowCount = 0;
    snap.forEach((d) => {
      const p = d.data();
      if ((p.quantity ?? 0) <= (p.reorderLevel ?? 5)) lowCount++;
    });
    const badge = document.getElementById("nav-low-stock-badge");
    const dot = document.getElementById("topbar-alert-dot");
    if (badge) {
      badge.style.display = lowCount > 0 ? "inline-block" : "none";
      badge.textContent = lowCount;
    }
    if (dot) dot.style.display = lowCount > 0 ? "block" : "none";
  }, (err) => console.error("Low stock watch error:", err));
}
