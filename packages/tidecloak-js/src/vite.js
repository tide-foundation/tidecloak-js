// Serves tide_dpop_auth.html from `vite dev` and `vite preview`:
//
//   import { tideDpopPlugin } from '@tidecloak/js/vite';
//   export default { plugins: [tideDpopPlugin({ config: tidecloak })] };
//
// A static production build still needs the two headers set on the host.

import { resolveDpopAuthRequest, expectationsFromConfig } from './dpopServer.js';

/**
 * @param {Object} [options]
 * @param {Object} [options.config] TideCloak adapter config (tidecloak.json). Used to
 *   reject requests for another realm or client.
 */
export function tideDpopPlugin({ config } = {}) {
  const { issuer, client } = expectationsFromConfig(config);

  const middleware = (req, res, next) => {
    const result = resolveDpopAuthRequest({
      pathname: req.url ?? '',
      expectedIssuer: issuer,
      expectedClient: client,
      method: req.method,
    });
    if (!result) return next();

    res.statusCode = result.status;
    for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
    res.end(result.body ?? '');
  };

  const install = (server) => {
    if (!issuer || !client) {
      console.warn('[tidecloak] Serving the DPoP page without an issuer/client check. Pass `config` to enable it.');
    }
    // Registered here, before Vite's own middleware, so the SPA fallback cannot answer first.
    server.middlewares.use(middleware);
  };

  return { name: 'tidecloak-dpop-auth-page', configureServer: install, configurePreviewServer: install };
}

export default tideDpopPlugin;
