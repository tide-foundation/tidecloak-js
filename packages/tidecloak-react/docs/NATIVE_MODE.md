# Native Mode

Build desktop and mobile apps with TideCloak. Works with Electron, Tauri, and React Native.

---

## What You'll Build

Your users click "Login" in your app, their browser opens, they log in, and they're back in your app - authenticated and ready to go. Tokens are stored securely on their device.

---

## Quick Start

### 1. Get Your Config File

Download `adapter.json` from your TideCloak admin console and put it in your `public/` folder.

```
public/
  adapter.json
```

### 2. Create Your Adapter

The adapter handles the platform-specific stuff - opening login windows, storing tokens, etc. Here's one for Electron:

```ts
// electronAdapter.ts
import type { NativeAdapter } from '@tidecloak/react';

export function createElectronAdapter(): NativeAdapter {
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

### 3. Wire It Up

```tsx
// App.tsx
import { TideCloakContextProvider } from '@tidecloak/react';
import { createElectronAdapter } from './electronAdapter';

function App() {
  return (
    <TideCloakContextProvider
      authMode="native"
      adapter={createElectronAdapter()}
    >
      <YourApp />
    </TideCloakContextProvider>
  );
}
```

The SDK will:
- Fetch your config from `/adapter.json` automatically
- Handle login, logout, token refresh
- Manage encryption if configured

### 4. Use It

```tsx
import { useTideCloak } from '@tidecloak/react';

function LoginButton() {
  const { authenticated, login, logout } = useTideCloak();

  if (authenticated) {
    return <button onClick={logout}>Log Out</button>;
  }
  return <button onClick={login}>Log In</button>;
}
```

---

## Options

### Custom Config Location

Config isn't at `/adapter.json`? No problem:

```tsx
<TideCloakContextProvider
  authMode="native"
  adapter={createElectronAdapter()}
  configUrl="/config/tidecloak.json"
>
```

### Provide Config Directly

Don't want to fetch? Pass it in:

```tsx
import adapterConfig from './adapter.json';

<TideCloakContextProvider
  authMode="native"
  adapter={createElectronAdapter()}
  config={adapterConfig}
>
```

### Handle Events

Know when things happen:

```tsx
<TideCloakContextProvider
  authMode="native"
  adapter={createElectronAdapter()}
  onAuthSuccess={() => console.log('Logged in!')}
  onAuthError={(err) => console.error('Login failed:', err)}
  onLogout={() => console.log('Logged out')}
>
```

### Session Mode

Control how the SDK handles tokens on startup:

```tsx
<TideCloakContextProvider
  authMode="native"
  adapter={createElectronAdapter()}
  config={{ sessionMode: 'offline' }}
>
```

| Mode | Behavior | Best For |
|------|----------|----------|
| `'online'` | Validates tokens with server, refreshes if needed, requires login if invalid | Always-connected apps |
| `'offline'` | Accepts stored tokens without server validation, even if expired | Offline-first apps |

**Offline mode** is great for apps that need to work without internet. Users can access the app with expired tokens, and you only prompt for re-login when an API call fails with 401.

---

## Everything You Can Do

```tsx
const {
  // State
  authenticated,        // Is the user logged in?
  isInitializing,       // Still starting up?
  isLoading,            // Login/logout in progress?
  token,                // The access token
  tokenExp,             // When does it expire?

  // Actions
  login,                // Start login flow
  logout,               // Log out
  refreshToken,         // Refresh the token

  // User info
  getValueFromToken,    // Get claim from access token
  getValueFromIdToken,  // Get claim from ID token
  hasRealmRole,         // Check a realm role
  hasClientRole,        // Check a client role

  // Encryption (if configured)
  doEncrypt,            // Encrypt data
  doDecrypt,            // Decrypt data
} = useTideCloak();
```

---

## Show/Hide Based on Auth State

```tsx
import { Authenticated, Unauthenticated } from '@tidecloak/react';

function Dashboard() {
  return (
    <>
      <Authenticated>
        <h1>Welcome back!</h1>
        <DashboardContent />
      </Authenticated>

      <Unauthenticated>
        <h1>Please log in</h1>
        <LoginPrompt />
      </Unauthenticated>
    </>
  );
}
```

---

## Encryption

If your TideCloak is set up for encryption, you can protect sensitive data:

```tsx
const { doEncrypt, doDecrypt } = useTideCloak();

// Encrypt
const [encrypted] = await doEncrypt([
  { data: 'sensitive info', tags: ['personal'] }
]);

// Decrypt
const [decrypted] = await doDecrypt([
  { encrypted, tags: ['personal'] }
]);
```

Users need the right roles to encrypt/decrypt with specific tags.

---

## Common Patterns

### Get User Info

```tsx
function Profile() {
  const { getValueFromIdToken } = useTideCloak();

  return (
    <div>
      <p>Name: {getValueFromIdToken('name')}</p>
      <p>Email: {getValueFromIdToken('email')}</p>
    </div>
  );
}
```

### Check Roles

```tsx
function AdminPanel() {
  const { hasRealmRole } = useTideCloak();

  if (!hasRealmRole('admin')) {
    return <p>Admin access required</p>;
  }

  return <AdminControls />;
}
```

### Add Token to API Calls

```tsx
function useApi() {
  const { getToken } = useTideCloak();

  const fetchWithAuth = async (url, options = {}) => {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  };

  return { fetchWithAuth };
}
```

---

## Platform Setup

### Electron

You'll need to set up your main process to:

1. **Create a popup window for login** (required for encryption):
```js
// main.ts
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

See the [Electron example](https://github.com/tide-foundation/tidecloak-electron-example) for a complete setup.

### Tauri

Similar to Electron - register a protocol and handle callbacks.

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
