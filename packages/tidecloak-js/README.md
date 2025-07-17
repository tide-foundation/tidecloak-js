# TideCloak JavaScript SDK (`@tidecloak/js`)

Lightweight browser SDK for integrating TideCloak SSO into any JavaScript application—vanilla, SPA, or framework-agnostic.

---

## 1. Prerequisites

Before you begin, ensure you have:

* A bundler like [Vite](https://vite.dev/) or [Webpack](https://webpack.js.org/)
* A [running](https://github.com/tide-foundation/tidecloak-gettingstarted) TideCloak server
* A registered client in your realm with default user contexts committed
* A valid Keycloak adapter JSON file (e.g., `tidecloak.json`)
* A browser environment (SDK uses `window`, `document.cookie`, etc.)

---

## 2. Project Setup

Start a new project with Vite + TideCloak:

```bash
npm create vite@latest my-app -- --template vanilla
cd my-app
npm install
npm run dev
```

Folder structure:

```
my-app/
├─ index.html
├─ main.js
├─ tidecloak.json
├─ public/
│  └─ auth/
│     └─ redirect.html
├─ package.json
└─ vite.config.js
```

---

## 3. Install `@tidecloak/js`

```bash
npm install @tidecloak/js
# or
yarn add @tidecloak/js
```

This package exports:

* `IAMService` — high-level wrapper and lifecycle manager
* `TideCloak` — lower-level Keycloak-style adapter instance

> **Note:** Installing this package automatically adds a `silent-check-sso.html` file to your `public` directory. This file is required for silent SSO checks; if it doesn’t exist, create it manually at `public/silent-check-sso.html` with the following content, otherwise the app will break:
>
> ```html
> <html>
>   <body>
>     <script>parent.postMessage(location.href, location.origin)</script>
>   </body>
> </html>
> ```

---

## 4. Initialize the SDK

In your main entry file, initialize IAM and register lifecycle listeners. You may also choose to handle lifecycle events such as session expiration here:

**File:** `main.js`

```js
import { IAMService } from "@tidecloak/js";
import config from "./tidecloak.json";

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const statusEl = document.getElementById("status");

loginBtn.onclick = () => IAMService.doLogin();
logoutBtn.onclick = () => IAMService.doLogout();

function updateUI(authenticated) {
  loginBtn.style.display = authenticated ? "none" : "inline-block";
  logoutBtn.style.display = authenticated ? "inline-block" : "none";
  statusEl.textContent = authenticated ? "✅ Authenticated" : "🔒 Please log in";
}

IAMService
  .on("ready", updateUI)
  .on("authError", err => statusEl.textContent = `❌ Auth error: ${err.message}`)
  .on("logout", () => {
    console.log("User logged out");
    updateUI(false);
  })
  .on("tokenExpired", () => {
    alert("Session expired, please log in again");
    updateUI(false);
  });

(async () => {
  try {
    await IAMService.initIAM(config); // You can add redirectUri here if customizing
  } catch (err) {
    console.error("Failed to initialize IAM:", err);
    statusEl.textContent = "❌ Initialization error";
  }
})();
```

**File:** `index.html`

```html
<button id="login-btn">Log In</button>
<button id="logout-btn" style="display:none">Log Out</button>
<div id="status">Initializing...</div>
```

---

## 5. Redirect URI Handling

TideCloak will redirect users after login/logout to a URI defined in your adapter config.

If not explicitly set, the default value is:

```js
`${window.location.origin}/auth/redirect`
```

> This means your app **must contain a static file or route** at `/auth/redirect`.
> In Vite, this typically means adding a file like `public/auth/redirect.html`.

You can override this behavior by passing a `redirectUri` to `initIAM()`:

```js
await IAMService.initIAM({
  ...config,
  redirectUri: "https://yourdomain.com/auth/callback"
});
```

> ⚠️ Regardless of the value used, the **actual route or file must exist** in your deployed project. If the redirect target doesn’t exist, users will land on a 404 page after login/logout.

**File:** `public/auth/redirect.html`

```html
<!-- This file ensures the /auth/redirect path exists -->
<!DOCTYPE html>
<html>
  <head><title>Redirecting...</title></head>
  <body>
    <p>Redirecting, please wait...</p>
    <script>
      // Optionally show loading UI or transition
      // Auth state will be handled once initIAM runs again in your main.js
      window.location.href = "/"; // or redirect elsewhere
    </script>
  </body>
</html>
```

**Description:** This file ensures that the default redirect URI resolves without a 404.

If you override the `redirectUri` in `initIAM`, make sure to **update the corresponding redirect path** and that it exists in `public/` or your router.

---

## 6. Encrypting & Decrypting Data

TideCloak lets you protect sensitive fields with **tag-based** encryption. You pass in an array of `{ data, tags }` objects and receive an array of encrypted strings (or vice versa for decryption).

### Syntax Overview

```ts
// Encrypt one or more payloads:
const encryptedArray = await doEncrypt([
  { data: /* any JSON-serializable value */, tags: ['tag1', 'tag2'] },
]);

// Decrypt one or more encrypted blobs:
const decryptedArray = await doDecrypt([
  { encrypted: /* string from encrypt() */, tags: ['tag1', 'tag2'] },
]);
```

> **Important:** The `data` property **must** be a string when encrypting. Passing a non-string (e.g., an object) will cause an error.
>
> **Valid example:**
>
> ```ts
> // Before testing below, ensure you've set up the necessary roles:
> const multi_encrypted_addresses = await doEncrypt([
>   {
>     data: "10 Smith Street",
>     tags: ["street"]
>   },
>   {
>     data: "Southport",
>     tags: ["suburb"]
>   },
>   {
>     data: "20 James Street - Burleigh Heads",
>     tags: ["street", "suburb"]
>   }
> ]);
> ```
>
> **Invalid (will fail):**
>
> ```ts
> // Prepare data for encryption
> const dataToEncrypt = {
>   title: noteData.title,
>   content: noteData.content
> };
>
> // Encrypt the note data using TideCloak (this will error)
> const encryptedArray = await doEncrypt([{ data: dataToEncrypt, tags: ['note'] }]);
> ```

* **Permissions:** Encryption requires `_tide_<tag>.selfencrypt`; decryption requires `_tide_<tag>.selfdecrypt`.
* **Order guarantee:** Output preserves input order.


---

### Encryption Example

```js
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
    { data: '20 James Street – Burleigh Heads', tags: ['street', 'suburb'] }
  ]);
}
```

> **Permissions**: Users need roles matching **every** tag on a payload. A payload tagged `['street','suburb']` requires both the `_tide_street.selfencrypt` and `_tide_suburb.selfencrypt` roles.

---

### Decryption Example

```js
import { IAMService } from "@tidecloak/js";

async function decryptExamples(encryptedFields) {
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

> **Permissions**: Like encryption, decryption requires the same tag-based roles (`_tide_street.selfdecrypt`, `_tide_suburb.selfdecrypt`, etc.).

---

## 7. Events & Lifecycle

Register handlers via `.on(event, handler)` or remove with `.off(event, handler)`:

```js
IAMService
  .on("logout", () => console.log("User logged out"))
  .on("tokenExpired", () => alert("Session expired, please log in again"));
```

| Event                | Emitted When…                                                           |
| -------------------- | ----------------------------------------------------------------------- |
| `ready`              | Initial silent-SSO check completes (handler receives `true` or `false`) |
| `initError`          | Config load or init failure                                             |
| `authSuccess`        | Interactive login succeeded                                             |
| `authError`          | Interactive login failed                                                |
| `authRefreshSuccess` | Silent token refresh succeeded                                          |
| `authRefreshError`   | Silent token refresh failed                                             |
| `logout`             | User logged out                                                         |
| `tokenExpired`       | Token expired before refresh                                            |

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
* **Redirect URI**: If using a custom `redirectUri`, ensure the route or file exists.

---
