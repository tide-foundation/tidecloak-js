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
| An app where my server needs to call TideCloak admin APIs | [Delegation](docs/DELEGATION.md) |

---

## Quick Comparison

| | Front-channel | Hybrid/BFF | Native | Delegation |
|---|---|---|---|---|
| Tokens stored in | Browser | Server | App (secure storage) | Server (delegation token) |
| Best for | Simple web apps | High-security apps | Desktop/mobile apps | Server-side admin calls |
| Setup complexity | Easy | Medium | Medium | Medium |
| Works offline | No | No | Yes | No |

---

## Requirements

- A TideCloak server ([setup guide](https://github.com/tide-foundation/tidecloak-gettingstarted))
- A registered client in your TideCloak realm
