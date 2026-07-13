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

### Session Mode

Control how the SDK handles tokens on startup:

```js
await IAMService.initIAM({
  ...config,
  sessionMode: "offline",  // or "online"
});
```

| Mode | Behavior | Best For |
|------|----------|----------|
| `"online"` | Validates tokens with server, refreshes if needed, requires login if invalid | Always-connected apps |
| `"offline"` | Accepts stored tokens without server validation, even if expired | Offline-first apps, PWAs |

**Offline mode** lets users access your app even when their session has expired. You can then prompt for re-login only when an API call fails with 401.

### DPoP (opt-in)

DPoP (sender-constrained tokens, [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)) binds an access token to a per-session key, so a stolen token can't be replayed. It is **opt-in**: set `useDPoP` and the SDK turns it on; omit it and the SDK requests an ordinary (unbound) token.

> **DPoP is not a flag you can flip in isolation.** Asking for it appends `dpop_jkt` to the authorization request, and the realm then issues a token carrying `typ: "DPoP"` and `cnf.jkt`. Such a token is **invalid** if it is later presented as a plain `Authorization: Bearer …` — the resource server answers a bare `401`. So enable DPoP only if every call that carries the token attaches a `DPoP:` proof (use `IAMService.secureFetch`, which does this for you). This is why the SDK will not turn DPoP on for you.

```js
// Opt in, enforced — init fails if the realm doesn't advertise DPoP support:
await IAMService.initIAM({ ...config, useDPoP: { mode: "strict" } });

// Use DPoP only when the realm supports it, otherwise fall back to bearer:
await IAMService.initIAM({ ...config, useDPoP: { mode: "auto" } });

// Pick the proof signing algorithm (default "ES256"):
await IAMService.initIAM({ ...config, useDPoP: { mode: "strict", alg: "EdDSA" } });

// No DPoP — a plain, unbound access token (the default):
await IAMService.initIAM({ ...config });
```

| `useDPoP` value            | Behavior                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| *(omitted)* / `false`      | **Default.** No DPoP. No `dpop_jkt`, plain unbound access token.          |
| `{ mode: "auto" }`         | Use DPoP when the realm advertises it; otherwise fall back to bearer.    |
| `{ mode: "strict" }`       | Enforce DPoP; init fails if the realm lacks DPoP support.                |
| `{ mode: …, alg }`         | As above, with a specific proof algorithm (`ES256` default).            |

> Your **resource server** must validate DPoP proofs for the binding to be meaningful. See [`lib/README.md`](../lib/README.md#dpop-resource-server-setup) for serving `tide_dpop_auth.html`.

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
