// Middleware (for Edge runtime - deprecated in Next.js 16+, but still supported)
export { createTideCloakMiddleware } from './tidecloakMiddleware'
export type { TideMiddlewareOptions, TidecloakConfig } from './tidecloakMiddleware'

// Proxy (for Next.js 16+ - Node.js runtime)
export { createTideCloakProxy } from './tidecloakProxy'
export type { TideProxyOptions } from './tidecloakProxy'

// Token verification
export { verifyTideCloakToken } from '@tidecloak/verify'
