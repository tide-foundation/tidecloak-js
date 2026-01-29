# Hybrid/BFF Mode

For apps that need extra security. Your backend handles tokens instead of the browser.

---

## How It Works

1. User clicks "Login"
2. Browser redirects to TideCloak login page
3. User logs in
4. TideCloak redirects back with an authorization code
5. Your **backend** exchanges the code for tokens
6. Backend creates a session (e.g., cookie)
7. Tokens stay on your server, not in the browser

---

## When to Use This

- Apps with sensitive data
- When you don't want tokens in the browser
- Server-rendered apps
- Apps that need server-side session control

---

## Setup

### 1. Config

```js
const config = {
  authMode: "hybrid",
  oidc: {
    authorizationEndpoint: "https://auth.example.com/realms/myrealm/protocol/openid-connect/auth",
    clientId: "my-app",
    redirectUri: "https://myapp.com/auth/callback",
    scope: "openid profile email"
  },
  tokenExchange: {
    endpoint: "/api/authenticate"  // Your backend endpoint
  }
};
```

### 2. Login Page

```js
import { IAMService } from "@tidecloak/js";

await IAMService.loadConfig(config);

document.getElementById("login-btn").onclick = () => {
  IAMService.doLogin("/dashboard");  // Where to go after login
};
```

### 3. Callback Page

```js
import { IAMService } from "@tidecloak/js";

const loggedIn = await IAMService.initIAM(config);

if (loggedIn) {
  // Success - go to the page user wanted
  window.location.href = IAMService.getReturnUrl() || "/";
} else {
  // Failed
  document.getElementById("error").textContent = "Login failed";
}
```

### 4. Backend Endpoint

Your `/api/authenticate` endpoint receives:

```json
{
  "accessToken": "{\"code\":\"AUTH_CODE\",\"code_verifier\":\"PKCE_VERIFIER\",\"redirect_uri\":\"...\"}",
  "provider": "tidecloak-auth"
}
```

Your backend should:
1. Parse the JSON in `accessToken`
2. Exchange the code with TideCloak's token endpoint
3. Create a session for the user
4. Return success

---

## Limitations

In hybrid mode, tokens are on your server, so these methods won't work in the browser:

- `getToken()`, `getIDToken()`
- `getName()`, `hasRealmRole()`, `hasClientRole()`
- `getValueFromToken()`, `getValueFromIDToken()`
- `doEncrypt()`, `doDecrypt()`

Use these instead:
- `isLoggedIn()` - Check if user completed login flow
- `getReturnUrl()` - Get the page user wanted to visit

Your backend should provide user info via your own API.
