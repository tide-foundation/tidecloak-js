# TideCloak Server SDK

Server-side SDK for TideCloak backend operations. Provides delegation exchange for making TideCloak API calls on behalf of authenticated users, using mTLS with VVK-signed server certificates for proof of possession.

```bash
npm install @tidecloak/server
```

---

## What This Does

Your app server needs to call TideCloak's admin API (manage users, roles, etc.), but the user's token is DPoP-bound to the browser's key — your server can't use it directly. This package handles the delegation exchange: the browser signs a delegation request authorizing your server's certificate, the server exchanges it with TideCloak via mTLS, and TideCloak issues a delegation token bound to your server.

---

## Setup

### 1. Configure TideCloak Adapter JSON

Your `tidecloak.json` needs a `serverResource` field pointing to a confidential client for server-to-server communication:

```json
{
  "realm": "myrealm",
  "auth-server-url": "https://auth.example.com",
  "resource": "my-app",
  "serverResource": "my-app-server"
}
```

### 2. Initialize Delegation

```js
import { TideDelegation } from '@tidecloak/server';
import { readFileSync } from 'fs';

const adapterJson = JSON.parse(readFileSync('./data/tidecloak.json', 'utf-8'));

const delegation = new TideDelegation({
  tidecloakUrl: adapterJson['auth-server-url'],
  realm: adapterJson.realm,
  clientId: adapterJson.resource,
  serverClientId: adapterJson.serverResource,
  adapterJsonPath: './data/tidecloak.json',
});
```

### 3. Initialize Server Identity (on startup)

```js
await delegation.init();
```

On first run, `init()`:
1. Generates an Ed25519 keypair
2. Encrypts the private key via Tide Vault → saves to `data/server-key.vault`
3. Submits a cert request to `POST /realms/{realm}/tide-server-identity/request`
4. The cert enters the IGA approval flow — admin quorum must approve it

On subsequent runs, it decrypts the existing key from the vault blob.

**After approval:** Re-export the adapter JSON from TideCloak Admin. It will include a `serverIdentity` section with the VVK-signed certificate. The SDK loads it automatically.

### 4. Wire Up Express Routes

```js
// Protect admin routes with requireDelegation()
app.get('/api/admin/users',
  authenticate,
  delegation.requireDelegation(),
  async (req, res) => {
    const users = await req.delegation.fetch(
      `${tidecloakUrl}/admin/realms/${realm}/users`
    );
    res.json({ users });
  }
);
```

That's it on the server side.

---

## Client-Side: Sending the Delegation Request

The browser must send a signed delegation request as an `X-Delegation-Request` header on admin calls. `IAMService.adminFetch()` handles this automatically — signing, caching, and re-signing on expiry.

### Setup (once, during init)

```js
import { IAMService } from '@tidecloak/js';

// After loading auth config from server:
IAMService.setDelegationThumbprint(authConfig.delegationCertThumbprint);
```

### Usage

```js
// Any endpoint protected by requireDelegation() — one call:
const response = await IAMService.adminFetch('/api/admin/users');
const users = await response.json();

const rolesResponse = await IAMService.adminFetch('/api/admin/roles');
const roles = await rolesResponse.json();

// POST, PUT, DELETE work too:
await IAMService.adminFetch('/api/admin/roles', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'new-role' }),
});

// Endpoints without requireDelegation() use regular fetch
const servers = await fetch('/api/servers');
```

That's it. The SDK handles: get thumbprint → check cache → sign if needed → attach `X-Delegation-Request` header → fetch with auth.

### What the `X-Delegation-Request` header contains

A JWT signed by the browser's DPoP key:

```
Header:  { alg: "EdDSA", jwk: { kty: "OKP", crv: "Ed25519", x: "<browser pub>" } }
Payload: {
  cnf: { "x5t#S256": "<server cert thumbprint>" },
  iat: 1713283200,
  exp: 1713283500,
  jti: "uuid"
}
Signature: Ed25519 by browser's DPoP key
```

