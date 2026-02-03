import { NextRequest, NextResponse } from 'next/server'
import { verifyTideCloakToken } from '@tidecloak/verify'
import {
  normalizeProtectedRoutes,
  ProtectedRoutesMap
} from './routerMatcher'
import type { TidecloakConfig, TideMiddlewareOptions } from './tidecloakMiddleware'

// Re-export types for convenience
export type { TidecloakConfig, TideMiddlewareOptions }

/**
 * Alias for TideMiddlewareOptions for use with the proxy convention
 */
export type TideProxyOptions = TideMiddlewareOptions

const DEFAULTS: Omit<TideProxyOptions, 'config'> & { protectedRoutes: ProtectedRoutesMap } = {
  protectedRoutes: {},
  onRequest: undefined,
  onSuccess: undefined,
}

/**
 * Returns a Next.js 16+ Proxy function enforcing TideCloak auth.
 *
 * This is the recommended approach for Next.js 16+. The proxy runs on Node.js runtime.
 * For Edge runtime, use `createTideCloakMiddleware` instead (deprecated in Next.js 16).
 *
 * Example usage in your `proxy.ts`:
 *
 * ```ts
 * import tidecloakConfig from './tidecloakAdapter.json'
 * import { createTideCloakProxy } from '@tidecloak/nextjs/server'
 *
 * export const proxy = createTideCloakProxy({
 *   config: tidecloakConfig,
 *   protectedRoutes: {
 *     '/admin/*': ['admin'],
 *     '/api/private/*': ['user']
 *   },
 *   onFailure: ({ token }, req) => NextResponse.redirect(new URL('/login', req.url)),
 * })
 *
 * export const config = {
 *   matcher: ['/((?!_next|.*\\..*).*)'],
 * }
 * ```
 */
export function createTideCloakProxy(opts: TideProxyOptions) {
  const settings = { ...DEFAULTS, ...opts }

  // Prepare arrays of test functions for protected routes
  const protectedTests = normalizeProtectedRoutes(settings.protectedRoutes)

  return async function proxy(req: NextRequest) {
    const path = req.nextUrl.pathname

    try {
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
            // Custom onFailure hook or default JSON response
            if (settings.onFailure) {
              const result = settings.onFailure({ token }, req)
              if (result) return result
            }
            return NextResponse.json(
              { error: '[TideCloak Proxy] Access forbidden: invalid token' },
              { status: 403 }
            )
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
        return settings.onError(err, req)
      }

      console.error("[TideCloak Proxy] ", err)
      throw err
    }
  }
}
