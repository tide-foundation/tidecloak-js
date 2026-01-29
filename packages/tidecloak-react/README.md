# TideCloak React SDK

Add TideCloak authentication to your React app.

```bash
npm install @tidecloak/react
```

---

## Choose Your Mode

| I'm building... | Use this mode |
|-----------------|---------------|
| A React web app or SPA | [Front-channel](docs/FRONT_CHANNEL.md) |
| A secure app where tokens should stay on my server | [Hybrid/BFF](docs/HYBRID_MODE.md) |
| An Electron, Tauri, or React Native app | [Native](docs/NATIVE_MODE.md) |

---

## Quick Comparison

| | Front-channel | Hybrid/BFF | Native |
|---|---|---|---|
| Tokens stored in | Browser | Server | App (secure storage) |
| Best for | Web apps | High-security apps | Desktop/mobile apps |
| Setup complexity | Easy | Medium | Medium |
| Works offline | No | No | Yes |

---

## Requirements

- React 18+
- A TideCloak server ([setup guide](https://github.com/tide-foundation/tidecloak-gettingstarted))
- A registered client in your TideCloak realm
