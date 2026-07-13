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

---

## Security defaults

**DPoP (sender-constrained tokens) is opt-in.** By default the SDK requests a plain, unbound access token. To turn DPoP on, pass `useDPoP` in the provider `config`: `{ mode: "auto" }` (use DPoP only when the realm supports it) or `{ mode: "strict" }` (require it). Only do so if every call carrying the token attaches a `DPoP:` proof — a bound token sent as a plain `Bearer` is rejected with a `401`. See the [`@tidecloak/js` DPoP docs](../tidecloak-js/docs/FRONT_CHANNEL.md#dpop-opt-in).
