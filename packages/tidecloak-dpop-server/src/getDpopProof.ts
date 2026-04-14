export interface DpopProofOptions {
  /** Custom fetch implementation (for testing or edge runtimes) */
  fetch?: typeof globalThis.fetch
  /** User session ID for authentication */
  sessionId?: string
}

export async function getDpopProof(
  tidecloakUrl: string,
  realm: string,
  method: string,
  url: string,
  options?: DpopProofOptions
): Promise<string> {
  const fetchFn = options?.fetch ?? globalThis.fetch
  let endpoint = `${tidecloakUrl.replace(/\/+$/, '')}/realms/${realm}/tidevouchers/sign-dpop`
  if (options?.sessionId) {
    endpoint += `?sessionId=${encodeURIComponent(options.sessionId)}`
  }

  const body = new URLSearchParams({ method, url })

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new Error(`DPoP proof request failed (${response.status})`)
  }

  const proof = await response.text()

  // Validate response looks like a compact JWS (three base64url segments)
  if (!proof || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(proof)) {
    throw new Error('Invalid DPoP proof response from server')
  }

  return proof
}
