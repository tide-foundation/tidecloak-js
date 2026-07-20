/**
 * Regression tests for the BOOTSTRAP DPoP LEAK - the last of the blanket `401`s on
 * the Keycloak admin API after 0.13.27 -> 0.13.34-staging.
 *
 * WIRE EVIDENCE (live browser, master realm, client `tide-console-bootstrap`):
 *
 *   0.13.27 (works):
 *     authorize -> GET .../auth?client_id=…&prompt=none&code_challenge=…   [no dpop_jkt]
 *     token     -> plain access token, not sender-constrained
 *     admin     -> `Authorization: Bearer <tok>`                            -> 200
 *
 *   0.13.34-staging (401):
 *     authorize -> GET .../auth?…&dpop_jkt=b9Yzg4rtocSEYfAUesRXGd6vJHI1NgncrTDvL8UKxKQ
 *     token     -> { "typ": "DPoP", "cnf": { "jkt": "b9Yzg4…" } }
 *     admin     -> `Authorization: Bearer <bound tok>` with NO `DPoP:` proof -> 401
 *
 * The chain: `IAMService.loadConfig` had started NORMALISING an absent `useDPoP`
 * into `{ mode: "strict" }` ("DPoP enabled by default", commit 556d34d, shipped in
 * 0.13.31). `buildInitOptions` forwards `useDPoP` whenever it is truthy, so the
 * invented default reached `TideCloak.init()`, which built a DPoP provider, which
 * appended `dpop_jkt` to the authorization request, which made Keycloak issue a
 * `cnf.jkt`-BOUND token. The console's bootstrap path deliberately runs WITHOUT
 * DPoP and fetches with a plain `Bearer` - and RFC 9449 says a bound token
 * presented as a plain `Bearer` is invalid. Bare `401`, naming none of this.
 *
 * The guards in `lib/tidecloak.js` were never wrong and are unchanged:
 *   - a provider is built only `if (this.useDPoP && this.dpopSigningAlgValuesSupported?.length)`
 *   - `dpop_jkt` is appended only `if (this.#dpopProvider)`
 *   - `this.useDPoP` is set only `if (initOptions.useDPoP)`
 * `useDPoP` simply had no business being there.
 *
 * THE INVARIANT PINNED HERE: DPoP is OPT-IN. A config that does not ask for DPoP
 * must produce an `init()` that does not mention DPoP - so no provider, so no
 * `dpop_jkt`, so a plain (unbound) token that a plain-Bearer fetch can use.
 *
 * Run with: npm test (node:test + --experimental-test-module-mocks)
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { buildInitOptions } from '../src/utils/initOptions.js';

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
    querySelector: () => null,
  };
}

/** Stand-in for the real TideCloak client. Captures what `init()` was handed. */
function makeFakeTideCloak() {
  const seen = { initOptions: null, ctorConfig: null };

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

    constructor(cfg) {
      seen.ctorConfig = cfg;
    }

    init = async (initOptions) => {
      seen.initOptions = initOptions;
      this.didInitialize = true;
      this.authenticated = true;
      this.token = 'TOKEN-1';
      this.tokenParsed = { exp: Math.floor(Date.now() / 1000) + 300 };
      this.onReady?.(this.authenticated);
      return this.authenticated;
    };
  }

  return { FakeTideCloak, seen };
}

// `mock.module` may only be registered ONCE per specifier, so register a stable
// forwarding shim and let each test swap the class it delegates to.
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
  const mod = await import(`../src/IAMService.js?bootstrapDpop=${importCounter++}`);
  return mod.default;
}

/**
 * The tide-admin console's BOOTSTRAP config, verbatim in shape. The console does
 *   `...(isBootstrap ? {} : { useDPoP: { mode: 'auto', alg: 'EdDSA' } })`
 * i.e. bootstrap gets NO `useDPoP` key at all.
 */
const BOOTSTRAP_CONFIG = () => ({
  'auth-server-url': 'https://app.test',
  realm: 'master',
  resource: 'tide-console-bootstrap',
  redirectUri: 'https://app.test/realms/master/tide-console/auth/redirect',
});

