import { NextRequest } from 'next/server'

/**
 * A route matcher: prefix string, glob string, RegExp, or custom function
 */
export type RoutePattern =
  | string
  | RegExp
  | ((pathname: string, req: NextRequest) => boolean)

/**
 * Map of protected routes: key = path pattern, value = allowed roles
 */
export type ProtectedRoutesMap = Record<string, string[]>

/**
 * Convert a single RoutePattern into a test function
 */
export function normalizePattern(
  pattern: RoutePattern
): (pathname: string, req: NextRequest) => boolean {
  if (typeof pattern === 'function') return pattern
  if (pattern instanceof RegExp) return (path) => pattern.test(path)
  if (pattern === 'OPTIONS') return (_path, req) => req.method === 'OPTIONS'
  if (typeof pattern === 'string' && pattern.includes('*')) {
    // Build the regex by escaping every literal segment between '*' wildcards and
    // joining them with '.*'. (Escaping the whole string first does NOT work,
    // because '*' is not a character we escape, so a later "\\*"->".*" pass would
    // never match and the wildcard would be left as a literal regex quantifier.)
    let escaped = pattern
      .split('*')
      .map((seg) => seg.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&'))
      .join('.*')
    // A trailing "/*" wildcard should also match the bare base path, so that
    // e.g. "/admin/*" protects "/admin" as well as "/admin/anything". Without
    // this the base path itself bypasses the role check.
    if (pattern.endsWith('/*')) {
      escaped = escaped.replace(/\\\/\.\*$/, '(?:\\/.*)?')
    }
    const regex = new RegExp(`^${escaped}$`)
    return (path) => regex.test(path)
  }
  // Simple prefix match
  return (path) => path.startsWith(pattern as string)
}

/**
 * Convert a ProtectedRoutesMap into an array of { test, roles }
 */
export function normalizeProtectedRoutes(
  map: ProtectedRoutesMap = {}
): Array<{
  test: (pathname: string, req: NextRequest) => boolean;
  roles: string[];
}> {
  return Object.entries(map).map(([pattern, roles]) => ({
    test: normalizePattern(pattern as RoutePattern),
    roles,
  }))
}