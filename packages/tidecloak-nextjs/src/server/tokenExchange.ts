import { NextRequest, NextResponse } from 'next/server'

/**
 * Token exchange configuration for hybrid mode
 */
export interface TokenExchangeConfig {
  /** TideCloak server URL (e.g., "https://auth.example.com") */
  authServerUrl: string
  /** TideCloak realm name */
  realm: string
  /** Client ID registered in TideCloak */
  clientId: string
  /** Client secret (for confidential clients) */
  clientSecret?: string
}

/**
 * Token response from TideCloak
 */
export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  refresh_expires_in?: number
  token_type: string
  scope?: string
}

/**
 * Authorization code data sent from the client
 */
export interface AuthCodeData {
  code: string
  code_verifier: string
  redirect_uri: string
}

/**
 * Exchange an authorization code for tokens.
 * Use this in your Next.js API route to complete the hybrid mode flow.
 *
 * @example
 * ```ts
 * // app/api/auth/callback/route.ts
 * import { exchangeCodeForTokens } from '@tidecloak/nextjs/server';
 *
 * export async function POST(req: NextRequest) {
 *   const body = await req.json();
 *   const authData = JSON.parse(body.accessToken);
 *
 *   const result = await exchangeCodeForTokens({
 *     authServerUrl: process.env.TIDECLOAK_URL!,
 *     realm: process.env.TIDECLOAK_REALM!,
 *     clientId: process.env.TIDECLOAK_CLIENT_ID!,
 *   }, authData);
 *
 *   if (!result.success) {
 *     return NextResponse.json({ error: result.error }, { status: 401 });
 *   }
 *
 *   // Store tokens server-side and create session
 *   return NextResponse.json({ success: true });
 * }
 * ```
 */
export async function exchangeCodeForTokens(
  config: TokenExchangeConfig,
  authData: AuthCodeData
): Promise<{ success: true; tokens: TokenResponse } | { success: false; error: string }> {
  const tokenEndpoint = `${config.authServerUrl}/realms/${config.realm}/protocol/openid-connect/token`

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code: authData.code,
    code_verifier: authData.code_verifier,
    redirect_uri: authData.redirect_uri,
  })

  if (config.clientSecret) {
    params.set('client_secret', config.clientSecret)
  }

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Token exchange failed: ${errorText}` }
    }

    const tokens = await response.json() as TokenResponse
    return { success: true, tokens }
  } catch (err) {
    return { success: false, error: `Token exchange error: ${(err as Error).message}` }
  }
}

/**
 * Refresh an access token using a refresh token.
 * Use this to get a new access token when the current one expires.
 *
 * @example
 * ```ts
 * const result = await refreshAccessToken({
 *   authServerUrl: process.env.TIDECLOAK_URL!,
 *   realm: process.env.TIDECLOAK_REALM!,
 *   clientId: process.env.TIDECLOAK_CLIENT_ID!,
 * }, session.tokens.refresh_token);
 *
 * if (result.success) {
 *   // Update stored tokens
 *   session.tokens = result.tokens;
 * }
 * ```
 */
export async function refreshAccessToken(
  config: TokenExchangeConfig,
  refreshToken: string
): Promise<{ success: true; tokens: TokenResponse } | { success: false; error: string }> {
  const tokenEndpoint = `${config.authServerUrl}/realms/${config.realm}/protocol/openid-connect/token`

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  })

  if (config.clientSecret) {
    params.set('client_secret', config.clientSecret)
  }

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Token refresh failed: ${errorText}` }
    }

    const tokens = await response.json() as TokenResponse
    return { success: true, tokens }
  } catch (err) {
    return { success: false, error: `Token refresh error: ${(err as Error).message}` }
  }
}

/**
 * Parse the auth data from the client request body.
 * The client sends the authorization code data as a JSON string in accessToken field.
 */
export function parseAuthCodeData(requestBody: { accessToken?: string }): AuthCodeData | null {
  if (!requestBody.accessToken) return null

  try {
    const data = JSON.parse(requestBody.accessToken)
    if (!data.code || !data.code_verifier || !data.redirect_uri) {
      return null
    }
    return {
      code: data.code,
      code_verifier: data.code_verifier,
      redirect_uri: data.redirect_uri,
    }
  } catch {
    return null
  }
}

/**
 * Create a session cookie response helper.
 *
 * @example
 * ```ts
 * const response = NextResponse.json({ success: true });
 * setSessionCookie(response, sessionId, { maxAge: 86400 });
 * return response;
 * ```
 */
export function setSessionCookie(
  response: NextResponse,
  sessionId: string,
  options: {
    name?: string
    maxAge?: number
    path?: string
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    httpOnly?: boolean
  } = {}
): void {
  const {
    name = 'session',
    maxAge = 86400, // 1 day
    path = '/',
    secure = true,
    sameSite = 'lax',
    httpOnly = true,
  } = options

  response.cookies.set(name, sessionId, {
    httpOnly,
    secure,
    sameSite,
    path,
    maxAge,
  })
}

/**
 * Get session ID from request cookies
 */
export function getSessionFromRequest(
  req: NextRequest,
  cookieName: string = 'session'
): string | null {
  return req.cookies.get(cookieName)?.value || null
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(
  response: NextResponse,
  cookieName: string = 'session'
): void {
  response.cookies.delete(cookieName)
}
