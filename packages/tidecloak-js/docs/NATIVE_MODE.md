# Native Mode

Build desktop and mobile apps with TideCloak. Works with Electron, Tauri, and React Native.

---

## What You'll Build

Your users click "Login" in your app, their browser opens, they log in, and they're back in your app - authenticated and ready to go. Tokens are stored securely on their device.

---

## Quick Start

### 1. Get Your Config File

Download `adapter.json` from your TideCloak admin console. This has all your TideCloak settings.

### 2. Create Your Adapter

The adapter handles platform-specific stuff - opening login windows, storing tokens. Here's one for Electron:

```js
// electronAdapter.js
export function createElectronAdapter() {
  return {
    // Where should TideCloak redirect after login?
    getRedirectUri: () => 'myapp://auth/callback',

    // Open login in a popup window (NOT external browser - see note below)
    openExternalUrl: async (url) => {
      await window.ipcRenderer.invoke('open-auth-popup', url);
    },

    // Listen for the auth callback
    onAuthCallback: (callback) => {
      const handler = (_event, data) => callback(data);
      window.ipcRenderer.on('auth-callback', handler);
      return () => window.ipcRenderer.off('auth-callback', handler);
    },

    // Store tokens securely
    saveTokens: async (tokens) => {
      await window.ipcRenderer.invoke('save-tokens', tokens);
      return true;
    },

    // Get stored tokens
    getTokens: async () => {
      return await window.ipcRenderer.invoke('get-tokens');
    },

    // Clear tokens on logout
    deleteTokens: async () => {
      await window.ipcRenderer.invoke('delete-tokens');
      return true;
    },
  };
}
```

That's it for the adapter. Just 6 functions, all platform-specific. The SDK handles everything else.

> **Popup Window vs External Browser**
>
> If you need **encryption/decryption**, you **must** use a popup window (Electron BrowserWindow) instead of the system's external browser. This keeps session cookies inside your Electron app, which is required for the encryption/decryption session key to work.
>
> | Approach | Session Cookies | Encryption/Decryption |
> |----------|-----------------|------------|
> | Popup window (BrowserWindow) | Stays in Electron | Works |
> | External browser (shell.openExternal) | Separate from Electron | Fails with "session key mismatch" |
>
> Without the session cookies, `doEncrypt()` and `doDecrypt()` will fail.
>
> Your main process should create a BrowserWindow for login, not call `shell.openExternal()`.

### 3. Initialize the SDK

```js
import { IAMService } from "@tidecloak/js";
import adapterConfig from "./adapter.json";
import { createElectronAdapter } from "./electronAdapter";

const config = {
  authMode: "native",
  adapter: createElectronAdapter(),
  ...adapterConfig,  // Spread your adapter.json config
};

// Listen for events
IAMService
  .on("authSuccess", () => console.log("Logged in!"))
  .on("authError", (err) => console.error("Login failed:", err))
  .on("logout", () => console.log("Logged out"));

// Start the SDK
await IAMService.initIAM(config);
```

### Session Mode

Control how the SDK handles tokens on startup:

```js
const config = {
  authMode: "native",
  adapter: createElectronAdapter(),
  sessionMode: "offline",  // or "online"
  ...adapterConfig,
};
```

| Mode | Behavior | Best For |
|------|----------|----------|
| `"online"` | Validates tokens with server, refreshes if needed, requires login if invalid | Always-connected apps |
| `"offline"` | Accepts stored tokens without server validation, even if expired | Offline-first apps |

**Offline mode** is great for apps that need to work without internet. Users can access the app with expired tokens, and you only prompt for re-login when an API call fails with 401.

### 4. Login and Logout

```js
// Login - opens system browser
IAMService.doLogin();

// Logout - clears tokens
IAMService.doLogout();

// Check login state
if (IAMService.isLoggedIn()) {
  console.log("User is logged in");
}
```

---

## Everything You Can Do

```js
// Check auth state
IAMService.isLoggedIn();          // Is user logged in?

// Get tokens
await IAMService.getToken();      // Access token
IAMService.getIDToken();          // ID token

// Get user info
IAMService.getName();             // Username
IAMService.getValueFromToken("email");
IAMService.getValueFromIdToken("name");

// Check roles
IAMService.hasRealmRole("admin");
IAMService.hasClientRole("editor");

// Auth actions
IAMService.doLogin();
IAMService.doLogout();
await IAMService.updateIAMToken();  // Refresh token

// Encryption (if configured)
await IAMService.doEncrypt([{ data: "secret", tags: ["personal"] }]);
await IAMService.doDecrypt([{ encrypted: "...", tags: ["personal"] }]);
```

---

## Events

Know when things happen:

```js
IAMService
  .on("authSuccess", () => {
    // User logged in successfully
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

If your TideCloak is set up for encryption, you can protect sensitive data:

```js
// Encrypt
const [encrypted] = await IAMService.doEncrypt([
  { data: "sensitive info", tags: ["personal"] }
]);

// Decrypt
const [decrypted] = await IAMService.doDecrypt([
  { encrypted, tags: ["personal"] }
]);
```

Users need the right roles (`_tide_<tag>.selfencrypt` / `_tide_<tag>.selfdecrypt`) to encrypt/decrypt with specific tags.

---

## Platform Setup

### Electron

You'll need to set up your main process to:

1. **Create a popup window for login** (required for encryption):
```js
// main.js
ipcMain.handle('open-auth-popup', async (event, url) => {
  const authWindow = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Listen for redirect
  authWindow.webContents.on('will-redirect', (event, redirectUrl) => {
    if (redirectUrl.startsWith('myapp://')) {
      const url = new URL(redirectUrl);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      // Send back to renderer
      mainWindow.webContents.send('auth-callback', { code, error });
      authWindow.close();
    }
  });

  authWindow.loadURL(url);
});
```

2. **Register a custom protocol** (e.g., `myapp://`)

3. **Store tokens securely** (use `safeStorage` or similar)

4. **Handle token storage IPC calls**

### Tauri

Similar to Electron - use a WebView window for login, register a protocol and handle callbacks.

### React Native

Use deep links for the callback URL and secure storage for tokens.

---

## Troubleshooting

**Login opens but nothing happens after**

Make sure your redirect URI is registered in TideCloak and your app is handling the callback.

**Tokens not persisting**

Check that your `saveTokens` and `getTokens` functions are working correctly.

**Encryption/decryption fails with "session key mismatch"**

You're probably using an external browser instead of a popup window. The session cookies from login must stay in your Electron app for encryption/decryption to work.

Fix: Use `new BrowserWindow()` to open the login page, not `shell.openExternal()`.

**Encryption/decryption fails with missing config**

Make sure your `adapter.json` includes:
- `vendorId` - Your Tide vendor ID
- `client-origin-auth-{origin}` - Auth signature for your app's origin (e.g., `client-origin-auth-http://localhost:5174`)
