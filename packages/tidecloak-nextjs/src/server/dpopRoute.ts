import { DPOP_AUTH_HTML, DPOP_AUTH_CSP } from './generated/dpopAuthAsset'
import type { TidecloakConfig } from './tidecloakMiddleware'

const PATH_RE = /^\/tide_dpop\/iss\/([0-9a-fA-F]+)\/aud\/([0-9a-fA-F]+)\/tide_dpop_auth\.html$/

function hexToUtf8(hex: string): string | null {
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

const text = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  })

export interface DpopRouteOptions {
  /**
   * Your TideCloak client adapter JSON. Used to reject requests for another
   * realm or client. Omitted or empty, the route serves any.
   */
  config?: Partial<TidecloakConfig>
}

/**
 * Returns Next.js route handlers serving `tide_dpop_auth.html` at
 * `/tide_dpop/iss/<issuer-hex>/aud/<client-hex>/tide_dpop_auth.html`.
 * Only needed when `dpopConfig` is on. Uses no Node APIs, so it also runs on Edge.
 *
 * Example usage in your `app/tide_dpop/[...path]/route.ts`:
 *
 * ```ts
 * import tidecloakConfig from '../../../tidecloakAdapter.json'
 * import { createDpopRoute } from '@tidecloak/nextjs/server'
 *
 * export const { GET, HEAD } = createDpopRoute({ config: tidecloakConfig })
 * ```
 */
export function createDpopRoute({ config = {} }: DpopRouteOptions = {}) {
  const url = config['auth-server-url']
  const expectedIssuer =
    url && config.realm ? `${String(url).replace(/\/+$/, '')}/realms/${config.realm}` : undefined
  const expectedClient = config.resource || undefined

  const handle = (request: Request): Response => {
    const match = new URL(request.url).pathname.match(PATH_RE)
    if (!match) return text(404, 'Not Found')

    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return text(405, 'Method Not Allowed', { Allow: 'GET, HEAD' })

    const issuer = hexToUtf8(match[1])
    const client = hexToUtf8(match[2])
    if (issuer === null || client === null) return text(400, 'Invalid hex encoding in URL')
    if ((expectedIssuer && issuer !== expectedIssuer) || (expectedClient && client !== expectedClient)) {
      return text(403, 'Issuer or client mismatch')
    }

    // X-Frame-Options or frame-ancestors would block the enclave's embed.
    return new Response(method === 'HEAD' ? null : DPOP_AUTH_HTML, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': DPOP_AUTH_CSP,
        'Allow-CSP-From': '*',
        'Cache-Control': 'no-store',
      },
    })
  }

  return { GET: handle, HEAD: handle }
}
