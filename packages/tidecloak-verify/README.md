# TideCloak Verify SDK

A lightweight utility for server‑side verification of TideCloak‑issued JSON Web Tokens (JWTs).

This package exports a single function, `verifyTideCloakToken`, which you can use in your Next.js API routes, Node.js servers, or any backend to verify the authenticity, issuer, audience, and roles of a JWT issued by your TideCloak realm.

---

## Installation

```bash
npm install @tidecloak/verify
# or
yarn add @tidecloak/verify
```

---

## Import

```ts
import { verifyTideCloakToken } from '@tidecloak/verify';
```

---

## API

### `verifyTideCloakToken(config, token, allowedRoles?)`

| Parameter      | Type                  | Description                                                                                                          |
| -------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `config`       | `object`              | Your TideCloak adapter JSON (the Tidecloak client configuration you download from your realm settings).               |
| `token`        | `string`              | The raw JWT (access token) to verify.                                                                                |
| `allowedRoles` | `string[]` (optional) | Array of Tidecloak realm or client roles. If provided, the user must have at least one of these roles in their token. |

**Returns:**
`Promise<object | null>`

* **Success:** Decoded token payload when all checks pass.
* **Failure:** `null` if verification fails or the user lacks the required role(s).

#### Under the hood

Internally, `verifyTideCloakToken` uses the [jose](https://github.com/panva/jose) library to:

1. Ensure a token is present.
2. Construct the correct issuer URL from `config['auth-server-url']` and `config.realm`.
3. Choose between a local JWK Set (`config.jwk.keys`) or fetch the JWK Set remotely from Tidecloak.
4. Verify the token's signature, issuer, and `azp` (authorized party) against `config.resource`.
5. Extract realm (`payload.realm_access.roles`) and client (`payload.resource_access[resource].roles`) roles.
6. Check for at least one matching role if `allowedRoles` is specified.

On any failure, it logs an error to the console and returns `null`.

---

## Examples

### 1. Plain JavaScript (Express)

> **ESM / `import` syntax** (add `{ "type": "module" }` in your `package.json`):

```js
// server.js
import express from 'express';
import cookieParser from 'cookie-parser';
import { verifyTideCloakToken } from '@tidecloak/verify';
import config from './tidecloakAdapter.json';

const app = express();
app.use(cookieParser());

app.get('/secure', async (req, res) => {
  const token = req.cookies.kcToken || req.headers.authorization?.split(' ')[1] || '';
  const payload = await verifyTideCloakToken(config, token, ['user']);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ message: `Hello, ${payload.preferred_username}` });
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

> **CommonJS / `require` syntax** (default Node.js):

````js
// server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const { verifyTideCloakToken } = require('@tidecloak/verify');
const config = require('./tidecloakAdapter.json');

const app = express();
app.use(cookieParser());

app.get('/secure', async (req, res) => {
  const token = req.cookies.kcToken || req.headers.authorization?.split(' ')[1] || '';
  const payload = await verifyTideCloakToken(config, token, ['user']);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ message: `Hello, ${payload.preferred_username}` });
});

app.listen(3000, () => console.log('Server running on port 3000'));
````
### 2. React with Server-Side Rendering

```jsx
// pages/secure.js (Next.js Pages Router)
import React from 'react';
import { verifyTideCloakToken } from '@tidecloak/verify';
import config from '../tidecloakAdapter.json';

export async function getServerSideProps({ req }) {
  const token = req.cookies.kcToken || req.headers.authorization?.split(' ')[1] || '';
  const payload = await verifyTideCloakToken(config, token, ['user']);
  if (!payload) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  return { props: { user: payload.preferred_username } };
}

export default function SecurePage({ user }) {
  return <div>Welcome, {user}</div>;
}
```
### 3. Next.js Pages Router (API Route)

```ts
// pages/api/secure.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyTideCloakToken } from '@tidecloak/verify';
import config from '../../tidecloakAdapter.json';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies.kcToken || req.headers.authorization?.split(' ')[1] || '';
  const payload = await verifyTideCloakToken(config, token, ['user', 'admin']);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.status(200).json({ message: 'Hello, ' + payload.preferred_username });
}
```

### 4. Next.js App Router (API Route)

```ts
// app/api/secure/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyTideCloakToken } from '@tidecloak/verify';
import config from '../../../tidecloakAdapter.json';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('kcToken')?.value || '';
  const payload = await verifyTideCloakToken(config, token, ['user']);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ message: `Welcome, ${payload.preferred_username}` });
}
```

---

## TypeScript Definitions

```ts
interface TidecloakConfig {
  realm: string;
  'auth-server-url': string;
  resource: string;
  publicClient?: boolean;
  confidentialPort?: number;
  jwk?: { keys: Array<{ kid: string; kty: string; alg: string; use: string; x: string; crv?: string }> };
  [key: string]: unknown;
}

export declare function verifyTideCloakToken(
  config: TidecloakConfig,
  token: string,
  allowedRoles?: string[]
): Promise<Record<string, any> | null>;
```

---

