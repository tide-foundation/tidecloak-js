# Native Mode (React)

For Electron, Tauri, and React Native apps. Login happens in the system browser.

---

## How It Works

1. User clicks "Login" in your app
2. App opens system browser with TideCloak login page
3. User logs in
4. Browser redirects to a custom URL (e.g., `myapp://auth/callback`)
5. Your app catches this and saves the tokens

---

## Setup

### 1. Create an Adapter

The adapter tells the SDK how to do platform-specific things:

```ts
// electronAdapter.ts
export const electronAdapter = {
  authServerUrl: "https://auth.example.com",
  realm: "myrealm",
  clientId: "my-app",

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

### 2. Create Auth Provider

```tsx
// AuthContext.tsx
import { useMemo, useCallback } from 'react';
import { TideCloakContextProvider, useTideCloak } from '@tidecloak/react';
import { electronAdapter } from './electronAdapter';

export function AuthProvider({ children }) {
  const config = useMemo(() => ({
    authMode: 'native' as const,
    adapter: electronAdapter,
    sessionMode: 'offline' as const  // or 'online'
  }), []);

  const handleAuthSuccess = useCallback(() => {
    console.log('Login successful');
  }, []);

  return (
    <TideCloakContextProvider
      config={config}
      onAuthSuccess={handleAuthSuccess}
    >
      {children}
    </TideCloakContextProvider>
  );
}

// Re-export for easy use
export { useTideCloak as useAuth } from '@tidecloak/react';
```

### 3. Use in Components

```tsx
import { useAuth } from './AuthContext';

function Header() {
  const { authenticated, login, logout, getValueFromIdToken } = useAuth();
  const userName = getValueFromIdToken('name') || 'User';

  return (
    <header>
      {authenticated ? (
        <>
          <span>Welcome, {userName}</span>
          <button onClick={logout}>Log Out</button>
        </>
      ) : (
        <button onClick={login}>Log In</button>
      )}
    </header>
  );
}
```

---

## Session Modes

| Mode | What it does | Use case |
|------|--------------|----------|
| `online` (default) | Checks tokens on startup, refreshes if needed | Apps that need fresh tokens |
| `offline` | Accepts any saved tokens, even expired | Offline-first apps |

### Online Mode

```tsx
const config = {
  authMode: 'native',
  adapter: electronAdapter,
  sessionMode: 'online'
};
```

Tokens are validated on startup. Expired tokens are refreshed automatically.

### Offline Mode

```tsx
const config = {
  authMode: 'native',
  adapter: electronAdapter,
  sessionMode: 'offline'
};
```

User is "logged in" if any tokens exist. Your server validates tokens on API calls.

---

## Event Callbacks

Handle auth events at the provider level:

```tsx
<TideCloakContextProvider
  config={config}
  onAuthSuccess={() => console.log('Login successful')}
  onAuthError={(error) => console.error('Login failed:', error)}
  onLogout={() => console.log('User logged out')}
  onReauthRequired={() => showLoginPrompt()}
>
  {children}
</TideCloakContextProvider>
```

---

## Handle Session Expiry

For offline-first apps, handle 401 errors from your API:

```tsx
// In your axios interceptor or fetch wrapper
if (response.status === 401) {
  triggerReauth();  // From useTideCloak()
}
```

The `onReauthRequired` callback will fire, letting you prompt the user to log in again.

---

## Full Example

```tsx
// App.tsx
import { AuthProvider } from './AuthContext';
import { Header } from './Header';
import { Dashboard } from './Dashboard';

export default function App() {
  return (
    <AuthProvider>
      <Header />
      <Dashboard />
    </AuthProvider>
  );
}
```

```tsx
// Dashboard.tsx
import { useAuth } from './AuthContext';
import { Authenticated, Unauthenticated } from '@tidecloak/react';

export function Dashboard() {
  return (
    <>
      <Authenticated>
        <h1>Your Dashboard</h1>
        <DashboardContent />
      </Authenticated>

      <Unauthenticated>
        <h1>Welcome</h1>
        <p>Please log in to see your dashboard.</p>
      </Unauthenticated>
    </>
  );
}
```
