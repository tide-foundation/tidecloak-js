/**
 * Regression tests for the React <-> SDK TOKEN DESYNC that surfaced as a blanket
 * `401` on every Keycloak admin API call after 0.13.27 -> 0.13.34-staging.
 *
 * The mechanism, end to end:
 *
 *   1. `initIAM()` used to short-circuit on `this._tc.didInitialize` and return
 *      WITHOUT emitting `ready` - even though it had just registered the caller's
 *      `onReady` handler one line earlier.
 *   2. `TideCloakContextProvider` (@tidecloak/react) tears its handlers down on
 *      effect cleanup - including the `ready` handler - and re-subscribes when the
 *      effect re-runs (a `reloadKey` bump from `reload()` / `approveTideRequests()`,
 *      a `resolvedConfig` identity change, a StrictMode double-mount).
 *   3. So after any re-run, the provider's freshly-registered handlers heard
 *      NOTHING, forever. React kept serving the `token` it last cached while the
 *      SDK went on refreshing its own underneath.
 *   4. Consumers read that stale `token` from context into an
 *      `Authorization: Bearer …` header. `TideCloak.secureFetch` compares it
 *      against the token it actually holds (lib/tidecloak.js), no longer recognises
 *      it as its own, and silently falls back to a plain non-DPoP `fetch`.
 *   5. A `dpop.bound.access.tokens=true` realm rejects a DPoP-bound token presented
 *      as a plain Bearer -> `401`, with nothing anywhere saying why.
 *
 * An event is a moment, not a value. These tests pin the two guarantees that make
 * a late subscriber correct anyway:
 *
 *   - `initIAM()` re-emits `ready` with the CURRENT state when it short-circuits
 *     on an already-settled init.
 *   - `isInitialized()` tells a late subscriber it may read that state directly,
 *     and is `false` while an init is still in flight (the state doesn't exist yet).
 *
 * Run with: npm test (node:test + --experimental-test-module-mocks)
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Minimal browser globals - IAMService touches `window` and `document`. */
function installBrowserGlobals() {
  globalThis.window = {
    location: { origin: 'https://app.test', protocol: 'https:' },
  };
  globalThis.document = {
    cookie: '',
    baseURI: 'https://app.test/',
    // No <base href> element -> silent-check-sso derives from redirectUri.
    querySelector: () => null,
  };
}

/**
 * Stand-in for the real TideCloak client. Mirrors the two behaviours that matter:
 * `didInitialize` flips SYNCHRONOUSLY at the top of `init()` (so a concurrent
 * caller sees it before the init settles), and `onReady` fires exactly once, when
 * the init settles.
 */
function makeFakeTideCloak() {
  /** Resolves the in-flight `init()`. Lets a test hold init open. */
  let releaseInit;
  const initGate = new Promise((resolve) => { releaseInit = resolve; });
  const stats = { initCount: 0 };

  class FakeTideCloak {
    didInitialize = false;
    authenticated = false;
    token = null;
    tokenParsed = null;
    idToken = null;
    timeSkew = 0;

    onReady;
    onAuthSuccess;
    onAuthError;
    onAuthRefreshSuccess;
    onAuthRefreshError;
    onAuthLogout;
    onTokenExpired;

    init = async () => {
      // The real client throws if init'd twice; nothing may drive it there.
      if (this.didInitialize) {
        throw new Error("A 'TideCloak' instance can only be initialized once.");
      }
      this.didInitialize = true;
      stats.initCount += 1;

      await initGate;

      this.authenticated = true;
      this.token = 'TOKEN-1';
      this.tokenParsed = { exp: Math.floor(Date.now() / 1000) + 300 };
      this.onReady?.(this.authenticated);
      return this.authenticated;
    };

    /** Simulate a background refresh: new token + the event the SDK really fires. */
    refresh(newToken) {
      this.token = newToken;
      this.tokenParsed = { exp: Math.floor(Date.now() / 1000) + 300 };
      this.onAuthRefreshSuccess?.();
    }
  }

  return { FakeTideCloak, stats, releaseInit: () => releaseInit() };
}

