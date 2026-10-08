# TideCloak NextJS SDK

Jump to:
* [Quickstart](#quickstart)
* [Expanding](#expanding-from-the-template)
* [References](#references)

---
# Quickstart

Secure your Next.js app with TideCloak: authentication, session management, data encryption, and server-side route protection, all in minutes.

[![Developer Walkthrough](http://img.youtube.com/vi/dVpDUF_XJdw/0.jpg)](https://www.youtube.com/watch?v=dVpDUF_XJdw "Provably secure your Next.js apps in 5 mins, with TideCloak")

### 1. Prerequisites

Before you begin, ensure you have:

* A [running](https://github.com/tide-foundation/tidecloak-gettingstarted) TideCloak server you have admin control over. No need to set anything up - just start the server.

As well as
* Node.js 20.9 or later (the template is a Next.js 16 app with React 19)
* `curl` and `jq`, if you let the scaffolder initialize TideCloak for you


### 2. Initialize the template project

> [!NOTE]
> The initialization will prompt you to create the realm and clients on your Tidecloak server. The script will also include Tide Realm Admin creation and IGA enablement.

```bash
sudo apt update && sudo apt install -y curl jq
npm init @tidecloak/nextjs@latest my-app
```

#### 2.a Project structure

The JavaScript template is shown. The TypeScript one has the same layout with `.ts`/`.tsx` files and a `tsconfig.json`, and puts the provider straight into `app/layout.tsx`.

```
my-app/
├── app/
│   ├── api/
│   │   └── protected/
│   │       └── route.js            <- A protected API route that verifies the user's access token
│   ├── auth/
│   │   └── redirect/
│   │       └── page.jsx            <- Where the user lands once authentication is complete
│   ├── home/
│   │   └── page.jsx                <- Home page for authenticated users (includes an encrypted note)
│   ├── protected/
│   │   └── page.jsx                <- Example page guarded server-side by proxy.js
│   ├── tide_dpop/
│   │   └── [...path]/
│   │       └── route.js            <- Serves tide_dpop_auth.html, only needed if you turn on dpopConfig
│   ├── layout.jsx                  <- Root layout
│   ├── page.jsx                    <- Login page
│   └── provider.jsx                <- Wraps the app in TideCloakProvider
├── init/
│   ├── .env.example                <- Defaults for tcinit.sh
│   ├── realm.json                  <- Realm template used by tcinit.sh
│   └── tcinit.sh                   <- Provisions the realm and writes tidecloak.json (npm run init)
├── public/
│   ├── silent-check-sso.html       <- Silent SSO check page
│   └── tide_dpop_auth.html         <- DPoP helper page (only used with dpopConfig)
├── tidecloak.json                  <- Your TideCloak adapter config (a {} placeholder until init runs)
├── proxy.js                        <- Verifies the token server-side before protected pages load
├── jsconfig.json
├── next.config.js
└── package.json
```

If you skipped initialization, run `npm run init` inside the app later. It writes `tidecloak.json` to the app root; set `ADAPTER_OUTPUT_PATH` to write it somewhere else.

### 3. Test your app!

```npm run dev```

Here it is - [localhost:3000](http://localhost:3000)
🎉
---
# Expanding from the template



### Implementing encryption/decryption
The realm created by init already gives every user the `_tide_message.selfencrypt` and `_tide_message.selfdecrypt` roles, which the home page uses for its encrypted note. To encrypt data under other tags, [set up matching roles](https://docs.tidecloak.com/docs/EncryptDecrypt/SetupED).

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
  { encrypted: /* string from doEncrypt */, tags: ['tag1', 'tag2'] },
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
* `createTideCloakProxy()` - route protection in `proxy.ts` (Next.js 16+, used by the template)
* `createTideCloakMiddleware()` - route protection in `middleware.ts` (Next.js 13.5 to 15)


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
| Automatic token refresh               | built-in                                     | Tokens refresh silently on expiration, no manual setup needed.          |
| `refreshToken()`                      | `() => Promise<boolean>`                     | Force a silent token renewal.                                           |
| `getValueFromToken(key)`              | `(key: string) => any`                       | Read a custom claim from the access token.                              |
| `getValueFromIdToken(key)`            | `(key: string) => any`                       | Read a custom claim from the ID token.                                  |
| `hasRealmRole(role)`                  | `(role: string) => boolean`                  | Check a realm-level role.                                               |
| `hasClientRole(role)`                 | `(role: string) => boolean`                  | Check a client-level role on your app’s client.                        |
| `doEncrypt(data, policy?)` / `doDecrypt(data, policy?)` | `(data: any, policy?: Uint8Array) => Promise<any>` | Encrypt or decrypt payloads, optionally under a signed decryption policy. |


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


### Route Protection with TideCloak

TideCloak provides server-side route protection for both the **Pages Router** and the **App Router** in Next.js.

#### Options

* **`config`** (`TidecloakConfig`): The contents of your `tidecloak.json` adapter config.
* **`protectedRoutes`** (`ProtectedRoutesMap`): Map of path patterns to arrays of required roles. A trailing `/*` glob (e.g. `"/admin/*"`) also matches the bare base path (`/admin`).
* **`cookieName`** (`string`, default `"kcToken"`): Name of the cookie that holds the access token.
* **`onRequest`**<br>`(ctx: { token: string | null }, req: NextRequest) => NextResponse | void`<br>Hook before auth logic; can short-circuit by returning a `NextResponse`.
* **`onSuccess`**<br>`(ctx: { payload: Record<string, any> }, req: NextRequest) => NextResponse | void`<br>Hook after successful auth & role checks; override the response by returning one.
* **`onFailure`**<br>`(ctx: { token: string | null }, req: NextRequest) => NextResponse | void`<br>Hook when auth or role check fails; return a `NextResponse` to override.
* **`onError`**<br>`(err: any, req: NextRequest) => NextResponse`<br>Hook for unexpected errors during verification.

#### Next.js 16+ (proxy.ts)

Create `proxy.ts` at your project root. Proxy runs on the Node.js runtime.

```ts
import { NextResponse } from 'next/server';
import tidecloakConfig from './tidecloak.json';
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

// Optional: limit which paths run the proxy
export const config = {
  matcher: ['/admin/:path*', '/api/private/:path*'],
};
```

> `export const config = { matcher }` works in `proxy.ts`. Don't set `runtime` there: proxy always runs on the Node.js runtime.

#### Next.js 13.5 to 15 (middleware.ts)

Create `middleware.ts` at your project root. Middleware runs on Edge runtime.

```ts
import { NextResponse } from 'next/server';
import tidecloakConfig from './tidecloak.json';
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

**Flow:**

1. Read the `kcToken` cookie
2. Invoke `onRequest` hook (if provided)
3. Match path against `protectedRoutes` patterns
4. Verify signature, issuer, and roles via `verifyTideCloakToken()`
5. On success: `onSuccess` hook or `NextResponse.next()`
6. On failure: `onFailure` hook or default 403 response
7. On unexpected errors: `onError` hook


#### Server‑Side Token Verification

You can verify TideCloak-issued JWTs on your server or API routes using `verifyTideCloakToken`:

```ts
import { verifyTideCloakToken } from '@tidecloak/nextjs/server';

// Returns the decoded payload if valid and roles pass, otherwise null
const payload = await verifyTideCloakToken(
  config,       // Your tidecloak.json contents
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

* `config` (`object`): Your parsed `tidecloak.json` adapter config.
* `token` (`string`): Access token string to verify.
* `allowedRoles` (`string[]`, optional): Array of realm or client roles; user must have at least one.

**Returns:**

* `Promise<TideTokenClaims | null>`: Decoded token claims if valid and the role check passes; otherwise `null`.

#### Example: Protecting an API Route

Protect your server-side endpoints by verifying the JWT before proceeding.

#### Pages Router

```ts
// pages/api/secure.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyTideCloakToken } from '@tidecloak/nextjs/server';
import config from '../../tidecloak.json';

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
import config from '../../../tidecloak.json';

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

* **Auto-Refresh**: built into the provider, no manual timers.
* **Error Handling**: use the `initError` value from `useTideCloak`.
* **Custom Claims**: read via `getValueFromToken()` / `getValueFromIdToken()`.
* **Role-Based UI**: combine hooks & guard components for fine-grained control.
* **Lazy Initialization**: wrap `<TideCloakProvider>` around only protected sections in large apps.

---
