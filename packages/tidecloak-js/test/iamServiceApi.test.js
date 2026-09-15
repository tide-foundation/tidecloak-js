/**
 * Small IAMService API contracts that don't need a live TideCloak client.
 *
 * Run with: npm test (node:test + --experimental-test-module-mocks)
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: { origin: 'https://app.test', protocol: 'https:' } };
globalThis.document = { cookie: '', baseURI: 'https://app.test/', querySelector: () => null };

class FakeTideCloak {
  idTokenParsed = { email: 'alice@app.test', sub: 'user-1' };
}
mock.module('../lib/tidecloak.js', {
  defaultExport: FakeTideCloak,
  namedExports: { RequestEnclave: class {} },
});

let importCounter = 0;
async function freshIAMService() {
  const mod = await import(`../src/IAMService.js?api=${importCounter++}`);
  return mod.default;
}

function fakeJwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc(payload)}.sig`;
}

test('getValueFromIdToken matches getValueFromIDToken in front-channel mode', async () => {
  const IAMService = await freshIAMService();
  await IAMService.loadConfig({ 'auth-server-url': 'https://app.test', realm: 'r', resource: 'c' });

  assert.equal(IAMService.getValueFromIdToken('email'), 'alice@app.test');
  assert.equal(IAMService.getValueFromIdToken('email'), IAMService.getValueFromIDToken('email'));
  assert.equal(IAMService.getValueFromIdToken('missing'), IAMService.getValueFromIDToken('missing'));
});

test('getValueFromIdToken matches getValueFromIDToken in native mode', async () => {
  const IAMService = await freshIAMService();
  await IAMService.loadConfig({ authMode: 'native', adapter: {} });
  IAMService._nativeTokens = { idToken: fakeJwt({ sub: 'user-2' }) };

  assert.equal(IAMService.getValueFromIdToken('sub'), 'user-2');
  assert.equal(IAMService.getValueFromIdToken('sub'), IAMService.getValueFromIDToken('sub'));
});

test('getValueFromIdToken throws in hybrid mode, like getValueFromIDToken', async () => {
  const IAMService = await freshIAMService();
  await IAMService.loadConfig({ authMode: 'hybrid' });

  assert.throws(() => IAMService.getValueFromIdToken('sub'), /hybrid mode/);
});