// `mock.module` may only be registered ONCE per specifier, so register a stable
// forwarding shim and let each test swap the class it delegates to. A constructor
// that returns an object yields that object, so `new TideCloakShim(cfg)` really is
// a `CurrentFake`.
let CurrentFake = null;
class TideCloakShim {
  constructor(...args) {
    if (!CurrentFake) throw new Error('test bug: no fake TideCloak installed');
    return new CurrentFake(...args);
  }
}
mock.module('../lib/tidecloak.js', {
  defaultExport: TideCloakShim,
  namedExports: { RequestEnclave: class {} },
});

/** A fresh IAMService singleton per test (the module exports one instance). */
let importCounter = 0;
async function freshIAMService(FakeTideCloak) {
  CurrentFake = FakeTideCloak;
  const mod = await import(`../src/IAMService.js?fresh=${importCounter++}`);
  return mod.default;
}

const CONFIG = () => ({
  'auth-server-url': 'https://app.test',
  realm: 'master',
  resource: 'tide-admin-console',
  redirectUri: 'https://app.test/realms/master/tide-console/auth/redirect',
});

/**
 * The contract is "a subscriber is ALWAYS told the current state", not "told
 * exactly once". A fresh init has always emitted `ready` twice - once from
 * `TideCloak.onReady`, once from IAMService's own trailing emit - and `ready` is a
 * state notification, so extra emissions are harmless. What is fatal is ZERO.
 */
function assertToldReady(seen, expected, message) {
  assert.ok(seen.length > 0, `${message} (heard nothing at all)`);
  assert.deepEqual(
    [...new Set(seen)],
    [expected],
    `${message} (every emission must carry the current state)`
  );
}

// ---------------------------------------------------------------------------
// The regression
// ---------------------------------------------------------------------------

test('a handler registered AFTER init settled still receives the current auth state', async () => {
  installBrowserGlobals();
  const { FakeTideCloak, stats, releaseInit } = makeFakeTideCloak();
  const IAMService = await freshIAMService(FakeTideCloak);

  // --- First mount: the provider subscribes and drives init. ---
  const firstMount = [];
  const firstHandler = (_event, authenticated) => firstMount.push(authenticated);
  releaseInit();
  await IAMService.initIAM(CONFIG(), firstHandler);

  assertToldReady(firstMount, true, 'the first subscriber must see ready(true)');

  // --- Effect cleanup: the provider removes its `ready` handler. ---
  IAMService.off('ready', firstHandler);

  // --- Effect re-run (reload() / approveTideRequests() / StrictMode): the
  //     provider re-subscribes with a BRAND NEW closure and calls initIAM again.
  const secondMount = [];
  const secondHandler = (_event, authenticated) => secondMount.push(authenticated);
  const result = await IAMService.initIAM(CONFIG(), secondHandler);

  // THE BUG: this used to be `[]`. The re-registered handler heard nothing, so the
  // provider's `token` stayed frozen at whatever it last cached -> stale Bearer ->
  // silent non-DPoP downgrade -> 401.
  assertToldReady(
    secondMount,
    true,
    're-initializing must re-emit `ready` so a re-subscribed handler re-syncs'
  );
  assert.equal(result, true, 'initIAM must still report the current auth state');

  // And it must NOT have driven a second TideCloak.init() (the client throws).
  assert.equal(stats.initCount, 1, 'the underlying client is init`d exactly once');
});

