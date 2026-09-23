import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createDpopRoute } from '../src/dpopRoute.js';
import { DPOP_AUTH_HTML, DPOP_AUTH_CSP } from '../src/generated/dpopAuthAsset.js';

const { build } = createRequire(import.meta.url)('../scripts/gen-dpop-asset.cjs');

const config = { 'auth-server-url': 'http://localhost:8080', realm: 'myrealm', resource: 'myclient' };
const hex = (s) => Buffer.from(s, 'utf8').toString('hex');
const url = (iss, aud) => `https://app.example.com/tide_dpop/iss/${hex(iss)}/aud/${hex(aud)}/tide_dpop_auth.html`;
const OK = url('http://localhost:8080/realms/myrealm', 'myclient');

test('generated asset matches tide_dpop_auth.html (run npm run build:dpop-asset if not)', () => {
  const fresh = build();
  assert.equal(DPOP_AUTH_HTML, fresh.html);
  assert.equal(DPOP_AUTH_CSP, fresh.csp);
});

test('serves the page with the headers the enclave needs', async () => {
  const res = await createDpopRoute({ config }).GET(new Request(`${OK}?version=1&openerOrigin=x`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Security-Policy'), DPOP_AUTH_CSP);
  assert.equal(res.headers.get('Allow-CSP-From'), '*');
  assert.equal(res.headers.get('X-Frame-Options'), null);
  assert.equal(await res.text(), DPOP_AUTH_HTML);
});

test('HEAD returns headers without a body', async () => {
  const res = await createDpopRoute({ config }).HEAD(new Request(OK, { method: 'HEAD' }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
});

test('refuses another realm or client', async () => {
  const { GET } = createDpopRoute({ config });
  assert.equal((await GET(new Request(url('http://localhost:8080/realms/other', 'myclient')))).status, 403);
  assert.equal((await GET(new Request(url('http://localhost:8080/realms/myrealm', 'other')))).status, 403);
});

test('an unrelated path is a 404', async () => {
  assert.equal((await createDpopRoute({ config }).GET(new Request('https://app.example.com/x'))).status, 404);
});

test('a placeholder config still serves, so a fresh scaffold works', async () => {
  assert.equal((await createDpopRoute({ config: {} }).GET(new Request(OK))).status, 200);
});
