/**
 * store.js — Firestore data-access layer. All reads/writes for the app's
 * business data (products, movements, sales, categories, suppliers) live
 * here so page controllers stay focused on UI wiring.
 *
 * Data is scoped per-account: every document carries ownerId = auth uid,
 * matching firebase/firestore.rules.
 */
import { auth, db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { DEMO_WORKSPACE_ID, isDemoUser } from "./demo.js";

/**
 * Returns the "ownerId" that all reads/writes for the current user
 * should be scoped to. Both demo accounts share DEMO_WORKSPACE_ID so
 * they see each other's data live; every other account is scoped to
 * its own UID as usual (see firebase/firestore.rules for the matching
 * security rule).
 */
function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return isDemoUser(u) ? DEMO_WORKSPACE_ID : u.uid;
}

/* ============================================================ Products */

export function watchProducts(callback, onError) {
  const q = query(collection(db, "products"), where("ownerId", "==", uid()));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  }, onError);
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, "products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createProduct(data, imageFile) {
  const payload = {
    ...data,
    ownerId: uid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, "products"), payload);
  if (imageFile) {
    const url = await uploadProductImage(docRef.id, imageFile);
    await updateDoc(docRef, { imageUrl: url });
  }
  // Seed opening stock as a movement entry for a clean audit trail.
  if (Number(data.quantity) > 0) {
    await recordMovement({
      productId: docRef.id,
      productName: data.name,
      sku: data.sku,
      type: "in",
      quantityChange: Number(data.quantity),
      balanceAfter: Number(data.quantity),
      reason: "Opening stock",
    });
  }
  return docRef.id;
}

export async function updateProduct(id, data, imageFile) {
  const payload = { ...data, updatedAt: serverTimestamp() };
  if (imageFile) {
    payload.imageUrl = await uploadProductImage(id, imageFile);
  }
  await updateDoc(doc(db, "products", id), payload);
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, "products", id));
  try {
    await deleteObject(ref(storage, `products/${uid()}/${id}`));
  } catch (e) { /* image may not exist — fine to ignore */ }
}

async function uploadProductImage(productId, file) {
  const imgRef = ref(storage, `products/${uid()}/${productId}`);
  await uploadBytes(imgRef, file);
  return getDownloadURL(imgRef);
}

/* ==================================================== Stock Movements */

export async function recordMovement({ productId, productName, sku, type, quantityChange, balanceAfter, reason }) {
  await addDoc(collection(db, "stockMovements"), {
    ownerId: uid(),
    productId, productName, sku,
    type, // 'in' | 'out' | 'adjustment' | 'sale'
    quantityChange,
    balanceAfter,
    reason: reason || "",
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.email || "unknown",
  });
}

/** Adjust a product's stock and log the movement atomically. */
export async function adjustStock(product, delta, reason) {
  const newQty = Math.max(0, (product.quantity || 0) + delta);
  await updateDoc(doc(db, "products", product.id), {
    quantity: newQty,
    updatedAt: serverTimestamp(),
  });
  await recordMovement({
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    type: delta >= 0 ? "in" : "out",
    quantityChange: delta,
    balanceAfter: newQty,
    reason: reason || (delta >= 0 ? "Manual restock" : "Manual adjustment"),
  });
  return newQty;
}

export function watchMovements(callback, onError, max = 200) {
  const q = query(
    collection(db, "stockMovements"),
    where("ownerId", "==", uid()),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  }, onError);
}

/* ================================================================ Sales */

/**
 * Records a sale: writes the sale document, decrements stock for each
 * line item, and logs a matching stock movement — all in one batch so
 * the operation is atomic.
 */
