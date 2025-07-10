# TideCloak JavaScript SDK (`@tidecloak/js`)

Lightweight browser SDK for integrating TideCloak SSO into any JavaScript application—vanilla, SPA, or framework-agnostic.

---

## 1. Prerequisites

Before you begin, ensure you have:

* Bundler like [Vite](https://vite.dev/) or [Webpack](https://webpack.js.org/)
* A running TideCloak server (Keycloak-compatible)
* A registered client in your realm
* Browser environment (SDK uses `window` and `document.cookie`)

---

## 2. Getting Started

To start a new Vite-powered vanilla JavaScript project with the TideCloak SDK:

1. **Initialize** a Vite app:

   ```bash
   npm create vite@latest my-app -- --template vanilla
   cd my-app
   ```
2. **Install** dependencies:

   ```bash
   npm install
   ```
3. **Run** the development server:

   ```bash
   npm run dev
   ```

Your folder structure will look like:

```
my-app/
├─ index.html
├─ main.js
├─ package.json
└─ vite.config.js
```
---

## 3. Install the SDK

```bash
npm install @tidecloak/js
# or
yarn add @tidecloak/js
```

This package exports two main items:

* **`IAMService`** (singleton) — high-level wrapper around the TideCloak client
* **`TideCloak`** — the underlying JS adapter (Keycloak-style API)

> **Note**: For detailed documentation of the underlying adapter implementation, see [`packages/tidecloak-js/lib/README.md`](packages/tidecloak-js/lib/README.md).

---

## 4. Adapter Configuration

Download your adapter JSON directly from the Keycloak (TideCloak) admin console:

1. Navigate to **Clients → `<your-client>` → Actions → Download adapter** (format: `keycloak-oidc-keycloak-json`).
2. Save the downloaded file in your project root as `tidecloak.json`.

This JSON includes standard Keycloak fields (`auth-server-url`, `realm`, `resource`, etc.) along with any TideCloak extensions you configured (for example, `vendorId`, `homeOrkUrl`, per-origin secrets).

In your code, simply import it:

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

## 5. Simple Usage Example

Use `index.html` and `main.js` in your Vite project root.

```html
<!-- index.html -->
<button id="login-btn">Log In</button>
<button id="logout-btn" style="display:none">Log Out</button>
<div id="status">Initializing...</div>
```

```js
// main.js
import { IAMService } from "@tidecloak/js";
import config from "./tidecloak.json";

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const statusEl = document.getElementById("status");

// Click handlers
loginBtn.onclick = () => IAMService.doLogin();
logoutBtn.onclick = () => IAMService.doLogout();

// UI update helper
function updateUI(authenticated) {
  if (authenticated) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    statusEl.textContent = "✅ Authenticated";
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    statusEl.textContent = "🔒 Please log in";
  }
}

// Register listeners before init
IAMService
  .on("ready", authenticated => updateUI(authenticated))
  .on("authError", err => statusEl.textContent = `❌ Auth error: ${err.message}`)
  .on("logout", () => updateUI(false));

// Initialize IAM and update UI based on result
(async () => {
  try {
    const authenticated = await IAMService.initIAM(config);
    updateUI(authenticated);
  } catch (err) {
    console.error("Failed to initialize IAM:", err);
    statusEl.textContent = `❌ Initialization error`;
  }
})();
```

---
## 6. Encrypting & Decrypting Data

TideCloak lets you protect sensitive fields with **tag-based** encryption. You pass in an array of `{ data, tags }` objects and receive an array of encrypted strings (or vice versa for decryption).

### Syntax Overview

```ts
// Encrypt one or more payloads:
const encryptedArray = await doEncrypt([
  { data: /* any JSON-serializable value */, tags: ['tag1', 'tag2'] },
  // …
]);

// Decrypt one or more encrypted blobs:
const decryptedArray = await doDecrypt([
  { encrypted: /* string from encrypt() */, tags: ['tag1', 'tag2'] },
  // …
]);
```

> **Order guarantee**: the returned array matches the input order.

---

### Encryption Example

```javascript
import { IAMService } from "@tidecloak/js";

async function encryptExamples() {

  // Simple single-item encryption:
  const [encryptedDob] = await IAMService.doEncrypt([
    { data: '2005-03-04', tags: ['dob'] }
  ]);

  // Multi-field encryption:
  const encryptedFields = await IAMService.doEncrypt([
    { data: '10 Smith Street', tags: ['street'] },
    { data: 'Southport', tags: ['suburb'] },
    { data: { full: '20 James Street – Burleigh Heads' }, tags: ['street', 'suburb'] }
  ]);
}
```

> **Permissions**: Users need roles matching **every** tag on a payload. A payload tagged `['street','suburb']` requires both the `tide_street.selfencrypt` and `tide_suburb.selfencrypt` roles.

---

### Decryption Example

```javascript
import { IAMService } from "@tidecloak/js";

async function decryptExamples(encryptedFields: string[]) {
  // Single-item decryption:
  const [decryptedDob] = await IAMService.doDecrypt([
    { encrypted: encryptedFields[0], tags: ['dob'] }
  ]);

  // Multi-field decryption:
  const decryptedFields = await IAMService.doDecrypt([
    { encrypted: encryptedFields[0], tags: ['street'] },
    { encrypted: encryptedFields[1], tags: ['suburb'] },
    { encrypted: encryptedFields[2], tags: ['street','suburb'] }
  ]);
}
```

> **Permissions**: Like encryption, decryption requires the same tag-based roles (`tide_street.selfdecrypt`, `tide_suburb.selfdecrypt`, etc.).

---

## 7. Events & Lifecycle Events & Lifecycle

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

## 8. Core Methods

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

## 9. Tips & Best Practices

* **Single Init**: Call `initIAM` only once on page load or app bootstrap.
* **Token Cookie**: `kcToken` is set automatically; ensure server-side middleware reads this cookie.
* **Error Handling**: Listen to `initError` and `authError` to gracefully recover.
* **Silent Refresh**: Built-in; you only need to call `updateIAMToken` if you want manual control.
* **Event Cleanup**: Use `.off(...)` in SPAs before component unmount.
