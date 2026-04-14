import { generateKeyPairSync, createHash, sign, type KeyObject } from 'node:crypto'
import { randomUUID } from 'node:crypto'

export interface KeyStoreConfig {
  /** Storage mode: 'memory' (default), 'db', or 'tpm' */
  mode?: 'memory' | 'db' | 'tpm'
  /** Database connection (required for 'db' and 'tpm' modes) */
  db?: any
  /** Table name for key storage (default: 'server_keys') */
  tableName?: string
}

export interface StoredKey {
  sessionId: string
  publicKey: KeyObject
  privateKey: KeyObject
  jwk: { kty: string; crv: string; x: string }
  jkt: string
  createdAt: number
}

/**
 * Key storage abstraction for server DPoP keys.
 * Supports memory (default), database, and TPM backends.
 * TPM mode stores TPM-encrypted blobs in the database.
 */
export class KeyStore {
  private mode: 'memory' | 'db' | 'tpm'
  private db: any
  private tableName: string
  private memoryStore = new Map<string, StoredKey>()
  private _isHardwareBacked = false
  private _tpm: any = null

  constructor(config: KeyStoreConfig = {}) {
    this.mode = config.mode ?? 'memory'
    this.db = config.db
    this.tableName = config.tableName ?? 'server_keys'

    if ((this.mode === 'db' || this.mode === 'tpm') && !this.db) {
      throw new Error(`KeyStore mode '${this.mode}' requires a db connection`)
    }

    if (this.mode === 'tpm') {
      try {
        const tpm = require('@tidecloak/tpm')
        if (tpm.isAvailable() && tpm.supportsEd25519()) {
          this._tpm = tpm
          this._isHardwareBacked = true
        } else {
          console.warn('[KeyStore] TPM available but Ed25519 not supported. Falling back to db mode.')
          this.mode = 'db'
        }
      } catch {
        console.warn('[KeyStore] @tidecloak/tpm not installed. Falling back to db mode.')
        this.mode = 'db'
      }
    }
  }

  /**
   * Generate a new Ed25519 keypair for a session.
   */
  async generate(sessionId: string): Promise<StoredKey> {
    if (this._tpm) {
      // TPM mode: key generated inside hardware, never extractable
      const tpmKey = this._tpm.generateKey()
      const x = tpmKey.publicKey.toString('base64url')
      const serverJwk = { kty: 'OKP', crv: 'Ed25519', x }
      const canonical = JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x })
      const jkt = createHash('sha256').update(canonical).digest('base64url')

      // Create a pseudo-KeyObject for compatibility (signing goes through TPM)
      const { createPublicKey } = await import('node:crypto')
      const publicKey = createPublicKey({
        key: Buffer.concat([
          // Ed25519 SPKI prefix
          Buffer.from('302a300506032b6570032100', 'hex'),
          tpmKey.publicKey,
        ]),
        format: 'der',
        type: 'spki',
      })

      const stored: StoredKey = {
        sessionId,
        publicKey,
        privateKey: null as any, // Private key is inside TPM
        jwk: serverJwk,
        jkt,
        createdAt: Date.now(),
      }

      // Store TPM blobs in DB for reload across restarts
      if (this.db) {
        await this.saveTpmToDb(sessionId, tpmKey, stored)
      }
      // Keep TPM handle in memory for signing
      this.memoryStore.set(sessionId, { ...stored, _tpmHandle: tpmKey.handle } as any)

