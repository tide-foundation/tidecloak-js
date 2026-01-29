# Native Mode

For desktop and mobile apps (Electron, Tauri, React Native). Login happens in the system browser, and your app receives tokens via a callback.

---

## How It Works

1. User clicks "Login" in your app
2. App opens the system browser with TideCloak login page
3. User logs in
4. Browser redirects to a custom URL (e.g., `myapp://auth/callback`)
5. Your app catches this redirect and gets the tokens
6. Tokens are saved to secure storage

---

## When to Use This

- Electron apps
- Tauri apps
- React Native apps
- Any app that can't use browser redirects directly

---

## Setup

### 1. Create an Adapter

The adapter tells the SDK how to do platform-specific things:

```js
const myAdapter = {
  // TideCloak server info
  authServerUrl: "https://auth.example.com",
  realm: "myrealm",
  clientId: "my-native-app",

  // Where TideCloak redirects after login
  getRedirectUri: async () => {
    return "myapp://auth/callback";
  },

  // Open URL in system browser
  openExternalUrl: async (url) => {
    // Use your platform's method to open URLs
    // Electron: shell.openExternal(url)
    // React Native: Linking.openURL(url)
  },

  // Listen for auth callbacks
  onAuthCallback: (callback) => {
    // Set up listener for your custom URL scheme
    // When URL is received, call: callback({ code: "..." })
    // Return a cleanup function
    return () => { /* cleanup */ };
  },

  // Save tokens securely
  saveTokens: async (tokens) => {
    // Save to secure storage
    // tokens has: accessToken, refreshToken, idToken, expiresAt
    return true;
  },

  // Get saved tokens
  getTokens: async () => {
    // Return saved tokens, or null if none
    return { accessToken, refreshToken, idToken, expiresAt };
  },

  // Delete tokens (for logout)
  deleteTokens: async () => {
    // Clear secure storage
    return true;
  }
};
```

### 2. Initialize SDK

```js
import { IAMService } from "@tidecloak/js";

const config = {
  authMode: "native",
  adapter: myAdapter,
  sessionMode: "online"  // or "offline"
};

await IAMService.initIAM(config);
```

### 3. Login/Logout

```js
// Login - opens system browser
IAMService.doLogin();

// Logout - clears tokens
IAMService.doLogout();

// Check login state
if (IAMService.isLoggedIn()) {
  const username = IAMService.getValueFromToken("preferred_username");
  console.log("Logged in as:", username);
}
```

---

## Session Modes

| Mode | What it does | Use case |
|------|--------------|----------|
| `online` (default) | Checks if tokens are valid on startup. Refreshes if expired. Requires login if invalid. | Apps that need fresh tokens |
| `offline` | Accepts any saved tokens, even expired ones. | Offline-first apps |

### Online Mode (default)

```js
const config = {
  authMode: "native",
  adapter: myAdapter,
  sessionMode: "online"
};
```

On startup:
- Has valid tokens? User is logged in
- Has expired tokens? SDK tries to refresh them
- Can't refresh? User must log in again

### Offline Mode

```js
const config = {
  authMode: "native",
  adapter: myAdapter,
  sessionMode: "offline"
};
```

On startup:
- Has any tokens (even expired)? User is logged in
- No tokens? User is not logged in

Your server validates tokens when making API calls. If a call returns 401, prompt the user to log in again.

---

## Electron Example

```js
// electronAdapter.js
export const electronAdapter = {
  authServerUrl: process.env.TIDECLOAK_URL,
  realm: process.env.TIDECLOAK_REALM,
  clientId: process.env.TIDECLOAK_CLIENT_ID,

  getRedirectUri: async () => "myapp://auth/callback",

  openExternalUrl: async (url) => {
    await window.ipcRenderer.invoke("open-external-url", url);
  },

  onAuthCallback: (callback) => {
    const handler = (_event, data) => callback(data);
    window.ipcRenderer.on("auth-callback", handler);
    return () => window.ipcRenderer.off("auth-callback", handler);
  },

  saveTokens: async (tokens) => {
    const result = await window.ipcRenderer.invoke("save-tokens", tokens);
    return result.success;
  },

  getTokens: async () => {
    const result = await window.ipcRenderer.invoke("get-tokens");
    return result.success ? result.tokens : null;
  },

  deleteTokens: async () => {
    const result = await window.ipcRenderer.invoke("delete-tokens");
    return result.success;
  }
};
```

---

## Available Methods

All standard methods work in native mode:

```js
IAMService.isLoggedIn();
IAMService.getToken();
IAMService.getIDToken();
IAMService.getName();
IAMService.hasRealmRole("admin");
IAMService.hasClientRole("editor");
IAMService.getValueFromToken("email");
IAMService.getValueFromIDToken("name");
IAMService.doLogin();
IAMService.doLogout();
```

**Note:** `doEncrypt()` and `doDecrypt()` are not yet supported in native mode.

---

## Events

```js
IAMService
  .on("authSuccess", () => console.log("Login successful"))
  .on("authError", (err) => console.error("Login failed:", err))
  .on("logout", () => console.log("Logged out"));
```
