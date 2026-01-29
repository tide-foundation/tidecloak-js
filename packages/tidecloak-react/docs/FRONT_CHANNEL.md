# Front-Channel Mode (React)

The default mode for React web apps. Your browser handles login and tokens directly.

---

## Setup

### 1. Install

```bash
npm install @tidecloak/react
```

### 2. Add Provider

Wrap your app with `TideCloakContextProvider`:

```tsx
import { TideCloakContextProvider } from '@tidecloak/react';
import adapter from './tidecloakAdapter.json';

function App() {
  return (
    <TideCloakContextProvider config={adapter}>
      <YourApp />
    </TideCloakContextProvider>
  );
}
```

### 3. Create Redirect Route

Add a route for `/auth/redirect`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <TideCloakContextProvider config={adapter}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/redirect" element={<RedirectPage />} />
        </Routes>
      </BrowserRouter>
    </TideCloakContextProvider>
  );
}
```

**RedirectPage.tsx:**
```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTideCloak } from '@tidecloak/react';

export default function RedirectPage() {
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

---

## Using the Hook

```tsx
import { useTideCloak } from '@tidecloak/react';

function Header() {
  const { authenticated, login, logout, token } = useTideCloak();

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
    </header>
  );
}
```

---

## Available Values

```tsx
const {
  authenticated,        // true if logged in
  isInitializing,       // true while SDK is starting
  token,                // access token string
  tokenExp,             // token expiry timestamp
  login,                // function to log in
  logout,               // function to log out
  refreshToken,         // function to refresh token
  getValueFromToken,    // get value from access token
  getValueFromIdToken,  // get value from ID token
  hasRealmRole,         // check realm role
  hasClientRole,        // check client role
  doEncrypt,            // encrypt data
  doDecrypt,            // decrypt data
} = useTideCloak();
```

---

## Guard Components

Show content based on login state:

```tsx
import { Authenticated, Unauthenticated } from '@tidecloak/react';

function Dashboard() {
  return (
    <>
      <Authenticated>
        <h1>Welcome to your dashboard!</h1>
      </Authenticated>

      <Unauthenticated>
        <p>Please log in to see your dashboard.</p>
      </Unauthenticated>
    </>
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

  return <div>Admin controls here</div>;
}
```

---

## Get User Info

```tsx
function Profile() {
  const { getValueFromToken, getValueFromIdToken } = useTideCloak();

  const email = getValueFromToken('email');
  const name = getValueFromIdToken('name');

  return (
    <div>
      <p>Name: {name}</p>
      <p>Email: {email}</p>
    </div>
  );
}
```

---

## Encrypting & Decrypting Data

TideCloak lets you protect sensitive fields with tag-based encryption. You pass in an array of `{ data, tags }` objects and receive an array of encrypted strings.

### Syntax

```tsx
const { doEncrypt, doDecrypt } = useTideCloak();

// Encrypt one or more payloads:
const encryptedArray = await doEncrypt([
  { data: /* string or Uint8Array */, tags: ['tag1', 'tag2'] },
]);

// Decrypt one or more encrypted blobs:
const decryptedArray = await doDecrypt([
  { encrypted: /* string from encrypt() */, tags: ['tag1', 'tag2'] },
]);
```

### Data Types

The `data` property **must** be either a string or a `Uint8Array` (raw bytes).
- When you encrypt a string, decryption returns a string.
- When you encrypt a `Uint8Array`, decryption returns a `Uint8Array`.

### Valid Example

```tsx
const encrypted = await doEncrypt([
  {
    data: "10 Smith Street",
    tags: ["street"]
  },
  {
    data: "Southport",
    tags: ["suburb"]
  },
  {
    data: "20 James Street - Burleigh Heads",
    tags: ["street", "suburb"]
  }
]);
```

### Invalid Example (will fail)

```tsx
// Prepare data for encryption
const dataToEncrypt = {
  title: noteData.title,
  content: noteData.content
};

// This will ERROR - objects not allowed
const encryptedArray = await doEncrypt([
  { data: dataToEncrypt, tags: ['note'] }
]);

// Instead, stringify objects first:
const encryptedArray = await doEncrypt([
  { data: JSON.stringify(dataToEncrypt), tags: ['note'] }
]);
```

### Encryption Example

```tsx
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
    { data: '20 James Street - Burleigh Heads', tags: ['street', 'suburb'] }
  ]);
}
```

### Decryption Example

```tsx
async function decryptExamples(encryptedFields) {
  const { doDecrypt } = useTideCloak();

  // Single-item decryption:
  const [decryptedDob] = await doDecrypt([
    { encrypted: encryptedFields[0], tags: ['dob'] }
  ]);

  // Multi-field decryption:
  const decryptedFields = await doDecrypt([
    { encrypted: encryptedFields[0], tags: ['street'] },
    { encrypted: encryptedFields[1], tags: ['suburb'] },
    { encrypted: encryptedFields[2], tags: ['street', 'suburb'] }
  ]);
}
```

### Permissions

- Encryption requires `_tide_<tag>.selfencrypt` role
- Decryption requires `_tide_<tag>.selfdecrypt` role
- Users need roles matching **every** tag on a payload
- A payload tagged `['street', 'suburb']` requires both `_tide_street.selfencrypt` and `_tide_suburb.selfencrypt` roles

### Order Guarantee

Output preserves input order - the first item in the input array corresponds to the first item in the output array.
