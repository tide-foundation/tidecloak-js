# Hybrid/BFF Mode (Next.js)

For Next.js apps that need extra security. Tokens stay on your server, not in the browser.

Next.js is ideal for hybrid mode because you can use API routes to handle the token exchange.

---

## How It Works

1. User clicks "Login"
2. Browser redirects to TideCloak login page
3. User logs in
4. TideCloak redirects back with an authorization code
5. Your **Next.js API route** exchanges the code for tokens
6. API route creates a session (e.g., HTTP-only cookie)
7. Tokens stay on your server, not in the browser

---

## When to Use This

- Apps with sensitive data
- When you don't want tokens in the browser
- Apps that need server-side session control
- When you want to use Next.js API routes for auth

---

## Setup

### 1. Config

Create your hybrid config:

```ts
// lib/tidecloakConfig.ts
export const hybridConfig = {
  authMode: "hybrid",
  oidc: {
    authorizationEndpoint: "https://auth.example.com/realms/myrealm/protocol/openid-connect/auth",
    clientId: "my-app",
    redirectUri: "https://myapp.com/auth/callback",
    scope: "openid profile email"
  },
  tokenExchange: {
    endpoint: "/api/auth/callback"  // Your Next.js API route
  }
};
```

### 2. Login Page

**App Router:** `app/login/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IAMService } from '@tidecloak/js';
import { hybridConfig } from '@/lib/tidecloakConfig';

export default function LoginPage() {
  const [ready, setReady] = useState(false);
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('return') || '/dashboard';

  useEffect(() => {
    IAMService.loadConfig(hybridConfig).then(() => setReady(true));
  }, []);

  return (
    <div>
      <h1>Login</h1>
      <button
        disabled={!ready}
        onClick={() => IAMService.doLogin(returnUrl)}
      >
        Login with TideCloak
      </button>
    </div>
  );
}
```

### 3. Callback Page

**App Router:** `app/auth/callback/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IAMService } from '@tidecloak/js';
import { hybridConfig } from '@/lib/tidecloakConfig';

export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    IAMService.initIAM(hybridConfig)
      .then(authenticated => {
        if (authenticated) {
          const returnUrl = IAMService.getReturnUrl() || '/dashboard';
          router.push(returnUrl);
        } else {
          setError('Login failed');
        }
      })
      .catch(err => setError(err.message));
  }, [router]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return <div>Logging in...</div>;
}
```

### 4. API Route (Token Exchange)

**App Router:** `app/api/auth/callback/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  parseAuthCodeData,
  setSessionCookie
} from '@tidecloak/nextjs/server';
import { createSession } from '@/lib/sessionStore';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const authData = parseAuthCodeData(body);

  if (!authData) {
    return NextResponse.json({ error: 'Invalid auth data' }, { status: 400 });
  }

  const result = await exchangeCodeForTokens({
    authServerUrl: process.env.TIDECLOAK_URL!,
    realm: process.env.TIDECLOAK_REALM!,
    clientId: process.env.TIDECLOAK_CLIENT_ID!,
  }, authData);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // Store tokens server-side and create session
  const sessionId = createSession(result.tokens);

  const response = NextResponse.json({ success: true });
  setSessionCookie(response, sessionId, { maxAge: result.tokens.expires_in });

  return response;
}
```

---

## Full Example with Session Management

### Session Store

```ts
// lib/sessionStore.ts
import type { TokenResponse } from '@tidecloak/nextjs/server';

interface Session {
  tokens: TokenResponse;
  userId: string;
}

const sessions = new Map<string, Session>();

export function createSession(tokens: TokenResponse): string {
  const sessionId = crypto.randomUUID();
  // Decode user ID from access token (it's a JWT)
  const payload = JSON.parse(atob(tokens.access_token.split('.')[1]));
  sessions.set(sessionId, { tokens, userId: payload.sub });
  return sessionId;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function updateSession(sessionId: string, tokens: TokenResponse): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.tokens = tokens;
  }
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
```