This proves:
- **HOP 1**: The browser owns the user's token (same DPoP key)
- **HOP 2**: The browser authorized THIS specific server (by cert thumbprint)

---

## Which Endpoints Need Delegation?

**Needs `requireDelegation()`:**
Any server route where the handler calls `req.delegation.fetch()` to reach TideCloak's admin API.

```js
// User management
app.get('/api/admin/users', authenticate, delegation.requireDelegation(), handler);
app.post('/api/admin/users', authenticate, delegation.requireDelegation(), handler);
app.delete('/api/admin/users/:id', authenticate, delegation.requireDelegation(), handler);

// Role management
app.get('/api/admin/roles', authenticate, delegation.requireDelegation(), handler);
app.post('/api/admin/roles', authenticate, delegation.requireDelegation(), handler);

// Approval workflows
app.get('/api/admin/approvals', authenticate, delegation.requireDelegation(), handler);
app.post('/api/admin/approvals/approve', authenticate, delegation.requireDelegation(), handler);

// Logs
app.get('/api/admin/logs', authenticate, delegation.requireDelegation(), handler);
```

**Does NOT need `requireDelegation()`:**
- Public endpoints (no auth)
- Endpoints that only read from your own database
- Authentication endpoints (`/api/auth/*`)

**Rule of thumb:** If the handler calls `req.delegation.fetch()`, add `requireDelegation()`. The client must then use `adminFetch` (with the `X-Delegation-Request` header) for that endpoint.

**What happens if the header is missing:** The server returns `401 { error: "Delegation required — include X-Delegation-Request header" }`.

---

## How It Works

```
Browser                     App Server                  TideCloak
  │                            │                            │
  ├─ GET /api/admin/users ────►│                            │
  │  Authorization: Bearer     │                            │
  │  X-Delegation-Request: JWT │                            │
  │                            │ requireDelegation()        │
  │                            │ no cache → exchange        │
  │                            ├─ exchange() via mTLS ─────►│
  │                            │  grant_type=token-exchange │
  │                            │  subject_token=userToken   │
  │                            │  actor_token=delegReqJWT   │
  │                            │◄── delegation token ───────┤
  │                            │  cache by sessionId        │
  │                            │                            │
  │                            ├─ GET /admin/.../users ────►│
  │                            │  mTLS + Bearer deleg token │
  │                            │◄── [users] ────────────────┤
  │◄── [users] ────────────────┤                            │
  │                            │                            │
  │  (subsequent requests)     │                            │
  ├─ GET /api/admin/roles ────►│                            │
  │  X-Delegation-Request: JWT │                            │
  │                            │ cache hit → skip exchange  │
  │                            ├─ GET /admin/.../roles ────►│
  │                            │◄── [roles] ────────────────┤
  │◄── [roles] ────────────────┤                            │
```