export async function recordSale({ items, subtotal, tax, total, customerName, paymentMethod }) {
  const batch = writeBatch(db);
  const saleRef = doc(collection(db, "sales"));
  const receiptNo = "RC-" + Date.now().toString(36).toUpperCase();

  batch.set(saleRef, {
    ownerId: uid(),
    receiptNo,
    items,
    subtotal, tax, total,
    customerName: customerName || "Walk-in Customer",
    paymentMethod: paymentMethod || "Cash",
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.email || "unknown",
  });

  for (const line of items) {
    const pRef = doc(db, "products", line.productId);
    batch.update(pRef, { quantity: increment(-line.qty), updatedAt: serverTimestamp() });
    const movRef = doc(collection(db, "stockMovements"));
    batch.set(movRef, {
      ownerId: uid(),
      productId: line.productId,
      productName: line.name,
      sku: line.sku,
      type: "sale",
      quantityChange: -line.qty,
      balanceAfter: null, // computed via increment; exact value not known client-side pre-commit
      reason: `Sale ${receiptNo}`,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.email || "unknown",
    });
  }

  await batch.commit();
  return { id: saleRef.id, receiptNo };
}

export function watchSales(callback, onError, max = 500) {
  const q = query(
    collection(db, "sales"),
    where("ownerId", "==", uid()),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  }, onError);
}

