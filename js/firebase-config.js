/**
 * firebase-config.js
 * -----------------------------------------------------------------------
 * Central Firebase initialization. Loaded as an ES module by every page.
 * -----------------------------------------------------------------------
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6AQG1JJK3v-ArODUzWA3iHRuxlS74DBw",
  authDomain: "inventory-a0eb9.firebaseapp.com",
  projectId: "inventory-a0eb9",
  storageBucket: "inventory-a0eb9.firebasestorage.app",
  messagingSenderId: "41827585784",
  appId: "1:41827585784:web:78c7ba83eb2e26e279750d",
  measurementId: "G-32L8HTLPLL"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Keep users logged in across browser sessions / refreshes.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});
