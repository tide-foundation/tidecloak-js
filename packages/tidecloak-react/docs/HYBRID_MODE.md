# Hybrid/BFF Mode (React)

For React apps that need extra security. Your backend handles tokens instead of the browser.

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
- Apps that need server-side session control

---

## Setup

### 1. Config

```tsx
const hybridConfig = {
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

```tsx
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IAMService } from '@tidecloak/js';

const hybridConfig = { /* ... */ };

export function LoginPage() {
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const returnUrl = new URLSearchParams(location.search).get('return') || '/';

  useEffect(() => {
    IAMService.loadConfig(hybridConfig).then(() => setReady(true));
  }, []);

  return (
    <button disabled={!ready} onClick={() => IAMService.doLogin(returnUrl)}>
      Login with TideCloak
    </button>
  );
}
```

### 3. Callback Page (Using Hook)

The easiest way to handle the callback is with the `useAuthCallback` hook:

```tsx
import { useNavigate } from 'react-router-dom';
import { useAuthCallback } from '@tidecloak/react';

export function CallbackPage() {
  const navigate = useNavigate();

  const { isProcessing, error } = useAuthCallback({
    onSuccess: (returnUrl) => navigate(returnUrl || '/'),
    onError: (err) => console.error('Auth failed:', err),
    onMissingVerifierRedirectTo: '/login', // If page was refreshed
  });

  if (isProcessing) return <div>Logging in...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return null;
}
```

### 3b. Callback Page (Using Component)

Or use the `AuthCallback` component for even simpler setup:

```tsx
import { useNavigate } from 'react-router-dom';
import { AuthCallback } from '@tidecloak/react';

export function CallbackPage() {
  const navigate = useNavigate();

  return (
    <AuthCallback
      onSuccess={(returnUrl) => navigate(returnUrl || '/')}
      onError={(err) => console.error(err)}
      onMissingVerifierRedirectTo="/login"
      loadingComponent={<div>Logging in...</div>}
      errorComponent={({ error }) => <div>Error: {error.message}</div>}
    />
  );
}
```

### 3c. Simple Auto-Redirect Callback

For the simplest case, use `SimpleAuthCallback`:

```tsx
import { SimpleAuthCallback } from '@tidecloak/react';

// In your routes
<Route path="/auth/callback" element={
  <SimpleAuthCallback
    defaultRedirect="/"
    loginPage="/login"
    loadingComponent={<div>Logging in...</div>}
  />
} />
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

## Backend Token Exchange Example

```ts
// Express.js example
app.post('/api/authenticate', async (req, res) => {
  const authData = JSON.parse(req.body.accessToken);

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

  // Store tokens server-side and create session
  req.session.tokens = tokens;
  req.session.userId = tokens.sub;

  res.json({ success: true });
});
```

---

## Available Utilities

Import from `@tidecloak/react`:

| Export | Description |
|--------|-------------|
| `useAuthCallback(options)` | Hook for handling OAuth callbacks |
| `parseCallbackUrl()` | Parse callback data from URL |
| `AuthCallback` | Component for callback pages with loading/error states |
| `SimpleAuthCallback` | Auto-redirect callback component |

### useAuthCallback Options

```tsx
const { isCallback, isProcessing, isSuccess, error, returnUrl, processCallback } = useAuthCallback({
  autoProcess: true,                    // Auto-process on mount (default: true)
  onSuccess: (returnUrl) => {},         // Called on success
  onError: (error) => {},               // Called on error
  onMissingVerifierRedirectTo: '/login' // Redirect if PKCE verifier missing
});
```

### useAuthCallback Return Values

| Value | Type | Description |
|-------|------|-------------|
| `isCallback` | `boolean` | True if this is a callback page |
| `isProcessing` | `boolean` | True while processing |
| `isSuccess` | `boolean` | True if auth succeeded |
| `error` | `Error \| null` | Error if auth failed |
| `returnUrl` | `string \| null` | URL to redirect to after auth |
| `code` | `string \| null` | Authorization code from IdP |
| `idpError` | `string \| null` | Error code from IdP |
| `processCallback` | `() => Promise<void>` | Manually trigger processing |

---

## Limitations

In hybrid mode, tokens are on your server, so these client-side methods won't work:

- `getToken()`, `getIDToken()`
- `getName()`, `hasRealmRole()`, `hasClientRole()`
- `getValueFromToken()`, `getValueFromIDToken()`
- `doEncrypt()`, `doDecrypt()`

Use these instead:
- `isLoggedIn()` - Check if user completed login flow
- `getReturnUrl()` - Get the page user wanted to visit

Your backend should provide user info via your own API.

---

## When to Use Hybrid vs Front-channel

| Scenario | Mode |
|----------|------|
| Need tokens in browser for client-side API calls | Front-channel |
| Tokens should never be in browser | Hybrid |
| Server needs to make API calls on behalf of user | Hybrid |
| Simple SPA with public API | Front-channel |
| Sensitive data, high security requirements | Hybrid |