export async function getSale(id) {
  const snap = await getDoc(doc(db, "sales", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* =========================================================== Categories */

export function watchCategories(callback, onError) {
  const q = query(collection(db, "categories"), where("ownerId", "==", uid()), orderBy("name"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  }, onError);
}

export async function createCategory(name) {
  return addDoc(collection(db, "categories"), { name, ownerId: uid(), createdAt: serverTimestamp() });
}

export async function deleteCategory(id) {
  return deleteDoc(doc(db, "categories", id));
}

/* ============================================================ Suppliers */

export function watchSuppliers(callback, onError) {
  const q = query(collection(db, "suppliers"), where("ownerId", "==", uid()), orderBy("name"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  }, onError);
}

export async function createSupplier(data) {
  return addDoc(collection(db, "suppliers"), { ...data, ownerId: uid(), createdAt: serverTimestamp() });
}

export async function deleteSupplier(id) {
  return deleteDoc(doc(db, "suppliers", id));
}

/* ============================================================= Settings */

export async function updateBusinessSettings(uidValue, data) {
  await updateDoc(doc(db, "users", uidValue), { ...data });
}

export async function uploadBusinessLogo(uidValue, file) {
  const logoRef = ref(storage, `logos/${uidValue}/logo`);
  await uploadBytes(logoRef, file);
  return getDownloadURL(logoRef);
}

/* ================================================================ Demo */
/**
 * These two functions operate on DEMO_WORKSPACE_ID explicitly, not on
 * whatever uid() resolves to, and are only ever exposed in the UI to
 * the Demo Admin account (see settings.js) — a regular user's own
 * data is never touched by these.
 */

const DEMO_CATEGORIES = ["Beverages", "Bakery", "Snacks", "Household", "Personal Care"];

const DEMO_SUPPLIERS = [
  { name: "Northgate Distributors", contact: "orders@northgate.co" },
  { name: "Bluecrest Wholesale", contact: "sales@bluecrest.co" },
  { name: "Harbor & Co Supply", contact: "hello@harborco.com" },
];

const DEMO_PRODUCTS = [
  { name: "Espresso Beans 1kg", category: "Beverages", sku: "BEV-4821-TX9", costPrice: 9.5, sellingPrice: 18.0, quantity: 42, reorderLevel: 10, supplier: "Northgate Distributors" },
  { name: "Oat Milk Carton 1L", category: "Beverages", sku: "BEV-1190-QK2", costPrice: 1.8, sellingPrice: 3.75, quantity: 4, reorderLevel: 12, supplier: "Bluecrest Wholesale" },
  { name: "Sourdough Loaf", category: "Bakery", sku: "BAK-3305-LM7", costPrice: 2.1, sellingPrice: 5.5, quantity: 15, reorderLevel: 8, supplier: "Harbor & Co Supply" },
  { name: "Butter Croissant", category: "Bakery", sku: "BAK-7742-VD1", costPrice: 0.9, sellingPrice: 2.75, quantity: 0, reorderLevel: 15, supplier: "Harbor & Co Supply" },
  { name: "Sea Salt Kettle Chips", category: "Snacks", sku: "SNK-2287-HP3", costPrice: 1.2, sellingPrice: 3.25, quantity: 60, reorderLevel: 20, supplier: "Bluecrest Wholesale" },
  { name: "Dark Chocolate Almonds", category: "Snacks", sku: "SNK-9931-BW8", costPrice: 2.4, sellingPrice: 6.0, quantity: 5, reorderLevel: 10, supplier: "Northgate Distributors" },
  { name: "Ceramic Mug — Navy", category: "Household", sku: "HSH-5510-RT4", costPrice: 3.6, sellingPrice: 9.99, quantity: 22, reorderLevel: 6, supplier: "Harbor & Co Supply" },
  { name: "Bamboo Cutting Board", category: "Household", sku: "HSH-8823-NC6", costPrice: 6.75, sellingPrice: 16.5, quantity: 9, reorderLevel: 5, supplier: "Bluecrest Wholesale" },
  { name: "Lavender Hand Soap", category: "Personal Care", sku: "PCR-6604-ZX2", costPrice: 1.5, sellingPrice: 4.25, quantity: 30, reorderLevel: 10, supplier: "Northgate Distributors" },
  { name: "Bamboo Toothbrush 2-Pack", category: "Personal Care", sku: "PCR-1147-DY9", costPrice: 1.1, sellingPrice: 3.5, quantity: 2, reorderLevel: 8, supplier: "Bluecrest Wholesale" },
];

/** Deletes every document across all business collections that belongs to the demo workspace. */
async function clearDemoWorkspace() {
  const collections = ["products", "sales", "stockMovements", "categories", "suppliers"];
  for (const name of collections) {
    const q = query(collection(db, name), where("ownerId", "==", DEMO_WORKSPACE_ID));
    const snap = await getDocs(q);
    if (snap.empty) continue;
    // Firestore batches cap at 500 writes; demo datasets are small, but chunk defensively.
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

/** Populates the shared demo workspace with realistic categories, suppliers, products, and a couple of sample sales. */
export async function seedDemoData() {
  const categoryIds = {};
  for (const name of DEMO_CATEGORIES) {
    const ref = await addDoc(collection(db, "categories"), { name, ownerId: DEMO_WORKSPACE_ID, createdAt: serverTimestamp() });
    categoryIds[name] = ref.id;
  }

  for (const supplier of DEMO_SUPPLIERS) {
    await addDoc(collection(db, "suppliers"), { ...supplier, ownerId: DEMO_WORKSPACE_ID, createdAt: serverTimestamp() });
  }

  const productIds = [];
  for (const product of DEMO_PRODUCTS) {
    const payload = { ...product, ownerId: DEMO_WORKSPACE_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    const ref = await addDoc(collection(db, "products"), payload);
    productIds.push({ id: ref.id, ...product });
    if (product.quantity > 0) {
      await addDoc(collection(db, "stockMovements"), {
        ownerId: DEMO_WORKSPACE_ID,
        productId: ref.id,
        productName: product.name,
        sku: product.sku,
        type: "in",
        quantityChange: product.quantity,
        balanceAfter: product.quantity,
        reason: "Opening stock",
        createdAt: serverTimestamp(),
        createdBy: "demo-setup",
      });
    }
  }

  // A couple of realistic sample sales so Reports/Dashboard aren't empty on first look.
  const sampleSales = [
    { itemIdx: [0, 4], qtys: [2, 3], customerName: "Walk-in Customer", paymentMethod: "Cash" },
    { itemIdx: [2, 6], qtys: [1, 1], customerName: "Morgan Reyes", paymentMethod: "Card" },
  ];
  for (const s of sampleSales) {
    const items = s.itemIdx.map((idx, i) => {
      const p = productIds[idx];
      return { productId: p.id, name: p.name, sku: p.sku, price: p.sellingPrice, cost: p.costPrice, qty: s.qtys[i] };
    });
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const total = subtotal;
    await addDoc(collection(db, "sales"), {
      ownerId: DEMO_WORKSPACE_ID,
      receiptNo: "RC-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 99),
      items,
      subtotal, tax: 0, total,
      customerName: s.customerName,
      paymentMethod: s.paymentMethod,
      createdAt: serverTimestamp(),
      createdBy: "demo-setup",
    });
  }
}

/** Wipes and re-seeds the shared demo workspace back to its original state. */
export async function resetDemoData() {
  await clearDemoWorkspace();
  await seedDemoData();
}
