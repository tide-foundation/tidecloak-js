# TideCloak TPM

Native TPM 2.0 binding for non-extractable Ed25519 key operations. The private key never leaves the TPM chip.

## Requirements

- Linux (TPM 2.0 device at `/dev/tpmrm0`)
- `libtss2-dev` (tpm2-tss development headers)
- Node.js 18+
- TPM 2.0 rev 1.59+ for Ed25519 support
- For development: `swtpm` (software TPM)

### Install dependencies (Ubuntu/Debian)

```bash
sudo apt install libtss2-dev
```

### Install dependencies (Fedora/RHEL)

```bash
sudo dnf install tpm2-tss-devel
```

## Usage

```ts
import * as tpm from '@tidecloak/tpm'

// Check availability
if (!tpm.isAvailable()) {
  console.log('No TPM found')
  process.exit(1)
}

if (!tpm.supportsEd25519()) {
  console.log('TPM does not support Ed25519')
  process.exit(1)
}

// Generate key inside TPM
const key = tpm.generateKey()
console.log('Public key:', key.publicKey.toString('base64url'))

// Store the blobs in your database (private blob is TPM-encrypted)
await db.insert({
  publicArea: key.publicArea,
  privateBlob: key.privateBlob,
})

// Sign data - TPM does it internally
const signature = tpm.sign(key.handle, Buffer.from('data to sign'))

// Unload when done
tpm.unloadKey(key.handle)
```

## How it works

1. `generateKey()` creates an Ed25519 keypair inside the TPM chip
2. The private key exists only inside the TPM hardware
3. `sign(handle, data)` sends data to the TPM, gets signature back
4. `privateBlob` is encrypted by the TPM's storage root key - safe to store anywhere
5. Only the same TPM can reload and use the private blob

## Integration with @tidecloak/server

The `KeyStore` in `@tidecloak/server` uses this package when `mode: 'tpm'` is configured:

```ts
import { TideDelegation } from '@tidecloak/server'

const delegation = new TideDelegation({
  tidecloakUrl: '...',
  realm: '...',
  clientId: '...',
  keyStore: 'tpm',
  db: dbConnection,
})
```

## Development with swtpm

For development without hardware TPM:

```bash
# Install software TPM
sudo apt install swtpm

# Start swtpm
mkdir /tmp/tpm
swtpm socket --tpmstate dir=/tmp/tpm --tpm2 --ctrl type=tcp,port=2322 --server type=tcp,port=2321

# Set TCTI for software TPM
export TPM2TOOLS_TCTI="mssim:host=localhost,port=2321"
```
