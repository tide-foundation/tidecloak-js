// Middleware (for Edge runtime - deprecated in Next.js 16+, but still supported)
export { createTideCloakMiddleware } from './tidecloakMiddleware'
export type { TideMiddlewareOptions, TidecloakConfig } from './tidecloakMiddleware'

// Proxy (for Next.js 16+ - Node.js runtime)
export { createTideCloakProxy } from './tidecloakProxy'
export type { TideProxyOptions } from './tidecloakProxy'

// Token verification
export { verifyTideCloakToken } from '@tidecloak/verify'

// Hybrid mode token exchange utilities
export {
  exchangeCodeForTokens,
  refreshAccessToken,
  parseAuthCodeData,
  setSessionCookie,
  getSessionFromRequest,
  clearSessionCookie
} from './tokenExchange'

export type {
  TokenExchangeConfig,
  TokenResponse,
  AuthCodeData
} from './tokenExchange'