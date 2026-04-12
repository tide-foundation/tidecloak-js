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

/** Cached delegation token + key for a user session */
interface DelegationCache {
  token: string
  serverKeyPair: { publicKey: KeyObject; privateKey: KeyObject }
  serverJwk: { kty: string; crv: string; x: string }
  serverJkt: string
  expiresAt: number
}

export class TideDelegation {
  private config: DelegationConfig
  private serverKeyPair: { publicKey: KeyObject; privateKey: KeyObject } | null = null
  private serverJwk: { kty: string; crv: string; x: string } | null = null
  private serverJkt: string | null = null

  /** Per-user delegation token cache */
  private cache = new Map<string, DelegationCache>()

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

  // ============================================
  // Express middleware for forgetful interrupt pattern
  // ============================================

  /**
   * Get cached delegation for a user session, or null if expired/missing.
   */
  private getCached(sessionId: string): DelegationCache | null {
    const cached = this.cache.get(sessionId)
    if (!cached) return null
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(sessionId)
      return null
    }
    return cached
  }

  /**
   * Express middleware: handles POST /api/delegation
   *
   * Receives signed delegation request + DPoP approval from the browser,
   * exchanges for a delegation token, and caches it.
   *
   * Expects req.accessToken (the user's subject token) from auth middleware.
   *
   * @example
   * app.post('/api/delegation', authenticate, delegation.handleDelegation())
   */
  handleDelegation() {
    return async (req: any, res: any) => {
      try {
        const { signedDelegationRequest, dpopApproval } = req.body
        const subjectToken = req.accessToken

        if (!signedDelegationRequest || !dpopApproval || !subjectToken) {
          res.status(400).json({ error: 'Missing signedDelegationRequest, dpopApproval, or access token' })
          return
        }

        if (!this.serverKeyPair) {
          res.status(400).json({ error: 'No pending delegation challenge — call a delegated endpoint first' })
          return
        }

        const result = await this.exchange({
          subjectToken,
          delegationRequest: signedDelegationRequest,
          dpopApproval,
        })

        // Cache the delegation token with the current server key
        const sessionId = this.extractSessionId(subjectToken)
        this.cache.set(sessionId, {
          token: result.access_token,
          serverKeyPair: this.serverKeyPair!,
          serverJwk: this.serverJwk!,
          serverJkt: this.serverJkt!,
          expiresAt: Date.now() + (result.expires_in * 1000) - 5000, // 5s buffer
        })

        res.json({ delegated: true })
      } catch (err: any) {
        res.status(500).json({ error: 'Delegation failed: ' + err.message })
      }
    }
  }

  /**
   * Express middleware: requires a delegation token for the route.
   *
   * If a valid cached delegation token exists for the user, attaches
   * req.delegation with a fetch helper. If not, sends a 419 challenge
   * with a packed delegation request for the browser to sign.
   *
   * Expects req.accessToken from auth middleware.
   *
   * @example
   * app.get('/api/admin/roles',
   *   authenticate,
   *   delegation.requireDelegation(),
   *   async (req, res) => {
   *     const roles = await req.delegation.fetch(adminUrl + '/clients/' + id + '/roles')
   *     res.json({ roles })
   *   }
   * )
   */
  requireDelegation() {
    return (req: any, res: any, next: any) => {
      const subjectToken = req.accessToken
      if (!subjectToken) {
        res.status(401).json({ error: 'No access token' })
        return
      }

      const sessionId = this.extractSessionId(subjectToken)
      const cached = this.getCached(sessionId)

      if (cached) {
        // Delegation token is cached — attach helpers to req
        req.delegation = {
          token: cached.token,
          fetch: async (url: string, method: string = 'GET') => {
            const proof = this.generateDpopProofWithKey(
              method, url, cached.token,
              cached.serverKeyPair, cached.serverJwk
            )
            const response = await (this.config.fetch ?? globalThis.fetch)(url, {
              method,
              headers: {
                accept: 'application/json',
                Authorization: `DPoP ${cached.token}`,
                DPoP: proof,
              },
            })
            if (!response.ok) {
              throw new Error(`Admin API call failed: ${response.status} ${await response.text()}`)
            }
            return response.json()
          },
        }
        next()
      } else {
        // No delegation token — generate fresh key and send challenge
        this.rotateServerKey()
        const packed = this.packRequest({})
        res.status(419).json({
          needsDelegation: true,
          payload: packed.payload,
          serverJkt: this.serverJkt,
        })
      }
    }
  }

  /**
   * Generate a DPoP proof using a specific key pair (for cached delegation tokens).
   */
  private generateDpopProofWithKey(
    method: string,
    url: string,
    accessToken: string,
    keyPair: { publicKey: KeyObject; privateKey: KeyObject },
    jwk: { kty: string; crv: string; x: string }
  ): string {
    const header = { typ: 'dpop+jwt', alg: 'EdDSA', jwk }
    const htu = new URL(url)
    htu.search = ''
    htu.hash = ''
    const payload: Record<string, unknown> = {
      htm: method,
      htu: htu.toString(),
      iat: Math.floor(Date.now() / 1000),
      jti: randomUUID(),
      ath: createHash('sha256').update(accessToken).digest('base64url'),
    }
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signingInput = `${encodedHeader}.${encodedPayload}`
    const signature = sign(null, Buffer.from(signingInput), keyPair.privateKey)
    return `${signingInput}.${signature.toString('base64url')}`
  }

  /**
   * Extract a session identifier from the access token for cache keying.
   */
  private extractSessionId(token: string): string {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      return payload.sid || payload.session_state || payload.sub || 'unknown'
    } catch {
      return 'unknown'
    }
  }
}
