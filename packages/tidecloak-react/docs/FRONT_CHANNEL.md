# Front-Channel Mode

The simplest way to add TideCloak to your React web app. Everything happens in the browser.

---

## What You'll Build

Click login, your users go to TideCloak, they log in, they come back authenticated. That's it.

---

## Quick Start

### 1. Install

```bash
npm install @tidecloak/react
```

### 2. Get Your Config File

Download `adapter.json` from your TideCloak admin console and put it in your `public/` folder:

```
public/
  adapter.json
  silent-check-sso.html
```

### 3. Add Silent SSO Check File

This file is required for silent session checks. It should be auto-copied when you install `@tidecloak/react`, but if it's missing, create `public/silent-check-sso.html`:

```html
<html><body><script>parent.postMessage(location.href, location.origin)</script></body></html>
```

### 4. Add the Provider

```tsx
// App.tsx
import { TideCloakContextProvider } from '@tidecloak/react';

function App() {
  return (
    <TideCloakContextProvider>
      <YourApp />
    </TideCloakContextProvider>
  );
}
```

That's it. The SDK fetches your config from `/adapter.json` automatically.

### 5. Add a Redirect Route

TideCloak sends users back to `/auth/redirect` after login. Handle it:

```tsx
// Using React Router
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <TideCloakContextProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth/redirect" element={<AuthRedirect />} />
      </Routes>
    </TideCloakContextProvider>
  );
}
```

```tsx
// AuthRedirect.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTideCloak } from '@tidecloak/react';

export function AuthRedirect() {
  const { authenticated, isInitializing } = useTideCloak();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isInitializing) {
      navigate(authenticated ? '/dashboard' : '/');
    }
  }, [authenticated, isInitializing]);

  return <p>Loading...</p>;
}
```

### 6. Use It

```tsx
import { useTideCloak } from '@tidecloak/react';

function Header() {
  const { authenticated, login, logout } = useTideCloak();

  return (
    <header>
      {authenticated ? (
        <button onClick={logout}>Log Out</button>
      ) : (
        <button onClick={login}>Log In</button>
      )}
    </header>
  );
}
```

---

## Options

### Custom Config Location

```tsx
<TideCloakContextProvider configUrl="/config/tidecloak.json">
```

### Provide Config Directly

```tsx
import adapterConfig from './adapter.json';

<TideCloakContextProvider config={adapterConfig}>
```

### Handle Events

```tsx
<TideCloakContextProvider
  onAuthSuccess={() => console.log('Logged in!')}
  onAuthError={(err) => console.error('Login failed:', err)}
  onLogout={() => console.log('Logged out')}
>
```

### Session Mode

Control how the SDK handles tokens on startup:

```tsx
<TideCloakContextProvider config={{ sessionMode: 'offline' }}>
```

| Mode | Behavior | Best For |
|------|----------|----------|
| `'online'` | Validates tokens with server, refreshes if needed, requires login if invalid | Always-connected apps |
| `'offline'` | Accepts stored tokens without server validation, even if expired | Offline-first apps, PWAs |

**Offline mode** lets users access your app even when their session has expired. You can then prompt for re-login only when an API call fails with 401.

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
  login,                // Start login
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

## Get User Info

```tsx
function Profile() {
  const { getValueFromToken, getValueFromIdToken } = useTideCloak();

  return (
    <div>
      <p>Email: {getValueFromToken('email')}</p>
      <p>Name: {getValueFromIdToken('name')}</p>
    </div>
  );
}
```

---

## Check Roles

```tsx
function AdminPanel() {
  const { hasRealmRole, hasClientRole } = useTideCloak();

  if (!hasRealmRole('admin')) {
    return <p>Admin access required</p>;
  }

  return <AdminControls />;
}
```

Or use components:

```tsx
import { HasRealmRole, HasClientRole } from '@tidecloak/react';

<HasRealmRole role="admin" fallback={<p>Access denied</p>}>
  <AdminPanel />
</HasRealmRole>
```

---

## Encryption

Protect sensitive data with tag-based encryption:

```tsx
const { doEncrypt, doDecrypt } = useTideCloak();

// Encrypt one or more items
const encrypted = await doEncrypt([
  { data: '10 Smith Street', tags: ['address'] },
  { data: 'john@example.com', tags: ['email'] },
]);

// Decrypt
const decrypted = await doDecrypt([
  { encrypted: encrypted[0], tags: ['address'] },
  { encrypted: encrypted[1], tags: ['email'] },
]);
```

**Important:**
- `data` must be a string or `Uint8Array` (not an object - use `JSON.stringify()` first)
- Users need `_tide_<tag>.selfencrypt` / `_tide_<tag>.selfdecrypt` roles
- Output order matches input order

### Encrypt Multiple Fields

```tsx
const encrypted = await doEncrypt([
  { data: '10 Smith Street', tags: ['street'] },
  { data: 'Southport', tags: ['suburb'] },
  { data: '20 James Street - Burleigh Heads', tags: ['street', 'suburb'] },
]);
```

### Encrypt Objects

```tsx
// Wrong - objects not allowed
await doEncrypt([{ data: { name: 'John' }, tags: ['user'] }]);

// Right - stringify first
await doEncrypt([{ data: JSON.stringify({ name: 'John' }), tags: ['user'] }]);
```

---

## Add Token to API Calls

```tsx
function useApi() {
  const { token } = useTideCloak();

  const fetchWithAuth = (url, options = {}) => {
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

## Troubleshooting

**Blank page after login**

Make sure you have a route for `/auth/redirect` and your redirect URI is registered in TideCloak.

**"adapter.json not found" error**

Make sure the file is in your `public/` folder and accessible at `/adapter.json`.

**"silent-check-sso.html not found" or silent SSO fails**

Create `public/silent-check-sso.html` with this content:
```html
<html><body><script>parent.postMessage(location.href, location.origin)</script></body></html>
```

**Token not available**

The `token` is null while `isInitializing` is true. Wait for initialization to complete before using it.