/** Runs an init and hands back the options the client's `init()` actually saw. */
async function initOptionsFor(config) {
  installBrowserGlobals();
  const { FakeTideCloak, seen } = makeFakeTideCloak();
  const IAMService = await freshIAMService(FakeTideCloak);
  await IAMService.initIAM(config);
  return { opts: seen.initOptions, IAMService };
}

// ---------------------------------------------------------------------------
// The regression: bootstrap must get a PLAIN, unbound token
// ---------------------------------------------------------------------------

test('no `useDPoP` in config -> `init()` receives no `useDPoP` -> no DPoP provider -> no dpop_jkt', async () => {
  const { opts } = await initOptionsFor(BOOTSTRAP_CONFIG());

  assert.ok(
    !('useDPoP' in opts),
    'DPoP is OPT-IN. A config that never mentions `useDPoP` must not grow one: ' +
      '`TideCloak.init` sets `this.useDPoP` whenever `initOptions.useDPoP` is truthy, ' +
      'builds a DPoP provider off it, and then appends `dpop_jkt` to the authorization ' +
      'request - which makes Keycloak issue a `cnf.jkt`-bound token that the console\'s ' +
      'plain-Bearer bootstrap fetch cannot use (RFC 9449) -> bare 401.'
  );
});

test('loadConfig does not INVENT a `useDPoP` on the stored config', async () => {
  // The leak was upstream of `buildInitOptions`: `loadConfig` normalised an absent
  // `useDPoP` to `{ mode: "strict" }`, and the (correct, conditional) forwarding in
  // `buildInitOptions` then dutifully passed the invention along.
  const { IAMService } = await initOptionsFor(BOOTSTRAP_CONFIG());

  assert.equal(
    IAMService.getConfig().useDPoP,
    undefined,
    '`loadConfig` must store the caller\'s config as-is, not default DPoP on'
  );
});

test('loadConfig does not mutate the caller\'s config object', async () => {
  installBrowserGlobals();
  const { FakeTideCloak } = makeFakeTideCloak();
  const IAMService = await freshIAMService(FakeTideCloak);

  const callerConfig = BOOTSTRAP_CONFIG();
  await IAMService.initIAM(callerConfig);

  assert.ok(!('useDPoP' in callerConfig), 'the caller\'s object must come back untouched');
});

// ---------------------------------------------------------------------------
// The other direction: an EXPLICIT `useDPoP` still works, verbatim
// ---------------------------------------------------------------------------

test('an explicit `useDPoP` is forwarded VERBATIM - the caller\'s mode is not rewritten', async () => {
  // The console's non-bootstrap path asks for `{ mode: 'auto', alg: 'EdDSA' }`.
  // "auto" means "use DPoP only if the realm advertises it". The DPoP-by-default
  // revision also silently upgraded a caller's mode to `strict`, which turns a
  // realm that does not advertise DPoP from a graceful degrade into a hard init
  // failure. The caller's stated mode is the caller's decision.
  const useDPoP = { mode: 'auto', alg: 'EdDSA' };
  const { opts } = await initOptionsFor({ ...BOOTSTRAP_CONFIG(), useDPoP });

  assert.deepEqual(opts.useDPoP, useDPoP);
});

test('`useDPoP: false` is an explicit opt-out and never reaches init()', async () => {
  const { opts } = await initOptionsFor({ ...BOOTSTRAP_CONFIG(), useDPoP: false });

  assert.ok(!('useDPoP' in opts));
});

// ---------------------------------------------------------------------------
// The forwarding seam itself (pure, no client)
// ---------------------------------------------------------------------------

test('buildInitOptions omits `useDPoP` entirely when the config has none', () => {
  const opts = buildInitOptions({
    config: BOOTSTRAP_CONFIG(),
    setupRequestEnclave: true,
    silentCheckSsoRedirectUri: 'https://app.test/silent-check-sso.html',
  });

  assert.ok(!('useDPoP' in opts));
});

test('buildInitOptions omits `useDPoP` when the config is null/undefined', () => {
  for (const config of [null, undefined]) {
    const opts = buildInitOptions({
      config,
      setupRequestEnclave: true,
      silentCheckSsoRedirectUri: 'https://app.test/silent-check-sso.html',
    });
    assert.ok(!('useDPoP' in opts), `config=${config}`);
  }
});
