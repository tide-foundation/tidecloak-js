import { generateKeyPairSync, createHash, randomUUID, sign, type KeyObject } from 'node:crypto'

export interface DelegationConfig {
  /** TideCloak server URL */
  tidecloakUrl: string
  /** TideCloak realm name */
  realm: string
  /** Client ID registered in TideCloak */
  clientId: string
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
  private serverKeyPair: { publicKey: KeyObject; privateKey: KeyObject } | null = null
  private serverJwk: { kty: string; crv: string; x: string } | null = null
  private serverJkt: string | null = null

  constructor(config: DelegationConfig) {
    this.config = config
  }

  /**
   * Generate a fresh Ed25519 keypair for this delegation cycle.
   */
  private rotateServerKey(): void {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    this.serverKeyPair = { publicKey, privateKey }

    const jwk = publicKey.export({ format: 'jwk' })
    this.serverJwk = { kty: 'OKP', crv: 'Ed25519', x: jwk.x! }

    const canonical = JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: jwk.x })
    this.serverJkt = createHash('sha256').update(canonical).digest('base64url')
  }

  /**
   * Pack a delegation request with server-side context.
   * Generates a fresh DPoP keypair for this delegation cycle.
   * Returns an object for the browser to sign with its DPoP key.
   */
  packRequest(request: DelegationRequest): PackedDelegationRequest {
    this.rotateServerKey()
    const now = Math.floor(Date.now() / 1000)
    return {
      payload: {
        ...request,
        cnf: { jkt: this.serverJkt! },
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
      }
    }
  }

  /**
   * Generate a DPoP proof JWT signed by the server's Ed25519 key.
   *
   * @param method - HTTP method (e.g. "POST", "GET")
   * @param url - The target URL for the request
   * @returns A DPoP proof JWT string
   */
  generateDpopProof(method: string, url: string, accessToken?: string): string {
    if (!this.serverKeyPair) throw new Error('No server key — call packRequest() first')

    const header = { typ: 'dpop+jwt', alg: 'EdDSA', jwk: this.serverJwk }
    // RFC 9449: htu must be the URL without query and fragment
    const htu = new URL(url)
    htu.search = ''
    htu.hash = ''
    const payload: Record<string, unknown> = {
      htm: method,
      htu: htu.toString(),
      iat: Math.floor(Date.now() / 1000),
      jti: randomUUID(),
    }
    // RFC 9449 Section 4.2: ath (access token hash) required when DPoP proof accompanies an access token
    if (accessToken) {
      payload.ath = createHash('sha256').update(accessToken).digest('base64url')
    }

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signingInput = `${encodedHeader}.${encodedPayload}`

    // Ed25519 uses sign(null, data, key) — no separate digest algorithm
    const signature = sign(null, Buffer.from(signingInput), this.serverKeyPair!.privateKey)

    return `${signingInput}.${signature.toString('base64url')}`
  }

  /**
   * Exchange artifacts for a delegation token.
   * The server generates its own DPoP proof for the token endpoint.
   *
   * @param subjectToken - The user's access token (from browser)
   * @param delegationRequest - The signed delegation request JWT (signed by browser's DPoP key)
   * @returns The signed delegation token from TideCloak
   */
  async exchange(params: {
    subjectToken: string
    delegationRequest: string
    dpopApproval: string
  }): Promise<DelegationResult> {
    const fetchFn = this.config.fetch ?? globalThis.fetch
    const tokenEndpoint = `${this.config.tidecloakUrl.replace(/\/+$/, '')}/realms/${this.config.realm}/protocol/openid-connect/token`

    // Server generates its own DPoP proof for the token endpoint
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: this.config.clientId,
      subject_token: params.subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: params.delegationRequest,
      actor_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      dpop_approval: params.dpopApproval,
    })

    // Send DPoP proof so the delegation token gets cnf.jkt binding
    const serverDpopProof = this.generateDpopProof('POST', tokenEndpoint)
    const response = await fetchFn(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'DPoP': serverDpopProof,
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
