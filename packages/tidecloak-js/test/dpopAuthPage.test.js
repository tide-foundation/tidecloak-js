import test from 'node:test';
import assert from 'node:assert/strict';

import { utf8ToHex, buildDpopAuthUrl, probeDpopAuthPage, preflightDpopAuthPage } from '../src/utils/dpopAuthPage.js';

const params = {
  origin: 'https://app.example.com',
  authServerUrl: 'http://localhost:8080/',
  realm: 'myrealm',
  clientId: 'myclient',
};

const respond = (status, headers = {}) => async () => ({
  status,
  headers: { get: (k) => headers[k] ?? null },
});
const bothHeaders = { 'Content-Security-Policy': "default-src 'self'", 'Allow-CSP-From': '*' };

const recorder = () => {
  const calls = { warn: [], error: [] };
  return { calls, warn: (m) => calls.warn.push(m), error: (m) => calls.error.push(m) };
};

test('hex matches the value TideCloak puts in the path', () => {
  assert.equal(utf8ToHex('myclient'), '6d79636c69656e74');
});

test('builds the path TideCloak expects, ignoring a trailing slash', () => {
  assert.equal(
    buildDpopAuthUrl(params),
    `https://app.example.com/tide_dpop/iss/${utf8ToHex('http://localhost:8080/realms/myrealm')}` +
      `/aud/${utf8ToHex('myclient')}/tide_dpop_auth.html`
  );
  assert.equal(buildDpopAuthUrl({ ...params, realm: undefined }), null);
});

test('classifies responses', async () => {
  const probe = (fetchImpl) => probeDpopAuthPage({ url: 'https://x', fetchImpl });
  assert.equal((await probe(respond(200, bothHeaders))).outcome, 'served');
  assert.deepEqual(await probe(respond(200, { 'Content-Security-Policy': 'x' })), {
    outcome: 'missing-headers',
    missing: ['Allow-CSP-From'],
  });
  assert.equal((await probe(respond(404))).outcome, 'not-served');
  assert.equal((await probe(respond(403))).outcome, 'mismatch');
  assert.equal((await probe(respond(405))).outcome, 'inconclusive');
  assert.equal((await probe(async () => { throw new TypeError('offline'); })).outcome, 'inconclusive');
});

test('times out instead of hanging', async () => {
  const hang = (_url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const res = await probeDpopAuthPage({ url: 'https://x', fetchImpl: hang, timeoutMs: 20 });
  assert.equal(res.outcome, 'inconclusive');
});

test('a missing page is an error naming the URL and both headers', async () => {
  const logger = recorder();
  await preflightDpopAuthPage({ ...params, logger, fetchImpl: respond(404) });
  assert.equal(logger.calls.error.length, 1);
  const msg = logger.calls.error[0];
  assert.ok(msg.includes(buildDpopAuthUrl(params)));
  assert.ok(msg.includes('Content-Security-Policy') && msg.includes('Allow-CSP-From'));
});

test('stays quiet when the page is served or the check cannot run', async () => {
  for (const fetchImpl of [respond(200, bothHeaders), async () => { throw new Error('offline'); }]) {
    const logger = recorder();
    await preflightDpopAuthPage({ ...params, logger, fetchImpl });
    assert.deepEqual(logger.calls, { warn: [], error: [] });
  }
});

test('never throws, even if the logger does', async () => {
  const boom = () => { throw new Error('boom'); };
  const outcome = await preflightDpopAuthPage({ ...params, logger: { warn: boom, error: boom }, fetchImpl: respond(404) });
  assert.equal(outcome, 'inconclusive');
});
