# Stockpile — Inventory Management System

A production-quality inventory and point-of-sale dashboard for retail
businesses, built with plain HTML, CSS, and vanilla JavaScript on top of
Firebase (Authentication, Firestore, Storage). No build step, no
framework, no bundler — open the HTML files and it runs.

---

## Features

- **Authentication** — email/password login, sign-up, forgot password,
  persistent sessions, and protected routes.
- **Dashboard** — total products, low/out-of-stock counts, total sales,
  revenue, a 14-day revenue chart, top-selling products, recent stock
  activity, and items that need attention.
- **Products** — add/edit/delete, image upload, categories, auto-generated
  SKUs, cost & selling price, supplier tracking, search, filter, sort,
  and pagination.
- **Stock & Movements** — manual stock in/out adjustments with a reason,
  low-stock and out-of-stock alerts, and a full, immutable movement
  history (audit trail).
- **Sales** — a point-of-sale style cart supporting multiple line items,
  automatic stock deduction on checkout, sales history, and a printable
  receipt.
- **Reports** — daily/weekly/monthly sales breakdowns, revenue charts,
  top-selling products, and an inventory valuation report (cost value,
  retail value, value by category, low-stock list).
- **Settings** — business name, logo, currency, and tax rate, all of
  which flow into pricing, receipts, and reports throughout the app.

---

## Tech stack

| Layer          | Choice                                   |
|----------------|-------------------------------------------|
| Markup/styles  | Plain HTML5 + CSS (custom design system) |
| Logic          | Vanilla JavaScript (ES modules)          |
| Auth           | Firebase Authentication                  |
| Database       | Cloud Firestore                          |
| File storage   | Firebase Storage                         |
| Charts         | Chart.js (via CDN)                       |
| Fonts          | Space Grotesk, Inter, JetBrains Mono     |

---

## Project structure

```
inventory-management-system/
├── index.html                 # Redirects to login or dashboard
├── login.html
├── signup.html
├── forgot-password.html
├── dashboard.html
├── products.html
├── inventory.html             # Stock adjustments + movement history
├── sales.html                 # POS cart + sales history + receipts
├── reports.html
├── settings.html
├── css/
│   ├── tokens.css             # Design tokens (colors, type, spacing)
│   ├── base.css                # Reset, base typography, loaders
│   ├── components.css          # Buttons, cards, tables, modals, toasts…
│   └── auth.css                 # Login/signup split-panel styling
├── js/
│   ├── firebase-config.js     # Firebase init — put your config here
│   ├── auth.js                 # Login/signup/reset/logout/route guard
│   ├── store.js                 # All Firestore reads/writes
│   ├── layout.js                # Injects sidebar + topbar shell
│   ├── charts.js                # Chart.js wrapper with app styling
│   ├── toast.js                 # Toast notifications
│   ├── modal.js                  # Modals + confirm dialogs
│   ├── icons.js                  # Inline SVG icon set
│   ├── utils.js                  # Formatting, validation, helpers
│   ├── seed-sample-data.js       # Optional demo-data loader
│   └── pages/
│       ├── dashboard.js
│       ├── products.js
│       ├── inventory.js
│       ├── sales.js
│       ├── reports.js
│       └── settings.js
├── firebase/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── storage.rules
│   ├── firebase.json
│   └── sample-data.json
└── README.md
```

---

## 1. Firebase setup

