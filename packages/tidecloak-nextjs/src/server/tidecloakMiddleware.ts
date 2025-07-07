import { NextRequest, NextResponse } from 'next/server'
import { verifyTideCloakToken } from 'tide-jwt'
import {
  normalizePattern,
  normalizeProtectedRoutes,
  RoutePattern,
  ProtectedRoutesMap
} from './routerMatcher'

/**
 * Configuration options for TideCloak middleware.
 *
 * - `config`: Your Keycloak client adapter JSON.
 * - `publicRoutes`: Optional array of paths to exclude from auth, using globs, regex, or functions.
 * - `protectedRoutes`: Map of path patterns to arrays of required roles.
 * - `onRequest`, `onSuccess`, `onFailure`, `onError`: Lifecycle hooks for custom logic.
 */
export interface TideMiddlewareOptions {
  /** Keycloak client adapter JSON (downloaded from your Keycloak realm settings) */
  config: any
  /** Routes that always bypass authentication */
  publicRoutes?: RoutePattern[]
  /** Routes requiring a verified token and specific roles */
  protectedRoutes?: ProtectedRoutesMap
  /** Called before any auth logic; return a Response to short‑circuit */
  onRequest?: (ctx: { token: string | null }, req: NextRequest) => NextResponse | void
  /** Called after successful auth and role checks; return a Response to override */
  onSuccess?: (ctx: { payload: Record<string, any> }, req: NextRequest) => NextResponse | void
  /** Called when auth or role check fails; return a Response to override */
  onFailure?: (ctx: { token: string | null }, req: NextRequest) => NextResponse | void
  /** Fallback for unhandled errors in middleware logic */
  onError?: (err: any, req: NextRequest) => NextResponse
}

const DEFAULTS: Omit<TideMiddlewareOptions, 'config'> & { protectedRoutes: ProtectedRoutesMap } = {
  protectedRoutes: {},
  onRequest: undefined,
  onSuccess: undefined,
}

/**
 * Returns a Next.js Edge Middleware function enforcing TideCloak auth.
 *
 * Example usage in your `middleware.ts`:
 *
 * ```ts
 * import keycloakConfig from './tidecloak.config.json'
 * import { createTideMiddleware } from 'tidecloak-nextjs/server/tidecloakMiddleware'
 *
 * export default createTideMiddleware({
 *   config: keycloakConfig,
 *   publicRoutes: ['/', '/about'],
 *   protectedRoutes: {
 *     '/admin/*': ['admin'],
 *     '/api/private/*': ['user']
 *   }
 * })
 *
 * export const config = {
 *   matcher: [
 *     '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)',
 *     '/(api|trpc)(.*)'
 *   ],
 *   runtime: 'edge'
 * }
 * ```
 */
export function createTideMiddleware(opts: TideMiddlewareOptions) {
  const settings = { ...DEFAULTS, ...opts }

  // Prepare arrays of test functions for public and protected routes
  const publicTests = (settings.publicRoutes ?? []).map(normalizePattern)
  const protectedTests = normalizeProtectedRoutes(settings.protectedRoutes)

  return async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname

    try {
      // Bypass auth entirely for configured public routes
      if (publicTests.some(test => test(path, req))) {
        return NextResponse.next()
      }

      // Extract the raw JWT from the specified cookie
      const token = req.cookies.get("kcToken")?.value || null

      // Allow custom logic before auth checks
      if (settings.onRequest) {
        const result = settings.onRequest({ token }, req)
        if (result) return result
      }

      // Iterate protected routes; the first match enforces a role check
      for (const { test, roles } of protectedTests) {
        if (test(path, req)) {
          // Verify signature, issuer, and presence of at least one allowed role
          const payload = await verifyTideCloakToken(settings.config, token!, roles)
          if (!payload) {
            // Custom onFailure hook or default redirect
            const result = settings.onFailure!({ token }, req)
            if (result) return result
             return NextResponse.json(
              { error: '[TideCloak Middleware] Access forbidden: invalid token' },
              { status: 403 }
            );
          }

          // Custom onSuccess hook if provided
          if (settings.onSuccess) {
            const result = settings.onSuccess({ payload }, req)
            if (result) return result
          }

          // Token valid and role check passed
          return NextResponse.next()
        }
      }

      // No protected route matched; continue
      return NextResponse.next()
    } catch (err) {
      
      // Handle unexpected errors
      if (settings.onError) {
        return settings.onError!(err, req)
      }

      console.error("[TideCloak Middleware] ", err);
      throw err;
    }
  }
}
