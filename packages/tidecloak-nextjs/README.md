# TideCloak NextJS SDK

Jump to:
* [Quickstart](#quickstart)
* [Expanding](#expanding-from-the-template)
* [References](#references)

---
# Quickstart

Secure your Next.js app with TideCloak: authentication, session management, data encryption, and edge-middleware integration-all in minutes.

### 1. Prerequisites

Before you begin, ensure you have:

* A [running](https://github.com/tide-foundation/tidecloak-gettingstarted) TideCloak server you have admin control over. No need to set anything up - just start the server.

As well as 
* Next.js 13.5.7 or later
* React 18 or later
* Node.js ≥18.17.0


### 2. Initialize the template project

> [!NOTE]
> The initialization will prompt you to create the realm and clients on your Tidecloak server. The script will also include Tide Realm Admin creation and IGA enablement.

```bash
npm init @tidecloak/nextjs my-app
```

#### 2.a Project structure

```
my-app/
├── app
|   └── api/
|   │   └── protected/
|   │       └── route.js            <- A protected API on your NextJS server that verifies the user's access token
|   ├── auth/
|   │   └── redirect/
|   │       └── page.jsx            <- A dedicated page to redirect the user back to once authentication is complete
|   ├── home/
|   |   └── page.jsx                <- Your home page the user goes to once autenticated
|   ├── public/
│   |   └── silent-check-sso.html
|   ├── layout.jsx                 <- Entry point of your app before the user sees any actual pages
|   └── page.jsx                   <- Your login page the user is brought to when they need to authenticate
|
├── tidecloak.json             <- Where your Tidecloak configuration sits
├── next.config.json
├── middleware.js              <- Run on each page navigation - this is where the Tideccloak token is verified
└── package.json
```

### 3. Test your app!

```npm run dev```

Here it is - [localhost:3000](http://localhost:3000)

---
# Expanding from the template



### Implementing encryption/decryption
You will first need to create the required realm roles that enable each user to encrypt/decrypt their own date of births.

> [!NOTE]
> You have already completed the pre-requisites asked for in the documentation to set up encrypt/decrypt roles AND also set up the required client.

[Set up encrypt/decrypt roles](https://docs.tidecloak.com/docs/EncryptDecrypt/SetupED)

TideCloak lets you protect sensitive fields with **tag-based** encryption. Pass in an array of `{ data, tags }` objects and receive encrypted strings (or vice versa).

### Syntax Overview

```ts
// Encrypt payloads:
const encryptedArray = await doEncrypt([
  { data: /* string */, tags: ['tag1', 'tag2'] },
  // …
]);

// Decrypt blobs:
const decryptedArray = await doDecrypt([
  { encrypted: /* string from encrypt() */, tags: ['tag1', 'tag2'] },
  // …
]);
```

> **Order guarantee**: the returned array matches the input order.

* **Encryption** requires access token roles `_tide_<tag>.selfencrypt` for each tag.
* **Decryption** requires access token roles `_tide_<tag>.selfdecrypt` for each tag.
  
---
# References

This bundle provides:

* `<TideCloakProvider>` - application-level context
* `useTideCloak()` hook - access tokens and auth actions
* `verifyTideCloakToken()` - server-side JWT verification
* `<Authenticated>` / `<Unauthenticated>` - UI guards
* `doEncrypt()` / `doDecrypt()` - tag-based encryption/decryption
* `createTideCloakMiddleware()` - Edge middleware for route protection (supports both Pages & App routers)


### Using the `useTideCloak` Hook

Use this hook anywhere to manage auth:

```tsx
'use client'
import { useTideCloak } from '@tidecloak/nextjs';

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
| Automatic token refresh               | built-in                                     | Tokens refresh silently on expiration-no manual setup needed.           |
| `refreshToken()`                      | `() => Promise<boolean>`                     | Force a silent token renewal.                                           |
| `getValueFromToken(key)`              | `(key: string) => any`                       | Read a custom claim from the access token.                              |
| `getValueFromIdToken(key)`            | `(key: string) => any`                       | Read a custom claim from the ID token.                                  |
| `hasRealmRole(role)`                  | `(role: string) => boolean`                  | Check a realm-level role.                                               |
| `hasClientRole(role, client?)`        | `(role: string, client?: string) => boolean` | Check a client-level role; defaults to your app’s client ID if omitted. |
| `doEncrypt(data)` / `doDecrypt(data)` | `(data: any) => Promise<any>`                | Encrypt or decrypt payloads via TideCloak’s built-in service.           |


### Guard Components

Use out-of-the-box components to show or hide content:

```tsx
'use client'
import { Authenticated, Unauthenticated } from '@tidecloak/nextjs';

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


### Edge Middleware with TideCloak

TideCloak’s Edge middleware works seamlessly with both the **Pages Router** and the **App Router** in Next.js:

* **Pages Router**: Place your `middleware.ts` file at the project root alongside `pages/`. The exported middleware will apply to both page and API routes.
* **App Router**: Put `middleware.ts` at the project root (or inside `src/`). It integrates with `/app` routes and layouts, protecting both server components and route handlers.

#### Installation

No additional install-middleware is included in `@tidecloak/nextjs`.

#### Options

* **`config`** (`TidecloakConfig`): Your Keycloak adapter JSON (downloaded from your TideCloak client settings).
* **`publicRoutes`** (`RoutePattern[]`): Paths to bypass authentication (strings/globs/regex/functions).
* **`protectedRoutes`** (`ProtectedRoutesMap`): Map of path patterns to arrays of required roles.
* **`onRequest`**<br>`(ctx: { token: string | null }, req: NextRequest) => NextResponse | void`<br>Hook before auth logic; can short-circuit by returning a `NextResponse`.
* **`onSuccess`**<br>`(ctx: { payload: Record<string, any> }, req: NextRequest) => NextResponse | void`<br>Hook after successful auth & role checks; override the response by returning one.
* **`onFailure`**<br>`(ctx: { token: string | null }, req: NextRequest) => NextResponse | void`<br>Hook when auth or role check fails; return a `NextResponse` to override.
* **`onError`**<br>`(err: any, req: NextRequest) => NextResponse`<br>Hook for unexpected errors in middleware logic.

#### Example Usage

Place the following `middleware.ts` at your project root (works for both Pages and App routers) to protect both page routes and API handlers:

```ts
import { NextResponse } from 'next/server';
import keycloakConfig from './tidecloak.config.json';
import { createTideCloakMiddleware } from '@tidecloak/nextjs/server/tidecloakMiddleware';

export default createTideCloakMiddleware({
  config: keycloakConfig,
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
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)',
    '/api/(.*)',
  ],
  runtime: 'edge',
};
```

**Flow:**

1. Bypass any `publicRoutes`
2. Read the `kcToken` cookie
3. Invoke `onRequest` hook (if provided)
4. Match path against `protectedRoutes` patterns
5. Verify signature, issuer, and roles via `verifyTideCloakToken()`
6. On success: `onSuccess` hook or `NextResponse.next()`
7. On failure: `onFailure` hook or default 403 response
8. On unexpected errors: `onError` hook


#### Server‑Side Token Verification

You can verify TideCloak-issued JWTs on your server or API routes using `verifyTideCloakToken`:

```ts
import { verifyTideCloakToken } from '@tidecloak/nextjs/server';

// Returns the decoded payload if valid and roles pass, otherwise null
const payload = await verifyTideCloakToken(
  config,       // Your TideCloak adapter JSON
  token,        // Raw access token to verify
  ['admin', 'user'] // Optional roles; user must have at least one
);

if (!payload) {
  // Invalid token or insufficient roles
}
```

Under the hood, it uses `jose` for cryptographic verification and key management:

```ts
import { jwtVerify, createLocalJWKSet, createRemoteJWKSet } from 'jose';

export async function verifyTideCloakToken(config, token, allowedRoles = []) {
  // Implementation checks token presence, issuer, signature,
  // authorized party (azp), and at least one allowed role.
}
```

**Parameters:**

* `config` (`object`): Your TideCloak adapter JSON (parsed Keycloak config).
* `token` (`string`): Access token string to verify.
* `allowedRoles` (`string[]`, optional): Array of realm or client roles; user must have at least one.

**Returns:**

* `Promise<object | null>`: Decoded JWT payload if valid and role check passes; otherwise `null`.

#### Example: Protecting an API Route

Protect your server-side endpoints by verifying the JWT before proceeding.

#### Pages Router

```ts
// pages/api/secure.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyTideCloakToken } from '@tidecloak/nextjs/server';
import config from '../../tidecloakAdapter.json';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Extract token from cookie or Authorization header
  const token = req.cookies.kcToken || req.headers.authorization?.split(' ')[1] || '';

  // Verify signature, issuer, and roles (e.g., 'user')
  const payload = await verifyTideCloakToken(config, token, ['user']);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Proceed with secure logic
  res.status(200).json({ data: 'Secure data response' });
}
```

#### App Router

```ts
// app/api/secure/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyTideCloakToken } from '@tidecloak/nextjs/server';
import config from '../../../tidecloakAdapter.json';

export async function GET(req: NextRequest) {
  // Extract token from cookie
  const token = req.cookies.get('kcToken')?.value || '';

  // Verify signature, issuer, and roles (e.g., 'user')
  const payload = await verifyTideCloakToken(config, token, ['user']);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Proceed with secure logic
  return NextResponse.json({ data: 'Secure data response' });
}
```

### Advanced & Best Practices

* **Auto-Refresh**: built into the provider-no manual timers.
* **Error Handling**: use the `initError` value from `useTideCloak`.
* **Custom Claims**: read via `getValueFromToken()` / `getValueFromIdToken()`.
* **Role-Based UI**: combine hooks & guard components for fine-grained control.
* **Lazy Initialization**: wrap `<TideCloakProvider>` around only protected sections in large apps.

---
