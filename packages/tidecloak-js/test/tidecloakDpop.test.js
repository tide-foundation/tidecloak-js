/**
 * Tests for the DPoP integration in `lib/tidecloak.js`: the upstream keycloak-js
 * DPoP flow plus the Tide additions (`dpop_jkt` on the authorize URL, the doken
 * surviving a DPoP token exchange).
 *
 * Run with: npm test
 *
 * `lib/tidecloak.js` runs for real; only its two package dependencies, the
 * browser globals and the network are faked. IndexedDB is absent, so the DPoP
 * provider uses its in-memory key store.
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('heimdall-tide', {
  namedExports: {
    RequestEnclave: class {},
    ApprovalEnclave: class {},
    ApprovalEnclaveNew: class {},
    PolicySignRequest: class {},
  },
});
mock.module('@tideorg/js', { namedExports: { Tools: {}, Models: {} } });
// The in-memory key store fallback warns on every init.
mock.method(console, 'warn', () => {});

const { default: TideCloak } = await import('../lib/tidecloak.js');

const APP_ORIGIN = 'https://app.test';
const ISSUER = 'https://kc.test/realms/testrealm';
const TOKEN_URL = `${ISSUER}/protocol/openid-connect/token`;
const CONFIG = () => ({ url: 'https://kc.test', realm: 'testrealm', clientId: 'test-client' });

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function installBrowserGlobals() {
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    key: (i) => Array.from(storage.keys())[i] ?? null,
    get length() {
      return storage.size;
    },
  };
  const location = { href: `${APP_ORIGIN}/`, origin: APP_ORIGIN };
  globalThis.window = {
    location,
    localStorage,
    history: {
      state: null,
      replaceState: (_state, _title, url) => {
        location.href = url;
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
  globalThis.document = {
    baseURI: `${APP_ORIGIN}/app/`,
    addEventListener: () => {},
    body: { appendChild: () => {}, removeChild: () => {} },
  };
  globalThis.localStorage = localStorage;
  globalThis.isSecureContext = true;
  return { location };
}

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const fakeJwt = (payload) => `${b64url({ alg: 'none' })}.${b64url(payload)}.sig`;
const decodeJwt = (jwt) => jwt.split('.').slice(0, 2).map((p) => JSON.parse(Buffer.from(p, 'base64url')));

function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  return fakeJwt({ iat: now, exp: now + 300, sid: 'session-1', sub: 'user-1' });
}

/**
 * Replaces global fetch. `tokenResponses` are served in order from the token
 * endpoint; every request is recorded.
 */
function installFetch({ advertiseDpop = true, tokenResponses = [] } = {}) {
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    requests.push({ url: href, init, headers: new Headers(init.headers) });
    if (href.endsWith('/.well-known/openid-configuration')) {
      return Response.json({
        issuer: ISSUER,
        ...(advertiseDpop && { dpop_signing_alg_values_supported: ['ES256', 'EdDSA'] }),
      });
    }
    if (href === TOKEN_URL) {
      const next = tokenResponses.shift();
      if (!next) throw new Error('unexpected token request');
      return next();
    }
    return new Response('ok', { status: 200 });
  };
  return requests;
}

const makeAdapter = () => ({
  login: async () => {},
  logout: async () => {},
  register: async () => {},
  accountManagement: async () => {},
  redirectUri: (options) => options?.redirectUri ?? `${APP_ORIGIN}/`,
});

const initOptions = (extra = {}) => ({ adapter: makeAdapter(), checkLoginIframe: false, ...extra });

/**
 * Runs a full authorization-code login: builds the login URL on one client,
 * then lands a second client on the callback so it exchanges the code.
 */
