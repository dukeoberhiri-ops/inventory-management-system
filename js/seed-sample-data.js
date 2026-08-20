/**
 * seed-sample-data.js
 * -----------------------------------------------------------------------
 * Loads firebase/sample-data.json into Firestore for the currently
 * signed-in account. Run once from any authenticated page (e.g.
 * dashboard.html) to populate demo categories, suppliers, and products.
 *
 * HOW TO RUN:
 * 1. Log in to the app in your browser.
 * 2. Open the browser DevTools console on any page (e.g. dashboard.html).
 * 3. Paste:
 *      import("./js/seed-sample-data.js").then(m => m.seedSampleData());
 * 4. Wait for the "Sample data loaded" message, then refresh.
 * -----------------------------------------------------------------------
 */
import { createCategory, createSupplier, createProduct } from "./store.js";

export async function seedSampleData() {
  const res = await fetch("./firebase/sample-data.json");
  const data = await res.json();

  console.log("Seeding categories…");
  for (const name of data.categories) {
    await createCategory(name);
  }

  console.log("Seeding suppliers…");
  for (const supplier of data.suppliers) {
    await createSupplier(supplier);
  }

  console.log("Seeding products…");
  for (const product of data.products) {
    await createProduct(product, null);
  }

  console.log("✅ Sample data loaded. Refresh the app to see it.");
}
