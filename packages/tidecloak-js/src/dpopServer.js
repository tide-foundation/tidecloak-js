// Framework-neutral core for serving tide_dpop_auth.html. No fs, crypto or
// Buffer, so it also runs on Edge. Adapters: ./dpopRoute.js and ./vite.js.

import { DPOP_AUTH_HTML, DPOP_AUTH_CSP } from './generated/dpopAuthAsset.js';

export { DPOP_AUTH_HTML, DPOP_AUTH_CSP };

const PATH_RE = /^\/tide_dpop\/iss\/([0-9a-fA-F]+)\/aud\/([0-9a-fA-F]+)\/tide_dpop_auth\.html$/;

// X-Frame-Options or frame-ancestors would block the enclave's embed.
export function dpopAuthHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': DPOP_AUTH_CSP,
    'Allow-CSP-From': '*',
    'Cache-Control': 'no-store',
  };
}

export function hexToUtf8(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function dpopAuthPathFor(issuer, clientId) {
  const hex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `/tide_dpop/iss/${hex(issuer)}/aud/${hex(clientId)}/tide_dpop_auth.html`;
}

/**
 * Issuer and client id to accept, from a TideCloak adapter config.
 * Either is undefined when the config does not carry it (e.g. the `{}` placeholder).
 */
export function expectationsFromConfig(config = {}) {
  const url = config['auth-server-url'];
  return {
    issuer: url && config.realm ? `${String(url).replace(/\/+$/, '')}/realms/${config.realm}` : undefined,
    client: config.resource || undefined,
  };
}

/**
 * The response for a request path, as `{ status, headers, body }`, or null when
 * the path is not the DPoP page. Omitted expectations are not checked.
 */
export function resolveDpopAuthRequest({ pathname, expectedIssuer, expectedClient, method = 'GET' }) {
  const match = String(pathname ?? '').split('?')[0].match(PATH_RE);
  if (!match) return null;

  const text = (status, body, extra = {}) => ({
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    body,
  });

  const verb = String(method).toUpperCase();
  if (verb !== 'GET' && verb !== 'HEAD') return text(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });

  const issuer = hexToUtf8(match[1]);
  const client = hexToUtf8(match[2]);
  if (issuer === null || client === null) return text(400, 'Invalid hex encoding in URL');
  if ((expectedIssuer && issuer !== expectedIssuer) || (expectedClient && client !== expectedClient)) {
    return text(403, 'Issuer or client mismatch');
  }

  return { status: 200, headers: dpopAuthHeaders(), body: verb === 'HEAD' ? null : DPOP_AUTH_HTML };
}
