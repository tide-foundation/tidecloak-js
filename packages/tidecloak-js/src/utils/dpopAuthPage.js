// With DPoP on, the enclave loads tide_dpop_auth.html from this app's origin
// during login. If it is missing, login stalls ~4s and falls back to a popup
// with nothing logged. This check says which URL is missing. It never throws.

export function utf8ToHex(value) {
  let out = '';
  for (const b of new TextEncoder().encode(value)) out += b.toString(16).padStart(2, '0');
  return out;
}

export function buildDpopAuthUrl({ origin, authServerUrl, realm, clientId }) {
  if (!origin || !authServerUrl || !realm || !clientId) return null;
  const issuer = `${String(authServerUrl).replace(/\/+$/, '')}/realms/${realm}`;
  return `${String(origin).replace(/\/+$/, '')}/tide_dpop/iss/${utf8ToHex(issuer)}/aud/${utf8ToHex(clientId)}/tide_dpop_auth.html`;
}

// Returns served | missing-headers | mismatch | not-served | inconclusive.
export async function probeDpopAuthPage({ url, fetchImpl = globalThis.fetch, timeoutMs = 2000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { method: 'HEAD', cache: 'no-store', credentials: 'omit', signal: controller.signal });
  } catch {
    return { outcome: 'inconclusive' };
  } finally {
    clearTimeout(timer);
  }

  // 405/501: a GET-only route is still a working route.
  if (res.status === 403) return { outcome: 'mismatch' };
  if (res.status === 404 || res.status === 410) return { outcome: 'not-served' };
  if (res.status < 200 || res.status >= 300) return { outcome: 'inconclusive' };

  const missing = ['Content-Security-Policy', 'Allow-CSP-From'].filter((h) => !res.headers.get(h));
  return missing.length ? { outcome: 'missing-headers', missing } : { outcome: 'served' };
}

export async function preflightDpopAuthPage({ logger = console, ...params }) {
  try {
    const url = buildDpopAuthUrl(params);
    if (!url) return 'inconclusive';
    const { outcome, missing } = await probeDpopAuthPage({ url, ...params });

    if (outcome === 'not-served') {
      logger.error(
        `[IAMService] DPoP is on but nothing is served at ${url}. Serve tide_dpop_auth.html there ` +
          'with Content-Security-Policy and Allow-CSP-From: * headers, or logins will stall and fall back to a popup.'
      );
    } else if (outcome === 'missing-headers') {
      logger.warn(`[IAMService] ${url} is served without ${missing.join(' and ')}. The enclave cannot embed it.`);
    } else if (outcome === 'mismatch') {
      // Behind a proxy, TideCloak may see a different base URL than the one in our config.
      logger.warn(`[IAMService] ${url} answered 403. Check the realm and client id match your TideCloak config.`);
    }
    return outcome;
  } catch {
    return 'inconclusive';
  }
}
