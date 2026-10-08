/**
 * Tests for src/IAMService.js. The TideCloak core is replaced by a stub that
 * records what IAMService hands it and fires the same callbacks keycloak-js does.
 *
 * Run with: npm test
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

/** @type {any[]} */
let cores = [];
let failNextInit = false;

mock.module('../lib/tidecloak.js', {
  defaultExport: class {
    constructor (config) {
      this.config = config;
      cores.push(this);
    }

    async init (options) {
      this.initOptions = options;
      if (failNextInit) {
        failNextInit = false;
        throw new Error('init failed');
      }
      this.token = 'tok-1';
      this.onReady?.(true);
      return true;
    }

    async logout () {}
  },
});

/** @type {string[]} */
let cookies = [];

function installBrowser () {
  cookies = [];
  globalThis.window = { location: { origin: 'https://app.test', protocol: 'https:' } };
  globalThis.document = { set cookie (value) { cookies.push(value); } };
}

/** A fresh IAMService singleton per test. */
async function freshService () {
  cores = [];
  installBrowser();
  const { IAMService } = await import(`../src/IAMService.js?${Math.random()}`);
  return IAMService;
}

const JSON_CONFIG = () => ({
  realm: 'myrealm',
  'auth-server-url': 'https://kc.test',
  resource: 'my-app',
  vendorId: 'vendor-1',
  'client-origin-auth-https://app.test': 'signed-origin',
});

test('maps tidecloak.json onto the TideCloak config', async () => {
  const IAMService = await freshService();
  await IAMService.init(JSON_CONFIG());

  const { config } = cores[0];
  assert.equal(config.url, 'https://kc.test');
  assert.equal(config.realm, 'myrealm');
  assert.equal(config.clientId, 'my-app');
  assert.equal(config.vendorId, 'vendor-1');
  assert.equal(config.clientOriginAuth, 'signed-origin');
});

test('applies default init options, which the caller can override', async () => {
  const IAMService = await freshService();
  await IAMService.init(JSON_CONFIG(), { onLoad: 'login-required' });

  assert.deepEqual(cores[0].initOptions, {
    onLoad: 'login-required',
    silentCheckSsoRedirectUri: 'https://app.test/silent-check-sso.html',
    pkceMethod: 'S256',
    setupRequestEnclave: true,
  });
});

test('DPoP is opt-in: dpopConfig reaches init only when tidecloak.json sets it', async () => {
  let IAMService = await freshService();
  await IAMService.init(JSON_CONFIG());
  assert.ok(!('dpopConfig' in cores[0].initOptions));

  IAMService = await freshService();
  await IAMService.init({ ...JSON_CONFIG(), dpopConfig: false });
  assert.ok(!('dpopConfig' in cores[0].initOptions));

  const dpopConfig = { mode: 'auto', alg: 'EdDSA' };
  IAMService = await freshService();
  await IAMService.init({ ...JSON_CONFIG(), dpopConfig });
  assert.deepEqual(cores[0].initOptions.dpopConfig, dpopConfig);
});

test('repeat init calls share one TideCloak instance and one init', async () => {
  const IAMService = await freshService();
  const [a, b] = await Promise.all([IAMService.init(JSON_CONFIG()), IAMService.init(JSON_CONFIG())]);

  assert.equal(a, true);
  assert.equal(b, true);
  assert.equal(cores.length, 1);
});

test('a failed init rejects and can be retried with a fresh instance', async () => {
  const IAMService = await freshService();
  failNextInit = true;

  await assert.rejects(IAMService.init(JSON_CONFIG()), /init failed/);
  assert.equal(await IAMService.init(JSON_CONFIG()), true);
  assert.equal(cores.length, 2);
});

test('init resolves false without touching the browser on the server', async () => {
  const IAMService = await freshService();
  delete globalThis.window;

  assert.equal(await IAMService.init(JSON_CONFIG()), false);
  assert.equal(cores.length, 0);
});

test('keeps the kcToken cookie in step with the token', async () => {
  const IAMService = await freshService();
  await IAMService.init(JSON_CONFIG());
  const core = cores[0];
  assert.equal(cookies.at(-1), 'kcToken=tok-1; path=/; SameSite=Lax; Secure');

  core.token = 'tok-2';
  core.onAuthRefreshSuccess();
  assert.equal(cookies.at(-1), 'kcToken=tok-2; path=/; SameSite=Lax; Secure');

  core.token = undefined;
  core.onAuthLogout();
  assert.match(cookies.at(-1), /^kcToken=; expires=Thu, 01 Jan 1970/);

  cookies = [];
  await IAMService.doLogout();
  assert.match(cookies.at(-1), /^kcToken=; expires=Thu, 01 Jan 1970/);
});

test('a throwing listener does not stop the others', async () => {
  const IAMService = await freshService();
  const errorLog = mock.method(console, 'error', () => {});
  /** @type {boolean[]} */
  const heard = [];
  IAMService
    .on('ready', () => { throw new Error('boom'); })
    .on('ready', (authenticated) => heard.push(authenticated));

  await IAMService.init(JSON_CONFIG());

  assert.deepEqual(heard, [true]);
  assert.equal(errorLog.mock.callCount(), 1);
  errorLog.mock.restore();
});

test('methods throw a clear error before init', async () => {
  const IAMService = await freshService();
  assert.throws(() => IAMService.getToken(), /not initialized/);
});
