import { createHash, randomUUID } from 'node:crypto'
import { Agent } from 'node:https'
import { readFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'

export interface ServerIdentity {
  /** SPIFFE ID */
  spiffeId: string
  /** PEM-encoded X.509 certificate (VVK-signed SVID) */
  certificate: string
  /** PEM-encoded trust bundle (VVK CA cert) */
  trustBundle: string
  /** Instance ID */
  instanceId?: string
}

export interface DelegationConfig {
  /** TideCloak server URL */
  tidecloakUrl: string
  /** TideCloak realm name */
  realm: string
  /** Client ID registered in TideCloak */
  clientId: string
  /** Custom fetch implementation */
  fetch?: typeof globalThis.fetch
  /** Server identity for mTLS (loaded from tidecloak.json serverIdentity) */
  serverIdentity?: ServerIdentity
  /** PEM-encoded private key for mTLS (from KeyStore or file) */
  privateKey?: string
  /** Path to tidecloak.json (auto-loads serverIdentity if present) */
  adapterJsonPath?: string
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
  /** Token type */
  token_type: string
  /** Seconds until expiry */
  expires_in: number
  /** The issued token type URI */
  issued_token_type: string
}

/** Cached delegation token for a user session */
interface DelegationCache {
  token: string
  expiresAt: number
}

export class TideDelegation {
  private config: DelegationConfig

  /** Per-session delegation token cache */
  private cache = new Map<string, DelegationCache>()

  /** HTTPS agent for mTLS */
  private mtlsAgent: Agent | null = null

  /** Server identity (SPIFFE SVID) */
  private serverIdentity: ServerIdentity | null = null

  /** SHA-256 thumbprint of the server cert (for cnf.x5t#S256 binding) */
  private certThumbprint: string | null = null

  constructor(config: DelegationConfig) {
    this.config = config

    // Load server identity from adapter JSON if path provided
    if (config.adapterJsonPath && !config.serverIdentity) {
      try {
        const adapterJson = JSON.parse(readFileSync(config.adapterJsonPath, 'utf-8'))
        if (adapterJson.serverIdentity) {
          config.serverIdentity = adapterJson.serverIdentity
        }
      } catch {
        // Adapter JSON not found or no serverIdentity
      }
    }

    // Configure mTLS if server identity + key are available
    if (config.serverIdentity) {
      this.serverIdentity = config.serverIdentity
      this.certThumbprint = this.computeCertThumbprint(config.serverIdentity.certificate)

      if (config.privateKey) {
        this.mtlsAgent = new Agent({
          cert: config.serverIdentity.certificate,
          key: config.privateKey,
          ca: config.serverIdentity.trustBundle,
          rejectUnauthorized: true,
        })
      }
    }
  }

  /**
   * Set the private key for mTLS. Call this after loading the key from KeyStore.
   */
  setMtlsKey(privateKeyPem: string): void {
    if (!this.serverIdentity) {
      throw new Error('No serverIdentity configured - cannot set mTLS key')
    }
    this.mtlsAgent = new Agent({
      cert: this.serverIdentity.certificate,
      key: privateKeyPem,
      ca: this.serverIdentity.trustBundle,
      rejectUnauthorized: true,
    })
  }

  /**
   * Check if mTLS is configured and ready.
   */
  isMtlsEnabled(): boolean {
    return this.mtlsAgent !== null && this.certThumbprint !== null
  }

  /**
   * Get the SPIFFE ID.
   */
  getSpiffeId(): string | null {
    return this.serverIdentity?.spiffeId ?? null
  }

  /**
   * Get the cert thumbprint (cnf.x5t#S256).
   */
  getCertThumbprint(): string | null {
    return this.certThumbprint
  }

  /**
   * Compute SHA-256 thumbprint of a PEM certificate (RFC 8705 cnf.x5t#S256).
   */
  private computeCertThumbprint(certPem: string): string {
    // Extract DER bytes from PEM
    const b64 = certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '')
    const derBytes = Buffer.from(b64, 'base64')
    return createHash('sha256').update(derBytes).digest('base64url')
  }

  /**
   * Fetch with mTLS agent if configured, otherwise plain fetch.
   */
  private async mtlsFetch(url: string, init: RequestInit): Promise<Response> {
    const fetchFn = this.config.fetch ?? globalThis.fetch
    if (this.mtlsAgent && url.startsWith('https://')) {
      return fetchFn(url, { ...init, ...(({ agent: this.mtlsAgent }) as any) })
    }
    return fetchFn(url, init)
  }

  /**
   * Pack a delegation request with the server's cert thumbprint.
   * The browser signs this to authorize this specific server.
   */
  packRequest(request: DelegationRequest): PackedDelegationRequest {
    if (!this.certThumbprint) {
      throw new Error('No server certificate configured - cannot pack delegation request')
    }
    const now = Math.floor(Date.now() / 1000)
    return {
      payload: {
        ...request,
        cnf: { 'x5t#S256': this.certThumbprint },
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
      }
    }
  }

  /**
   * Exchange artifacts for a delegation token via mTLS.
   * No DPoP proof needed - mTLS authenticates the server.
   */
  async exchange(params: {
    subjectToken: string
    delegationRequest: string
  }): Promise<DelegationResult> {
    if (!this.isMtlsEnabled()) {
      throw new Error('mTLS not configured - set serverIdentity and privateKey')
    }

    const tokenEndpoint = `${this.config.tidecloakUrl.replace(/\/+$/, '')}/realms/${this.config.realm}/protocol/openid-connect/token`

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: this.config.clientId,
      subject_token: params.subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: params.delegationRequest,
      actor_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    })

    // mTLS handles server authentication - no DPoP header needed
    const response = await this.mtlsFetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
   * Receives signed delegation request from the browser,
   * exchanges for a delegation token via mTLS, and caches it.
   *
   * No DPoP approval needed - server cert is already admin-quorum-approved.
   *
   * @example
   * app.post('/api/delegation', authenticate, delegation.handleDelegation())
   */
  handleDelegation() {
    return async (req: any, res: any) => {
      try {
        const { signedDelegationRequest } = req.body
        const subjectToken = req.accessToken

        if (!signedDelegationRequest || !subjectToken) {
          res.status(400).json({ error: 'Missing signedDelegationRequest or access token' })
          return
        }

        const result = await this.exchange({
          subjectToken,
          delegationRequest: signedDelegationRequest,
        })

        // Cache the delegation token
        const sessionId = this.extractSessionId(subjectToken)
        this.cache.set(sessionId, {
          token: result.access_token,
          expiresAt: Date.now() + (result.expires_in * 1000) - 5000,
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
   * with the server's cert thumbprint for the browser to sign.
   *
   * No DPoP proofs on admin API calls - mTLS authenticates the server.
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
        // Delegation token is cached - attach helpers
        req.delegation = {
          token: cached.token,
          fetch: async (url: string, fetchOpts?: { method?: string; body?: any; formData?: any }) => {
            const method = fetchOpts?.method || 'GET'
            const headers: Record<string, string> = {
              accept: 'application/json',
              Authorization: `Bearer ${cached.token}`,
            }
            let bodyPayload: any = undefined
            if (fetchOpts?.formData) {
              bodyPayload = fetchOpts.formData
            } else if (fetchOpts?.body !== undefined) {
              headers['Content-Type'] = 'application/json'
              bodyPayload = JSON.stringify(fetchOpts.body)
            }
            // mTLS handles proof-of-possession - no DPoP proof needed
            const response = await this.mtlsFetch(url, {
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
        // No delegation token - send challenge with cert thumbprint
        if (!this.certThumbprint) {
          res.status(500).json({ error: 'Server certificate not configured' })
          return
        }
        const packed = this.packRequest({
          ...(options?.roles ? { requested_roles: options.roles } : {}),
        })

        res.status(419).json({
          needsDelegation: true,
          payload: packed.payload,
          certThumbprint: this.certThumbprint,
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
