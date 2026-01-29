# TideCloak Next.js SDK

Add TideCloak authentication to your Next.js app.

```bash
npm install @tidecloak/nextjs
```

> New to TideCloak? Use our [Next.js template](../tidecloak-create-nextjs/README.md) to get started quickly.

---

## Choose Your Mode

| I'm building... | Use this mode |
|-----------------|---------------|
| A standard Next.js app | [Front-channel](docs/FRONT_CHANNEL.md) |
| A secure app where tokens should stay on my server | [Hybrid/BFF](docs/HYBRID_MODE.md) |

---

## Quick Comparison

| | Front-channel | Hybrid/BFF |
|---|---|---|
| Tokens stored in | Browser | Server (API routes) |
| Best for | Simple apps | High-security apps |
| Setup complexity | Easy | Medium |
| Client-side token access | Yes | No |
| Edge middleware | Yes | Yes |

---

## Requirements

- Next.js 13.4+ (App Router) or Next.js 12+ (Pages Router)
- React 18+
- A TideCloak server ([setup guide](https://github.com/tide-foundation/tidecloak-gettingstarted))
- A registered client in your TideCloak realm

---

## What's Included

- `<TideCloakProvider>` - Application-level context
- `useTideCloak()` - Hook for auth state and actions
- `<Authenticated>` / `<Unauthenticated>` - UI guards
- `createTideCloakMiddleware()` - Edge middleware for route protection
- `verifyTideCloakToken()` - Server-side JWT verification
- `doEncrypt()` / `doDecrypt()` - Tag-based encryption

---

## Mode-Specific Guides

- **[Front-channel Mode](docs/FRONT_CHANNEL.md)** - Standard Next.js apps
- **[Hybrid/BFF Mode](docs/HYBRID_MODE.md)** - Server-side token handling with API routes
