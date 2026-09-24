# TideCloak Next.js SDK

Add TideCloak authentication to your Next.js app.

```bash
npm install @tidecloak/nextjs
```

> New to TideCloak? Use our [Next.js template](https://github.com/tide-foundation/tidecloak-js/blob/main/packages/tidecloak-create-nextjs/README.md) to get started quickly.

---

## Requirements

- Next.js 13.5+ (App Router or Pages Router)
- React 18+
- A TideCloak server ([setup guide](https://github.com/tide-foundation/tidecloak-gettingstarted))
- A registered client in your TideCloak realm

---

## What's Included

- `<TideCloakProvider>` - Application-level context
- `useTideCloak()` - Hook for auth state and actions
- `<Authenticated>` / `<Unauthenticated>` - UI guards
- `createTideCloakProxy()` - Route protection in `proxy.ts` (Next.js 16+)
- `createTideCloakMiddleware()` - Route protection in `middleware.ts` (Next.js 13.5 to 15)
- `verifyTideCloakToken()` - Server-side JWT verification
- `doEncrypt()` / `doDecrypt()` - Tag-based encryption

> **DPoP is opt-in** (sender-constrained tokens). By default you get a plain, unbound access token. Pass `dpopConfig: { mode: "auto" }` or `{ mode: "strict" }` in your provider config to turn it on. See the [`@tidecloak/js` DPoP docs](https://github.com/tide-foundation/tidecloak-js/blob/main/packages/tidecloak-js/docs/FRONT_CHANNEL.md#dpop-opt-in).

---

## Guides

- **[Front-channel Mode](docs/FRONT_CHANNEL.md)** - Standard Next.js apps