test('the re-emitted state is read live from the client, not a cached boolean', async () => {
  installBrowserGlobals();
  const { FakeTideCloak, stats, releaseInit } = makeFakeTideCloak();
  const IAMService = await freshIAMService(FakeTideCloak);

  releaseInit();
  await IAMService.initIAM(CONFIG());

  // The session dies underneath us (logout elsewhere, refresh token revoked).
  IAMService._tc.token = null;
  IAMService._tc.tokenParsed = null;

  const seen = [];
  const authenticated = await IAMService.initIAM(CONFIG(), (_e, a) => seen.push(a));

  assertToldReady(seen, false, 'a late subscriber must be told the session is gone');
  assert.equal(authenticated, false);
});

test('a token refreshed after a re-subscribe is visible to the re-subscribed handler', async () => {
  installBrowserGlobals();
  const { FakeTideCloak, stats, releaseInit } = makeFakeTideCloak();
  const IAMService = await freshIAMService(FakeTideCloak);

  releaseInit();
  const readyHandler = () => {};
  await IAMService.initIAM(CONFIG(), readyHandler);

  // Effect re-run: drop every handler, re-subscribe fresh ones.
  IAMService.off('ready', readyHandler);
  const tokensSeen = [];
  const resync = async () => { tokensSeen.push(await IAMService.getToken()); };
  IAMService.on('authRefreshSuccess', resync);
  await IAMService.initIAM(CONFIG(), resync);

  // The re-subscribed handler must have re-synced immediately off `ready`...
  assert.deepEqual(tokensSeen, ['TOKEN-1']);

  // ...and must keep tracking the SDK across a background refresh. This is the
  // second desync path: if the refresh event never reached React, the cached token
  // would go stale on the first refresh even with no re-init at all.
  IAMService._tc.refresh('TOKEN-2');
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(
    tokensSeen,
    ['TOKEN-1', 'TOKEN-2'],
    'authRefreshSuccess must reach the re-subscribed handler with the NEW token'
  );
  assert.equal(await IAMService.getToken(), IAMService._tc.token, 'never desynced from the SDK');
});

// ---------------------------------------------------------------------------
// isInitialized() - the synchronous escape hatch for a late subscriber
// ---------------------------------------------------------------------------

test('isInitialized() is false before init, false DURING init, true once settled', async () => {
  installBrowserGlobals();
  const { FakeTideCloak, stats, releaseInit } = makeFakeTideCloak();
  const IAMService = await freshIAMService(FakeTideCloak);

  assert.equal(IAMService.isInitialized(), false, 'nothing has been initialized yet');

  const inFlight = IAMService.initIAM(CONFIG());
  await new Promise((r) => setImmediate(r));

  // `didInitialize` is already true here - but the auth state it will produce does
  // not exist yet. Reporting "initialized" now would make a late subscriber read a
  // spurious logged-OUT state and blow its token away.
  assert.equal(
    IAMService.isInitialized(),
    false,
    'an in-flight init is NOT settled - its auth state does not exist yet'
  );

  releaseInit();
  await inFlight;

  assert.equal(IAMService.isInitialized(), true);
});

test('an initIAM that lands mid-init joins it rather than short-circuiting past it', async () => {
  installBrowserGlobals();
  const { FakeTideCloak, stats, releaseInit } = makeFakeTideCloak();
  const IAMService = await freshIAMService(FakeTideCloak);

  // Mount 1 kicks off init...
  const first = IAMService.initIAM(CONFIG());
  await new Promise((r) => setImmediate(r));

  // ...and StrictMode immediately re-runs the effect: `didInitialize` is ALREADY
  // true, so the old code short-circuited and returned `!!tokenParsed` === false -
  // handing React a logged-out state while a perfectly good login was in flight.
  const seen = [];
  const second = IAMService.initIAM(CONFIG(), (_e, a) => seen.push(a));

  releaseInit();
  const [a1, a2] = await Promise.all([first, second]);

  assert.equal(a1, true);
  assert.equal(a2, true, 'the second caller must await the in-flight init, not guess');
  assertToldReady(seen, true, 'and its handler must be told the real, settled state');
  assert.equal(stats.initCount, 1);
});
