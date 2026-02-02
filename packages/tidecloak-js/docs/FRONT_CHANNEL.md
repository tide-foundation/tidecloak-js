# Front-Channel Mode

The simplest way to add TideCloak to your web app. Everything happens in the browser.

---

## What You'll Build

Click login, your users go to TideCloak, they log in, they come back authenticated. That's it.

---

## Quick Start

### 1. Get Your Config File

Download `adapter.json` from your TideCloak admin console and put it in your app.

### 2. Add Silent SSO Check File

This file is required for silent session checks. It should be auto-copied when you install `@tidecloak/js`, but if it's missing, create `public/silent-check-sso.html`:

```html
<html><body><script>parent.postMessage(location.href, location.origin)</script></body></html>
```

### 3. Create a Redirect Page

Create `public/auth/redirect.html`:

```html
<!DOCTYPE html>
<html>
  <head><title>Redirecting...</title></head>
  <body>
    <p>Redirecting...</p>
    <script>window.location.href = "/";</script>
  </body>
</html>
```

### 4. Initialize the SDK

```js
import { IAMService } from "@tidecloak/js";
import config from "./adapter.json";

// Listen for events
IAMService
  .on("ready", (loggedIn) => {
    console.log("Ready! Logged in:", loggedIn);
    updateUI(loggedIn);
  })
  .on("authSuccess", () => {
    console.log("Login successful");
  })
  .on("logout", () => {
    console.log("Logged out");
  });

// Start the SDK
await IAMService.initIAM(config);
```

### 5. Add Login/Logout Buttons

```js
document.getElementById("login-btn").onclick = () => IAMService.doLogin();
document.getElementById("logout-btn").onclick = () => IAMService.doLogout();
```

---

## Everything You Can Do

```js
// Check auth state
IAMService.isLoggedIn();           // Is user logged in?

// Get tokens
await IAMService.getToken();       // Access token (for API calls)
IAMService.getIDToken();           // ID token

// Get user info
IAMService.getName();              // Username
IAMService.getValueFromToken("email");
IAMService.getValueFromIdToken("name");

// Check roles
IAMService.hasRealmRole("admin");
IAMService.hasClientRole("editor");

// Auth actions
IAMService.doLogin();
IAMService.doLogout();
await IAMService.updateIAMToken(); // Refresh token

// Encryption (if configured)
await IAMService.doEncrypt([{ data: "secret", tags: ["personal"] }]);
await IAMService.doDecrypt([{ encrypted: "...", tags: ["personal"] }]);
```

---

## Events

```js
IAMService
  .on("ready", (loggedIn) => {
    // SDK is ready - loggedIn is true/false
  })
  .on("authSuccess", () => {
    // User logged in
  })
  .on("authError", (err) => {
    // Login failed
  })
  .on("logout", () => {
    // User logged out
  })
  .on("tokenExpired", () => {
    // Token expired - SDK will try to refresh
  });
```

---

## Encryption

Protect sensitive data with tag-based encryption:

```js
// Encrypt one or more items
const encrypted = await IAMService.doEncrypt([
  { data: "10 Smith Street", tags: ["address"] },
  { data: "john@example.com", tags: ["email"] },
]);

// Decrypt
const decrypted = await IAMService.doDecrypt([
  { encrypted: encrypted[0], tags: ["address"] },
  { encrypted: encrypted[1], tags: ["email"] },
]);
```

**Important:**
- `data` must be a string or `Uint8Array` (not an object - use `JSON.stringify()` first)
- Users need `_tide_<tag>.selfencrypt` / `_tide_<tag>.selfdecrypt` roles
- Output order matches input order

### Encrypt Objects

```js
// Wrong - objects not allowed
await IAMService.doEncrypt([{ data: { name: "John" }, tags: ["user"] }]);

// Right - stringify first
await IAMService.doEncrypt([{ data: JSON.stringify({ name: "John" }), tags: ["user"] }]);
```

---

## Custom Redirect Path

By default, users go to `/auth/redirect` after login. To change this:

```js
await IAMService.initIAM({
  ...config,
  redirectUri: "https://myapp.com/callback"
});
```

---

## Troubleshooting

**Blank page after login**

Make sure you have a page at `/auth/redirect` and your redirect URI is registered in TideCloak.

**"silent-check-sso.html not found" or silent SSO fails**

Create `public/silent-check-sso.html` with this content:
```html
<html><body><script>parent.postMessage(location.href, location.origin)</script></body></html>
```

**Token not available**

Wait for the `ready` event before using tokens.

**Encryption fails**

Make sure your `adapter.json` includes `vendorId` and the `client-origin-auth-{origin}` for your app's origin.
