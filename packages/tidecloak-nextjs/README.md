# TideCloak NextJS SDK

> ## Quick Start Template
>
> If you're new to TideCloak, the fastest way to get started is with our official Next.js template:  
> [`@tidecloak/create-nextjs`](../tidecloak-create-nextjs/README.md)  
> It scaffolds a working project with authentication, middleware, and optional IAM setup — so you can start building right away.
>
>---


Secure your Next.js app with TideCloak: authentication, session management, data encryption, and edge-middleware integration.

---

## 1. Prerequisites

Before you begin, ensure you have the following:

* **Next.js**:

  * App Router (recommended): Next.js 13.4 or later (for `layout.tsx` support)
  * Pages Router (legacy): Next.js 12 or later (for `_app.tsx` support)
* **React 18** or later
* **Node.js ≥18.17.0**
* A [running](https://github.com/tide-foundation/tidecloak-gettingstarted) TideCloak server you have admin control over.
* IGA enabled realm
* A registered client in your realm with default user contexts approved and committed
* A valid Keycloak adapter JSON file (e.g., `tidecloakAdapter.json`)

> Note: Choose either the App Router or the Pages Router for your project. You only need one routing system active.

## 2. Install `@tidecloak/nextjs`

Add `@tidecloak/nextjs` to your project:

```bash
npm install @tidecloak/nextjs
# or
yarn add @tidecloak/nextjs
```

This bundle provides:

* `<TideCloakProvider>` — application-level context
* `useTideCloak()` hook — access tokens and auth actions
* `verifyTideCloakToken()` — server-side JWT verification
* `<Authenticated>` / `<Unauthenticated>` — UI guards
* `doEncrypt()` / `doDecrypt()` — tag-based encryption/decryption
* `createTideCloakMiddleware()` — Edge middleware for route protection (supports both Pages & App routers)

---

## 3. Initialize the Provider

To begin using the SDK, wrap your application with `<TideCloakProvider>`.

This makes authentication state, token access, and authorization tools available throughout your app. You only need to wrap once—at the top level entry point depending on which routing system you're using.

---

### App Router

**File:** `/app/layout.tsx`

```tsx
import React from 'react';
import { TideCloakProvider } from '@tidecloak/nextjs';
import adapter from '../tidecloakAdapter.json';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TideCloakProvider config={{ ...adapter }}>
          {children}
        </TideCloakProvider>
      </body>
    </html>
  );
}
```

**Description:** This `layout.tsx` is used by Next.js’s App Router. It defines the root HTML structure and wraps all nested pages and layouts with `TideCloakProvider`, making authentication context available everywhere in the `/app` directory.

---

### Pages Router

**File:** `/pages/_app.tsx`

```tsx
import React from 'react';
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

**Description:** The `_app.tsx` file is the entry point for the Pages Router. It wraps every page component in the `/pages` directory with `TideCloakProvider`, so that authentication state and methods are accessible across all your pages.

---

## 4. Redirect URI Handling

TideCloak supports an optional `redirectUri` parameter. This is the URL users are sent to after login or logout.

If omitted, it defaults to:

```ts
`${window.location.origin}/auth/redirect`
```

> If your app runs at `http://localhost:3000`, then by default users will be redirected to `http://localhost:3000/auth/redirect` after login or logout.
>
> If that route doesn't exist in your project, you must create it or explicitly define a different `redirectUri` in your TideCloak config.

If you use the default, you **must create a page** at `/auth/redirect` in your app.

You can customize this URI in your provider config:

```tsx
<TideCloakProvider config={{ ...adapter, redirectUri: 'https://yourapp.com/auth/callback' }}>
  {children}
</TideCloakProvider>
```

### Example: `/app/auth/redirect/page.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTideCloak } from '@tidecloak/nextjs';

export default function RedirectPage() {
  const { authenticated, isInitializing, logout } = useTideCloak();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "failed") {
      sessionStorage.setItem("tokenExpired", "true");
      logout();
    }
  }, []);

  useEffect(() => {
    if (!isInitializing) {
      router.push(authenticated ? '/home' : '/');
    }
  }, [authenticated, isInitializing, router]);

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

This page helps finalize the login or logout flow, and also reacts to token expiration events that may have triggered a redirect from the middleware.

---

## 4. Using the `useTideCloak` Hook

Use this hook anywhere in your React component tree to manage authentication:

```tsx
'use client'
import React from 'react';
import { useTideCloak } from '@tidecloak/nextjs';

export default function Header() {
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

## 5. Guard Components

Use these components to conditionally render UI based on auth state:

```tsx
'use client'
import React from 'react';
import { Authenticated, Unauthenticated } from '@tidecloak/nextjs';

export default function Dashboard() {
  return (
    <>
      <Authenticated>
        <h1>Dashboard</h1>
        {/* Protected widgets here */}
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

## 6. Encrypting & Decrypting Data

Protect sensitive payloads using tag-based encryption/decryption:

```ts
// Encrypt payloads:
const encryptedArray = await doEncrypt([
  { data: { email: 'user@example.com' }, tags: ['email'] },
]);

// Decrypt blobs:
const decryptedArray = await doDecrypt([
  { encrypted: encryptedArray[0], tags: ['email'] },
]);
```

* **Permissions**: Encryption requires roles `tide_<tag>.selfencrypt`; decryption requires `tide_<tag>.selfdecrypt`.
* **Order guarantee**: Output array preserves input order.

---

## 7. Edge Middleware with TideCloak

Place your middleware at the project root for both routers.

**File:** `/middleware.ts`

```ts
import { NextResponse } from 'next/server';
import config from './tidecloak.config.json';
import { createTideCloakMiddleware } from '@tidecloak/nextjs/server/tidecloakMiddleware';

export default createTideCloakMiddleware({
  config,
  publicRoutes: ['/', '/about'],
  protectedRoutes: {
    '/admin/*': ['admin'],
    '/api/private/*': ['user'],
  },
  onFailure: ({ token }, req) => NextResponse.redirect(new URL('/login', req.url)),
  onError: (err, req) => NextResponse.rewrite(new URL('/error', req.url)),
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)',
    '/api/(.*)',
  ],
  runtime: 'edge',
};
```

**Description:** The `middleware.ts` file runs at the Edge runtime before any page or API request. It applies authentication and role-based access control globally, using your adapter settings to verify tokens and redirect or rewrite responses as needed.

---

## 8. Server‑Side Token Verification

### Pages Router

**File:** `/pages/api/secure.ts`

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyTideCloakToken } from '@tidecloak/nextjs/server';
import config from '../../tidecloakAdapter.json';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies.kcToken || req.headers.authorization?.split(' ')[1] || '';
  const payload = await verifyTideCloakToken(config, token, ['user']);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.status(200).json({ data: 'Secure data response' });
}
```

### App Router

**File:** `/app/api/secure/route.ts`

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
  return NextResponse.json({ data: 'Secure data response' });
}
```

---

## 9. Advanced & Best Practices

* **Auto-Refresh**: built into the provider—no manual timers.
* **Error Handling**: use the `initError` property from `useTideCloak`.
* **Custom Claims**: read via `getValueFromToken()` / `getValueFromIdToken()`.
* **Role-Based UI**: combine hooks & guard components for fine-grained control.
* **Lazy Initialization**: wrap `<TideCloakProvider>` around only protected sections in large apps.

---
