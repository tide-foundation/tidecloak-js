# TideCloak React SDK

Add TideCloak authentication to your React app.

```bash
npm install @tidecloak/react
```

---

## Getting Started

Follow the [setup guide](docs/FRONT_CHANNEL.md) for a React web app or SPA.

---

## Requirements

- React 18+
- A TideCloak server ([setup guide](https://github.com/tide-foundation/tidecloak-gettingstarted))
- A registered client in your TideCloak realm

---

## Security defaults

**DPoP (sender-constrained tokens) is opt-in.** By default the SDK requests a plain, unbound access token. To turn DPoP on, pass `dpopConfig` in the provider `config`: `{ mode: "auto" }` (use DPoP only when the realm supports it) or `{ mode: "strict" }` (require it). Only do so if every call carrying the token attaches a `DPoP:` proof, because a bound token sent as a plain `Bearer` is rejected with a `401`. See the [`@tidecloak/js` DPoP docs](https://github.com/tide-foundation/tidecloak-js/blob/main/packages/tidecloak-js/docs/FRONT_CHANNEL.md#dpop-opt-in).