1. Browser signs a delegation request (authorizing the server's cert) and sends it as `X-Delegation-Request` header
2. Server receives the request — if no cached delegation token, exchanges artifacts with TideCloak via mTLS
3. TideCloak validates the chain of trust (HOP 1 + HOP 2), issues a delegation token
4. Server caches the delegation token by session ID
5. Server uses the delegation token to call TideCloak admin API via mTLS
6. Subsequent requests from the same session use the cached token (no exchange needed)

---

## Scoped Delegation

By default, the delegation token gets all of the user's roles. You can restrict it:

```js
delegation.requireDelegation({
  roles: {
    realm: ['admin'],
    clients: { 'my-app': ['read'] }
  }
})
```

**Rules:**
- `roles` omitted → all user roles included
- `roles` specified → only listed roles appear in the token
- You can never escalate — requesting a role the user doesn't have silently drops it

---

## Using `req.delegation.fetch()`

Once delegation succeeds, `req.delegation.fetch()` sends requests via mTLS with the delegation token.

```js
const users = await req.delegation.fetch(url);
const result = await req.delegation.fetch(url, { method: 'POST', body: { name: 'New Role' } });
await req.delegation.fetch(url, { method: 'DELETE' });
await req.delegation.fetch(url, { method: 'POST', formData: myFormData });
```

---

## Server Identity Lifecycle

### First Run

```
init()  →  generate keypair  →  encrypt via Vault  →  request cert from TideCloak
```

Admin approves in TideCloak Admin > Realm Settings > Server Certs.

### After Approval

Re-export adapter JSON. The `serverIdentity` section will contain the VVK-signed certificate. The SDK loads it and configures mTLS automatically.

### Subsequent Restarts

```
init()  →  load vault blob  →  decrypt via Vault  →  configure mTLS
```

### Local Development (HTTP)

Over HTTP, mTLS isn't possible. The SDK falls back to `X-SSL-Client-Cert` header with the PEM cert. TideCloak's `TideMtlsAuthenticator` accepts this for HTTP connections.

---

## API Reference

### `TideDelegation`

```ts
new TideDelegation(config: DelegationConfig)
```

| Config | Type | Required | Description |
|--------|------|----------|-------------|
| `tidecloakUrl` | `string` | Yes | TideCloak server URL |
| `realm` | `string` | Yes | Realm name |
| `clientId` | `string` | Yes | Browser client ID (public) |
| `serverClientId` | `string` | No | Server client ID (for token exchange) |
| `adapterJsonPath` | `string` | No | Path to tidecloak.json |
| `serverIdentity` | `ServerIdentity` | No | Manual server identity |
| `privateKey` | `string` | No | PEM private key (if not using vault) |
| `fetch` | `typeof fetch` | No | Custom fetch implementation |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `init(doken?, keyDir?)` | `Promise<void>` | Initialize vault-backed keys and request cert |
| `requireDelegation()` | Express middleware | Exchanges delegation or uses cache, attaches `req.delegation` |
| `exchange(params)` | `Promise<DelegationResult>` | Low-level: exchange artifacts via mTLS |
| `isMtlsEnabled()` | `boolean` | Check if mTLS is ready |
| `getCertThumbprint()` | `string \| null` | Server cert SHA-256 thumbprint |

---

## Chain of Trust

```
VVK (root of trust, threshold-shared on ORK network)
 ├─ signs server X.509 certificate (admin quorum approved)
 └─ signs delegation token (T-of-N EdDSA via DelegationToken:1)

Browser DPoP Key
 ├─ bound to user token via cnf.jkt
 └─ signs delegation request (authorizing server cert via cnf.x5t#S256)

Server Certificate
 ├─ proves server identity via mTLS
 └─ bound to delegation token via cnf.x5t#S256
```

Validated at three layers:
1. **TideMtlsAuthenticator** (TideCloak) — verifies VVK-signed cert, maps SPIFFE ID to client
2. **TideChainOfTrustExchangeProvider** (TideCloak) — validates HOP 1 + HOP 2
3. **DelegationTokenSignRequest** (ORK) — re-validates chain, checks VRK auth, signs token

---

## Requirements

- Node.js 18+
- TideCloak with `TideMtlsAuthenticator` and `TideChainOfTrustExchangeProvider` enabled
- `tide-vendor-key` component with `DelegationToken:1` in the VRK model list
- `@tidecloak/js` on the client with `IAMService.signDelegationRequest()`
- An `authenticate` middleware that sets `req.accessToken`

---

## Troubleshooting

**"Delegation required — include X-Delegation-Request header"**

The client is calling a `requireDelegation()` endpoint without the `X-Delegation-Request` header. Use `adminFetch` (or equivalent) that calls `IAMService.signDelegationRequest()` and attaches the header.

**"No server certificate configured"**

`init()` wasn't called, or the cert hasn't been approved, or the adapter JSON doesn't contain `serverIdentity`.

**"mTLS not configured"**

The vault blob couldn't be decrypted or the adapter JSON has no `serverIdentity`. Check Tide Vault connectivity and cert approval status.

**"Delegation exchange failed"**

Check that TideCloak has `TideMtlsAuthenticator` in the client auth flow and `DelegationToken:1` in the VRK model list.
