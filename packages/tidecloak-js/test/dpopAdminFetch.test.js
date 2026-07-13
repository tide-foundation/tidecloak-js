/**
 * Regression tests for the ADMIN-API `401` that survived BOTH the PR #91
 * silent-check-sso redirect fix AND the `2bf1202` React/SDK token-desync fix.
 *
 * The residual mechanism was not a stale token and not a missing DPoP key. It was
 * an authenticated-but-TOKENLESS window:
 *
 *   1. `IAMService._emit("ready")` invokes its listeners WITHOUT awaiting them -
 *      it is a synchronous emitter, it cannot await them.
 *   2. `@tidecloak/react`'s `updateAuthState` listener called `setAuthenticated(true)`
 *      synchronously and only THEN `await IAMService.getToken()` to fill `token`.
 *   3. So `initIAM()` resolved, `TideCloakContextProvider` cleared `isInitializing`,
 *      and React committed a render of `{ authenticated: true, token: null }`.
 *   4. The app un-gated on that render and consumers fired admin calls immediately
 *      (react-query fires on subscribe). They read `token` from context, got `null`,
 *      and sent `GET /admin/realms` with NO `Authorization` header at all.
 *   5. `401`. Not "a DPoP-bound token presented as plain Bearer" - NO CREDENTIALS.
 *
 * The primary fix is in TideCloakContextProvider.tsx: the token is now published in
 * the SAME committed render that first reports `authenticated`, so the window in
 * which a consumer can read `authenticated: true` with a null token no longer
 * exists.
 *
 * Pinned HERE is the SDK's side of that seam - `shouldAttachDpopProof`, the
 * predicate `secureFetch` uses to decide whether to attach our token + a DPoP
 * proof. A caller that supplies NO Authorization header must get an AUTHENTICATED,
 * DPoP-bound request, not a silent credential-less plain fetch. That closes the
 * whole class of bug: even if some consumer manages to call before its token is to
 * hand, the SDK now signs the request with the token it holds.
 *
 * Run with: npm test (node:test)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// The predicate `TideCloak.secureFetch` (lib/tidecloak.js) uses to decide whether
// to sign a request as its own. It lives in its own module because lib/tidecloak.js
// pulls in `heimdall-tide`, which will not load under plain node ESM.
import { shouldAttachDpopProof } from '../lib/secureFetchPolicy.js';

const OUR_TOKEN = 'ACCESS_TOKEN_A';

// ---------------------------------------------------------------------------
// The bug: no Authorization header -> credential-less plain fetch -> bare 401
// ---------------------------------------------------------------------------

test('NO Authorization header -> attach our token + a DPoP proof (was: plain unauthenticated fetch)', () => {
  // This is EXACTLY the failing console call. `usePlainBearerFetch` /
  // `useSecureFetch` do `const token = tc.token; if (token) headers.set(...)`.
  // With `tc.token === null` no header is set at all, and pre-fix this returned
  // false -> `fetch(url, init)` with no credentials -> Keycloak answers 401.
  assert.equal(
    shouldAttachDpopProof(null, OUR_TOKEN),
    true,
    'a request with no Authorization header must be signed with the SDK token',
  );
});

test('an ABSENT (undefined) Authorization header is treated the same as a null one', () => {
  // `new Headers().get()` returns null, but a caller passing a bare object may
  // hand us `undefined`. Both mean "I set no Authorization".
  assert.equal(shouldAttachDpopProof(undefined, OUR_TOKEN), true);
});

// ---------------------------------------------------------------------------
// No regressions: the two pre-existing behaviours must be preserved exactly
// ---------------------------------------------------------------------------

test('OUR bearer token is still upgraded to DPoP (unchanged)', () => {
  assert.equal(shouldAttachDpopProof(`Bearer ${OUR_TOKEN}`, OUR_TOKEN), true);
});

test("SOMEONE ELSE'S bearer token is still passed through as a plain fetch (unchanged)", () => {
  // A third-party API call is a legitimate pass-through: it must go out verbatim
  // and must never be handed one of our DPoP proofs.
  assert.equal(
    shouldAttachDpopProof('Bearer SOMEONE_ELSES_TOKEN', OUR_TOKEN),
    false,
    'a third-party bearer must not be rewritten, and must not receive our proof',
  );
});

test('a STALE copy of one of our own tokens is still NOT signed (unchanged)', () => {
  // This is the `2bf1202` desync case: a consumer cached our token, missed a
  // refresh, and handed it back. It is no longer our token, so it is not ours to
  // sign - it stays a plain fetch (and `secureFetch` warns once). Preserving this
  // keeps the 2bf1202 warning path reachable.
  assert.equal(shouldAttachDpopProof('Bearer STALE_TOKEN_FROM_LAST_REFRESH', OUR_TOKEN), false);
});

test('a non-Bearer scheme (Basic, DPoP, …) is left alone', () => {
  assert.equal(shouldAttachDpopProof('Basic dXNlcjpwYXNz', OUR_TOKEN), false);
  assert.equal(shouldAttachDpopProof(`DPoP ${OUR_TOKEN}`, OUR_TOKEN), false);
});

test('the match is exact - a token that merely PREFIXES ours is not ours', () => {
  assert.equal(shouldAttachDpopProof(`Bearer ${OUR_TOKEN}_EXTRA`, OUR_TOKEN), false);
  assert.equal(shouldAttachDpopProof('Bearer ACCESS_TOKEN', OUR_TOKEN), false);
});
