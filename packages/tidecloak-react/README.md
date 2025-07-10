# TideCloak React SDK

Secure your React app with TideCloak: authentication, session management, and data encryption—all in minutes.

---

## 1. Prerequisites

Before you begin, ensure you have:

- React 18 or later
- Node.js >=18.17.0 or later
- A running TideCloak server.
- A registered client in your realm.

---

## 2. Install the SDK

Add the React package to your project:

```bash
npm install @tidecloak/react
# or
yarn add @tidecloak/react
```

This bundle provides:

- `<TideCloakProvider>` — application-level context.
- `useTideCloak()` hook — access tokens and auth actions.
- `<Authenticated>` / `<Unauthenticated>` — UI guards.

---

## 3. Initialize the Provider

Wrap your root component in `<TideCloakProvider>` to load adapter settings and bootstrap auth:

```tsx
import React from 'react';
import { TideCloakProvider } from '@tidecloak/react';
import adapter from '../tidecloakAdapter.json';

export default function App() {
  return (
    <TideCloakProvider config={adapter}>
      <YourApp />
    </TideCloakProvider>
  );
}
```

**What it does:**

- **Loads** your adapter JSON.
- **Initializes** internal auth flows and listeners.
- **Provides** auth state & methods via React Context.

---

## 4. Using the `useTideCloak` Hook

Use this hook anywhere to manage auth:

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

**Key methods & props:**

| Name                               | Type                                         | Description                                                             |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `authenticated`                    | `boolean`                                    | Whether the user is logged in.                                          |
| `login()` / `logout()`             | `() => void`                                 | Trigger the login or logout flows.                                      |
| `token`, `tokenExp`                | `string`, `number`                           | Access token and its expiration timestamp.                              |
| Automatic token refresh            | built-in                                     | Tokens refresh silently on expiration—no manual setup needed.           |
| `refreshToken()`                   | `() => Promise<boolean>`                     | Force a silent token renewal.                                           |
| `getValueFromToken(key)`           | `(key: string) => any`                       | Read a custom claim from the access token.                              |
| `getValueFromIdToken(key)`         | `(key: string) => any`                       | Read a custom claim from the ID token.                                  |
| `hasRealmRole(role)`               | `(role: string) => boolean`                  | Check a realm-level role.                                               |
| `hasClientRole(role, client?)`     | `(role: string, client?: string) => boolean` | Check a client-level role; defaults to your app’s client ID if omitted. |
| `doEncrypt(data)``doDecrypt(data)` | `(data: any) => Promise<any>`                | Encrypt or decrypt payloads via TideCloak’s built-in service.           |

---

## 5. Guard Components

Use out-of-the-box components to show or hide content:

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

- `<Authenticated>`: renders children only when `authenticated === true`.
- `<Unauthenticated>`: renders children only when `authenticated === false`.

---

## 6. Encrypting & Decrypting Data

TideCloak lets you protect sensitive fields with **tag-based** encryption. You pass in an array of `{ data, tags }` objects and receive an array of encrypted strings (or vice versa for decryption).

### Syntax Overview

```ts
// Encrypt one or more payloads:
const encryptedArray: string[] = await doEncrypt([
  { data: /* any JSON-serializable value */, tags: ['tag1', 'tag2'] },
  // …
]);

// Decrypt one or more encrypted blobs:
const decryptedArray: any[] = await doDecrypt([
  { encrypted: /* string from encrypt() */, tags: ['tag1', 'tag2'] },
  // …
]);
```

> **Order guarantee**: the returned array matches the input order.

---

### Encryption Example

```tsx
import { useTideCloak } from '@tidecloak/react';

async function encryptExamples() {
  const { doEncrypt } = useTideCloak();

  // Simple single-item encryption:
  const [encryptedDob] = await doEncrypt([
    { data: '2005-03-04', tags: ['dob'] }
  ]);

  // Multi-field encryption:
  const encryptedFields = await doEncrypt([
    { data: '10 Smith Street', tags: ['street'] },
    { data: 'Southport', tags: ['suburb'] },
    { data: { full: '20 James Street – Burleigh Heads' }, tags: ['street', 'suburb'] }
  ]);
}
```

> **Permissions**: Users need roles matching **every** tag on a payload. A payload tagged `['street','suburb']` requires both the `tide_street.selfencrypt` and `tide_suburb.selfencrypt` roles.

---

### Decryption Example

```tsx
import { useTideCloak } from '@tidecloak/react';

async function decryptExamples(encryptedFields: string[]) {
  const { doDecrypt } = useTideCloak();

  // Single-item decryption:
  const [decryptedDob] = await doDecrypt([
    { encrypted: encryptedFields[0], tags: ['dob'] }
  ]);

  // Multi-field decryption:
  const decryptedFields = await doDecrypt([
    { encrypted: encryptedFields[0], tags: ['street'] },
    { encrypted: encryptedFields[1], tags: ['suburb'] },
    { encrypted: encryptedFields[2], tags: ['street','suburb'] }
  ]);
}
```

> **Permissions**: Like encryption, decryption requires the same tag-based roles (`tide_street.selfdecrypt`, `tide_suburb.selfdecrypt`, etc.).

---

## 7. Advanced & Best Practices

- **Auto-Refresh**: built into the provider—no manual token timers needed.
- **Error Handling**: use the `initError` value from `useTideCloak` to catch startup issues.
- **Custom Claims**: store app-specific data in JWT claims and access via `getValueFromToken()` / `getValueFromIdToken()`.
- **Role-Based Access**: combine `hasRealmRole` and `hasClientRole` with guard components for fine-grained control.
- **Lazy Initialization**: wrap `<TideCloakProvider>` around only authenticated sections in large apps.

---