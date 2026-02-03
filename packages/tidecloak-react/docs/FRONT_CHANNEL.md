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

### Action Notifications

Hook into any notification system (toast, snackbar, etc.) for action feedback:

```tsx
import { toast } from 'your-toast-library'; // or any notification library

<TideCloakContextProvider
  onActionNotification={({ type, title, message }) => {
    // type is 'success' | 'error' | 'warning' | 'info'
    toast[type](message || title);
  }}
>
```

**Notification Shape:**
```ts
interface ActionNotification {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  action?: string;
}
```

**Actions that send notifications:**
| Action | Events |
|--------|--------|
| `login` | Success, error |
| `logout` | Logged out |
| `token` | Session refresh success/error, expiring |
| `reauth` | Re-authentication required |
| `encrypt` | Success, error |
| `decrypt` | Success, error |
| `approval` | Approved, denied, error |
| `init` | Initialization error |

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
  initError,            // Error during initialization (if any)
  sessionExpired,       // Has the session expired?
  token,                // The access token
  idToken,              // The ID token
  tokenExp,             // When does it expire?

  // Network state
  isOffline,            // Is the browser offline?
  wasOffline,           // Was the browser offline at some point?
  resetWasOffline,      // Clear the wasOffline flag

  // Re-auth (for handling 401s)
  needsReauth,          // Does the user need to re-authenticate?
  triggerReauth,        // Set needsReauth to true
  clearReauth,          // Clear the needsReauth flag

  // Actions
  login,                // Start login
  logout,               // Log out
  getToken,             // Get token (async, refreshes if needed)
  refreshToken,         // Refresh the token
  forceRefreshToken,    // Force refresh even if not expired

  // Config
  baseURL,              // The TideCloak server URL
  getConfig,            // Get the full config object
  reload,               // Re-initialize the SDK

  // User info
  getValueFromToken,    // Get claim from access token
  getValueFromIdToken,  // Get claim from ID token
  hasRealmRole,         // Check a realm role
  hasClientRole,        // Check a client role

  // Encryption (if configured)
  doEncrypt,            // Encrypt data
  doDecrypt,            // Decrypt data

  // Advanced: Direct service access
  IAMService,           // Direct access to IAMService
  AdminAPI,             // Direct access to AdminAPI

  // Advanced: Tide request signing
  initializeTideRequest,  // Sign a request for policy creation
  getVendorId,            // Get vendor ID from config
  getResource,            // Get client ID from config
  approveTideRequests,    // Open Tide approval enclave
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
  const { getToken } = useTideCloak();

  const fetchWithAuth = async (url, options = {}) => {
    const token = await getToken(); // Refreshes if needed
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

## Handle Offline State

Track when users go offline and come back online:

```tsx
function OfflineNotice() {
  const { isOffline, wasOffline, resetWasOffline } = useTideCloak();

  if (isOffline) {
    return <div className="banner">You're offline</div>;
  }

  if (wasOffline) {
    return (
      <div className="banner">
        Back online!
        <button onClick={resetWasOffline}>Dismiss</button>
      </div>
    );
  }

  return null;
}
```

---

## Handle 401 Re-authentication

When your API returns 401, prompt the user to re-authenticate:

```tsx
<TideCloakContextProvider
  onReauthRequired={() => {
    // Optionally show a modal or redirect to login
  }}
>
```

```tsx
function useApi() {
  const { getToken, triggerReauth, needsReauth, login } = useTideCloak();

  const fetchWithAuth = async (url, options = {}) => {
    const token = await getToken();
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      triggerReauth(); // Sets needsReauth to true
    }

    return response;
  };

  return { fetchWithAuth };
}

// In your UI
function ReauthModal() {
  const { needsReauth, login, clearReauth } = useTideCloak();

  if (!needsReauth) return null;

  return (
    <div className="modal">
      <p>Your session has expired</p>
      <button onClick={login}>Log in again</button>
      <button onClick={clearReauth}>Cancel</button>
    </div>
  );
}
```

---

## Advanced: Direct Service Access

For advanced use cases, you can access the underlying services directly:

```tsx
const { IAMService, AdminAPI } = useTideCloak();

// Use IAMService methods directly
const tokenExp = IAMService.getTokenExp();

// Use AdminAPI for admin operations
const users = await AdminAPI.getUsers();
```

---

## Advanced: Tide Request Signing

For policy creation and change management, sign requests with user credentials:

```tsx
const { initializeTideRequest, getVendorId, getResource } = useTideCloak();

// Sign a protobuf request for policy creation
const signedRequest = await initializeTideRequest(myPolicyRequest);

// Get config values for API calls
const vendorId = getVendorId();
const clientId = getResource();
```

---

## Advanced: Tide Approval Enclave

For operator approvals (reviewing change set requests):

```tsx
const { approveTideRequests } = useTideCloak();

// Open the approval enclave with pending requests
const results = await approveTideRequests([
  { id: 'request-1', request: encodedRequest1 },
  { id: 'request-2', request: encodedRequest2 },
]);

// Handle results
results.forEach(result => {
  if (result.approved) {
    console.log(`${result.id} approved`);
  } else if (result.denied) {
    console.log(`${result.id} denied`);
  } else if (result.pending) {
    console.log(`${result.id} still pending`);
  }
});
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
