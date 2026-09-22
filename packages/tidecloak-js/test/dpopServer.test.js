import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDpopAuthRequest,
  expectationsFromConfig,
  hexToUtf8,
  dpopAuthPathFor,
  DPOP_AUTH_HTML,
  DPOP_AUTH_CSP,
} from '../src/dpopServer.js';

const ISSUER = 'http://localhost:8080/realms/myrealm';
const PATH = dpopAuthPathFor(ISSUER, 'myclient');
const expect = { expectedIssuer: ISSUER, expectedClient: 'myclient' };

test('hexToUtf8 decodes valid hex and rejects anything else', () => {
  assert.equal(hexToUtf8('6d79636c69656e74'), 'myclient');
  for (const bad of ['abc', 'zz', '', undefined, '80']) assert.equal(hexToUtf8(bad), null, String(bad));
});

test('expectations come from the adapter config, or are absent', () => {
  assert.deepEqual(
    expectationsFromConfig({ 'auth-server-url': 'http://localhost:8080/', realm: 'myrealm', resource: 'myclient' }),
    { issuer: ISSUER, client: 'myclient' }
  );
  assert.deepEqual(expectationsFromConfig({}), { issuer: undefined, client: undefined });
});

test('other paths are not ours', () => {
  for (const p of ['/', '/tide_dpop_auth.html', `${PATH}/extra`, '/tide_dpop/iss/zz/aud/6d79/tide_dpop_auth.html']) {
    assert.equal(resolveDpopAuthRequest({ pathname: p }), null, p);
  }
});

test('serves the page with the required headers, and a query string is fine', () => {
  const res = resolveDpopAuthRequest({ pathname: `${PATH}?version=1&openerOrigin=x`, ...expect });
  assert.equal(res.status, 200);
  assert.equal(res.body, DPOP_AUTH_HTML);
  assert.equal(res.headers['Content-Security-Policy'], DPOP_AUTH_CSP);
  assert.equal(res.headers['Allow-CSP-From'], '*');
  assert.ok(!('X-Frame-Options' in res.headers));
});

test('HEAD has headers and no body', () => {
  const res = resolveDpopAuthRequest({ pathname: PATH, ...expect, method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.body, null);
});

test('refuses the wrong realm or client, bad hex and other methods', () => {
  assert.equal(resolveDpopAuthRequest({ pathname: dpopAuthPathFor(ISSUER, 'other'), ...expect }).status, 403);
  assert.equal(resolveDpopAuthRequest({ pathname: '/tide_dpop/iss/80/aud/6d79/tide_dpop_auth.html' }).status, 400);
  const post = resolveDpopAuthRequest({ pathname: PATH, ...expect, method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD');
});

test('without expectations it serves any issuer and client', () => {
  assert.equal(resolveDpopAuthRequest({ pathname: dpopAuthPathFor('https://x/realms/y', 'z') }).status, 200);
});
