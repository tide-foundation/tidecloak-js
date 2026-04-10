export interface DelegationConfig {
  /** TideCloak server URL */
  tidecloakUrl: string
  /** TideCloak realm name */
  realm: string
  /** Custom fetch implementation */
  fetch?: typeof globalThis.fetch
}

export interface DelegationRequest {
  /** Target audience */
  audience?: string
  /** Requested scope */
  scope?: string
  /** Additional claims */
  [key: string]: unknown
}

export interface PackedDelegationRequest {
  /** The packed request to be signed by the browser */
  payload: Record<string, unknown>
}

export interface DelegationResult {
  /** The signed delegation token */
  access_token: string
  /** Token type (Bearer) */
  token_type: string
  /** Seconds until expiry */
  expires_in: number
  /** The issued token type URI */
  issued_token_type: string
}

export class TideDelegation {
  private config: DelegationConfig

  constructor(config: DelegationConfig) {
    this.config = config
  }

  /**
   * Pack a delegation request with server-side context.
   * Returns an object for the browser to sign with its DPoP key.
   */
  packRequest(request: DelegationRequest): PackedDelegationRequest {
    const now = Math.floor(Date.now() / 1000)
    return {
      payload: {
        ...request,
        iat: now,
        exp: now + 300,
        jti: crypto.randomUUID(),
      }
    }
  }

  /**
   * Exchange all 3 artifacts for a delegation token.
   *
   * @param subjectToken - The user's access token (from browser)
   * @param dpopProof - The browser's DPoP proof JWT
   * @param delegationRequest - The signed delegation request JWT (signed by browser's DPoP key)
   * @returns The signed delegation token from TideCloak
   */
  async exchange(params: {
    subjectToken: string
    dpopProof: string
    delegationRequest: string
  }): Promise<DelegationResult> {
    const fetchFn = this.config.fetch ?? globalThis.fetch
    const tokenEndpoint = `${this.config.tidecloakUrl.replace(/\/+$/, '')}/realms/${this.config.realm}/protocol/openid-connect/token`

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: params.subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: params.delegationRequest,
      actor_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    })

    const response = await fetchFn(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'DPoP': params.dpopProof,
      },
      body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Delegation exchange failed (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<DelegationResult>
  }
}
