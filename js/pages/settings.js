import { guardRoute } from "../auth.js";
import { initLayout } from "../layout.js";
import { Icons } from "../icons.js";
import { toast } from "../toast.js";
import { logoutUser } from "../auth.js";
import { updateBusinessSettings, uploadBusinessLogo, seedDemoData, resetDemoData } from "../store.js";
import { validate } from "../utils.js";
import { isDemoAdmin } from "../demo.js";
import { confirmDialog } from "../modal.js";

const { user, profile } = await (async () => {
  await guardRoute();
  return initLayout({ activePage: "settings.html", pageTitle: "Settings" });
})();
document.getElementById("app-shell").style.display = "flex";
document.getElementById("page-loader").style.display = "none";

document.getElementById("icon-upload").innerHTML = Icons.svg("upload");
document.getElementById("icon-save").innerHTML = Icons.svg("save");
document.getElementById("icon-logout").innerHTML = Icons.svg("logout");

document.getElementById("account-name").textContent = profile?.name || user.displayName || "—";
document.getElementById("account-email").textContent = user.email;

document.getElementById("business-name").value = profile?.businessName || "";
document.getElementById("currency").value = profile?.currency || "USD";
document.getElementById("tax-percent").value = profile?.taxPercent ?? 0;

const logoPreview = document.getElementById("logo-preview");
function renderLogoPreview(url) {
  logoPreview.innerHTML = url ? `<img src="${url}" alt="Business logo">` : Icons.svg("image");
}
renderLogoPreview(profile?.logoUrl);

let logoFile = null;
document.getElementById("logo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast.error("Image too large", "Please choose a file under 5MB."); return; }
  logoFile = file;
  const reader = new FileReader();
  reader.onload = () => renderLogoPreview(reader.result);
  reader.readAsDataURL(file);
});

document.getElementById("logout-settings-btn").addEventListener("click", () => logoutUser());

/* ---------------------------------------------------------------- Demo Tools */
if (isDemoAdmin(user)) {
  document.getElementById("demo-tools-card").style.display = "block";
  document.getElementById("icon-seed").innerHTML = Icons.svg("refresh");
  document.getElementById("icon-reset").innerHTML = Icons.svg("trash");

  document.getElementById("seed-demo-btn").addEventListener("click", async () => {
    const btn = document.getElementById("seed-demo-btn");
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = `<span class="spinner" style="border-color:rgba(255,255,255,0.4);border-top-color:var(--color-primary-600);"></span>`;
    try {
      await seedDemoData();
      toast.success("Demo data seeded", "Fresh products, categories, and sales are now in the demo workspace.");
    } catch (err) {
      toast.error("Couldn't seed demo data", err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  document.getElementById("reset-demo-btn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Reset demo data?",
      message: "This clears everything in the shared demo workspace — products, sales, and history for both Demo Admin and Demo User — and reseeds it fresh. This can't be undone.",
      confirmText: "Reset demo data",
    });
    if (!ok) return;
    const btn = document.getElementById("reset-demo-btn");
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = `<span class="spinner" style="border-color:rgba(255,255,255,0.4);border-top-color:#fff;"></span>`;
    try {
      await resetDemoData();
      toast.success("Demo data reset", "The demo workspace is back to its original state.");
    } catch (err) {
      toast.error("Couldn't reset demo data", err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const businessName = document.getElementById("business-name").value.trim();
  const currency = document.getElementById("currency").value;
  const taxPercent = Number(document.getElementById("tax-percent").value) || 0;

  if (!validate.required(businessName)) { toast.error("Business name required", "Please enter a business name."); return; }

  const btn = document.getElementById("save-settings-btn");
  btn.disabled = true;
  const originalText = document.getElementById("save-settings-text").innerHTML;
  document.getElementById("save-settings-text").innerHTML = `<span class="spinner" style="border-color:rgba(255,255,255,0.4);border-top-color:#fff;"></span>`;

  try {
    const currencySymbolMap = { USD: "$", EUR: "€", GBP: "£", NGN: "₦", KES: "KSh", ZAR: "R", INR: "₹", CAD: "CA$", AUD: "A$", JPY: "¥", GHS: "GH₵" };
    const updates = { businessName, currency, currencySymbol: currencySymbolMap[currency] || "$", taxPercent };
    if (logoFile) {
      updates.logoUrl = await uploadBusinessLogo(user.uid, logoFile);
    }
    await updateBusinessSettings(user.uid, updates);
    toast.success("Settings saved", "Your business profile has been updated.");
  } catch (err) {
    toast.error("Couldn't save settings", err.message);
  } finally {
    btn.disabled = false;
    document.getElementById("save-settings-text").innerHTML = originalText;
  }
});
