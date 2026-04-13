# TideCloak Server SDK

Server-side SDK for TideCloak backend operations. Currently provides delegation exchange for making TideCloak API calls on behalf of authenticated users without exposing tokens to the browser.

```bash
npm install @tidecloak/server
```

---

## What This Does

Your app server needs to call TideCloak's admin API (manage users, roles, etc.), but the user's token is DPoP-bound to the browser's key - your server can't use it directly. This package handles the delegation exchange: the browser authorizes your server's key, TideCloak issues a delegation token bound to your server, and your server uses it for admin calls.

---

## Quick Start

### 1. Set Up Delegation

```js
import { TideDelegation } from '@tidecloak/server';

const delegation = new TideDelegation({
  tidecloakUrl: 'https://auth.example.com',
  realm: 'myrealm',
  clientId: 'my-app',
});
```

### 2. Wire Up Express Routes

```js
// Delegation exchange endpoint - browser POSTs signed artifacts here
app.post('/api/delegation', authenticate, delegation.handleDelegation());

// Protected admin routes - delegation happens automatically
app.get('/api/admin/users',
  authenticate,
  delegation.requireDelegation(),
  async (req, res) => {
    const users = await req.delegation.fetch(
      `${tidecloakUrl}/admin/realms/${realm}/users`
    );
    res.json(users);
  }
);
```

### 3. Set Up the Browser

```js
import { createTideFetch } from '@tidecloak/js';

// Wrap your fetch - handles delegation automatically
const fetch = createTideFetch(window.fetch);

// Just use it - the 419 interrupt is invisible to your code
const users = await fetch('/api/admin/users');
```

That's it. The SDK handles the rest.

---

## How It Works

1. Browser calls your admin endpoint
2. Server has no delegation token → responds with **419** and a challenge
3. `createTideFetch` intercepts the 419, asks the browser to sign the challenge
4. Browser signs a delegation request with its DPoP key and gets a DPoP approval from the ORK enclave
5. Browser POSTs the signed artifacts to `/api/delegation`
6. Server exchanges them with TideCloak for a delegation token
7. Server caches the delegation token and responds
8. `createTideFetch` retries the original request - this time it succeeds
9. Subsequent requests use the cached token (no more 419s until it expires)

All of this is invisible to your application code.

---

## Scoped Delegation

By default, the delegation token gets all of the user's roles. You can restrict it:

```js
// Only realm:admin role, only "read" for my-app client
app.get('/api/admin/users',
  authenticate,
  delegation.requireDelegation({
    roles: {
      realm: ['admin'],
      clients: { 'my-app': ['read'] }
    }
  }),
  handler
);
```

**Rules:**
- If `roles` is omitted → all user roles included
- If `roles` is specified → only listed roles/clients appear in the token
- Unlisted realms or clients are stripped entirely
- You can never escalate - requesting a role the user doesn't have silently drops it

### Examples

```js
// All roles (default)
delegation.requireDelegation()

// Only client roles for my-app
delegation.requireDelegation({
  roles: { clients: { 'my-app': ['read', 'write'] } }
})

// Only realm roles, no client roles
delegation.requireDelegation({
  roles: { realm: ['admin', 'user'] }
})

// Multiple clients
delegation.requireDelegation({
  roles: {
    realm: ['admin'],
    clients: {
      'my-app': ['read'],
      'other-app': ['view', 'edit']
    }
  }
})
```

---

## Using `req.delegation.fetch()`

Once delegation succeeds, `req.delegation.fetch()` is available on the request. It handles DPoP proof generation and authorization headers automatically.

```js
// GET
const users = await req.delegation.fetch(url);

// POST with JSON body
const result = await req.delegation.fetch(url, {
  method: 'POST',
  body: { name: 'New Role' }
});

// PUT
await req.delegation.fetch(url, {
  method: 'PUT',
  body: { enabled: true }
});

// DELETE
await req.delegation.fetch(url, { method: 'DELETE' });

// POST with FormData
await req.delegation.fetch(url, {
  method: 'POST',
  formData: myFormData
});
```

---

## API Reference

### `TideDelegation`

```ts
new TideDelegation(config: DelegationConfig)
```

| Config | Type | Description |
|--------|------|-------------|
| `tidecloakUrl` | `string` | TideCloak server URL |
| `realm` | `string` | Realm name |
| `clientId` | `string` | Client ID registered in TideCloak |
| `fetch` | `typeof fetch` | Optional custom fetch implementation |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `requireDelegation(options?)` | Express middleware | Returns 419 challenge or attaches `req.delegation` |
| `handleDelegation()` | Express middleware | Handles POST with signed delegation artifacts |
| `exchange(params)` | `Promise<DelegationResult>` | Low-level: exchange artifacts for a delegation token |
| `generateDpopProof(method, url, accessToken?)` | `string` | Low-level: generate a DPoP proof JWT |
| `packRequest(request)` | `PackedDelegationRequest` | Low-level: create a delegation challenge |

### `requireDelegation` Options

```ts
delegation.requireDelegation({
  roles: {
    realm: ['role1', 'role2'],        // Optional: filter realm roles
    clients: {                         // Optional: filter per-client roles
      'client-id': ['role1', 'role2']
    }
  }
})
```

---

## Requirements

- Node.js 18+ (uses native `crypto` for Ed25519)
- A TideCloak server with the Tide chain-of-trust authenticator enabled
- `@tidecloak/js` on the client side with `createTideFetch`
- An `authenticate` middleware that sets `req.accessToken` from the Authorization header

---

## Troubleshooting

**419 responses in the browser console**

This is expected. The 419 is the delegation challenge - `createTideFetch` handles it automatically. If you see repeated 419s, check that `/api/delegation` is wired up correctly.

**"No pending delegation challenge for this session"**

The server received a delegation POST but has no pending key for this user's session. This happens if the server restarted between the 419 and the delegation POST, or if the pending key expired (60s timeout). The browser will retry automatically.

**"Delegation exchange failed"**

Check that your TideCloak server has the `tide-chain-of-trust` client authenticator in the client authentication flow, and that the realm has a `tide-vendor-key` component with `DelegationToken:1` in the VRK model list.

**Token has wrong roles**

If using scoped delegation, remember that once `roles` is specified, everything not listed is excluded. Omit `roles` entirely for full permissions.
