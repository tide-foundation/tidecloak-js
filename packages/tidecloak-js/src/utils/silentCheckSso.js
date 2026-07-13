/**
 * Resolution of the silent-check-SSO redirect URI.
 *
 * ## Why this exists
 *
 * `IAMService.initIAM` used to hardcode:
 *
 * ```js
 * silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`
 * ```
 *
 * That is only correct for an app served from the ORIGIN ROOT. For any app
 * hosted under a sub-path (e.g. a console served at
 * `https://host/realms/<realm>/tide-console/`) the origin-root URI is:
 *
 *   - NOT served (there is no file at `/silent-check-sso.html`), and
 *   - NOT a registered `redirectUri` on the OIDC client,
 *
 * so the authorization request fails with `400 Invalid parameter: redirect_uri`.
 * The silent iframe then never posts back and the app hangs on its bootstrap
 * spinner. A silently-wrong URI is the worst possible outcome, so this module
 * either derives a CORRECT base-aware URI or reports that it cannot, letting
 * the caller fail loud and fall back to a redirect-based login.
 *
 * ## Resolution order
 *
 * 1. **Caller-supplied `silentCheckSsoRedirectUri`** - always wins, verbatim.
 * 2. **`<base href>`** - the standard way a sub-path-hosted SPA declares where
 *    it lives. Resolved via the browser's own `document.baseURI`.
 * 3. **The app's configured OIDC `redirectUri`** - the SDK already requires this
 *    to be base-aware and registered, so it is a sound source of truth for the
 *    app's base. The SDK's own convention is `<base>auth/redirect`, which is
 *    stripped to recover `<base>` exactly; any other redirect path is resolved
 *    relative to its own directory.
 * 4. **Origin root** - only when the app declares NEITHER a base NOR a
 *    redirectUri. Such an app is relying on the SDK's origin-root default
 *    redirectUri (`${origin}/auth/redirect`) and is therefore root-hosted by
 *    construction. This preserves the historical behaviour for every existing
 *    root-hosted consumer.
 *
 * Anything that cannot be resolved (cross-origin or malformed redirectUri)
 * returns `uri: undefined` plus a `reason`, so the caller can log an error and
 * SKIP the silent check rather than emit a URI that will 400.
 */

/** Filename the SDK ships and that hosting providers are expected to serve. */
export const SILENT_CHECK_SSO_FILENAME = 'silent-check-sso.html';

/** The redirect path convention IAMService itself defaults to (`<base>auth/redirect`). */
const AUTH_REDIRECT_SUFFIX = 'auth/redirect';

/**
 * @typedef {object} SilentCheckSsoResolution
 * @property {string|undefined} uri    The resolved URI, or undefined if none could be derived.
 * @property {'config'|'base-href'|'redirect-uri-convention'|'redirect-uri'|'origin-root'|'none'} source
 * @property {string} [reason]         Why resolution failed (only when `uri` is undefined).
 */

/**
 * Resolve the silent-check-SSO redirect URI.
 *
 * Pure: every environment input is passed in explicitly, so this is unit-testable
 * with no DOM. See the module docblock for the resolution order.
 *
 * @param {object} params
 * @param {string} params.origin        The app's origin (`window.location.origin`).
 * @param {string} [params.configured]  Caller-supplied `silentCheckSsoRedirectUri`.
 * @param {string} [params.baseHref]    `document.baseURI`, but ONLY when a `<base href>` element exists.
 * @param {string} [params.redirectUri] Caller-supplied OIDC `redirectUri`.
 * @returns {SilentCheckSsoResolution}
 */
export function resolveSilentCheckSsoRedirectUri ({ origin, configured, baseHref, redirectUri } = {}) {
  // 1. An explicit value ALWAYS wins, on every init path. Dropping it is the bug
  //    that took the sub-path-hosted console down.
  if (isNonEmptyString(configured)) {
    return { uri: configured.trim(), source: 'config' };
  }

  if (!isNonEmptyString(origin)) {
    return { uri: undefined, source: 'none', reason: 'no origin available (non-browser context)' };
  }

  // 2. A declared <base href> is the app telling us exactly where it is hosted.
  if (isNonEmptyString(baseHref)) {
    try {
      const base = new URL(baseHref, origin);
      return { uri: new URL(SILENT_CHECK_SSO_FILENAME, base).href, source: 'base-href' };
    } catch {
      // Malformed <base href> - fall through to the redirectUri, which is more
      // load-bearing anyway (login is already broken if it is wrong).
    }
  }

  // 3. Derive the base from the app's own configured OIDC redirectUri.
  if (isNonEmptyString(redirectUri)) {
    let parsed;
    try {
      parsed = new URL(redirectUri, origin);
    } catch {
      return {
        uri: undefined,
        source: 'none',
        reason: `configured redirectUri (${redirectUri}) is not a valid URL, so the app base cannot be derived`
      };
    }

    if (parsed.origin !== origin) {
      return {
        uri: undefined,
        source: 'none',
        reason: `configured redirectUri (${redirectUri}) is on a different origin than the app (${origin}), so the app base cannot be derived`
      };
    }

    // The SDK's own convention: `<base>auth/redirect`. Strip the suffix to
    // recover `<base>` (keeping its trailing slash) rather than resolving
    // relative to `<base>auth/`, which would be one directory too deep.
    if (parsed.pathname.endsWith(`/${AUTH_REDIRECT_SUFFIX}`)) {
      const basePath = parsed.pathname.slice(0, parsed.pathname.length - AUTH_REDIRECT_SUFFIX.length);
      return {
        uri: new URL(SILENT_CHECK_SSO_FILENAME, new URL(basePath, origin)).href,
        source: 'redirect-uri-convention'
      };
    }

    // Any other redirect path: resolve the filename against the redirect URI's
    // own directory (`/app/callback` -> `/app/silent-check-sso.html`).
    return { uri: new URL(SILENT_CHECK_SSO_FILENAME, parsed).href, source: 'redirect-uri' };
  }

  // 4. Neither a base nor a redirectUri was declared. The app is therefore
  //    relying on the SDK's origin-root default redirectUri, i.e. it is
  //    root-hosted, and origin-root is the right answer.
  return { uri: `${origin}/${SILENT_CHECK_SSO_FILENAME}`, source: 'origin-root' };
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString (value) {
  return typeof value === 'string' && value.trim() !== '';
}
