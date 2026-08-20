/**
 * demo.js — configuration and helpers for the two permanent demo
 * accounts (Demo Admin / Demo User).
 *
 * HOW THE DEMO WORKS
 * -------------------------------------------------------------------
 * Every normal Stockpile account is its own isolated business: all of
 * its products, sales, etc. carry ownerId = that account's Firebase
 * Auth UID, and the security rules only let that UID read/write them.
 *
 * The two demo accounts are the one deliberate exception: instead of
 * each having their own separate (and separately-empty) inventory,
 * they both read and write the SAME shared "demo workspace" — so a
 * sale rung up by Demo User shows up immediately on Demo Admin's
 * dashboard, exactly like a real staff member and owner sharing one
 * store. `getEffectiveOwnerId()` in store.js is what redirects both
 * accounts' data onto that shared workspace ID instead of their own
 * UID; everyone else is unaffected.
 * -------------------------------------------------------------------
 */

export const DEMO_ADMIN_EMAIL = "admin@example.com";
export const DEMO_USER_EMAIL = "user@example.com";
export const DEMO_PASSWORD = "Demo123!";

// A fixed, shared "ownerId" that both demo accounts' data lives under.
// Doesn't need to be a real UID — just a stable, unique string.
export const DEMO_WORKSPACE_ID = "demo-workspace-stockpile";

export function isDemoEmail(email) {
  return email === DEMO_ADMIN_EMAIL || email === DEMO_USER_EMAIL;
}

/** True if the currently signed-in user is the Demo Admin account. */
export function isDemoAdmin(user) {
  return !!user && user.email === DEMO_ADMIN_EMAIL;
}

/** True if the currently signed-in user is either demo account. */
export function isDemoUser(user) {
  return !!user && isDemoEmail(user.email);
}

const WELCOME_FLAG_KEY = "stockpile_demo_welcome_pending";

/** Call right before redirecting after a demo login. */
export function markWelcomePending() {
  try { sessionStorage.setItem(WELCOME_FLAG_KEY, "1"); } catch (e) { /* ignore */ }
}

/** Call once on the first authenticated page load. Returns true at most once per browser session. */
export function consumeWelcomePending() {
  try {
    if (sessionStorage.getItem(WELCOME_FLAG_KEY) === "1") {
      sessionStorage.removeItem(WELCOME_FLAG_KEY);
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}
