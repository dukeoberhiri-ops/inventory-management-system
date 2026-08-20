/**
 * auth.js — Firebase Authentication wiring.
 * Handles: login, signup, forgot-password, logout, protected routes.
 */
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { friendlyFirebaseError } from "./utils.js";

const PUBLIC_PAGES = ["login.html", "signup.html", "forgot-password.html"];

function currentPage() {
  return window.location.pathname.split("/").pop() || "index.html";
}

/**
 * Call once per page. Redirects unauthenticated users away from protected
 * pages, and authenticated users away from auth pages. Resolves with the
 * signed-in user (or null on a public page).
 */
export function guardRoute() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      const page = currentPage();
      const isPublic = PUBLIC_PAGES.includes(page);

      if (!user && !isPublic) {
        window.location.href = "login.html";
        return;
      }
      if (user && isPublic) {
        window.location.href = "dashboard.html";
        return;
      }
      resolve(user);
    });
  });
}

export async function registerUser({ name, businessName, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name,
    email,
    businessName: businessName || "My Store",
    currency: "USD",
    currencySymbol: "$",
    taxPercent: 0,
    logoUrl: "",
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function loginUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  await signOut(auth);
  window.location.href = "login.html";
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export { friendlyFirebaseError };
