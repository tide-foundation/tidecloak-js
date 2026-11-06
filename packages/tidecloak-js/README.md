# TideCloak JavaScript SDK

Add TideCloak authentication to any JavaScript app.

```bash
npm install @tidecloak/js
```

---

## Getting Started

Follow the [setup guide](docs/FRONT_CHANNEL.md) for a web app or SPA.

---

## Requirements

- A TideCloak server ([setup guide](https://github.com/tide-foundation/tidecloak-gettingstarted))
- A registered client in your TideCloak realm

---

## Low-level client

`TideCloak` (the keycloak-js based client that `IAMService` wraps) is documented in [lib/README.md](lib/README.md).

---

## Deprecated

`@tidecloak/js/policy.css` is deprecated. The policy editor has moved out of this package and the stylesheet is empty. It remains only so existing imports keep resolving.