      return stored
    }

    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const jwk = publicKey.export({ format: 'jwk' })
    const serverJwk = { kty: 'OKP', crv: 'Ed25519', x: jwk.x! }
    const canonical = JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: jwk.x })
    const jkt = createHash('sha256').update(canonical).digest('base64url')

    const stored: StoredKey = {
      sessionId,
      publicKey,
      privateKey,
      jwk: serverJwk,
      jkt,
      createdAt: Date.now(),
    }

    if (this.mode === 'memory') {
      this.memoryStore.set(sessionId, stored)
    } else if (this.mode === 'db') {
      await this.saveToDb(sessionId, stored)
    }

    return stored
  }

  /**
   * Load a key for a session.
   */
  async load(sessionId: string): Promise<StoredKey | null> {
    if (this.mode === 'memory') {
      return this.memoryStore.get(sessionId) ?? null
    } else if (this.mode === 'db') {
      return this.loadFromDb(sessionId)
    }
    return null
  }

  /**
   * Delete a key for a session.
   */
  async delete(sessionId: string): Promise<void> {
    if (this.mode === 'memory') {
      this.memoryStore.delete(sessionId)
    } else if (this.mode === 'db') {
      await this.deleteFromDb(sessionId)
    }
  }

  /**
   * Sign data with a session's key.
   */
  async sign(sessionId: string, data: Buffer): Promise<Buffer> {
    if (this._tpm) {
      // TPM signing: data goes in, signature comes out. Key stays in hardware.
      const cached = this.memoryStore.get(sessionId) as any
      if (!cached?._tpmHandle) throw new Error(`No TPM handle for session ${sessionId}`)
      return this._tpm.sign(cached._tpmHandle, data)
    }
    const key = await this.load(sessionId)
    if (!key) throw new Error(`No key found for session ${sessionId}`)
    return sign(null, data, key.privateKey)
  }

  /**
   * Check if keys are hardware-backed (TPM).
   */
  isHardwareBacked(): boolean {
    return this._isHardwareBacked
  }

  /**
   * Get the storage mode.
   */
  getMode(): string {
    return this.mode
  }

  /**
   * Clean up keys older than maxAge milliseconds.
   */
  async cleanup(maxAge: number): Promise<number> {
    const cutoff = Date.now() - maxAge
    let removed = 0

    if (this.mode === 'memory') {
      for (const [sid, key] of this.memoryStore) {
        if (key.createdAt < cutoff) {
          this.memoryStore.delete(sid)
          removed++
        }
      }
    } else if (this.mode === 'db') {
      removed = await this.cleanupDb(cutoff)
    }

    return removed
  }

  // --- TPM + Database operations ---

  private async saveTpmToDb(sessionId: string, tpmKey: any, stored: StoredKey): Promise<void> {
    await this.db.query(
      `INSERT INTO ${this.tableName} (session_id, public_key, private_key, jwk_x, jkt, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id) DO UPDATE SET public_key = $2, private_key = $3, jwk_x = $4, jkt = $5, created_at = $6`,
      [
        sessionId,
        tpmKey.publicArea.toString('base64'),   // TPM2B_PUBLIC serialized
        tpmKey.privateBlob.toString('base64'),  // TPM-encrypted private blob
        stored.jwk.x,
        stored.jkt,
        stored.createdAt,
      ]
    )
  }

  // --- Database operations ---

  private async saveToDb(sessionId: string, key: StoredKey): Promise<void> {
    const publicKeyB64 = key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    const privateKeyB64 = key.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')

    // Use raw SQL for maximum compatibility (no ORM dependency)
    await this.db.query(
      `INSERT INTO ${this.tableName} (session_id, public_key, private_key, jwk_x, jkt, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id) DO UPDATE SET public_key = $2, private_key = $3, jwk_x = $4, jkt = $5, created_at = $6`,
      [sessionId, publicKeyB64, privateKeyB64, key.jwk.x, key.jkt, key.createdAt]
    )
  }

  private async loadFromDb(sessionId: string): Promise<StoredKey | null> {
    const result = await this.db.query(
      `SELECT public_key, private_key, jwk_x, jkt, created_at FROM ${this.tableName} WHERE session_id = $1`,
      [sessionId]
    )

    if (!result.rows || result.rows.length === 0) return null

    const row = result.rows[0]
    const { createPublicKey, createPrivateKey } = await import('node:crypto')

    const publicKey = createPublicKey({
      key: Buffer.from(row.public_key, 'base64'),
      format: 'der',
      type: 'spki',
    })
    const privateKey = createPrivateKey({
      key: Buffer.from(row.private_key, 'base64'),
      format: 'der',
      type: 'pkcs8',
    })

    return {
      sessionId,
      publicKey,
      privateKey,
      jwk: { kty: 'OKP', crv: 'Ed25519', x: row.jwk_x },
      jkt: row.jkt,
      createdAt: row.created_at,
    }
  }

  private async deleteFromDb(sessionId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM ${this.tableName} WHERE session_id = $1`,
      [sessionId]
    )
  }

  private async cleanupDb(cutoff: number): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE created_at < $1`,
      [cutoff]
    )
    return result.rowCount ?? 0
  }
}
