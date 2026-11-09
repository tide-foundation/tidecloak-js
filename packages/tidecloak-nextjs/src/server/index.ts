// Middleware (for Edge runtime - deprecated in Next.js 16+, but still supported)
export { createTideCloakMiddleware } from './tidecloakMiddleware'
export type { TideMiddlewareOptions, TidecloakConfig } from './tidecloakMiddleware'

// Proxy (for Next.js 16+ - Node.js runtime)
export { createTideCloakProxy } from './tidecloakProxy'
export type { TideProxyOptions } from './tidecloakProxy'

// Token verification
export { verifyTideCloakToken } from '@tidecloak/verify'

// DPoP page route handler (serves tide_dpop_auth.html when dpopConfig is on)
export { createDpopRoute } from './dpopRoute'
export type { DpopRouteOptions } from './dpopRoute'
