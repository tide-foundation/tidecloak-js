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

### 1. Install

```bash
npm install @tidecloak/react
```

### 2. Set Up Your Config

```tsx
// tidecloakConfig.ts
export const hybridConfig = {
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

### 3. Create a Login Page

```tsx
// LoginPage.tsx
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IAMService } from '@tidecloak/js';
import { hybridConfig } from './tidecloakConfig';

export function LoginPage() {
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const returnUrl = new URLSearchParams(location.search).get('return') || '/';

  useEffect(() => {
    IAMService.loadConfig(hybridConfig).then(() => setReady(true));
  }, []);

  return (
    <div>
      <h1>Welcome</h1>
      <button disabled={!ready} onClick={() => IAMService.doLogin(returnUrl)}>
        Log in with TideCloak
      </button>
    </div>
  );
}
```

### 4. Handle the Callback

After login, TideCloak redirects back with an authorization code. The SDK sends this to your backend.

**Option A: Use the hook**

```tsx
// CallbackPage.tsx
import { useNavigate } from 'react-router-dom';
import { useAuthCallback } from '@tidecloak/react';

export function CallbackPage() {
  const navigate = useNavigate();

  const { isProcessing, error } = useAuthCallback({
    onSuccess: (returnUrl) => navigate(returnUrl || '/'),
    onError: (err) => console.error('Login failed:', err),
    onMissingVerifierRedirectTo: '/login',  // If page was refreshed
  });

  if (isProcessing) return <p>Logging in...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return null;
}
```

**Option B: Use the component**

```tsx
import { AuthCallback } from '@tidecloak/react';

export function CallbackPage() {
  const navigate = useNavigate();

  return (
    <AuthCallback
      onSuccess={(returnUrl) => navigate(returnUrl || '/')}
      onError={(err) => console.error(err)}
      onMissingVerifierRedirectTo="/login"
      loadingComponent={<p>Logging in...</p>}
      errorComponent={({ error }) => <p>Error: {error.message}</p>}
    />
  );
}
```

**Option C: Simplest auto-redirect**

```tsx
import { SimpleAuthCallback } from '@tidecloak/react';

// In your routes
<Route path="/auth/callback" element={
  <SimpleAuthCallback
    defaultRedirect="/"
    loginPage="/login"
    loadingComponent={<p>Logging in...</p>}
  />
} />
```

### 5. Build Your Backend Endpoint

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

```ts
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

## What's Available

### useAuthCallback Hook

```tsx
const {
  isCallback,       // Is this a callback page?
  isProcessing,     // Currently processing?
  isSuccess,        // Did auth succeed?
  error,            // Error if failed
  returnUrl,        // Where to redirect after
  code,             // Auth code from TideCloak
  processCallback,  // Manually trigger processing
} = useAuthCallback({
  autoProcess: true,                      // Process automatically (default)
  onSuccess: (returnUrl) => {},           // Called on success
  onError: (error) => {},                 // Called on error
  onMissingVerifierRedirectTo: '/login',  // Redirect if PKCE verifier missing
});
```

### parseCallbackUrl

```tsx
import { parseCallbackUrl } from '@tidecloak/react';

const { code, error, errorDescription } = parseCallbackUrl();
```

---

## What You Can't Do (Client-Side)

Since tokens are on your server, these won't work in the browser:

- `getToken()`, `getIDToken()`
- `hasRealmRole()`, `hasClientRole()`
- `getValueFromToken()`, `getValueFromIdToken()`
- `doEncrypt()`, `doDecrypt()`

Instead, your backend should:
- Provide user info via your own API endpoints
- Handle encryption server-side
- Check roles when processing requests

---

## Checking Auth Status

On the client, you can check if the user completed the login flow:

```tsx
import { IAMService } from '@tidecloak/js';

// Did user complete login?
const loggedIn = IAMService.isLoggedIn();

// Where did user want to go?
const returnUrl = IAMService.getReturnUrl();
```

But for actual user info, call your backend:

```tsx
// Your backend returns user info from the session
const response = await fetch('/api/me');
const user = await response.json();
```

---

## Front-Channel vs Hybrid

| Question | Front-Channel | Hybrid |
|----------|---------------|--------|
| Where are tokens? | Browser | Server |
| Can I use `doEncrypt()`? | Yes | No (do it server-side) |
| Can I check roles client-side? | Yes | No (check on server) |
| Is it simpler? | Yes | No |
| Is it more secure? | Good | Better |

**Use Front-Channel if:**
- You're building a simple SPA
- You need client-side encryption
- You want the easiest setup

**Use Hybrid if:**
- Security is critical
- You don't trust the browser with tokens
- Your backend makes API calls on behalf of users

---

## Troubleshooting

**Callback fails with "PKCE verifier missing"**

The user probably refreshed the callback page. Use `onMissingVerifierRedirectTo` to send them back to login.

**Backend token exchange fails**

Check that your `redirect_uri` matches exactly what's registered in TideCloak.

**Session not persisting**

Make sure your backend is setting cookies correctly and they're not being blocked by CORS or same-site policies.