### API Route with Session

```ts
// app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  parseAuthCodeData,
  setSessionCookie
} from '@tidecloak/nextjs/server';
import { createSession } from '@/lib/sessionStore';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const authData = parseAuthCodeData(body);

  if (!authData) {
    return NextResponse.json({ error: 'Invalid auth data' }, { status: 400 });
  }

  const result = await exchangeCodeForTokens({
    authServerUrl: process.env.TIDECLOAK_URL!,
    realm: process.env.TIDECLOAK_REALM!,
    clientId: process.env.TIDECLOAK_CLIENT_ID!,
  }, authData);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const sessionId = createSession(result.tokens);

  const response = NextResponse.json({ success: true });
  setSessionCookie(response, sessionId, { maxAge: 60 * 60 * 24 });

  return response;
}
```

### Protected API Route

```ts
// app/api/user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@tidecloak/nextjs/server';
import { getSession } from '@/lib/sessionStore';

export async function GET(req: NextRequest) {
  const sessionId = getSessionFromRequest(req);

  if (!sessionId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  // Use server-side tokens for API calls
  const userInfo = await fetch(
    `${process.env.TIDECLOAK_URL}/realms/${process.env.TIDECLOAK_REALM}/protocol/openid-connect/userinfo`,
    {
      headers: { Authorization: `Bearer ${session.tokens.access_token}` },
    }
  );

  return NextResponse.json(await userInfo.json());
}
```

### Token Refresh

```ts
// app/api/auth/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  refreshAccessToken,
  getSessionFromRequest,
  setSessionCookie
} from '@tidecloak/nextjs/server';
import { getSession, updateSession } from '@/lib/sessionStore';

export async function POST(req: NextRequest) {
  const sessionId = getSessionFromRequest(req);

  if (!sessionId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = getSession(sessionId);
  if (!session?.tokens.refresh_token) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const result = await refreshAccessToken({
    authServerUrl: process.env.TIDECLOAK_URL!,
    realm: process.env.TIDECLOAK_REALM!,
    clientId: process.env.TIDECLOAK_CLIENT_ID!,
  }, session.tokens.refresh_token);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  updateSession(sessionId, result.tokens);

  const response = NextResponse.json({ success: true });
  setSessionCookie(response, sessionId, { maxAge: result.tokens.expires_in });

  return response;
}
```

### Logout

```ts
// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, clearSessionCookie } from '@tidecloak/nextjs/server';
import { deleteSession } from '@/lib/sessionStore';

export async function POST(req: NextRequest) {
  const sessionId = getSessionFromRequest(req);

  if (sessionId) {
    deleteSession(sessionId);
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);

  return response;
}
```

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

Your API routes should provide user info to the client.

---

## Server Utilities

Import from `@tidecloak/nextjs/server`:

| Function | Description |
|----------|-------------|
| `exchangeCodeForTokens(config, authData)` | Exchange authorization code for tokens |
| `refreshAccessToken(config, refreshToken)` | Refresh an expired access token |
| `parseAuthCodeData(body)` | Parse auth code data from request body |
| `setSessionCookie(response, sessionId, options?)` | Set HTTP-only session cookie |
| `getSessionFromRequest(req, cookieName?)` | Get session ID from request cookies |
| `clearSessionCookie(response, cookieName?)` | Clear session cookie |
| `verifyTideCloakToken(config, token, roles?)` | Verify JWT and check roles |
| `createTideCloakMiddleware(options)` | Create Edge middleware for route protection |

---

## When to Use Hybrid vs Front-channel

| Scenario | Mode |
|----------|------|
| Need tokens in browser for client-side API calls | Front-channel |
| Tokens should never be in browser | Hybrid |
| Server needs to make API calls on behalf of user | Hybrid |
| Simple SPA with public API | Front-channel |
| Sensitive data, high security requirements | Hybrid |
