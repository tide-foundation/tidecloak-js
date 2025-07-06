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
    // Escape regex chars, then replace '*' with '.*'
    const escaped = pattern
      .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
      .replace(/\\\*/g, '.*')
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