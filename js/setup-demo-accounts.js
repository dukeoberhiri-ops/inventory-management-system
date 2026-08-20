/**
 * setup-demo-accounts.js
 * -----------------------------------------------------------------------
 * ONE-TIME SETUP. Creates the two permanent demo accounts (Demo Admin,
 * Demo User) in Firebase Authentication + their profile documents in
 * Firestore, then seeds the shared demo workspace with realistic data.
 *
 * HOW TO RUN (do this once, from any page of the deployed app, e.g. login.html):
 * 1. Open the site in your browser.
 * 2. Open the browser console (or the address-bar trick used elsewhere
 *    in this project: paste as a URL after "javascript:" is not needed —
 *    just open dev tools console on desktop, or use remote debugging).
 * 3. Paste and run:
 *      import("./js/setup-demo-accounts.js").then(m => m.setupDemoAccounts());
 * 4. Watch the console — it prints the two UIDs at the end. Copy them.
 * 5. Open firebase/firestore.rules, replace REPLACE_WITH_DEMO_ADMIN_UID
 *    and REPLACE_WITH_DEMO_USER_UID with the two real UIDs, then publish
 *    the updated rules in Firebase Console (Firestore > Rules).
 * 6. Log in to the app as Demo Admin (admin@example.com / Demo123!),
 *    go to Settings, and click "Seed Demo Data". This is deliberately a
 *    separate manual step — the security rules can't allow writes to
 *    the shared workspace until they know the real demo UIDs from step
 *    5, so seeding has to happen after the rules are published, not
 *    during this script.
 * 7. Done — the "Login as Demo Admin / Demo User" buttons on the login
 *    page will now work for anyone, permanently.
 *
 * Safe to re-run: if the accounts already exist, it just signs into them
 * to confirm they work rather than erroring out.
 * -----------------------------------------------------------------------
 */
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { DEMO_ADMIN_EMAIL, DEMO_USER_EMAIL, DEMO_PASSWORD, DEMO_WORKSPACE_ID } from "./demo.js";

async function ensureDemoAccount(email, name, businessName) {
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, DEMO_PASSWORD);
    console.log(`Created ${email}`);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      cred = await signInWithEmailAndPassword(auth, email, DEMO_PASSWORD);
      console.log(`${email} already exists — signed in to confirm.`);
    } else {
      throw err;
    }
  }
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name,
    email,
    businessName,
    currency: "USD",
    currencySymbol: "$",
    taxPercent: 8,
    logoUrl: "",
    createdAt: serverTimestamp(),
  }, { merge: true });
  console.log(`${email} → UID: ${cred.user.uid}`);
  await signOut(auth);
  return cred.user.uid;
}

export async function setupDemoAccounts() {
  console.log("Setting up demo accounts...");
  const adminUid = await ensureDemoAccount(DEMO_ADMIN_EMAIL, "Alex Morgan", "Stockpile Demo Store");
  const userUid = await ensureDemoAccount(DEMO_USER_EMAIL, "Jamie Chen", "Stockpile Demo Store");

  console.log("=====================================================");
  console.log("Accounts created. Next steps:");
  console.log("1. Copy these two UIDs into firebase/firestore.rules,");
  console.log("   replacing REPLACE_WITH_DEMO_ADMIN_UID / REPLACE_WITH_DEMO_USER_UID:");
  console.log("   Demo Admin UID:", adminUid);
  console.log("   Demo User UID:", userUid);
  console.log("2. Publish the updated rules in Firebase Console.");
  console.log("3. Log in as Demo Admin, go to Settings, click 'Seed Demo Data'.");
  console.log("=====================================================");
  return { adminUid, userUid };
}