async function loginWithCode(location, clientInit) {
  const starter = new TideCloak(CONFIG());
  await starter.init(clientInit);
  const loginUrl = new URL(await starter.createLoginUrl());

  location.href = `${APP_ORIGIN}/#state=${loginUrl.searchParams.get('state')}&code=auth-code`;
  const tc = new TideCloak(CONFIG());
  await tc.init(clientInit);
  return { tc, loginUrl };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('dpop_jkt is on the authorize URL only when DPoP is enabled', async () => {
  installBrowserGlobals();
  installFetch();

  const withDpop = new TideCloak(CONFIG());
  await withDpop.init(initOptions({ dpopConfig: { mode: 'auto' } }));
  const jkt = new URL(await withDpop.createLoginUrl()).searchParams.get('dpop_jkt');
  assert.match(jkt ?? '', /^[A-Za-z0-9_-]{43}$/, 'a base64url SHA-256 thumbprint');

  const withoutDpop = new TideCloak(CONFIG());
  await withoutDpop.init(initOptions());
  assert.equal(new URL(await withoutDpop.createLoginUrl()).searchParams.get('dpop_jkt'), null);
});

test('strict mode fails init when the realm does not advertise DPoP', async () => {
  installBrowserGlobals();
  installFetch({ advertiseDpop: false });

  const tc = new TideCloak(CONFIG());
  await assert.rejects(tc.init(initOptions({ dpopConfig: { mode: 'strict' } })), /strict mode/);
});

test('code exchange sends a DPoP proof, retries on use_dpop_nonce, and keeps the doken', async () => {
  const { location } = installBrowserGlobals();
  const token = accessToken();
  const doken = fakeJwt({ 't.uho': 'https://ork.test' });
  const requests = installFetch({
    tokenResponses: [
      () => Response.json({ error: 'use_dpop_nonce' }, { status: 400, headers: { 'DPoP-Nonce': 'nonce-1' } }),
      () => Response.json({ access_token: token, token_type: 'DPoP', refresh_token: fakeJwt({}), doken }),
    ],
  });

  const { tc } = await loginWithCode(location, initOptions({ dpopConfig: { mode: 'auto' } }));

  const tokenRequests = requests.filter((r) => r.url === TOKEN_URL);
  assert.equal(tokenRequests.length, 2);
  const [firstHeader, firstClaims] = decodeJwt(tokenRequests[0].headers.get('DPoP'));
  assert.equal(firstHeader.typ, 'dpop+jwt');
  assert.equal(firstClaims.htm, 'POST');
  assert.equal(firstClaims.htu, TOKEN_URL);
  assert.equal(firstClaims.nonce, undefined);
  assert.equal(decodeJwt(tokenRequests[1].headers.get('DPoP'))[1].nonce, 'nonce-1');

  assert.equal(tc.authenticated, true);
  assert.equal(tc.token, token);
  assert.equal(tc.doken, doken);
  assert.equal(tc.dokenParsed['t.uho'], 'https://ork.test');
});

test('fetch upgrades our Bearer token to DPoP, resolving relative URLs', async () => {
  const { location } = installBrowserGlobals();
  const token = accessToken();
  const requests = installFetch({
    tokenResponses: [() => Response.json({ access_token: token, token_type: 'DPoP' })],
  });
  const { tc } = await loginWithCode(location, initOptions({ dpopConfig: { mode: 'auto' } }));

  await tc.fetch('api/data', { headers: { Authorization: `Bearer ${token}` } });
  const ours = requests.at(-1);
  assert.equal(ours.headers.get('Authorization'), `DPoP ${token}`);
  const claims = decodeJwt(ours.headers.get('DPoP'))[1];
  assert.equal(claims.htu, `${APP_ORIGIN}/app/api/data`);
  assert.equal(claims.htm, 'GET');
  assert.ok(claims.ath, 'proof is bound to the access token');

  await tc.fetch('https://third-party.test/x', { headers: { Authorization: 'Bearer someone-else' } });
  const theirs = requests.at(-1);
  assert.equal(theirs.headers.get('Authorization'), 'Bearer someone-else');
  assert.equal(theirs.headers.get('DPoP'), null);
});

test('a Bearer token_type in auto mode turns DPoP off for the session', async () => {
  const { location } = installBrowserGlobals();
  installFetch({
    tokenResponses: [() => Response.json({ access_token: accessToken(), token_type: 'Bearer' })],
  });
  const { tc } = await loginWithCode(location, initOptions({ dpopConfig: { mode: 'auto' } }));

  assert.equal(tc.authenticated, true);
  assert.equal(new URL(await tc.createLoginUrl()).searchParams.get('dpop_jkt'), null);
});

test('clearToken rotates the DPoP key and drops the doken', async () => {
  const { location } = installBrowserGlobals();
  installFetch({
    tokenResponses: [
      () => Response.json({ access_token: accessToken(), token_type: 'DPoP', doken: fakeJwt({ 't.uho': 'x' }) }),
    ],
  });
  const { tc } = await loginWithCode(location, initOptions({ dpopConfig: { mode: 'auto' } }));
  const before = new URL(await tc.createLoginUrl()).searchParams.get('dpop_jkt');

  await tc.clearToken();

  assert.equal(tc.authenticated, false);
  assert.equal(tc.doken, undefined);
  const after = new URL(await tc.createLoginUrl()).searchParams.get('dpop_jkt');
  assert.ok(after);
  assert.notEqual(after, before);
});
