# Server-Side Delegation

For apps where your backend needs to call TideCloak's admin API on behalf of authenticated users.

---

## What You'll Build

User logs in normally via front-channel. When your server needs to make admin calls (manage users, roles, etc.), it can't use the user's token — it's DPoP-bound to the browser's key. Instead, the browser authorizes your server's ephemeral key, TideCloak issues a delegation token bound to that key, and your server uses it. All of this happens automatically via `createTideFetch`.

---

## When to Use This

- Your server needs to call TideCloak admin APIs
- You want server-side role management, user management, or access approvals
- You need the security of DPoP (proof-of-possession) on both browser and server

---

## Quick Start

### 1. Install

```bash
npm install @tidecloak/js        # Client-side
npm install @tidecloak/server    # Server-side
```

### 2. Client-Side: Wrap Your Fetch

```js
import { createTideFetch } from '@tidecloak/js';

// Wrap your app's fetch — delegation is handled automatically
const appFetch = createTideFetch(window.fetch);

// Use it for any server call that might need delegation
const users = await appFetch('/api/admin/users');
const roles = await appFetch('/api/admin/roles');
```

`createTideFetch` intercepts 419 responses, signs the delegation request with the browser's DPoP key, gets a DPoP approval from the ORK enclave, and retries — all invisible to your code.

### 3. Server-Side: Set Up Delegation

```js
import { TideDelegation } from '@tidecloak/server';

const delegation = new TideDelegation({
  tidecloakUrl: process.env.TIDECLOAK_URL,
  realm: process.env.TIDECLOAK_REALM,
  clientId: process.env.TIDECLOAK_CLIENT_ID,
});

// Exchange endpoint
app.post('/api/delegation', authenticate, delegation.handleDelegation());

// Admin routes with automatic delegation
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

---

## How the Interrupt Pattern Works

```
Browser                    Server                   TideCloak
   |                         |                         |
   |-- GET /api/admin/users →|                         |
   |                         |-- no delegation token   |
   |← 419 { challenge } ----|                         |
   |                         |                         |
   |-- sign delegation req   |                         |
   |-- sign DPoP approval    |                         |
   |                         |                         |
   |-- POST /api/delegation →|                         |
   |                         |-- token exchange ------→|
   |                         |←-- delegation token ----|
   |                         |-- cache token           |
   |← { delegated: true } --|                         |
   |                         |                         |
   |-- GET /api/admin/users →|                         |
   |                         |-- use cached token ----→|
   |                         |←-- user list -----------|
   |← [user list] ----------|                         |
```

The browser sees: request → response. The 419 interrupt is handled by `createTideFetch`.

---

## Scoped Delegation

Limit what roles appear in the delegation token:

```js
// Only "read" role for my-app client — no realm roles, no other clients
delegation.requireDelegation({
  roles: {
    clients: { 'my-app': ['read'] }
  }
})

// Realm admin + specific client roles
delegation.requireDelegation({
  roles: {
    realm: ['admin'],
    clients: {
      'my-app': ['read', 'write'],
      'other-app': ['view']
    }
  }
})
```

If `roles` is omitted, the delegation token gets all of the user's roles. Once `roles` is specified, only what's listed is included — everything else is stripped.

---

## `createTideFetch` Options

```js
const appFetch = createTideFetch(baseFetch, {
  delegationEndpoint: '/api/delegation',  // Default
  maxRetries: 1,                          // Default
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `delegationEndpoint` | `'/api/delegation'` | Where to POST delegation artifacts |
| `maxRetries` | `1` | Max delegation retries per request |

---

## Front-Channel vs Delegation

| Question | Front-Channel | Delegation |
|----------|---------------|------------|
| Where are admin calls made? | Browser (direct to TideCloak) | Server (via delegation token) |
| Token exposure | Browser has full token | Browser has user token, server gets scoped delegation token |
| DPoP binding | Browser key only | Browser key + server key (two-hop chain of trust) |
| Role scoping | No | Yes — server can request subset of user's roles |
| Best for | Simple apps, client-side encryption | Admin operations, role management, server-side API calls |

---

## Troubleshooting

**Seeing 419 in the browser console**

Normal. The 419 is the delegation challenge. `createTideFetch` handles it. If you see infinite 419 loops, check that `/api/delegation` is wired up and the `authenticate` middleware sets `req.accessToken`.

**"DPoP is not initialized"**

`signDelegationRequest` needs the DPoP provider. Make sure your TideCloak client has DPoP enabled and the user logged in via the standard front-channel flow.

**Delegation token has no roles**

If using scoped delegation with `roles`, everything not listed is excluded. Use `requireDelegation()` without options for full permissions.
