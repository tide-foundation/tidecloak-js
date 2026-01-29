// Middleware
export { createTideCloakMiddleware } from './tidecloakMiddleware'
export type { TideMiddlewareOptions, TidecloakConfig } from './tidecloakMiddleware'

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