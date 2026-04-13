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

/** Per-session server key (pending exchange, not yet cached) */
interface PendingKey {
  keyPair: { publicKey: KeyObject; privateKey: KeyObject }
  jwk: { kty: string; crv: string; x: string }
  jkt: string
  createdAt: number
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

  /** Per-session pending keys (between 419 and delegation POST) */
  private pendingKeys = new Map<string, PendingKey>()

  /** Per-session delegation token cache */
  private cache = new Map<string, DelegationCache>()

  /** Max age for pending keys before cleanup (60s) */
  private static PENDING_KEY_TTL = 60_000

  constructor(config: DelegationConfig) {
    this.config = config
  }

  /**
   * Generate a fresh Ed25519 keypair for a specific session.
   */
  private generateSessionKey(sessionId: string): PendingKey {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const jwk = publicKey.export({ format: 'jwk' })
    const serverJwk = { kty: 'OKP', crv: 'Ed25519', x: jwk.x! }
    const canonical = JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: jwk.x })
    const jkt = createHash('sha256').update(canonical).digest('base64url')

    const pending: PendingKey = {
      keyPair: { publicKey, privateKey },
      jwk: serverJwk,
      jkt,
      createdAt: Date.now(),
    }
    this.pendingKeys.set(sessionId, pending)
    this.cleanupStalePendingKeys()
    return pending
  }

  /**
   * Remove pending keys older than PENDING_KEY_TTL.
   */
  private cleanupStalePendingKeys(): void {
    const now = Date.now()
    for (const [sid, pending] of this.pendingKeys) {
      if (now - pending.createdAt > TideDelegation.PENDING_KEY_TTL) {
        this.pendingKeys.delete(sid)
      }
    }
  }

  /**
   * Pack a delegation request for a specific session.
   * Returns an object for the browser to sign with its DPoP key.
   */
  packRequest(sessionId: string, request: DelegationRequest): PackedDelegationRequest {
    // Reuse pending key if one exists for this session (concurrent 419s)
    let pending = this.pendingKeys.get(sessionId)
    if (!pending) {
      pending = this.generateSessionKey(sessionId)
    }
    const now = Math.floor(Date.now() / 1000)
    return {
      payload: {
        ...request,
        cnf: { jkt: pending.jkt },
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
      }
    }
  }

  /**
   * Generate a DPoP proof JWT signed by a session's pending key.
   */
  private generateDpopProofForSession(
    sessionId: string,
    method: string,
    url: string,
    accessToken?: string
  ): string {
    const pending = this.pendingKeys.get(sessionId)
    if (!pending) throw new Error('No pending key for session — call a delegated endpoint first')
    return this.buildDpopProof(method, url, pending.keyPair, pending.jwk, accessToken)
  }

  /**
   * Generate a DPoP proof JWT signed by a specific key pair.
   */
  private buildDpopProof(
    method: string,
    url: string,
    keyPair: { publicKey: KeyObject; privateKey: KeyObject },
    jwk: { kty: string; crv: string; x: string },
    accessToken?: string
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
    }
    if (accessToken) {
      payload.ath = createHash('sha256').update(accessToken).digest('base64url')
    }

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signingInput = `${encodedHeader}.${encodedPayload}`
    const signature = sign(null, Buffer.from(signingInput), keyPair.privateKey)
    return `${signingInput}.${signature.toString('base64url')}`
  }

  /**
   * Exchange artifacts for a delegation token using a session's pending key.
   */
  async exchange(sessionId: string, params: {
    subjectToken: string
    delegationRequest: string
    dpopApproval: string
  }): Promise<DelegationResult> {
    const fetchFn = this.config.fetch ?? globalThis.fetch
    const tokenEndpoint = `${this.config.tidecloakUrl.replace(/\/+$/, '')}/realms/${this.config.realm}/protocol/openid-connect/token`

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: this.config.clientId,
      subject_token: params.subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: params.delegationRequest,
      actor_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      dpop_approval: params.dpopApproval,
    })

    const serverDpopProof = this.generateDpopProofForSession(sessionId, 'POST', tokenEndpoint)
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

        const sessionId = this.extractSessionId(subjectToken)
        const pending = this.pendingKeys.get(sessionId)

        if (!pending) {
          res.status(400).json({ error: 'No pending delegation challenge for this session' })
          return
        }

        const result = await this.exchange(sessionId, {
          subjectToken,
          delegationRequest: signedDelegationRequest,
          dpopApproval,
        })

        // Cache the delegation token with this session's key
        this.cache.set(sessionId, {
          token: result.access_token,
          serverKeyPair: pending.keyPair,
          serverJwk: pending.jwk,
          serverJkt: pending.jkt,
          expiresAt: Date.now() + (result.expires_in * 1000) - 5000,
        })

        // Remove pending key — it's now in the cache
        this.pendingKeys.delete(sessionId)

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
  requireDelegation(options?: { roles?: { realm?: string[]; clients?: Record<string, string[]> } }) {
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
          fetch: async (url: string, fetchOpts?: { method?: string; body?: any; formData?: any }) => {
            const method = fetchOpts?.method || 'GET'
            const proof = this.buildDpopProof(
              method, url, cached.serverKeyPair, cached.serverJwk, cached.token
            )
            const headers: Record<string, string> = {
              accept: 'application/json',
              Authorization: `DPoP ${cached.token}`,
              DPoP: proof,
            }
            let bodyPayload: any = undefined
            if (fetchOpts?.formData) {
              bodyPayload = fetchOpts.formData
            } else if (fetchOpts?.body !== undefined) {
              headers['Content-Type'] = 'application/json'
              bodyPayload = JSON.stringify(fetchOpts.body)
            }
            const response = await (this.config.fetch ?? globalThis.fetch)(url, {
              method,
              headers,
              ...(bodyPayload !== undefined ? { body: bodyPayload } : {}),
            })
            if (!response.ok) {
              throw new Error(`Admin API call failed: ${response.status} ${await response.text()}`)
            }
            if (response.status === 204) return undefined
            const text = await response.text()
            return text ? JSON.parse(text) : undefined
          },
        }
        next()
      } else {
        // No delegation token — generate per-session key, send challenge
        const packed = this.packRequest(sessionId, {
          ...(options?.roles ? { requested_roles: options.roles } : {}),
        })
        const pending = this.pendingKeys.get(sessionId)!

        res.status(419).json({
          needsDelegation: true,
          payload: packed.payload,
          serverJkt: pending.jkt,
        })
      }
    }
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
