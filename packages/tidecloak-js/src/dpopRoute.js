// Serves tide_dpop_auth.html at /tide_dpop/iss/<hex>/aud/<hex>/tide_dpop_auth.html.
// Uses web Request/Response, so it drops into a Next.js route handler:
//
//   // app/tide_dpop/[...path]/route.js
//   export const { GET, HEAD } = createDpopRoute({ config });

import { DPOP_AUTH_HTML, DPOP_AUTH_CSP } from './generated/dpopAuthAsset.js';

const PATH_RE = /^\/tide_dpop\/iss\/([0-9a-fA-F]+)\/aud\/([0-9a-fA-F]+)\/tide_dpop_auth\.html$/;

function hexToUtf8(hex) {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const text = (body, status) => new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

/**
 * @param {Object} [options]
 * @param {Object} [options.config] TideCloak adapter config (tidecloak.json). Used to
 *   reject requests for another realm or client. Omitted or empty, it serves any.
 */
export function createDpopRoute({ config = {} } = {}) {
  const authServerUrl = config['auth-server-url'];
  const issuer = authServerUrl && config.realm
    ? `${String(authServerUrl).replace(/\/+$/, '')}/realms/${config.realm}`
    : null;
  const clientId = config.resource || null;

  const handle = (request) => {
    const match = new URL(request.url).pathname.match(PATH_RE);
    if (!match) return text('Not Found', 404);

    const iss = hexToUtf8(match[1]);
    const aud = hexToUtf8(match[2]);
    if (iss === null || aud === null) return text('Bad Request', 400);
    if ((issuer && iss !== issuer) || (clientId && aud !== clientId)) return text('Forbidden', 403);

    return new Response(request.method === 'HEAD' ? null : DPOP_AUTH_HTML, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': DPOP_AUTH_CSP,
        'Allow-CSP-From': '*',
        'Cache-Control': 'no-store',
      },
    });
  };

  return { GET: handle, HEAD: handle };
}