1. Go to the [Firebase console](https://console.firebase.google.com) and
   create a new project.
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → Create database (start in production mode —
   the rules below lock it down properly).
4. **Storage** → Get started (default bucket is fine).
5. **Project settings** → General → scroll to "Your apps" → add a **Web
   app** → copy the `firebaseConfig` object.
6. Paste that config into `js/firebase-config.js`:

   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```

### Deploy security rules

Using the [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
cd firebase
firebase use --add          # select your project
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Or paste the contents of `firestore.rules` and `storage.rules` directly
into the **Rules** tab of Firestore and Storage in the console, and
create the composite indexes listed in `firestore.indexes.json` under
Firestore → Indexes (Firestore will also prompt you with a direct link
to create any missing index the first time a query needs it).

---

## 2. Firestore data model

All business documents are scoped to the signed-in account via an
`ownerId` field (the Firebase Auth UID), so each account's inventory is
fully isolated.

| Collection        | Key fields                                                                 |
|--------------------|----------------------------------------------------------------------------|
| `users/{uid}`      | `name`, `email`, `businessName`, `currency`, `currencySymbol`, `taxPercent`, `logoUrl` |
| `products`         | `ownerId`, `name`, `sku`, `category`, `costPrice`, `sellingPrice`, `quantity`, `reorderLevel`, `supplier`, `imageUrl` |
| `stockMovements`   | `ownerId`, `productId`, `productName`, `sku`, `type` (`in`/`out`/`sale`/`adjustment`), `quantityChange`, `balanceAfter`, `reason`, `createdBy`, `createdAt` |
| `sales`            | `ownerId`, `receiptNo`, `items[]`, `subtotal`, `tax`, `total`, `customerName`, `paymentMethod`, `createdBy`, `createdAt` |
| `categories`       | `ownerId`, `name`                                                          |
| `suppliers`        | `ownerId`, `name`, `contact`                                               |

Product images live at `products/{ownerId}/{productId}` and business
logos at `logos/{ownerId}/logo` in Firebase Storage.

---

## 3. Run locally

Because the app uses native ES modules (`import`/`export`), open it
through a local web server rather than `file://`:

```bash
# from the project root, pick one:
npx serve .
# or
python3 -m http.server 8080
```

Then visit `http://localhost:8080/login.html` (or whatever port your
server prints) and sign up for an account.

---

## 4. Demo accounts (for showing this to clients)

The app ships with a built-in, always-available demo: two permanent accounts
that share one realistic, live "demo workspace" so a prospective client can
click a button and start exploring immediately — no signup, no credentials
to type.

| Role | Email | Password |
|---|---|---|
| Demo Admin | `admin@example.com` | `Demo123!` |
| Demo User (Staff) | `user@example.com` | `Demo123!` |

Both appear as one-tap buttons ("Login as Demo Admin" / "Login as Demo User")
on the login page. They share the same products, sales, and stock history —
a sale rung up by Demo User shows up immediately on Demo Admin's dashboard,
exactly like a real cashier and store owner using the same system. Only
Demo Admin sees the **Seed Demo Data** / **Reset Demo Data** buttons, tucked
into Settings, for refreshing the demo before a walkthrough.

### One-time setup (do this once per Firebase project)

The two accounts don't exist until you create them — this is a deliberate
one-time setup step, the same way `firebase-config.js` needs your project's
credentials filled in once.

1. Open the deployed app in a browser and open the developer console
   (desktop is easiest for this step).
2. Paste and run:
   ```js
   import("./js/setup-demo-accounts.js").then(m => m.setupDemoAccounts());
   ```
3. Watch the console — it creates both accounts and prints their two UIDs.
4. Open `firebase/firestore.rules`, and replace `REPLACE_WITH_DEMO_ADMIN_UID`
   and `REPLACE_WITH_DEMO_USER_UID` with the two real UIDs it printed.
5. Publish the updated rules (Firebase Console → Firestore → Rules → paste
   → Publish).
6. Log in to the app as Demo Admin, go to **Settings**, and click
   **Seed Demo Data** — this populates the shared workspace with realistic
   products, categories, suppliers, and a couple of sample sales.

After that, the demo is permanently ready for anyone to click into — no
further setup needed, ever again, unless you want to reset it (same
Settings page, **Reset Demo Data**, Demo Admin only).

### How the sharing works, technically

Every real account's data is isolated by `ownerId = that account's Firebase
UID`, same as before. The two demo accounts are the one exception: instead
of each getting their own separate (and separately empty) inventory, both
are silently redirected onto one shared `ownerId` value
(`demo-workspace-stockpile`) by `getEffectiveOwnerId()`-equivalent logic in
`js/store.js`, and the security rules in `firestore.rules` allow only those
two specific UIDs to read/write that shared workspace. Nothing about this
affects how real customer accounts behave.

## 5. Load sample data (optional, for a fresh non-demo account)

To explore the app with realistic data:

1. Sign up / log in.
2. Open the browser DevTools console on any page inside the app.
3. Run:
   ```js
   import("./js/seed-sample-data.js").then(m => m.seedSampleData());
   ```
4. Refresh the page once you see `✅ Sample data loaded.` in the console.

This creates 5 categories, 3 suppliers, and 10 products (including one
low-stock and one out-of-stock item) from `firebase/sample-data.json`.

---

## 6. Deploy to Netlify

This is a static site, so deployment is drag-and-drop simple:

**Option A — Netlify UI**
1. Go to [app.netlify.com](https://app.netlify.com) → "Add new site" →
   "Deploy manually".
2. Drag the entire project folder (with your `firebase-config.js`
   already filled in) onto the upload area.
3. Netlify gives you a live URL immediately.

**Option B — Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir .
```

**Option C — Git-based deploy**
1. Push this project to a GitHub/GitLab repo.
2. In Netlify: "Add new site" → "Import an existing project" → connect
   the repo.
3. Leave the build command empty and set the publish directory to `.`
   (this is a static site — no build step needed).

### After deploying

In the Firebase console, go to **Authentication → Settings →
Authorized domains** and add your Netlify domain (e.g.
`your-app.netlify.app`) so login works from the deployed site.

---

## Notes on scope & design choices

- **Single-account-per-business model.** Each Firebase Auth account
  represents one business/store; there's no multi-user team support in
  this build. Extending to team roles would mean adding a `members`
  subcollection and updating the security rules to check membership
  instead of `ownerId` equality.
- **Client-computed movement balances.** Sales deduct stock via an
  atomic Firestore batch write (`increment()`), which is safe under
  concurrent writes; the per-line "balance after" shown in the sale's
  movement log is left blank for sale-type entries since the exact
  post-decrement value isn't known client-side before the batch
  commits (adjustments and manual stock changes do show an exact
  balance, since those go through a read-then-write step).
- **No external icon font/UI kit** — icons are hand-authored inline SVG
  in `js/icons.js`, so the app has no extra runtime dependency beyond
  Firebase and Chart.js (both loaded from official CDNs).
