// Serves tide_dpop_auth.html at /tide_dpop/iss/<hex>/aud/<hex>/tide_dpop_auth.html.
// Uses web Request/Response, so it drops into a Next.js route handler:
//
//   // app/tide_dpop/[...path]/route.js
//   export const { GET, HEAD } = createDpopRoute({ config });

import { resolveDpopAuthRequest, expectationsFromConfig } from './dpopServer.js';

/**
 * @param {Object} [options]
 * @param {Object} [options.config] TideCloak adapter config (tidecloak.json). Used to
 *   reject requests for another realm or client. Omitted or empty, it serves any.
 */
export function createDpopRoute({ config = {} } = {}) {
  const { issuer, client } = expectationsFromConfig(config);

  const handle = (request) => {
    const result = resolveDpopAuthRequest({
      pathname: new URL(request.url).pathname,
      expectedIssuer: issuer,
      expectedClient: client,
      method: request.method,
    });
    if (!result) return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return new Response(result.body, { status: result.status, headers: result.headers });
  };

  return { GET: handle, HEAD: handle };
}
