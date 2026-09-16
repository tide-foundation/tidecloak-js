/**
 * Tests for the post-logout marker that `logout()` stamps and `init()` consumes.
 *
 * Run with: npm test  (uses node:test - no external dependencies)
 *
 * The regression these lock down: clicking "Log Out" used to leave the user on
 * the TideCloak sign-in page. `logout()` stamps a localStorage marker so the
 * next `init()` can skip the racy silent check-sso, and that marker used to
 * trigger a full interactive login instead - so the logged-out landing page
 * immediately redirected to `/protocol/openid-connect/auth` and the user never
 * saw the app's logged-out state. The marker must now settle `check-sso` as
 * NOT-authenticated and start no login at all, while `login-required` keeps
 * sending the user to login.
 *
 * `lib/tidecloak.js` is exercised for real here: its two package dependencies
 * are the only things mocked, so the `init()` -> `#processInit` -> `onLoad()`
 * path under test is the shipped code.
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

const { default: TideCloak } = await import('../lib/tidecloak.js');

const MARKER_KEY = 'tide-post-logout';
const MARKER_TTL_MS = 60000;
const APP_ORIGIN = 'https://app.test';
const SILENT_URI = `${APP_ORIGIN}/silent-check-sso.html`;

// ---------------------------------------------------------------------------
// A DOM small enough to read, real enough to drive init()
// ---------------------------------------------------------------------------

/**
 * The only iframe the adapter needs answered is the third-party-cookie probe:
 * `init()` waits on its postMessage before it reaches `onLoad()`. Every other
 * iframe (the silent check-sso one) is left unanswered on purpose so the test
 * sees whichever terminal path the SDK takes.
 */
function installBrowserGlobals() {
  const storage = new Map();
  const messageListeners = [];

  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    key: (i) => Array.from(storage.keys())[i] ?? null,
    get length() {
      return storage.size;
    },
  };

  const appended = [];

  const createElement = (tag) => {
    const attrs = {};
    return {
      tagName: String(tag).toUpperCase(),
      style: {},
      attrs,
      parentNode: null,
      setAttribute: (k, v) => {
        attrs[k] = String(v);
      },
      getAttribute: (k) => attrs[k] ?? null,
      addEventListener: () => {},
      removeEventListener: () => {},
      contentWindow: { tag },
    };
  };

  const answerThirdPartyCookieProbe = (el) => {
    if (!String(el.attrs.src ?? '').includes('3p-cookies')) return;
    setTimeout(() => {
      for (const listener of [...messageListeners]) {
        listener({ source: el.contentWindow, data: 'supported', origin: APP_ORIGIN });
      }
    }, 0);
  };

  const body = {
    appendChild: (el) => {
      el.parentNode = body;
      appended.push(el);
      answerThirdPartyCookieProbe(el);
      return el;
    },
    removeChild: (el) => {
      el.parentNode = null;
      return el;
    },
  };

  const document = {
    createElement,
    body,
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementsByTagName: () => [],
    querySelector: () => null,
  };

  const window = {
    document,
    localStorage,
    location: { href: `${APP_ORIGIN}/`, origin: APP_ORIGIN },
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    addEventListener: (type, cb) => {
      if (type === 'message') messageListeners.push(cb);
    },
    removeEventListener: (type, cb) => {
      if (type !== 'message') return;
      const i = messageListeners.indexOf(cb);
      if (i !== -1) messageListeners.splice(i, 1);
    },
  };

  globalThis.window = window;
  globalThis.document = document;
  globalThis.localStorage = localStorage;

  return { localStorage, appended };
}

/** Records every navigation the SDK would have made. */
function makeAdapter() {
  const calls = { login: [], logout: [] };
  return {
    calls,
    adapter: {
      login: async (options) => {
        calls.login.push(options ?? {});
      },
      logout: async (options) => {
        calls.logout.push(options ?? {});
      },
      register: async () => {},
      accountManagement: async () => {},
      redirectUri: (options) => options?.redirectUri ?? `${APP_ORIGIN}/`,
    },
  };
}

const CONFIG = () => ({ url: 'https://kc.test', realm: 'testrealm', clientId: 'test-client' });

/**
 * A client wired to the fake adapter. `createLoginUrl` is stubbed so the silent
 * check-sso iframe is observable (and needs no PKCE/crypto): every call is a
 * silent check-sso attempt.
 */
function makeClient() {
  const { adapter, calls } = makeAdapter();
  const tc = new TideCloak(CONFIG());
  const loginUrls = [];
  tc.createLoginUrl = async (options) => {
    loginUrls.push(options ?? {});
    return `https://kc.test/auth?stub=1`;
  };
  return { tc, adapter, calls, loginUrls };
}

const initOptions = (adapter, extra = {}) => ({
  adapter,
  onLoad: 'check-sso',
  checkLoginIframe: false,
  silentCheckSsoRedirectUri: SILENT_URI,
  silentCheckSsoTimeout: 60,
  ...extra,
});

// ---------------------------------------------------------------------------
// The regression
// ---------------------------------------------------------------------------

