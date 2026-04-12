import { IAMService } from './IAMService.js'

/**
 * Create a delegation-aware fetch wrapper.
 *
 * Wraps an existing fetch function (typically appFetch/secureFetch) and
 * transparently handles 419 Delegation Required challenges from the server.
 *
 * When the server returns 419:
 * 1. Browser signs the delegation request with DPoP key
 * 2. Browser signs the DPoP approval with Tide Session Key (via ORK enclave)
 * 3. Browser POSTs signatures to the delegation endpoint
 * 4. Browser retries the original request from scratch
 *
 * The app developer sees a single fetch call that just works.
 *
 * @param {typeof fetch} baseFetch - The app's existing fetch (e.g., appFetch with DPoP)
 * @param {Object} [options]
 * @param {string} [options.delegationEndpoint='/api/delegation'] - Server endpoint for delegation
 * @param {number} [options.maxRetries=1] - Max delegation retries per request
 * @returns {typeof fetch} A fetch function that handles delegation transparently
 *
 * @example
 * import { createTideFetch } from '@tidecloak/js'
 * import { appFetch } from './appFetch'
 *
 * const tideFetch = createTideFetch(appFetch)
 * const response = await tideFetch('/api/admin/roles')
 * const data = await response.json()
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
        return response // not a delegation challenge, return as-is
      }

      if (!challenge.needsDelegation || !challenge.payload || !challenge.serverJkt) {
        return response // not a valid challenge
      }

      // Sign delegation request with browser DPoP key
      const signedDelegationRequest = await IAMService.signDelegationRequest(challenge.payload)

      // Sign DPoP approval with Tide Session Key (via ORK enclave)
      const dpopApproval = await IAMService.signDpopApproval(challenge.serverJkt)

      // POST delegation signatures to server
      // Use the same auth headers as the original request
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
          dpopApproval
        })
      })

      if (!delegationResponse.ok) {
        return delegationResponse // delegation failed, return the error
      }

      // Retry the original request from scratch
      response = await baseFetch(url, init)
    }

    return response
  }
}
