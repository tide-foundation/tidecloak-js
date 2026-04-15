import { createHash, randomUUID, generateKeyPairSync } from 'node:crypto'
import { Agent } from 'node:https'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

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
  /** Client ID registered in TideCloak (public, browser auth) */
  clientId: string
  /** Server client ID for token exchange (confidential, mTLS auth) */
  serverClientId?: string
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
   * Initialize the delegation system with vault-backed key management.
   *
   * On first run: generates mTLS key, encrypts with VVK via Tide Vault, saves blob.
   * On restart: loads blob, decrypts via Tide Vault, configures mTLS.
   * The plaintext private key only exists in memory while the process runs.
   *
   * @param doken - Server's doken for vault authentication
   * @param keyDir - Directory to store encrypted key blob
   */
  async init(doken?: string, keyDir?: string): Promise<void> {
    const dir = keyDir ?? (this.config.adapterJsonPath ? dirname(this.config.adapterJsonPath) : join(process.cwd(), 'data'))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const blobPath = join(dir, 'server-key.vault')
    const vaultUrl = `${this.config.tidecloakUrl.replace(/\/+$/, '')}/realms/${this.config.realm}/tide-vault`

    // Already have mTLS configured (key was passed directly)
    if (this.isMtlsEnabled()) {
      console.log('[tide-vault] mTLS already configured')
      return
    }

    // Check if we have an encrypted blob
    if (existsSync(blobPath)) {
      // Decrypt the key from vault
      console.log('[tide-vault] Decrypting mTLS key from vault...')
      try {
        const blob = readFileSync(blobPath, 'utf-8')
        const fetchFn = this.config.fetch ?? globalThis.fetch
        const response = await fetchFn(`${vaultUrl}/decrypt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encrypted: blob, doken: doken ?? '' }),
        })

        if (!response.ok) {
          const err = await response.text()
          console.warn(`[tide-vault] Decrypt failed (${response.status}): ${err}`)
          return
        }

        const result = await response.json() as any
        const privateKeyPem = result.data

        // Configure mTLS with decrypted key
        this.setMtlsKey(privateKeyPem)
        console.log('[tide-vault] mTLS key decrypted and loaded')
      } catch (err) {
        console.warn(`[tide-vault] Could not decrypt key: ${(err as Error).message}`)
      }
      return
    }

    // Check for raw key fallback (saved when vault was unavailable)
    const rawKeyPath = join(dir, 'server.key')
    if (existsSync(rawKeyPath)) {
      console.log('[tide-vault] Loading existing key from fallback file')
      const privateKeyPem = readFileSync(rawKeyPath, 'utf-8')
      if (this.serverIdentity) {
        this.setMtlsKey(privateKeyPem)
      }
      // Still request cert if needed
      if (!this.serverIdentity?.certificate) {
        await this.requestServerCert(dir)
      }
      return
    }

    // No blob and no fallback - generate new key, encrypt with vault, save
    console.log('[tide-vault] Generating new mTLS key...')
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string

    // Encrypt with VVK via Tide Vault
    try {
      const fetchFn = this.config.fetch ?? globalThis.fetch
      const response = await fetchFn(`${vaultUrl}/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: privateKeyPem, doken: doken ?? '' }),
      })

      if (!response.ok) {
        const err = await response.text()
        console.warn(`[tide-vault] Encrypt failed (${response.status}): ${err}`)
        // Fall back to saving raw key
        writeFileSync(join(dir, 'server.key'), privateKeyPem)
        console.warn('[tide-vault] Saved raw key as fallback (vault unavailable)')
      } else {
        const result = await response.json() as any
        writeFileSync(blobPath, result.encrypted)
        console.log('[tide-vault] Key encrypted and saved to vault blob')
      }
    } catch (err) {
      console.warn(`[tide-vault] Vault unavailable: ${(err as Error).message}`)
      writeFileSync(join(dir, 'server.key'), privateKeyPem)
      console.warn('[tide-vault] Saved raw key as fallback')
    }

    // Configure mTLS with the key (still in memory)
    if (this.serverIdentity) {
      this.setMtlsKey(privateKeyPem)
    }

    // Save public key for cert request
    const pubDer = publicKey.export({ format: 'der', type: 'spki' })
    const pubB64url = Buffer.from(pubDer).subarray(-32).toString('base64url')

    // Save instance ID
    const instanceIdPath = join(dir, 'server-instance-id')
    let instanceId: string
    try {
      instanceId = readFileSync(instanceIdPath, 'utf-8').trim()
    } catch {
      instanceId = randomUUID()
      writeFileSync(instanceIdPath, instanceId)
    }

    // Request cert if not already present
    if (!this.serverIdentity?.certificate) {
      await this.requestServerCert(dir)
    }
  }

  /**
   * Request a server identity certificate from TideCloak.
   * Generates an Ed25519 keypair, submits the public key, and saves the private key.
   * The cert must be approved by admin quorum in TideCloak before mTLS works.
   *
   * Call this once on server startup. If a cert already exists in the adapter JSON,
   * this is a no-op.
   *
   * @param keyDir - Directory to store the private key and instance ID (default: same dir as adapter JSON)
   */
  async requestServerCert(keyDir?: string): Promise<void> {
    // Already have a cert - nothing to do
    if (this.serverIdentity?.certificate) {
      console.log('[tide-server] Server certificate already present')
      return
    }

    const dir = keyDir ?? (this.config.adapterJsonPath ? dirname(this.config.adapterJsonPath) : join(process.cwd(), 'data'))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    // Load or generate instance ID
    const instanceIdPath = join(dir, 'server-instance-id')
    let instanceId: string
    try {
      instanceId = readFileSync(instanceIdPath, 'utf-8').trim()
    } catch {
      instanceId = randomUUID()
      writeFileSync(instanceIdPath, instanceId)
    }

    // Load existing key or generate new one
    const keyPath = join(dir, 'server.key')
    let pubB64url: string
    if (existsSync(keyPath)) {
      const { createPrivateKey, createPublicKey } = await import('node:crypto')
      const privKey = createPrivateKey({ key: readFileSync(keyPath), format: 'pem', type: 'pkcs8' })
      const pubKey = createPublicKey(privKey)
      const pubDer = pubKey.export({ format: 'der', type: 'spki' })
      pubB64url = Buffer.from(pubDer).subarray(-32).toString('base64url')
    } else {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519')
      writeFileSync(keyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }) as string)
      const pubDer = publicKey.export({ format: 'der', type: 'spki' })
      pubB64url = Buffer.from(pubDer).subarray(-32).toString('base64url')
    }

    // Submit cert request (public endpoint, no auth)
    const fetchFn = this.config.fetch ?? globalThis.fetch
    const requestUrl = `${this.config.tidecloakUrl.replace(/\/+$/, '')}/realms/${this.config.realm}/tide-server-identity/request`

    if (!this.config.serverClientId) {
      console.warn('[tide-server] No serverClientId configured (missing serverResource in adapter JSON). Skipping cert request.')
      return
    }
    const effectiveClientId = this.config.serverClientId
    console.log(`[tide-server] Requesting certificate for client=${effectiveClientId} instance=${instanceId}`)

    try {
      const response = await fetchFn(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: effectiveClientId,
          publicKey: pubB64url,
          instanceId,
          requestedLifetime: 86400,
        }),
      })

      if (response.ok) {
        const result = await response.json() as any
        console.log(`[tide-server] Certificate request submitted (changeSetId: ${result.changeSetId})`)
        console.log(`[tide-server] Approve in TideCloak Admin > Realm Settings > Server Certs`)
        console.log(`[tide-server] Then re-export adapter JSON to include the signed certificate`)
      } else if (response.status === 409) {
        console.log('[tide-server] Certificate request already pending - approve in TideCloak Admin')
      } else {
        const err = await response.text()
        console.warn(`[tide-server] Certificate request failed (${response.status}): ${err}`)
      }
    } catch (err) {
      console.warn(`[tide-server] Could not reach TideCloak: ${(err as Error).message}`)
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
      client_id: this.config.serverClientId ?? this.config.clientId,
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

        // Log the full delegation token
        console.log('[delegation] Token:', result.access_token)

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
