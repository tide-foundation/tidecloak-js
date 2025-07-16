# TideCloak React SDK

Secure your React app with TideCloak: authentication, session management, data encryption, and role-based access.

---

## 1. Prerequisites

Before you begin, ensure you have the following:

* **React 18** or later
* **Node.js ≥18.17.0**
* A [running](https://github.com/tide-foundation/tidecloak-gettingstarted) TideCloak server you have admin control over
* IGA enabled realm
* A registered client in your realm with default user contexts approved and committed
* A valid Keycloak adapter JSON file (e.g., `tidecloakAdapter.json`)

---

## 2. Install `@tidecloak/react`

Add the TideCloak React SDK to your project:

```bash
npm install @tidecloak/react
# or
yarn add @tidecloak/react
```

This bundle provides:

* `<TideCloakProvider>` — application-level context
* `useTideCloak()` hook — access tokens and auth actions
* `<Authenticated>` / `<Unauthenticated>` — UI guards
* `doEncrypt()` / `doDecrypt()` — tag-based encryption/decryption

---

## 3. Initialize the Provider

Wrap your app’s root with `<TideCloakProvider>` to enable authentication context throughout the component tree.

If you're using React Router, your setup might look like this:

**File:** `src/App.tsx`

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TideCloakProvider } from '@tidecloak/react';
import adapter from '../tidecloakAdapter.json';
import Home from './pages/Home';
import RedirectPage from './pages/auth/RedirectPage';

export default function App() {
  return (
    <TideCloakProvider config={adapter}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/redirect" element={<RedirectPage />} />
          {/* Add additional routes here */}
        </Routes>
      </BrowserRouter>
    </TideCloakProvider>
  );
}
```

> ⚠️ If you don't define a route at `/auth/redirect`, and you're using the default `redirectUri`, your app **will break after login/logout**. Either create this route or override `redirectUri` in the provider config.
>
> If you override the `redirectUri`, you **must** ensure that the custom path exists in your router. Otherwise, the app will redirect to a non-existent route and fail.

---

## 4. Redirect URI Handling

TideCloak supports an optional `redirectUri` config field. This defines where the user is sent after login/logout.

If omitted, it defaults to:

```ts
`${window.location.origin}/auth/redirect`
```

> Example: If your app runs at `http://localhost:3000`, then by default the redirect path is `http://localhost:3000/auth/redirect`.

You must **create this route** if you use the default, or explicitly override it:

```tsx
<TideCloakProvider config={{ ...adapter, redirectUri: 'https://yourapp.com/auth/callback' }}>
  <YourApp />
</TideCloakProvider>
```

> ⚠️ If you override the `redirectUri`, make sure the specified path exists in your app. Missing this route will cause failed redirects.

### Example: Redirect Handling Page

**File:** `src/pages/auth/RedirectPage.tsx`

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTideCloak } from '@tidecloak/react';

export default function RedirectPage() {
  const { authenticated, isInitializing, logout } = useTideCloak();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "failed") {
      sessionStorage.setItem("tokenExpired", "true");
      logout();
    }
  }, []);

  useEffect(() => {
    if (!isInitializing) {
      navigate(authenticated ? '/home' : '/');
    }
  }, [authenticated, isInitializing, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '1rem',
      color: '#555',
    }}>
      <p>Waiting for authentication...</p>
    </div>
  );
}
```

**Description:** This page helps finalize the login or logout flow, and also reacts to token expiration events that may have triggered a redirect. It's required if you're using the default `redirectUri`. If you override the redirect URI, the file is optional—but the **route** for the redirect **must** still exist in your app.

---

## 5. Using the `useTideCloak` Hook

Use this hook anywhere in your component tree to manage authentication:

```tsx
import { useTideCloak } from '@tidecloak/react';

function Header() {
  const {
    authenticated,
    login,
    logout,
    token,
    tokenExp,
    refreshToken,
    getValueFromToken,
    getValueFromIdToken,
    hasRealmRole,
    hasClientRole,
    doEncrypt,
    doDecrypt,
  } = useTideCloak();

  return (
    <header>
      {authenticated ? (
        <>
          <span>Logged in</span>
          <button onClick={logout}>Log Out</button>
        </>
      ) : (
        <button onClick={login}>Log In</button>
      )}
      {token && (
        <small>Expires at {new Date(tokenExp * 1000).toLocaleTimeString()}</small>
      )}
    </header>
  );
}
```

| Name                                  | Type                                         | Description                                                             |
| ------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `authenticated`                       | `boolean`                                    | Whether the user is logged in.                                          |
| `login()` / `logout()`                | `() => void`                                 | Trigger the login or logout flows.                                      |
| `token`, `tokenExp`                   | `string`, `number`                           | Access token and its expiration timestamp.                              |
| Automatic token refresh               | built-in                                     | Tokens refresh silently on expiration—no manual setup needed.           |
| `refreshToken()`                      | `() => Promise<boolean>`                     | Force a silent token renewal.                                           |
| `getValueFromToken(key)`              | `(key: string) => any`                       | Read a custom claim from the access token.                              |
| `getValueFromIdToken(key)`            | `(key: string) => any`                       | Read a custom claim from the ID token.                                  |
| `hasRealmRole(role)`                  | `(role: string) => boolean`                  | Check a realm-level role.                                               |
| `hasClientRole(role, client?)`        | `(role: string, client?: string) => boolean` | Check a client-level role; defaults to your app’s client ID if omitted. |
| `doEncrypt(data)` / `doDecrypt(data)` | `(data: any) => Promise<any>`                | Encrypt or decrypt payloads via TideCloak’s built-in service.           |

---

## 6. Guard Components

Use these components to show or hide content based on authentication state:

```tsx
import { Authenticated, Unauthenticated } from '@tidecloak/react';

function Dashboard() {
  return (
    <>
      <Authenticated>
        <h1>Dashboard</h1>
        {/* Protected widgets */}
      </Authenticated>

      <Unauthenticated>
        <p>Please log in to access the dashboard.</p>
      </Unauthenticated>
    </>
  );
}
```

* `<Authenticated>`: renders children only when `authenticated === true`
* `<Unauthenticated>`: renders children only when `authenticated === false`

---

## 7. Encrypting & Decrypting Data

Protect sensitive payloads using tag-based encryption/decryption:

```ts
// Encrypt:
const encryptedArray = await doEncrypt([
  { data: { email: 'user@example.com' }, tags: ['email'] },
]);

// Decrypt:
const decryptedArray = await doDecrypt([
  { encrypted: encryptedArray[0], tags: ['email'] },
]);
```

> **Permissions**: Encryption requires `tide_<tag>.selfencrypt`; decryption requires `tide_<tag>.selfdecrypt`.
> **Order guarantee**: Output preserves input order.

---

## 8. Advanced & Best Practices

* **Auto-Refresh**: built-in, no manual timer setup required
* **Error Handling**: check `initError` from `useTideCloak`
* **Custom Claims**: access token fields with `getValueFromToken()` / `getValueFromIdToken()`
* **Role-Based UI**: combine `hasRealmRole`, `hasClientRole`, and guard components
* **Lazy Initialization**: optionally wrap `<TideCloakProvider>` around only protected routes

---
