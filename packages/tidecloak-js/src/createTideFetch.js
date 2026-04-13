import { IAMService } from './IAMService.js'

/**
 * Create a delegation-aware fetch wrapper.
 *
 * Wraps an existing fetch function and transparently handles
 * 419 Delegation Required challenges from the server.
 *
 * When the server returns 419:
 * 1. Browser signs the delegation request with its DPoP key
 *    (binds to the server's cert thumbprint via cnf.x5t#S256)
 * 2. Browser POSTs the signed delegation request to the server
 * 3. Server exchanges via mTLS with TideCloak (no DPoP approval needed)
 * 4. Browser retries the original request
 *
 * No DPoP approval step - the server cert is admin-quorum-approved.
 *
 * @param {typeof fetch} baseFetch - The app's existing fetch
 * @param {Object} [options]
 * @param {string} [options.delegationEndpoint='/api/delegation'] - Server endpoint for delegation
 * @param {number} [options.maxRetries=1] - Max delegation retries per request
 * @returns {typeof fetch} A fetch function that handles delegation transparently
 */
export function createTideFetch (baseFetch, options = {}) {
  const delegationEndpoint = options.delegationEndpoint || '/api/delegation'
  const maxRetries = options.maxRetries || 1

  return async function tideFetch (url, init) {
    let response = await baseFetch(url, init)

    if (response.status === 419) {
      let challenge
      try {
        challenge = await response.json()
      } catch {
        return response
      }

      if (!challenge.needsDelegation || !challenge.payload || !challenge.certThumbprint) {
        return response
      }

      // Sign delegation request with browser DPoP key
      // The payload contains cnf.x5t#S256 = server cert thumbprint
      const signedDelegationRequest = await IAMService.signDelegationRequest(challenge.payload)

      // POST delegation signature to server (no DPoP approval needed)
      let absoluteEndpoint = delegationEndpoint
      if (!delegationEndpoint.startsWith('http')) {
        absoluteEndpoint = new URL(delegationEndpoint, window.location.origin).toString()
      }
      const token = await IAMService.getToken()
      const delegationHeaders = {
        'Content-Type': 'application/json',
      }
      if (token) {
        delegationHeaders['Authorization'] = `Bearer ${token}`
      }
      const delegationResponse = await baseFetch(absoluteEndpoint, {
        method: 'POST',
        headers: delegationHeaders,
        body: JSON.stringify({
          signedDelegationRequest,
        })
      })

      if (!delegationResponse.ok) {
        return delegationResponse
      }

      // Retry the original request
      response = await baseFetch(url, init)
    }

    return response
  }
}
