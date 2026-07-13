/**
 * The decision seam of `TideCloak.secureFetch`: given the caller's `Authorization`
 * header (if any) and the access token this client currently holds, should we sign
 * the request as our own - `Authorization: DPoP <token>` plus a `DPoP:` proof?
 *
 * Kept in its own dependency-free module so it can be unit-tested directly.
 * `lib/tidecloak.js` pulls in `heimdall-tide`, which cannot be loaded under plain
 * node ESM, so the predicate is unreachable from a test if it lives there - and
 * this is precisely the seam where a mistake becomes an unexplainable `401`.
 */

/**
 * @param {string|null|undefined} existingAuth - the caller's `Authorization` header.
 * @param {string} ourToken - the access token this client currently holds.
 * @returns {boolean} true -> attach `Authorization: DPoP <ourToken>` + a DPoP proof.
 *
 * Three cases:
 *
 *  - NO `Authorization` header: YES, attach. "I set no Authorization, use your
 *    token" is the entire point of calling `secureFetch` rather than `fetch`, and
 *    it is exactly what `secureFetch`'s own stale-token warning tells callers to do
 *    ("omit the Authorization header entirely and let secureFetch attach it").
 *
 *    This case used to be false, which sent the request as a plain, UNAUTHENTICATED
 *    fetch: no token, no proof, no credentials of any kind. A consumer that reads
 *    its token from an async state container and calls before that state has
 *    settled (React state that has not yet committed, say) would silently ship a
 *    credential-less admin request and get back a bare `401` naming none of this.
 *    That is the admin-API 401 this closes.
 *
 *  - OUR bearer token: YES, attach - upgrade `Bearer` to `DPoP` + proof. Unchanged.
 *
 *  - SOMEONE ELSE'S bearer token: NO. A third-party API call is a legitimate
 *    pass-through: it goes out verbatim and must never be handed one of our proofs.
 *    Unchanged. (A stale copy of one of ours lands here too, and is warned about
 *    once by the caller.)
 */
export function shouldAttachDpopProof (existingAuth, ourToken) {
  if (existingAuth === null || existingAuth === undefined) return true
  return existingAuth === `Bearer ${ourToken}`
}
