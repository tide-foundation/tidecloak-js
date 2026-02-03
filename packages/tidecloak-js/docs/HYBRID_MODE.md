# Hybrid/BFF Mode

For apps where security is critical. Your backend handles tokens - they never touch the browser.

---

## What You'll Build

User clicks login, goes to TideCloak, logs in, comes back. But instead of tokens going to the browser, they go to your server. Your server creates a session, and the browser just gets a session cookie.

---

## When to Use This

- You're handling sensitive data (financial, medical, etc.)
- You don't want tokens in the browser at all
- Your backend needs to make API calls on behalf of users
- You need server-side session control

---

## Quick Start

### 1. Set Up Your Config

```js
const hybridConfig = {
  authMode: "hybrid",
  oidc: {
    authorizationEndpoint: "https://auth.example.com/realms/myrealm/protocol/openid-connect/auth",
    clientId: "my-app",
    redirectUri: "https://myapp.com/auth/callback",
    scope: "openid profile email"
  },
  tokenExchange: {
    endpoint: "/api/authenticate"  // Your backend will handle this
  }
};
```

### 2. Login Page

```js
import { IAMService } from "@tidecloak/js";

await IAMService.loadConfig(hybridConfig);

document.getElementById("login-btn").onclick = () => {
  IAMService.doLogin("/dashboard");  // Where to go after login
};
```

### 3. Callback Page

```js
import { IAMService } from "@tidecloak/js";

const loggedIn = await IAMService.initIAM(hybridConfig);

if (loggedIn) {
  // Success - redirect to where user wanted to go
  window.location.href = IAMService.getReturnUrl() || "/";
} else {
  // Failed
  document.getElementById("error").textContent = "Login failed";
}
```

### 4. Build Your Backend Endpoint

Your `/api/authenticate` endpoint receives:

```json
{
  "accessToken": "{\"code\":\"AUTH_CODE\",\"code_verifier\":\"PKCE_VERIFIER\",\"redirect_uri\":\"...\"}",
  "provider": "tidecloak-auth"
}
```

Your backend should:
1. Parse the JSON in `accessToken`
2. Exchange the code with TideCloak
3. Store tokens server-side
4. Create a session for the user

**Express.js example:**

```js
app.post('/api/authenticate', async (req, res) => {
  const authData = JSON.parse(req.body.accessToken);

  // Exchange code for tokens
  const tokenResponse = await fetch(
    'https://auth.example.com/realms/myrealm/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'my-app',
        code: authData.code,
        code_verifier: authData.code_verifier,
        redirect_uri: authData.redirect_uri,
      }),
    }
  );

  if (!tokenResponse.ok) {
    return res.status(401).json({ error: 'Token exchange failed' });
  }

  const tokens = await tokenResponse.json();

  // Store tokens and create session
  req.session.tokens = tokens;
  req.session.userId = tokens.sub;

  res.json({ success: true });
});
```

---

## What You Can Do (Client-Side)

Since tokens are on your server, most methods won't work in the browser. You can use:

```js
// Did user complete login?
IAMService.isLoggedIn();

// Where did user want to go?
IAMService.getReturnUrl();
```

---

## What You Can't Do (Client-Side)

These won't work because tokens are on your server:

- `getToken()`, `getIDToken()`
- `getName()`, `hasRealmRole()`, `hasClientRole()`
- `getValueFromToken()`, `getValueFromIdToken()`
- `doEncrypt()`, `doDecrypt()`

Your backend should provide user info via your own API endpoints.

---

## Front-Channel vs Hybrid

| Question | Front-Channel | Hybrid |
|----------|---------------|--------|
| Where are tokens? | Browser | Server |
| Can I use encryption client-side? | Yes | No |
| Can I check roles client-side? | Yes | No |
| Is it simpler? | Yes | No |
| Is it more secure? | Good | Better |

**Use Front-Channel if:**
- You're building a simple web app
- You need client-side encryption
- You want the easiest setup

**Use Hybrid if:**
- Security is critical
- You don't trust the browser with tokens
- Your backend makes API calls on behalf of users

---

## Troubleshooting

**Callback fails**

Check that your `redirect_uri` matches exactly what's registered in TideCloak.

**Session not persisting**

Make sure your backend is setting cookies correctly and they're not being blocked by CORS or same-site policies.

**Backend token exchange fails**

Double-check your TideCloak token endpoint URL and client ID.
