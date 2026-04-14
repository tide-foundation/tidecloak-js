import { getDpopProof, type DpopProofOptions } from './getDpopProof'

export interface DpopTokenExchangeConfig {
  tidecloakUrl: string
  realm: string
  clientId: string
  clientSecret?: string
  /** User session ID for DPoP proof authentication */
  sessionId?: string
  fetch?: typeof globalThis.fetch
}

export interface DpopTokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  refresh_expires_in?: number
  token_type: string
  scope?: string
}

export async function exchangeCodeWithDpop(
  config: DpopTokenExchangeConfig,
  authData: { code: string; code_verifier: string; redirect_uri: string }
): Promise<{ success: true; tokens: DpopTokenResponse } | { success: false; error: string }> {
  const fetchFn = config.fetch ?? globalThis.fetch
  const tokenEndpoint = `${config.tidecloakUrl}/realms/${config.realm}/protocol/openid-connect/token`

  try {
    const dpopProof = await getDpopProof(config.tidecloakUrl, config.realm, 'POST', tokenEndpoint, { fetch: fetchFn, sessionId: config.sessionId })

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: authData.code,
      code_verifier: authData.code_verifier,
      redirect_uri: authData.redirect_uri,
    })
    if (config.clientSecret) params.set('client_secret', config.clientSecret)

    const response = await fetchFn(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'DPoP': dpopProof,
      },
      body: params,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Token exchange failed (${response.status}): ${errorText}` }
    }

    const tokens = await response.json() as DpopTokenResponse
    return { success: true, tokens }
  } catch (err) {
    return { success: false, error: `Token exchange error: ${(err as Error).message}` }
  }
}

export async function refreshTokenWithDpop(
  config: DpopTokenExchangeConfig,
  refreshToken: string
): Promise<{ success: true; tokens: DpopTokenResponse } | { success: false; error: string }> {
  const fetchFn = config.fetch ?? globalThis.fetch
  const tokenEndpoint = `${config.tidecloakUrl}/realms/${config.realm}/protocol/openid-connect/token`

  try {
    const dpopProof = await getDpopProof(config.tidecloakUrl, config.realm, 'POST', tokenEndpoint, { fetch: fetchFn, sessionId: config.sessionId })

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    })
    if (config.clientSecret) params.set('client_secret', config.clientSecret)

    const response = await fetchFn(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'DPoP': dpopProof,
      },
      body: params,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Token refresh failed (${response.status}): ${errorText}` }
    }

    const tokens = await response.json() as DpopTokenResponse
    return { success: true, tokens }
  } catch (err) {
    return { success: false, error: `Token refresh error: ${(err as Error).message}` }
  }
}
