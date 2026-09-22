# TideCloak JavaScript SDK

Add TideCloak authentication to any JavaScript app.

```bash
npm install @tidecloak/js
```

---

## Choose Your Mode

| I'm building... | Use this mode |
|-----------------|---------------|
| A web app or SPA `(Standard)` | [Front-channel](docs/FRONT_CHANNEL.md) |
| A secure app where tokens should stay on my server | [Hybrid/BFF](docs/HYBRID_MODE.md) |
| An Electron, Tauri, or React Native app | [Native](docs/NATIVE_MODE.md) |

---

## Quick Comparison

| | Front-channel | Hybrid/BFF | Native |
|---|---|---|---|
| Tokens stored in | Browser | Server | App (secure storage) |
| Best for | Simple web apps | High-security apps | Desktop/mobile apps |
| Setup complexity | Easy | Medium | Medium |
| Works offline | No | No | Yes |

---

## Requirements

- A TideCloak server ([setup guide](https://github.com/tide-foundation/tidecloak-gettingstarted))
- A registered client in your TideCloak realm

---

## Low-level client

`TideCloak` (the keycloak-js based client that `IAMService` wraps) is documented in [lib/README.md](lib/README.md).

---

## Deprecated

`@tidecloak/js/policy-react` and `@tidecloak/js/policy.css` are deprecated. The policy editor has moved out of this package; the components exported there now throw when rendered and the stylesheet is empty. They remain only so existing imports keep resolving.
