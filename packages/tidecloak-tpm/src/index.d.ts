/**
 * @tidecloak/tpm - TPM 2.0 native binding for non-extractable Ed25519 keys.
 *
 * The private key never leaves the TPM chip. All signing operations
 * happen inside the hardware. The public key can be exported.
 *
 * Requires TPM 2.0 rev 1.59+ for Ed25519 support.
 * Falls back to software TPM (swtpm) for development.
 */

/** Check if a TPM device is accessible */
export function isAvailable(): boolean

/** Check if the TPM supports Ed25519 (TPM_ALG_EDDSA) */
export function supportsEd25519(): boolean

/** Result of generateKey() */
export interface TpmKeyResult {
  /** Transient TPM handle (valid for this session) */
  handle: number
  /** Ed25519 public key bytes (32 bytes) */
  publicKey: Buffer
  /** Serialized TPM2B_PUBLIC (for external storage and reload) */
  publicArea: Buffer
  /** TPM-encrypted private blob (for external storage and reload) */
  privateBlob: Buffer
}

/**
 * Generate an Ed25519 keypair inside the TPM.
 * The private key is created inside the chip and never extracted.
 * Returns the handle, public key, and TPM-encrypted blobs for storage.
 */
export function generateKey(): TpmKeyResult

/**
 * Sign data with a TPM-held key.
 * The private key stays inside the TPM - data goes in, signature comes out.
 *
 * @param handle - TPM key handle (from generateKey or loadKey)
 * @param data - Data to sign
 * @returns Ed25519 signature (64 bytes)
 */
export function sign(handle: number, data: Buffer): Buffer

/**
 * Get the Ed25519 public key bytes from a TPM handle.
 *
 * @param handle - TPM key handle
 * @returns Public key bytes (32 bytes)
 */
export function getPublicKey(handle: number): Buffer

/**
 * Unload a transient key from TPM memory.
 * Call this when done with a loaded key to free TPM resources.
 *
 * @param handle - TPM key handle to unload
 */
export function unloadKey(handle: number): void
