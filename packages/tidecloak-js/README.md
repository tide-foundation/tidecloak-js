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

`@tidecloak/js/policy-react` and `@tidecloak/js/policy.css` are deprecated. The policy editor has moved out of this package; the components exported there now throw when rendered and the stylesheet is empty. They remain only so existing imports keep resolving.