test('a fresh marker plus check-sso settles NOT-authenticated and starts no login', async () => {
  const { localStorage } = installBrowserGlobals();
  const { tc, adapter, calls, loginUrls } = makeClient();
  localStorage.setItem(MARKER_KEY, String(Date.now()));

  const authenticated = await tc.init(initOptions(adapter));

  // THE BUG: this used to navigate to the authorize endpoint, so the user
  // landed back on the sign-in page and could never see being logged out.
  assert.deepEqual(calls.login, [], 'no login may be started after an explicit logout');
  assert.equal(authenticated, false, 'init() must report the user as not authenticated');
  assert.equal(tc.authenticated, false);
  assert.deepEqual(loginUrls, [], 'the silent check-sso must be skipped, not merely ignored');
});

test('a fresh marker plus login-required still sends the user to an interactive login', async () => {
  const { localStorage } = installBrowserGlobals();
  const { tc, adapter, calls } = makeClient();
  localStorage.setItem(MARKER_KEY, String(Date.now()));

  await tc.init(initOptions(adapter, { onLoad: 'login-required' }));

  assert.equal(calls.login.length, 1, 'login-required means login, marker or no marker');
  assert.equal(calls.login[0].prompt, undefined, 'and an interactive one, not prompt=none');
});

test('with no marker, check-sso runs the silent check as before', async () => {
  installBrowserGlobals();
  const { tc, adapter, calls, loginUrls } = makeClient();

  const authenticated = await tc.init(initOptions(adapter));

  assert.equal(loginUrls.length, 1, 'the silent check-sso still runs on an ordinary load');
  assert.equal(loginUrls[0].prompt, 'none');
  assert.equal(loginUrls[0].redirectUri, SILENT_URI);
  assert.deepEqual(calls.login, [], 'and it does not escalate to an interactive login');
  assert.equal(authenticated, false);
});

test('with no marker and no silent-check URI, check-sso falls back to a prompt=none login', async () => {
  installBrowserGlobals();
  const { tc, adapter, calls } = makeClient();

  await tc.init(initOptions(adapter, { silentCheckSsoRedirectUri: undefined }));

  assert.equal(calls.login.length, 1);
  assert.equal(calls.login[0].prompt, 'none', 'unchanged behaviour for the no-silent-URI setup');
});

// ---------------------------------------------------------------------------
// Marker lifecycle
// ---------------------------------------------------------------------------

test('logout() stamps the marker', async () => {
  const { localStorage } = installBrowserGlobals();
  const { tc, adapter, calls } = makeClient();

  await tc.init(initOptions(adapter));
  await tc.logout();

  assert.equal(calls.logout.length, 1);
  const raw = localStorage.getItem(MARKER_KEY);
  assert.ok(raw, 'logout must leave a marker for the next init()');
  assert.ok(Date.now() - Number(raw) < 1000, 'and it must carry a current timestamp');
});

test('the marker is one-shot: the next load checks SSO normally again', async () => {
  const { localStorage } = installBrowserGlobals();

  const first = makeClient();
  localStorage.setItem(MARKER_KEY, String(Date.now()));
  await first.tc.init(initOptions(first.adapter));

  assert.equal(localStorage.getItem(MARKER_KEY), null, 'init() must clear the marker it read');
  assert.deepEqual(first.loginUrls, []);

  // A second page load (a fresh client, same storage) must behave normally.
  const second = makeClient();
  await second.tc.init(initOptions(second.adapter));

  assert.equal(second.loginUrls.length, 1, 'the marker must not suppress the silent check twice');
  assert.deepEqual(second.calls.login, []);
});

test('a stale marker is discarded and the silent check runs', async () => {
  const { localStorage } = installBrowserGlobals();
  const { tc, adapter, calls, loginUrls } = makeClient();
  localStorage.setItem(MARKER_KEY, String(Date.now() - MARKER_TTL_MS - 1000));

  await tc.init(initOptions(adapter));

  assert.equal(localStorage.getItem(MARKER_KEY), null, 'a stale marker is cleared too');
  assert.equal(loginUrls.length, 1, 'a tab left open for an hour must not skip the SSO check');
  assert.deepEqual(calls.login, []);
});

test('a marker just inside the TTL is still honoured', async () => {
  const { localStorage } = installBrowserGlobals();
  const { tc, adapter, calls, loginUrls } = makeClient();
  localStorage.setItem(MARKER_KEY, String(Date.now() - (MARKER_TTL_MS - 5000)));

  const authenticated = await tc.init(initOptions(adapter));

  assert.deepEqual(loginUrls, []);
  assert.deepEqual(calls.login, []);
  assert.equal(authenticated, false);
});

test('a garbage marker value is treated as stale, not as a logout', async () => {
  const { localStorage } = installBrowserGlobals();
  const { tc, adapter, loginUrls } = makeClient();
  localStorage.setItem(MARKER_KEY, 'not-a-timestamp');

  await tc.init(initOptions(adapter));

  assert.equal(localStorage.getItem(MARKER_KEY), null);
  assert.equal(loginUrls.length, 1);
});
