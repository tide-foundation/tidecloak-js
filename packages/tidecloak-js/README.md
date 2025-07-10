# TideCloak JavaScript SDK (`@tidecloak/js`)

Lightweight browser SDK for integrating TideCloak SSO into any JavaScript application—vanilla, SPA, or framework-agnostic.

---

## 1. Prerequisites

Before you begin, ensure you have:

* A running TideCloak server (Keycloak-compatible)
* A registered client in your realm (with valid `auth-server-url`, `realm`, `resource` and other adapter settings)
* Browser environment (SDK uses `window` and `document.cookie`)

---

## 2. Install the SDK

```bash
npm install @tidecloak/js
# or
yarn add @tidecloak/js
```

This package exports two main items:

* **`IAMService`** (singleton) — high-level wrapper around the TideCloak client
* **`TideCloak`** — the underlying JS adapter (Keycloak-style API)

> **Note**: For detailed documentation of the underlying adapter implementation, see [`docs`](./lib/README.md).

---

## 3. Adapter Configuration

Download your adapter JSON directly from the Keycloak (TideCloak) admin console:

1. Navigate to **Clients → `<your-client>` → Actions → Download adapter** (format: `keycloak-oidc-keycloak-json`).
2. Save the downloaded file in your project root as `tidecloak.json`.

In your code, simply import it:

> **Note**: Event handlers must be registered before initialization.

```js
import { IAMService } from "@tidecloak/js";
import config from "./tidecloak.json";

// Register lifecycle event listeners
IAMService
  .on("ready", authenticated => showPage(authenticated))
  .on("authError", err => statusEl.textContent = `❌ Auth error: ${err.message}`)
  .on("logout", () => showPage(false));

// Initialize IAM (silent SSO check)
(async () => {
  try {
    await IAMService.initIAM(config);
  } catch (err) {
    console.error("Failed to initialize IAM:", err);
  }
})();
```

## 4. Simple Usage Example

Register event listeners *before* initializing IAM to update UI in a vanilla JavaScript app.

```html
<!-- index.html -->
<button id="login-btn" style="display:none">Log In</button>
<button id="logout-btn" style="display:none">Log Out</button>
<div id="status"></div>
```

```js
import { IAMService } from "@tidecloak/js";
import config from "./tidecloak.json";

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const statusEl = document.getElementById("status");

// Attach click handlers
loginBtn.onclick = () => IAMService.doLogin();
logoutBtn.onclick = () => IAMService.doLogout();

// Update UI based on authentication
function updateUI(authenticated) {
  if (authenticated) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    statusEl.textContent = "✅ Authenticated";
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    statusEl.textContent = "🔒 Not authenticated";
  }
}

// Register listeners
IAMService
  .on("ready", updateUI)
  .on("authError", err => statusEl.textContent = `❌ Auth error: ${err.message}`)
  .on("logout", () => updateUI(false));

// Initialize IAM
(async () => {
  try {
    const authenticated = await IAMService.initIAM(config);
    updateUI(authenticated);
  } catch (err) {
    console.error("Failed to initialize IAM:", err);
  }
})();
```

## 5. Advanced Usage Example: Securing a Note-Taking App

```html
<!-- index.html -->
<div id="login-page">
  <button id="login-btn">Log In</button>
</div>
<div id="notes-page" style="display:none">
  <h1>Your Notes</h1>
  <ul id="notes-list"></ul>
  <button id="logout-btn">Log Out</button>
</div>
<div id="status"></div>
```

```js
import { IAMService } from "@tidecloak/js";
import config from "./tidecloak.json";

const loginPage = document.getElementById("login-page");
const notesPage = document.getElementById("notes-page");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const notesList = document.getElementById("notes-list");
const statusEl = document.getElementById("status");

loginBtn.onclick = () => IAMService.doLogin();
logoutBtn.onclick = () => IAMService.doLogout();

function showApp(authenticated) {
  if (authenticated) {
    loginPage.style.display = "none";
    notesPage.style.display = "block";
    statusEl.textContent = "✅ Authenticated";
    loadNotes();
  } else {
    loginPage.style.display = "block";
    notesPage.style.display = "none";
    statusEl.textContent = "🔒 Not authenticated";
  }
}

async function loadNotes() {
  try {
    const token = await IAMService.getToken();
    const res = await fetch("/api/notes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const notes = await res.json();
    notesList.innerHTML = notes.map(n => `<li>${n}</li>`).join("");
  } catch (err) {
    console.error("Failed to load notes:", err);
  }
}

IAMService
  .on("ready", showApp)
  .on("authError", err => statusEl.textContent = `❌ Auth error: ${err.message}`)
  .on("logout", () => showApp(false));

(async () => {
  try {
    const authenticated = await IAMService.initIAM(config);
    showApp(authenticated);
  } catch (err) {
    console.error("Failed to initialize IAM:", err);
  }
})();
```

## 6. Events & Lifecycle
Event handlers must be set before initialization.

Register handlers via `.on(event, handler)` or remove with `.off(event, handler)`.

| Event                | Emitted When…                                               |          |
| -------------------- | ----------------------------------------------------------- | -------- |
| `ready`              | Initial silent-SSO check completes (handler receives \`true | false\`) |
| `initError`          | Config load or init failure                                 |          |
| `authSuccess`        | Interactive login succeeded                                 |          |
| `authError`          | Interactive login failed                                    |          |
| `authRefreshSuccess` | Silent token refresh succeeded                              |          |
| `authRefreshError`   | Silent token refresh failed                                 |          |
| `logout`             | User logged out                                             |          |
| `tokenExpired`       | Token expired before refresh                                |          |

```js
IAMService
  .on("logout", () => console.log("User logged out"))
  .on("tokenExpired", () => alert("Session expired, please log in again"));
```

---

## 7. Core Methods

After initialization, you can call these methods anywhere:

```js
// Check login state
IAMService.isLoggedIn();             // boolean

// Retrieve tokens
await IAMService.getToken();         // string (access token)
IAMService.getIDToken();             // string (ID token)

// Inspect token metadata
IAMService.getTokenExp();            // seconds until expiry
IAMService.getName();                // preferred_username claim

// Role checks
IAMService.hasRealmRole("admin");    // boolean
IAMService.hasClientRole("editor");  // boolean

// Custom claims
IAMService.getValueFromToken("foo"); // any
IAMService.getValueFromIDToken("bar");// any

// Force a token update
await IAMService.updateIAMToken();    // boolean (whether refreshed)
await IAMService.forceUpdateToken();  // boolean

// Programmatic login / logout
IAMService.doLogin();                // redirects to SSO
IAMService.doLogout();               // clears cookie & redirects

// Data encryption / decryption (TideCloak service)
await IAMService.doEncrypt([{ data: { secret: 123 }, tags: ["tag1"] }]);
await IAMService.doDecrypt([{ encrypted: "...", tags: ["tag1"] }]);
```

---

## 8. Tips & Best Practices

* **Single Init**: Call `initIAM` only once on page load or app bootstrap.
* **Token Cookie**: `kcToken` is set automatically; ensure server-side middleware reads this cookie.
* **Error Handling**: Listen to `initError` and `authError` to gracefully recover.
* **Silent Refresh**: Built-in; you only need to call `updateIAMToken` if you want manual control.
* **Event Cleanup**: Use `.off(...)` in SPAs before component unmount.

---
