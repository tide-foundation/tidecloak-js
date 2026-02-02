# Front-Channel Mode (Next.js)

The default mode for Next.js apps. Your browser handles login and tokens directly.

---

## Setup

### 1. Install

```bash
npm install @tidecloak/nextjs
```

### 2. Add Provider

**App Router:** `app/layout.tsx`

```tsx
import { TideCloakProvider } from '@tidecloak/nextjs';
import adapter from '../tidecloakAdapter.json';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TideCloakProvider config={adapter}>
          {children}
        </TideCloakProvider>
      </body>
    </html>
  );
}
```

**Pages Router:** `pages/_app.tsx`

```tsx
import { TideCloakProvider } from '@tidecloak/nextjs';
import adapter from '../tidecloakAdapter.json';

function MyApp({ Component, pageProps }) {
  return (
    <TideCloakProvider config={adapter}>
      <Component {...pageProps} />
    </TideCloakProvider>
  );
}

export default MyApp;
```

### Session Mode

Control how the SDK handles tokens on startup:

```tsx
<TideCloakProvider config={{ ...adapter, sessionMode: 'offline' }}>
```

| Mode | Behavior | Best For |
|------|----------|----------|
| `'online'` | Validates tokens with server, refreshes if needed, requires login if invalid | Always-connected apps |
| `'offline'` | Accepts stored tokens without server validation, even if expired | Offline-first apps, PWAs |

**Offline mode** lets users access your app even when their session has expired. You can then prompt for re-login only when an API call fails with 401.

### 3. Create Redirect Page

**App Router:** `app/auth/redirect/page.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTideCloak } from '@tidecloak/nextjs';

export default function RedirectPage() {
  const { authenticated, isInitializing } = useTideCloak();
  const router = useRouter();

  useEffect(() => {
    if (!isInitializing) {
      router.push(authenticated ? '/dashboard' : '/');
    }
  }, [authenticated, isInitializing, router]);

  return <p>Loading...</p>;
}
```

---

## Using the Hook

```tsx
'use client';

import { useTideCloak } from '@tidecloak/nextjs';

export default function Header() {
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

## Available Values

```tsx
const {
  authenticated,        // true if logged in
  isInitializing,       // true while SDK starts up
  token,                // access token
  tokenExp,             // token expiry timestamp
  login,                // log in function
  logout,               // log out function
  refreshToken,         // refresh token function
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

```tsx
'use client';

import { Authenticated, Unauthenticated } from '@tidecloak/nextjs';

export default function Dashboard() {
  return (
    <>
      <Authenticated>
        <h1>Welcome to your dashboard!</h1>
      </Authenticated>

      <Unauthenticated>
        <p>Please log in.</p>
      </Unauthenticated>
    </>
  );
}
```

---

## Route Protection

Protect routes with server-side auth checks.

### Next.js 16+ (proxy.ts)

Create `proxy.ts` at your project root:

```ts
import { NextResponse } from 'next/server';
import tidecloakConfig from './tidecloakAdapter.json';
import { createTideCloakProxy } from '@tidecloak/nextjs/server';

export const proxy = createTideCloakProxy({
  config: tidecloakConfig,
  protectedRoutes: {
    '/admin/*': ['admin'],
    '/api/private/*': ['user'],
  },
  onFailure: ({ token }, req) => NextResponse.redirect(new URL('/login', req.url)),
  onError: (err, req) => NextResponse.rewrite(new URL('/error', req.url)),
});
```

> **Important:** Do NOT add `export const config` to proxy.ts - it's not supported and will cause errors. Proxy files always run on Node.js runtime and don't need a matcher config.

### Next.js 13-15 (middleware.ts)

Create `middleware.ts` at your project root:

```ts
import { NextResponse } from 'next/server';
import tidecloakConfig from './tidecloakAdapter.json';
import { createTideCloakMiddleware } from '@tidecloak/nextjs/server';

export default createTideCloakMiddleware({
  config: tidecloakConfig,
  protectedRoutes: {
    '/admin/*': ['admin'],
    '/api/private/*': ['user'],
  },
  onFailure: ({ token }, req) => NextResponse.redirect(new URL('/login', req.url)),
  onError: (err, req) => NextResponse.rewrite(new URL('/error', req.url)),
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)',
    '/api/(.*)',
  ],
};
```

---

## Server-Side Token Verification

**App Router:** `app/api/secure/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyTideCloakToken } from '@tidecloak/nextjs/server';
import config from '../../../tidecloakAdapter.json';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('kcToken')?.value || '';
  const payload = await verifyTideCloakToken(config, token, ['user']);

  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ data: 'Secure data' });
}
```

---

## Encrypting & Decrypting Data

```tsx
const { doEncrypt, doDecrypt } = useTideCloak();

// Encrypt
const [encrypted] = await doEncrypt([
  { data: "sensitive info", tags: ["personal"] }
]);

// Decrypt
const [decrypted] = await doDecrypt([
  { encrypted, tags: ["personal"] }
]);
```

### Data Types

The `data` property **must** be either a string or a `Uint8Array` (raw bytes).

```tsx
// This will FAIL - objects not allowed
await doEncrypt([{ data: { name: "John" }, tags: ["user"] }]);

// This works - use strings
await doEncrypt([{ data: JSON.stringify({ name: "John" }), tags: ["user"] }]);
```

### Permissions

- Encryption requires `_tide_<tag>.selfencrypt` role
- Decryption requires `_tide_<tag>.selfdecrypt` role
- Users need roles matching **every** tag on a payload
