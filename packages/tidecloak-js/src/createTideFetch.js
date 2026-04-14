import { IAMService } from './IAMService.js'

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

      try {
        // Sign delegation request with browser DPoP key
        const signedDelegationRequest = await IAMService.signDelegationRequest(challenge.payload)

        // POST delegation signature to server
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
          console.error('[createTideFetch] Delegation POST failed:', delegationResponse.status, await delegationResponse.text().catch(() => ''))
          return delegationResponse
        }

        // Retry the original request
        response = await baseFetch(url, init)
      } catch (err) {
        console.error('[createTideFetch] Delegation error:', err)
        return response
      }
    }

    return response
  }
}
