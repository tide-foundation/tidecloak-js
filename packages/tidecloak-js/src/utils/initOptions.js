/**
 * Builds the options object handed to `TideCloak.init()` from a caller's
 * resolved TideCloak config.
 *
 * ## Why this is an ALLOWLIST, deliberately
 *
 * `IAMService.initIAM` has always built these options as an allowlist: it reads
 * a handful of keys off the config and drops everything else on the floor. The
 * config object is NOT a `KeycloakInitOptions` bag - it is an adapter/config
 * snapshot (`tidecloak.json` + Tide fields + app-level OIDC hints), and callers
 * legitimately put keys in it that are meaningful to `IAMService` (or to their
 * own code) but that must NOT be handed to `init()`.
 *
 * PR #91 widened this allowlist to also forward `redirectUri`,
 * `silentCheckSsoFallback`, `silentCheckSsoTimeout`, `scope` and a
 * caller-supplied `pkceMethod`, on the reasoning that "each is inert unless the
 * caller sets it". That reasoning is wrong in one important direction: consumers
 * had been shipping configs with these keys set for as long as the keys were
 * being SWALLOWED, so their behaviour was pinned to the SDK's defaults, not to
 * the value in their config. Forwarding them is therefore a silent behaviour
 * change for every existing consumer - the exact opposite of inert.
 *
 * `scope` is the sharpest edge: forwarding it rewrites the authorization
 * request's scope, which changes the audience/roles on the issued access token
 * and can strip a consumer's admin-API access.
 *
 * So: forward ONLY what the SDK genuinely needs, and keep the previously
 * defaulted behaviour byte-for-byte. Any option that a consumer should be able
 * to set must be added here CONSCIOUSLY, with its prior default preserved.
 *
 * ### Forwarded
 * - `setupRequestEnclave` - passed through from the `initIAM` argument.
 * - `onLoad` - always `"check-sso"`. NOT taken from config: callers (e.g. the
 *   admin console) set `onLoad: "login-required"`, and honouring it would send
 *   `#processInit` down the full-redirect branch and never run silent check-sso
 *   at all. That is a separate product decision.
 * - `silentCheckSsoRedirectUri` - the resolved URI (see ./silentCheckSso.js).
 *   This is the ONE option PR #91 needed to make caller-supplied, and it stays.
 *   `undefined` => TideCloak skips silent check-sso and falls back to an
 *   interactive login rather than emitting a URI that would 400.
 * - `pkceMethod` - always `"S256"`, as it was before PR #91.
 * - `useDPoP` / `checkLoginIframe` - the two options `initIAM` has always
 *   forwarded. `useDPoP` is forwarded ONLY when the caller actually set it, and
 *   VERBATIM. DPoP is opt-in: nothing upstream may default it on, because
 *   enabling it appends `dpop_jkt` to the authorization request and the realm
 *   then issues a `cnf.jkt`-BOUND token, which a plain-Bearer consumer cannot
 *   use (RFC 9449) - a bare `401` with no explanation. Pinned in
 *   test/bootstrapDpop.test.js.
 *
 * ### Deliberately NOT forwarded (regression-tested in test/initOptions.test.js)
 * `scope`, `redirectUri`, `silentCheckSsoFallback`, `silentCheckSsoTimeout`.
 * Consumers depend on the SDK's defaults for these. `redirectUri` in particular
 * is still READ from config by `IAMService.doLogin` / `doLogout` and is used as
 * a derivation source for `silentCheckSsoRedirectUri`, so a sub-path-hosted app
 * still gets a correct login redirect - it just does not have `kc.redirectUri`
 * overridden at init time.
 *
 * @param {Object} args
 * @param {Object|null|undefined} args.config Resolved TideCloak config.
 * @param {boolean} args.setupRequestEnclave
 * @param {string|undefined} args.silentCheckSsoRedirectUri Resolved URI, or
 *   `undefined` when no correct URI could be derived.
 * @returns {Object} Options for `TideCloak.init()`.
 */
export function buildInitOptions({
  config,
  setupRequestEnclave,
  silentCheckSsoRedirectUri,
}) {
  return {
    setupRequestEnclave,
    onLoad: "check-sso",
    silentCheckSsoRedirectUri,
    pkceMethod: "S256",
    ...(config?.useDPoP && { useDPoP: config.useDPoP }),
    ...(config?.checkLoginIframe === false && { checkLoginIframe: false }),
  };
}
